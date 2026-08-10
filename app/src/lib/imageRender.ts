import { supabase } from './supabase'
import { putSignedFile, type UploadProgressEvent } from './signedUpload'
import {
  BUCKET,
  LEVELS,
  computeTarget,
  derivativeFormat,
  derivativePaths,
  masterDownloadUrl,
  randomSuffix,
  signedUrl,
  type DerivativeFormat,
  type DerivativeType,
  type ImageLevel,
} from './images'
import {
  cropRectInPixels,
  editToColumns,
  editedSize,
  isNoEdit,
  normalizeEdit,
  rotatedSize,
  type CropSource,
  type NormalizedPhotoEdit,
  type PhotoEdit,
  type Size,
} from './imageEdits'
import { applyColorLuts, buildColorLuts, isNoColor, type ColorLuts } from './imageColor'
import { clippingOf, clippingToColumns, type Clipping } from './imageHistogram'
import type { PixelRaster } from './imagePixels'
import {
  applyHomography,
  cornersBoundingBox,
  homographyFromUnitSquare,
  straightenedSize,
  type Homography,
} from './perspective'


/**
 * The part of the photo edit that touches pixels and the store: it draws the
 * rotation, the crop and the perspective on a canvas, applies the colour table,
 * re-encodes the two derivative levels, generates the full-resolution corrected
 * copy and publishes all of it.
 *
 * The arithmetic lives in imageEdits.ts, imageColor.ts, imageHistogram.ts and
 * perspective.ts, without DOM, because that is what the tests can exercise: the
 * test environment has neither canvas nor `createImageBitmap`. What is here is the
 * drawing — and the *policy* around the drawing, which is separated out on purpose
 * so it can be tested: see `CorrectedSurface`, `warpBand` and `planWarpBands`.
 *
 * **Nothing here re-derives the colour.** The tables come from `buildColorLuts`,
 * which is the normative definition (ADR-009), and the count of what they cost from
 * `clippingOf`. A second implementation would drift, and the day it drifted the
 * cataloger would apply something other than what she was shown.
 *
 * **The canonical order is geometry → output resolution → colour**, and it is the
 * same order the Python batch tool reproduces (RF-421). Two consequences that look
 * like inefficiencies and are not:
 *
 *  - the table is **not folded into the bilinear loop** of the perspective warp,
 *    even though it would cost nothing there. Folded in, the colour would be applied
 *    *before* the reduction on the straightened path and *after* it on the crop
 *    path — two canonical orders, both of which Python would have to reproduce, and
 *    a straightened photograph would come out a slightly different colour from the
 *    same photograph merely cropped;
 *  - the rotate-and-crop path is **not degraded**: it is still a single `drawImage`
 *    with a single resample. The table is applied to the small canvas of each level,
 *    never to the master. `getImageData` of a 9248×6936 master is 256 MB of array,
 *    which the phone in the storeroom does not have.
 *
 * The thumbnail and the consultation copy are coloured with **the same table
 * object**, built once per render, so the mosaic and the record cannot show two
 * different colours of the same artwork.
 *
 * The master is never rewritten. It is the archive document (ADR-002), and the
 * whole point of storing the edit as data is that it can be reapplied to the
 * master whenever the derivatives are rebuilt. The corrected copy of RF-420 is a
 * NEW file at a NEW path: see `correctedPath`, which refuses to name anything that
 * even looks like a master.
 */

export interface RenderedLevels {
  thumbnail: Blob
  derivative: Blob
  /** Size of the edited image before downscaling, for the interface to report. */
  width: number
  height: number
  /**
   * What the two Blobs really are, so whoever publishes them names them and
   * declares them accordingly. It travels with the bytes and is not assumed by
   * the caller: `canvas.toBlob` falls back to PNG in silence (see
   * `DerivativeFormat` in images.ts), and this path re-encodes just like the
   * first upload does.
   */
  format: DerivativeFormat
  /**
   * What applying the table cost, measured on the consultation copy, or null when
   * there was no table to apply.
   *
   * Measured on the 2000 px level and not on the thumbnail and not at full
   * resolution, and the column comment of the migration already says the number is
   * written «con el encuadre y el nivel de ese momento». The thumbnail is too small
   * a sample and full resolution would need the `getImageData` of the master that
   * this module exists to avoid. Null means nobody measured, which is not the same
   * as «nothing was lost» — see `clippingToColumns`.
   */
  clipping: Clipping | null
}

/**
 * Puts the source's own coordinates into the rotated frame.
 *
 * One place and not three. The same six lines used to be repeated in every path
 * that draws, and getting them wrong does not fail: it silently frames another part
 * of the photograph, which is the defect this repository has already paid for once
 * with the straightening.
 */
function applyRotation(ctx: CanvasRenderingContext2D, rotated: Size, rotation: number): void {
  if (rotation === 90) {
    ctx.translate(rotated.width, 0)
    ctx.rotate(Math.PI / 2)
  } else if (rotation === 180) {
    ctx.translate(rotated.width, rotated.height)
    ctx.rotate(Math.PI)
  } else if (rotation === 270) {
    ctx.translate(0, rotated.height)
    ctx.rotate(-Math.PI / 2)
  }
}

/** The rectangle the crop cuts out of the rotated photograph, in whole pixels. */
function cropRect(rotated: Size, edit: PhotoEdit): { x: number; y: number; width: number; height: number } {
  return edit.crop
    ? cropRectInPixels(edit.crop, rotated)
    : { x: 0, y: 0, width: rotated.width, height: rotated.height }
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
  const rect = cropRect(rotated, edit)

  const canvas = document.createElement('canvas')
  canvas.width = rect.width
  canvas.height = rect.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('El navegador no ha dado un contexto de dibujo')

  // The crop is a translation of the origin over the already rotated image.
  ctx.translate(-rect.x, -rect.y)
  applyRotation(ctx, rotated, edit.rotation)
  ctx.drawImage(bitmap, 0, 0)
  return canvas
}

/**
 * Longest edge of the canvas the straightening works on.
 *
 * The warp is a loop over pixels, so its cost is the area — and the source cannot
 * be the master. **`getImageData` of a 9248×6936 master is 256 MB of array**, which
 * a phone does not have. So the rotated photograph is first drawn down to this size
 * with `drawImage`, which goes through the GPU and is nearly free, and the loop runs
 * on that.
 *
 * 2400 and not 2000: the consultation copy is 2000 px, and warping at exactly that
 * size would resample twice at the same resolution. A fifth more gives the
 * straightening something to lose without ever upscaling the derivative.
 *
 * Measured on the cataloger's own phone —a Redmi Note 8 Pro, eight cores— the loop
 * costs 89 ms at 2000 px and 247 ms at 4000 px, including reading and writing the
 * pixels. WebGL was 1.76× faster at 2000 px and only 1.20× at 4000, where the
 * texture upload dominates: thirty-eight milliseconds do not pay for two shaders, a
 * lost-context path and a fallback that would be needed anyway.
 *
 * The full-resolution corrected copy (RF-420) does NOT go through this reduction —
 * that is its whole reason for existing — and it is the one that pays the area in
 * bands instead. See `planWarpBands`.
 */
