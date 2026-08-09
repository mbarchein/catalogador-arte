import { useEffect, useMemo, useRef, useState } from 'react'
import {
  COLOR_RANGES,
  GRAY_LABEL,
  LIGHT_PRESETS,
  NEUTRAL_PATCH,
  autoColorFrom,
  buildColorLuts,
  clampColorParam,
  colorFromLightPreset,
  colorSummary,
  isNoColor,
  lightPresetLabel,
  normalizeColor,
  patchMedian,
  type ColorEdit,
  type ColorInput,
  type ColorParam,
  type LightPreset,
  type Rgb,
} from '../../lib/imageColor'
import {
  COLOR_PARAM_ORDER,
  colorParamsForShotType,
  cropRectInPixels,
  inheritColor,
  isInheritedColor,
  restrictColorToShotType,
  rotateCrop,
  withOwnColor,
  type Crop,
  type PhotoEdit,
} from '../../lib/imageEdits'
import { cornersBoundingBox, rotateCorners, type Corners } from '../../lib/perspective'
import {
  clippingNotice,
  clippingOf,
  histogramPath,
  histogramPeak,
  measureFrame,
  type Clipping,
  type Frame,
  type FrameMeasure,
} from '../../lib/imageHistogram'
import type { PixelRaster } from '../../lib/imagePixels'
import {
  analyseGrayTarget,
  grayTargetNotice,
  type GrayTargetAnalysis,
  type GrayTargetCandidate,
  type GrayTargetKind,
} from '../../lib/grayTarget'
import type { ShotTypeValue } from '../../lib/types'

/**
 * The colour panel of the photo editor (RF-414 to RF-418, §3.1 and §7).
 *
 * It lives at the FOOT of the dialog, swapping places with the row of framing tools,
 * and never floating over the artwork: a white balance is judged by looking at the
 * whole surface, and a panel on top of it would also collide with the loupe, which
 * lands in the corner opposite the finger. The vertical cost is paid by the tool row,
 * which is hidden while this is open — that row measures 308 of the 336 usable pixels
 * of a 360 px phone, so a seventh icon does not fit and a second permanent row would
 * reopen the count already argued in the CHANGELOG.
 *
 * What this file does NOT contain is any colour arithmetic. Every number comes from
 * imageColor.ts, which is the normative definition of the colour of this catalog, every
 * measurement from imageHistogram.ts and grayTarget.ts, and every rule about what a
 * shot type offers from imageEdits.ts. What is here is which control exists, when it is
 * offered and what it says — plus the handful of pure functions that decide those three
 * things, exported so they can be tested in a repository whose test environment has no
 * DOM.
 *
 * Three rules of the specification that are easy to break by accident and that have a
 * test each:
 *
 *  1. **The value being dragged lives in a `ref` coalesced to `requestAnimationFrame`,
 *     and `useState` is written when the finger lifts.** The bottleneck is not the
 *     pixels — measured in this repository, building the three 256-entry tables and
 *     their attribute strings costs 0,5 ms — it is React re-rendering the 1600 lines of
 *     JSX of the editor on every `pointermove`. So while the finger is down, the thumb,
 *     the number, the two ARIA attributes and the preview filter are written straight
 *     onto the nodes.
 *  2. **No gesture is the only way in.** The strip is a `role="slider"` with
 *     `aria-valuemin/max/now`, an `aria-valuetext` in Spanish, arrows for one notch,
 *     Home and End for the ends and a double tap back to the identity value.
 *  3. **Nothing here may sit inside the editor's `frameRef`.** That element carries a
 *     non-passive wheel listener and counts pointers in the capture phase, so a strip
 *     inside it would have its drags counted as fingers on the photograph.
 */

/* ------------------------------------------------------------------ formatting */

/** `+12`, `-6`, `0`: the sign is information when the scale runs both ways. */
function signed(value: number, decimals: number): string {
  const text = value.toFixed(decimals).replace('.', ',')
  return value > 0 ? `+${text}` : text
}

/** Just the number as the cataloger reads it, for the chip and the readout. */
export function colorValueText(param: ColorParam, value: number): string {
  const range = COLOR_RANGES[param]
  const number =
    range.min < 0 ? signed(value, range.decimals) : value.toFixed(range.decimals).replace('.', ',')
  return param === 'exposure' ? `${number} EV` : number
}

/**
 * One parameter with its name: «Temperatura +12», «Exposición +0,50 EV».
 *
 * It is deliberately the same sentence `colorSummary` puts in the header of the dialog,
 * and there is a test that walks the seven parameters and checks the two agree. Two
 * spellings of the same number on the same screen —one in the header, one under the
 * finger— is the sort of difference nobody reports and everybody distrusts.
 */
export function colorParamText(param: ColorParam, value: number): string {
  return `${COLOR_RANGES[param].label} ${colorValueText(param, value)}`
}

/* ----------------------------------------------------------------- the strip */

/**
 * Where a value sits along its strip, 0 at the minimum and 1 at the maximum.
 *
 * Linear in the parameter and in nothing perceptual: the number is what gets stored and
 * what the row constrains, so the position of the thumb has to be readable as that
 * number. A curve in the strip would make the same drag mean different amounts at
 * different places, which is what makes a slider impossible to return to a value.
 */
export function stripRatio(param: ColorParam, value: number): number {
  const { min, max } = COLOR_RANGES[param]
  if (!(max > min)) return 0
  const ratio = (value - min) / (max - min)
  return ratio < 0 ? 0 : ratio > 1 ? 1 : ratio
}

/**
 * The value a position along the strip means: snapped to the notch and brought into
 * range by `clampColorParam`, which is the module that owns both.
 *
 * Snapping happens here and not on release, so what the thumb shows while the finger
 * moves is a value the row can hold. Without it the strip would preview 0,4137 EV and
 * store 0,41, and in the shadows those are two different photographs.
 */
export function stripValue(param: ColorParam, ratio: number): number {
  const { min, max, step } = COLOR_RANGES[param]
  const raw = min + (Number.isFinite(ratio) ? Math.min(Math.max(ratio, 0), 1) : 0) * (max - min)
  const snapped = step > 0 ? min + Math.round((raw - min) / step) * step : raw
  return clampColorParam(param, snapped)
}

