import {
  neutralFromSample,
  referenceTrustsGray,
  srgbToLinear,
  type ColorReference,
  type Neutral,
  type Rgb,
} from './imageColor'
import { cropRectInPixels, rotateCrop } from './imageEdits'
import { percentileFrom, type Frame } from './imageHistogram'
import { luminanceOf, type PixelRaster } from './imagePixels'
import { CORNER_KEYS, rotateCorners } from './perspective'

/**
 * Finding a grey target in a photograph, when there is one (RF-418, §4).
 *
 * **A plain grey is indistinguishable from a grey wall.** That is the whole premise
 * and it is not a limitation to be engineered away: nothing in a flat patch of
 * pixels says whether it is a calibrated card or the gotelé behind the artwork, and
 * a detector that claimed otherwise would be inventing a measurement. So what is
 * looked for here is not a grey. It is a **staircase**: patches that are uniform,
 * that are contiguous, that are aligned with each other, that share one
 * chromaticity, and whose tones hold the white / mid / black relation. A wall has no
 * steps; a card has, and so does a sheet printed at home. That is the discriminator,
 * and it is the reason this module recognizes both without knowing either.
 *
 * **No product is encoded here**, and no measurement in centimetres. Every rule is
 * relative — a ratio of tones, a ratio of patch sizes, a share of the frame — so a
 * three-patch card bought in a shop, a five-step wedge printed on A5 and the same
 * card photographed from twice as far away all pass the same tests. There is no
 * table of reflectances to match against, because matching one would be encoding a
 * product and would reject the next one.
 *
 * **The card / sheet distinction is NOT detectable from the image.** Household ink
 * and a calibrated card differ in whether their grey is really neutral, and no
 * arithmetic over the pixels of one photograph can tell them apart: the cast of the
 * bulb and the cast of the ink arrive multiplied together. So the distinction is a
 * **declaration by the cataloger**, it comes in as `kind`, and what this module
 * reports is only «a staircase was detected». Nobody may build a certainty on top of
 * that parameter: it is testimony, not measurement, which is exactly why
 * `TARGET_PRINT` is recorded and then **not believed for the cast**
 * (`referenceTrustsGray`), while it is perfectly good as evidence that a target was
 * in the frame.
 *
 * **It never decides anything.** It returns candidates, best first, for the
 * interface to point at over the photograph and offer. It applies nothing, it writes
 * nothing, and below `MIN_CONFIDENCE` it returns nothing at all rather than
 * something weak: the measurement of the border detector is the precedent and it is
 * unambiguous — demanding real evidence took the false positives from 20 to 8 and
 * was «el cambio más rentable de todo el banco»
 * (`docs/revision/deteccion-de-bordes-medicion.md:219-220`). **Una sugerencia
 * equivocada es peor que ninguna**, and here it would be worse than in the crop: a
 * wrong crop is visible at a glance, a wrong neutral silently repaints the colour of
 * the artwork with the colour of whatever was mistaken for a card.
 *
 * **The search happens OUTSIDE the artwork**, which is why the frame comes in. A
 * target is laid next to the work, never on top of it, and the inside of the
 * quadrilateral is full of exactly what would fool this: flat fields of paint,
 * gradients, a signature on a light ground. Excluding it costs one mask and removes
 * the whole class.
 *
 * **What this cannot tell apart, written down so nobody assumes otherwise.** Three
 * shelves of equal height in three shades of grey, or a stack of grey boxes beside
 * the artwork, satisfy every rule here: they are uniform, contiguous, aligned, equal
 * in size, they share one chromaticity and their tones step. No arithmetic over
 * luminance separates that from a card — it is the same finding the border detector
 * arrived at about screenshots and reverses, «ninguna aritmética sobre la luminancia
 * separa eso», and the answer there was the same as here: the machine offers and the
 * person decides. What keeps the remaining confusions rare is that a target is a
 * small object beside the work (`MAX_TARGET_AREA`) and that whoever laid one there
 * knows she did.
 *
 * **What it costs, measured**: 43 ms over a 700 x 700 analysis raster on a desktop,
 * 65 ms when the wall is heavy with noise, of which the second axis is 18 — a target
 * may be laid either way and both directions have to be scanned. It runs **once**,
 * when the colour panel opens over an already decoded raster, and never per frame:
 * the same raster `readAnalysisPixels` returns and the border detector and the
 * histogram already share. Nothing here is on the path of a slider.
 *
 * Pure over pixels, no DOM, no canvas and no network, like imageEdits.ts,
 * perspective.ts, imageColor.ts and imageHistogram.ts: this is the arithmetic, and
 * the arithmetic is the part that can be tested with synthetic rasters. The colour
 * arithmetic is **not** re-derived — the linearization and the inversion of a sample
 * into a temperature come from imageColor.ts, which is the normative definition, and
 * the cheap luminance proxy from imagePixels.ts.
 */

/* ---------------------------------------------------------------- constants */

/** Shortest side, in pixels, worth looking at. Below it nothing can be measured. */
const MIN_SIZE = 16

/**
 * Fewest patches that make a staircase, and the sanity ceiling.
 *
 * Three because three is what the relation white / mid / black needs and what the
 * cheapest card carries. **Two would be a step and not a staircase**, and a step is
 * what the edge of any object in the room produces: a shelf against a wall, a sheet
 * of paper on a table, the frame of the artwork. The third patch is the whole
 * difference between «something changes here» and «somebody put a graded scale in
 * the frame», and it is why this refuses to look for two.
 */
export const MIN_PATCHES = 3
const MAX_PATCHES = 16

/**
 * Smallest patch, as a fraction of the axis it is measured along.
 *
 * Two percent of a 700 px analysis raster is fourteen pixels a side, so three
 * patches are forty-two: a target smaller than that in the frame is also a target
 * with too few pixels for its median to mean anything, and asking the cataloger to
 * take the photograph again is the honest answer. Relative and not absolute so the
 * rule survives a different raster size.
 */
export const MIN_PATCH_SIDE = 0.02

/**
 * How far the codes inside one patch may spread and still be one patch.
 *
 * It is both the segmentation tolerance and the definition of «uniform», and having
 * ONE number for both is deliberate: a patch is what the scan groups together, so
 * grouping with one tolerance and judging with another would accept patches the
 * scan could never have found. Eight codes is above JPEG blocking and 8-bit noise on
 * a flat surface and well below any step a printed wedge carries.
 */
