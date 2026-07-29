/**
 * Geometry of a photo edit: a quarter-turn rotation plus a normalized crop.
 *
 * The canonical form, the one that is stored and the one the Python pipeline of
 * the printed catalog will reproduce, is always the same and in this order:
 *
 *   1. rotate the master CLOCKWISE by `rotation` degrees,
 *   2. crop the rotated image to `crop`, expressed as fractions (0..1) of the
 *      **already rotated** image.
 *
 * Any sequence of rotations and crops the cataloger performs collapses into that
 * pair, because rotating is rigid: cropping a region and then rotating gives the
 * same pixels as rotating first and cropping the rotated region. That is what
 * `composeEdits` does, and it is why the editor can start from a photo that
 * already carries an edit without accumulating a chain of transformations.
 *
 * Normalized and not in pixels because the same numbers are applied at three
 * different sizes — 400 px thumbnail, 2000 px derivative, full master — and a
 * rectangle measured in pixels would mean something else on each one.
 *
 * There is no DOM here on purpose. This module is the arithmetic, which is the
 * part that can be tested for real: the test environment has neither canvas nor
 * `createImageBitmap`, so what draws pixels lives in imageRender.ts.
 */

/** Clockwise, in degrees. Only quarter turns: see the migration. */
export type Rotation = 0 | 90 | 180 | 270

/** Rectangle in fractions (0..1) of the image it refers to. */
export interface Crop {
  x: number
  y: number
  width: number
  height: number
}

export interface PhotoEdit {
  rotation: Rotation
  /** Null means the whole image. */
  crop: Crop | null
}

export const NO_EDIT: PhotoEdit = { rotation: 0, crop: null }

/**
 * Smallest side the editor lets a crop have, as a fraction. Below this the
 * rectangle is smaller than its own handles and the gesture stops making sense
 * on a phone.
 */
export const MIN_CROP = 0.08

/**
 * Absolute floor for any crop side. The database demands width and height
 * greater than zero, and a zero-width rectangle produces an empty file that
 * would only be discovered when opening the record.
 */
const MIN_SIDE = 1e-4

/** Tolerance when comparing fractions: they travel through `numeric` and back. */
const EPSILON = 1e-6

function finite(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback
}

function clamp(value: number, min: number, max: number): number {
  if (max < min) return min
  return Math.min(Math.max(value, min), max)
}

/** Any multiple of 90, positive or negative, brought into 0/90/180/270. */
export function normalizeRotation(degrees: number): Rotation {
  const quarters = Math.round(finite(degrees, 0) / 90)
  return ((((quarters % 4) + 4) % 4) * 90) as Rotation
}

/** Rotation after turning `delta` degrees more. Two taps of 90 make 180. */
export function addRotation(current: number, delta: number): Rotation {
  return normalizeRotation(finite(current, 0) + finite(delta, 0))
}

/** True for the turns that swap the sides of the image. */
export function swapsSides(rotation: number): boolean {
  const r = normalizeRotation(rotation)
  return r === 90 || r === 270
}

export interface Size {
  width: number
  height: number
}

/** Size of the image after rotating it: 90 and 270 swap the sides. */
export function rotatedSize(size: Size, rotation: number): Size {
  return swapsSides(rotation)
    ? { width: size.height, height: size.width }
    : { width: size.width, height: size.height }
}

/**
 * Fits a rectangle inside the unit square without letting it degenerate.
 *
 * It is the last gate before the database: whatever the drag, the composition or
 * a rounding leaves behind, what comes out of here can be drawn.
 */
export function clampCrop(crop: Crop, minSide = MIN_SIDE): Crop {
  const min = clamp(finite(minSide, MIN_SIDE), MIN_SIDE, 1)
  const width = clamp(finite(crop.width, 1), min, 1)
  const height = clamp(finite(crop.height, 1), min, 1)
  return {
    x: clamp(finite(crop.x, 0), 0, 1 - width),
    y: clamp(finite(crop.y, 0), 0, 1 - height),
    width,
    height,
  }
}

/** The whole image, as an explicit rectangle. */
export function fullCrop(): Crop {
  return { x: 0, y: 0, width: 1, height: 1 }
}

/** A centered rectangle covering `fraction` of each side, to start cropping. */
export function centeredCrop(fraction = 0.8): Crop {
  const side = clamp(finite(fraction, 0.8), MIN_CROP, 1)
  return { x: (1 - side) / 2, y: (1 - side) / 2, width: side, height: side }
}

/** True when the rectangle keeps the whole image, so it is not a crop at all. */
export function isFullCrop(crop: Crop | null): boolean {
  if (!crop) return true
  return (
    crop.x <= EPSILON &&
    crop.y <= EPSILON &&
    crop.width >= 1 - EPSILON &&
    crop.height >= 1 - EPSILON
  )
}

/**
 * The same region after rotating the image it belongs to.
 *
 * In normalized coordinates the image is always a unit square, so a quarter turn
 * maps it onto itself and this is pure arithmetic on the corners. Rotating the
 * photo must not move the selection off the part of the artwork the cataloger
 * framed.
 */
