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
 * **The invariant that makes an edit reversible**: what is stored is always
 * absolute over the master, so re-editing REPLACES those numbers, it never
 * composes onto them. That is why the crop can be widened later — or dropped
 * entirely to recover the whole original frame — today or in a year. The editor
 * therefore opens on the full master with the stored rectangle drawn on top,
 * and `composeEdits` has exactly one caller: the degraded case where the master
 * could not be downloaded and the source already carries the crop baked in. In
 * that case the crop can only shrink, and the row keeps telling the truth about
 * the master.
 *
 * There is no DOM here on purpose. This module is the arithmetic, which is the
 * part that can be tested for real: the test environment has neither canvas nor
 * `createImageBitmap`, so what draws pixels lives in imageRender.ts.
 */

import {
  CORNER_KEYS,
  cornersBoundingBox,
  isRectangle,
  isSimpleQuadrilateral,
  straightenedSize,
  type Corners,
} from './perspective'

/**
 * How a framing came to be. Mirrors the `crop_source` enum of the schema: the values
 * are code and the interface never shows them.
 *
 * It lives here and not next to the renderer because it is part of the vocabulary of
 * an edit, and because both the renderer and the uploader need it — putting it in
 * either of those two made them import each other.
 */
export type CropSource = 'MANUAL' | 'SUGGESTED' | 'SUGGESTED_ADJUSTED'

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
  /**
   * The four corners of the artwork in the already rotated image, when the framing
   * is a straightened quadrilateral instead of a rectangle.
   *
   * **Corners take precedence over `crop`**: with corners present the renderer
   * straightens and ignores the rectangle, and the two travel together on purpose
   * — the rows that already had a crop keep it, the old frontend keeps reading
   * them, and the deployment stays one-phase because the corner columns are born
   * null (see the migration).
   *
   * They do not break the invariant that makes an edit reversible: what is stored
   * is still absolute over the master, re-editing still REPLACES it, and the master
   * is never touched. What they do break is `composeEdits`, whose one caller is the
   * degraded case where the source already carries the framing baked in — there a
   * straightened image cannot be straightened again, and perspective is refused
   * rather than composed.
   *
   * Optional and not required: an edit is constructed in a dozen places that have
   * nothing to do with perspective —the photo queue, the capture flow, every test—
   * and its absence means «no perspective», which is exactly what those mean. What
   * `normalizeEdit` returns always has the field, so whatever reads a normalized
   * edit can rely on it.
   */
  corners?: Corners | null
}

export const NO_EDIT: PhotoEdit = { rotation: 0, crop: null, corners: null }

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
  // What cannot be composed is perspective ON TOP OF something already baked in.
  //
  // This is called on every save, also from the master — where `base` is NO_EDIT and
  // there is nothing to compose over, so a perspective edit passes through as it is.
  // Refusing that too was a real bug: applying the first straightening threw.
  //
  // What is genuinely impossible is the degraded path: the master could not be
  // downloaded, the consultation copy already carries its framing, and a second warp
  // would go over pixels that were already interpolated — the row would stop telling
  // the truth about the master. Same if the BASE is straightened, whatever comes on
  // top. The editor refuses to open there, and this is the backstop.
  if (base.corners || (extra.corners && !isNoEdit(base))) {
    throw new Error(
      'No se puede corregir la perspectiva sobre una imagen que ya lleva un encuadre aplicado',
    )
  }
  if (extra.corners) return normalizeEdit(extra)
  const rotation = addRotation(base.rotation, extra.rotation)
  const carried = base.crop ? rotateCrop(base.crop, extra.rotation) : null
  // `corners: null` explicitly, and not omitted: what comes out of here is the
  // canonical form, the same shape `normalizeEdit` returns, so whoever compares two
  // edits is comparing the same fields.
  if (!extra.crop) {
    return { rotation, crop: carried ? clampCrop(carried) : null, corners: null }
  }
  const composed = composeCrop(carried ?? fullCrop(), extra.crop)
  return { rotation, crop: clampCrop(composed), corners: null }
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

  // Corners that are, within tolerance, an axis-aligned rectangle get stored as a
  // crop. Not cosmetic: straightening resamples every pixel, so doing it for a
  // quadrilateral that IS a rectangle would cost sharpness for nothing — and it
  // keeps a photograph whose handles were dragged and put back from being recorded
  // as «straightened».
  const corners = edit.corners
  if (corners && isSimpleQuadrilateral(corners) && !isRectangle(corners, RECTANGLE_TOLERANCE)) {
    return { rotation, crop: null, corners: quantizeCorners(corners) }
  }
  const rect = corners ? cornersBoundingBox(corners) : edit.crop
  if (!rect || isFullCrop(rect)) return { rotation, crop: null, corners: null }
  return { rotation, crop: quantizeCrop(clampCrop(rect)), corners: null }
}

