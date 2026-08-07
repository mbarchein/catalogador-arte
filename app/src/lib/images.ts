import { supabase } from './supabase'
import { EXIF_SLICE_BYTES, readPhotoExif, type PhotoTakenDate } from './exif'
import { NO_EDIT, editToColumns, isNoEdit, type CropSource, type PhotoEdit } from './imageEdits'
import type { PhotoProvenance } from './types'
import { putSignedFile, type UploadProgressEvent } from './signedUpload'

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

/** The two files kept outside Supabase, named as `sign-file` names them. */
export type ArchiveKind = 'master' | 'corrected'

/**
 * How each of them is called inside a sentence the cataloger reads («No se ha podido
 * descargar el original», «Subiendo el original: 4,2 MB de 11,8 MB»).
 *
 * «El original» and not «el máster»: the cataloger has no reason to know that word, and
 * every message she reads has to work without it. The code keeps saying `master`,
 * because that is the column, the path suffix and what the signing function calls it.
 *
 * It lives here, next to the paths it names, and not on the download screen where it was
 * written: the upload now says these words too, and one file with two names on two
 * screens is how a vocabulary comes apart.
 */
export const ARCHIVE_NOUN: Record<ArchiveKind, string> = {
  master: 'el original',
  corrected: 'la copia corregida',
}

/**
 * The encoding of a derivative, always as a matched trio: Content-Type,
 * extension of its path, and what the cataloger has to be told.
 *
 * There are two because `canvas.toBlob(…, 'image/webp')` **does not fail** on a
 * browser that cannot encode WebP. The specification lets it fall back to PNG,
 * in silence, and the callback still receives a perfectly valid Blob. The
 * declared target is phones from 2020 on, where WebP is universal, but the tail
 * exists — Safari only learned to encode it in 14 — and there the application
 * was uploading PNG under the name `_min.webp` and the Content-Type
 * `image/webp`: the wrong weight, the wrong name, and a declared type that lies
 * to the storage service and to every browser that afterwards reads the file
 * from its cache. Nothing broke, which is what made it hard to notice.
 */
export type DerivativeType = 'image/webp' | 'image/png'
export type DerivativeExtension = 'webp' | 'png'

export interface DerivativeFormat {
  /** Content-Type of the uploaded object. */
  type: DerivativeType
  /** Extension of its path inside the bucket. Always coherent with `type`. */
  extension: DerivativeExtension
  /** Message for the cataloger, or null when there is nothing to say. */
  warning: string | null
}

/**
 * What is said when the browser cannot compress. It names the consequence —
 * heavier files, slower upload, the original untouched — and not the format:
 * whether the copies are WebP or PNG is not a decision the cataloger takes, and
 * a message with a codec name in it only turns a manageable situation into an
 * incomprehensible one.
 */
export const HEAVY_DERIVATIVES_WARNING =
  'Este navegador no puede comprimir las copias que se ven en la ficha: se guardarán sin ' +
  'comprimir, pesarán bastante más y la subida tardará más. La fotografía original se guarda ' +
  'intacta, y las copias se pueden volver a generar más adelante desde un ordenador.'

export const WEBP_DERIVATIVE: DerivativeFormat = {
  type: 'image/webp',
  extension: 'webp',
  warning: null,
}

/**
 * The fallback, and the decision behind it: **the upload goes on, in PNG, with
 * the name and the Content-Type that match the bytes**, and the cataloger is
 * warned. It does not stop.
 *
 * Why going on beats stopping: the photograph is taken with the artwork in
 * front of you, in a storage room, and that moment does not come back. Refusing
 * the upload would trade a recoverable problem — copies that weigh too much —
 * for an unrecoverable one, a shot that was never catalogued. And the master,
 * which is the archive document (ADR-002, RF-411), travels untouched either
 * way: the two derivatives are display copies and are regenerated from it
 * whenever needed, so a session's worth of heavy copies is repairable later
 * from a computer, quietly and without asking anything of the cataloger.
 *
 * Why PNG and not JPEG, which would weigh much less: PNG is lossless, so the
 * copy stays an exact reduction of the master and the colour work reads on it
 * what the master says (RF-414). A fallback that also re-quantized the colour
 * would be a second silent change on top of the one being fixed here. The cost
 * is real and accepted — a 2000 px PNG is several MB against a few hundred KB,
 * against the free tier of RNF-110 — which is precisely why it is announced
 * instead of absorbed.
 */
