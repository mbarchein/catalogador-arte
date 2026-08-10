import { REC709, grayFromRgb, type Rgb } from './imageColor'
import { cropRectInPixels, rotateCrop, type Crop } from './imageEdits'
import type { PixelRaster } from './imagePixels'
import { rotateCorners, type Corners } from './perspective'

/**
 * What a photograph measures: the histogram of the chosen frame, the percentiles
 * the automatic reads off it, and how much shadow and highlight detail a given
 * table would cost.
 *
 * **This module is the condition for offering the black and white points at all**
 * (§3.1). Getting a crop wrong announces itself — the painting comes out cut — and
 * getting the exposure wrong is visible on the photograph. Getting the black point
 * wrong is neither: a shadow flattened into pure black still looks like a shadow,
 * and what is missing only shows up years later, to whoever zooms in looking for
 * the craquelure that used to be there. So the two controls that can destroy detail
 * are shown next to the histogram and next to the count of what they cost, and the
 * count is stored with the row (`color_clipped_low` / `color_clipped_high`) so a
 * conservation report can audit the sacrifice instead of trusting a tally made
 * afterwards.
 *
 * **It measures the FRAME, never the whole photograph**, and that is the reason
 * this module takes a region and not just an array of pixels. A painting in a
 * storeroom is photographed against a wall: the gotelé is lighter than the artwork,
 * the floor darker, and both are outside what gets catalogued. Measured over the
 * whole file, the 99,9th percentile belongs to the wall, the median to whatever
 * happens to occupy the most pixels, and the automatic ends up correcting the room.
 * The frame is the crop —or the four corners— the cataloger already chose, and it
 * is the only surface whose numbers describe the artwork.
 *
 * The region arrives in the coordinates it is **stored** in, which are fractions of
 * the ROTATED image (see the column comments of the migration), while the raster is
 * the photograph as it decoded. Undoing the quarter turn is this module's job and
 * not the caller's: doing it at the call site is the sibling of the incident where
 * the straightening was computed with the sides swapped, and there is only one
 * place here to get it right.
 *
 * Corners are measured **in place, over the source pixels inside the
 * quadrilateral**, and not over the straightened result. Straightening resamples:
 * it moves pixels around and averages neighbours, but it does not invent tones, so
 * the distribution of what is inside the quadrilateral is the distribution of what
 * comes out of it — while warping half a million pixels on every drag of a slider
 * is exactly what the phone in the storeroom cannot afford.
 *
 * No DOM, no canvas and no network, like imageEdits.ts, imageColor.ts and
 * perspective.ts: this is the arithmetic, and the arithmetic is the part that can
 * be tested. What decodes pixels lives in imagePixels.ts and what paints them in
 * imageRender.ts.
 *
 * The colour arithmetic is **not** re-derived here: the tables come from
 * `buildColorLuts` and the luminance of the `gray` step from `grayFromRgb`, both of
 * imageColor.ts, which is the normative definition. A second implementation of the
 * chain would drift, and the day it drifted the histogram would describe a
 * photograph other than the one being written.
 */

/* ---------------------------------------------------------------- constants */

/** One bin per 8-bit code: the histogram is of codes, not of buckets of codes. */
export const HISTOGRAM_BINS = 256

/**
 * The two percentiles the automatic reads (§3.4), as fractions.
 *
 * Not the minimum and the maximum: a single hot pixel, a speck of dust or the JPEG
 * ringing around the frame reaches both ends of almost every photograph, and the
 * black point would then never move. A thousandth of the frame is small enough to
 * be noise and large enough that at 700 px of analysis raster it is still some
 * hundreds of pixels.
 */
export const AUTO_PERCENTILE_LOW = 0.001
export const AUTO_PERCENTILE_HIGH = 0.999

/**
 * Luminance codes that count as the central third (§3.4).
 *
 * The white balance is read there and nowhere else: near black every channel is
 * noise and a cast cannot be told from the sensor's floor, and near white the phone
 * has already clipped at least one channel, which makes any bright pixel look
 * neutral by amputation.
 */
