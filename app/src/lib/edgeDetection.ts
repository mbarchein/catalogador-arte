import { clampCrop, rotateCrop, type Crop } from './imageEdits'

/**
 * Suggesting the crop of a painting from its projection profiles.
 *
 * The artworks of this catalog are, overwhelmingly, paintings: a rectangle with
 * straight sides hanging on a wall or leaning against it. That is a strong
 * assumption and it is what makes this module small. The whole detector is:
 *
 *   1. luminance, lightly smoothed so 8-bit noise and JPEG blocks stop shouting,
 *   2. Sobel gradient, keeping the two components apart,
 *   3. add up the horizontal component ALONG each column and the vertical one
 *      along each row — two one-dimensional profiles instead of an image,
 *   4. the outermost peaks of each profile that clear a robust threshold are the
 *      sides of the rectangle.
 *
 * A vertical border of the painting is a long column of pixels that all change
 * in the same direction, so it adds up to a peak in the column profile; the
 * texture of the canvas, the grain of the wall or a reflection point in one
 * place, do not add up to anything because they are not aligned. That is the
 * whole idea, and it is why this works with two passes over the pixels instead
 * of with a Hough transform or a contour tracer.
 *
 * **Why not a library.** OpenCV.js is several megabytes of WebAssembly and any
 * segmentation model is more; this application exists to start instantly on a
 * phone inside a storage room with bad coverage, and it caches its shell to do
 * so (RNF, see vite.config.ts). Paying that download to save a hundred lines of
 * arithmetic would be trading the requirement for the convenience.
 *
 * **Two candidates, not one.** A framed painting gives four peaks per axis: the
 * outside of the frame and the inside, where the canvas starts. In a catalogue
 * raisonné the work is usually the canvas — the frame is often what an antique
 * dealer put on it decades later — but not always, and the detector cannot know.
 * So it returns both, and the cataloger picks. When there is no second, clearly
 * nested pair of peaks, there is a single candidate.
 *
 * **What it never does is invent a rectangle.** If the profiles show no edge, or
 * what they show does not look like a painting — too small, filling the whole
 * frame, an absurd aspect ratio — the answer is nothing at all, and the
 * interface says so and lets the crop be done by hand. A wrong suggestion is
 * worse than none: it looks like a measurement.
 *
 * **Deliberately out of scope: perspective.** A painting photographed at an
 * angle is not a rectangle in the photo, it is a trapezoid, and these profiles
 * see its slanted sides as broad smears rather than peaks — so the suggestion
 * degrades into nothing, which is the honest outcome. Correcting it is another
 * project: it needs a homography instead of a crop, four corners in the schema
 * instead of `crop_x/y/width/height`, a review of the «back to the original»
 * invariant of imageEdits.ts — which holds because rotating and cropping are
 * reversible framings, and a warp is not — and the Python pipeline of the
 * printed catalog reproducing the same warp. Free rotation and storing
 * quadrilaterals are the same project. Postponed on purpose.
 *
 * There is no DOM here, on purpose, like in imageEdits.ts: this module is the
 * arithmetic over an array of luminance and it can be tested for real with
 * synthetic images. Getting the pixels out of a `Blob` needs a canvas, which the
 * test environment does not have, and lives in imageEdges.ts.
 */

/** Smallest side, in pixels of the reduced copy, worth analysing. */
const MIN_SIZE = 24

/**
 * How far above the profile's own noise a peak has to stand, measured in
 * median absolute deviations. Four is strict enough that the grain of a wall
 * does not produce peaks and loose enough that a border in shadow still does.
 * The median and the MAD are used instead of mean and standard deviation
 * because the peaks we are looking for would inflate both: a measure of the
 * noise must not be moved by the signal.
 */
const MAD_MULTIPLIER = 4

/** Turns a median absolute deviation into the equivalent standard deviation. */
const MAD_TO_SIGMA = 1.4826

/**
 * A peak also has to reach this fraction of the strongest one. It is what keeps
 * a noisy background out when there IS a clear border: with visible noise the
 * MAD is small and half the profile pokes over the median, but nothing there
 * comes close to the border.
 */
const PROMINENCE_FRACTION = 0.25

/**
 * Minimum gradient, in Sobel units averaged over the whole axis, between the
 * strongest peak of a profile and its median. The Sobel response to a step of
 * `d` luminance levels is `4d`, and a border rarely crosses the entire frame, so
 * about 20 is a step of some ten levels along half the frame. Below that there
 * is no border to find: a dark painting on a dark wall, photographed without
 * light, is a picture nobody can crop — neither this code nor a person — and the
 * answer has to be that it could not be recognized.
 */