export const PNG_DERIVATIVE: DerivativeFormat = {
  type: 'image/png',
  extension: 'png',
  warning: HEAVY_DERIVATIVES_WARNING,
}

/**
 * Whether these bytes really are WebP.
 *
 * It reads the signature and not `blob.type`, because the type is exactly what
 * lies. A WebP file is a RIFF container whose form tag is «WEBP»: `RIFF`, four
 * bytes of length, `WEBP`. The declared type is consulted only when the bytes
 * cannot be read at all, which is better than declaring a codec missing over a
 * missing `arrayBuffer`.
 */
export async function isWebpBlob(blob: Blob | null | undefined): Promise<boolean> {
  if (!blob) return false
  try {
    const head = new Uint8Array(await blob.slice(0, 12).arrayBuffer())
    if (head.length >= 12) {
      const tag = (at: number) => String.fromCharCode(...head.subarray(at, at + 4))
      return tag(0) === 'RIFF' && tag(8) === 'WEBP'
    }
  } catch {
    // No readable bytes. Fall through to what the browser says it produced.
  }
  return blob.type === 'image/webp'
}

/** Encodes the probe image and hands back whatever the browser produced. */
export type ProbeEncoder = (type: DerivativeType) => Promise<Blob | null>

/**
 * Decides the format of the derivatives from what the encoder really returns.
 *
 * The encoder is a parameter instead of a canvas created here so the decision —
 * which is the whole point of the check — can be exercised without a canvas,
 * simulating both the browser that falls back to PNG and the one that does not.
 */
export async function probeDerivativeFormat(encode: ProbeEncoder): Promise<DerivativeFormat> {
  try {
    return (await isWebpBlob(await encode('image/webp'))) ? WEBP_DERIVATIVE : PNG_DERIVATIVE
  } catch {
    // An encoder that throws is one more browser that cannot: warn and go on.
    return PNG_DERIVATIVE
  }
}

/**
 * The real probe: a 2×2 canvas encoded to the requested type. Two pixels by two
 * are enough, because what is being measured is which codec the browser has and
 * not the quality of anything.
 */
const canvasProbe: ProbeEncoder = (type) => {
  const canvas = document.createElement('canvas')
  canvas.width = 2
  canvas.height = 2
  return encodeCanvas(canvas, type, LEVELS.thumbnail.quality)
}

let probed: Promise<DerivativeFormat> | null = null

/**
 * Format the derivatives are encoded in, probed **once and lazily**: the answer
 * cannot change while the tab is open, and probing on module load would spend a
 * canvas on every screen that merely imports a path helper.
 */
export function derivativeFormat(encode: ProbeEncoder = canvasProbe): Promise<DerivativeFormat> {
  probed ??= probeDerivativeFormat(encode)
  return probed
}

/** Forgets the probed answer. Only the tests need it. */
export function forgetDerivativeFormat(): void {
  probed = null
}

/**
 * The format a derivative Blob already is, read from the Blob itself.
 *
 * Only PNG counts as the fallback: anything else — including a Blob with no
 * type, which is what an old row of the offline queue can hold — is WebP, which
 * is what every browser in the declared target produces.
 */
export function derivativeFormatOf(blob: Blob): DerivativeFormat {
  return blob.type === 'image/png' ? PNG_DERIVATIVE : WEBP_DERIVATIVE
}

