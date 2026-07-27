import { supabase } from './supabase'

/**
 * Three levels per shot (ADR-002). Derivatives are generated **in the browser
 * before uploading**: a phone photo is 4-12 MB, and uploading it three times
 * from a storage room with poor coverage is not viable. Besides, this stack
 * has no server of its own where images could be resized.
 */
export const LEVELS = {
  thumbnail: { longEdge: 400, quality: 0.72 },
  derivative: { longEdge: 2000, quality: 0.82 },
} as const

// Legacy bucket id: it is a row in storage.buckets with objects already
// inside. Renaming it would orphan every uploaded file — the id is data.
export const BUCKET = 'obras'

/** 60 MB, the same cap as the bucket. */
export const MAX_BYTES = 62_914_560

export type ImageLevel = keyof typeof LEVELS

export interface PreparedShot {
  /** Original file, unrecoded: it is the archive master. */
  master: File
  thumbnail: Blob
  derivative: Blob
  originalWidth: number
  originalHeight: number
  /** Local URL for the preview. Must be revoked when the shot is discarded. */
  preview: string
}

/**
 * Target dimensions keeping the aspect ratio.
 *
 * **Never upscales.** A 300 px photo does not improve stretched to 2000: it
 * would only weigh more and fake a quality it does not have, which in a
 * catalog is worse than being small.
 */
export function computeTarget(
  width: number,
  height: number,
  longEdge: number,
): { width: number; height: number } {
  const largest = Math.max(width, height)
  if (largest <= longEdge) return { width, height }
  const factor = longEdge / largest
  return {
    width: Math.max(1, Math.round(width * factor)),
    height: Math.max(1, Math.round(height * factor)),
  }
}

/** Checks what can be checked without decoding the image. */
export function validateFile(file: File): string | null {
  if (!file.type.startsWith('image/')) {
    return `«${file.name}» no es una imagen.`
  }
  if (file.size > MAX_BYTES) {
    const mb = (file.size / 1_048_576).toFixed(1)
    return `«${file.name}» pesa ${mb} MB y el máximo es 60 MB.`
  }
  return null
}

async function downscale(
  bitmap: ImageBitmap,
  level: ImageLevel,
): Promise<Blob> {
  const { longEdge, quality } = LEVELS[level]
  const target = computeTarget(bitmap.width, bitmap.height, longEdge)

  const canvas = document.createElement('canvas')
  canvas.width = target.width
  canvas.height = target.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('El navegador no ha dado un contexto de dibujo')
  ctx.drawImage(bitmap, 0, 0, target.width, target.height)

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('No se pudo codificar la imagen'))),
      'image/webp',
      quality,
    )
  })
}

/**
 * A rare but real case worth knowing about: with an image that already
 * compresses very well in its original format — a scanned line drawing, a
 * screenshot, a flat-tone PNG — the WebP derivative can end up weighing more
 * than the master. Not corrected because it does not happen with artwork
 * photography, and adding a branch to pick the smaller of the two would
 * complicate the flow for a case that does not affect the catalog. If one day
 * the archive fills with line scans, this is the place to look.
 */
export async function prepareShot(file: File): Promise<PreparedShot> {
  // `imageOrientation: 'from-image'` applies the EXIF orientation. Without it,
  // a photo taken vertically with the phone would be stored rotated in the
  // derivatives while the master looks fine — the kind of inconsistency nobody
  // understands afterwards.
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  try {
    const [thumbnail, derivative] = await Promise.all([
      downscale(bitmap, 'thumbnail'),
      downscale(bitmap, 'derivative'),
    ])
    return {
      master: file,
      thumbnail,
      derivative,
      originalWidth: bitmap.width,
      originalHeight: bitmap.height,
      preview: URL.createObjectURL(thumbnail),
    }
  } finally {
    bitmap.close()
  }
}

function extension(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : 'bin'
}

/**
 * Random suffix for the file name.
 *
 * It does not use `crypto.randomUUID()`, which **does not exist outside a
 * secure context**: the application is opened over http on the local network
 * IP to catalog from the phone, and there `randomUUID` is `undefined` — only
 * `localhost` is exempt. Uploading a photo blew up with an incomprehensible
 * error, and only from the phone.
 *
 * `getRandomValues` is available in non-secure contexts. The `Math.random`
 * branch is the safety net for an environment with no `crypto` at all; it
 * gives no cryptographic guarantees, but here only name collisions must be
 * avoided.
 */
export function randomSuffix(length = 8): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789'
  const bytes = new Uint8Array(length)
  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    globalThis.crypto.getRandomValues(bytes)
  } else {
    for (let i = 0; i < length; i += 1) bytes[i] = Math.floor(Math.random() * 256)
  }
  return Array.from(bytes, (b) => alphabet[b % alphabet.length] ?? 'x').join('')
}