const MIN_EDGE_STRENGTH = 20

/** Fraction of the frame the suggestion has to cover to be a painting at all. */
const MIN_AREA = 0.15

/**
 * And at most this much: a rectangle that is practically the whole photograph
 * is what you get from a vignette or from a border that was never found, not
 * from a painting the cataloger framed.
 */
const MAX_AREA = 0.98

/** Widest and narrowest plausible painting, as width/height in pixels. */
const MIN_RATIO = 0.25
const MAX_RATIO = 4

/**
 * How far inside the outer rectangle the inner one has to be, per side, to
 * count as a different candidate. Below this the two pairs of peaks are the same
 * border seen twice — a thick edge, a bevel, a shadow — and offering a choice
 * between two rectangles that look identical is worse than offering one.
 */
const MIN_INSET = 0.015

/**
 * Safety margin: the suggestion is widened half a percentage point per side.
 *
 * Erring outwards is not symmetric with erring inwards. A crop half a point too
 * wide leaves a sliver of wall that anybody can see and trim; half a point too
 * narrow eats a strip of the painting, and in a catalogue that is a mutilated
 * reproduction. So the margin always goes out.
 */
const SAFETY_MARGIN = 0.005

/**
 * What the detector found. `inner` is null when there is a single candidate,
 * which is the common case with an unframed painting.
 */
export interface EdgeSuggestion {
  /** The outer rectangle: with a framed painting, the outside of the frame. */
  outer: Crop
  /** The rectangle nested inside it: with a framed painting, the canvas. */
  inner: Crop | null
}

/** One side of the rectangle found on an axis, in fractions of that axis. */
interface AxisEdges {
  outerLow: number
  outerHigh: number
  /** Null when there is no second pair of peaks inside the first one. */
  innerLow: number | null
  innerHigh: number | null
}

interface Peak {
  /** Position in pixels of the reduced copy, with subpixel precision. */
  position: number
  strength: number
}

/**
 * 3x3 box blur, separable, with the border clamped.
 *
 * It is there so the gradient measures borders and not sensor noise or the
 * blocks of a JPEG. A box blur and not a Gaussian one because at this size the
 * difference does not show and this one costs six additions per pixel.
 */
function smooth(source: Float32Array, width: number, height: number): Float32Array {
  const horizontal = new Float32Array(width * height)
  for (let y = 0; y < height; y += 1) {
    const row = y * width
    for (let x = 0; x < width; x += 1) {
      const left = source[row + (x > 0 ? x - 1 : 0)]!
      const middle = source[row + x]!
      const right = source[row + (x < width - 1 ? x + 1 : width - 1)]!
      horizontal[row + x] = (left + middle + right) / 3
    }
  }

  const result = new Float32Array(width * height)
  for (let y = 0; y < height; y += 1) {
    const row = y * width
    const above = (y > 0 ? y - 1 : 0) * width
    const below = (y < height - 1 ? y + 1 : height - 1) * width
    for (let x = 0; x < width; x += 1) {
      result[row + x] = (horizontal[above + x]! + horizontal[row + x]! + horizontal[below + x]!) / 3
    }
  }
  return result
}

/**
 * The two projection profiles: gradient added up per column and per row.
 *
 * The two Sobel components are kept apart instead of combined into a magnitude,
 * and each profile only gets the one perpendicular to the borders it is looking
 * for: the column profile adds up the horizontal derivative, which is what a
 * vertical border produces, and the row profile the vertical one. Adding the
 * full magnitude would put the top and bottom borders into the column profile
 * as a pedestal under every column, and the peaks of the sides would have to
 * stand out over it for nothing.
 *
 * Each profile is divided by the number of pixels that contributed, so its
 * values are a mean gradient per pixel and the thresholds mean the same thing on
 * a photo in landscape and in portrait.
 */