export const CENTRAL_THIRD = { low: 85, high: 170 } as const

/**
 * How far a pixel's channels may spread, **relative to its own maximum**, and still
 * count as grey.
 *
 * Relative and not absolute, matching `autoColorFrom`: fifteen codes of spread are
 * a faint cast on a light grey and a violent one on a dark grey, so one absolute
 * threshold would either reject the first or accept the second.
 */
export const ACHROMATIC_SPREAD = 0.06

/**
 * Share of the frame that has to be believably grey before anything may speak about
 * the dominant cast (§3.4).
 *
 * Half a percent of a 700 px raster is a couple of thousand pixels — a patch of
 * wall, a piece of cardboard, a card. Below that, whatever grey the statistics find
 * is one object's colour and not the light of the room, and a suggestion drawn from
 * it looks exactly like a measurement to whoever reads it. **Una sugerencia
 * equivocada es peor que ninguna.**
 */
export const ACHROMATIC_FRACTION = 0.005

/**
 * Below this percentage of clipped pixels there is no warning.
 *
 * Half a percent of specular highlights on a varnish and a handful of pixels in the
 * deepest folds are what any photograph of a painting carries, and warning about
 * them on every photograph is how a warning stops being read. Above it, the number
 * is shown with the count and the two controls that caused it.
 */
export const CLIPPING_NOTICE_PERCENT = 0.5

/**
 * Ceiling and floor of the two stored percentages.
 *
 * `numeric(4,2)` holds two integer digits: an even 100 % — every pixel of the frame
 * crushed — does not fit, and the row would be REFUSED at the end of a correction
 * that took the cataloger ten minutes. It is reported as 99,99, which is beyond any
 * threshold anybody would read anyway, and the migration's own comment already
 * promises «0,00 a 99,99».
 *
 * The floor is the mirror image: a real loss of a few pixels rounds to 0,00, and
 * 0,00 stored next to lost detail reads as «nothing was lost». One hundredth is the
 * smallest thing that column can say, and it says «some, and less than a hundredth
 * of a percent».
 */
export const MAX_CLIPPED_PERCENT = 99.99
export const MIN_CLIPPED_PERCENT = 0.01

/** Below this alpha a pixel is not part of the photograph and is not measured. */
const OPAQUE_ENOUGH = 8

/* -------------------------------------------------------------------- types */

/**
 * The frame whose pixels get measured: the stored geometry, as the editor holds it.
 *
 * A `PhotoEdit` satisfies this structurally on purpose — the editor passes the edit
 * it is already showing and gets the histogram of what is on screen. `corners` wins
 * over `crop` where both are present, which is the same precedence `editedSize`
 * applies: once four corners exist, the rectangle is the box they used to be.
 */
export interface Frame {
  /** Quarter turn the crop and the corners are expressed in. */
  rotation?: number
  /** Rectangle in fractions of the rotated image. */
  crop?: Crop | null
  /** Four corners in fractions of the rotated image. Wins over `crop`. */
  corners?: Corners | null
}

/**
 * Counts per code: the three channels and the luminance, 256 bins each.
 *
 * `Int32Array` and not `Uint32Array` or an array of numbers: a 12 MP frame fits in
 * a signed 32-bit count with room to spare, the buffer is 4 KB, and the bins are
 * read as numbers everywhere without a conversion.
 */
export interface Histogram {
  r: Int32Array
  g: Int32Array
  b: Int32Array
  /** Rec. 709 luminance **on the codes**: see `measureFrame` for why not linear. */
  luminance: Int32Array
  /** Pixels counted. Zero means nothing could be measured, not «all black». */
  count: number
}