export function rotateCrop(crop: Crop, rotation: number): Crop {
  const r = normalizeRotation(rotation)
  if (r === 90) {
    return { x: 1 - crop.y - crop.height, y: crop.x, width: crop.height, height: crop.width }
  }
  if (r === 180) {
    return {
      x: 1 - crop.x - crop.width,
      y: 1 - crop.y - crop.height,
      width: crop.width,
      height: crop.height,
    }
  }
  if (r === 270) {
    return { x: crop.y, y: 1 - crop.x - crop.width, width: crop.height, height: crop.width }
  }
  return { ...crop }
}

/**
 * A crop of a crop, brought back to the original image.
 *
 * `inner` is measured over what `outer` already left visible — which is the case
 * when the editor works on the consultation copy because the master could not be
 * downloaded, since that copy already carries the previous crop baked in.
 */
export function composeCrop(outer: Crop, inner: Crop): Crop {
  return {
    x: outer.x + inner.x * outer.width,
    y: outer.y + inner.y * outer.height,
    width: inner.width * outer.width,
    height: inner.height * outer.height,
  }
}

/**
 * The single edit equivalent to applying `extra` on top of the result of `base`.
 *
 * `base` is what the source image already shows; `extra` is what the cataloger
 * just did over it. The rotation accumulates and the previous crop travels
 * through that rotation before the new one is composed inside it — otherwise a
 * photo cropped and then turned would come out framed somewhere else.
 */
export function composeEdits(base: PhotoEdit, extra: PhotoEdit): PhotoEdit {
  const rotation = addRotation(base.rotation, extra.rotation)
  const carried = base.crop ? rotateCrop(base.crop, extra.rotation) : null
  if (!extra.crop) {
    return { rotation, crop: carried ? clampCrop(carried) : null }
  }
  const composed = composeCrop(carried ?? fullCrop(), extra.crop)
  return { rotation, crop: clampCrop(composed) }
}

/** Rounds the fractions so that float noise does not reach the database. */
export function quantizeCrop(crop: Crop, decimals = 6): Crop {
  const factor = 10 ** decimals
  const round = (n: number) => Math.round(n * factor) / factor
  return { x: round(crop.x), y: round(crop.y), width: round(crop.width), height: round(crop.height) }
}

/**
 * Canonical form for storing and comparing: rotation reduced and a crop that
 * keeps everything turned into "no crop", because that is what it is.
 */
export function normalizeEdit(edit: PhotoEdit): PhotoEdit {
  const rotation = normalizeRotation(edit.rotation)
  if (!edit.crop || isFullCrop(edit.crop)) return { rotation, crop: null }
  return { rotation, crop: quantizeCrop(clampCrop(edit.crop)) }
}

/** True when the edit changes nothing: neither turned nor trimmed. */
export function isNoEdit(edit: PhotoEdit): boolean {
  const normalized = normalizeEdit(edit)
  return normalized.rotation === 0 && normalized.crop === null
}

/**
 * True when two edits mean the same framing. Used to avoid rewriting files —
 * and therefore new paths in the bucket — when the cataloger opened the editor,
 * looked, and applied without changing anything.
 */
export function sameEdit(a: PhotoEdit, b: PhotoEdit): boolean {
  const x = normalizeEdit(a)
  const y = normalizeEdit(b)
  if (x.rotation !== y.rotation) return false
  if (!x.crop || !y.crop) return x.crop === y.crop
  return (
    Math.abs(x.crop.x - y.crop.x) <= EPSILON &&
    Math.abs(x.crop.y - y.crop.y) <= EPSILON &&
    Math.abs(x.crop.width - y.crop.width) <= EPSILON &&
    Math.abs(x.crop.height - y.crop.height) <= EPSILON
  )
}

/** Whole pixels of the crop over an image of `size`, never outside it. */
export function cropRectInPixels(
  crop: Crop,
  size: Size,
): { x: number; y: number; width: number; height: number } {
  const safe = clampCrop(crop)
  const imageWidth = Math.max(1, Math.round(finite(size.width, 1)))
  const imageHeight = Math.max(1, Math.round(finite(size.height, 1)))
  const x = clamp(Math.round(safe.x * imageWidth), 0, imageWidth - 1)
  const y = clamp(Math.round(safe.y * imageHeight), 0, imageHeight - 1)
  return {
    x,
    y,
    width: clamp(Math.round(safe.width * imageWidth), 1, imageWidth - x),
    height: clamp(Math.round(safe.height * imageHeight), 1, imageHeight - y),
  }
}

/** Size in pixels the edited image ends up with, before any downscaling. */
export function editedSize(size: Size, edit: PhotoEdit): Size {
  const rotated = rotatedSize(size, edit.rotation)
  if (!edit.crop) {
    return { width: Math.max(1, Math.round(rotated.width)), height: Math.max(1, Math.round(rotated.height)) }
  }
  const rect = cropRectInPixels(edit.crop, rotated)
  return { width: rect.width, height: rect.height }
}