function projectionProfiles(
  image: Float32Array,
  width: number,
  height: number,
): { columns: Float32Array; rows: Float32Array } {
  const columns = new Float32Array(width)
  const rows = new Float32Array(height)

  for (let y = 1; y < height - 1; y += 1) {
    const row = y * width
    const above = row - width
    const below = row + width
    for (let x = 1; x < width - 1; x += 1) {
      const northWest = image[above + x - 1]!
      const north = image[above + x]!
      const northEast = image[above + x + 1]!
      const west = image[row + x - 1]!
      const east = image[row + x + 1]!
      const southWest = image[below + x - 1]!
      const south = image[below + x]!
      const southEast = image[below + x + 1]!

      const gx = northEast + 2 * east + southEast - (northWest + 2 * west + southWest)
      const gy = southWest + 2 * south + southEast - (northWest + 2 * north + northEast)

      columns[x] = columns[x]! + Math.abs(gx)
      rows[y] = rows[y]! + Math.abs(gy)
    }
  }

  const columnTerms = height - 2
  for (let x = 0; x < width; x += 1) columns[x] = columns[x]! / columnTerms
  const rowTerms = width - 2
  for (let y = 0; y < height; y += 1) rows[y] = rows[y]! / rowTerms

  return { columns, rows }
}

function median(values: Float32Array): number {
  const sorted = Float32Array.from(values).sort()
  const middle = sorted.length >> 1
  if (sorted.length % 2 === 1) return sorted[middle]!
  return (sorted[middle - 1]! + sorted[middle]!) / 2
}

function medianAbsoluteDeviation(values: Float32Array, center: number): number {
  const deviations = new Float32Array(values.length)
  for (let i = 0; i < values.length; i += 1) deviations[i] = Math.abs(values[i]! - center)
  return median(deviations)
}

/**
 * Peaks of a profile above `threshold`.
 *
 * Every run of consecutive values over the threshold is one peak, placed at the
 * centroid of its excess over the threshold. The centroid and not the argmax
 * because a step border produces two equal maxima — the Sobel window straddles
 * it — and the centroid lands exactly between them, which is where the border
 * is. That is what gives the suggestion subpixel precision on a copy reduced to
 * 700 px, where one pixel is already a fifth of a percent of the frame.
 */
function findPeaks(profile: Float32Array, threshold: number): Peak[] {
  const peaks: Peak[] = []
  let start = -1

  for (let i = 0; i <= profile.length; i += 1) {
    const above = i < profile.length && profile[i]! > threshold
    if (above && start < 0) start = i
    if (!above && start >= 0) {
      let weight = 0
      let moment = 0
      let strength = 0
      for (let j = start; j < i; j += 1) {
        const excess = profile[j]! - threshold
        weight += excess
        moment += excess * j
        if (profile[j]! > strength) strength = profile[j]!
      }
      peaks.push({
        position: weight > 0 ? moment / weight : (start + i - 1) / 2,
        strength,
      })
      start = -1
    }
  }

  return peaks
}

/**
 * The sides found on one axis, or null when that axis shows no border.
 *
 * Peaks are split by the centre of the frame, and the painting is taken to be
 * what contains that centre: whoever took the photo pointed the camera at the
 * artwork. That rule is what lets a painting whose border falls outside the
 * photograph be detected — with a single peak on the axis, the missing side is
 * the edge of the frame — instead of having to guess which of the two halves is
 * the painting.
 */
function axisEdges(profile: Float32Array, size: number): AxisEdges | null {
  const center = median(profile)
  const spread = MAD_TO_SIGMA * medianAbsoluteDeviation(profile, center)
  let strongest = 0
  for (let i = 0; i < profile.length; i += 1) {
    if (profile[i]! > strongest) strongest = profile[i]!
  }

  // No border on this axis. A painting has four straight sides; a photograph
  // with a gradient in one direction and nothing in the other is a stripe of
  // shadow, not a picture, and answering with the full width of the frame
  // would be answering with the frame.
  if (strongest - center < MIN_EDGE_STRENGTH) return null

  const threshold = Math.max(
    center + MAD_MULTIPLIER * spread,
    center + PROMINENCE_FRACTION * (strongest - center),
  )

  const peaks = findPeaks(profile, threshold)
  if (peaks.length === 0) return null

  const middle = (size - 1) / 2
  const low = peaks.filter((peak) => peak.position < middle)
  const high = peaks.filter((peak) => peak.position >= middle)

  // A pixel index becomes a fraction at the boundary between pixels, which is
  // where a border actually is: the centroid of a step at pixel `a` sits at
  // `a - 0.5`, and that is the fraction `a / size`.
  const fraction = (position: number) => (position + 0.5) / size

  return {
    outerLow: low.length > 0 ? fraction(low[0]!.position) : 0,
    outerHigh: high.length > 0 ? fraction(high[high.length - 1]!.position) : 1,
    innerLow: low.length > 1 ? fraction(low[1]!.position) : null,
    innerHigh: high.length > 1 ? fraction(high[high.length - 2]!.position) : null,
  }
}