const PATCH_SPREAD = 8

/**
 * Smallest difference between neighbouring patches that counts as a step.
 *
 * This is what keeps a **gradient** out, and a gradient is what a wall lit from one
 * side actually is. Any smooth ramp segments into runs whose neighbours differ by
 * about `PATCH_SPREAD`, so a threshold comfortably above it turns «the wall gets
 * lighter towards the window» into no steps at all instead of into a staircase of
 * thirty patches. Twenty codes is also roughly the smallest step a person would
 * bother printing.
 *
 * Exported because the printable sheet of §4 is generated by this application and
 * has to satisfy the rules of this detector: a wedge printed with steps below this
 * would not be recognized by the code that asked for it.
 */
export const MIN_STEP = 20

/**
 * Smallest ratio, **in linear light**, between the lightest and the darkest patch.
 *
 * In linear light because that is where a reflectance ratio lives, and because a
 * ratio is what survives the exposure: the same card in shadow gives the same
 * ratio two stops down, which is precisely the case §4 has to keep working (a
 * target in shade while the artwork is lit). Five is about 2,3 stops — less than any
 * white-to-black pair of a real target and more than the range of two shades of the
 * same wall.
 */
export const MIN_TONE_RATIO = 5

/**
 * Where an interior step has to sit between the two extremes, as a share of the
 * span **in codes**.
 *
 * In codes and not in linear light because that is how anybody lays out a wedge: by
 * eye, in even visual steps. The band is wide on purpose — a mid grey of 18 %
 * reflectance lands at 0,31 of the span and an evenly-spaced print lands at 0,50,
 * and pinning either would be encoding a product. What the band does refuse is the
 * degenerate case: an interior patch pressed against one of the extremes is not a
 * step, it is the same patch measured twice with a seam in the middle.
 *
 * **Divided by the number of interior steps**, because with more of them each one
 * has less room: three patches leave one step the whole middle of the span, while a
 * wedge of six shares that span between four, and the outermost of the four
 * legitimately sits close to an extreme. Measured on a five-step wedge spaced by
 * reflectance, the darkest interior step lands at 0,18 of the span — inside the
 * scaled band and only just inside the fixed one. `MIN_STEP` is what guarantees the
 * separation in that case, and this rule only refuses the degenerate one.
 */
const MID_SHARE = { min: 0.15, max: 0.85 } as const

/** The band for one interior step of a staircase of `patches` patches. */
function midShareBand(patches: number): { min: number; max: number } {
  const min = MID_SHARE.min / Math.max(1, patches - 2)
  return { min, max: 1 - min }
}

/**
 * How unequal the patches may be, as a ratio of their sizes along the axis.
 *
 * A graded scale is drawn with equal cells, whoever drew it, and that is a
 * structural property and not a product: it is what tells a card from the accidental
 * sequence «wide wall, narrow shadow, wide floor». Two and a half is generous enough
 * for the perspective of a card lying at an angle on a table and for a seam counted
 * into one patch and not into its neighbour.
 *
 * Exported for the same reason as `MIN_STEP`: the printable sheet has to draw its
 * patches equal, and its test can say so against this number.
 */
export const MAX_PATCH_SIZE_RATIO = 2.5

/**
 * Share of the band's own thickness that has to actually show the staircase.
 *
 * The line-support rule of the border detector, for the same reason and with the
 * same tolerance for interruption: a real target does get crossed — by the shadow of
 * a hand, by the cable of a lamp, by a reflection — and demanding every scanline
 * would throw away good targets. Demanding none would accept any three noisy rows
 * that happen to line up once.
 */
const SUPPORT_SHARE = 0.6

/**
 * Longest run of scanlines a band may skip before it is two bands.
 *
 * It exists so that the pixels of an interruption stay **inside** the patch that
 * gets measured. That is what makes the reflection test bite: a specular blob makes
 * its own scanlines fail, and if the band split around it the two halves would each
 * be clean and the blob would be measured by nobody. Fifteen percent of the frame
 * across is also enough separation to tell two targets apart, which is the other
 * thing this decides.
 */
const MAX_GAP_SHARE = 0.15

/** How far patch boundaries may wander between scanlines and still be aligned. */
const ALIGN_SHARE = 0.02

/**
 * Largest share of the frame a staircase may occupy.
 *
 * **A target is a small object laid beside the artwork**, and that is a fact about
 * how it is used, not about any product: nobody photographs a work over a grey scale
 * the size of the wall. Without this bound the strongest false positive of all passes
 * every other rule — a wall lit in three even bands, or three shelves of equal height
 * in three shades of grey, which are uniform, aligned, equal in size, share one
 * chromaticity and step in tone. A third of the frame is far more than any target and
 * far less than a background.
 */
const MAX_TARGET_AREA = 0.35

/**
 * Share of a patch's pixels that has to sit within `PATCH_SPREAD` of its median.
 *
 * Measured over the whole patch box and not along one scanline: what is being asked
 * is whether the patch is flat as a surface, and a fold, a shadow edge or a curled
 * corner shows up in the second dimension.
 */
const UNIFORM_SHARE = 0.9

/**
 * A reflection: how far above its patch's median a pixel has to be, and how few of
 * them are still tolerable.
 *
 * **A specular highlight is small and it is fatal**, which is why the test is a
 * share of outliers and not a standard deviation: forty bright pixels in a patch of
 * four hundred move a mean by two codes and are invisible to any spread, while what
 * they are is the reflection of a window and the light of the room is not in them at
 * all. One percent is the count at which a patch stops being a measurement of a
 * surface. It is the same reasoning §3.5 gives for taking a median and not a mean.
 */
const SPECULAR_MARGIN = 40
const MAX_SPECULAR_SHARE = 0.01

/**
 * Codes at which a channel has stopped carrying colour, and how few such pixels a
 * patch may hold.
 *
 * The thresholds of §3.5, and for its reason: a channel that clipped has lost how
 * far past the top it went and one buried in the noise floor has lost its ratio to
 * the others, so either way the chromaticity of that patch is a number that looks
 * measured and is not. A stray pixel or two does not condemn a patch; two percent of
 * it does, because at that point the patch is not dark or bright, it is saturated.
 */
const PATCH_CLIP_HIGH = 250
const PATCH_CLIP_LOW = 4
const MAX_CLIPPED_SHARE = 0.02

