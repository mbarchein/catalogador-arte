// Función Edge «firmar-fichero»: emite URL firmadas de subida y descarga para
// los másters de archivo, que viven fuera de Supabase (Backblaze B2 en
// producción, MinIO en el stack local — ambos por la API de S3).
//
// Existe porque las credenciales del almacén NO pueden viajar en el cliente:
// es el mismo principio de RF-111. Este es el único lugar, junto con el estado
// de Terraform, donde esas credenciales están presentes. La clave además no
// tiene capacidad de borrado, así que ni comprometiendo esta función entera se
// puede destruir un máster.
//
// La firma es S3 genérico a propósito (aws4fetch): cambiar de proveedor de
// almacenamiento es cambiar S3_ENDPOINT y las credenciales, no este código.

import { AwsClient } from 'https://esm.sh/aws4fetch@1.0.20'

const S3_ENDPOINT = Deno.env.get('S3_ENDPOINT') ?? ''
const S3_REGION = Deno.env.get('S3_REGION') ?? 'auto'
const S3_BUCKET = Deno.env.get('S3_BUCKET_MASTERS') ?? ''
const S3_KEY_ID = Deno.env.get('S3_KEY_ID') ?? ''
const S3_KEY_SECRET = Deno.env.get('S3_KEY_SECRET') ?? ''
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? ''

// El navegador llama a esta función directamente: sin CORS no hay preflight que
// pase. La autorización real es el JWT, no el origen.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
}

function respuesta(estado: number, cuerpo: unknown): Response {
  return new Response(JSON.stringify(cuerpo), {
    status: estado,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

/**
 * El rol se pregunta a la base CON EL TOKEN DEL USUARIO, vía la función SQL
 * mi_rol() que ya usa la aplicación. Así esta función no necesita la clave
 * service_role para nada: si el token no vale, la base responde 401 y aquí no
 * hay ningún privilegio que escalar.
 */
async function rolDelUsuario(cabeceraAuth: string | null): Promise<string | null> {
  if (!cabeceraAuth?.startsWith('Bearer ')) return null
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/mi_rol`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: cabeceraAuth,
      'Content-Type': 'application/json',
    },
    body: '{}',
  })
  if (!r.ok) return null
  const rol = await r.json()
  return typeof rol === 'string' ? rol : null
}

// Solo se firman rutas con la forma de un máster de este catálogo. Firmar
// cualquier clave convertiría la función en un firmador universal del bucket.
const RUTA_VALIDA = /^(AR|RC)-\d{4}\/[A-Za-z0-9._-]+_master\.[A-Za-z0-9]+$/

Deno.serve(async (peticion) => {
  if (peticion.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  if (peticion.method !== 'POST') return respuesta(405, { error: 'Solo POST' })

  let cuerpo: { operacion?: string; ruta?: string; tipoContenido?: string }
  try {
    cuerpo = await peticion.json()
  } catch {
    return respuesta(400, { error: 'Cuerpo JSON inválido' })
  }

  const { operacion, ruta, tipoContenido } = cuerpo
  if (operacion !== 'subir' && operacion !== 'descargar') {
    return respuesta(400, { error: 'operacion debe ser «subir» o «descargar»' })
  }
  if (!ruta || !RUTA_VALIDA.test(ruta)) {
    return respuesta(400, { error: 'ruta no válida para un máster' })
  }

  const rol = await rolDelUsuario(peticion.headers.get('Authorization'))
  if (rol === null) return respuesta(401, { error: 'Sesión no válida' })

  // Subir exige poder editar; descargar basta con pertenecer al equipo — el
  // Lector legítimamente descarga un máster para una imprenta o un comisario.
  if (operacion === 'subir' && rol !== 'CATALOGADOR' && rol !== 'SUPERUSUARIO') {
    return respuesta(403, { error: 'Tu cuenta es de solo consulta' })
  }

  const s3 = new AwsClient({
    accessKeyId: S3_KEY_ID,
    secretAccessKey: S3_KEY_SECRET,
    region: S3_REGION,
    service: 's3',
  })

  const url = new URL(`${S3_ENDPOINT}/${S3_BUCKET}/${ruta}`)
  // Caducidad corta para subir (el PUT empieza al momento); una hora para
  // descargar, que puede compartirse dentro del equipo para un envío puntual.
  url.searchParams.set('X-Amz-Expires', operacion === 'subir' ? '600' : '3600')

  const firmada = await s3.sign(
    new Request(url, {
      method: operacion === 'subir' ? 'PUT' : 'GET',
      headers: operacion === 'subir' && tipoContenido ? { 'Content-Type': tipoContenido } : {},
    }),
    { aws: { signQuery: true } },
  )

  return respuesta(200, {
    url: firmada.url,
    metodo: operacion === 'subir' ? 'PUT' : 'GET',
    // El PUT debe repetir exactamente el Content-Type firmado.
    tipoContenido: operacion === 'subir' ? (tipoContenido ?? null) : null,
  })
})