function rectangle(
  horizontal: [number, number],
  vertical: [number, number],
): Crop {
  return {
    x: horizontal[0],
    y: vertical[0],
    width: horizontal[1] - horizontal[0],
    height: vertical[1] - vertical[0],
  }
}

/** Whether a rectangle can plausibly be the painting of the photograph. */
function looksLikeArtwork(crop: Crop, width: number, height: number): boolean {
  if (!(crop.width > 0) || !(crop.height > 0)) return false
  const area = crop.width * crop.height
  if (area < MIN_AREA || area > MAX_AREA) return false
  const ratio = (crop.width * width) / (crop.height * height)
  return ratio >= MIN_RATIO && ratio <= MAX_RATIO
}

/** Every side of `inner` at least `MIN_INSET` inside `outer`. */
function clearlyNested(outer: Crop, inner: Crop): boolean {
  return (
    inner.x - outer.x >= MIN_INSET &&
    inner.y - outer.y >= MIN_INSET &&
    outer.x + outer.width - (inner.x + inner.width) >= MIN_INSET &&
    outer.y + outer.height - (inner.y + inner.height) >= MIN_INSET
  )
}

/** The rectangle widened by the safety margin, never outside the image. */
function withMargin(crop: Crop): Crop {
  return clampCrop({
    x: crop.x - SAFETY_MARGIN,
    y: crop.y - SAFETY_MARGIN,
    width: crop.width + 2 * SAFETY_MARGIN,
    height: crop.height + 2 * SAFETY_MARGIN,
  })
}

/**
 * The crop or crops suggested for a photograph, or null when there is nothing
 * worth suggesting.
 *
 * `luminance` is one value per pixel in row order, `Uint8Array` as it comes out
 * of a canvas or `Float32Array` if it was computed. The rectangles are in
 * fractions (0..1) of the image received, which is the same `Crop` the editor
 * and the database use — with one caveat the caller owns: a crop is stored over
 * the ALREADY ROTATED image (see imageEdits.ts), so if the cataloger has a
 * rotation active, what comes out of here has to travel through `rotateCrop`
 * before it becomes the crop rectangle. `rotateSuggestion` does that.
 */
export function detectArtworkEdges(
  luminance: Uint8Array | Float32Array,
  width: number,
  height: number,
): EdgeSuggestion | null {
  if (!Number.isInteger(width) || !Number.isInteger(height)) return null
  if (width < MIN_SIZE || height < MIN_SIZE) return null
  if (luminance.length < width * height) return null

  const image = smooth(Float32Array.from(luminance), width, height)
  const { columns, rows } = projectionProfiles(image, width, height)

  const horizontal = axisEdges(columns, width)
  const vertical = axisEdges(rows, height)
  if (!horizontal || !vertical) return null

  const outer = rectangle(
    [horizontal.outerLow, horizontal.outerHigh],
    [vertical.outerLow, vertical.outerHigh],
  )
  if (!looksLikeArtwork(outer, width, height)) return null

  let inner: Crop | null = null
  if (
    horizontal.innerLow !== null &&
    horizontal.innerHigh !== null &&
    vertical.innerLow !== null &&
    vertical.innerHigh !== null
  ) {
    const candidate = rectangle(
      [horizontal.innerLow, horizontal.innerHigh],
      [vertical.innerLow, vertical.innerHigh],
    )
    if (looksLikeArtwork(candidate, width, height) && clearlyNested(outer, candidate)) {
      inner = candidate
    }
  }

  // The margin is added after the checks so that widening the rectangle cannot
  // be what makes it pass or fail them.
  return { outer: withMargin(outer), inner: inner ? withMargin(inner) : null }
}

/**
 * The same suggestion over the image turned `rotation` degrees clockwise.
 *
 * The detector reads the photograph as it was decoded, and the crop is expressed
 * over the already rotated image, so with a rotation active the two candidates
 * have to travel through the rotation before they can be drawn. The geometry is
 * `rotateCrop`, which already exists and is already tested; this only carries the
 * pair. It is also what the editor calls when the cataloger rotates AFTER asking
 * for a suggestion, so that choosing between frame and canvas keeps working.
 */
export function rotateSuggestion(
  suggestion: EdgeSuggestion,
  rotation: number,
): EdgeSuggestion {
  return {
    outer: rotateCrop(suggestion.outer, rotation),
    inner: suggestion.inner ? rotateCrop(suggestion.inner, rotation) : null,
  }
}