/** One notch up or down, clamped. What an arrow key does. */
export function stepValue(param: ColorParam, value: number, notches: number): number {
  return clampColorParam(param, value + notches * COLOR_RANGES[param].step)
}

/**
 * What a key press means on the strip, or null for a key that is not ours.
 *
 * A function and not a switch buried in the handler, because this IS the accessibility
 * requirement of §7: arrows for one notch, Home and End for the ends, and PageUp and
 * PageDown for a tenth of the scale so that 120 notches of temperature are reachable
 * without holding a key down. Written inline it would be a rule no test could fail.
 */
export function keyValue(param: ColorParam, value: number, key: string): number | null {
  const range = COLOR_RANGES[param]
  const coarse = Math.max(range.step, (range.max - range.min) / 10)
  switch (key) {
    case 'ArrowLeft':
    case 'ArrowDown':
      return stepValue(param, value, -1)
    case 'ArrowRight':
    case 'ArrowUp':
      return stepValue(param, value, 1)
    case 'PageDown':
      return clampColorParam(param, value - coarse)
    case 'PageUp':
      return clampColorParam(param, value + coarse)
    case 'Home':
      return range.min
    case 'End':
      return range.max
    default:
      return null
  }
}

/* -------------------------------------------------------------- the histogram */

/**
 * Which bins the histogram shows for the parameter being adjusted.
 *
 * Contextual, and the context is what the parameter is read off. A white balance is
 * judged by the three channels pulling apart — that separation IS the cast — while the
 * black point, the white point, the midtones and the shoulder are all read off the
 * encoded luminance, which is the single curve the eye follows to the ends.
 */
export function histogramChannels(param: ColorParam): 'rgb' | 'luminance' {
  return param === 'temperature' || param === 'tint' ? 'rgb' : 'luminance'
}

/**
 * A signature of the framing, so the histogram is measured again when the frame moves
 * and not when React happens to re-render.
 *
 * The frame arrives as a fresh object on every render, so a `useMemo` keyed on it would
 * walk half a million pixels on every `pointermove` of a corner drag. Keyed on this
 * string it recomputes when the numbers change, which is what it is for.
 */
export function frameSignature(frame: Frame | null | undefined): string {
  if (!frame) return 'none'
  const { crop, corners } = frame
  return [
    String(frame.rotation ?? 0),
    crop ? `${crop.x},${crop.y},${crop.width},${crop.height}` : '-',
    corners
      ? (['nw', 'ne', 'se', 'sw'] as const)
          .map((key) => `${corners[key].x},${corners[key].y}`)
          .join(';')
      : '-',
  ].join('|')
}

/**
 * The pixels of the frame as a flat RGBA buffer, which is what the automatic asks for.
 *
 * `autoColorFrom` wants the pixels **of the frame** and not of the photograph, and it is
 * right to: the wall around a painting, or the cardboard it leans on, would otherwise
 * set the black point and the median of an artwork that is a third of the frame. What it
 * gets from here is the frame's **bounding rectangle** — for a crop that is the frame
 * exactly, and for four corners it is the smallest upright box holding them, so a
 * photograph shot at an angle contributes a little wall and never the whole photograph.
 * The pixel-exact walk of a quadrilateral is private to imageHistogram.ts, and copying
 * it into a panel would be a third hand-written copy of a predicate two modules already
 * keep in step by hand.
 *
 * The whole-raster case returns the buffer itself and not a copy: half a megabyte that
 * does not need duplicating on a phone.
 */
export function framePixels(
  raster: PixelRaster | null | undefined,
  frame: Frame | null | undefined,
): Uint8ClampedArray | null {
  if (!raster || !raster.data) return null
  const width = Math.max(0, Math.trunc(raster.width))
  const height = Math.max(0, Math.trunc(raster.height))
  if (width < 1 || height < 1) return null
  // Negative: the framing is stored in fractions of the ROTATED image and the raster is
  // the photograph as it decoded. The same undoing imageHistogram does, through the same
  // two exported functions, so this arithmetic exists once and not twice.
  const turn = -(frame?.rotation ?? 0)

  let box: Crop | null = null
  if (frame?.corners) box = boundingCrop(rotateCorners(frame.corners, turn))
  else if (frame?.crop) box = rotateCrop(frame.crop, turn)
  if (!box) return raster.data

  const rect = cropRectInPixels(box, { width, height })
  if (rect.width >= width && rect.height >= height) return raster.data

  const out = new Uint8ClampedArray(rect.width * rect.height * 4)
  for (let row = 0; row < rect.height; row += 1) {
    const from = ((rect.y + row) * width + rect.x) * 4
    out.set(raster.data.subarray(from, from + rect.width * 4), row * rect.width * 4)
  }
  return out
}

/**
 * The colour under the eyedropper: the median of a patch of the raster around the point
 * the finger touched, or null when there is nothing there to measure.
 *
 * Two pieces of arithmetic, both borrowed and neither rewritten. The turn is undone with
 * `rotateCrop` over a rectangle with no sides, which is the trick `rotateEdit` already
 * uses on this very point — the sample lands in fractions of the ROTATED image, like the
 * crop and the corners, and the raster is the photograph as it decoded. And the colour is
 * `patchMedian`'s, which is the median and not the mean because one specular on the
 * varnish or one dust pixel ruins a mean of 81 samples and the cataloger cannot see that
 * it did.
 *
 * The patch is `NEUTRAL_PATCH` pixels of the ANALYSIS raster, which is the image that is
 * in hand: about 700 px on the long edge, so on a 9248 px master one of those pixels is a
 * neighbourhood of thirteen. That widens the sample rather than moving it, which for a
 * neutral reference is the right direction — and asking for the master's own pixels would
 * mean decoding twenty-four megapixels again for eighty-one of them.
 */