const WARP_LONG_EDGE = 2400

/* ------------------------------------------------------- the perspective warp */

/**
 * The pixels the warp samples from: a patch of the **rotated** photograph.
 *
 * `originX` / `originY` are where the patch starts, in pixels of the rotated
 * photograph, and `scale` how many patch pixels there are per pixel of it. The
 * reduced path passes the whole bounding box at `scale < 1`; the full-resolution
 * corrected copy passes one band's worth of source at `scale = 1`. Everything
 * outside the photograph has to be **white in the patch already** — a corner may
 * legally sit outside the shot (`CORNER_REACH`) and what is not in the shot has to
 * read as blank paper, not as a hole that samples black.
 */
export interface WarpPatch {
  data: Uint8ClampedArray
  width: number
  height: number
  originX: number
  originY: number
  scale: number
}

/** One horizontal strip of the straightened output, and where its pixels come from. */
export interface WarpBand {
  /** Interleaved RGBA of the strip being filled: `out.width` × `rows` pixels. */
  destination: Uint8ClampedArray
  /** Size of the WHOLE straightened output, which is what u and v are fractions of. */
  out: Size
  /** First row of that output this strip holds. */
  from: number
  /** Rows in this strip. */
  rows: number
  homography: Homography
  /** Size of the rotated photograph, which the corners are fractions of. */
  rotated: Size
  patch: WarpPatch
}

/**
 * Fills one horizontal strip of the straightened image: the quadrilateral of the
 * four corners mapped onto a rectangle.
 *
 * The transform is projective and Canvas 2D cannot apply it —`setTransform` takes
 * six numbers and is affine— so the pixels are walked one by one. It walks the
 * DESTINATION and asks each output pixel where it comes from, which is the only way
 * to fill every one of them exactly once; walking the source leaves holes wherever
 * the transform stretches.
 *
 * The bilinear sample is four reads and three interpolations per channel. Nearest
 * neighbour would be cheaper and shows as stair steps on exactly the long straight
 * borders this exists to straighten.
 *
 * **It is a strip and not the image on purpose, and the strip is the unit both
 * paths share**: the reduced derivative asks for one strip covering everything, and
 * the full-resolution copy asks for as many as the device's memory allows (§0.2 of
 * the specification, ADR-010). One implementation, so the two cannot disagree — and
 * a pure function over plain arrays, so it is the one part of the warp that can
 * actually be tested here.
 *
 * `u` and `v` are measured against the WHOLE output and not against the strip: that
 * is what `from` is for, and getting it wrong would tile the same band down the
 * image instead of straightening it.
 */
export function warpBand(band: WarpBand): void {
  const dst = band.destination
  const { patch } = band
  const src = patch.data
  const sw = Math.max(0, Math.trunc(patch.width))
  const sh = Math.max(0, Math.trunc(patch.height))
  const outWidth = Math.max(1, Math.round(band.out.width))
  const outHeight = Math.max(1, Math.round(band.out.height))
  const rows = Math.max(0, Math.trunc(band.rows))

  for (let row = 0; row < rows; row += 1) {
    // The centre of the pixel and not its corner: sampling at the corner shifts the
    // whole image half a pixel, which on a border is visible.
    const v = (band.from + row + 0.5) / outHeight
    for (let x = 0; x < outWidth; x += 1) {
      const u = (x + 0.5) / outWidth
      const point = applyHomography(band.homography, { x: u, y: v })
      // From a fraction of the rotated image to a pixel of the patch.
      const sx = (point.x * band.rotated.width - patch.originX) * patch.scale - 0.5
      const sy = (point.y * band.rotated.height - patch.originY) * patch.scale - 0.5
      const at = (row * outWidth + x) * 4
      dst[at + 3] = 255

      if (!(sx >= 0) || !(sy >= 0) || sx > sw - 1 || sy > sh - 1) {
        // Outside the patch: blank paper. With a band-sized patch this also covers
        // the samples that fall outside the photograph, which is the same answer the
        // reduced path gives from the white fill of its working canvas.
        dst[at] = 255
        dst[at + 1] = 255
        dst[at + 2] = 255
        continue
      }
      const x0 = Math.floor(sx)
      const y0 = Math.floor(sy)
      const x1 = Math.min(sw - 1, x0 + 1)
      const y1 = Math.min(sh - 1, y0 + 1)
      const fx = sx - x0
      const fy = sy - y0
      const i00 = (y0 * sw + x0) * 4
      const i10 = (y0 * sw + x1) * 4
      const i01 = (y1 * sw + x0) * 4
      const i11 = (y1 * sw + x1) * 4
      for (let channel = 0; channel < 3; channel += 1) {
        dst[at + channel] =
          src[i00 + channel]! * (1 - fx) * (1 - fy) +
          src[i10 + channel]! * fx * (1 - fy) +
          src[i01 + channel]! * (1 - fx) * fy +
          src[i11 + channel]! * fx * fy
      }
    }
  }
}

/**
 * Draws the artwork straightened, reduced to `WARP_LONG_EDGE`: the two consultation
 * levels come out of this canvas.
 *
 * `rotated` and not the working canvas is what the corners are measured against:
 * the corners are fractions of the rotated photograph, and the proportion they get
 * measured against has to be that one.
 */