export interface PreparedShot {
  /** Original file, unrecoded: it is the archive master. */
  master: File
  thumbnail: Blob
  derivative: Blob
  originalWidth: number
  originalHeight: number
  /** Local URL for the preview. Must be revoked when the shot is discarded. */
  preview: string
  /**
   * Encoding of `thumbnail` and `derivative`, with the warning to show when the
   * browser could not give the compressed one.
   *
   * Optional because a shot rehydrated from the offline queue (photoQueue) keeps
   * the Blobs but not the answer of the probe; `uploadShot` does not depend on
   * this field and reads the Blob instead.
   */
  format?: DerivativeFormat
  /** Where the framing came from, when the editor was used before uploading. */
  cropSource?: CropSource
  /**
   * What the file says about when it was taken, read from its EXIF (RF-416).
   *
   * It is captured **here and nowhere else**, and that is not tidiness: this is the
   * only moment in the whole application at which the original file is in the
   * browser and the row has not been written yet. Afterwards the master is in B2 and
   * reading the date back means downloading megabytes to learn twenty bytes.
   *
   * Null when the file carries no usable date, and optional because a queue row
   * written before this field existed has none (see photoQueue.ts). Both mean the
   * same thing — nothing to write — and neither is ever filled with a guess: the
   * date of a photograph comes from inside the file, never from
   * `File.lastModified`.
   */
  fileDate?: PhotoTakenDate | null
  /**
   * Where the photograph comes from (RF-417). **Chosen by the cataloger**, never
   * inferred: that four of the 44 masters are 1080×2400 with no camera data makes
   * them look like screenshots of an online catalog, but looking like one is not
   * being one, and the project already decided with `crop_source` not to invent the
   * datum.
   *
   * Absent means own work, which is what the column defaults to as well and what 35
   * of the 39 rows are.
   */
  provenance?: PhotoProvenance
  /**
   * Rotation and crop already applied to `thumbnail` and `derivative`, and
   * stored with the row so the printed-catalog pipeline can rebuild the same
   * framing from the master (see imageEdits.ts). The master itself is never
   * touched: it is the archive document (ADR-002).
   */
  edit: PhotoEdit
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

/**
 * `canvas.toBlob` as a promise. `quality` is ignored by PNG, which is lossless;
 * it is passed anyway so there is a single call site and no branch that could
 * drift.
 */
function encodeCanvas(
  canvas: HTMLCanvasElement,
  type: DerivativeType,
  quality: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('No se pudo codificar la imagen'))),
      type,
      quality,
    )
  })
}

async function downscale(
  bitmap: ImageBitmap,
  level: ImageLevel,
  format: DerivativeFormat,
): Promise<Blob> {
  const { longEdge, quality } = LEVELS[level]
  const target = computeTarget(bitmap.width, bitmap.height, longEdge)

  const canvas = document.createElement('canvas')
  canvas.width = target.width
  canvas.height = target.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('El navegador no ha dado un contexto de dibujo')
  ctx.drawImage(bitmap, 0, 0, target.width, target.height)

  // The format asked for is the one the probe verified. Asking for WebP on a
  // browser that answers PNG is exactly the silent substitution being fixed.
  return encodeCanvas(canvas, format.type, quality)
}

/**
 * The date the file claims, from its first 128 KB (RF-416).
 *
 * Only the prefix is read, because EXIF lives in the APP1 segment before the pixels
 * and that was measured to give the same answer as the whole file in 44 of the 44
 * masters (see `EXIF_SLICE_BYTES`). The alternative is `await file.arrayBuffer()` on
 * an 8 MB photograph, on a phone, for twenty bytes.
 *
 * **It never throws and never guesses.** A file with no EXIF, a HEIC, a PNG, a
 * browser that refuses the slice: all of them are «this photograph does not say when
 * it was taken», which the row records as a null and the interface says out loud
 * (§7.1). What it must never do is fall back to `File.lastModified` — that is the
 * date the file was written, and for a shot rehydrated from the offline queue it is
 * the moment of the rehydration (see photoQueue.ts, which says so in capitals).
 */