/** Everything one pass over the frame can answer. */
export interface FrameMeasure {
  histogram: Histogram
  /** Pixels measured, the denominator of every fraction here. */
  count: number
  /** Pixels that are believably grey (§3.4). */
  achromatic: number
  /** `achromatic / count`, or 0 when nothing was measured. */
  achromaticFraction: number
  /**
   * Median colour of the believable greys, or null when there were none.
   *
   * The **median** and not the mean, for the reason `patchMedian` gives: one
   * specular or one dust pixel drags a mean and leaves a median where it was.
   * Ready to hand to `neutralFromSample`, which is what turns it into a
   * temperature and a tint.
   */
  achromaticMedian: Rgb | null
  /** Luminance code at `AUTO_PERCENTILE_LOW`. */
  percentileLow: number
  /** Luminance code at `AUTO_PERCENTILE_HIGH`. */
  percentileHigh: number
  /** Median luminance code, which is what the automatic aims at 0,45. */
  median: number
}

/**
 * Three lookup tables, structurally: the `ColorLuts` of imageColor satisfies this.
 *
 * Structural and not the imported type so that a test —or a future caller with a
 * table that did not come from the colour model— can pass three arrays of 256
 * numbers without borrowing a type from a module it does not otherwise use.
 */
export interface ColorTables {
  r: ArrayLike<number>
  g: ArrayLike<number>
  b: ArrayLike<number>
  /** Whether the Rec. 709 luminance step follows the tables. */
  gray?: boolean
}

/** What applying a table would cost, in pixels and in the two stored percentages. */
export interface Clipping {
  /** Pixels measured. */
  count: number
  /** Pixels the table crushes to pure black that were not already there. */
  low: number
  /** Pixels the table burns to pure white that were not already there. */
  high: number
  /** `low` as a percentage, as `color_clipped_low` stores it. */
  lowPercent: number
  /** `high` as a percentage, as `color_clipped_high` stores it. */
  highPercent: number
}

/** The pair of columns, so the caller writing the row does not format them again. */
export interface ClippingColumns {
  color_clipped_low: number | null
  color_clipped_high: number | null
}

/* ------------------------------------------------------------------ helpers */

function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function clamp(value: number, min: number, max: number): number {
  if (max < min) return min
  return Math.min(Math.max(value, min), max)
}

/** Any number into an 8-bit code, which is what indexes every table here. */
function code8(value: unknown): number {
  return clamp(Math.round(finite(value, 0)), 0, 255)
}

/** Whole pixels, and never negative: a decoder that reports 0.5 rows has none. */
function wholeSize(value: unknown): number {
  return Math.max(0, Math.trunc(finite(value, 0)))
}

/** One count more in a bin. Written like `imageColor`'s for the same reason. */
function bump(bins: Int32Array, code: number): void {
  bins[code] = (bins[code] ?? 0) + 1
}

/* ------------------------------------------------------------------- region */

/**
 * The rows and columns to walk, and the test a pixel has to pass inside them.
 *
 * Half-open on both axes (`x0 <= x < x1`), like every pixel loop in this
 * repository. `inside` is null for a rectangle — the bounding box IS the region,
 * and paying a callback per pixel to answer «yes» half a million times is the kind
 * of thing that turns a slider into a slideshow.
 */
interface Region {
  x0: number
  y0: number
  x1: number
  y1: number
  inside: ((x: number, y: number) => boolean) | null
}

/**
 * Whether a point is inside a quadrilateral, by the sign of the cross product on
 * the four edges.
 *
 * All four the same sign, and the two orientations accepted: the stored corners run
 * clockwise on screen, but a caller that hands them counter-clockwise gets its
 * region measured instead of an empty histogram, and there is nothing here that
 * depends on which way round they were. A point exactly on an edge scores zero and
 * counts as inside, which keeps two adjacent frames from both dropping the pixels
 * of the border they share.
 *
 * It assumes convexity, which the schema already guarantees (`isConvexQuadrilateral`
 * refuses the rest at the finger and the database refuses it at the row): over a
 * crossed quadrilateral this test describes a different shape, not a wrong number.
 */
