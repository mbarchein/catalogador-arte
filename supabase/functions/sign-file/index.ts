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
import { isSignablePath } from './paths.ts'
import {
  completeXml,
  completedOk,
  partsInOrder,
  sizeMatches,
  uploadIdFrom,
  validPartNumber,
  validUploadId,
  type CompletedPart,
} from './multipart.ts'
import { usagePage, MAX_USAGE_PAGES } from './usage.ts'

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

const OPERATIONS = [
  'upload',
  'download',
  'multipart-start',
  'multipart-complete',
  'multipart-abort',
  // How much the bucket takes up. It is here and not in a separate function because the
  // store's credentials can only live in one place, and that place is this one:
  // a second function would mean a second copy of the key.
  'usage',
] as const
type Operation = (typeof OPERATIONS)[number]

// Which keys may be signed lives in `./paths.ts`, so that the frontend suite can
// cover it: there is no Deno here and this function had no tests at all until the
// corrected copy of RF-420 needed signing. Read that module for why there are two
// kinds and why only one of them is rewritable.

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  if (request.method !== 'POST') return reply(405, { error: 'Solo POST' })

  let body: {
    operation?: string
    path?: string
    contentType?: string
    uploadId?: string
    partNumber?: number
    parts?: CompletedPart[]
    size?: number
  }
  try {
    body = await request.json()
  } catch {
    return reply(400, { error: 'Cuerpo JSON inválido' })
  }

  const { operation, path, contentType, uploadId, partNumber, parts, size } = body
  if (!OPERATIONS.includes(operation as Operation)) {
    return reply(400, { error: `operation debe ser una de: ${OPERATIONS.join(', ')}` })
  }
  // «usage» speaks of the whole bucket and not of a file, so it is the only
  // operation with no path. Every other one requires it before looking at anything else.
  if (operation !== 'usage' && !isSignablePath(path)) {
    return reply(400, { error: 'ruta no válida para un fichero de archivo' })
  }

  const role = await userRole(request.headers.get('Authorization'))
  if (role === null) return reply(401, { error: 'Sesión no válida' })

  // Uploading requires edit rights; downloading only team membership — a
  // reader legitimately downloads a master for a print shop or a curator. Every
  // multipart operation is part of an upload, so they all sit on this side.
  if (operation !== 'download' && role !== 'CATALOGER' && role !== 'SUPERUSER') {
    return reply(403, { error: 'Tu cuenta es de solo consulta' })
  }

  const s3 = new AwsClient({
    accessKeyId: S3_KEY_ID,
    secretAccessKey: S3_KEY_SECRET,
    region: S3_REGION,
    service: 's3',
  })

  const objectUrl = () => new URL(`${S3_ENDPOINT}/${S3_BUCKET}/${path}`)

  // ── How much the archive takes up ──
  //
  // It is paginated to the end and summed here, not in the browser: the listing of a
  // bucket with versions is hundreds of kilobytes of XML that paint nothing on
  // screen, and sending them to the phone of whoever catalogues would be spending their data on
  // showing one number.

  if (operation === 'usage') {
    let bytes = 0
    let objects = 0
    let next: { keyMarker: string; versionIdMarker: string } | null = null
    let pages = 0

    do {
      const url = new URL(`${S3_ENDPOINT}/${S3_BUCKET}`)
      url.searchParams.set('versions', '')
      if (next) {
        url.searchParams.set('key-marker', next.keyMarker)
        url.searchParams.set('version-id-marker', next.versionIdMarker)
      }
      const response = await s3.fetch(new Request(url, { method: 'GET' }))
      if (!response.ok) {
        return reply(502, { error: 'El almacén no ha dicho cuánto ocupa el archivo' })
      }
      const page = usagePage(await response.text())
      bytes += page.bytes
      objects += page.objects
      next = page.next
      pages += 1
    } while (next !== null && pages < MAX_USAGE_PAGES)

    // If the cap has been reached, what there is is a minimum and not a total. It is said,
    // because a partial sum presented as a total is the kind of figure that
    // reassures precisely on the day it should not.
    return reply(200, { bytes, objects, truncated: next !== null })
  }

  // ── Multipart: the two calls the browser cannot make ──
  //
  // Creating and completing are POSTs, and the bucket's CORS rules allow s3_put,
  // s3_get and s3_head — not s3_post (infra/b2.tf). They happen here, server to
  // server, where CORS does not apply. The browser only ever PUTs parts.

  if (operation === 'multipart-start') {
    const url = objectUrl()
    url.searchParams.set('uploads', '')
    const response = await s3.fetch(
      new Request(url, {
        method: 'POST',
        headers: contentType ? { 'Content-Type': contentType } : {},
      }),
    )
    const xml = await response.text()
    const id = response.ok ? uploadIdFrom(xml) : null
    if (id === null || !validUploadId(id)) {
      return reply(502, { error: 'El almacén no ha abierto la subida por partes' })
    }
    return reply(200, { uploadId: id })
  }

  if (operation === 'multipart-complete') {
    if (!validUploadId(uploadId)) return reply(400, { error: 'uploadId no válido' })
    const ordered = partsInOrder(parts ?? [])
    if (ordered === null) {
      // A gap in the list would store a file shorter than the original and record
      // it as stored. For the archive document that is the worst possible end to
      // this path, because nothing about it looks wrong afterwards.
      return reply(400, { error: 'La lista de partes está incompleta o desordenada' })
    }
    const url = objectUrl()
    url.searchParams.set('uploadId', uploadId)
    const response = await s3.fetch(
      new Request(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/xml' },
        body: completeXml(ordered),
      }),
    )
    const xml = await response.text()
    if (!completedOk(response.status, xml)) {
      return reply(502, { error: 'El almacén no ha podido terminar la subida por partes' })
    }

    // And then it is weighed. See `sizeMatches`: a part accepted and later lost, or a
    // completion that assembled fewer than it was given, produces a valid object shorter
    // than the original — recorded as stored, and unnoticed until somebody opens it.
    const head = await s3.fetch(new Request(objectUrl(), { method: 'HEAD' }))
    if (!sizeMatches(size, head.headers.get('content-length'))) {
      return reply(502, {
        error: 'El fichero guardado no tiene el tamaño que se envió, así que no se da por bueno',
      })
    }
    return reply(200, { ok: true })
  }

  if (operation === 'multipart-abort') {
    // Best effort, and it answers 200 either way: an abandoned multipart upload
    // costs storage until the bucket's own housekeeping removes it, but failing
    // the cleanup must not turn into an error the cataloger reads about a file
    // she was already told did not go up.
    if (!validUploadId(uploadId)) return reply(400, { error: 'uploadId no válido' })
    const url = objectUrl()
    url.searchParams.set('uploadId', uploadId)
    await s3.fetch(new Request(url, { method: 'DELETE' })).catch(() => undefined)
    return reply(200, { ok: true })
  }

  // ── The signed URL the browser uses: a whole object, or one part ──

  const url = objectUrl()
  // Short expiry for uploads (the PUT starts right away); one hour for
  // downloads, which may be shared within the team for a one-off delivery.
  url.searchParams.set('X-Amz-Expires', operation === 'upload' ? '600' : '3600')

  // A part of an open multipart upload. The Content-Type is NOT signed for a
  // part: the browser sets one from the Blob whether asked to or not, and a
  // signed content-type the client then contradicts is a refused signature —
  // the failure would look like a permissions problem at part seventeen.
  const isPart = operation === 'upload' && uploadId !== undefined
  if (isPart) {
    if (!validUploadId(uploadId)) return reply(400, { error: 'uploadId no válido' })
    if (!validPartNumber(partNumber)) return reply(400, { error: 'partNumber no válido' })
    url.searchParams.set('uploadId', uploadId)
    url.searchParams.set('partNumber', String(partNumber))
  }

  const signed = await s3.sign(
    new Request(url, {
      method: operation === 'upload' ? 'PUT' : 'GET',
      headers: operation === 'upload' && contentType && !isPart ? { 'Content-Type': contentType } : {},
    }),
    { aws: { signQuery: true } },
  )

  return reply(200, {
    url: signed.url,
    method: operation === 'upload' ? 'PUT' : 'GET',
    // The PUT must repeat exactly the signed Content-Type. Null for a part,
    // where it is not signed and therefore not constrained.
    contentType: operation === 'upload' && !isPart ? (contentType ?? null) : null,
  })
})