export function sampleAt(
  raster: PixelRaster | null | undefined,
  rotation: number,
  point: { x: number; y: number },
  side = NEUTRAL_PATCH,
): Rgb | null {
  if (!raster || !raster.data) return null
  const width = Math.max(0, Math.trunc(raster.width))
  const height = Math.max(0, Math.trunc(raster.height))
  if (width < 1 || height < 1) return null
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return null
  // A rectangle with no sides is a point, and this is the one function that already knows
  // how a selection travels when the photograph turns.
  const unrotated = rotateCrop({ x: point.x, y: point.y, width: 0, height: 0 }, -rotation)
  if (unrotated.x < 0 || unrotated.x > 1 || unrotated.y < 0 || unrotated.y > 1) return null
  const half = Math.max(0, Math.floor(Math.max(1, Math.trunc(side)) / 2))
  const cx = Math.min(width - 1, Math.max(0, Math.floor(unrotated.x * width)))
  const cy = Math.min(height - 1, Math.max(0, Math.floor(unrotated.y * height)))
  const x0 = Math.max(0, cx - half)
  const y0 = Math.max(0, cy - half)
  const x1 = Math.min(width, cx + half + 1)
  const y1 = Math.min(height, cy + half + 1)
  const patch = new Uint8ClampedArray((x1 - x0) * (y1 - y0) * 4)
  for (let row = 0; row < y1 - y0; row += 1) {
    const from = ((y0 + row) * width + x0) * 4
    patch.set(raster.data.subarray(from, from + (x1 - x0) * 4), row * (x1 - x0) * 4)
  }
  return patchMedian(patch, 4)
}

/** The bounding box of four corners as a crop, brought inside the image. */
function boundingCrop(corners: Corners): Crop {
  const box = cornersBoundingBox(corners)
  const x = Math.min(Math.max(box.x, 0), 1)
  const y = Math.min(Math.max(box.y, 0), 1)
  return {
    x,
    y,
    width: Math.min(Math.max(box.width, 0), 1 - x),
    height: Math.min(Math.max(box.height, 0), 1 - y),
  }
}

/* ------------------------------------------------------------- what it stores */

/**
 * The `color_source` a change by hand should carry.
 *
 * An adjustment the cataloger nudged after the automatic proposed it is `AUTO_ADJUSTED`
 * and not `MANUAL`: the numbers came out of a measurement and were then corrected by
 * eye, and in a year that is a different story from seven numbers chosen by hand.
 * Everything else becomes `MANUAL`, including a nudge over a preset or over an
 * eyedropper pick — those measured the white balance only, and moving any strip means
 * the look is now hers.
 */
export function handSource(previous: ColorEdit['source']): NonNullable<ColorEdit['source']> {
  return previous === 'AUTO' || previous === 'AUTO_ADJUSTED' ? 'AUTO_ADJUSTED' : 'MANUAL'
}

/**
 * The adjustment as it should be stored when the panel was opened, looked at and closed
 * without moving anything (§3.1, `REVIEWED_UNCHANGED`).
 *
 * «Sin revisar» no es «no»: with every column null there is no way to tell «se miró con
 * la obra delante y estaba bien» from «nadie lo ha mirado nunca», and the first is work
 * done. It writes provenance only — the look is untouched, so `isNoEdit` still says
 * nothing changed and no file is rewritten for it.
 */
export function reviewedColor(color: ColorInput, reviewed: boolean): ColorEdit {
  const current = normalizeColor(color)
  if (!reviewed || !isNoColor(current) || current.source != null) return current
  return normalizeColor({ ...current, source: 'REVIEWED_UNCHANGED' })
}

/**
 * Where the numbers of this adjustment came from, in one line, or null when nobody has
 * looked at the colour of this photograph yet.
 *
 * It is the traceability of RF-418 read back out. A number with no authority behind it
 * is what `color_source` and `color_reference` exist to prevent, and columns that are
 * written and never shown leave the cataloger unable to tell a measurement from a guess.
 */
export function colorProvenanceText(color: ColorInput): string | null {
  const c = normalizeColor(color)
  const parts: string[] = []
  switch (c.source) {
    case 'MANUAL':
      parts.push('Ajustado a ojo')
      break
    case 'NEUTRAL_PICKED':
      parts.push(
        c.reference === 'TARGET_CARD'
          ? 'Gris medido sobre una carta de grises'
          : c.reference === 'TARGET_PRINT'
            ? 'Testigo de hoja impresa reconocido'
            : 'Gris tomado de la escena con el cuentagotas',
      )
      break
    case 'AUTO':
      parts.push('Propuesto por el ajuste automático')
      break
    case 'AUTO_ADJUSTED':
      parts.push('Ajuste automático corregido a mano')
      break
    case 'PRESET':
      parts.push('Punto de partida por tipo de luz')
      break
    case 'REVIEWED_UNCHANGED':
      parts.push('Revisado con la obra delante y dejado como estaba')
      break
    default:
      return null
  }
  const light = lightPresetLabel(c.light)
  if (light) parts.push(c.source === 'PRESET' ? light : `luz declarada: ${light}`)
  if (c.neutral) parts.push('con el punto del gris anotado')
  if (c.inherited) parts.push('heredado de la toma general')
  return parts.join(' · ')
}

/**
 * What a detected staircase is offered as, and whether accepting it moves the white
 * balance (RF-418, §4).
 *
 * A printed sheet is recorded as what it is and **not believed for the cast**: domestic
 * ink is not neutral, so taking the dominant off it would swap the colour of the bulb
 * for the colour of the ink. `grayTarget.ts` already says so by answering `neutral:
 * null` and `trustsGray: false`; what is here is the sentence that tells the cataloger
 * why the button in front of her does less than she expects.
 */
export function grayTargetOffer(candidate: GrayTargetCandidate): {
  label: string
  detail: string
  movesWhiteBalance: boolean
} {
  const percent = Math.round(candidate.confidence * 100)
  const found = `Se ha reconocido una escalera de ${candidate.patches.length} parches (parecido ${percent} %).`
  if (candidate.neutral) {
    return {
      label: 'Tomar el gris del testigo',
      detail: `${found} Al tomarla se fija el balance de blancos con su gris y queda anotado que la referencia fue una carta de grises. Nada se aplica hasta que lo pidas.`,
      movesWhiteBalance: true,
    }
  }
  return {
    label: 'Anotar el testigo impreso',
    detail: `${found} De una hoja impresa en casa se anota que estaba en la toma, pero su gris no se usa como referencia de dominante: la tinta doméstica no es neutra y tomaría el color de la tinta por el de la luz de la sala.`,
    movesWhiteBalance: false,
  }
}

