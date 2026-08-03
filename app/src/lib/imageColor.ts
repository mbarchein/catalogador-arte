/**
 * The colour adjustment of a photograph: a closed set of parameters and the lookup
 * table they build.
 *
 * **This module is the normative definition of the colour of this catalog.** The
 * preview draws with an SVG `<filter>` and the export walks an `ImageData`, and
 * neither of them re-derives anything: both are transliterations of the tables
 * built here. Two implementations of the same arithmetic would drift, and the day
 * they drifted the cataloger would apply what she was not shown.
 *
 * The canonical chain, per channel `c` and per input code `i` in 0…255, in this
 * order and no other (RF-414):
 *
 *   1. `x = srgbToLinear(i / 255)` — the sRGB EOTF **with its linear segment**.
 *   2. `x *= gain_c(temperature, tint)` — white balance in linear light, with the
 *      three gains normalized so the largest is exactly 1.
 *   3. `x *= 2 ** exposure`.
 *   4. `x = shoulder(x)` when `shoulder > 0`.
 *   5. `y = linearToSrgb(x)`.
 *   6. `y = (y − black/255) / ((white − black)/255)`.
 *   7. `y = max(0, y) ** (1 / gamma)`.
 *   8. `lut[c][i] = clamp(round(y * 255), 0, 255)`.
 *
 * Steps 2, 3 and 4 are in **linear light** because that is where light adds up:
 * doubling the exposure of a photograph means twice the photons, and multiplying
 * the 8-bit code by two means nothing physical at all. Steps 6 and 7 are in
 * **encoded** sRGB because that is what they are for — the black and white points
 * and the midtones are read off the histogram the cataloger is looking at, which is
 * the encoded one.
 *
 * `gray` is the only step that is not per channel, so it cannot live in the tables:
 * it comes **after** them, as Rec. 709 luminance computed in linear light. See
 * `grayFromRgb`, and see `colorSvgTables` for how the preview gets the same result
 * out of a filter that is otherwise pinned to sRGB.
 *
 * The global canonical order is **geometry → downscale → colour**: the tables are
 * not folded into the bilinear loop of the perspective warp even though it would
 * cost nothing there, because that would put the colour before the downscale on one
 * path and after it on the other, and the thumbnail would stop matching the
 * derivative.
 *
 * **What is deliberately missing, and is a requirement and not an oversight**
 * (RF-415): there is no saturation, no vibrance, no global contrast, no per-range
 * or local adjustment of shadows and highlights, no sharpening, no dehaze, no
 * reflection removal, no sepia and no hue rotation. Not even present and disabled.
 * The reason is the domain: a varnish yellowed by a century and a pigment that has
 * lost its intensity are part of the **state of the artwork**, and that state is
 * precisely what a cataloguing photograph has to testify to. Reviving it would
 * catalogue an artwork that does not exist. What is allowed here is only what
 * undoes what the room did to the photograph — the colour of the bulb, the amount
 * of light, the range the phone chose — and never what the artwork did to itself.
 *
 * The stored adjustment is **absolute over the master and reversible**: re-editing
 * REPLACES these numbers and never composes onto them, exactly like the geometry
 * of imageEdits.ts, which is why a correction can be loosened, changed or dropped
 * in a year with the original untouched. And, like there, there is no DOM here on
 * purpose: this module is the arithmetic, and the arithmetic is the part that can
 * be tested for real.
 */

/* ------------------------------------------------------------------ transfer */

/**
 * sRGB EOTF: encoded value (0…1) to linear light.
 *
 * The **whole** curve, with the linear segment below 0.04045, and not `x ** 2.2`.
 * The difference is confined to the darkest codes, which is exactly where the
 * black point works: at code 4 the pure power law is off by 40 % of the linear
 * value, and that error walks back out through step 7 with a fractional exponent
 * amplifying it. The near-black of a photograph taken in a storeroom is not a
 * corner case here, it is the subject.
 */
export function srgbToLinear(value: number): number {
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
}

/** The inverse of `srgbToLinear`: linear light back to an encoded value (0…1). */
export function linearToSrgb(value: number): number {
  return value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055
}

/**
 * Rec. 709 luminance weights, the ones `gray` uses.
 *
 * They are applied in **linear light** and not to the codes. Averaging codes makes
 * a green that is far too dark and a blue that is far too light, and on a painting
 * that difference is the difference between reading a signature and not reading it.
 */
export const REC709 = { r: 0.2126, g: 0.7152, b: 0.0722 } as const

/* --------------------------------------------------------------------- types */

/** A colour in 8-bit sRGB codes, as the pixels come out of a canvas. */
export interface Rgb {
  r: number
  g: number
  b: number
}

/** The three linear-light multipliers of step 2. Never above 1: see `gainsFromNeutral`. */
export interface ChannelGains {
  r: number
  g: number
  b: number
}

/**
 * The white balance as the two numbers that are stored: the illuminant the
 * correction assumes, not the correction itself.
 */
export interface Neutral {
  temperature: number
  tint: number
}

/** A point in normalized coordinates (0…1) of the image it refers to. */
export interface Point {
  x: number
  y: number
}

/**
 * How the colour of a photograph came to be. Mirrors the `color_source` enum of the
 * schema: the values are code and the interface never shows them.
 *
 * `REVIEWED_UNCHANGED` exists because **«sin revisar» no es «no»**: with every
 * column null there is no way to tell «it was looked at with the artwork in front
 * and left alone» from «it was never looked at».
 */
export type ColorSource =
  | 'MANUAL'
  | 'NEUTRAL_PICKED'
  | 'AUTO'
  | 'AUTO_ADJUSTED'
  | 'PRESET'
  | 'REVIEWED_UNCHANGED'

/** Where the neutral reference came from (RF-418). Mirrors `color_reference`. */
export type ColorReference = 'TARGET_CARD' | 'TARGET_PRINT' | 'SCENE' | 'NONE'

/** The kind of light the photograph was taken under. Mirrors `light_preset`. */
export type LightPreset =
  | 'DAYLIGHT'
  | 'OVERCAST'
  | 'FLUORESCENT_COOL'
  | 'FLUORESCENT_WARM'
  | 'LED_NEUTRAL'
  | 'INCANDESCENT'
  | 'MIXED_WINDOW_CEILING'
  | 'FLASH'