/**
 * How far the patches' chromaticities may disagree, and how much colour any one of
 * them may carry.
 *
 * **This is the achromatic test, done so that it survives a bulb.** Demanding that
 * the patches be neutral *in the pixels* would reject exactly the photograph this
 * whole feature exists for: under a warm bulb a perfect grey card comes out orange,
 * and that is the cast we are trying to measure. What a per-channel gain — which is
 * what an illuminant is — cannot change is the **agreement** between the patches: it
 * multiplies all of them by the same three numbers, so a genuine grey scale keeps one
 * chromaticity from its white to its black whatever the light. That agreement is the
 * evidence, and the tolerance is set by quantization at the dark end, where one code
 * is already three percent of the linear value.
 *
 * `MAX_CAST_SPREAD` is a second, blunter bound in the other direction: a bulb can
 * tint a grey, it cannot turn it into a colour. Without it a shaded sequence of one
 * saturated hue —three bands of the same red paint, a blue sky over a roof— would
 * agree with itself perfectly and pass. It is a ceiling and not a measurement, so a
 * strong cast costs nothing in confidence.
 */
const CHROMA_AGREEMENT = 0.05
const MAX_CAST_SPREAD = 0.35

/**
 * Below this, there is no candidate at all.
 *
 * **Sin umbral, no hay detección**: without a floor every photograph would produce
 * its best-scoring accident, and the interface would point at it with a rectangle,
 * which reads as a measurement. Above the floor the number is reported honestly and
 * the interface may say «probablemente» — but it is the hard rules above that decide
 * whether there is a candidate, and the confidence only says how comfortably they
 * were met.
 */
export const MIN_CONFIDENCE = 0.55

/**
 * Most candidates returned, best first.
 *
 * More than one because the cataloger picks: a card and the printed sheet may both
 * be in the frame, and the second-best is sometimes the right one — the same reason
 * the border detector returns the frame and the canvas. More than a handful is not a
 * choice, it is a list nobody reads.
 */
export const MAX_CANDIDATES = 4

/**
 * How far outside the artwork the exclusion reaches, as a fraction of its own size.
 *
 * The border of the painting is not the target and neither is the JPEG ringing along
 * it, and the edge of the quadrilateral is where the cataloger's finger landed, not
 * where the paint ends.
 */
const ARTWORK_MARGIN = 0.02

/** Below this alpha a pixel is not part of the photograph. Mirrors imageHistogram. */
const OPAQUE_ENOUGH = 8

/** Fewest pixels a patch box may hold before its median stops meaning anything. */
const MIN_PATCH_PIXELS = 16

/* -------------------------------------------------------------------- types */

/**
 * What the cataloger declared she used. **Not detectable from the image**: see the
 * header. It travels in so that the candidate can carry the `color_reference` value
 * the row will store, and for no other purpose — nothing in the arithmetic below
 * reads it.
 */
export type GrayTargetKind = 'CARD' | 'PRINT'

/** Which way the staircase runs. A target may be laid either way. */
export type GrayTargetAxis = 'horizontal' | 'vertical'

/** A rectangle in fractions (0…1) of the raster, as everything stored here is. */
export interface FractionBox {
  x: number
  y: number
  width: number
  height: number
}

/** One patch of the staircase, as measured. */
export interface GrayPatch {
  /** Where it is, in fractions of the raster that was analysed. */
  box: FractionBox
  /**
   * Median code per channel — **the median**, for the reason §3.5 gives: one
   * specular or one dust pixel ruins a mean and leaves a median where it was.
   * This is the number a caller feeds to the colour model; `luminance` is only for
   * ordering and for the interface.
   */
  tone: Rgb
  /** Median of the cheap luminance proxy of imagePixels, for ordering and display. */
  luminance: number
  /** Pixels actually measured inside the box. */
  pixels: number
}

/** Everything the rules looked at, so a candidate can be argued with. */
export interface GrayTargetMeasure {
  /** Lightest over darkest, in linear light. */
  toneRatio: number
  /** Worst interior step's position in the span, in codes. See `MID_SHARE`. */
  midShare: number
  /** Smallest share of pixels near its own median, across the patches. */
  uniformShare: number
  /** Largest share of pixels far above its own median, across the patches. */
  specularShare: number
  /** Largest share of pixels with a channel at either end, across the patches. */
  clippedShare: number
  /** Worst disagreement between two patches' chromaticities. */
  chromaSpread: number
  /** Most colour any single patch carries, as relative spread of its codes. */
  castSpread: number
  /** Largest patch over smallest, along the axis. */
  sizeRatio: number
  /** Share of the band's scanlines that showed the staircase. */
  support: number
}

/**
 * A staircase the interface may point at and offer.
 *
 * `reference` is the state of §4 this candidate proposes, and it is only ever
 * `TARGET_CARD` or `TARGET_PRINT` — the two values that mean «se detectó una
 * escalera», told apart by the declaration and by nothing in the pixels. The other
 * two values of the enum are not this module's to give: `SCENE` is what the
 * eyedropper writes when the cataloger touches a wall or a piece of cardboard, and
 * `NONE` is what a photograph corrected by eye keeps. A detector that returned them
 * would be reporting a decision it did not take.
 */
export interface GrayTargetCandidate {
  axis: GrayTargetAxis
  /** The whole staircase, patches included. */
  box: FractionBox
  /**
   * The patches, **lightest first** and not in the order they appear: the white and
   * the black are what a caller wants at the ends, and whoever draws them has each
   * patch's own box.
   */
  patches: GrayPatch[]
  /** 0…1. What the hard rules already accepted; see `MIN_CONFIDENCE`. */
  confidence: number
  measure: GrayTargetMeasure
  /** The `color_reference` value this candidate proposes. */
  reference: Extract<ColorReference, 'TARGET_CARD' | 'TARGET_PRINT'>
  /**
   * The white balance the target's own grey suggests, or **null when its grey may
   * not be believed** — which is the case of every printed sheet
   * (`referenceTrustsGray`): domestic ink is not neutral, so taking the cast from it
   * would replace the colour of the bulb with the colour of the ink. The patches'
   * `tone` is reported either way, because a sheet is perfectly good for the black
   * and the white points, which only need uniform patches.
   */
  neutral: Neutral | null
  /** Whether the grey of this candidate may be believed as a cast measurement. */
  trustsGray: boolean
}