/**
 * The adjustment after accepting a detected staircase.
 *
 * `candidate.neutral` is used as it comes and the patches are not re-measured: the
 * detector already chose which one to believe —the interior patch closest to the middle
 * of the span— and deriving it again here would be a second opinion about the same
 * pixels. What is recorded in `color_neutral_x/y` is the centre of the staircase, in
 * fractions of the rotated image, which is where the grey really was taken.
 */
export function colorFromGrayTarget(
  color: ColorInput,
  candidate: GrayTargetCandidate,
  at: { x: number; y: number } | null,
): ColorEdit {
  const base = normalizeColor(color)
  if (!candidate.neutral) {
    // A printed sheet: the reference is recorded and the look is untouched. A source is
    // only claimed when it is true, so a grey she had already measured stays.
    return normalizeColor({
      ...base,
      reference: candidate.reference,
      source: base.source ?? 'REVIEWED_UNCHANGED',
    })
  }
  return normalizeColor({
    ...base,
    temperature: candidate.neutral.temperature,
    tint: candidate.neutral.tint,
    neutral: at,
    source: 'NEUTRAL_PICKED',
    reference: candidate.reference,
  })
}

/** The two declarations of §4. Not readable off the pixels: the cataloger says which. */
export const GRAY_TARGET_KINDS: readonly { value: GrayTargetKind; label: string }[] = [
  { value: 'CARD', label: 'Carta comprada' },
  { value: 'PRINT', label: 'Hoja impresa' },
]

/**
 * Whether the preview filter has to be on the two `<img>` right now.
 *
 * On while the panel is open even with a neutral adjustment, and that is the point: the
 * strips write the filter's tables STRAIGHT TO THE DOM without going through React, so a
 * filter React had not rendered yet would leave the first drag of a neutral photograph
 * previewing nothing. With the panel closed it is on only when there is something to
 * show, so a photograph that is merely being turned costs no filter pass. The identity
 * table is exactly the identity (ADR-009 pins `lut[c][i] === i` with a test), so having
 * it on changes no pixel.
 */
export function showsColorFilter(panelOpen: boolean, color: ColorInput): boolean {
  return panelOpen || !isNoColor(color)
}

/* --------------------------------------------------------------------- icons */

export function ColorIcon({ className = 'h-6 w-6' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className={className}
      aria-hidden
    >
      <path
        d="M12 3a9 9 0 1 0 0 18h1.5a2.5 2.5 0 0 0 0-5H13a2 2 0 0 1 0-4h4a4 4 0 0 0 4-4 5 5 0 0 0-5-5z"
        strokeLinecap="round"
      />
      <circle cx="8" cy="9" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="7.6" cy="14" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="12" cy="7" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  )
}

function EyedropperIcon({ className = 'h-6 w-6' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className={className}
      aria-hidden
    >
      <path
        d="M17.2 2.8a2 2 0 0 1 2.8 2.8l-1.6 1.6-2.8-2.8zM15.6 6.4 6.8 15.2 5 21l5.8-1.8 8.8-8.8z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function AutoColorIcon({ className = 'h-6 w-6' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className={className}
      aria-hidden
    >
      <circle cx="11" cy="13" r="7" />
      <path d="M11 6a7 7 0 0 1 0 14z" fill="currentColor" stroke="none" />
      <path d="m19.2 2.6.9 1.9 1.9.9-1.9.9-.9 1.9-.9-1.9-1.9-.9 1.9-.9z" fill="currentColor" stroke="none" />
    </svg>
  )
}

function TargetIcon({ className = 'h-6 w-6' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      className={className}
      aria-hidden
    >
      <rect x="3" y="8" width="6" height="8" fill="currentColor" fillOpacity="0.12" stroke="none" />
      <rect x="9" y="8" width="6" height="8" fill="currentColor" fillOpacity="0.4" stroke="none" />
      <rect x="15" y="8" width="6" height="8" fill="currentColor" fillOpacity="0.75" stroke="none" />
      <rect x="3" y="8" width="18" height="8" rx="1" />
      <path d="M9 8v8M15 8v8" />
    </svg>
  )
}

function UndoIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className={className}
      aria-hidden
    >
      <path d="M4 9h9a5 5 0 0 1 0 10H8M4 9l4-4M4 9l4 4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/* ----------------------------------------------------------------- the strip */

/**
 * One parameter as a strip, and the only place in this file that writes to the DOM by
 * hand.
 *
 * While the finger is down nothing goes through React: the value lives in `valueRef`,
 * one frame's worth of movement is coalesced with `requestAnimationFrame`, and that
 * frame writes the thumb, the fill, the number and the two ARIA attributes onto the
 * nodes and calls `onPreview`. `onCommit` runs once, when the finger lifts. Going
 * through `useState` instead re-renders the editor's 1600 lines of JSX per
 * `pointermove`, which is the measured bottleneck — not the 0,5 ms of the three tables.
 *
 * `touch-none` is on the track from the first render and never added when the gesture is
 * recognized: the browser evaluates `touch-action` when the touch STARTS, so setting it
 * later arrives after the drag has already been claimed as a scroll. Same dead end as
 * the crop handles and as ReorderableThumbnails.
 */
