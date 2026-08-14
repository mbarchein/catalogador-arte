// Función Edge «invite-user»: manda la invitación de una cuenta nueva (RF-112, RF-1107).
//
// Existe por una razón y solo una: **crear una cuenta exige la clave de servicio, y esa
// clave no puede viajar en el cliente** (RF-111). Todo lo demás de la gestión de usuarios
// —asignar rol, quitar y devolver el acceso— se hace contra la base con las políticas de
// siempre, y por eso no está aquí.
//
// La clave de servicio la pone la plataforma en el entorno de toda función Edge
// (`SUPABASE_SERVICE_ROLE_KEY`), así que esta función no añade ningún secreto que haya que
// configurar ni que rotar: no hay una copia más de nada.
//
// ── QUIÉN PUEDE LLAMARLA ────────────────────────────────────
//
// El rol se le pregunta a la base **con el token de quien llama**, por la misma función
// `my_role()` que usa la aplicación, exactamente como hace `sign-file`. Es lo que hace
// que esta función no sea un agujero: la clave de servicio solo se usa DESPUÉS de que la
// base haya dicho, con la sesión de quien llama y no con la del servidor, que quien llama
// es superusuario con acceso. Un token inválido, caducado o de un lector no llega a la
// segunda mitad.

import { inviteFailureText, invitePayload, isInvitableEmail } from './invite.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
}

function reply(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

/**
 * El rol de quien llama, preguntado a la base CON SU TOKEN.
 *
 * Sin clave de servicio a propósito: si el token no vale, la base contesta que no y aquí
 * no hay ningún privilegio que escalar. Es la misma función que decide en toda la
 * aplicación, así que retirarle el acceso a alguien le cierra también esta puerta —
 * `my_role()` contesta null a quien no entra.
 */
async function userRole(authHeader: string | null): Promise<string | null> {
  if (!authHeader?.startsWith('Bearer ')) return null
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/my_role`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: authHeader,
      'Content-Type': 'application/json',
    },
    body: '{}',
  })
  if (!r.ok) return null
  const role = await r.json()
  return typeof role === 'string' ? role : null
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (request.method !== 'POST') return reply(405, { error: 'Método no permitido' })

  const role = await userRole(request.headers.get('Authorization'))
  if (role === null) return reply(401, { error: 'Sesión no válida' })
  // RF-104 y RF-108: invitar es dar acceso al catálogo, y eso es solo del superusuario.
  if (role !== 'SUPERUSER') {
    return reply(403, { error: 'Solo el superusuario puede invitar a alguien al catálogo' })
  }

  let body: { email?: unknown; name?: unknown; redirectTo?: unknown }
  try {
    body = await request.json()
  } catch {
    return reply(400, { error: 'La petición no trae datos' })
  }

  const email = typeof body.email === 'string' ? body.email : ''
  const name = typeof body.name === 'string' ? body.name : ''
  const redirectTo = typeof body.redirectTo === 'string' ? body.redirectTo : ''

  if (!isInvitableEmail(email)) {
    return reply(400, { error: 'Esa dirección de correo no parece válida. Compruébala.' })
  }

  // Y aquí, y solo aquí, la clave de servicio.
  const invited = await fetch(`${SUPABASE_URL}/auth/v1/invite`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(invitePayload(email, name, redirectTo)),
  })

  if (!invited.ok) {
    // El cuerpo de la plataforma se lee para decidir la frase y NO se devuelve: viene en
    // inglés, habla de cuentas y de identificadores, y lo que quien invita necesita es
    // saber qué hacer.
    const said = await invited.text()
    return reply(invited.status === 429 ? 429 : 400, {
      error: inviteFailureText(invited.status, said),
    })
  }

  return reply(200, { ok: true })
})
