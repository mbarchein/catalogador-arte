// "sign-file" Edge function: issues signed upload and download URLs for the
// archive masters, which live outside Supabase (Backblaze B2 in production,
// MinIO in the local stack — both through the S3 API).
//
// It exists because the storage credentials must NOT travel in the client: the
// same principle as RF-111. This is the only place, together with the
// Terraform state, where those credentials are present. The key also has no
// delete capability, so not even compromising this whole function can destroy
// a master.
//
// The signature is generic S3 on purpose (aws4fetch): switching storage
// providers means changing S3_ENDPOINT and the credentials, not this code.

import { AwsClient } from 'https://esm.sh/aws4fetch@1.0.20'

const S3_ENDPOINT = Deno.env.get('S3_ENDPOINT') ?? ''
const S3_REGION = Deno.env.get('S3_REGION') ?? 'auto'
const S3_BUCKET = Deno.env.get('S3_BUCKET_MASTERS') ?? ''
const S3_KEY_ID = Deno.env.get('S3_KEY_ID') ?? ''
const S3_KEY_SECRET = Deno.env.get('S3_KEY_SECRET') ?? ''
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? ''

// The browser calls this function directly: without CORS no preflight passes.
// The real authorization is the JWT, not the origin.
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
 * The role is asked to the database WITH THE USER'S TOKEN, through the same
 * my_role() SQL function the application already uses. This function therefore
 * needs no service_role key at all: if the token is invalid the database
 * answers 401 and there is no privilege here to escalate.
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

// Only paths shaped like a master of this catalog get signed. Signing any key
// would turn the function into a universal signer for the bucket.
// The prefixes are those of artworks_id_format: when a new fund is added it
// must be added here too, or its photos will not upload (it happened with TS-).
// The pattern validates paths of files ALREADY uploaded — it is data; only the
// constant's name changed to English.
const VALID_PATH = /^(AR|RC|TS)-\d{4}\/[A-Za-z0-9._-]+_master\.[A-Za-z0-9]+$/

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  if (request.method !== 'POST') return reply(405, { error: 'Solo POST' })

  let body: { operation?: string; path?: string; contentType?: string }
  try {
    body = await request.json()
  } catch {
    return reply(400, { error: 'Cuerpo JSON inválido' })
  }

  const { operation, path, contentType } = body
  if (operation !== 'upload' && operation !== 'download') {
    return reply(400, { error: 'operation debe ser «upload» o «download»' })
  }
  if (!path || !VALID_PATH.test(path)) {
    return reply(400, { error: 'ruta no válida para un máster' })
  }

  const role = await userRole(request.headers.get('Authorization'))
  if (role === null) return reply(401, { error: 'Sesión no válida' })

  // Uploading requires edit rights; downloading only team membership — a
  // reader legitimately downloads a master for a print shop or a curator.
  if (operation === 'upload' && role !== 'CATALOGADOR' && role !== 'SUPERUSUARIO') {
    return reply(403, { error: 'Tu cuenta es de solo consulta' })
  }

  const s3 = new AwsClient({
    accessKeyId: S3_KEY_ID,
    secretAccessKey: S3_KEY_SECRET,
    region: S3_REGION,
    service: 's3',
  })

  const url = new URL(`${S3_ENDPOINT}/${S3_BUCKET}/${path}`)
  // Short expiry for uploads (the PUT starts right away); one hour for
  // downloads, which may be shared within the team for a one-off delivery.
  url.searchParams.set('X-Amz-Expires', operation === 'upload' ? '600' : '3600')

  const signed = await s3.sign(
    new Request(url, {
      method: operation === 'upload' ? 'PUT' : 'GET',
      headers: operation === 'upload' && contentType ? { 'Content-Type': contentType } : {},
    }),
    { aws: { signQuery: true } },
  )

  return reply(200, {
    url: signed.url,
    method: operation === 'upload' ? 'PUT' : 'GET',
    // The PUT must repeat exactly the signed Content-Type.
    contentType: operation === 'upload' ? (contentType ?? null) : null,
  })
})