function straightenedCanvas(bitmap: ImageBitmap, edit: PhotoEdit): HTMLCanvasElement {
  const corners = edit.corners
  if (!corners) throw new Error('straightenedCanvas sin esquinas')
  const homography = homographyFromUnitSquare(corners)
  if (!homography) throw new Error('Las cuatro esquinas no forman un cuadrilátero')

  const rotated = rotatedSize({ width: bitmap.width, height: bitmap.height }, edit.rotation)
  const box = cornersBoundingBox(corners)
  const boxPixels = {
    x: box.x * rotated.width,
    y: box.y * rotated.height,
    width: box.width * rotated.width,
    height: box.height * rotated.height,
  }
  const scale = Math.min(1, WARP_LONG_EDGE / Math.max(boxPixels.width, boxPixels.height))

  // ── The working canvas: rotated, cut to the bounding box, scaled down ──
  const work = document.createElement('canvas')
  work.width = Math.max(1, Math.ceil(boxPixels.width * scale))
  work.height = Math.max(1, Math.ceil(boxPixels.height * scale))
  const workCtx = work.getContext('2d', { willReadFrequently: true })
  if (!workCtx) throw new Error('El navegador no ha dado un contexto de dibujo')

  // White underneath, and not transparent: a corner may sit outside the photograph
  // —five photographs of the catalog have sides of the artwork out of frame, and
  // dragging a handle past the edge is the only way to straighten them— and what is
  // not in the shot has to read as blank paper, not as a hole that samples black.
  workCtx.fillStyle = '#ffffff'
  workCtx.fillRect(0, 0, work.width, work.height)

  workCtx.scale(scale, scale)
  workCtx.translate(-boxPixels.x, -boxPixels.y)
  applyRotation(workCtx, rotated, edit.rotation)
  workCtx.drawImage(bitmap, 0, 0)

  // ── The warp ──────────────────────────────────────────────
  const straightened = straightenedSize(corners, rotated)
  const out = document.createElement('canvas')
  out.width = Math.max(1, Math.round(straightened.width * rotated.width * scale))
  out.height = Math.max(1, Math.round(straightened.height * rotated.height * scale))
  const outCtx = out.getContext('2d')
  if (!outCtx) throw new Error('El navegador no ha dado un contexto de dibujo')

  const source = workCtx.getImageData(0, 0, work.width, work.height)
  const destination = outCtx.createImageData(out.width, out.height)
  // One band covering the whole output: at 2400 px it fits, and going through the
  // same function as the full-resolution copy is what keeps the two identical.
  warpBand({
    destination: destination.data,
    out: { width: out.width, height: out.height },
    from: 0,
    rows: out.height,
    homography,
    rotated,
    patch: {
      data: source.data,
      width: work.width,
      height: work.height,
      originX: boxPixels.x,
      originY: boxPixels.y,
      scale,
    },
  })

  outCtx.putImageData(destination, 0, 0)
  return out
}

/* ------------------------------------------------------------------- the table */

/**
 * The colour table of an edit, or null when it does nothing.
 *
 * Null and not a neutral table, and the difference is the whole cost of this
 * feature: with no table there is no `getImageData` and no pass over the pixels, so
 * a photograph that is only rotated or cropped is encoded exactly as it was before
 * the colour existed. An identity table would be a full read-modify-write of every
 * level to change nothing.
 */
export function levelTables(edit: PhotoEdit): ColorLuts | null {
  const { color } = normalizeEdit(edit)
  return isNoColor(color) ? null : buildColorLuts(color)
}

/**
 * The table over the pixels of one level, and what it cost.
 *
 * **The count is taken before the pixels are changed, and the order is the point of
 * the function.** `clippingOf` only counts what THIS table crushed — a pixel that
 * was already pure black does not count — so measuring after the table had been
 * applied in place would exclude precisely the pixels the table just crushed and
 * report zero on the worst correction. One walk to measure and one to write, in that
 * order, over the same buffer.
 *
 * In place, like `applyColorLuts`: the buffer is the `ImageData` of the canvas about
 * to be encoded, and copying a 2000 px level to hand it back would double the peak
 * memory of the export on the phone this runs on.
 */
export function colorLevelPixels(
  pixels: PixelRaster,
  luts: ColorLuts | null | undefined,
): Clipping | null {
  if (!luts) return null
  const clipping = clippingOf(pixels, luts)
  applyColorLuts(luts, pixels.data)
  return clipping
}

/**
 * Encodes one level from an already edited canvas, with the colour applied.
 *
 * It does not reuse the private `downscale` of images.ts because there the
 * source is the master bitmap and here it is a canvas; the rule that matters —
 * the long edge of each level and never upscaling — is shared through
 * `LEVELS` and `computeTarget`, which is where it belongs.
 *
 * The table goes on **after** the reduction, which is the canonical order and also
 * the cheap one: a 400 px thumbnail is 160 000 lookups and the master would be 64
 * million. No `willReadFrequently` on this context on purpose — it is drawn once and
 * read once, and the hint is for canvases read repeatedly; asking for it would push
 * the reduction of a 12 MP master onto the CPU to save one readback.
 */
async function encodeLevel(
  source: HTMLCanvasElement,
  level: ImageLevel,
  type: DerivativeType,
  luts: ColorLuts | null,
): Promise<{ blob: Blob; clipping: Clipping | null }> {
  const { longEdge, quality } = LEVELS[level]
  const target = computeTarget(source.width, source.height, longEdge)

  const canvas = document.createElement('canvas')
  canvas.width = target.width
  canvas.height = target.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('El navegador no ha dado un contexto de dibujo')
  ctx.drawImage(source, 0, 0, target.width, target.height)

  let clipping: Clipping | null = null
  if (luts) {
    const pixels = ctx.getImageData(0, 0, target.width, target.height)
    clipping = colorLevelPixels(pixels, luts)
    ctx.putImageData(pixels, 0, 0)
  }

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (result) => (result ? resolve(result) : reject(new Error('No se pudo codificar la imagen'))),
      // The type the capability probe verified, never a fixed one: asking for
      // WebP where the browser answers PNG is the silent substitution that
      // `derivativeFormat` exists to catch, and re-editing an already uploaded
      // photograph goes through here and not through prepareShot. `quality` is
      // ignored by PNG, which is lossless.
      type,
      quality,
    )
  })
  return { blob, clipping }
}

/** Regenerates the thumbnail and the consultation copy with the edit applied. */
export async function renderEditedLevels(source: Blob, edit: PhotoEdit): Promise<RenderedLevels> {
  // `imageOrientation: 'from-image'` for the same reason as in prepareShot: the
  // EXIF orientation must already be applied before rotating, or the cataloger's
  // quarter turn would start from a different picture than the one on screen.
  const bitmap = await createImageBitmap(source, { imageOrientation: 'from-image' })
  // Probed once per session and shared with the first-upload path, so a
  // photograph and its re-edit cannot end up in two different formats.
  const format = await derivativeFormat()
  // Read as it is stored, once: the rotation normalized to a quarter turn and the
  // crop quantized to what the row can hold, so the pixels drawn here are the
  // pixels the batch tool will draw from the columns.
  const stored = normalizeEdit(edit)
  // ONE table for the two levels. Building it twice would give the same numbers
  // today and is exactly the sort of duplication that stops giving the same numbers.
  const luts = levelTables(stored)
  try {
    // Corners take precedence over the crop, the same order the row has.
    const edited = stored.corners
      ? straightenedCanvas(bitmap, stored)
      : editedCanvas(bitmap, stored)
    const [thumbnail, derivative] = await Promise.all([
      encodeLevel(edited, 'thumbnail', format.type, luts),
      encodeLevel(edited, 'derivative', format.type, luts),
    ])
    return {
      thumbnail: thumbnail.blob,
      derivative: derivative.blob,
      width: edited.width,
      height: edited.height,
      format,
      clipping: derivative.clipping,
    }
  } finally {
    bitmap.close()
  }
}