function ValueStrip({
  param,
  value,
  disabled,
  onPreview,
  onCommit,
  describedBy,
}: {
  param: ColorParam
  value: number
  disabled: boolean
  onPreview: (value: number) => void
  onCommit: (value: number) => void
  describedBy: string
}) {
  const range = COLOR_RANGES[param]
  const trackRef = useRef<HTMLDivElement | null>(null)
  const thumbRef = useRef<HTMLSpanElement | null>(null)
  const fillRef = useRef<HTMLSpanElement | null>(null)
  const readoutRef = useRef<HTMLSpanElement | null>(null)
  const valueRef = useRef(value)
  const frameRef = useRef<number | null>(null)
  const draggingRef = useRef<number | null>(null)

  // Between gestures the committed value is the truth: a preset, the automatic or an
  // inherited adjustment move this strip without anybody touching it.
  valueRef.current = value

  useEffect(
    () => () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
    },
    [],
  )

  /** The thumb, the number, the two ARIA attributes and the preview, without React. */
  function paint(next: number) {
    const ratio = stripRatio(param, next)
    if (thumbRef.current) thumbRef.current.style.left = `${ratio * 100}%`
    if (fillRef.current) fillRef.current.style.width = `${ratio * 100}%`
    if (readoutRef.current) readoutRef.current.textContent = colorValueText(param, next)
    if (trackRef.current) {
      trackRef.current.setAttribute('aria-valuenow', String(next))
      trackRef.current.setAttribute('aria-valuetext', colorParamText(param, next))
    }
    onPreview(next)
  }

  /** A frame's worth of work, at most once per screen refresh. */
  function schedule() {
    if (frameRef.current !== null) return
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null
      paint(valueRef.current)
    })
  }

  function valueAt(clientX: number): number | null {
    const rect = fillRef.current?.parentElement?.getBoundingClientRect()
    if (!rect || rect.width === 0) return null
    return stripValue(param, (clientX - rect.left) / rect.width)
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (disabled) return
    // Left button only, like the pan of the working surface: the right one opens the
    // menu and the middle one pastes on some systems.
    if (e.pointerType === 'mouse' && e.button !== 0) return
    const next = valueAt(e.clientX)
    if (next === null) return
    e.preventDefault()
    e.stopPropagation()
    draggingRef.current = e.pointerId
    // Captured, and not decoration: a drag that runs past the end of the strip —which is
    // what reaching a limit looks like— would otherwise stop dead the moment the finger
    // leaves the track.
    e.currentTarget.setPointerCapture(e.pointerId)
    trackRef.current?.focus()
    valueRef.current = next
    schedule()
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (draggingRef.current !== e.pointerId) return
    const next = valueAt(e.clientX)
    if (next === null) return
    valueRef.current = next
    schedule()
  }

  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (draggingRef.current !== e.pointerId) return
    draggingRef.current = null
    // The pending frame is dropped and painted on the spot instead: React only rewrites
    // what its own last render disagrees with, so a value that ends where it started would
    // leave the hand-written thumb one frame behind with nobody to correct it.
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current)
      frameRef.current = null
    }
    paint(valueRef.current)
    onCommit(valueRef.current)
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (disabled) return
    const next = keyValue(param, valueRef.current, e.key)
    if (next === null) return
    e.preventDefault()
    // Stopped so the editor's own Escape and arrow handling never sees a key that was
    // meant for the strip.
    e.stopPropagation()
    valueRef.current = next
    onCommit(next)
  }

  const ratio = stripRatio(param, value)
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <div
        ref={trackRef}
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label={range.label}
        aria-valuemin={range.min}
        aria-valuemax={range.max}
        aria-valuenow={value}
        aria-valuetext={colorParamText(param, value)}
        aria-disabled={disabled || undefined}
        aria-describedby={describedBy}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={onKeyDown}
        // A double tap goes back to the identity value, which is the one value a
        // parameter can always be returned to without remembering a number.
        onDoubleClick={() => !disabled && onCommit(range.default)}
        onContextMenu={(e) => e.preventDefault()}
        className={`flex h-11 min-w-0 flex-1 touch-none select-none items-center px-3 ${
          disabled ? 'opacity-40' : 'rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-300'
        }`}
      >
        <span aria-hidden className="relative block h-1.5 w-full rounded-full bg-white/25">
          <span
            ref={fillRef}
            className="absolute inset-y-0 left-0 rounded-full bg-white/70"
            style={{ width: `${ratio * 100}%` }}
          />
          <span
            ref={thumbRef}
            className="absolute top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-stone-900 bg-white"
            style={{ left: `${ratio * 100}%` }}
          />
        </span>
      </div>
      <span
        ref={readoutRef}
        aria-hidden
        className="w-14 shrink-0 text-right text-xs tabular-nums text-stone-300"
      >
        {colorValueText(param, value)}
      </span>
    </div>
  )
}

/* ---------------------------------------------------------------- the panel */