/**
 * Why nothing was returned, in the order the pipeline reached: the furthest stage
 * any band got to. It is the `DeclineReason` of the border detector and it exists
 * for the same two reasons — the interface has to say something true instead of
 * leaving a hole, and a test has to be able to check that a fixture was refused for
 * the reason it was built to be refused for.
 */
export type GrayTargetDecline =
  | 'unusable-image'
  | 'no-staircase'
  | 'thin-band'
  | 'too-large'
  | 'clipped'
  | 'specular'
  | 'not-uniform'
  | 'not-neutral'
  | 'below-threshold'

export interface GrayTargetAnalysis {
  /** Best first, at most `MAX_CANDIDATES`. Empty is a perfectly good answer. */
  candidates: GrayTargetCandidate[]
  /** Null when there is at least one candidate. */
  declined: GrayTargetDecline | null
}

export interface GrayTargetOptions {
  /** Declared by the cataloger, never detected. See `GrayTargetKind`. */
  kind: GrayTargetKind
  /**
   * The artwork's frame, in the coordinates it is **stored** in (fractions of the
   * rotated image), so the search can happen outside it. Structurally the `Frame` of
   * imageHistogram, which a `PhotoEdit` satisfies: the editor passes the edit it is
   * already showing.
   */
  artwork?: Frame | null
}

/* ------------------------------------------------------------------ helpers */

function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function clamp(value: number, min: number, max: number): number {
  if (max < min) return min
  return Math.min(Math.max(value, min), max)
}

/** Whole pixels, never negative: a decoder that reports 0,5 rows has none. */
function wholeSize(value: unknown): number {
  return Math.max(0, Math.trunc(finite(value, 0)))
}

function code8(value: unknown): number {
  return clamp(Math.round(finite(value, 0)), 0, 255)
}

/** The `color_reference` value a declaration maps to. See `GrayTargetKind`. */
export function grayTargetReference(
  kind: GrayTargetKind,
): Extract<ColorReference, 'TARGET_CARD' | 'TARGET_PRINT'> {
  return kind === 'PRINT' ? 'TARGET_PRINT' : 'TARGET_CARD'
}

/* -------------------------------------------------------------------- mask */

/**
 * Whether a point is inside a convex quadrilateral, by the sign of the cross product
 * on its four edges.
 *
 * The same test imageHistogram uses to measure inside a frame, written again because
 * there it is private and this module needs it for the opposite purpose. Keeping it
 * private in both is the lesser evil: exporting it would put a shared, load-bearing
 * predicate in a module whose subject is histograms, and the day somebody changed
 * the edge convention there this file would silently start including the border of
 * the artwork. Twelve lines, and the two copies are exercised by two sets of tests.
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
 * Pixels that are not available to the search: transparent ones, and the artwork.
 *
 * One byte per pixel, computed once and read by both scans and by every patch
 * measurement, so the three can never disagree about what is off limits.
 *
 * The quarter turn is undone here, exactly as imageHistogram does it and for the
 * same reason: the frame is stored in fractions of the ROTATED image and the raster
 * is the photograph as it decoded, so the geometry travels through `rotateCorners` /
 * `rotateCrop` with the **opposite** rotation. Doing it at the call site is the
 * sibling of the incident where the straightening was computed with the sides
 * swapped.
 *
 * An unusable frame masks nothing rather than masking everything: a target beside an
 * artwork whose corners are broken is still a target, while a mask of the whole
 * raster would silently turn every photograph into «no se ha encontrado testigo».
 */
function buildMask(
  raster: PixelRaster,
  width: number,
  height: number,
  artwork: Frame | null | undefined,
): Uint8Array {
  const mask = new Uint8Array(width * height)
  const data = raster.data

  for (let i = 0; i < mask.length; i += 1) {
    const at = i * 4
    if (at + 4 > data.length) mask[i] = 1
    else if (finite(data[at + 3], 255) < OPAQUE_ENOUGH) mask[i] = 1
  }
  if (!artwork) return mask

  // Negative: the stored fractions are in the rotated frame and the pixels are not.
  const turn = -finite(artwork.rotation, 0)

  if (artwork.corners) {
    const turned = rotateCorners(artwork.corners, turn)
    const quad = CORNER_KEYS.map((key) => ({
      x: finite(turned[key]?.x, Number.NaN) * width,
      y: finite(turned[key]?.y, Number.NaN) * height,
    }))
    if (quad.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y))) {
      // Dilated about its own centroid, so the margin scales with the artwork
      // instead of with the frame: see ARTWORK_MARGIN.
      const cx = quad.reduce((sum, point) => sum + point.x, 0) / 4
      const cy = quad.reduce((sum, point) => sum + point.y, 0) / 4
      const grown = quad.map((point) => ({
        x: cx + (point.x - cx) * (1 + ARTWORK_MARGIN),
        y: cy + (point.y - cy) * (1 + ARTWORK_MARGIN),
      }))
      const x0 = Math.max(0, Math.floor(Math.min(...grown.map((p) => p.x))))
      const y0 = Math.max(0, Math.floor(Math.min(...grown.map((p) => p.y))))
      const x1 = Math.min(width, Math.ceil(Math.max(...grown.map((p) => p.x))))
      const y1 = Math.min(height, Math.ceil(Math.max(...grown.map((p) => p.y))))
      for (let y = y0; y < y1; y += 1) {
        for (let x = x0; x < x1; x += 1) {
          if (insideQuad(grown, x + 0.5, y + 0.5)) mask[y * width + x] = 1
        }
      }
      return mask
    }
  }

  if (artwork.crop) {
    const rect = cropRectInPixels(rotateCrop(artwork.crop, turn), { width, height })
    const marginX = Math.round(rect.width * ARTWORK_MARGIN)
    const marginY = Math.round(rect.height * ARTWORK_MARGIN)
    const x0 = Math.max(0, rect.x - marginX)
    const y0 = Math.max(0, rect.y - marginY)
    const x1 = Math.min(width, rect.x + rect.width + marginX)
    const y1 = Math.min(height, rect.y + rect.height + marginY)
    for (let y = y0; y < y1; y += 1) {
      for (let x = x0; x < x1; x += 1) mask[y * width + x] = 1
    }
  }

  return mask
}

/* ------------------------------------------------------------- segmentation */

/** One axis of the search, so the same code scans rows and columns. */
interface Axis {
  name: GrayTargetAxis
  /** Positions along the staircase. */
  length: number
  /** Scanlines across it. */
  lines: number
  at: (pos: number, line: number) => number
}