/* ------------------------------------------- the full-resolution corrected copy */

/**
 * The corrected copy at full resolution (RF-420, ADR-010): the fourth level of a
 * shot, and the one RF-411 hands to a print shop or a curator.
 *
 * It carries **all** the corrections — rotation, crop, perspective and colour —
 * because a copy with the colour fixed and the perspective still skewed is a file
 * somebody has to correct again by hand, and then what was sent was homework.
 *
 * Suffix, extension and content type are the contract with the Python batch tool
 * (`scripts/copias-corregidas/paths.py`), which has to be able to name the same
 * family of files for the rows this device could not finish.
 */
export const CORRECTED_SUFFIX = '_corrected'
export const CORRECTED_EXTENSION = 'jpg'
export const CORRECTED_CONTENT_TYPE = 'image/jpeg'

/**
 * JPEG and not WebP, and 0,92.
 *
 * The destination of this file is somebody else's computer — a print shop, a
 * curator, a publisher — and JPEG is what opens everywhere without a question. At
 * 0,92 what it loses is not visible on a reproduction, and the archive document is
 * not this file: the master keeps its own bytes and its own extension, untouched.
 */
export const CORRECTED_QUALITY = 0.92

/** The piece that names an archive master. Reading it is how this module knows what it must never write. */
const MASTER_SUFFIX = '_master'

/**
 * Refuses a path that is a master, or that merely looks like one.
 *
 * Three checks and none is redundant. The first is the rule of the schema
 * (`images_corrected_not_master`): the two paths are not the same file. The second
 * refuses anything shaped like a master, which is what protects against a master
 * this row does not know about. The third refuses anything that is not shaped like a
 * corrected copy, so a bug in the naming cannot quietly point the PUT somewhere
 * else.
 *
 * It runs **before anything is signed**, and that is the whole point: by the time
 * the database says no, the file has already been uploaded. Signing a PUT over a
 * `…_master.jpg` is the one operation in this application that cannot be undone.
 */
export function checkNotMaster(path: string, masterPath?: string | null): void {
  if (masterPath && path === masterPath) {
    throw new Error(
      `La ruta calculada para la copia corregida es la del máster (${path}). El máster no se reescribe nunca.`,
    )
  }
  const name = path.slice(path.lastIndexOf('/') + 1)
  if (name.includes(MASTER_SUFFIX)) {
    throw new Error(`La ruta calculada para la copia corregida tiene forma de máster (${path}).`)
  }
  if (!name.endsWith(`${CORRECTED_SUFFIX}.${CORRECTED_EXTENSION}`)) {
    throw new Error(`La ruta calculada no es la de una copia corregida (${path}).`)
  }
}

/**
 * The path of a new corrected copy, checked against the master's.
 *
 * A **fresh random base**, like `basePath` in images.ts, and never the base of the
 * master: re-editing writes a new path and never overwrites the old one, because the
 * service worker caches images by path with `CacheFirst` and overwriting a path
 * would serve the old bytes from the phone forever. The superseded copy stays in the
 * store — never a real deletion.
 *
 * `suffix` exists for the test, so the collision can be forced instead of waited
 * for.
 */
export function correctedPath(
  catalogId: string,
  masterPath?: string | null,
  suffix = randomSuffix(),
): string {
  if (!catalogId) {
    // Not a master in danger: a row that does not say which artwork it belongs to.
    // The error has to say which of the two things happened.
    throw new Error('No se puede nombrar la copia corregida sin id de catalogación')
  }
  const path = `${catalogId}/${catalogId}_${suffix}${CORRECTED_SUFFIX}.${CORRECTED_EXTENSION}`
  checkNotMaster(path, masterPath)
  return path
}

/**
 * Pixels the patch of one strip may cost, as an RGBA array.
 *
 * Eight million pixels is 32 MB, against the 256 MB of the whole master that this
 * whole design exists to avoid. It is deliberately not smaller, and the reason is
 * measured: **the patch a strip needs is much taller than the strip**, because a
 * horizontal line of the straightened output maps to a *slanted* line of the
 * photograph, and a canvas can only be drawn into a rectangle. With a real keystone —
 * a top edge five hundredths of the height out of level — the bounding box of a
 * single output row is already a hundred and fifty pixels tall. A tighter budget
 * would not save memory, it would multiply the number of strips and redraw the master
 * once per strip: at thirty rows a strip, a 9248 px master would be blitted two
 * hundred and fifty times.
 */
export const MAX_BAND_PIXELS = 8_000_000

/**
 * Pixels a strip of the COLOUR pass aims for.
 *
 * Smaller than the warp's ceiling because this one is read and written back, so it
 * costs two arrays, and because there is no patch here: the strip is the strip. Eight
 * megabytes each way is nothing on the phone and it never has to grow.
 */
export const TARGET_BAND_PIXELS = 2_000_000

/** Rows of a strip of `width` pixels. Never zero: one row is always attempted. */
export function bandRows(width: number, budget = TARGET_BAND_PIXELS): number {
  const columns = Math.max(1, Math.trunc(Number.isFinite(width) ? width : 1))
  return Math.max(1, Math.floor(Math.max(1, budget) / columns))
}

/** A strip of the straightened output and the patch of the photograph it needs. */
export interface WarpBandPlan {
  from: number
  rows: number
  /** Patch of the ROTATED photograph, in whole pixels. May start outside it. */
  box: { x: number; y: number; width: number; height: number }
}

/**
 * Which patch of the rotated photograph a strip of the straightened output needs.
 *
 * A projective map takes straight lines to straight lines, so the image of the
 * strip's rectangle is a quadrilateral and the four mapped corners bound every
 * sample inside it. One pixel of margin on each side for the bilinear tap, and whole
 * pixels because that is what a canvas has.
 *
 * It is **not clamped to the photograph**: a corner may legally sit outside the shot
 * (`CORNER_REACH`), and the patch is drawn on a white-filled canvas so what is
 * outside reads as blank paper — the same answer the reduced path gives. Clamping
 * would instead blend the edge of the photograph with white half a pixel in, and the
 * corrected copy would not match the consultation copy at the seam.
 *
 * Null when the corners do not describe a usable quadrilateral: a non-finite mapped
 * point means the strip crosses the horizon of the homography, and there is nothing
 * to draw for it.
 */