/**
 * Largest size of `content` that fits inside `box`, keeping the aspect ratio.
 *
 * It does upscale, unlike the derivative pipeline: here it is the working
 * surface, and a small photo must still be big enough to grab its handles with a
 * thumb.
 */
export function fitInside(content: Size, box: Size): Size {
  const cw = finite(content.width, 0)
  const ch = finite(content.height, 0)
  const bw = finite(box.width, 0)
  const bh = finite(box.height, 0)
  if (cw <= 0 || ch <= 0 || bw <= 0 || bh <= 0) return { width: 0, height: 0 }
  const factor = Math.min(bw / cw, bh / ch)
  return { width: cw * factor, height: ch * factor }
}

export type Corner = 'nw' | 'ne' | 'sw' | 'se'

/** Where a corner of the crop sits, in normalized coordinates. */
export function cornerPoint(crop: Crop, corner: Corner): { x: number; y: number } {
  const west = corner === 'nw' || corner === 'sw'
  const north = corner === 'nw' || corner === 'ne'
  return {
    x: west ? crop.x : crop.x + crop.width,
    y: north ? crop.y : crop.y + crop.height,
  }
}

/**
 * The crop after dragging one corner to `point` (normalized coordinates).
 *
 * The opposite corner stays put, and the rectangle neither leaves the image nor
 * shrinks below `minSide`: dragging past the limit stops the edge instead of
 * flipping the rectangle inside out, which on a phone is what actually happens
 * when a thumb overshoots.
 */
export function resizeCrop(
  crop: Crop,
  corner: Corner,
  point: { x: number; y: number },
  minSide = MIN_CROP,
): Crop {
  const min = clamp(finite(minSide, MIN_CROP), MIN_SIDE, 1)
  const base = clampCrop(crop, min)
  const left = base.x
  const top = base.y
  const right = base.x + base.width
  const bottom = base.y + base.height
  const px = clamp(finite(point.x, 0), 0, 1)
  const py = clamp(finite(point.y, 0), 0, 1)

  const west = corner === 'nw' || corner === 'sw'
  const north = corner === 'nw' || corner === 'ne'

  const newLeft = west ? clamp(px, 0, right - min) : left
  const newRight = west ? right : clamp(px, left + min, 1)
  const newTop = north ? clamp(py, 0, bottom - min) : top
  const newBottom = north ? bottom : clamp(py, top + min, 1)

  return clampCrop(
    { x: newLeft, y: newTop, width: newRight - newLeft, height: newBottom - newTop },
    min,
  )
}

/** The crop moved by a normalized delta, kept whole and inside the image. */
export function moveCrop(crop: Crop, deltaX: number, deltaY: number): Crop {
  const base = clampCrop(crop)
  return clampCrop({
    x: base.x + finite(deltaX, 0),
    y: base.y + finite(deltaY, 0),
    width: base.width,
    height: base.height,
  })
}

/** What the edit did, for the cataloger to read. Null when it did nothing. */
export function editSummary(edit: PhotoEdit): string | null {
  const normalized = normalizeEdit(edit)
  const parts: string[] = []
  if (normalized.rotation !== 0) parts.push(`Girada ${normalized.rotation}°`)
  if (normalized.crop) {
    const percent = Math.round(normalized.crop.width * normalized.crop.height * 100)
    parts.push(`Recortada al ${percent} % del original`)
  }
  return parts.length === 0 ? null : parts.join(' · ')
}

/** Columns of the `images` row that hold the edit. */
export interface EditColumns {
  rotation: number
  crop_x: number | null
  crop_y: number | null
  crop_width: number | null
  crop_height: number | null
}

/** The edit as stored: four nulls when there is no crop, never a half rectangle. */
export function editToColumns(edit: PhotoEdit): EditColumns {
  const normalized = normalizeEdit(edit)
  if (!normalized.crop) {
    return {
      rotation: normalized.rotation,
      crop_x: null,
      crop_y: null,
      crop_width: null,
      crop_height: null,
    }
  }
  return {
    rotation: normalized.rotation,
    crop_x: normalized.crop.x,
    crop_y: normalized.crop.y,
    crop_width: normalized.crop.width,
    crop_height: normalized.crop.height,
  }
}

/**
 * The edit a row carries. A row written before this feature existed — or one
 * with a crop the database could not have accepted — reads as no edit: showing
 * the photo unframed is always better than not showing it.
 */
export function editFromColumns(row: Partial<EditColumns> | null | undefined): PhotoEdit {
  if (!row) return NO_EDIT
  const rotation = normalizeRotation(row.rotation ?? 0)
  const { crop_x: x, crop_y: y, crop_width: width, crop_height: height } = row
  if (
    typeof x !== 'number' ||
    typeof y !== 'number' ||
    typeof width !== 'number' ||
    typeof height !== 'number'
  ) {
    return { rotation, crop: null }
  }
  return normalizeEdit({ rotation, crop: { x, y, width, height } })
}
