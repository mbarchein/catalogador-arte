/**
 * A photo edit: a quarter-turn rotation, a normalized crop, the four corners of a
 * straightened framing, and the colour adjustment that travels with them.
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
 * **The colour rides along, and it is not geometry** (RF-414). Its arithmetic —the
 * closed set of parameters, the chain that turns them into three tables of 256
 * entries, the presets and the automatic— is the whole of imageColor.ts and none of
 * it is repeated here. What lives here is the *pairing*: an edit is a framing AND a
 * colour, because that pair is what the editor applies at once, what one row of
 * `images` stores, and what decides whether the derivative files have to be written
 * again. Keeping the colour outside the edit was tried on paper and the first thing
 * it produces is a `sameEdit` that says «nothing changed» while the cataloger is
 * looking at a photograph she just corrected: the files stay as they were and the
 * correction is lost without a word.
 *
 * The colour obeys the same invariant as the framing, for the same reason: it is
 * absolute over the master, re-editing REPLACES it and never composes onto it, and
 * the master is never touched (ADR-002, ADR-009). And it breaks `composeEdits` in the
 * same place the corners break it — the degraded path, where the source is the
 * consultation copy and already carries a colour baked into pixels that went through
 * a lossy WebP. Correcting that again would correct the artefacts of the compression
 * as if they were the artwork, so it is refused rather than composed.
 *
 * There is no DOM here on purpose. This module is the arithmetic, which is the
 * part that can be tested for real: the test environment has neither canvas nor
 * `createImageBitmap`, so what draws pixels lives in imageRender.ts.
 */

import {
  COLOR_RANGES,
  NO_COLOR,
  colorFromColumns,
  colorSummary,
  colorToColumns,
  isNoColor,
  normalizeColor,
  sameColor,
  type ColorColumns,
  type ColorEdit,
  type ColorInput,
  type ColorParam,
} from './imageColor'
import type { PhotoProvenance, ShotTypeValue } from './types'
import {
  CORNER_KEYS,
  cornersBoundingBox,
  isRectangle,
  isConvexQuadrilateral,
  rotateCorners,
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
  /**
   * The colour adjustment of the photograph (RF-414). Its definition, its ranges and
   * its arithmetic are imageColor.ts; here it is one more field of the edit.
   *
   * Optional and permissive for the same reason `corners` is: an edit is built in a
   * dozen places that have nothing to say about colour —the photo queue, the capture
   * flow, every test of the framing— and its absence means «no adjustment», which is
   * exactly what those mean. `ColorInput` and not `ColorEdit` so that a caller can
   * hand over the two values it touched; whatever comes out of `normalizeEdit` always
   * carries a canonical `ColorEdit`, so whoever reads a normalized edit can rely on
   * every parameter being there.
   */
  color?: ColorInput
}

/**
 * The shape `normalizeEdit`, `composeEdits` and `editFromColumns` return: the three
 * framing fields always present, and the colour always a canonical `ColorEdit`.
 *
 * It exists so that the panel, the renderer and the uploader do not each normalize
 * the colour again on the way in. It promises presence and canonical colour, not that
 * the fractions were quantized — that is what `normalizeEdit` alone adds.
 */
export interface NormalizedPhotoEdit extends PhotoEdit {
  crop: Crop | null
  corners: Corners | null
  color: ColorEdit
}

export const NO_EDIT: NormalizedPhotoEdit = {
  rotation: 0,
  crop: null,
  corners: null,
  // The neutral adjustment, and not a missing one: an edit with no colour and an edit
  // whose colour does nothing are the same thing for the pixels, and having one shape
  // for both is what keeps `sameEdit` from rewriting files over a difference nobody
  // can see.
  color: NO_COLOR,
}

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
 * The WHOLE edit turned with the photograph: the turn, the rectangle and the
 * quadrilateral, in one call.
 *
 * It exists because the editor turned them one by one at the call site — the turn on
 * one line, the rectangle on the next, the stored candidates on a third — and the
 * quadrilateral was simply missing from that list. Turning a photograph that had its
 * four corners placed left them in the previous frame, and since a quarter turn swaps
 * the sides of the image, the shape came out transposed over a painting that had
 * moved. Three sibling lines are three chances to forget one; one function is none.
 */
