import { supabase } from './supabase'
import {
  BUCKET,
  LEVELS,
  computeTarget,
  derivativePaths,
  masterDownloadUrl,
  signedUrl,
  type ImageLevel,
} from './images'
import {
  cropRectInPixels,
  editToColumns,
  rotatedSize,
  type PhotoEdit,
} from './imageEdits'

/**
 * The part of the photo edit that touches pixels and the store: it draws the
 * rotation and the crop on a canvas, re-encodes the two derivative levels and
 * publishes them.
 *
 * The arithmetic lives in imageEdits.ts, without DOM, because that is what the
 * tests can exercise: the test environment has neither canvas nor
 * `createImageBitmap`. What is here is verified in the browser.
 *
 * The master is never rewritten. It is the archive document (ADR-002), and the
 * whole point of storing the edit as data is that it can be reapplied to the
 * master whenever the derivatives are rebuilt.
 */

export interface RenderedLevels {
  thumbnail: Blob
  derivative: Blob
  /** Size of the edited image before downscaling, for the interface to report. */
  width: number
  height: number
}

/**
 * Draws `bitmap` with the edit applied, at full resolution.
 *
 * The order is the canonical one — rotate first, crop the rotated image — and it
 * is reached with a single transform so the image is resampled once. Getting the
 * translations wrong here does not fail: it silently frames another part of the
 * photograph.
 */
function editedCanvas(bitmap: ImageBitmap, edit: PhotoEdit): HTMLCanvasElement {
  const rotated = rotatedSize({ width: bitmap.width, height: bitmap.height }, edit.rotation)
  const rect = edit.crop
    ? cropRectInPixels(edit.crop, rotated)
    : { x: 0, y: 0, width: rotated.width, height: rotated.height }

  const canvas = document.createElement('canvas')
  canvas.width = rect.width
  canvas.height = rect.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('El navegador no ha dado un contexto de dibujo')

  // The crop is a translation of the origin over the already rotated image.
  ctx.translate(-rect.x, -rect.y)
  // And the rotation puts the source's own coordinates into that rotated frame.
  if (edit.rotation === 90) {
    ctx.translate(rotated.width, 0)
    ctx.rotate(Math.PI / 2)
  } else if (edit.rotation === 180) {
    ctx.translate(rotated.width, rotated.height)
    ctx.rotate(Math.PI)
  } else if (edit.rotation === 270) {
    ctx.translate(0, rotated.height)
    ctx.rotate(-Math.PI / 2)
  }
  ctx.drawImage(bitmap, 0, 0)
  return canvas
}

/**
 * Encodes one level from an already edited canvas.
 *
 * It does not reuse the private `downscale` of images.ts because there the
 * source is the master bitmap and here it is a canvas; the rule that matters —
 * the long edge of each level and never upscaling — is shared through
 * `LEVELS` and `computeTarget`, which is where it belongs.
 */
async function encodeLevel(source: HTMLCanvasElement, level: ImageLevel): Promise<Blob> {
  const { longEdge, quality } = LEVELS[level]
  const target = computeTarget(source.width, source.height, longEdge)

  const canvas = document.createElement('canvas')
  canvas.width = target.width
  canvas.height = target.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('El navegador no ha dado un contexto de dibujo')
  ctx.drawImage(source, 0, 0, target.width, target.height)

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('No se pudo codificar la imagen'))),
      'image/webp',
      quality,
    )
  })
}

/** Regenerates the thumbnail and the consultation copy with the edit applied. */
export async function renderEditedLevels(source: Blob, edit: PhotoEdit): Promise<RenderedLevels> {
  // `imageOrientation: 'from-image'` for the same reason as in prepareShot: the
  // EXIF orientation must already be applied before rotating, or the cataloger's
  // quarter turn would start from a different picture than the one on screen.
  const bitmap = await createImageBitmap(source, { imageOrientation: 'from-image' })
  try {
    const edited = editedCanvas(bitmap, edit)
    const [thumbnail, derivative] = await Promise.all([
      encodeLevel(edited, 'thumbnail'),
      encodeLevel(edited, 'derivative'),
    ])
    return { thumbnail, derivative, width: edited.width, height: edited.height }
  } finally {
    bitmap.close()
  }
}

async function fetchBlob(url: string): Promise<Blob> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return response.blob()
}

export interface EditSource {
  blob: Blob
  /**
   * False when the master could not be downloaded and the consultation copy is
   * being used instead. The interface must say so: the crop then starts from a
   * 2000 px image, and whatever edit it already carried is baked into it.
   */
  fromMaster: boolean
}

/**
 * The image to edit, preferring the master.
 *
 * The master is the source because cropping the 2000 px derivative and then
 * re-encoding it at 2000 px throws away resolution the archive already has. It
 * is a 2-8 MB download, so the interface announces it.
 *
 * If it fails — no coverage in the storage room, no master registered, the
 * signing function unavailable — it falls back to the consultation copy instead
 * of leaving the cataloger in front of a screen that does nothing.
 */
export async function editSource(row: {
  master_path: string | null
  derivative_path: string
}): Promise<EditSource> {
  if (row.master_path) {
    try {
      return { blob: await fetchBlob(await masterDownloadUrl(row.master_path)), fromMaster: true }
    } catch {
      /* falls back to the consultation copy below */
    }
  }
  const url = await signedUrl(row.derivative_path)
  if (!url) throw new Error('No se ha podido abrir ninguna copia de la fotografía')
  return { blob: await fetchBlob(url), fromMaster: false }
}

/**
 * Publishes the edit of an already uploaded photo.
 *
 * Two edits travel here and they are not the same thing:
 *
 *  - `render` is what must be drawn on `source`. When the source is the master
 *    it is the whole transformation; when it is the consultation copy, which
 *    already carries the previous framing, it is only what the cataloger just
 *    did.
 *  - `store` is the whole transformation from the master, which is what the row
 *    keeps and what the printed-catalog pipeline will reproduce.
 *
 * The files go to NEW paths and the row is pointed at them. Overwriting the
 * existing ones would be faster and wrong: the service worker caches images by
 * path with `CacheFirst`, so the phones would keep showing the old framing for
 * as long as the entry lives. The superseded files are left in the bucket —
 * never a real deletion — and the master is not touched at all.
 */
export async function savePhotoEdit(params: {
  catalogId: string
  imageId: string
  source: Blob
  render: PhotoEdit
  store: PhotoEdit
}): Promise<{ thumbnailPath: string; derivativePath: string }> {
  const { catalogId, imageId, source, render, store } = params
  const levels = await renderEditedLevels(source, render)
  const target = derivativePaths(catalogId)

  const uploads: [string, Blob][] = [
    [target.thumbnail, levels.thumbnail],
    [target.derivative, levels.derivative],
  ]
  for (const [path, content] of uploads) {
    const { error } = await supabase.storage.from(BUCKET).upload(path, content, {
      contentType: 'image/webp',
      upsert: false,
    })
    if (error) throw new Error(`Subiendo ${path}: ${error.message}`)
  }

  // The row last, as in uploadShot: if something fails midway, orphan files
  // remain — harmless — instead of a row pointing at files that never arrived.
  const { error } = await supabase
    .from('images')
    .update({
      thumbnail_path: target.thumbnail,
      derivative_path: target.derivative,
      ...editToColumns(store),
    })
    .eq('image_id', imageId)
  if (error) throw new Error(`Guardando el encuadre: ${error.message}`)

  return { thumbnailPath: target.thumbnail, derivativePath: target.derivative }
}