function insideQuad(quad: readonly { x: number; y: number }[], x: number, y: number): boolean {
  let positive = 0
  let negative = 0
  for (let i = 0; i < 4; i += 1) {
    const a = quad[i]!
    const b = quad[(i + 1) % 4]!
    const cross = (b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x)
    if (cross > 0) positive += 1
    else if (cross < 0) negative += 1
  }
  return positive === 0 || negative === 0
}

/**
 * The stored frame turned into pixels of the raster.
 *
 * The quarter turn is undone here, once: the geometry is stored in fractions of the
 * rotated image and the raster is unrotated, so the region travels through
 * `rotateCrop` / `rotateCorners` with the **opposite** rotation. Both are the
 * functions the editor already uses to turn a selection with its photograph, which
 * is what keeps this from becoming a second, divergent piece of the same arithmetic.
 *
 * Anything unusable —no frame, a non-finite corner, a rectangle that rounds to
 * nothing— falls back to the whole raster rather than to an empty measurement. A
 * histogram of the whole photograph is a worse measurement; an empty one is a blank
 * panel, and it would be indistinguishable from a photograph that could not be
 * decoded.
 */
function resolveRegion(width: number, height: number, frame: Frame | null | undefined): Region {
  const full: Region = { x0: 0, y0: 0, x1: width, y1: height, inside: null }
  if (!frame) return full
  // Negative because the stored fractions are in the rotated frame and the pixels
  // are not: this maps the selection back onto the photograph as it decoded.
  const turn = -finite(frame.rotation, 0)

  if (frame.corners) {
    const turned = rotateCorners(frame.corners, turn)
    const quad = [turned.nw, turned.ne, turned.se, turned.sw].map((point) => ({
      x: finite(point?.x, Number.NaN) * width,
      y: finite(point?.y, Number.NaN) * height,
    }))
    if (quad.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y))) {
      const xs = quad.map((point) => point.x)
      const ys = quad.map((point) => point.y)
      // The bounding box is clamped to the raster because a corner may legally sit
      // outside the photograph (CORNER_REACH): what falls outside is white the
      // renderer paints, not pixels anybody measured.
      const x0 = clamp(Math.floor(Math.min(...xs)), 0, width)
      const y0 = clamp(Math.floor(Math.min(...ys)), 0, height)
      const x1 = clamp(Math.ceil(Math.max(...xs)), x0, width)
      const y1 = clamp(Math.ceil(Math.max(...ys)), y0, height)
      if (x1 > x0 && y1 > y0) {
        return { x0, y0, x1, y1, inside: (x, y) => insideQuad(quad, x, y) }
      }
    }
  }

  if (frame.crop) {
    // The same whole-pixel rounding the renderer uses, so the histogram is measured
    // over exactly the pixels that end up in the file and not over a rectangle one
    // row taller.
    const rect = cropRectInPixels(rotateCrop(frame.crop, turn), { width, height })
    return {
      x0: rect.x,
      y0: rect.y,
      x1: Math.min(width, rect.x + rect.width),
      y1: Math.min(height, rect.y + rect.height),
      inside: null,
    }
  }

  return full
}

/**
 * Every pixel of the frame, once, as three codes.
 *
 * One walk shared by the histogram and by the clipping count so that the two can
 * never disagree about which pixels they are talking about — including the two
 * exclusions, which are rules and not defence: a transparent pixel is not part of
 * the photograph (the derivative of a straightened photo has corners of nothing),
 * and a buffer that ends early is measured as far as it goes rather than throwing
 * over a truncated decode.
 *
 * Returns how many pixels it visited, which is the denominator of everything.
 */