/** A stretch of one scanline whose codes are all within `PATCH_SPREAD`. */
interface Run {
  /** Half-open, `[start, end)`, like every pixel loop in this repository. */
  start: number
  end: number
  /** Mean luminance code of the run, rounded. */
  tone: number
}

/**
 * One scanline cut into runs of one tone.
 *
 * The run closes when adding the next pixel would spread the run past
 * `PATCH_SPREAD` — against the run's own minimum and maximum, not against a running
 * mean, which is what keeps a gradient from being swallowed whole: a mean drifts
 * with the ramp and would never close, while a window of eight codes closes every
 * eight codes of ramp and hands the step test a difference far too small to be a
 * step.
 *
 * A masked pixel closes the current run and starts no new one, so the artwork and
 * the transparent corners of a straightened derivative act as walls rather than as
 * dark patches.
 */
function runsOn(axis: Axis, line: number, luminance: Uint8Array, mask: Uint8Array): Run[] {
  const runs: Run[] = []
  let start = -1
  let sum = 0
  let count = 0
  let low = 0
  let high = 0

  for (let pos = 0; pos <= axis.length; pos += 1) {
    const index = pos < axis.length ? axis.at(pos, line) : -1
    const blocked = index < 0 || mask[index] === 1
    const value = blocked ? -1 : (luminance[index] ?? 0)

    if (!blocked && start >= 0) {
      const nextLow = Math.min(low, value)
      const nextHigh = Math.max(high, value)
      if (nextHigh - nextLow <= PATCH_SPREAD) {
        low = nextLow
        high = nextHigh
        sum += value
        count += 1
        continue
      }
    }

    if (start >= 0) runs.push({ start, end: pos, tone: Math.round(sum / Math.max(1, count)) })
    if (blocked) {
      start = -1
    } else {
      start = pos
      sum = value
      count = 1
      low = value
      high = value
    }
  }

  // A run that touches the border of the raster is the background, not a patch: a
  // target is an object inside the frame, and the wall it lies against reaches the
  // edge. Dropping them is what keeps the wall out of the chain when it happens to
  // be one step darker than the darkest patch — measured on the border detector, an
  // accidental fourth «patch» is how a plausible staircase gets built out of a
  // target plus its surroundings.
  return runs.filter((run) => run.start > 0 && run.end < axis.length)
}

/** A staircase found on one scanline. */
interface Hit {
  line: number
  runs: Run[]
}

/**
 * The staircases of one scanline: maximal chains of contiguous, similar-sized runs
 * whose tones step in one direction.
 *
 * **Maximal only, with no fallback to a shorter window inside a rejected chain.**
 * That is the prudence of the border detector applied here: when a reflection splits
 * a patch, the chain that survives is «bright blob, sliver, patch» and it is a
 * perfectly monotone three-step staircase of absurd proportions. Refusing it outright
 * — rather than searching the same scanline for some sub-sequence that passes — is
 * what makes those scanlines abstain, which is what puts the reflection inside the
 * band that gets measured instead of outside it.
 *
 * Runs shorter than a patch are dropped **before** chaining and the gap they leave is
 * allowed: the boundary between two patches is never one pixel wide in a photograph,
 * and the intermediate tone of that seam, left in, would read as an extra patch and
 * blow the size ratio on every real target.
 */
function hitsOn(runs: Run[], minRun: number, seam: number): Run[][] {
  const kept = runs.filter((run) => run.end - run.start >= minRun)
  const chains: Run[][] = []
  let chain: Run[] = []
  let direction = 0

  const close = () => {
    if (chain.length >= MIN_PATCHES && chain.length <= MAX_PATCHES) chains.push(chain)
    chain = []
    direction = 0
  }

  for (let i = 0; i < kept.length; i += 1) {
    const run = kept[i]!
    const previous = chain[chain.length - 1]
    if (!previous) {
      chain = [run]
      continue
    }
    const step = run.tone - previous.tone
    const sign = step > 0 ? 1 : -1
    const contiguous = run.start - previous.end <= seam
    const usable = contiguous && Math.abs(step) >= MIN_STEP
    if (!usable || (direction !== 0 && sign !== direction)) {
      close()
      // Where the direction turned, the run that closed one chain is also the first
      // step of the next one: at the bottom of a valley the descending staircase and
      // the ascending one share a patch, and starting the new chain at `run` alone
      // would lose the one that begins with the patch before it.
      chain = usable ? [previous, run] : [run]
      direction = usable ? sign : 0
      continue
    }
    direction = sign
    chain.push(run)
  }
  close()

  return chains.filter((found) => {
    const sizes = found.map((run) => run.end - run.start)
    return Math.max(...sizes) <= Math.min(...sizes) * MAX_PATCH_SIZE_RATIO
  })
}

/* -------------------------------------------------------------------- bands */

/**
 * Most bands one axis may open.
 *
 * Insurance and not a rule: almost every scanline of almost every photograph yields
 * no staircase at all, but a strongly textured surface can yield one per line, and
 * matching every new hit against every band opened so far is quadratic. A cap keeps
 * the worst case bounded on the phone; what it costs when it bites is the least
 * promising bands, which are the ones opened last by the noisiest lines.
 */
const MAX_BANDS = 512

/** The scanlines that agree on the same staircase: a two-dimensional candidate. */
interface Band {
  /** The patch bounds every supporting scanline agrees on: the intersection. */
  bounds: { start: number; end: number }[]
  lines: number[]
}

/**
 * Hits grouped into bands.
 *
 * Two hits belong together when they have the same number of patches and every
 * boundary agrees within `ALIGN_SHARE` — which is the «aligned» of §4, and it is
 * what a staircase has and a coincidence does not. The bounds kept are the
 * **intersection** and not the union: a patch measured one pixel into its neighbour
 * is a patch whose median has moved, and the whole point of the box is to measure
 * one surface.
 */