export function warpBandBox(
  from: number,
  rows: number,
  out: Size,
  homography: Homography,
  rotated: Size,
): { x: number; y: number; width: number; height: number } | null {
  const outHeight = Math.max(1, Math.round(out.height))
  const v0 = from / outHeight
  const v1 = (from + rows) / outHeight
  const xs: number[] = []
  const ys: number[] = []
  for (const v of [v0, v1]) {
    for (const u of [0, 1]) {
      const point = applyHomography(homography, { x: u, y: v })
      const x = point.x * rotated.width
      const y = point.y * rotated.height
      if (!Number.isFinite(x) || !Number.isFinite(y)) return null
      xs.push(x)
      ys.push(y)
    }
  }
  const x0 = Math.floor(Math.min(...xs)) - 1
  const y0 = Math.floor(Math.min(...ys)) - 1
  const x1 = Math.ceil(Math.max(...xs)) + 1
  const y1 = Math.ceil(Math.max(...ys)) + 1
  return { x: x0, y: y0, width: Math.max(1, x1 - x0), height: Math.max(1, y1 - y0) }
}

/**
 * The strips the full-resolution straightening is done in, or null when this
 * geometry cannot be done in strips at all.
 *
 * Every row of the output belongs to exactly one strip, in order and with no gaps:
 * a missing strip is a white band across a printed reproduction.
 *
 * It starts from the **largest** strip the budget allows and halves it until its
 * source patch fits, rather than starting small: the patch is not the strip — with a
 * keystone correction a strip of the output comes from a slanted wedge of the
 * photograph — so what is expensive is not the pixels of a strip but how many times
 * the master gets redrawn, one blit per strip. Null when a single row still does not
 * fit, which is a photograph this device cannot straighten at full resolution, and
 * then the copy stays pending instead of being quietly reduced.
 */
export function planWarpBands(
  out: Size,
  homography: Homography,
  rotated: Size,
  budget = MAX_BAND_PIXELS,
): WarpBandPlan[] | null {
  const width = Math.max(1, Math.round(out.width))
  const height = Math.max(1, Math.round(out.height))
  const initial = Math.min(height, bandRows(width, budget))
  const plans: WarpBandPlan[] = []
  let from = 0
  while (from < height) {
    let rows = Math.min(initial, height - from)
    let box = warpBandBox(from, rows, out, homography, rotated)
    while (box && rows > 1 && box.width * box.height > budget) {
      rows = Math.ceil(rows / 2)
      box = warpBandBox(from, rows, out, homography, rotated)
    }
    if (!box || box.width * box.height > budget) return null
    plans.push({ from, rows, box })
    from += rows
  }
  return plans
}

/**
 * What came of trying to build the corrected copy. Three states, which are the three
 * the row can hold (see the migration): it is not needed, it is here, or it is
 * missing and that is recorded.
 */
export type CorrectedCopy =
  | { status: 'NOT_NEEDED' }
  | { status: 'READY'; blob: Blob; width: number; height: number }
  | { status: 'PENDING'; reason: string }

/**
 * The surface the corrected copy is built on, as the five operations the policy
 * needs — and no more.
 *
 * An interface and not the canvas itself, because **the policy is the part that must
 * be tested and the drawing is the part that cannot be**: the failure this guards
 * against is a canvas that comes out blank without throwing anything, and the only
 * way to have a test for «it stayed pending instead of uploading a blank file» is to
 * be able to hand the policy a surface that fails that way. See
 * `imageRender.test.ts`.
 *
 * Every operation answers whether it worked instead of throwing, for the same
 * reason: the interesting failure here does not throw.
 */
export interface CorrectedSurface {
  readonly width: number
  readonly height: number
  /** Opaque white over the whole surface. False when the browser refused. */
  prime(): boolean
  /** The four channels at a pixel, or null when the surface cannot be read. */
  read(x: number, y: number): [number, number, number, number] | null
  /** All of the geometry — rotation, crop, perspective — at full resolution. */
  paint(): boolean
  /**
   * The colour table over everything already painted, **band by band**.
   *
   * The surface holds its own table rather than being handed one, because which
   * table it is is not a decision of the policy: it is the one `levelTables` built
   * for the two reduced levels, so the print copy and the mosaic cannot come out
   * different colours. A photograph with no colour adjustment does nothing here and
   * succeeds.
   */
  color(): boolean
  /** The bytes. Null when the encoder refused. */
  encode(): Promise<Blob | null>
}

/**
 * Where the surface gets probed: the four corners and a grid of nine.
 *
 * The corners are not decoration. An oversized canvas is not partly wrong, it is
 * entirely blank, and the far corner is the pixel a device that allocated less than
 * it promised fails on first. The nine interior points are what tell a blank surface
 * from a photograph: after the geometry has been drawn, every one of them has to be
 * opaque, and at least one of them has to be something other than pure white.
 */
export function probePoints(width: number, height: number): { x: number; y: number }[] {
  const w = Math.max(1, Math.trunc(width))
  const h = Math.max(1, Math.trunc(height))
  const last = { x: w - 1, y: h - 1 }
  const points: { x: number; y: number }[] = [
    { x: 0, y: 0 },
    { x: last.x, y: 0 },
    { x: 0, y: last.y },
    last,
  ]
  for (const fy of [0.25, 0.5, 0.75]) {
    for (const fx of [0.25, 0.5, 0.75]) {
      points.push({
        x: Math.min(last.x, Math.floor(w * fx)),
        y: Math.min(last.y, Math.floor(h * fy)),
      })
    }
  }
  return points
}

/** The tail every «pendiente» sentence carries: what is safe, and what happens next. */
const PENDING_TAIL =
  'La copia a resolución completa queda pendiente. Las de consulta y el máster están a salvo.'

function pending(reason: string): CorrectedCopy {
  return { status: 'PENDING', reason: `${reason} ${PENDING_TAIL}` }
}