function walkFrame(
  raster: PixelRaster | null | undefined,
  frame: Frame | null | undefined,
  visit: (r: number, g: number, b: number) => void,
): number {
  const width = wholeSize(raster?.width)
  const height = wholeSize(raster?.height)
  const data = raster?.data
  if (!data || width < 1 || height < 1) return 0

  const region = resolveRegion(width, height, frame)
  let count = 0
  for (let y = region.y0; y < region.y1; y += 1) {
    const row = y * width * 4
    for (let x = region.x0; x < region.x1; x += 1) {
      // The centre of the pixel and not its corner: on the edge of a quadrilateral
      // that is the difference between measuring the pixel the renderer draws and
      // measuring its neighbour.
      if (region.inside && !region.inside(x + 0.5, y + 0.5)) continue
      const at = row + x * 4
      if (at + 4 > data.length) continue
      if (finite(data[at + 3], 255) < OPAQUE_ENOUGH) continue
      count += 1
      visit(code8(data[at]), code8(data[at + 1]), code8(data[at + 2]))
    }
  }
  return count
}

/* ---------------------------------------------------------------- histogram */

/**
 * The histogram and every statistic §3.4 needs, in one pass over the frame.
 *
 * Luminance **on the codes**, with the Rec. 709 weights and no linearization, and
 * that is deliberate: the black point, the white point and the midtones are the
 * three parameters read off this histogram, and all three work on encoded sRGB —
 * step 6 and step 7 of the canonical chain. A histogram in linear light would be a
 * correct measurement of a different thing, and the code the cataloger reads under
 * her finger would not be the code the slider moves. (It is also not the luminance
 * of `luminanceOf` in imagePixels.ts, which truncates because a gradient does not
 * care, nor that of `grayFromRgb`, which is photometric because a black and white
 * photograph does.)
 *
 * Everything expensive is a histogram and not a list: the medians of the grey
 * candidates come out of three more arrays of 256 counters instead of a growing
 * array of samples, which is what keeps this affordable on the frame of a whole
 * photograph while a slider is being dragged.
 */
export function measureFrame(
  raster: PixelRaster | null | undefined,
  frame?: Frame | null,
): FrameMeasure {
  const r = new Int32Array(HISTOGRAM_BINS)
  const g = new Int32Array(HISTOGRAM_BINS)
  const b = new Int32Array(HISTOGRAM_BINS)
  const luminance = new Int32Array(HISTOGRAM_BINS)
  const greyRed = new Int32Array(HISTOGRAM_BINS)
  const greyGreen = new Int32Array(HISTOGRAM_BINS)
  const greyBlue = new Int32Array(HISTOGRAM_BINS)
  let achromatic = 0

  const count = walkFrame(raster, frame, (red, green, blue) => {
    bump(r, red)
    bump(g, green)
    bump(b, blue)
    const y = clamp(Math.round(REC709.r * red + REC709.g * green + REC709.b * blue), 0, 255)
    bump(luminance, y)
    if (y < CENTRAL_THIRD.low || y > CENTRAL_THIRD.high) return
    const max = Math.max(red, green, blue)
    const min = Math.min(red, green, blue)
    if (max <= 0 || (max - min) / max >= ACHROMATIC_SPREAD) return
    achromatic += 1
    bump(greyRed, red)
    bump(greyGreen, green)
    bump(greyBlue, blue)
  })

  const histogram: Histogram = { r, g, b, luminance, count }
  return {
    histogram,
    count,
    achromatic,
    achromaticFraction: count > 0 ? achromatic / count : 0,
    achromaticMedian:
      achromatic > 0
        ? {
            r: percentileFrom(greyRed, achromatic, 0.5),
            g: percentileFrom(greyGreen, achromatic, 0.5),
            b: percentileFrom(greyBlue, achromatic, 0.5),
          }
        : null,
    percentileLow: percentileFrom(luminance, count, AUTO_PERCENTILE_LOW),
    percentileHigh: percentileFrom(luminance, count, AUTO_PERCENTILE_HIGH),
    median: percentileFrom(luminance, count, 0.5),
  }
}

/** Just the histogram, for whoever only wants to draw it. */
export function histogramOf(
  raster: PixelRaster | null | undefined,
  frame?: Frame | null,
): Histogram {
  return measureFrame(raster, frame).histogram
}