/**
 * How far from square a quadrilateral may be and still be treated as a rectangle.
 *
 * A thousandth of the frame is about two pixels of the 2000 px derivative: below
 * that, straightening changes nothing anybody can see and only costs the
 * resampling. Above it, the tilt is the whole point.
 */
const RECTANGLE_TOLERANCE = 1e-3

/** The corners rounded like a crop, for the same reason: they travel as `numeric`. */
function quantizeCorners(corners: Corners, decimals = 6): Corners {
  const factor = 10 ** decimals
  const round = (value: number) => Math.round(value * factor) / factor
  const point = (p: { x: number; y: number }) => ({ x: round(p.x), y: round(p.y) })
  return {
    nw: point(corners.nw),
    ne: point(corners.ne),
    se: point(corners.se),
    sw: point(corners.sw),
  }
}

/** True when the edit changes nothing: neither turned nor trimmed. */
export function isNoEdit(edit: PhotoEdit): boolean {
  const normalized = normalizeEdit(edit)
  return normalized.rotation === 0 && normalized.crop === null && normalized.corners === null
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
  if (x.corners || y.corners) {
    if (!x.corners || !y.corners) return false
    return CORNER_KEYS.every(
      (key) =>
        Math.abs(x.corners![key].x - y.corners![key].x) <= EPSILON &&
        Math.abs(x.corners![key].y - y.corners![key].y) <= EPSILON,
    )
  }
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
  // With corners the output is the straightened rectangle, whose proportions come
  // from the average of the opposite sides (see straightenedSize for why not from
  // the focal length or from the artwork's measurements).
  if (edit.corners) {
    const straightened = straightenedSize(edit.corners)
    return {
      width: Math.max(1, Math.round(straightened.width * rotated.width)),
      height: Math.max(1, Math.round(straightened.height * rotated.height)),
    }
  }
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

/**
 * Region of the image AS IT WAS DECODED, in its own pixels, that the loupe shows
 * while a corner of the crop is being adjusted.
 *
 * On a phone the finger covers exactly the pixel being aimed at, so the editor
 * magnifies that corner somewhere else on the screen. Which region to magnify is
 * this arithmetic: `side` is the side of the square to show, measured in pixels
 * of the ROTATED image, because that is the image the cataloger is looking at and
 * where the crop lives; what comes out is measured over the original, because
 * that is what `drawImage` reads.
 *
 * **It is not clamped to the image.** Near an edge the square pokes outside, and
 * that is on purpose: `drawImage` simply does not paint what is not there, and
 * the corner stays exactly at the centre of the loupe. Sliding the region inwards
 * to keep it full would move the corner off the centre, and then the crosshair
 * drawn there would be pointing at the wrong pixel — a magnifier that lies is
 * worse than no magnifier.
 */
export function loupeRegion(
  size: Size,
  rotation: number,
  point: { x: number; y: number },
  side: number,
): { x: number; y: number; width: number; height: number } {
  const rotated = rotatedSize(size, rotation)
  const span = Math.max(1, finite(side, 1))
  // The point as given, NOT clamped into the image: a corner of the perspective
  // quadrilateral is allowed to sit outside the photograph, and sliding the region
  // inwards would show the cataloger a different place from the one she is aiming
  // at. What falls outside is painted as background by paintLoupe.
  const aimed = { x: finite(point.x, 0.5), y: finite(point.y, 0.5) }
  const width = span / Math.max(1, rotated.width)
  const height = span / Math.max(1, rotated.height)
  // Square centred on the point, in fractions of the rotated image, and then back
  // through the rotation: the same arithmetic as any other crop of crop.
  const region = rotateCrop(
    { x: aimed.x - width / 2, y: aimed.y - height / 2, width, height },
    -rotation,
  )
  return {
    x: region.x * size.width,
    y: region.y * size.height,
    width: region.width * size.width,
    height: region.height * size.height,
  }
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
  if (normalized.corners) {
    const box = cornersBoundingBox(normalized.corners)
    const percent = Math.round(box.width * box.height * 100)
    parts.push(`Perspectiva corregida, al ${percent} % del original`)
  }
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
  /** The eight corner columns: all eight or all null, like the four of the crop. */
  corner_nw_x: number | null
  corner_nw_y: number | null
  corner_ne_x: number | null
  corner_ne_y: number | null
  corner_se_x: number | null
  corner_se_y: number | null
  corner_sw_x: number | null
  corner_sw_y: number | null
}

const NO_CORNER_COLUMNS = {
  corner_nw_x: null,
  corner_nw_y: null,
  corner_ne_x: null,
  corner_ne_y: null,
  corner_se_x: null,
  corner_se_y: null,
  corner_sw_x: null,
  corner_sw_y: null,
} as const

/**
 * The edit as stored: nulls where there is nothing, never half a rectangle nor half
 * a quadrilateral — the database refuses both and it would be refusing a shape
 * nobody can draw.
 *
 * The two framings are mutually exclusive here even though the columns can coexist
 * in a row: `normalizeEdit` has already decided which one this edit is, so writing
 * both would be writing a rectangle that the renderer is going to ignore. What DOES
 * coexist in the table are the rows written before the corners existed, which keep
 * their crop untouched.
 */
export function editToColumns(edit: PhotoEdit): EditColumns {
  const normalized = normalizeEdit(edit)

  if (normalized.corners) {
    const { nw, ne, se, sw } = normalized.corners
    return {
      rotation: normalized.rotation,
      crop_x: null,
      crop_y: null,
      crop_width: null,
      crop_height: null,
      corner_nw_x: nw.x,
      corner_nw_y: nw.y,
      corner_ne_x: ne.x,
      corner_ne_y: ne.y,
      corner_se_x: se.x,
      corner_se_y: se.y,
      corner_sw_x: sw.x,
      corner_sw_y: sw.y,
    }
  }

  if (!normalized.crop) {
    return {
      rotation: normalized.rotation,
      crop_x: null,
      crop_y: null,
      crop_width: null,
      crop_height: null,
      ...NO_CORNER_COLUMNS,
    }
  }
  return {
    rotation: normalized.rotation,
    crop_x: normalized.crop.x,
    crop_y: normalized.crop.y,
    crop_width: normalized.crop.width,
    crop_height: normalized.crop.height,
    ...NO_CORNER_COLUMNS,
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

  // Corners first, because they take precedence in the row too. Eight numbers or
  // nothing: a row with some of them is one the database could not have accepted,
  // and reading it as a crop is better than reading it as a broken quadrilateral.
  const corner = (x: unknown, y: unknown) =>
    typeof x === 'number' && typeof y === 'number' ? { x, y } : null
  const nw = corner(row.corner_nw_x, row.corner_nw_y)
  const ne = corner(row.corner_ne_x, row.corner_ne_y)
  const se = corner(row.corner_se_x, row.corner_se_y)
  const sw = corner(row.corner_sw_x, row.corner_sw_y)
  if (nw && ne && se && sw) {
    const corners = { nw, ne, se, sw }
    // And it still has to be a quadrilateral that can be straightened: a row that
    // somehow held a crossed one would produce an image folded over itself, and
    // showing the photograph unstraightened is always better than that.
    if (isSimpleQuadrilateral(corners)) return normalizeEdit({ rotation, crop: null, corners })
  }

  const { crop_x: x, crop_y: y, crop_width: width, crop_height: height } = row
  if (
    typeof x !== 'number' ||
    typeof y !== 'number' ||
    typeof width !== 'number' ||
    typeof height !== 'number'
  ) {
    return { rotation, crop: null, corners: null }
  }
  return normalizeEdit({ rotation, crop: { x, y, width, height } })
}