/**
 * Paths inside the bucket, grouped per artwork so the storage can be browsed
 * by hand and what it holds is understandable.
 *
 * The suffix is random and not the `_v1` ordinal the field schema recommends,
 * because the ordinal is assigned by the database on insert and here files are
 * uploaded first: upload-then-register prevents a row pointing at a file that
 * never arrived. Renaming the three objects afterwards would cost three more
 * requests per photo, and in the storage service requests are the scarce
 * resource. DP-06 remains open and a migration could align the names later.
 *
 * The `_min` / `_der` / `_master` pieces match files already uploaded: they
 * are data, and they stay.
 */
export function paths(catalogId: string, master: File) {
  const suffix = randomSuffix()
  const base = `${catalogId}/${catalogId}_${suffix}`
  return {
    thumbnail: `${base}_min.webp`,
    derivative: `${base}_der.webp`,
    master: `${base}_master.${extension(master.name)}`,
  }
}

export interface UploadResult {
  image_id: string
}

/**
 * Asks the Edge function for a signed URL for the master. The master does NOT
 * go to Supabase Storage: at 2-8 MB minimum per shot, the free tier would run
 * out within weeks (ADR-002, update). It goes to an external S3 — B2 in
 * production, MinIO locally — whose credentials only the function knows.
 */
async function signMaster(
  path: string,
  operation: 'upload' | 'download',
  contentType?: string,
): Promise<{ url: string; contentType: string | null }> {
  const { data, error } = await supabase.functions.invoke('sign-file', {
    body: { operation, path, contentType },
  })
  if (error) throw new Error(`Firmando el máster: ${error.message}`)
  return data as { url: string; contentType: string | null }
}

/** Signed download URL for the archive master (RF-411). */
export async function masterDownloadUrl(masterPath: string): Promise<string> {
  const { url } = await signMaster(masterPath, 'download')
  return url
}

/**
 * Uploads the three levels and registers the row. In this order on purpose: if
 * something fails midway, orphan files remain in the buckets — which break
 * nothing and can be cleaned up — instead of a record with images that do not
 * exist.
 */
export async function uploadShot(
  catalogId: string,
  shot: PreparedShot,
  options: { shotType: string; isIndex: boolean },
): Promise<UploadResult> {
  const target = paths(catalogId, shot.master)

  // Thumbnail and derivative go to Supabase Storage: they are what the
  // application serves.
  const uploads: [string, Blob][] = [
    [target.thumbnail, shot.thumbnail],
    [target.derivative, shot.derivative],
  ]
  for (const [path, content] of uploads) {
    const { error } = await supabase.storage.from(BUCKET).upload(path, content, {
      contentType: 'image/webp',
      upsert: false,
    })
    if (error) throw new Error(`Subiendo ${path}: ${error.message}`)
  }

  // The master goes to the external S3 with a signed URL. The PUT must repeat
  // exactly the signed Content-Type or the signature does not validate.
  const masterType = shot.master.type || 'application/octet-stream'
  const signature = await signMaster(target.master, 'upload', masterType)
  const response = await fetch(signature.url, {
    method: 'PUT',
    body: shot.master,
    headers: { 'Content-Type': masterType },
  })
  if (!response.ok) {
    throw new Error(`Subiendo el máster: HTTP ${response.status}`)
  }

  const { data, error } = await supabase
    .from('images')
    .insert({
      catalog_id: catalogId,
      thumbnail_path: target.thumbnail,
      derivative_path: target.derivative,
      master_path: target.master,
      shot_type: options.shotType,
      index_image: options.isIndex,
      master_bytes: shot.master.size,
      photo_date: new Date().toISOString().slice(0, 10),
    })
    .select('image_id')
    .single()

  if (error) throw new Error(`Registrando la imagen: ${error.message}`)
  return data as UploadResult
}

/**
 * Signed URL to view a file. RF-412: **all image access goes through here**,
 * so that switching storage providers is a single-place change. And RF-110:
 * the bucket is private, there is no public URL.
 */
export async function signedUrl(path: string, seconds = 3600): Promise<string | null> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, seconds)
  return error ? null : data.signedUrl
}

/**
 * Signs several paths in **a single request**. Asking one by one for a list of
 * hundreds of artworks would be hundreds of requests from a phone: the
 * difference between the list loading and not.
 */
export async function signedUrls(
  filePaths: string[],
  seconds = 3600,
): Promise<Record<string, string>> {
  if (filePaths.length === 0) return {}
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(filePaths, seconds)
  if (error || !data) return {}
  return Object.fromEntries(
    data
      .filter((d): d is { path: string | null; signedUrl: string; error: null } => !d.error)
      .flatMap((d) => (d.path ? [[d.path, d.signedUrl] as const] : [])),
  )
}

// The "which is the main image" rule used to live here and moved to the
// `representative_image` database view. Reason: the list needs the thumbnail
// of up to 500 artworks and computing it in the client would require fetching
// every image of all of them; and the printed-catalog pipeline, which will be
// Python, needs the same rule. Two implementations of one rule diverge.