/**
 * Smallest code whose cumulative count reaches `fraction` of the pixels.
 *
 * The nearest-rank definition, which is the one that makes sense on 256 discrete
 * bins: interpolating between codes would answer 37,4 to a question whose only
 * possible answers are the values a slider can hold. With nothing measured it
 * answers 0, and the caller has `count` to tell that apart from a black frame — the
 * histogram panel says «no se han podido medir los píxeles del encuadre» rather
 * than drawing a spike at zero.
 *
 * The cumulative count has to be **positive** and not merely to have reached the
 * target, which is what makes the two ends symmetric: fraction 0 answers the
 * smallest code that actually has pixels, as fraction 1 answers the largest, instead
 * of answering 0 for a frame whose darkest pixel is at 90.
 */
export function percentileFrom(
  bins: ArrayLike<number>,
  count: number,
  fraction: number,
): number {
  const total = Math.max(0, finite(count, 0))
  if (total <= 0) return 0
  const target = clamp(finite(fraction, 0), 0, 1) * total
  let cumulative = 0
  for (let code = 0; code < HISTOGRAM_BINS; code += 1) {
    cumulative += Math.max(0, finite(bins[code], 0))
    if (cumulative > 0 && cumulative >= target) return code
  }
  return HISTOGRAM_BINS - 1
}

/** Median luminance code of a histogram: what `exposure` is computed against. */
export function medianLuminance(histogram: Histogram | null | undefined): number {
  if (!histogram) return 0
  return percentileFrom(histogram.luminance, histogram.count, 0.5)
}

/**
 * Whether this frame has enough believable grey for anything to speak about the
 * dominant cast (§3.4).
 *
 * The automatic asks this before proposing a temperature, and keeps quiet when the
 * answer is no. The threshold and the reason are `ACHROMATIC_FRACTION`; the words
 * the cataloger reads are not here, because the sentence belongs to whoever
 * declined and not to whoever counted.
 */
export function hasBelievableGray(measure: FrameMeasure | null | undefined): boolean {
  if (!measure || measure.count <= 0 || !measure.achromaticMedian) return false
  return measure.achromaticFraction >= ACHROMATIC_FRACTION
}

/* ----------------------------------------------------------------- clipping */

/** One code through one table, falling back to the identity where there is none. */
function through(table: ArrayLike<number> | null | undefined, code: number): number {
  if (!table) return code
  const value = table[code]
  return value === undefined ? code : code8(value)
}

/**
 * How many pixels of the frame a table crushes to black or burns to white.
 *
 * **Only what this table did**: a pixel that was already pure black does not count
 * as crushed by the adjustment. Without that exclusion a night scene, or the black
 * background half the catalogue is photographed against, would report thirty
 * percent of crushed pixels under the neutral table — a warning that fires on
 * photographs nobody touched teaches the cataloger to ignore it, and the number
 * stored on the row would describe the artwork instead of the correction. The
 * corollary is the invariant worth testing: the identity table clips nothing, ever.
 *
 * Pure black means **all three** output channels at zero, not any one of them.
 * Balancing a strong cast normalizes the gains to a maximum of 1, so the weakest
 * channel of a dark pixel touches zero routinely while the pixel keeps its
 * modelling in the other two: counting that as lost detail would raise an alarm on
 * every correctly balanced photograph. What is lost for good is the pixel that
 * comes out (0,0,0) — a hole where a fold used to be.
 *
 * With `gray` on there is only one channel that matters, the luminance the step
 * produces, and it is asked of `grayFromRgb` rather than recomputed: the count has
 * to describe the file that gets written.
 */