/**
 * Builds the corrected copy on a surface, and refuses to hand back anything it has
 * not verified (RF-420, ADR-010).
 *
 * The order of the four checks is the substance of this function:
 *
 *  1. **Probe before trusting.** The surface is filled white and then read back at
 *     thirteen points. The maximum area of a canvas is limited by the device and
 *     **beyond it the canvas comes out blank without throwing any error** — there is
 *     no exception to catch, so the only way to know is to write a pixel and read it.
 *  2. Draw, and then colour.
 *  3. **Verify afterwards anyway.** Every probe point has to be opaque and at least
 *     one has to be something other than pure white. A surface that swallowed the
 *     drawing reads as transparent black; a surface that swallowed everything reads
 *     as untouched white.
 *  4. Only then encode. **A blank file is never uploaded and the resolution is never
 *     quietly reduced**: if it does not fit, it does not go, and the row says so.
 *
 * The accepted false positive is deliberate and worth writing down: a photograph
 * whose output really is pure white at all thirteen points would be reported as
 * pending. It would be regenerated from a computer, which costs a minute. The other
 * mistake — believing a blank canvas — sends a print shop a white sheet of an
 * artwork, and nobody finds out until it is printed.
 */
export async function correctedCopyFrom(
  surface: CorrectedSurface,
  expected?: Size,
): Promise<CorrectedCopy> {
  const width = Math.trunc(surface.width)
  const height = Math.trunc(surface.height)
  if (!(width > 0) || !(height > 0)) {
    return pending('La copia corregida no tiene un tamaño válido que dibujar.')
  }
  const size = `${width} × ${height}`
  // The surface has to be the size that was asked for. A browser may CLAMP a canvas
  // it will not give in full —Firefox stops at 32 767 pixels a side— and then the
  // copy would come out perfect, and smaller than the master, and nothing would say
  // so. Reducing the resolution in silence is exactly what RF-420 forbids, so a
  // surface that did not obey stays pending.
  if (expected && (Math.round(expected.width) !== width || Math.round(expected.height) !== height)) {
    return pending(
      `Este dispositivo ha recortado el lienzo de la copia corregida a ${size} píxeles en vez de ` +
        `${Math.round(expected.width)} × ${Math.round(expected.height)}, y la resolución no se reduce en silencio.`,
    )
  }
  const points = probePoints(width, height)

  if (!surface.prime()) {
    return pending(`Este dispositivo no ha podido preparar un lienzo de ${size} píxeles.`)
  }
  for (const at of points) {
    const pixel = surface.read(at.x, at.y)
    if (!pixel || pixel[0] !== 255 || pixel[1] !== 255 || pixel[2] !== 255 || pixel[3] !== 255) {
      return pending(
        `Este dispositivo no puede con un lienzo de ${size} píxeles: lo ha dado por bueno y ha salido en blanco.`,
      )
    }
  }

  if (!surface.paint()) {
    return pending(`No se ha podido dibujar la copia corregida de ${size} píxeles.`)
  }
  if (!surface.color()) {
    return pending(
      `No se ha podido aplicar el ajuste de color a la copia corregida de ${size} píxeles.`,
    )
  }

  let painted = false
  for (const at of points) {
    const pixel = surface.read(at.x, at.y)
    if (!pixel || pixel[3] !== 255) {
      return pending(`La copia corregida de ${size} píxeles ha salido en blanco, así que no se sube.`)
    }
    if (pixel[0] !== 255 || pixel[1] !== 255 || pixel[2] !== 255) painted = true
  }
  if (!painted) {
    return pending(`La copia corregida de ${size} píxeles ha salido en blanco, así que no se sube.`)
  }

  const blob = await surface.encode()
  if (!blob || blob.size <= 0) {
    return pending(`Este dispositivo no ha podido codificar la copia corregida de ${size} píxeles.`)
  }
  return { status: 'READY', blob, width, height }
}

/** The three columns of the row that describe the corrected copy. */
export interface CorrectedColumns {
  corrected_path: string | null
  corrected_bytes: number | null
  corrected_pending: boolean
}

/** What the row has to be told, once the copy has been built and uploaded or not. */
export type CorrectedOutcome =
  | { status: 'NOT_NEEDED' }
  | { status: 'PENDING'; reason: string }
  | { status: 'UPLOADED'; path: string; bytes: number }

/**
 * The outcome as the three columns.
 *
 * The three states of the migration, and the two impossible combinations its
 * constraints refuse are impossible here by construction: the path and the size
 * travel together (`images_corrected_copy_pair`) and pending excludes having a path
 * (`images_corrected_pending_exclusive`).
 *
 * `NOT_NEEDED` writes `corrected_pending: false` and not «leave it alone»: a
 * photograph whose correction has just been undone had a pending copy a second ago,
 * and leaving the flag on would keep a queue entry for a file nobody needs. Every
 * save states the whole truth about this file.
 */
export function correctedColumns(outcome: CorrectedOutcome): CorrectedColumns {
  if (outcome.status === 'UPLOADED') {
    return {
      corrected_path: outcome.path,
      corrected_bytes: Math.max(1, Math.trunc(outcome.bytes)),
      corrected_pending: false,
    }
  }
  return {
    corrected_path: null,
    corrected_bytes: null,
    corrected_pending: outcome.status === 'PENDING',
  }
}

/**
 * A real canvas as a `CorrectedSurface`.
 *
 * `willReadFrequently` here and not in `encodeLevel`, and the difference is real:
 * this surface is read and written band by band from start to finish, so a
 * GPU-backed one would pay a round trip per band. The price is a software resample
 * in `paint`, which at full resolution is exact anyway — the crop path does not
 * scale at all.
 */