function bandsFrom(hits: Hit[], alignTolerance: number, maxGap: number): Band[] {
  const bands: Band[] = []

  for (const hit of hits) {
    const runs = hit.runs
    let band = bands.find(
      (candidate) =>
        candidate.bounds.length === runs.length &&
        hit.line - candidate.lines[candidate.lines.length - 1]! - 1 <= maxGap &&
        candidate.bounds.every(
          (bound, i) =>
            Math.abs(bound.start - runs[i]!.start) <= alignTolerance &&
            Math.abs(bound.end - runs[i]!.end) <= alignTolerance,
        ),
    )
    if (!band) {
      if (bands.length >= MAX_BANDS) continue
      band = { bounds: runs.map((run) => ({ start: run.start, end: run.end })), lines: [] }
      bands.push(band)
    }
    band.bounds = band.bounds.map((bound, i) => ({
      start: Math.max(bound.start, runs[i]!.start),
      end: Math.min(bound.end, runs[i]!.end),
    }))
    band.lines.push(hit.line)
  }

  return bands
}

/* -------------------------------------------------------------- measurement */

/** What one pass over a patch box can answer. */
interface PatchMeasure {
  tone: Rgb
  luminance: number
  pixels: number
  uniformShare: number
  specularShare: number
  clippedShare: number
  /** Linear-light chromaticity, `r/(r+g+b)` and `b/(r+g+b)`. */
  chroma: { r: number; b: number }
  /** Relative spread of the median codes: how much colour this patch carries. */
  castSpread: number
}

/**
 * One patch measured over **all** its pixels, in one pass.
 *
 * Histograms and not lists of samples, like `patchMedian` and `measureFrame`: the
 * medians, the share near the median and the share of reflections all come off four
 * arrays of 256 counters, which is what makes measuring a hundred thousand pixels
 * per candidate affordable on the phone.
 *
 * Null when there is not enough of the patch left to mean anything — a box mostly
 * eaten by the artwork mask, or a decode that ended early.
 */
function measurePatch(
  raster: PixelRaster,
  width: number,
  luminance: Uint8Array,
  mask: Uint8Array,
  box: { x: number; y: number; width: number; height: number },
): PatchMeasure | null {
  const data = raster.data
  const red = new Int32Array(256)
  const green = new Int32Array(256)
  const blue = new Int32Array(256)
  const light = new Int32Array(256)
  let pixels = 0
  let clipped = 0

  for (let y = box.y; y < box.y + box.height; y += 1) {
    for (let x = box.x; x < box.x + box.width; x += 1) {
      const index = y * width + x
      if (mask[index] === 1) continue
      const at = index * 4
      if (at + 4 > data.length) continue
      const r = code8(data[at])
      const g = code8(data[at + 1])
      const b = code8(data[at + 2])
      red[r] = (red[r] ?? 0) + 1
      green[g] = (green[g] ?? 0) + 1
      blue[b] = (blue[b] ?? 0) + 1
      const y8 = luminance[index] ?? 0
      light[y8] = (light[y8] ?? 0) + 1
      const max = Math.max(r, g, b)
      const min = Math.min(r, g, b)
      if (max >= PATCH_CLIP_HIGH || min <= PATCH_CLIP_LOW) clipped += 1
      pixels += 1
    }
  }
  if (pixels < MIN_PATCH_PIXELS) return null

  // The median over bins is `percentileFrom` of imageHistogram at 0,5, not a second
  // implementation of it: the tones this module reports and the tones the histogram
  // panel reports have to come out of the same arithmetic, or the same patch would
  // read one code here and another there.
  const tone: Rgb = {
    r: percentileFrom(red, pixels, 0.5),
    g: percentileFrom(green, pixels, 0.5),
    b: percentileFrom(blue, pixels, 0.5),
  }
  const median = percentileFrom(light, pixels, 0.5)

  let near = 0
  let hot = 0
  for (let code = 0; code < 256; code += 1) {
    const count = light[code] ?? 0
    if (count === 0) continue
    if (Math.abs(code - median) <= PATCH_SPREAD) near += count
    if (code - median > SPECULAR_MARGIN) hot += count
  }

  const linear = {
    r: srgbToLinear(tone.r / 255),
    g: srgbToLinear(tone.g / 255),
    b: srgbToLinear(tone.b / 255),
  }
  const sum = linear.r + linear.g + linear.b
  const maxCode = Math.max(tone.r, tone.g, tone.b)
  const minCode = Math.min(tone.r, tone.g, tone.b)

  return {
    tone,
    luminance: median,
    pixels,
    uniformShare: near / pixels,
    specularShare: hot / pixels,
    clippedShare: clipped / pixels,
    // A patch with no light in it has no chromaticity; reporting the neutral point
    // would be inventing one, so it is reported as such and the cast bound below
    // rejects it through `castSpread`.
    chroma: sum > 0 ? { r: linear.r / sum, b: linear.b / sum } : { r: 1 / 3, b: 1 / 3 },
    castSpread: maxCode > 0 ? (maxCode - minCode) / maxCode : 0,
  }
}

/* ---------------------------------------------------------------- judgement */

const STAGES: readonly GrayTargetDecline[] = [
  'unusable-image',
  'no-staircase',
  'thin-band',
  'too-large',
  'clipped',
  'specular',
  'not-uniform',
  'not-neutral',
  'below-threshold',
]

/** The furthest of two stages: what gets reported when several bands failed. */
function furthest(a: GrayTargetDecline, b: GrayTargetDecline): GrayTargetDecline {
  return STAGES.indexOf(a) >= STAGES.indexOf(b) ? a : b
}

/**
 * How comfortably the rules were met, as the geometric mean of one factor per rule.
 *
 * Each factor is zero exactly at its rule's bound and one when the rule is met with
 * room to spare, so a candidate that only just qualifies scores low and one that is
 * unmistakable scores near one. The geometric mean and not the minimum because every
 * rule is evidence and a single tight margin should lower the confidence without
 * pretending the rest was not there; and not the arithmetic mean, which would let
 * five comfortable rules bury one that barely passed.
 *
 * **The confidence decides nothing on its own.** The hard rules already refused
 * everything they had to; this number exists so the interface can offer the best
 * candidate first and say how sure it is.
 */