export function clippingOf(
  raster: PixelRaster | null | undefined,
  tables: ColorTables | null | undefined,
  frame?: Frame | null,
): Clipping {
  let low = 0
  let high = 0
  const count = walkFrame(raster, frame, (red, green, blue) => {
    const outR = through(tables?.r, red)
    const outG = through(tables?.g, green)
    const outB = through(tables?.b, blue)
    let black: boolean
    let white: boolean
    if (tables?.gray === true) {
      const gray = grayFromRgb(outR, outG, outB)
      black = gray === 0
      white = gray === 255
    } else {
      black = outR === 0 && outG === 0 && outB === 0
      white = outR === 255 && outG === 255 && outB === 255
    }
    if (black && !(red === 0 && green === 0 && blue === 0)) low += 1
    if (white && !(red === 255 && green === 255 && blue === 255)) high += 1
  })

  return {
    count,
    low,
    high,
    lowPercent: clippedPercent(low, count),
    highPercent: clippedPercent(high, count),
  }
}

/** A count as the percentage its column can hold: see MAX/MIN_CLIPPED_PERCENT. */
function clippedPercent(part: number, total: number): number {
  if (total <= 0 || part <= 0) return 0
  const rounded = Math.round((part / total) * 10000) / 100
  if (rounded < MIN_CLIPPED_PERCENT) return MIN_CLIPPED_PERCENT
  return Math.min(rounded, MAX_CLIPPED_PERCENT)
}

/**
 * The two columns of the row.
 *
 * **Zero is a measurement and null is the absence of one**, which is the opposite
 * convention to the colour parameters, where null is the identity: a lost pixel is
 * not a setting, it is what happened, and «se aplicó y no se perdió nada» has to be
 * distinguishable from «nadie lo midió». So a frame with no measurable pixels
 * writes null on both, and everything else writes its number, including 0,00.
 */
export function clippingToColumns(clipping: Clipping | null | undefined): ClippingColumns {
  if (!clipping || clipping.count <= 0) {
    return { color_clipped_low: null, color_clipped_high: null }
  }
  return {
    color_clipped_low: clipping.lowPercent,
    color_clipped_high: clipping.highPercent,
  }
}

/** `3,20`: the decimal comma of es-ES, which is what the panel prints. */
function percentText(value: number): string {
  return finite(value, 0).toFixed(2).replace('.', ',')
}

/**
 * What to tell the cataloger about what this adjustment costs, or null when there
 * is nothing to warn about.
 *
 * It names the control that caused it and the direction that undoes it, because a
 * warning that only states a percentage leaves the reader with a number and no
 * move. Null below `CLIPPING_NOTICE_PERCENT` and null when nothing could be
 * measured: the panel that could not measure says so itself, and saying it twice in
 * two voices is worse than saying it once.
 */
export function clippingNotice(clipping: Clipping | null | undefined): string | null {
  if (!clipping || clipping.count <= 0) return null
  const crushed = clipping.lowPercent >= CLIPPING_NOTICE_PERCENT
  const burnt = clipping.highPercent >= CLIPPING_NOTICE_PERCENT
  if (crushed && burnt) {
    return `Con este ajuste, el ${percentText(clipping.lowPercent)}% de los píxeles se queda en negro puro y el ${percentText(clipping.highPercent)}% en blanco puro: en esas zonas ya no hay detalle. Si importan, conviene bajar los negros y subir los blancos.`
  }
  if (crushed) {
    return `Con este ajuste, el ${percentText(clipping.lowPercent)}% de los píxeles se queda en negro puro y pierde el detalle de las sombras. Si esa zona importa, conviene bajar los negros.`
  }
  if (burnt) {
    return `Con este ajuste, el ${percentText(clipping.highPercent)}% de los píxeles se queda en blanco puro y pierde el detalle de las luces. Si esa zona importa, conviene subir los blancos.`
  }
  return null
}

/* --------------------------------------------------------------- svg drawing */

/** How the bins are turned into heights. See `histogramPath` for why sqrt wins. */
export type HistogramScale = 'sqrt' | 'linear'