function canvasSurface(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  bitmap: ImageBitmap,
  edit: NormalizedPhotoEdit,
  luts: ColorLuts | null,
): CorrectedSurface {
  const rotated = rotatedSize({ width: bitmap.width, height: bitmap.height }, edit.rotation)

  function paintStraightened(corners: NonNullable<NormalizedPhotoEdit['corners']>): boolean {
    const homography = homographyFromUnitSquare(corners)
    if (!homography) return false
    const out = { width: canvas.width, height: canvas.height }
    const plan = planWarpBands(out, homography, rotated)
    if (!plan) return false
    // One working canvas, resized per strip: assigning `width` clears it and resets
    // the transform, which is exactly the state each strip needs.
    const work = document.createElement('canvas')
    for (const band of plan) {
      work.width = band.box.width
      work.height = band.box.height
      const workCtx = work.getContext('2d', { willReadFrequently: true })
      if (!workCtx) return false
      // Blank paper under what falls outside the shot, as in the reduced path.
      workCtx.fillStyle = '#ffffff'
      workCtx.fillRect(0, 0, work.width, work.height)
      workCtx.translate(-band.box.x, -band.box.y)
      applyRotation(workCtx, rotated, edit.rotation)
      workCtx.drawImage(bitmap, 0, 0)
      const patch = workCtx.getImageData(0, 0, work.width, work.height)
      const destination = ctx.createImageData(out.width, band.rows)
      warpBand({
        destination: destination.data,
        out,
        from: band.from,
        rows: band.rows,
        homography,
        rotated,
        patch: {
          data: patch.data,
          width: work.width,
          height: work.height,
          originX: band.box.x,
          originY: band.box.y,
          // Full resolution: this is the whole reason the copy exists.
          scale: 1,
        },
      })
      ctx.putImageData(destination, 0, band.from)
    }
    return true
  }

  return {
    get width() {
      return canvas.width
    },
    get height() {
      return canvas.height
    },
    prime() {
      try {
        ctx.setTransform(1, 0, 0, 1, 0, 0)
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        return true
      } catch {
        return false
      }
    },
    read(x, y) {
      try {
        const { data } = ctx.getImageData(x, y, 1, 1)
        return [data[0] ?? 0, data[1] ?? 0, data[2] ?? 0, data[3] ?? 0]
      } catch {
        return null
      }
    },
    paint() {
      try {
        if (edit.corners) return paintStraightened(edit.corners)
        const rect = cropRect(rotated, edit)
        ctx.save()
        ctx.setTransform(1, 0, 0, 1, 0, 0)
        // The crop is a translation of the origin over the already rotated image,
        // and the whole geometry is one `drawImage`: at full resolution it is a copy,
        // not a resample.
        ctx.translate(-rect.x, -rect.y)
        applyRotation(ctx, rotated, edit.rotation)
        ctx.drawImage(bitmap, 0, 0)
        ctx.restore()
        return true
      } catch {
        return false
      }
    },
    color() {
      if (!luts) return true
      try {
        ctx.setTransform(1, 0, 0, 1, 0, 0)
        // Strips and never the whole surface: a `getImageData` of a 64 megapixel
        // master is 256 MB of array, which is measured and impossible on the phone.
        const rows = bandRows(canvas.width)
        for (let y = 0; y < canvas.height; y += rows) {
          const take = Math.min(rows, canvas.height - y)
          const band = ctx.getImageData(0, y, canvas.width, take)
          applyColorLuts(luts, band.data)
          ctx.putImageData(band, 0, y)
        }
        return true
      } catch {
        return false
      }
    },
    encode() {
      return new Promise<Blob | null>((resolve) => {
        try {
          canvas.toBlob((blob) => resolve(blob), CORRECTED_CONTENT_TYPE, CORRECTED_QUALITY)
        } catch {
          resolve(null)
        }
      })
    },
  }
}

/**
 * Builds the corrected copy of a photograph at full resolution, from the master.
 *
 * `edit` is the WHOLE transformation stored on the row, absolute over the master —
 * not what the cataloger just did. Re-editing replaces this file and never composes
 * onto it, which is the same invariant the parameters themselves keep.
 *
 * With no corrections there is no copy: null on the row and not a duplicate of the
 * master, which is already what RF-411 delivers. That branch answers **without
 * decoding anything**, which is also what makes it testable here.
 */
export async function renderCorrectedCopy(source: Blob, edit: PhotoEdit): Promise<CorrectedCopy> {
  const stored = normalizeEdit(edit)
  if (isNoEdit(stored)) return { status: 'NOT_NEEDED' }

  const bitmap = await createImageBitmap(source, { imageOrientation: 'from-image' })
  try {
    const size = editedSize({ width: bitmap.width, height: bitmap.height }, stored)
    const canvas = document.createElement('canvas')
    canvas.width = size.width
    canvas.height = size.height
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) {
      return pending('El navegador no ha dado un contexto de dibujo para la copia corregida.')
    }
    // `size` again as the expected size, so a canvas the browser quietly clamped is
    // caught instead of producing a smaller copy that looks right.
    return await correctedCopyFrom(
      canvasSurface(canvas, ctx, bitmap, stored, levelTables(stored)),
      size,
    )
  } finally {
    bitmap.close()
  }
}

/**
 * Asks the Edge function for a signed URL and PUTs the corrected copy.
 *
 * The same signing path as the master (RNF-110): a full-resolution copy is of the
 * order of the master, so it goes to Backblaze B2 and not to Supabase Storage, and
 * the function is the only thing that knows the credentials. The Content-Type of the
 * PUT has to repeat the signed one exactly or the signature does not validate.
 */
async function uploadCorrectedCopy(
  path: string,
  blob: Blob,
  onProgress?: TransferListener,
): Promise<void> {
  const { data, error } = await supabase.functions.invoke('sign-file', {
    body: { operation: 'upload', path, contentType: CORRECTED_CONTENT_TYPE },
  })
  if (error) throw new Error(`firmando la subida: ${error.message}`)
  const url = (data as { url?: string } | null)?.url
  if (!url) throw new Error('la función de firma no ha devuelto ninguna URL')
  // `putSignedFile` and not `fetch`: it is the same signed PUT, but over XHR, which is the
  // only thing that can say how much has been uploaded. They are up to 19 MB.
  const result = await putSignedFile(url, blob, CORRECTED_CONTENT_TYPE, onProgress)
  if (!result.ok) throw new Error(`HTTP ${result.status}`)
}

/**
 * Whoever listens to how much of a file has travelled, going up or coming down.
 *
 * A null `total` is «how much it weighs is not known», and it is a legitimate state: a
 * compressed response carries no `content-length`. Whoever paints then decides to spin instead of
 * inventing a percentage.
 */
export type TransferListener = (event: UploadProgressEvent) => void

/* --------------------------------------------------------------- the two paths */

/**
 * The download, counted as it arrives.
 *
 * The body is read in chunks instead of asking for `.blob()` all at once, and for a
 * concrete reason: the master is 2 to 8 MB from a store with poor coverage, and whoever
 * presses the icon is left looking at the photograph without knowing whether anything is happening. With the
 * `content-length` total the ring advances; without it —a compressed or
 * chunked response does not carry it— what has arrived is counted and the total goes null, which is what
 * makes the ring spin instead of faking a percentage.
 *
 * If the body cannot be read in chunks, it falls back to the usual `.blob()`: being left
 * with no photograph for not being able to draw a bar would be the worst possible trade.
 */