function confidenceOf(measure: GrayTargetMeasure, patches: number): number {
  const band = midShareBand(patches)
  const factors = [
    // Logarithmic: the span is a ratio, and 4× the minimum is «unmistakable».
    clamp(Math.log(measure.toneRatio / MIN_TONE_RATIO) / Math.log(4), 0, 1),
    clamp(
      Math.min(measure.midShare - band.min, band.max - measure.midShare) / MID_SHARE.min,
      0,
      1,
    ),
    clamp((measure.uniformShare - UNIFORM_SHARE) / (1 - UNIFORM_SHARE), 0, 1),
    clamp(1 - measure.specularShare / MAX_SPECULAR_SHARE, 0, 1),
    clamp(1 - measure.clippedShare / MAX_CLIPPED_SHARE, 0, 1),
    clamp(1 - measure.chromaSpread / CHROMA_AGREEMENT, 0, 1),
    clamp((MAX_PATCH_SIZE_RATIO - measure.sizeRatio) / (MAX_PATCH_SIZE_RATIO - 1), 0, 1),
    clamp((measure.support - SUPPORT_SHARE) / (1 - SUPPORT_SHARE), 0, 1),
  ]
  // A floor instead of a zero, so a factor at its bound gives a very low confidence
  // rather than a logarithm of zero.
  const total = factors.reduce((sum, factor) => sum + Math.log(Math.max(factor, 1e-4)), 0)
  return Math.round(Math.exp(total / factors.length) * 1000) / 1000
}

/* ------------------------------------------------------------------ the API */

/**
 * The candidates, best first. `analyseGrayTarget` is this with the explanation.
 *
 * Nothing is applied and nothing is decided: what comes back is what the interface
 * points at and offers, and an empty array is a complete answer.
 */
export function detectGrayTarget(
  raster: PixelRaster | null | undefined,
  options: GrayTargetOptions,
): GrayTargetCandidate[] {
  return analyseGrayTarget(raster, options).candidates
}

/**
 * The same search, saying why when it declines («nunca una página en blanco»).
 */
export function analyseGrayTarget(
  raster: PixelRaster | null | undefined,
  options: GrayTargetOptions,
): GrayTargetAnalysis {
  const width = wholeSize(raster?.width)
  const height = wholeSize(raster?.height)
  if (!raster || !raster.data || width < MIN_SIZE || height < MIN_SIZE) {
    return { candidates: [], declined: 'unusable-image' }
  }

  const luminance = luminanceOf({ data: raster.data, width, height })
  const mask = buildMask(raster, width, height, options.artwork)
  const reference = grayTargetReference(options.kind)
  const trustsGray = referenceTrustsGray(reference)

  const axes: Axis[] = [
    {
      name: 'horizontal',
      length: width,
      lines: height,
      at: (pos, line) => line * width + pos,
    },
    {
      name: 'vertical',
      length: height,
      lines: width,
      at: (pos, line) => pos * width + line,
    },
  ]

  let declined: GrayTargetDecline = 'no-staircase'
  const candidates: GrayTargetCandidate[] = []

  for (const axis of axes) {
    const minRun = Math.max(3, Math.round(MIN_PATCH_SIDE * axis.length))
    const seam = Math.max(2, Math.round(minRun * 0.15))
    const minThickness = Math.max(3, Math.round(MIN_PATCH_SIDE * axis.lines))
    const alignTolerance = Math.max(1, Math.round(ALIGN_SHARE * axis.length))
    const maxGap = Math.max(3, Math.round(MAX_GAP_SHARE * axis.lines))

    const hits: Hit[] = []
    for (let line = 0; line < axis.lines; line += 1) {
      for (const runs of hitsOn(runsOn(axis, line, luminance, mask), minRun, seam)) {
        hits.push({ line, runs })
      }
    }

    for (const band of bandsFrom(hits, alignTolerance, maxGap)) {
      const first = band.lines[0]!
      const last = band.lines[band.lines.length - 1]!
      const thickness = last - first + 1
      const support = band.lines.length / thickness
      if (thickness < minThickness || support < SUPPORT_SHARE) {
        declined = furthest(declined, 'thin-band')
        continue
      }
      if (band.bounds.some((bound) => bound.end - bound.start < minRun)) {
        declined = furthest(declined, 'thin-band')
        continue
      }

      // The box spans every scanline between the first and the last, gaps included:
      // see MAX_GAP_SHARE. Whatever interrupted the staircase is measured.
      const boxes = band.bounds.map((bound) =>
        axis.name === 'horizontal'
          ? { x: bound.start, y: first, width: bound.end - bound.start, height: thickness }
          : { x: first, y: bound.start, width: thickness, height: bound.end - bound.start },
      )
      const area = boxes.reduce((total, box) => total + box.width * box.height, 0)
      if (area > MAX_TARGET_AREA * width * height) {
        declined = furthest(declined, 'too-large')
        continue
      }

      const measured = boxes.map((box) => measurePatch(raster, width, luminance, mask, box))
      if (measured.some((patch) => patch === null)) {
        declined = furthest(declined, 'thin-band')
        continue
      }
      const patches = measured as PatchMeasure[]

      const clippedShare = Math.max(...patches.map((patch) => patch.clippedShare))
      if (clippedShare > MAX_CLIPPED_SHARE) {
        declined = furthest(declined, 'clipped')
        continue
      }
      const specularShare = Math.max(...patches.map((patch) => patch.specularShare))
      if (specularShare > MAX_SPECULAR_SHARE) {
        declined = furthest(declined, 'specular')
        continue
      }
      const uniformShare = Math.min(...patches.map((patch) => patch.uniformShare))
      if (uniformShare < UNIFORM_SHARE) {
        declined = furthest(declined, 'not-uniform')
        continue
      }

      // Re-read as a staircase from the medians of the whole boxes, not from the
      // means of one scanline: the tones that get reported have to be the tones that
      // were judged.
      const order = patches
        .map((patch, i) => ({ patch, box: boxes[i]!, size: band.bounds[i]!.end - band.bounds[i]!.start }))
        .sort((a, b) => b.patch.luminance - a.patch.luminance)
      const lightest = order[0]!.patch
      const darkest = order[order.length - 1]!.patch
      const span = lightest.luminance - darkest.luminance
      const steps = order.every(
        (entry, i) => i === 0 || order[i - 1]!.patch.luminance - entry.patch.luminance >= MIN_STEP,
      )
      const linearLight = srgbToLinear(lightest.luminance / 255)
      const linearDark = srgbToLinear(darkest.luminance / 255)
      const toneRatio = linearDark > 0 ? linearLight / linearDark : Number.POSITIVE_INFINITY
      const midBand = midShareBand(order.length)
      const interior = order.slice(1, -1).map((entry) => (entry.patch.luminance - darkest.luminance) / span)
      const midShare = interior.reduce(
        (worst, share) =>
          Math.min(share - midBand.min, midBand.max - share) <
          Math.min(worst - midBand.min, midBand.max - worst)
            ? share
            : worst,
        interior[0] ?? 0.5,
      )
      if (
        !steps ||
        span <= 0 ||
        !(toneRatio >= MIN_TONE_RATIO) ||
        interior.some((share) => share < midBand.min || share > midBand.max)
      ) {
        declined = furthest(declined, 'no-staircase')
        continue
      }

      let chromaSpread = 0
      for (let i = 0; i < patches.length; i += 1) {
        for (let j = i + 1; j < patches.length; j += 1) {
          const a = patches[i]!.chroma
          const b = patches[j]!.chroma
          chromaSpread = Math.max(chromaSpread, Math.abs(a.r - b.r), Math.abs(a.b - b.b))
        }
      }
      const castSpread = Math.max(...patches.map((patch) => patch.castSpread))
      if (chromaSpread > CHROMA_AGREEMENT || castSpread > MAX_CAST_SPREAD) {
        declined = furthest(declined, 'not-neutral')
        continue
      }

      const sizes = order.map((entry) => entry.size)
      const measure: GrayTargetMeasure = {
        toneRatio,
        midShare,
        uniformShare,
        specularShare,
        clippedShare,
        chromaSpread,
        castSpread,
        sizeRatio: Math.max(...sizes) / Math.max(1, Math.min(...sizes)),
        support,
      }
      const confidence = confidenceOf(measure, order.length)
      if (confidence < MIN_CONFIDENCE) {
        declined = furthest(declined, 'below-threshold')
        continue
      }

      const start = Math.min(...band.bounds.map((bound) => bound.start))
      const end = Math.max(...band.bounds.map((bound) => bound.end))
      const box =
        axis.name === 'horizontal'
          ? { x: start, y: first, width: end - start, height: thickness }
          : { x: first, y: start, width: thickness, height: end - start }

      candidates.push({
        axis: axis.name,
        box: fractions(box, width, height),
        patches: order.map((entry) => ({
          box: fractions(entry.box, width, height),
          tone: entry.patch.tone,
          luminance: entry.patch.luminance,
          pixels: entry.patch.pixels,
        })),
        confidence,
        measure,
        reference,
        neutral: trustsGray ? neutralOf(order.map((entry) => entry.patch)) : null,
        trustsGray,
      })
    }
  }

  candidates.sort((a, b) => b.confidence - a.confidence)
  const kept: GrayTargetCandidate[] = []
  for (const candidate of candidates) {
    // The same target found by both scans, or two overlapping readings of it, is one
    // candidate: the better one. Offering the cataloger the same rectangle twice is
    // asking her to choose between a thing and itself.
    if (kept.some((better) => overlaps(better.box, candidate.box))) continue
    kept.push(candidate)
    if (kept.length >= MAX_CANDIDATES) break
  }

  return { candidates: kept, declined: kept.length > 0 ? null : declined }
}