/**
 * The colour adjustment of one photograph.
 *
 * Two groups of fields that must not be confused, because half the functions here
 * only look at one of them:
 *
 *  - **The look**: `temperature`, `tint`, `exposure`, `blackPoint`, `whitePoint`,
 *    `gamma`, `shoulder`, `gray`. These, and only these, build the tables and
 *    therefore decide the pixels. `isNoColor` and `sameColor` compare these.
 *  - **The provenance**: `neutral`, `source`, `reference`, `light`, `inherited`.
 *    These say where the numbers came from, they change nothing anybody can see,
 *    and they are what lets the interface say «heredado de la toma general» or
 *    «medido sobre una carta de grises» instead of showing seven anonymous numbers.
 *
 * Every field of the look has an **identity value**, so a missing parameter means
 * «this one does nothing» and never «unknown». That is what makes null the identity
 * in the row too, and what lets a photograph stored before this feature existed be
 * read without a migration of its data.
 */
export interface ColorEdit {
  /** −60…60, 0 is neutral. Positive warms the photograph. */
  temperature: number
  /** −40…40, 0 is neutral. Positive goes towards magenta, negative towards green. */
  tint: number
  /** −2…2 EV. */
  exposure: number
  /** 0…64, the encoded code that becomes black. */
  blackPoint: number
  /** 192…255, the encoded code that becomes white. */
  whitePoint: number
  /** 0.60…1.60. Above 1 lightens the midtones, below 1 darkens them. */
  gamma: number
  /** 0…100. How far down the highlights start being compressed. */
  shoulder: number
  /** Rec. 709 luminance, in linear light, after the tables. */
  gray: boolean
  /**
   * Where the eyedropper took its sample, in fractions (0…1) of the **already
   * rotated** image — the same normalized system as the crop and the corners, so
   * the row has one coordinate system and not three.
   *
   * **It is not the correction** — the correction is in `temperature` and `tint`;
   * this is the traceability of it, so that in a year it is possible to see that
   * the grey was taken off the cardboard under the label and not off the painting.
   */
  neutral?: Point | null
  source?: ColorSource | null
  reference?: ColorReference | null
  /** The preset chosen as a starting point, if there was one. */
  light?: LightPreset | null
  /** True when this adjustment was inherited from the general shot of the artwork. */
  inherited?: boolean
}

/** Anything that can be read as a colour adjustment, including nothing at all. */
export type ColorInput = Partial<ColorEdit> | null | undefined

/** The adjustment that changes nothing. Every field at its identity value. */
export const NO_COLOR: ColorEdit = {
  temperature: 0,
  tint: 0,
  exposure: 0,
  blackPoint: 0,
  whitePoint: 255,
  gamma: 1,
  shoulder: 0,
  gray: false,
  neutral: null,
  source: null,
  reference: null,
  light: null,
  inherited: false,
}

/** The parameters that have a value strip in the interface. */
export type ColorParam =
  | 'temperature'
  | 'tint'
  | 'exposure'
  | 'blackPoint'
  | 'whitePoint'
  | 'gamma'
  | 'shoulder'

export interface ColorRange {
  /** The label the cataloger reads. Spanish, and it is the one in the interface. */
  label: string
  min: number
  max: number
  /** One notch of the strip, one press of an arrow key. */
  step: number
  /** The identity value, and where a double tap returns to. */
  default: number
  /** Decimals the value is written with, both on screen and in the column. */
  decimals: number
}

/**
 * The closed table of §3.1 of the specification, in one place.
 *
 * It lives here and not in the panel because it is the definition and not the
 * presentation: the same numbers bound the strips, the arrow keys, the clamping
 * before the database and the check constraints of the migration. A panel with its
 * own copy of the limits is a panel that will one day offer a value the row
 * refuses.
 */
export const COLOR_RANGES: Readonly<Record<ColorParam, ColorRange>> = {
  temperature: { label: 'Temperatura', min: -60, max: 60, step: 1, default: 0, decimals: 0 },
  tint: { label: 'Matiz', min: -40, max: 40, step: 1, default: 0, decimals: 0 },
  // The step is a sixth of a stop, which is the notch of the strip; what is stored
  // is `numeric(3,2)`, so 1/6 EV lands on 0,17 and the round trip is exact.
  exposure: { label: 'Exposición', min: -2, max: 2, step: 1 / 6, default: 0, decimals: 2 },
  blackPoint: { label: 'Negros', min: 0, max: 64, step: 1, default: 0, decimals: 0 },
  whitePoint: { label: 'Blancos', min: 192, max: 255, step: 1, default: 255, decimals: 0 },
  gamma: { label: 'Medios tonos', min: 0.6, max: 1.6, step: 0.05, default: 1, decimals: 2 },
  shoulder: { label: 'Altas luces suaves', min: 0, max: 100, step: 5, default: 0, decimals: 0 },
}

/** Label of the only switch, which has no range. */
export const GRAY_LABEL = 'Blanco y negro'

/* ------------------------------------------------------------------- clamping */

/**
 * The same discipline as imageEdits.ts: nothing that is not a finite number gets
 * past this line. A `NaN` in a gain does not throw, it silently fills a whole
 * channel of the table with zeros, and the photograph comes out with one channel
 * blank — which is discovered in the bucket and not in the editor.
 */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function clamp(value: number, min: number, max: number): number {
  if (max < min) return min
  return Math.min(Math.max(value, min), max)
}