async function fetchBlob(url: string, onProgress?: TransferListener): Promise<Blob> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`HTTP ${response.status}`)

  const header = response.headers.get('content-length')
  const total = header === null ? null : Number(header)
  if (!response.body || onProgress === undefined) return response.blob()

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let loaded = 0
  onProgress({ loaded: 0, total })
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    loaded += value.byteLength
    onProgress({ loaded, total })
  }
  return new Blob(chunks as BlobPart[], { type: response.headers.get('content-type') ?? '' })
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
export async function editSource(
  row: {
    master_path: string | null
    derivative_path: string
  },
  onProgress?: TransferListener,
): Promise<EditSource> {
  if (row.master_path) {
    try {
      const url = await masterDownloadUrl(row.master_path)
      return { blob: await fetchBlob(url, onProgress), fromMaster: true }
    } catch {
      /* falls back to the consultation copy below */
    }
  }
  const url = await signedUrl(row.derivative_path)
  if (!url) throw new Error('No se ha podido abrir ninguna copia de la fotografía')
  return { blob: await fetchBlob(url, onProgress), fromMaster: false }
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
 *    keeps, what the printed-catalog pipeline will reproduce, and what the
 *    full-resolution corrected copy carries.
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
  /**
   * Where this framing came from: drawn by hand, accepted from the suggestion as it
   * came, or suggested and then adjusted. Undefined leaves the column unknown, which
   * is what a caller that cannot tell should say.
   */
  cropSource?: CropSource
  /**
   * Whether `source` really is the archive master.
   *
   * The full-resolution corrected copy (RF-420) can only come from the master, and
   * **undefined is read as «no»**: a copy built from the 2000 px consultation copy
   * would be a corrected copy at a quietly reduced resolution, which is precisely
   * what ADR-010 forbids. So a caller that does not say leaves the copy pending, and
   * pending is recoverable — the batch tool has the master (RF-421). Saying «yes»
   * wrongly is not recoverable.
   */
  sourceIsMaster?: boolean
  /**
   * The master's own path, when the caller has the row at hand. Belt and braces for
   * `checkNotMaster`: the generated name can never collide with a master's, and this
   * is what proves it rather than arguing it.
   */
  masterPath?: string | null
  /**
   * How much of the full-resolution copy has been uploaded, which is this path's
   * big file: up to 19 MB. The two small copies go through Supabase's
   * storage, which cannot count, so for those there is no
   * progress and the ring spins while they last.
   */
  onProgress?: TransferListener
}): Promise<{
  thumbnailPath: string
  derivativePath: string
  /** What became of the full-resolution copy, so the interface can say it. */
  corrected: CorrectedOutcome
}> {
  const { catalogId, imageId, source, render, store, cropSource } = params
  const levels = await renderEditedLevels(source, render)
  // Named after what was really encoded, and not after what was asked for: on a
  // browser that cannot compress these are PNG, and calling them `.webp` would
  // fill the bucket with objects that lie about their content — the same defect
  // the first upload already guards against (see uploadShot).
  const target = derivativePaths(catalogId, undefined, levels.format.extension)

  const uploads: [string, Blob][] = [
    [target.thumbnail, levels.thumbnail],
    [target.derivative, levels.derivative],
  ]
  for (const [path, content] of uploads) {
    const { error } = await supabase.storage.from(BUCKET).upload(path, content, {
      contentType: levels.format.type,
      upsert: false,
    })
    if (error) throw new Error(`Subiendo ${path}: ${error.message}`)
  }

  // ── The fourth level, and it never takes the save down with it ──
  //
  // Everything about the corrected copy is best-effort by design: it is a file of
  // the order of the master —up to 19 MB— generated and uploaded from a storeroom
  // with poor coverage. What must not happen is that the framing and the colour the
  // cataloger just spent ten minutes on fail to be saved because a 19 MB PUT timed
  // out. So every failure here becomes `corrected_pending`, which is a row that says
  // «hace falta y falta» and a queue a computer empties later (RF-421).
  const corrected = await buildAndUploadCorrected(params)

  // The row last, as in uploadShot: if something fails midway, orphan files
  // remain — harmless — instead of a row pointing at files that never arrived.
  const { error } = await supabase
    .from('images')
    .update({
      thumbnail_path: target.thumbnail,
      derivative_path: target.derivative,
      // The fourteen colour columns travel inside this spread (see `editToColumns`),
      // and they describe the WHOLE transformation from the master, not what was
      // drawn on this source.
      ...editToColumns(store),
      // The consequence of the colour, and not the decision: what applying the table
      // cost in shadow and highlight detail, measured on the level that was just
      // encoded. Null on both when there was no table, which reads as «nobody
      // measured» and not as «nothing was lost».
      ...clippingToColumns(levels.clipping),
      ...correctedColumns(corrected),
      // Where the framing came from. It is written on every save and never left
      // alone: a photograph reframed by hand after having accepted a suggestion is
      // no longer «suggested», and the whole point of the column is that a future
      // measurement of the detector does not have to infer this from a residue of
      // two ten-thousandths, which is what measuring it cost this time.
      crop_source: cropSource ?? null,
    })
    .eq('image_id', imageId)
  if (error) throw new Error(`Guardando el encuadre: ${error.message}`)

  return { thumbnailPath: target.thumbnail, derivativePath: target.derivative, corrected }
}

/**
 * Builds the corrected copy and uploads it, turning every failure into «pending».
 *
 * Separated from `savePhotoEdit` so the reading of it is one thing at a time, and so
 * the rule that matters is stated once: **nothing in here throws**. A pending copy is
 * a minute of somebody's time; a framing that failed to save is the work of the
 * afternoon.
 */
async function buildAndUploadCorrected(params: {
  catalogId: string
  source: Blob
  store: PhotoEdit
  sourceIsMaster?: boolean
  masterPath?: string | null
  onProgress?: TransferListener
}): Promise<CorrectedOutcome> {
  const stored = normalizeEdit(params.store)
  if (isNoEdit(stored)) return { status: 'NOT_NEEDED' }
  if (params.sourceIsMaster !== true) {
    return {
      status: 'PENDING',
      reason:
        'Aquí se ha trabajado sobre la copia de consulta, así que la de resolución completa queda pendiente.',
    }
  }
  try {
    const copy = await renderCorrectedCopy(params.source, stored)
    if (copy.status !== 'READY') {
      return copy.status === 'NOT_NEEDED' ? { status: 'NOT_NEEDED' } : copy
    }
    // Named and checked before anything is signed.
    const path = correctedPath(params.catalogId, params.masterPath)
    await uploadCorrectedCopy(path, copy.blob, params.onProgress)
    return { status: 'UPLOADED', path, bytes: copy.blob.size }
  } catch (e) {
    return {
      status: 'PENDING',
      reason:
        `No se ha podido guardar la copia a resolución completa (${
          e instanceof Error ? e.message : String(e)
        }). Queda pendiente y se puede generar después desde un ordenador. ` +
        'Las copias de consulta se han guardado y el máster de archivo sigue intacto.',
    }
  }
}