export function ColorControls({
  edit,
  shotType,
  availability,
  raster,
  rasterState,
  generalColor,
  isGeneralShot,
  eyedropper,
  pickNotice,
  candidates,
  onCandidates,
  onEyedropper,
  onClearPickNotice,
  onPreview,
  onColorChange,
  onClose,
}: {
  /** The whole edit: the colour is one of its fields and the frame bounds every measurement. */
  edit: PhotoEdit
  shotType?: ShotTypeValue | null
  /** Already decided by `colorAvailability`: this panel never re-derives the rule. */
  availability: { available: boolean; reason: string | null }
  /** The cached analysis raster of the master, or null while it loads or if it failed. */
  raster: PixelRaster | null
  rasterState: 'idle' | 'working' | 'ready' | 'failed'
  /** The adjustment of the artwork's general shot, when there is one to inherit. */
  generalColor?: ColorInput
  /** True when THIS is the general shot, which inherits from nobody. */
  isGeneralShot: boolean
  eyedropper: boolean
  /** What the last pick said. It happens on the working surface, so the editor owns it. */
  pickNotice: string | null
  candidates: readonly GrayTargetCandidate[]
  onCandidates: (candidates: readonly GrayTargetCandidate[]) => void
  onEyedropper: (armed: boolean) => void
  onClearPickNotice: () => void
  /** Straight to the DOM, once per frame, while a strip is being dragged. */
  onPreview: (color: ColorEdit) => void
  onColorChange: (color: ColorEdit) => void
  onClose: () => void
}) {
  const color = useMemo(() => normalizeColor(edit.color), [edit.color])
  const params = useMemo(() => colorParamsForShotType(shotType), [shotType])
  const offered = useMemo(() => new Set(params.offered), [params])
  const disabledReason = useMemo(
    () => new Map(params.disabled.map((one) => [one.param, one.reason] as const)),
    [params],
  )

  const [selected, setSelected] = useState<ColorParam>(
    () => colorParamsForShotType(shotType).offered[0] ?? 'temperature',
  )
  /**
   * One undo box per parameter, holding the value it had **before she started touching
   * it** and not before the last notch: with the arrow keys the second reading would
   * undo one sixth of a stop, which is not an undo. The precedent is `replaced` in the
   * editor, which keeps the rectangle a suggestion overwrote.
   */
  const [undoable, setUndoable] = useState<Partial<Record<ColorParam, number>>>({})
  const [notice, setNotice] = useState<string | null>(null)
  const [kind, setKind] = useState<GrayTargetKind>('CARD')
  const [searched, setSearched] = useState(false)

  const frame: Frame = { rotation: edit.rotation, crop: edit.crop, corners: edit.corners }
  const signature = frameSignature(frame)
  const measure: FrameMeasure | null = useMemo(
    () => (raster ? measureFrame(raster, { rotation: edit.rotation, crop: edit.crop, corners: edit.corners }) : null),
    [raster, signature, edit.rotation, edit.crop, edit.corners],
  )
  /**
   * What this adjustment costs in lost detail, measured on the frame and only when the
   * value is at rest: it is a pass over half a million pixels, so it must not run once
   * per frame of a drag. The sentence is `clippingNotice`'s and never ours.
   */
  const clipping: Clipping | null = useMemo(() => {
    if (!raster || isNoColor(color)) return null
    return clippingOf(raster, buildColorLuts(color), {
      rotation: edit.rotation,
      crop: edit.crop,
      corners: edit.corners,
    })
  }, [raster, signature, color, edit.rotation, edit.crop, edit.corners])

  const helpId = 'editor-color-help'
  const inherited = isInheritedColor(edit)
  const canInherit = !isGeneralShot && generalColor != null && !isNoColor(generalColor)

  /**
   * A staircase drawn over a photograph whose framing has moved is a staircase pointing
   * at nothing: the boxes were measured on the raster and the frame is what masked the
   * search. Dropping them is cheaper than explaining them.
   */
  const lastSignature = useRef(signature)
  useEffect(() => {
    if (lastSignature.current === signature) return
    lastSignature.current = signature
    setSearched(false)
    onCandidates([])
  }, [signature, onCandidates])

  /** Anything the panel says clears the older sentence of the eyedropper. */
  function say(text: string | null) {
    onClearPickNotice()
    setNotice(text)
  }

  if (!availability.available) {
    // Never a hole: the reason IS the panel, and it comes from `colorAvailability` so
    // that the rule lives in one place (RF-417 and the degraded path).
    return (
      <div className="space-y-2">
        <p className="rounded-lg bg-white/10 p-2 text-xs text-stone-300">{availability.reason}</p>
        <button
          type="button"
          onClick={onClose}
          className="btn min-h-touch w-full border border-stone-600 text-sm text-white"
        >
          Volver a las herramientas
        </button>
      </div>
    )
  }

  /** Keeps the value a parameter had before this change, when the box is still empty. */
  function remember(before: ColorEdit, after: ColorEdit) {
    setUndoable((current) => {
      const next = { ...current }
      for (const key of COLOR_PARAM_ORDER) {
        if (next[key] === undefined && Math.abs(after[key] - before[key]) > 1e-9) {
          next[key] = before[key]
        }
      }
      return next
    })
  }

  /**
   * Applies a colour the cataloger decided for THIS shot, which clears `inherited`.
   *
   * It clears the last sentence first: whoever has more to say says it right after, and
   * what is left when nobody does is the line that describes where these numbers came
   * from — which after a drag is «Ajustado a ojo», and is true.
   */
  function commit(next: ColorEdit) {
    say(null)
    remember(color, next)
    onColorChange(withOwnColor(edit, next).color)
  }

  function commitParam(param: ColorParam, value: number) {
    if (Math.abs(value - color[param]) < 1e-9) {
      // Nothing moved: no source is claimed and no undo box is spent. The preview is
      // rewritten anyway, because the DOM was mutated by hand during the drag and React
      // will not re-render for a prop that did not change.
      onPreview(color)
      return
    }
    commit(normalizeColor({ ...color, [param]: value, source: handSource(color.source) }))
  }

  function undo(param: ColorParam) {
    const previous = undoable[param]
    if (previous === undefined) return
    setUndoable((current) => {
      const next = { ...current }
      delete next[param]
      return next
    })
    onColorChange(
      withOwnColor(
        edit,
        normalizeColor({ ...color, [param]: previous, source: handSource(color.source) }),
      ).color,
    )
    say(`${COLOR_RANGES[param].label} de vuelta en ${colorValueText(param, previous)}.`)
  }

  function runAuto() {
    const pixels = framePixels(raster, frame)
    if (!pixels) {
      say('No se han podido medir los píxeles del encuadre para proponer un ajuste.')
      return
    }
    const proposal = autoColorFrom(pixels, 4)
    // Restricted to what this shot type offers: without it the automatic on a damage
    // detail would set the black point through a strip that is disabled there — a change
    // she can see and cannot undo, which is worse than not offering it.
    commit(
      normalizeColor({
        ...restrictColorToShotType(proposal.color, shotType),
        source: 'AUTO',
        reference: proposal.color.reference,
      }),
    )
    say(
      proposal.notice ??
        'Ajuste automático propuesto: es un punto de partida, revisa las tiras y corrige lo que haga falta.',
    )
  }

  function choosePreset(light: LightPreset | '') {
    if (light === '') return
    commit(
      normalizeColor({
        ...restrictColorToShotType(colorFromLightPreset(color, light), shotType),
        source: 'PRESET',
        light,
      }),
    )
    say(
      `Punto de partida para «${lightPresetLabel(light)}»: una suposición ajustable y no una medición. ` +
        'Corrige la temperatura y el matiz mirando la obra, o toma un gris.',
    )
  }

  function searchTarget(nextKind: GrayTargetKind) {
    setKind(nextKind)
    setSearched(true)
    if (!raster) {
      onCandidates([])
      say('No se han podido medir los píxeles de esta fotografía para buscar el testigo.')
      return
    }
    const found: GrayTargetAnalysis = analyseGrayTarget(raster, { kind: nextKind, artwork: frame })
    onCandidates(found.candidates)
    const first = found.candidates[0]
    say(grayTargetNotice(found) ?? (first ? grayTargetOffer(first).detail : null))
  }

  function takeCandidate(candidate: GrayTargetCandidate) {
    // The box is measured on the unrotated raster and the stored point lives in fractions
    // of the ROTATED image, like the crop and the corners: one coordinate system for the
    // whole row and not three.
    const box = rotateCrop(candidate.box, edit.rotation)
    const at = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
    const offer = grayTargetOffer(candidate)
    commit(restrictColorToShotType(colorFromGrayTarget(color, candidate, at), shotType))
    say(
      offer.movesWhiteBalance
        ? 'Balance de blancos tomado del testigo de gris, y anotado como carta de grises.'
        : 'Hoja impresa anotada. Su gris no sirve de referencia: la tinta doméstica no es neutra.',
    )
  }

  const selectedRange = COLOR_RANGES[selected]
  const selectedDisabled = !offered.has(selected)
  const showChannels = histogramChannels(selected) === 'rgb'
  const peak = measure
    ? histogramPeak(measure.histogram.r, measure.histogram.g, measure.histogram.b)
    : 0
  const paths = measure
    ? {
        luminance: histogramPath(measure.histogram.luminance, { width: 256, height: 40 }),
        r: histogramPath(measure.histogram.r, { width: 256, height: 40, peak }),
        g: histogramPath(measure.histogram.g, { width: 256, height: 40, peak }),
        b: histogramPath(measure.histogram.b, { width: 256, height: 40, peak }),
      }
    : null

  /**
   * ONE line of help, the one that matters right now, in the same order of priority the
   * editor's own help line uses: what she cannot do, then what just happened, then how
   * to use what is under her finger.
   */
  function helpText(): string {
    if (selectedDisabled) return disabledReason.get(selected) ?? ''
    if (notice) return notice
    if (pickNotice) return pickNotice
    const clip = clippingNotice(clipping)
    if (clip) return clip
    if (eyedropper)
      return 'Arrastra el dedo hasta un gris de la foto y levántalo ahí. Con dos dedos mueves y acercas.'
    const provenance = colorProvenanceText(color)
    if (provenance) return provenance
    return `${selectedRange.label}: arrastra, usa las flechas para una muesca, Inicio y Fin para los topes, y toca dos veces para volver al valor de origen.`
  }

  return (
    <div className="space-y-2">
      {/* The histogram of the FRAME and not of the photograph: the wall around a painting
          would otherwise be half the chart. The square root scale belongs to
          `histogramPath` and it is a display scale — nothing measured comes off it. */}
      {measure && measure.count > 0 && paths ? (
        <div className="h-10 w-full overflow-hidden rounded-lg bg-black/60">
          <svg
            viewBox="0 0 256 40"
            preserveAspectRatio="none"
            className="h-full w-full"
            role="img"
            aria-label={
              showChannels
                ? 'Histograma de los tres canales del encuadre: cuando se separan, hay dominante de color'
                : 'Histograma de luminancia del encuadre'
            }
          >
            {showChannels ? (
              <>
                <path d={paths.r} fill="rgba(248,113,113,0.55)" />
                <path d={paths.g} fill="rgba(74,222,128,0.55)" />
                <path d={paths.b} fill="rgba(96,165,250,0.55)" />
              </>
            ) : (
              <path d={paths.luminance} fill="rgba(255,255,255,0.55)" />
            )}
            {/* The two points where they cut: what the strips do to the histogram is the
                reading the cataloger is making. */}
            <line
              x1={color.blackPoint + 0.5}
              x2={color.blackPoint + 0.5}
              y1="0"
              y2="40"
              stroke={selected === 'blackPoint' ? '#fcd34d' : 'rgba(255,255,255,0.45)'}
              strokeWidth="1"
            />
            <line
              x1={color.whitePoint + 0.5}
              x2={color.whitePoint + 0.5}
              y1="0"
              y2="40"
              stroke={selected === 'whitePoint' ? '#fcd34d' : 'rgba(255,255,255,0.45)'}
              strokeWidth="1"
            />
          </svg>
        </div>
      ) : (
        <p className="rounded-lg bg-black/40 p-2 text-center text-xs text-stone-400">
          {rasterState === 'working'
            ? 'Midiendo la fotografía…'
            : rasterState === 'failed'
              ? 'No se han podido medir los píxeles: sin histograma, sin ajuste automático y sin testigo.'
              : 'Sin medición del encuadre todavía.'}
        </p>
      )}

      {/* The chips: one per parameter, with the value on the chip so the strip needs no
          label of its own. `touch-action: pan-x` is explicit and not inherited from
          `overflow-x-auto`: everything above sets `touch-none`, and without saying so
          here the thumb cannot reach the end of the track. */}
      <div
        role="group"
        aria-label="Mandos de color"
        className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1"
        style={{ touchAction: 'pan-x' }}
      >
        {COLOR_PARAM_ORDER.map((param) => {
          const range = COLOR_RANGES[param]
          const moved = Math.abs(color[param] - range.default) > 1e-9
          const off = !offered.has(param)
          return (
            <button
              key={param}
              type="button"
              aria-pressed={selected === param}
              // Shown and NOT hidden when the shot type refuses it: hiding it would make a
              // photograph carrying an inherited tonal adjustment look as if it had none,
              // and she could neither see it nor understand why her strip was gone.
              aria-disabled={off || undefined}
              aria-describedby={helpId}
              onClick={() => {
                setSelected(param)
                setNotice(null)
              }}
              className={`flex h-11 shrink-0 items-center gap-1 rounded-lg px-3 text-xs ${
                selected === param ? 'bg-white text-stone-900' : 'bg-white/10 text-stone-300'
              } ${off ? 'opacity-40' : ''}`}
            >
              <span>{range.label}</span>
              {moved && (
                <span
                  className={`tabular-nums ${selected === param ? 'font-medium' : 'text-amber-300'}`}
                >
                  {colorValueText(param, color[param])}
                </span>
              )}
            </button>
          )
        })}
        <button
          type="button"
          role="switch"
          aria-checked={color.gray}
          aria-disabled={!params.gray.offered || undefined}
          aria-describedby={helpId}
          onClick={() => {
            if (!params.gray.offered) {
              say(params.gray.reason)
              return
            }
            say(null)
            commit(normalizeColor({ ...color, gray: !color.gray, source: handSource(color.source) }))
          }}
          className={`flex h-11 shrink-0 items-center rounded-lg px-3 text-xs ${
            color.gray ? 'bg-white text-stone-900' : 'bg-white/10 text-stone-300'
          } ${params.gray.offered ? '' : 'opacity-40'}`}
        >
          {GRAY_LABEL}
        </button>
      </div>

      <div className="flex items-center gap-1">
        <ValueStrip
          param={selected}
          value={color[selected]}
          disabled={selectedDisabled}
          onPreview={(value) => onPreview(normalizeColor({ ...color, [selected]: value }))}
          onCommit={(value) => commitParam(selected, value)}
          describedBy={helpId}
        />
        {/* One undo box per parameter, and it only shows while there is something in it:
            as a permanent button it would sit disabled almost always, spending a row on
            an action that belongs to the seconds right after a change. */}
        {undoable[selected] !== undefined && (
          <button
            type="button"
            aria-label={`Deshacer ${selectedRange.label}: volver a ${colorValueText(selected, undoable[selected]!)}`}
            title="Deshacer este mando"
            onClick={() => undo(selected)}
            className="btn h-11 w-11 shrink-0 bg-white/10 p-0 text-white"
          >
            <UndoIcon />
          </button>
        )}
      </div>

      {/* The three tools of the panel in one row of 44 px targets, with the list of kinds
          of light taking the room that is left: a native `select` is a list the keyboard
          and the screen reader already know how to walk, and its label says it is a
          starting point and never a measurement (RF-414). */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-pressed={eyedropper}
          aria-label="Tomar un gris de la foto"
          title="Tomar un gris de la foto"
          aria-describedby={helpId}
          onClick={() => {
            say(null)
            onEyedropper(!eyedropper)
          }}
          className={`btn h-11 w-11 shrink-0 p-0 ${
            eyedropper ? 'bg-amber-300 text-stone-900' : 'bg-white/10 text-white'
          }`}
        >
          <EyedropperIcon />
        </button>
        <button
          type="button"
          disabled={!raster}
          aria-label="Ajuste automático"
          title="Ajuste automático"
          aria-describedby={helpId}
          onClick={runAuto}
          className="btn h-11 w-11 shrink-0 bg-white/10 p-0 text-white disabled:opacity-40"
        >
          <AutoColorIcon />
        </button>
        <button
          type="button"
          aria-pressed={searched}
          aria-label="Buscar el testigo de gris"
          title="Buscar el testigo de gris"
          aria-describedby={helpId}
          onClick={() => searchTarget(kind)}
          className={`btn h-11 w-11 shrink-0 p-0 ${
            searched ? 'bg-white text-stone-900' : 'bg-white/10 text-white'
          }`}
        >
          <TargetIcon />
        </button>
        <label className="min-w-0 flex-1">
          <span className="sr-only">Tipo de luz de la toma, como punto de partida ajustable</span>
          <select
            value={color.light ?? ''}
            aria-describedby={helpId}
            onChange={(e) => choosePreset(e.currentTarget.value as LightPreset | '')}
            className="h-11 w-full min-w-0 rounded-lg border border-white/20 bg-white/10 px-2 text-xs text-white"
          >
            <option value="">Tipo de luz (punto de partida)…</option>
            {LIGHT_PRESETS.map((preset) => (
              <option key={preset.value} value={preset.value} className="text-stone-900">
                {preset.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* The declaration of §4, which cannot be read off the pixels: a printed sheet and a
          bought card look the same in a photograph and are believed differently. Changing
          it searches again, because the candidate carries the `color_reference` it will
          store. */}
      {searched && (
        <div className="space-y-1 rounded-lg bg-white/10 p-2">
          <div role="group" aria-label="Qué testigo se usó" className="grid grid-cols-2 gap-1">
            {GRAY_TARGET_KINDS.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                aria-pressed={kind === value}
                onClick={() => searchTarget(value)}
                className={`btn min-h-touch rounded-md px-1 text-xs ${
                  kind === value ? 'bg-white text-stone-900' : 'text-stone-300'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {candidates.map((candidate, index) => (
            <button
              key={`${candidate.axis}-${index}`}
              type="button"
              onClick={() => takeCandidate(candidate)}
              className="btn min-h-touch w-full justify-start border border-amber-400/70 bg-amber-400/10 text-left text-xs text-amber-100"
            >
              {`${index + 1}. ${grayTargetOffer(candidate).label}`}
            </button>
          ))}
          <a
            // A new tab and not a route change: navigating away would unmount the editor
            // and lose the framing and the colour she has not applied yet.
            href="/gray-target"
            target="_blank"
            rel="noopener noreferrer"
            className="btn min-h-touch w-full text-xs text-stone-300 underline underline-offset-4"
          >
            Cómo se coloca el testigo de gris
          </a>
        </div>
      )}

      {/* Inheritance (§7): the general shot rules, the others inherit, and the screen says
          when an adjustment is inherited. «Restablecer a lo heredado» is calling
          `inheritColor` again — there is no second function for it, because two names for
          one piece of arithmetic is how the two of them drift. */}
      {(inherited || canInherit) && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {inherited && (
            <span className="rounded-full bg-white/10 px-2 py-1 text-xs text-amber-200">
              Color heredado de la toma general
            </span>
          )}
          {canInherit && (
            <button
              type="button"
              onClick={() => {
                setUndoable({})
                onColorChange(inheritColor(edit, generalColor, shotType).color)
                say(
                  inherited
                    ? 'Restablecido al ajuste de la toma general.'
                    : 'Tomado el ajuste de la toma general. Desde aquí se cambia por separado.',
                )
              }}
              className="btn min-h-touch text-xs text-stone-300 underline underline-offset-4"
            >
              {inherited ? 'Restablecer a lo heredado' : 'Heredar de la toma general'}
            </button>
          )}
        </div>
      )}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onClose}
          className="btn min-h-touch flex-1 border border-stone-600 text-xs text-white"
        >
          Volver a las herramientas
        </button>
        <p className="min-w-0 shrink truncate text-xs text-stone-400">
          {colorSummary(color) ?? 'Sin ajuste de color'}
        </p>
      </div>

      <p id={helpId} role="status" aria-live="polite" className="text-center text-xs text-stone-400">
        {helpText()}
      </p>
    </div>
  )
}