/** Rounds to `decimals`, which is what the `numeric` column can hold. */
function quantize(value: number, decimals: number): number {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

/** Room for the float noise of a `numeric` round trip before a value is out of range. */
const RANGE_TOLERANCE = 1e-9

/**
 * A value read as stored: in range and at the precision of its column, or the
 * **identity** if it is not a number or falls outside its range.
 *
 * Out of range reads as the identity and not as the nearest end, and the two cases
 * are the same case: nothing legitimate can produce either. Every strip is bounded
 * by `COLOR_RANGES`, every preset is inside it, the automatic clamps and the
 * eyedropper clamps, and the row carries a `check` per column. So a value out of
 * range is corrupt data, and of the two readings the identity is the one that shows
 * the photograph as it is instead of showing it wildly altered on the strength of a
 * number nobody wrote — the same forgiveness `editFromColumns` applies to a crop the
 * database could not have accepted.
 *
 * What clamps is `clampColorParam`, which is what a gesture uses.
 */
function param(value: unknown, key: ColorParam): number {
  const range = COLOR_RANGES[key]
  const number = finite(value, range.default)
  if (number < range.min - RANGE_TOLERANCE || number > range.max + RANGE_TOLERANCE) {
    return range.default
  }
  return quantize(clamp(number, range.min, range.max), range.decimals)
}

/**
 * A value brought into its range and its precision, for whoever is producing it:
 * a finger that overshot the end of the strip, a preset, a measurement.
 *
 * This is the counterpart of the rule above: the interface clamps here, and by the
 * time a number reaches `normalizeColor` it is already inside its range, so an
 * out-of-range value there really is corruption.
 */
export function clampColorParam(key: ColorParam, value: number): number {
  const range = COLOR_RANGES[key]
  return quantize(clamp(finite(value, range.default), range.min, range.max), range.decimals)
}

const COLOR_SOURCES: readonly ColorSource[] = [
  'MANUAL',
  'NEUTRAL_PICKED',
  'AUTO',
  'AUTO_ADJUSTED',
  'PRESET',
  'REVIEWED_UNCHANGED',
]

const COLOR_REFERENCES: readonly ColorReference[] = ['TARGET_CARD', 'TARGET_PRINT', 'SCENE', 'NONE']

/** Tolerance when comparing the two decimals that travelled through `numeric`. */
const EPSILON = 1e-9

/** Coordinates of the neutral point: `numeric(6,5)`. */
const NEUTRAL_DECIMALS = 5

/**
 * Canonical form for storing, comparing and building tables.
 *
 * Every parameter goes through `param`, so **`NaN`, `Infinity` and anything outside
 * its range all read as that parameter's identity** — not as the nearest end of the
 * scale. The reasoning is in `param`: nothing legitimate can produce any of the
 * three, so all three are corruption, and of the readings available the identity is
 * the one that shows the photograph as it is. Whoever is PRODUCING a value that may
 * overshoot —a finger dragged past the end of a strip— clamps with
 * `clampColorParam` before getting here.
 */
export function normalizeColor(color: ColorInput): ColorEdit {
  if (!color) return { ...NO_COLOR }
  const neutralX = color.neutral ? finite(color.neutral.x, NaN) : NaN
  const neutralY = color.neutral ? finite(color.neutral.y, NaN) : NaN
  // Both coordinates or neither: the row refuses half a point
  // (`num_nonnulls(color_neutral_x, color_neutral_y) in (0, 2)`), and half a point
  // is not a place anybody can go back to. Outside the image it is dropped rather
  // than pulled to the edge: this field exists so that in a year it is possible to
  // see WHERE the grey was taken, and a coordinate moved to the border would point
  // at a pixel nobody sampled.
  const inside = (value: number) => Number.isFinite(value) && value >= 0 && value <= 1
  const neutral =
    inside(neutralX) && inside(neutralY)
      ? { x: quantize(neutralX, NEUTRAL_DECIMALS), y: quantize(neutralY, NEUTRAL_DECIMALS) }
      : null
  return {
    temperature: param(color.temperature, 'temperature'),
    tint: param(color.tint, 'tint'),
    exposure: param(color.exposure, 'exposure'),
    blackPoint: param(color.blackPoint, 'blackPoint'),
    whitePoint: param(color.whitePoint, 'whitePoint'),
    gamma: param(color.gamma, 'gamma'),
    shoulder: param(color.shoulder, 'shoulder'),
    gray: color.gray === true,
    neutral,
    source: COLOR_SOURCES.includes(color.source as ColorSource) ? (color.source as ColorSource) : null,
    reference: COLOR_REFERENCES.includes(color.reference as ColorReference)
      ? (color.reference as ColorReference)
      : null,
    light: LIGHT_PRESETS.some((preset) => preset.value === color.light)
      ? (color.light as LightPreset)
      : null,
    inherited: color.inherited === true,
  }
}

/**
 * True when the adjustment changes no pixel.
 *
 * It looks at the look and ignores the provenance on purpose: an adjustment that
 * says «reviewed and left alone» is still, for the pixels, nothing at all, and the
 * files must not be rewritten for it.
 */
export function isNoColor(color: ColorInput): boolean {
  const c = normalizeColor(color)
  return (
    c.temperature === 0 &&
    c.tint === 0 &&
    Math.abs(c.exposure) <= EPSILON &&
    c.blackPoint === 0 &&
    c.whitePoint === 255 &&
    Math.abs(c.gamma - 1) <= EPSILON &&
    c.shoulder === 0 &&
    !c.gray
  )
}

/**
 * True when two adjustments produce the same picture.
 *
 * Same criterion as `isNoColor` and for the same reason: this is what decides
 * whether the derivatives have to be regenerated, and two adjustments that differ
 * only in where their grey was measured are the same picture — and a different row.
 * Whoever needs to know if the ROW changed compares the columns.
 */
export function sameColor(a: ColorInput, b: ColorInput): boolean {
  const x = normalizeColor(a)
  const y = normalizeColor(b)
  return (
    x.temperature === y.temperature &&
    x.tint === y.tint &&
    Math.abs(x.exposure - y.exposure) <= EPSILON &&
    x.blackPoint === y.blackPoint &&
    x.whitePoint === y.whitePoint &&
    Math.abs(x.gamma - y.gamma) <= EPSILON &&
    x.shoulder === y.shoulder &&
    x.gray === y.gray
  )
}

/* -------------------------------------------------------------- white balance */

/**
 * How many stops each end of the temperature scale moves the red and the blue
 * channel, in opposite directions.
 *
 * The full scale therefore spans **1.5 stops of R/B ratio** each way, a factor of
 * 2.83. That is measured against what is actually needed: the phone has already
 * applied its own white balance, and what is left over on a photograph taken under
 * a bulb is a red-to-blue ratio around 2.4 — 1.26 stops, which lands at 50 of the
 * 60 available. Wider would waste the scale; narrower would clip the one case the
 * feature exists for. One notch is 0.025 stops of ratio, under half a code at mid
 * grey, so the quantization of a smallint is not what limits the eyedropper.
 */
const TEMPERATURE_STOPS = 0.75

/** The same for the green–magenta axis, whose real casts are much smaller. */
const TINT_STOPS = 0.35

/**
 * The three linear-light gains of step 2, from the illuminant the two sliders
 * describe.
 *
 * **Normalized so the largest gain is exactly 1.** That is a decision with a
 * consequence: correcting a colour cast can only ever darken, so it can never
 * clip a highlight by itself. Anything that ends up blown was blown by the
 * exposure or was blown in the master, which is what the cataloger is told. The
 * price is that a strong correction darkens the photograph and the exposure has to
 * be raised afterwards; that is visible and reversible, whereas a highlight
 * destroyed by a gain above 1 is neither.
 *
 * The parameterization is symmetric on purpose: temperature moves red up and blue
 * down by the same number of stops, tint moves green alone. That is what makes
 * `neutralFromSample` invertible in closed form, and the two functions have to be
 * exact inverses or the eyedropper would leave a residual cast.
 */
export function gainsFromNeutral(neutral: Partial<Neutral> | null | undefined): ChannelGains {
  // Clamped and not dropped, unlike when a row is read: whoever asks for the gains
  // of a pair of values is asking what they mean, and the end of the scale is the
  // closest true answer.
  const temperature =
    clampColorParam('temperature', finite(neutral?.temperature, 0)) / COLOR_RANGES.temperature.max
  const tint = clampColorParam('tint', finite(neutral?.tint, 0)) / COLOR_RANGES.tint.max
  const r = 2 ** (TEMPERATURE_STOPS * temperature)
  const g = 2 ** (-TINT_STOPS * tint)
  const b = 2 ** (-TEMPERATURE_STOPS * temperature)
  const max = Math.max(r, g, b)
  return { r: r / max, g: g / max, b: b / max }
}

/** Side of the patch the eyedropper averages, in pixels of the image it samples. */
export const NEUTRAL_PATCH = 9

/** Channels at or beyond these codes carry no usable colour: see `neutralFromSample`. */
const SAMPLE_MAX = 250
const SAMPLE_MIN = 5

/**
 * The median of a patch of pixels, per channel. Null when there are no pixels.
 *
 * **The median and not the mean** (§3.5): a specular highlight on the varnish or a
 * single dust pixel ruins a mean of 81 samples, and the cataloger has no way of
 * seeing that it did. The median of the same patch does not move. With an even
 * count it is the lower of the two central values, which for a neutral reference
 * is a distinction without a difference.
 *
 * `pixels` is interleaved as it comes out of a canvas, `channels` wide (4 for
 * `ImageData`). Fully transparent pixels do not vote: their colour is whatever was
 * left in the buffer.
 */
export function patchMedian(
  pixels: Uint8Array | Uint8ClampedArray | readonly number[],
  channels = 4,
): Rgb | null {
  const stride = Math.max(3, Math.trunc(finite(channels, 4)))
  const red = new Int32Array(256)
  const green = new Int32Array(256)
  const blue = new Int32Array(256)
  let count = 0
  for (let i = 0; i + stride <= pixels.length; i += stride) {
    if (stride >= 4 && (pixels[i + 3] ?? 255) < 8) continue
    bump(red, code8(pixels[i]))
    bump(green, code8(pixels[i + 1]))
    bump(blue, code8(pixels[i + 2]))
    count += 1
  }
  if (count === 0) return null
  return {
    r: medianFromHistogram(red, count),
    g: medianFromHistogram(green, count),
    b: medianFromHistogram(blue, count),
  }
}

/** Whatever came out of the buffer, as a code that can index a histogram. */
function code8(value: unknown): number {
  return clamp(Math.round(finite(value, 0)), 0, 255)
}

function bump(histogram: Int32Array, code: number): void {
  histogram[code] = (histogram[code] ?? 0) + 1
}

function medianFromHistogram(histogram: Int32Array, count: number): number {
  const target = count / 2
  let cumulative = 0
  for (let code = 0; code < 256; code += 1) {
    cumulative += histogram[code] ?? 0
    if (cumulative >= target) return code
  }
  return 255
}

/**
 * The two sliders that turn a sampled grey into grey, or null when the sample
 * cannot say anything.
 *
 * **It refuses the sample when any channel is at or above 250 or at or below 5**
 * (§3.5). Both ends lie for the same reason: a channel that clipped has lost how
 * far past the top it went, and one buried in the noise floor has lost its ratio
 * to the others. Either way what comes out is a number that looks measured and is
 * not, and the specification is explicit that a wrong suggestion is worse than
 * none.
 *
 * The inversion is closed form because the gain model is symmetric: with gains
 * proportional to the inverse of the sample, the temperature falls out of the
 * red-to-blue ratio and the tint out of how far green sits from the geometric mean
 * of the other two. Nothing iterative, nothing to converge, the same answer on
 * every machine and in the Python pipeline.
 */
export function neutralFromSample(sample: Rgb | null | undefined): Neutral | null {
  if (!sample) return null
  const codes = [finite(sample.r, NaN), finite(sample.g, NaN), finite(sample.b, NaN)]
  if (codes.some((code) => !Number.isFinite(code))) return null
  if (codes.some((code) => code >= SAMPLE_MAX || code <= SAMPLE_MIN)) return null
  const [red, green, blue] = codes.map((code) => srgbToLinear(clamp(code, 0, 255) / 255)) as [
    number,
    number,
    number,
  ]
  if (!(red > 0) || !(green > 0) || !(blue > 0)) return null
  const temperature = Math.log2(blue / red) / (2 * TEMPERATURE_STOPS)
  const tint = Math.log2(green / Math.sqrt(red * blue)) / TINT_STOPS
  // Clamped, because a cast can be worse than the scale: what comes out is then the
  // strongest correction available, which is what the cataloger would reach by
  // dragging to the end. The interface says the sample was extreme; it does not
  // pretend the sample was neutral.
  return {
    temperature: clampColorParam('temperature', Math.round(temperature * COLOR_RANGES.temperature.max)),
    tint: clampColorParam('tint', Math.round(tint * COLOR_RANGES.tint.max)),
  }
}

/**
 * The adjustment after the cataloger touched a grey with the eyedropper.
 *
 * Everything else is kept: the eyedropper only ever writes the white balance and
 * the traceability of it. Null when the sample was refused, and then the caller
 * has to say so instead of quietly doing nothing.
 *
 * `reference` defaults to `SCENE` because that is what a grey touched on the
 * photograph is — a wall, the cardboard under a label, the cloth on the easel. It
 * is only `TARGET_CARD` or `TARGET_PRINT` when the target was recognized and
 * declared, and `TARGET_PRINT` is recorded but **not believed for the cast**:
 * household ink is not neutral (see `referenceTrustsGray`).
 *
 * `at` is where the finger landed, in fractions of the already rotated image, and
 * it is recorded and not used: what corrects the photograph is the sample.
 */
export function withNeutralPick(
  color: ColorInput,
  sample: Rgb | null | undefined,
  at: Point | null | undefined,
  reference: ColorReference = 'SCENE',
): ColorEdit | null {
  const neutral = neutralFromSample(sample)
  if (!neutral) return null
  const base = normalizeColor(color)
  return normalizeColor({
    ...base,
    temperature: neutral.temperature,
    tint: neutral.tint,
    neutral: at ? { x: at.x, y: at.y } : null,
    source: 'NEUTRAL_PICKED',
    reference,
  })
}

/**
 * Whether the grey of a reference may be believed as a measurement of the cast
 * (§4).
 *
 * A printed sheet is recorded as what it is and used for what it is good for — the
 * pattern that proves a target was in the frame, and the black and white points,
 * which only need uniform patches. Its hue is the hue of a domestic inkjet, so
 * taking the cast from it would replace the colour of the bulb with the colour of
 * the ink.
 */
export function referenceTrustsGray(reference: ColorReference | null | undefined): boolean {
  return reference === 'TARGET_CARD' || reference === 'SCENE'
}

/* -------------------------------------------------------------------- tables */

/** How far down from white the shoulder reaches at `shoulder = 100`. */
const SHOULDER_DEPTH = 0.4

/**
 * Monotone compression of everything above the knee (step 4).
 *
 * An exponential approach to 1: continuous, with slope exactly 1 at the knee so
 * nothing kinks, strictly increasing, and with 1 as an asymptote it never reaches
 * it. That last part is what the parameter is for — after raising the exposure,
 * the highlights that would land past 1 keep their differences instead of
 * flattening into a single white, which on a varnished painting is the difference
 * between a lit surface and a hole in the photograph.
 *
 * The consequence, and it is intended: white itself comes out slightly below
 * white. Any monotone map of `[knee, ∞)` into `[knee, 1)` has to move it, and a
 * highlight that is compressed and readable is worth more than one that is
 * nominally 255.
 */
function compressShoulder(x: number, knee: number): number {
  const range = 1 - knee
  if (range <= 0 || x <= knee) return x
  return knee + range * (1 - Math.exp(-(x - knee) / range))
}

/**
 * The three lookup tables, plus whether the luminance step follows them.
 *
 * 256 entries of 8 bits each: the whole adjustment of a photograph is 768 bytes,
 * built once per change and then read once per pixel. That is why there is a table
 * at all instead of the arithmetic per pixel — the chain has two powers in it, and
 * a 24-megapixel master would evaluate them 72 million times.
 */
export interface ColorLuts {
  r: Uint8Array
  g: Uint8Array
  b: Uint8Array
  /** Rec. 709 luminance in linear light, applied AFTER the tables. */
  gray: boolean
}

/**
 * The canonical chain of §3.2, turned into three tables. This function is the
 * definition; everything that shows or writes pixels reads it.
 */
export function buildColorLuts(color: ColorInput): ColorLuts {
  const c = normalizeColor(color)
  const gains = gainsFromNeutral(c)
  const exposure = 2 ** c.exposure
  const knee = 1 - SHOULDER_DEPTH * (c.shoulder / 100)
  const black = c.blackPoint / 255
  // The span is never zero: the ranges of the two points guarantee at least 128
  // codes between them, which is also the check constraint the row carries.
  const span = (c.whitePoint - c.blackPoint) / 255
  const inverseGamma = 1 / c.gamma

  const table = (gain: number): Uint8Array => {
    const lut = new Uint8Array(256)
    for (let i = 0; i < 256; i += 1) {
      // 1. encoded code to linear light, with the linear segment of the EOTF.
      let x = srgbToLinear(i / 255)
      // 2. white balance, in linear light and with gains that never exceed 1.
      x *= gain
      // 3. exposure, which is a multiplication of light and nothing else.
      x *= exposure
      // 4. the shoulder, before encoding, so it compresses light and not codes.
      if (c.shoulder > 0) x = compressShoulder(x, knee)
      // 5. back to encoded sRGB: the black and white points and the midtones are
      //    read off the encoded histogram, which is the one on screen.
      let y = linearToSrgb(x)
      // 6. the two points, mapping [black, white] onto [0, 1].
      y = (y - black) / span
      // 7. midtones. `max(0, …)` is NOT defensive: below the black point y IS
      //    negative, and a negative to a fractional power is `NaN`, which would
      //    reach the table as a whole channel of zeros — a photograph with one
      //    channel blank, discovered in the bucket and not here.
      y = Math.max(0, y) ** inverseGamma
      // 8. and back to a code.
      lut[i] = clamp(Math.round(y * 255), 0, 255)
    }
    return lut
  }

  return { r: table(gains.r), g: table(gains.g), b: table(gains.b), gray: c.gray }
}

/**
 * Rec. 709 luminance of a colour, in linear light, as a code.
 *
 * This is the `gray` step, and it goes after the tables because it needs the three
 * channels at once. In linear light because luminance is a sum of light: on the
 * codes, the same painting would come out with its greens crushed and its blues
 * lifted, and the point of a black and white photograph of a signature is the
 * legibility of the stroke.
 */
export function grayFromRgb(r: number, g: number, b: number): number {
  const linear =
    REC709.r * srgbToLinear(clamp(finite(r, 0), 0, 255) / 255) +
    REC709.g * srgbToLinear(clamp(finite(g, 0), 0, 255) / 255) +
    REC709.b * srgbToLinear(clamp(finite(b, 0), 0, 255) / 255)
  return clamp(Math.round(linearToSrgb(linear) * 255), 0, 255)
}

/** One pixel through the tables and, if it is on, the luminance step. */
export function applyColorToRgb(luts: ColorLuts, r: number, g: number, b: number): Rgb {
  const code = (value: number) => clamp(Math.round(finite(value, 0)), 0, 255)
  const red = luts.r[code(r)] ?? 0
  const green = luts.g[code(g)] ?? 0
  const blue = luts.b[code(b)] ?? 0
  if (!luts.gray) return { r: red, g: green, b: blue }
  const gray = grayFromRgb(red, green, blue)
  return { r: gray, g: gray, b: gray }
}

/**
 * The tables over an interleaved RGBA buffer, in place.
 *
 * In place and returning the same array because the buffer it is called with is
 * the `ImageData` of the canvas that is about to be drawn: copying a 2000 px
 * derivative to hand it back would double the peak memory of the export on the
 * phone, which is the device this runs on. Alpha is not touched — it is not part
 * of the adjustment, and a JPEG master does not have one anyway.
 */
export function applyColorLuts<T extends Uint8Array | Uint8ClampedArray>(
  luts: ColorLuts,
  data: T,
): T {
  for (let i = 0; i + 4 <= data.length; i += 4) {
    const red = luts.r[data[i] ?? 0] ?? 0
    const green = luts.g[data[i + 1] ?? 0] ?? 0
    const blue = luts.b[data[i + 2] ?? 0] ?? 0
    if (luts.gray) {
      const gray = grayFromRgb(red, green, blue)
      data[i] = gray
      data[i + 1] = gray
      data[i + 2] = gray
    } else {
      data[i] = red
      data[i + 1] = green
      data[i + 2] = blue
    }
  }
  return data
}

/* ---------------------------------------------------------------- svg preview */

/**
 * What the preview filter needs, as attribute values ready to be written.
 *
 * Strings and not numbers because that is what an SVG attribute is, and because
 * the whole point of this function is that the preview does not compute anything:
 * it writes down the same table the export applies.
 */
export interface ColorSvgTables {
  /** `tableValues` of `feFuncR`: 256 values in 0…1, space separated. */
  r: string
  /** `tableValues` of `feFuncG`. */
  g: string
  /** `tableValues` of `feFuncB`. */
  b: string
  /**
   * **Mandatory on the filter.** By default a filter interpolates in linearRGB,
   * and a table indexed by 8-bit sRGB codes applied to linearized values is a
   * different curve — wrong in the shadows, which is where the black point works.
   * It is the silent failure number one of this feature: nothing throws, the
   * preview simply stops matching the file that gets written.
   */
  colorInterpolationFilters: 'sRGB'
  /**
   * The `gray` step as an `feColorMatrix`, or null.
   *
   * It carries **its own** interpolation space, and it is the opposite one: in
   * `linearRGB` the browser linearizes, applies the matrix and encodes back, which
   * is exactly Rec. 709 luminance in linear light — the same thing `grayFromRgb`
   * computes by hand. Written in sRGB it would be a different, darker grey, and
   * the preview would disagree with the exported file.
   */
  grayMatrix: { values: string; colorInterpolationFilters: 'linearRGB' } | null
}

const GRAY_MATRIX_VALUES = [
  `${REC709.r} ${REC709.g} ${REC709.b} 0 0`,
  `${REC709.r} ${REC709.g} ${REC709.b} 0 0`,
  `${REC709.r} ${REC709.g} ${REC709.b} 0 0`,
  '0 0 0 1 0',
].join(' ')

/**
 * The adjustment as the attributes of an inline `<filter>`.
 *
 * **All 256 entries, not a subsample.** `feFunc type="table"` interpolates
 * linearly between the values it is given, and with a gamma of 0.6 the curve
 * between codes 0 and 8 is steep enough that a 33-entry table lands almost ten
 * levels away from the real one — precisely where the black point works and
 * precisely where the cataloger is judging whether the shadow of a frame is
 * blocked up. 256 entries is about 6 KB of attribute, rebuilt when a value is
 * released and not while the finger moves.
 */
export function colorSvgTables(color: ColorInput): ColorSvgTables {
  const luts = buildColorLuts(color)
  return {
    r: tableValues(luts.r),
    g: tableValues(luts.g),
    b: tableValues(luts.b),
    colorInterpolationFilters: 'sRGB',
    grayMatrix: luts.gray
      ? { values: GRAY_MATRIX_VALUES, colorInterpolationFilters: 'linearRGB' }
      : null,
  }
}

/**
 * A table of codes as `tableValues`: fractions of 1, five decimals, no trailing
 * zeros.
 *
 * Five decimals is a tenth of a code, well under what the browser can show, and
 * dropping the trailing zeros takes the three attributes from 6 KB to about 4 KB
 * of DOM that is rewritten on every release of the finger.
 */
function tableValues(lut: Uint8Array): string {
  const values: string[] = []
  for (let i = 0; i < lut.length; i += 1) {
    values.push(String(Math.round(((lut[i] ?? 0) / 255) * 1e5) / 1e5))
  }
  return values.join(' ')
}

/* -------------------------------------------------------------------- presets */

export interface LightPresetOption {
  value: LightPreset
  /** The label the cataloger reads. */
  label: string
  temperature: number
  tint: number
}

/**
 * The kinds of light, as a list of options (decision 5 of the specification).
 *
 * **They are a starting point and never a measurement**, and the interface says
 * so: the cataloger picks the light she remembers being under, the two sliders
 * jump to a plausible place, and from there she corrects by eye or with the
 * eyedropper. Nothing here is deduced from the pixels — the deduction is
 * `autoColorFrom`, which is a different thing and says what it did.
 *
 * The numbers are the direction and the rough size of what each light leaves
 * behind AFTER the phone has applied its own white balance, which is why they are
 * far smaller than the difference between the illuminants themselves. Daylight is
 * zero because it is the reference the phone is calibrated for: choosing it
 * changes no pixel and still records what the photograph was taken under.
 */
export const LIGHT_PRESETS: readonly LightPresetOption[] = [
  { value: 'DAYLIGHT', label: 'Luz de ventana', temperature: 0, tint: 0 },
  // The blue of an overcast sky is the one cast the phone tends to leave in.
  { value: 'OVERCAST', label: 'Día nublado', temperature: 10, tint: 0 },
  // Fluorescent tubes: cool and green, and the green is the part nobody notices
  // until the whites of a label go olive.
  { value: 'FLUORESCENT_COOL', label: 'Fluorescente blanco frío', temperature: 12, tint: 10 },
  { value: 'FLUORESCENT_WARM', label: 'Fluorescente cálido', temperature: -14, tint: 8 },
  { value: 'LED_NEUTRAL', label: 'LED neutro', temperature: 0, tint: 4 },
  // A bulb is the biggest residue of all, and the one this feature exists for.
  { value: 'INCANDESCENT', label: 'Bombilla incandescente', temperature: -34, tint: -5 },
  { value: 'MIXED_WINDOW_CEILING', label: 'Mezcla de ventana y techo', temperature: -12, tint: 4 },
  { value: 'FLASH', label: 'Flash del móvil', temperature: -8, tint: 4 },
]

/** The label of a preset, or null if the value is not one. Never a raw enum on screen. */
export function lightPresetLabel(light: LightPreset | null | undefined): string | null {
  return LIGHT_PRESETS.find((preset) => preset.value === light)?.label ?? null
}

/**
 * The adjustment after choosing a kind of light: the white balance moves to the
 * starting point and everything else is kept, because the light says nothing about
 * the exposure or the range.
 */
export function colorFromLightPreset(color: ColorInput, light: LightPreset): ColorEdit {
  const preset = LIGHT_PRESETS.find((option) => option.value === light)
  const base = normalizeColor(color)
  if (!preset) return base
  return normalizeColor({
    ...base,
    temperature: preset.temperature,
    tint: preset.tint,
    // The preset is not a measurement, so it does not claim a reference; the grey
    // it assumes came from nowhere but a list.
    neutral: null,
    reference: 'NONE',
    source: 'PRESET',
    light: preset.value,
  })
}

/* ------------------------------------------------------------------ automatic */

/** Codes this close to an end mean the histogram already reaches it. */
const REACHED_END = 2

/** Encoded mid grey the automatic aims the median at (§3.4). */
const AUTO_TARGET = 0.45

/** The automatic is half as bold as the hand: ±1 EV of the ±2 available. */
const AUTO_EXPOSURE_LIMIT = 1

/** Luminance codes that count as the central third. */
const CENTRAL_LOW = 85
const CENTRAL_HIGH = 170

/** How far a pixel's channels may spread, relative to its own maximum, and still be grey. */
const ACHROMATIC_SPREAD = 0.06

/** Fraction of the frame that has to be believably grey before the balance is touched. */
const ACHROMATIC_FRACTION = 0.005

export interface AutoColorProposal {
  /** The proposal, absolute over the master. Identity wherever it declined. */
  color: ColorEdit
  /** True when the black and white points were moved. */
  movedLevels: boolean
  /** True when the exposure was moved. */
  movedExposure: boolean
  /** True when the white balance was proposed. */
  movedWhiteBalance: boolean
  /**
   * What to tell the cataloger about what it did NOT do, in Spanish, or null when
   * it proposed everything. Never a blank panel: if the automatic declines, the
   * help line says which part it declined and why.
   */
  notice: string | null
  /**
   * The measurements behind the decision. For the bench and for the histogram
   * panel, not for the interface: the cataloger is told what was left alone, never
   * which constant said so.
   */
  detail: Record<string, number>
}

/**
 * The adjustment the automatic proposes for a frame, and everything it refused to
 * propose (§3.4).
 *
 * `pixels` are the pixels **of the chosen frame** and not of the whole photograph,
 * interleaved and `channels` wide: the wall around a painting, or the cardboard it
 * leans on, would otherwise set the black point and the median of an artwork that
 * is a third of the frame. The caller crops first, on a reduced copy.
 *
 * **And it keeps quiet.** Where the specification says the automatic must not
 * touch something, it does not touch it and it says so: the levels when the
 * histogram already reaches both ends, and the white balance when the frame has
 * less than half a percent of believably grey pixels. That is not caution for its
 * own sake — a suggestion pulled out of a frame with no grey in it looks exactly
 * like a measurement, and the cataloger has no way to tell it apart from one.
 */
export function autoColorFrom(
  pixels: Uint8Array | Uint8ClampedArray | readonly number[],
  channels = 4,
): AutoColorProposal {
  const stride = Math.max(3, Math.trunc(finite(channels, 4)))
  const luminance = new Int32Array(256)
  // Histograms of the grey candidates, per channel: a median without a growing
  // array, which matters because this is called with the pixels of a whole frame.
  const neutralRed = new Int32Array(256)
  const neutralGreen = new Int32Array(256)
  const neutralBlue = new Int32Array(256)
  let total = 0
  let achromatic = 0

  for (let i = 0; i + stride <= pixels.length; i += stride) {
    if (stride >= 4 && (pixels[i + 3] ?? 255) < 8) continue
    const r = code8(pixels[i])
    const g = code8(pixels[i + 1])
    const b = code8(pixels[i + 2])
    total += 1
    // Luminance in codes, because the two points and the median are read on the
    // encoded histogram, which is the one the cataloger sees.
    const y = clamp(Math.round(REC709.r * r + REC709.g * g + REC709.b * b), 0, 255)
    bump(luminance, y)
    if (y < CENTRAL_LOW || y > CENTRAL_HIGH) continue
    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    // Relative to the pixel's own maximum, not to 255: fifteen codes of spread is
    // a faint cast on a light grey and a violent one on a dark one, and the same
    // absolute threshold would count the second as neutral.
    if (max <= 0 || (max - min) / max >= ACHROMATIC_SPREAD) continue
    achromatic += 1
    bump(neutralRed, r)
    bump(neutralGreen, g)
    bump(neutralBlue, b)
  }

  if (total === 0) {
    return {
      color: { ...NO_COLOR },
      movedLevels: false,
      movedExposure: false,
      movedWhiteBalance: false,
      notice: 'No se han podido medir los píxeles del encuadre.',
      detail: { pixels: 0 },
    }
  }

  const low = percentileCode(luminance, total, 0.001)
  const high = percentileCode(luminance, total, 0.999)
  const median = percentileCode(luminance, total, 0.5)
  const reachesBothEnds = low <= REACHED_END && high >= 255 - REACHED_END

  // The percentiles, capped where §3.4 caps them. Note the cap is also the end of
  // the slider's range, so the automatic can never propose a value the cataloger
  // could not have reached by hand.
  const blackPoint = reachesBothEnds ? 0 : Math.min(low, COLOR_RANGES.blackPoint.max)
  const whitePoint = reachesBothEnds ? 255 : Math.max(high, COLOR_RANGES.whitePoint.min)

  // The median read as an encoded value against an encoded target, and the ratio
  // taken as a count of stops. That undershoots on purpose — a photograph whose
  // median sits at 0,30 gets +0,58 EV where landing exactly on 0,45 would need
  // +1,23 — and undershooting is the whole point: the automatic is a starting
  // point that has to be safe to accept without looking twice.
  const exposure =
    median > 0
      ? clamp(Math.log2(AUTO_TARGET / (median / 255)), -AUTO_EXPOSURE_LIMIT, AUTO_EXPOSURE_LIMIT)
      : 0

  const enoughGrey = achromatic / total >= ACHROMATIC_FRACTION
  const neutral = enoughGrey
    ? neutralFromSample({
        r: medianFromHistogram(neutralRed, achromatic),
        g: medianFromHistogram(neutralGreen, achromatic),
        b: medianFromHistogram(neutralBlue, achromatic),
      })
    : null

  const color = normalizeColor({
    temperature: neutral?.temperature ?? 0,
    tint: neutral?.tint ?? 0,
    exposure,
    blackPoint,
    whitePoint,
    source: 'AUTO',
    // The grey it used came out of the scene, which is what it is: statistics over
    // the pixels of the frame, not a target anybody put there.
    reference: neutral ? 'SCENE' : 'NONE',
  })

  const movedLevels = color.blackPoint !== 0 || color.whitePoint !== 255
  const movedExposure = Math.abs(color.exposure) > EPSILON
  const movedWhiteBalance = neutral !== null && (color.temperature !== 0 || color.tint !== 0)

  const notices: string[] = []
  if (!enoughGrey) {
    notices.push(
      'No se ha encontrado en el encuadre ningún gris fiable, así que el ajuste automático no ha tocado el balance de blancos: conviene tomar un gris con el cuentagotas.',
    )
  }
  if (reachesBothEnds) {
    notices.push(
      'La fotografía ya llega al negro y al blanco, así que el ajuste automático no ha movido esos dos puntos.',
    )
  }
  if (!movedLevels && !movedExposure && !movedWhiteBalance && notices.length === 0) {
    notices.push('La fotografía ya está bien de luz y de color: no hay nada que ajustar.')
  }

  return {
    color,
    movedLevels,
    movedExposure,
    movedWhiteBalance,
    notice: notices.length === 0 ? null : notices.join(' '),
    detail: {
      pixels: total,
      percentileLow: low,
      percentileHigh: high,
      median,
      achromaticFraction: achromatic / total,
    },
  }
}

/** Smallest code whose cumulative count reaches `fraction` of the pixels. */
function percentileCode(histogram: Int32Array, total: number, fraction: number): number {
  const target = fraction * total
  let cumulative = 0
  for (let code = 0; code < 256; code += 1) {
    cumulative += histogram[code] ?? 0
    if (cumulative >= target) return code
  }
  return 255
}

/* -------------------------------------------------------------------- summary */

/** `+12`, `-6`, `0`: the sign is information when the scale runs both ways. */
function signed(value: number, decimals: number): string {
  const text = value.toFixed(decimals).replace('.', ',')
  return value > 0 ? `+${text}` : text
}

/**
 * What the adjustment did, for the cataloger to read. Null when it did nothing.
 *
 * Sibling of `editSummary`: the same one line of the dialog header carries both,
 * and the same rule applies — it says what changed, never how.
 */
export function colorSummary(color: ColorInput): string | null {
  const c = normalizeColor(color)
  const parts: string[] = []
  if (c.temperature !== 0) parts.push(`${COLOR_RANGES.temperature.label} ${signed(c.temperature, 0)}`)
  if (c.tint !== 0) parts.push(`${COLOR_RANGES.tint.label} ${signed(c.tint, 0)}`)
  if (Math.abs(c.exposure) > EPSILON) {
    parts.push(`${COLOR_RANGES.exposure.label} ${signed(c.exposure, 2)} EV`)
  }
  if (c.blackPoint !== 0) parts.push(`${COLOR_RANGES.blackPoint.label} ${c.blackPoint}`)
  if (c.whitePoint !== 255) parts.push(`${COLOR_RANGES.whitePoint.label} ${c.whitePoint}`)
  if (Math.abs(c.gamma - 1) > EPSILON) {
    parts.push(`${COLOR_RANGES.gamma.label} ${c.gamma.toFixed(2).replace('.', ',')}`)
  }
  if (c.shoulder !== 0) parts.push(`${COLOR_RANGES.shoulder.label} ${c.shoulder}`)
  if (c.gray) parts.push(GRAY_LABEL)
  return parts.length === 0 ? null : parts.join(' · ')
}

/* -------------------------------------------------------------------- columns */

/** The columns of the `images` row that hold the colour (§5 of the specification). */
export interface ColorColumns {
  color_temperature: number | null
  color_tint: number | null
  color_exposure: number | null
  color_black: number | null
  color_white: number | null
  color_gamma: number | null
  color_shoulder: number | null
  color_gray: boolean
  /** Both or neither, like the four of the crop. */
  color_neutral_x: number | null
  color_neutral_y: number | null
  color_source: ColorSource | null
  color_reference: ColorReference | null
  color_light: LightPreset | null
  color_inherited: boolean
}

/**
 * The adjustment as it is stored: **null is the identity, not the unknown**.
 *
 * A parameter at its identity value is written as null rather than as its number,
 * and that is what makes the deployment a single phase and what lets a row written
 * before this existed read as neutral without touching it. It also keeps the row
 * honest about the one thing that IS unknown: `color_source`, where null means
 * nobody has looked at the colour of this photograph, which is not the same as
 * `REVIEWED_UNCHANGED`.
 *
 * `color_clipped_low` and `color_clipped_high` are not here: they are not part of
 * the adjustment but a measurement of what applying it did to the pixels, so they
 * are written by whoever applies it and has the pixels in hand.
 */
export function colorToColumns(color: ColorInput): ColorColumns {
  const c = normalizeColor(color)
  const orIdentity = (value: number, key: ColorParam) =>
    Math.abs(value - COLOR_RANGES[key].default) <= EPSILON ? null : value
  return {
    color_temperature: orIdentity(c.temperature, 'temperature'),
    color_tint: orIdentity(c.tint, 'tint'),
    color_exposure: orIdentity(c.exposure, 'exposure'),
    color_black: orIdentity(c.blackPoint, 'blackPoint'),
    color_white: orIdentity(c.whitePoint, 'whitePoint'),
    color_gamma: orIdentity(c.gamma, 'gamma'),
    color_shoulder: orIdentity(c.shoulder, 'shoulder'),
    color_gray: c.gray,
    color_neutral_x: c.neutral ? c.neutral.x : null,
    color_neutral_y: c.neutral ? c.neutral.y : null,
    color_source: c.source ?? null,
    color_reference: c.reference ?? null,
    color_light: c.light ?? null,
    color_inherited: c.inherited === true,
  }
}

/**
 * The adjustment a row carries.
 *
 * A row from before this feature existed reads as neutral because null is the
 * identity here, and a row carrying a value the database could not have accepted
 * reads as neutral **in that parameter alone**, keeping the rest: showing the
 * photograph is always better than not showing it, and this is the same forgiveness
 * `editFromColumns` applies to a broken rectangle.
 */
export function colorFromColumns(row: Partial<ColorColumns> | null | undefined): ColorEdit {
  if (!row) return { ...NO_COLOR }
  const point =
    typeof row.color_neutral_x === 'number' && typeof row.color_neutral_y === 'number'
      ? { x: row.color_neutral_x, y: row.color_neutral_y }
      : null
  return normalizeColor({
    temperature: row.color_temperature ?? undefined,
    tint: row.color_tint ?? undefined,
    exposure: row.color_exposure ?? undefined,
    blackPoint: row.color_black ?? undefined,
    whitePoint: row.color_white ?? undefined,
    gamma: row.color_gamma ?? undefined,
    shoulder: row.color_shoulder ?? undefined,
    gray: row.color_gray === true,
    neutral: point,
    source: row.color_source ?? null,
    reference: row.color_reference ?? null,
    light: row.color_light ?? null,
    inherited: row.color_inherited === true,
  })
}