export function rotateEdit(edit: PhotoEdit, rotation: number): NormalizedPhotoEdit {
  return {
    rotation: addRotation(edit.rotation, rotation),
    crop: edit.crop ? rotateCrop(edit.crop, rotation) : null,
    corners: edit.corners ? rotateCorners(edit.corners, rotation) : null,
    // The colour does not turn — a table of 256 entries has no orientation — but the
    // place where the grey was sampled does, and it is the fourth sibling of that list
    // of three. See `rotateNeutralPoint`.
    color: rotateNeutralPoint(edit.color, rotation),
  }
}

/**
 * The colour adjustment with its neutral reference turned along with the photograph.
 *
 * `color_neutral_x/y` are «fractions of the ALREADY ROTATED image», the same system as
 * the crop and the corners, so a quarter turn moves them exactly as it moves those.
 * Nothing visible depends on it —the correction is in `temperature` and `tint`— and
 * that is precisely why it is easy to forget: what breaks is the one thing the field
 * exists for, which is being able to see, in a year, that the grey was taken off the
 * cardboard under the label and not off the painting. A point left in the previous
 * frame points at a pixel nobody sampled.
 */
function rotateNeutralPoint(color: ColorInput, rotation: number): ColorEdit {
  const c = normalizeColor(color)
  if (!c.neutral) return c
  // A point is a rectangle with no sides: `rotateCrop` is already the arithmetic of
  // turning a normalized region, and going through it is what keeps a second copy of
  // the same four cases from drifting away from the first.
  const turned = rotateCrop({ x: c.neutral.x, y: c.neutral.y, width: 0, height: 0 }, rotation)
  return normalizeColor({ ...c, neutral: { x: turned.x, y: turned.y } })
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
export function composeEdits(base: PhotoEdit, extra: PhotoEdit): NormalizedPhotoEdit {
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
  //
  // Note `isNoEdit` now also counts the colour, and that widening is deliberate: a
  // source that already shows a colour adjustment is a source with something baked in,
  // so straightening it is refused for the same reason.
  if (base.corners || (extra.corners && !isNoEdit(base))) {
    throw new Error(
      'No se puede corregir la perspectiva sobre una imagen que ya lleva un encuadre aplicado',
    )
  }

  // And the colour, refused in the same one place and for a reason of its own: the
  // degraded path works on the consultation copy, whose pixels went through a lossy
  // WebP and already carry the previous colour. A second adjustment there would
  // correct the artefacts of the compression as if they were the artwork, and the row
  // would stop telling the truth about the master.
  //
  // What is NOT refused is composing a framing over a source that carries a colour:
  // the crop arithmetic does not care, and the stored adjustment travels through
  // untouched (see `color` below). Dropping it instead would leave the row claiming no
  // colour over a file that plainly shows one.
  //
  // Like the corners, the guard is the backstop and not the rule: the rule is the
  // editor, which does not offer the panel when the master could not be downloaded
  // (`canRestoreOriginal`) nor when the photograph is not our own (RF-417).
  const addsColor = !isNoColor(extra.color)
  if (addsColor && !isNoEdit(base)) {
    throw new Error(
      'No se puede ajustar el color sobre una imagen que ya lleva aplicado un ajuste anterior',
    )
  }
  // Absolute over the master and never composed: from the master —which is where a new
  // adjustment can come from at all— the colour is REPLACED by what the editor
  // returns, which is what lets it be loosened, changed or dropped in a year. Anywhere
  // else there is nothing new to write, and what the source already carries is kept.
  const color = isNoEdit(base) ? normalizeColor(extra.color) : normalizeColor(base.color)

  if (extra.corners) return { ...normalizeEdit(extra), color }
  const rotation = addRotation(base.rotation, extra.rotation)
  const carried = base.crop ? rotateCrop(base.crop, extra.rotation) : null
  // `corners: null` explicitly, and not omitted: what comes out of here is the
  // canonical form, the same shape `normalizeEdit` returns, so whoever compares two
  // edits is comparing the same fields.
  if (!extra.crop) {
    return { rotation, crop: carried ? clampCrop(carried) : null, corners: null, color }
  }
  const composed = composeCrop(carried ?? fullCrop(), extra.crop)
  return { rotation, crop: clampCrop(composed), corners: null, color }
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
export function normalizeEdit(edit: PhotoEdit): NormalizedPhotoEdit {
  const rotation = normalizeRotation(edit.rotation)
  // The colour is canonicalized by imageColor.ts and, unlike a rectangle that keeps
  // everything, **it is never collapsed to null**. A neutral colour is not the absence
  // of a colour: it can be carrying `source: 'REVIEWED_UNCHANGED'`, which is «se miró
  // con la obra delante y se dejó como estaba» — work done, as opposed to work
  // pending. «Sin revisar» no es «no», and null here would erase exactly that.
  const color = normalizeColor(edit.color)

  // Corners that are, within tolerance, an axis-aligned rectangle get stored as a
  // crop. Not cosmetic: straightening resamples every pixel, so doing it for a
  // quadrilateral that IS a rectangle would cost sharpness for nothing — and it
  // keeps a photograph whose handles were dragged and put back from being recorded
  // as «straightened».
  const corners = edit.corners
  if (corners && isConvexQuadrilateral(corners) && !isRectangle(corners, RECTANGLE_TOLERANCE)) {
    return { rotation, crop: null, corners: quantizeCorners(corners), color }
  }
  const rect = corners ? cornersBoundingBox(corners) : edit.crop
  if (!rect || isFullCrop(rect)) return { rotation, crop: null, corners: null, color }
  return { rotation, crop: quantizeCrop(clampCrop(rect)), corners: null, color }
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

/**
 * True when the edit changes nothing: neither turned, nor trimmed, nor corrected.
 *
 * The colour counts, and it counts by its LOOK and not by its provenance: an
 * adjustment that says «revisado y dejado como estaba» is, for the pixels, nothing at
 * all, and the derivatives must not be written again for it.
 */
export function isNoEdit(edit: PhotoEdit): boolean {
  const normalized = normalizeEdit(edit)
  return (
    normalized.rotation === 0 &&
    normalized.crop === null &&
    normalized.corners === null &&
    isNoColor(normalized.color)
  )
}

/**
 * True when two edits produce the same picture: the same framing and the same colour.
 * Used to avoid rewriting files — and therefore new paths in the bucket — when the
 * cataloger opened the editor, looked, and applied without changing anything.
 *
 * **The colour is part of the comparison, and forgetting it is a silent data loss**:
 * two edits that differ only in the colour would compare equal, «Aplicar» would decide
 * there is nothing to regenerate, and the correction the cataloger just made would
 * disappear without a message — with the row possibly saying it is there. That is why
 * it has a test of its own.
 *
 * What it compares of the colour is what changes pixels (`sameColor`), so two
 * adjustments that differ only in where their grey was measured, or in which preset
 * they started from, are the same picture and a different ROW. Whoever needs to know
 * whether the row changed —to keep the eyedropper's traceability, or a
 * `REVIEWED_UNCHANGED` that has just been earned— compares `editToColumns`, which is
 * exported for that.
 */
export function sameEdit(a: PhotoEdit, b: PhotoEdit): boolean {
  const x = normalizeEdit(a)
  const y = normalizeEdit(b)
  if (x.rotation !== y.rotation) return false
  if (!sameColor(x.color, y.color)) return false
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
  // the focal length or from the artwork's measurements). Measured against
  // `rotated`, because the sides are only comparable once they are in pixels.
  if (edit.corners) {
    const straightened = straightenedSize(edit.corners, rotated)
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

/**
 * What the edit did, for the cataloger to read. Null when it did nothing.
 *
 * One line for the framing and the colour together, because the header of the dialog
 * is one line: `colorSummary` already returns its parameters joined with the same
 * separator, so the two halves read as a single list.
 */
export function editSummary(edit: PhotoEdit): string | null {
  const normalized = normalizeEdit(edit)
  const parts: string[] = []
  if (normalized.rotation !== 0) parts.push(`Girada ${normalized.rotation}°`)
  if (normalized.corners) {
    const box = cornersBoundingBox(normalized.corners)
    const percent = Math.round(box.width * box.height * 100)
    parts.push(`Perspectiva corregida, al ${percent}% del original`)
  }
  if (normalized.crop) {
    const percent = Math.round(normalized.crop.width * normalized.crop.height * 100)
    parts.push(`Recortada al ${percent}% del original`)
  }
  const color = colorSummary(normalized.color)
  if (color) {
    parts.push(color)
    // §7: the screen has to say when an adjustment was not decided for this shot but
    // came from the general one. Said here, where the cataloger is already reading what
    // was done, and only when the colour does something — «heredado» on top of a
    // neutral adjustment would announce an inheritance of nothing.
    if (normalized.color.inherited === true) parts.push('Color heredado de la toma general')
  }
  return parts.length === 0 ? null : parts.join(' · ')
}

/**
 * Columns of the `images` row that hold the edit: the framing and, through
 * `ColorColumns`, the fourteen of the colour (§5, migration 20260803120000).
 *
 * **The two clipping percentages are deliberately not here.** `color_clipped_low` and
 * `color_clipped_high` are not part of the adjustment but a measurement of what
 * applying it did to the pixels — «se anota al aplicar», says the migration — so they
 * are written by whoever has the pixels in hand, with `clippingToColumns` of
 * imageHistogram.ts. There are no pixels in this module, and a column filled in from
 * here would be a count nobody made.
 */
export interface EditColumns extends ColorColumns {
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
  // The colour writes itself: `colorToColumns` is the one place that knows that null is
  // the identity in the row (and that `color_source` is the exception, where null is
  // «nobody has looked at it yet»).
  const color = colorToColumns(normalized.color)

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
      ...color,
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
      ...color,
    }
  }
  return {
    rotation: normalized.rotation,
    crop_x: normalized.crop.x,
    crop_y: normalized.crop.y,
    crop_width: normalized.crop.width,
    crop_height: normalized.crop.height,
    ...NO_CORNER_COLUMNS,
    ...color,
  }
}

/**
 * The edit a row carries. A row written before this feature existed — or one
 * with a crop the database could not have accepted — reads as no edit: showing
 * the photo unframed is always better than not showing it.
 *
 * The same forgiveness applies to the colour, and there it is the whole deployment
 * plan: **null is the identity**, so the 39 rows that predate the colour columns read
 * as a neutral adjustment without anybody rewriting them. The one column where null is
 * not the identity is `color_source`, which reads as «nobody has looked at the colour
 * of this photograph yet» — not as «looked at and left alone».
 */
export function editFromColumns(row: Partial<EditColumns> | null | undefined): NormalizedPhotoEdit {
  if (!row) return NO_EDIT
  const rotation = normalizeRotation(row.rotation ?? 0)
  const color = colorFromColumns(row)

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
    if (isConvexQuadrilateral(corners)) {
      return normalizeEdit({ rotation, crop: null, corners, color })
    }
  }

  const { crop_x: x, crop_y: y, crop_width: width, crop_height: height } = row
  if (
    typeof x !== 'number' ||
    typeof y !== 'number' ||
    typeof width !== 'number' ||
    typeof height !== 'number'
  ) {
    return { rotation, crop: null, corners: null, color }
  }
  return normalizeEdit({ rotation, crop: { x, y, width, height }, color })
}

/* ------------------------------------------------- when the colour is on offer */

/**
 * Whether the colour panel is offered at all, and the reason in Spanish when it is
 * not.
 *
 * The two reasons it can be refused are not of the same kind, and that is why the
 * provenance is answered first: a reproduction taken from someone else's catalog will
 * never be adjustable here, while a master that did not download may download on the
 * next attempt. Telling the cataloger to retry a connection when the answer is «this
 * photograph is not ours» would send her to fix the wrong thing.
 *
 * **Never a blank**: whenever this says no, it says why, because a control that is
 * simply not there is indistinguishable from one that is broken.
 */
export interface ColorAvailability {
  available: boolean
  /** Spanish, ready to be shown in the help line. Null when it is available. */
  reason: string | null
}

/**
 * `canRestoreOriginal` is the editor's own switch: true when the master of record is
 * in hand, false when the source is the consultation copy — which already carries the
 * colour baked into pixels that went through a lossy WebP (see `composeEdits`, which
 * throws as the backstop).
 */
export function colorAvailability(
  canRestoreOriginal: boolean,
  provenance?: PhotoProvenance | null,
): ColorAvailability {
  // RF-417. Four of the 44 masters are reproductions taken from catalogs online: not a
  // cataloguing mistake, the only thing that exists of those artworks. Correcting the
  // cast of one of them is amending somebody else's development of a photograph of an
  // artwork this cataloger never saw under that light.
  if (provenance === 'OTHER_CATALOG') {
    return {
      available: false,
      reason:
        'El ajuste de color no se ofrece en una fotografía tomada de otro catálogo: sería ' +
        'enmendar el revelado de otra persona sobre una obra que no se ha visto con esa luz.',
    }
  }
  if (provenance === 'THIRD_PARTY') {
    return {
      available: false,
      reason:
        'El ajuste de color no se ofrece en una fotografía recibida de un tercero: sería ' +
        'enmendar el revelado de otra persona sobre una obra que no se ha visto con esa luz.',
    }
  }
  if (!canRestoreOriginal) {
    return {
      available: false,
      reason:
        'Sin el máster de archivo no se ofrece el ajuste: la copia de consulta ya lo lleva aplicado.',
    }
  }
  return { available: true, reason: null }
}

/**
 * The seven parameters in the order of the table of §3.1, which is the order of the
 * strips in the panel.
 *
 * `COLOR_RANGES` is the definition of each one and this is only their order; the test
 * checks that this list covers exactly its keys, so a parameter added there without
 * being placed here fails instead of quietly disappearing from the panel.
 */
export const COLOR_PARAM_ORDER: readonly ColorParam[] = [
  'temperature',
  'tint',
  'exposure',
  'blackPoint',
  'whitePoint',
  'gamma',
  'shoulder',
]

/** A parameter that is shown but cannot be moved, with the reason the panel prints. */
export interface DisabledColorParam {
  param: ColorParam
  /** Spanish, for the help line. Never empty: a disabled control with no reason reads as a bug. */
  reason: string
}

/** Which parameters a shot type offers, and which it shows disabled and why (§3.1). */
export interface ShotTypeColorParams {
  /** Parameters with a working strip, in the order of §3.1. */
  offered: readonly ColorParam[]
  /**
   * Parameters that are shown and cannot be moved. **Shown and not hidden**: hiding
   * them would make a photograph that inherited a tonal adjustment look as if it had
   * none, and the cataloger could neither see it nor understand why her strip is gone.
   */
  disabled: readonly DisabledColorParam[]
  /** The black-and-white switch, which is not a strip and has its own rule. */
  gray: { offered: boolean; reason: string | null }
}

/** The white balance and the exposure: what undoes the light of the room and nothing else. */
const LIGHT_ONLY: readonly ColorParam[] = ['temperature', 'tint', 'exposure']

/** The four that move the tonal range, which in a detail shot IS the subject. */
const TONAL_PARAMS: readonly ColorParam[] = ['blackPoint', 'whitePoint', 'gamma', 'shoulder']

/**
 * What each shot type offers of the closed set of §3.1.
 *
 * Two rules, and both come from the same place: in a photograph of a detail the colour
 * is not the light of the room, it is the datum.
 *
 *  - **Black and white only on the back and on the signature detail**, where what
 *    matters is reading a stamp or a stroke and not the colour of the support.
 *  - **On a damage detail and on a frame, only the cast and the exposure.** The
 *    yellowing of a varnish, the ring left by damp, rust, the patina of a gilt frame:
 *    that is what the photograph has to testify to, and the tonal range is what would
 *    change its look. They travel visible and disabled with the reason in the help
 *    line, because a control that vanishes explains nothing.
 *
 * An unknown or missing shot type gets the general treatment — everything except the
 * switch — which is the safe reading: it offers what a general shot offers and never
 * silently enables what a detail shot forbids.
 */
export function colorParamsForShotType(
  shotType?: ShotTypeValue | null,
): ShotTypeColorParams {
  const grayOffered = shotType === 'BACK' || shotType === 'SIGNATURE_DETAIL'

  if (shotType === 'DAMAGE_DETAIL' || shotType === 'FRAME') {
    const subject =
      shotType === 'DAMAGE_DETAIL'
        ? 'el amarilleo del barniz, el cerco de humedad, el óxido'
        : 'la pátina del dorado, el óxido, la madera'
    const kind = shotType === 'DAMAGE_DETAIL' ? 'un detalle de daño' : 'un detalle de marco'
    return {
      offered: LIGHT_ONLY,
      disabled: TONAL_PARAMS.map((param) => ({
        param,
        reason:
          `En ${kind} el color es el dato —${subject}—, así que aquí solo se corrige la luz de ` +
          'la sala: la dominante y la exposición. Mover el rango tonal cambiaría el aspecto de ' +
          'lo que hay que documentar.',
      })),
      gray: {
        offered: false,
        reason: `El blanco y negro no se ofrece en ${kind}: el color es justo el dato.`,
      },
    }
  }

  return {
    offered: COLOR_PARAM_ORDER,
    disabled: [],
    gray: {
      offered: grayOffered,
      reason: grayOffered
        ? null
        : 'El blanco y negro solo se ofrece en el reverso y en el detalle de firma, donde lo ' +
          'que importa es leer un sello o un trazo y no el color del soporte.',
    },
  }
}

/**
 * The adjustment with everything the shot type does not offer back at its identity.
 *
 * It exists for the three things that write several parameters at once and do not know
 * where they are landing: the automatic, a light preset and an inherited adjustment.
 * Without it, an automatic run on a damage detail would set the black point through a
 * strip that is disabled there — a tonal change the cataloger can see and cannot undo,
 * which is worse than not offering it at all.
 *
 * The provenance of the adjustment is kept whole: what was restricted is the look, and
 * where the numbers came from is still true.
 */
export function restrictColorToShotType(
  color: ColorInput,
  shotType?: ShotTypeValue | null,
): ColorEdit {
  const c = normalizeColor(color)
  const params = colorParamsForShotType(shotType)
  const offered = new Set(params.offered)
  const value = (key: ColorParam) => (offered.has(key) ? c[key] : COLOR_RANGES[key].default)
  return normalizeColor({
    ...c,
    temperature: value('temperature'),
    tint: value('tint'),
    exposure: value('exposure'),
    blackPoint: value('blackPoint'),
    whitePoint: value('whitePoint'),
    gamma: value('gamma'),
    shoulder: value('shoulder'),
    gray: params.gray.offered ? c.gray : false,
  })
}

/* --------------------------------------------------------- inherited adjustment */

/**
 * The edit of a secondary shot after inheriting the colour of the general shot (§7).
 *
 * «La toma general manda»: the back, the signature, the damage and the frame start from
 * her adjustment, are changed one by one from there, and can be brought back to it —
 * and **bringing them back is calling this again**, which is why there is no second
 * function for it. Two names for one piece of arithmetic is how the two of them drift.
 *
 * Three decisions, all of them visible in what comes out:
 *
 *  - `inherited: true` is the fact, and it is a fact about **how the adjustment
 *    arrived** and not about its numbers. That is why it is a column and not a
 *    comparison: an adjustment made by hand that happens to coincide with the general
 *    one is not inherited, and saying it is would be inventing the answer to «who
 *    decided this?».
 *  - **The neutral point is dropped.** It is a place in fractions of the general shot's
 *    image, and there is nothing at those coordinates in the photograph of a signature.
 *    A point pointing at a pixel nobody sampled is worse than no point. What is kept is
 *    `source`, `reference` and `light`, which do describe how the numbers were decided.
 *  - The look arrives **restricted to what this shot type offers** (§3.1): a damage
 *    detail does not get a midtone correction through the back door of inheritance,
 *    because there the tonal range is the subject. Pass `shotType` null only when it is
 *    genuinely unknown, and then the whole look is inherited.
 */
export function inheritColor(
  edit: PhotoEdit,
  general: ColorInput,
  shotType?: ShotTypeValue | null,
): NormalizedPhotoEdit {
  const inheritedLook = restrictColorToShotType(general, shotType)
  return {
    ...normalizeEdit(edit),
    color: normalizeColor({ ...inheritedLook, neutral: null, inherited: true }),
  }
}

/**
 * The edit with a colour this shot decided for itself, which is what touching a strip
 * means.
 *
 * It clears `inherited` **even when the numbers do not change**, and that is the point:
 * the column says how the adjustment arrived, so an adjustment the cataloger set by
 * hand stops being inherited the moment she sets it — otherwise the screen would keep
 * saying «heredado de la toma general» over numbers the general shot never had, and
 * «restablecer a lo heredado» would look like it does nothing.
 */
export function withOwnColor(edit: PhotoEdit, color: ColorInput): NormalizedPhotoEdit {
  return {
    ...normalizeEdit(edit),
    color: normalizeColor({ ...normalizeColor(color), inherited: false }),
  }
}

/** True when the colour of this edit was not decided for this shot (`color_inherited`). */
export function isInheritedColor(edit: PhotoEdit): boolean {
  return normalizeColor(edit.color).inherited === true
}