export interface HistogramPathOptions {
  /** Width of the box the path is drawn in. Default 256: one unit per code. */
  width?: number
  /** Height of the box. Default 100, so the caller can read the path as percent. */
  height?: number
  /**
   * The count that reaches the top. Default: the tallest bin of these bins.
   *
   * Passing one shared peak is how the three channels get drawn to the same scale:
   * three paths each normalized to their own maximum would show a neutral grey
   * photograph as three different shapes, which is precisely the reading the
   * cataloger uses to spot a cast.
   */
  peak?: number
  scale?: HistogramScale
}

/** The tallest bin across every histogram given: the shared normalizer. */
export function histogramPeak(...bins: (ArrayLike<number> | null | undefined)[]): number {
  let peak = 0
  for (const set of bins) {
    if (!set) continue
    for (let i = 0; i < set.length; i += 1) {
      const value = Math.max(0, finite(set[i], 0))
      if (value > peak) peak = value
    }
  }
  return peak
}

/**
 * The histogram as an SVG path, as a pure function of the counts.
 *
 * A function and not a component so that what gets drawn can be tested: this
 * repository has no canvas and no DOM in its tests, and the shape of a histogram is
 * exactly the sort of thing that silently comes out upside down. The caller wraps it
 * in an `<svg viewBox="0 0 width height">` and fills it.
 *
 * **The square root by default, and it is a display scale and never a
 * measurement.** A photograph of a painting against a wall puts a quarter of its
 * pixels in a handful of codes: on a linear scale that spike is the whole chart and
 * everything else — including whether the shadows reach the end, which is the one
 * thing the black point is read for — flattens into the baseline. The square root
 * keeps the tail visible while preserving the order of the bins, so a taller bar
 * still means more pixels. Nothing measured here comes off this path: the
 * percentiles are computed from the counts.
 *
 * A staircase and not a polyline through the centres: a bin is a count of a code,
 * not a sample of a continuous curve, and a diagonal between two codes draws pixels
 * that do not exist. Collinear vertices are dropped, which on the long flat runs of
 * a real histogram is most of them.
 *
 * The empty string when there is nothing to draw — no bins, or every bin at zero —
 * and not a flat line along the baseline, which is what a measured photograph of
 * pure black would look like. The panel shows its own sentence instead of a chart
 * that says something false.
 */
export function histogramPath(
  bins: ArrayLike<number> | null | undefined,
  options: HistogramPathOptions = {},
): string {
  const total = bins ? Math.trunc(finite(bins.length, 0)) : 0
  if (total < 1) return ''
  const width = Math.max(1, finite(options.width, HISTOGRAM_BINS))
  const height = Math.max(1, finite(options.height, 100))
  const given = finite(options.peak, 0)
  const peak = given > 0 ? given : histogramPeak(bins)
  if (!(peak > 0)) return ''
  const sqrt = options.scale !== 'linear'

  const round = (value: number) => Math.round(value * 100) / 100
  const step = width / total
  const points: { x: number; y: number }[] = [{ x: 0, y: round(height) }]
  for (let i = 0; i < total; i += 1) {
    const ratio = clamp(Math.max(0, finite(bins![i], 0)) / peak, 0, 1)
    const top = round(height - (sqrt ? Math.sqrt(ratio) : ratio) * height)
    points.push({ x: round(i * step), y: top })
    points.push({ x: round((i + 1) * step), y: top })
  }
  points.push({ x: round(width), y: round(height) })

  const shape: { x: number; y: number }[] = []
  for (const point of points) {
    const last = shape[shape.length - 1]
    if (last && last.x === point.x && last.y === point.y) continue
    shape.push(point)
  }
  const kept = shape.filter((point, i) => {
    const before = shape[i - 1]
    const after = shape[i + 1]
    if (!before || !after) return true
    if (before.x === point.x && point.x === after.x) return false
    if (before.y === point.y && point.y === after.y) return false
    return true
  })

  const parts = kept.map((point, i) => `${i === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
  return `${parts.join(' ')} Z`
}