function fractions(
  box: { x: number; y: number; width: number; height: number },
  width: number,
  height: number,
): FractionBox {
  return {
    x: box.x / width,
    y: box.y / height,
    width: box.width / width,
    height: box.height / height,
  }
}

/** Whether two boxes share more than half of the smaller one. */
function overlaps(a: FractionBox, b: FractionBox): boolean {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)
  if (w <= 0 || h <= 0) return false
  const smaller = Math.min(a.width * a.height, b.width * b.height)
  return smaller > 0 && (w * h) / smaller > 0.5
}

/**
 * The white balance the staircase suggests, from the patch best placed to give it.
 *
 * The **interior** patch closest to the middle of the range, and never an extreme:
 * the white is the patch most likely to have clipped and the black the one most
 * likely to be sitting in the noise floor, which are the two samples §3.5 refuses by
 * name. The inversion itself is `neutralFromSample` and not a second copy of it —
 * it already refuses a sample with a channel at either end, and one implementation
 * of the arithmetic is the rule of imageColor.ts. If the best patch is refused the
 * next one is tried, and null means the target is there but its grey cannot be
 * measured, which the caller has to say instead of quietly correcting nothing.
 */
function neutralOf(patches: readonly PatchMeasure[]): Neutral | null {
  if (patches.length === 0) return null
  const lightest = patches[0]!.luminance
  const darkest = patches[patches.length - 1]!.luminance
  const middle = (lightest + darkest) / 2
  const interior = patches.length > 2 ? patches.slice(1, -1) : patches.slice()
  const ranked = interior
    .slice()
    .sort((a, b) => Math.abs(a.luminance - middle) - Math.abs(b.luminance - middle))
  for (const patch of ranked) {
    const neutral = neutralFromSample(patch.tone)
    if (neutral) return neutral
  }
  return null
}

/**
 * What to tell the cataloger, in her language, when there is nothing to point at.
 *
 * Null when there are candidates: the interface then draws them and says its own
 * sentence. The precedent is `clippingNotice` of imageHistogram, and the rule is the
 * one of CLAUDE.md — **nunca un hueco**, and never the mechanism either: what is
 * explained is what she can do about it with the artwork in front of her.
 */
export function grayTargetNotice(
  analysis: GrayTargetAnalysis | null | undefined,
): string | null {
  if (!analysis || analysis.candidates.length > 0 || !analysis.declined) return null
  switch (analysis.declined) {
    case 'unusable-image':
      return 'No se han podido medir los píxeles de esta fotografía, así que no se ha podido buscar el testigo de gris.'
    case 'thin-band':
      return 'Se ve un testigo, pero sale pequeño o cortado. Conviene que salga entero y más grande.'
    case 'too-large':
      return 'Lo que parece una escalera de grises ocupa casi todo el encuadre. Toma el gris con el cuentagotas.'
    case 'clipped':
      return 'El testigo tiene parches quemados o a oscuras. Repite la toma con menos luz directa.'
    case 'specular':
      return 'El testigo tiene un reflejo encima. Inclínalo o apártalo de la luz directa.'
    case 'not-uniform':
      return 'Los parches del testigo de gris no salen lisos: puede haber una sombra, un pliegue o un objeto por encima.'
    case 'not-neutral':
      return 'Lo que parece un testigo tiene color propio. Toma el gris con el cuentagotas.'
    case 'below-threshold':
      return 'Hay algo parecido a un testigo, pero no lo bastante. Toma el gris con el cuentagotas.'
    case 'no-staircase':
    default:
      return 'No se ha encontrado ningún testigo: se reconoce la escalera de parches, entera. Toma el gris con el cuentagotas.'
  }
}