export async function readShotDate(file: Blob): Promise<PhotoTakenDate | null> {
  try {
    const head = await file.slice(0, EXIF_SLICE_BYTES).arrayBuffer()
    return readPhotoExif(head)?.taken ?? null
  } catch {
    return null
  }
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
  //
  // The date is read alongside, from the first 128 KB, and not after: the two are
  // independent readings of the same file and serializing them would add the slice
  // to the wait the cataloger already sees per photograph.
  const [bitmap, fileDate] = await Promise.all([
    createImageBitmap(file, { imageOrientation: 'from-image' }),
    readShotDate(file),
  ])
  // What this browser can really encode, asked once per session. The master is
  // not affected by the answer: it is uploaded with its own bytes and its own
  // extension, and nothing here re-encodes it (ADR-002).
  const format = await derivativeFormat()
  try {
    const [thumbnail, derivative] = await Promise.all([
      downscale(bitmap, 'thumbnail', format),
      downscale(bitmap, 'derivative', format),
    ])
    return {
      master: file,
      thumbnail,
      derivative,
      originalWidth: bitmap.width,
      originalHeight: bitmap.height,
      preview: URL.createObjectURL(thumbnail),
      format,
      fileDate,
      // A shot arrives unedited. Rotating or cropping it is a later, explicit
      // decision of the cataloger (see PhotoEditor).
      edit: NO_EDIT,
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
function basePath(catalogId: string): string {
  return `${catalogId}/${catalogId}_${randomSuffix()}`
}

/**
 * Paths for the two derivative levels alone, with a fresh random base.
 *
 * Used when re-editing a photo that is already uploaded: rotating or cropping it
 * writes NEW files and never overwrites the existing ones. The paths of the
 * bucket are immutable, and that is not a preference — the service worker caches
 * images with `CacheFirst` keyed by path (see the `imagenes-obras` rule in
 * vite.config.ts), so overwriting a path would keep serving the old bytes from
 * the phone's cache forever. The superseded files stay in the bucket: nothing is
 * ever really deleted here.
 *
 * The extension is a parameter, and not the constant it used to be, because the
 * name of a file has to say what the file is: on a browser that cannot compress
 * these are PNG (see `PNG_DERIVATIVE`) and calling them `.webp` would leave the
 * bucket full of objects that lie about their content. It defaults to WebP,
 * which is what every browser in the declared target produces.
 */
export function derivativePaths(
  catalogId: string,
  base = basePath(catalogId),
  derivativeExtension: DerivativeExtension = 'webp',
) {
  return {
    thumbnail: `${base}_min.${derivativeExtension}`,
    derivative: `${base}_der.${derivativeExtension}`,
  }
}

/**
 * Name and encoding of the full-resolution corrected copy (RF-420, ADR-010), as a
 * matched set: the suffix of its path, its extension, its Content-Type and the
 * quality it is encoded at.
 *
 * They are exported because there are **two** producers of this file and they have
 * to agree: the browser when the device can generate it, and the local batch tool
 * that empties the pending queue (RF-421, `scripts/copias-corregidas/paths.py`). A
 * different suffix on each side gives two families of paths that nobody can list
 * together; a different format gives two artworks whose print copy weighs and looks
 * different depending on which machine made it.
 *
 * JPEG and not WebP, which would weigh less: this file exists to be handed to a
 * print shop or a curator (RF-411), and what a print shop opens is JPEG. Nothing in
 * the application ever displays it, so the argument that decided the derivatives
 * does not apply here.
 */
export const CORRECTED_SUFFIX = '_corrected'
export const CORRECTED_EXTENSION = 'jpg'
export const CORRECTED_CONTENT_TYPE = 'image/jpeg'
export const CORRECTED_QUALITY = 0.92

/**
 * Path of the corrected copy: **its own suffix and its own extension**, never the
 * path of the master and never derived from it.
 *
 * The realistic way to overwrite a master is not a malicious update, it is deriving
 * this name from the master's — swapping its extension, appending to it, reusing its
 * base — until one day they coincide. So this is built from `basePath` like every
 * other level and the extension is fixed, which makes a collision arithmetically
 * impossible: the master always ends in `_master.<its own extension>`.
 *
 * The base is a parameter so the first upload of a shot can keep the four files of
 * that shot together, and re-editing an uploaded photograph can take a fresh one:
 * re-editing writes NEW paths, for the same reason the derivatives do (the service
 * worker caches by path with `CacheFirst`), and the superseded copy is left in the
 * store — never a real deletion.
 */
export function correctedPath(catalogId: string, base = basePath(catalogId)): string {
  return `${base}${CORRECTED_SUFFIX}.${CORRECTED_EXTENSION}`
}

/**
 * The paths of a shot. The master keeps **its own** extension, the one of the file
 * the camera produced: it is uploaded with its original bytes and the encoding of
 * the derivatives has nothing to do with it (ADR-002).
 *
 * `corrected` is computed from the same base as the other three so the four files of
 * a shot sit next to each other in the bucket and can be read by hand. It is a name,
 * not a promise: most shots have no corrections and therefore no such file, and
 * whether it gets written is decided by `saveCorrectedCopy`.
 */
export function paths(
  catalogId: string,
  master: File,
  derivativeExtension: DerivativeExtension = 'webp',
) {
  const base = basePath(catalogId)
  return {
    ...derivativePaths(catalogId, base, derivativeExtension),
    master: `${base}_master.${extension(master.name)}`,
    corrected: correctedPath(catalogId, base),
  }
}

export interface UploadResult {
  image_id: string
  /**
   * Why the full-resolution corrected copy is missing, in Spanish and ready to show,
   * or null when there is nothing pending (RF-420). The caller **has to say it**: a
   * copy that stayed pending in silence is the failure ADR-010 is about.
   */
  correctedPending?: string | null
}

/**
 * Asks the Edge function for a signed URL for a file living outside Supabase. The
 * master does NOT go to Supabase Storage: at 2-8 MB minimum per shot, the free tier
 * would run out within weeks (ADR-002, update). It goes to an external S3 — B2 in
 * production, MinIO locally — whose credentials only the function knows, and the
 * corrected copy of RF-420 goes to the same place, by this same signing path and not
 * by a new one.
 *
 * `label` is what the cataloger reads when the signature fails, so the message says
 * which file could not be signed instead of naming a function she has never heard of.
 */
async function signStoredFile(
  path: string,
  operation: 'upload' | 'download',
  contentType: string | undefined,
  label: string,
): Promise<{ url: string; contentType: string | null }> {
  const { data, error } = await supabase.functions.invoke('sign-file', {
    body: { operation, path, contentType },
  })
  if (error) throw new Error(`Firmando ${label}: ${error.message}`)
  return data as { url: string; contentType: string | null }
}

/**
 * Signed download URL for the archive master (RF-411).
 *
 * The label says «el original de archivo» and not «el máster» because it ends up
 * inside a sentence the cataloger reads, and that word is ours, not hers.
 *
 * The upload side used to keep «el máster», on the grounds that the screen around it
 * already talked about masters. That stopped being true when the upload started
 * counting its bytes out loud (see `uploadProgress`): the line above the failure now
 * says «el original», and one file with two names in two consecutive sentences of the
 * same screen is worse than either name.
 */
export async function masterDownloadUrl(masterPath: string): Promise<string> {
  const { url } = await signStoredFile(masterPath, 'download', undefined, 'el original de archivo')
  return url
}

/**
 * Signed download URL for the corrected copy (RF-411, RF-420). Same signing path as
 * the master, because it is the same store: what the record hands to a print shop is
 * this file, and the master is what the archive keeps.
 */
export async function correctedDownloadUrl(path: string): Promise<string> {
  const { url } = await signStoredFile(path, 'download', undefined, 'la copia corregida')
  return url
}

/**
 * What the generator of the corrected copy answers, and the integration point with
 * `imageRender.ts`, which is where the pixels are made (RF-420).
 *
 * Three answers and not a nullable blob, because the row has three states and they
 * are not the same (see the migration): a copy, no copy needed, and a copy that is
 * needed and missing. Collapsing the last two into «no file» is exactly what
 * `corrected_pending` exists to prevent — nobody would ever retry, because nothing
 * would say it was left undone.
 *
 * `PENDING` carries its own reason because the generator is the only one that knows
 * it: the canvas ceiling of this device, a master that could not be downloaded, a
 * decision not to push 19 MB over a storage room's coverage (ADR-010 counts that
 * last one as an intended outcome, not a breakdown).
 *
 * The three labels are the ones `imageRender.ts` already answers with, so what its
 * generator returns is assignable here as it comes — the extra size it reports with a
 * ready copy is welcome and unused: what gets stored is the size in bytes, which is
 * what the row asks for and what `Blob.size` already knows.
 */
export type CorrectedCopyResult =
  | { status: 'NOT_NEEDED' }
  | { status: 'READY'; blob: Blob }
  | { status: 'PENDING'; reason: string }

/** The three columns of the corrected copy, as the row takes them. */
export interface CorrectedCopyColumns {
  corrected_path: string | null
  corrected_bytes: number | null
  corrected_pending: boolean
}

/** No copy and none needed: the photograph carries no correction at all. */
export const NO_CORRECTED_COPY: CorrectedCopyColumns = {
  corrected_path: null,
  corrected_bytes: null,
  corrected_pending: false,
}

/**
 * The columns plus the reason to show. They travel together on purpose: writing
 * `corrected_pending` without telling the cataloger why would leave her looking at a
 * record that quietly disagrees with itself.
 */
export interface CorrectedCopyOutcome {
  columns: CorrectedCopyColumns
  /** Spanish, ready to print, and never empty when the copy is pending. */
  reason: string | null
}

const PENDING_COLUMNS: CorrectedCopyColumns = {
  corrected_path: null,
  corrected_bytes: null,
  corrected_pending: true,
}

const pending = (reason: string): CorrectedCopyOutcome => ({ columns: PENDING_COLUMNS, reason })

/**
 * Said when the correction is stored but this device produced no full-resolution
 * copy. It names the consequence and the way out, and it does not blame the phone:
 * not generating it is a legitimate outcome, and the correction itself is safe.
 */
export const CORRECTED_NOT_GENERATED =
  'La copia a resolución completa con las correcciones aplicadas no se ha generado en este ' +
  'dispositivo. La corrección está guardada y no se ha perdido nada; la copia queda pendiente y ' +
  'se puede generar después desde un ordenador.'

/** Generated but not uploaded: the bytes are gone, the row says it is pending. */
export const CORRECTED_NOT_UPLOADED =
  'La copia a resolución completa se ha generado pero no se ha podido subir. La corrección está ' +
  'guardada; la copia queda pendiente y se puede generar y subir después desde un ordenador.'

/**
 * Refuses a corrected path that could touch a master (§0.1, ADR-002).
 *
 * Two checks and not one. The first is the collision the database also forbids with
 * `images_corrected_not_master`; the second is any path merely **shaped** like a
 * master, which catches the mistake before it can be aimed at somebody else's row —
 * by the time the constraint speaks, the PUT has already happened and the master is
 * already overwritten. A rejection here is a programming error and not a situation to
 * absorb, so it throws instead of quietly becoming a pending copy: the master is the
 * one thing in this file that has no repair.
 */
function assertNotMaster(path: string, masterPath: string | null | undefined): void {
  if (masterPath && path === masterPath) {
    throw new Error('La copia corregida no puede escribirse en la ruta del máster')
  }
  if (/_master\.[A-Za-z0-9]+$/.test(path)) {
    throw new Error('La copia corregida no puede tener la ruta de un máster')
  }
}

/**
 * Stores the corrected copy and answers with the three columns and the reason
 * (RF-420, ADR-010).
 *
 * It goes to B2 next to the master, through the signing function that already exists.
 * Everything that can go wrong on the way — the signature refused, no coverage, a
 * PUT that answers 500 — ends as **pending with its reason** and not as an exception,
 * and that is the important decision in this function: the corrected copy is a
 * derived file, while the framing and the colour the cataloger just decided are the
 * work. Throwing here would lose the work in order to report the loss of a file that
 * can be regenerated from a computer whenever.
 *
 * The one thing that does throw is a path that could be a master's: see
 * `assertNotMaster`.
 */
export async function saveCorrectedCopy(params: {
  catalogId: string
  copy: CorrectedCopyResult
  /** The master of this row, to check the copy is not about to land on it. */
  masterPath?: string | null
  /** The path to write, when the caller already has a base (see `paths`). */
  path?: string
  /** How much of the copy has gone out, for the screen (RNF-106). */
  onProgress?: (event: UploadProgressEvent) => void
}): Promise<CorrectedCopyOutcome> {
  const { catalogId, copy, masterPath } = params
  if (copy.status === 'NOT_NEEDED') return { columns: NO_CORRECTED_COPY, reason: null }
  if (copy.status === 'PENDING') return pending(copy.reason)

  // An empty blob is not a copy. It is the same class of failure as the blank canvas
  // ADR-010 describes — a plausible file with nothing inside — and uploading it would
  // put a valid path and a valid size on a row whose file a print shop opens to find
  // nothing. Blankness beyond emptiness is the generator's to detect: it has the
  // pixels, and this function only has bytes.
  if (copy.blob.size === 0) return pending(CORRECTED_NOT_UPLOADED)

  const path = params.path ?? correctedPath(catalogId)
  assertNotMaster(path, masterPath)

  try {
    const signature = await signStoredFile(path, 'upload', CORRECTED_CONTENT_TYPE, 'la copia corregida')
    // The PUT repeats exactly the signed Content-Type or the signature does not
    // validate, the same as for the master.
    const response = await putSignedFile(
      signature.url,
      copy.blob,
      CORRECTED_CONTENT_TYPE,
      params.onProgress,
    )
    if (!response.ok) return pending(CORRECTED_NOT_UPLOADED)
  } catch {
    return pending(CORRECTED_NOT_UPLOADED)
  }

  return {
    columns: {
      corrected_path: path,
      corrected_bytes: copy.blob.size,
      corrected_pending: false,
    },
    reason: null,
  }
}

/**
 * What to record when nobody handed a corrected copy over.
 *
 * A photograph with no correction needs none, and one with a correction needs one
 * that was never made: pending, which is the truth and what the batch tool of RF-421
 * looks for. The alternative — leaving everything null — would read as «no copy
 * needed» and the correction would never reach a print shop.
 */
function correctedCopyFor(edit: PhotoEdit): CorrectedCopyResult {
  if (isNoEdit(edit)) return { status: 'NOT_NEEDED' }
  return { status: 'PENDING', reason: CORRECTED_NOT_GENERATED }
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
  options: {
    shotType: string
    isIndex: boolean
    cropSource?: CropSource
    /**
     * Provenance chosen for this shot (RF-417). Takes precedence over
     * `shot.provenance`, which is where the staging list keeps it so a reload does not
     * lose it; when neither says anything the row is own work, as the column defaults.
     */
    provenance?: PhotoProvenance
    /**
     * The full-resolution corrected copy, from whoever generated it (RF-420). Omitted
     * means nobody generated one, which is recorded as pending when the shot carries a
     * correction and as «none needed» when it does not.
     */
    correctedCopy?: CorrectedCopyResult
    /**
     * How much of each large file has gone out (RNF-106).
     *
     * Only the two of the order of megabytes report: the thumbnail and the consultation
     * copy travel through the storage library, which does not say. Counting them into one
     * total would mean a bar that never reaches its own end.
     */
    onProgress?: (step: 'master' | 'corrected', event: UploadProgressEvent) => void
  },
): Promise<UploadResult> {
  // What the derivatives really are is read from the bytes about to be
  // uploaded, and not from what was asked for when they were encoded: a shot
  // rehydrated from the offline queue carries the Blobs but not the answer of
  // the probe, and the name and the declared type have to match the content in
  // that path too. Both levels are encoded together, so one format covers them.
  const format = derivativeFormatOf(shot.thumbnail)
  const target = paths(catalogId, shot.master, format.extension)

  // Thumbnail and derivative go to Supabase Storage: they are what the
  // application serves.
  const uploads: [string, Blob][] = [
    [target.thumbnail, shot.thumbnail],
    [target.derivative, shot.derivative],
  ]
  for (const [path, content] of uploads) {
    const { error } = await supabase.storage.from(BUCKET).upload(path, content, {
      contentType: format.type,
      upsert: false,
    })
    if (error) throw new Error(`Subiendo ${path}: ${error.message}`)
  }

  // The master goes to the external S3 with a signed URL. The PUT must repeat
  // exactly the signed Content-Type or the signature does not validate.
  //
  // **`body` is the `File` itself and nothing else** (§0.1, ADR-002). Not wrapped in
  // a Blob, not passed through a canvas, not re-encoded, not stripped of its EXIF,
  // not re-oriented, and not uploaded twice: the master is the archive document and
  // what makes it one is that nobody has touched it. Every correction in this
  // application produces derived files and parameters, and this line is the one that
  // has to stay boring — there is a test that pins the identity of this object.
  const masterType = shot.master.type || 'application/octet-stream'
  const signature = await signStoredFile(target.master, 'upload', masterType, ARCHIVE_NOUN.master)
  const response = await putSignedFile(signature.url, shot.master, masterType, (event) =>
    options.onProgress?.('master', event),
  )
  if (!response.ok) {
    throw new Error(`Subiendo ${ARCHIVE_NOUN.master}: HTTP ${response.status}`)
  }

  // The corrected copy, when there is one, before the row: same order and same
  // reason as everything else here — orphan files break nothing, a row pointing at a
  // file that never arrived does. It never throws: a copy that could not be stored
  // leaves the row pending, and the shot is registered.
  const corrected = await saveCorrectedCopy({
    catalogId,
    copy: options.correctedCopy ?? correctedCopyFor(shot.edit),
    masterPath: target.master,
    path: target.corrected,
    onProgress: (event) => options.onProgress?.('corrected', event),
  })

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
      // The date the file says it was taken, **next to** the date of the record and
      // never instead of it (RF-416): the record says when the photograph entered the
      // catalog and the file says when the shutter fired, they can legitimately
      // differ, and today the 39 rows in the database differ in exactly that way. The
      // pair goes together: without `file_photo_date_exact` an approximate date reads
      // as a measured one, and a row cannot carry the date without saying which of the
      // two it is (there is a constraint that says so).
      file_photo_date: shot.fileDate?.date ?? null,
      file_photo_date_exact: shot.fileDate?.exact ?? null,
      // The size of the master as the decoder gives it, orientation already applied.
      // It was already computed and already shown before uploading — it was only
      // missing from the row, where the panel of §7.1 needs it once the file is in B2
      // and reading it back would mean downloading megabytes.
      original_width: shot.originalWidth,
      original_height: shot.originalHeight,
      // Chosen, never inferred (RF-417). Own work when nobody said otherwise, which is
      // both the column's default and what 35 of the 39 rows are.
      provenance: options.provenance ?? shot.provenance ?? 'OWN',
      // The framing travels as data, not only baked into the derivatives: the
      // printed-catalog pipeline rebuilds them from the master and must be able
      // to reproduce it.
      ...editToColumns(shot.edit),
      // A copy, no copy needed, or a copy that is needed and missing (RF-420).
      ...corrected.columns,
      // Where the framing of a brand-new shot came from. A photograph uploaded
      // without touching the editor has no framing to attribute, so it stays
      // unknown rather than being called «by hand»: that is the whole point of the
      // column, and filling it with a guess would put the guess beyond reach.
      crop_source: options.cropSource ?? null,
    })
    .select('image_id')
    .single()

  if (error) throw new Error(`Registrando la imagen: ${error.message}`)
  // The reason travels back with the id so the screen can say that the print copy is
  // pending. The row already knows; the cataloger has to know too.
  return { image_id: (data as { image_id: string }).image_id, correctedPending: corrected.reason }
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
