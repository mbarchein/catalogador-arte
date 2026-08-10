import { inflateSync } from 'node:zlib'
import { PDFDocument, PDFRawStream } from 'pdf-lib'
import { describe, expect, it } from 'vitest'
import {
  MAX_PATCH_SIZE_RATIO,
  MIN_PATCHES,
  MIN_PATCH_SIDE,
  MIN_STEP,
  MIN_TONE_RATIO,
  MIN_CONFIDENCE,
  analyseGrayTarget,
} from './grayTarget'
import { linearToSrgb, srgbToLinear } from './imageColor'
import type { PixelRaster } from './imagePixels'
import {
  A5_LANDSCAPE,
  GRAY_TARGET_SHEET_TEXT,
  KEYLINE_SHARE,
  MIN_FRAME_SHARE,
  SHEET_PATCH_CODES,
  SHEET_RULE_CODE,
  generateGrayTargetSheet,
  grayTargetSheetLayout,
} from './grayTargetSheet'

/**
 * The sheet of RF-418, §4, measured against the rules of the detector that has to
 * recognize it.
 *
 * **This is the test the sheet exists for.** A wedge printed with steps below
 * `MIN_STEP`, with unequal cells or with a white gutter between patches would come out
 * of the printer looking perfectly fine and would be invisible to the very code that
 * asked for it: the cataloger would lay it beside the artwork, take the photograph, and
 * the application would answer «no se ha encontrado un testigo de gris». Nothing about
 * that failure is visible on paper, which is why it is pinned down here.
 *
 * The last block is the one that closes the loop: a **synthetic photograph of this
 * sheet** — paper, dark rule, the five patches, on a wall — handed to
 * `analyseGrayTarget`. Checking the numbers one by one says the design obeys the rules
 * as they are written today; painting the sheet and running the detector says the two
 * modules still agree, which is the thing that would break silently.
 */

const layout = grayTargetSheetLayout()
const patchWidth = layout.patches[0]!.width

/* -------------------------------------------------- the tones of the staircase */

describe('grayTargetSheet: la escalera impresa cumple las reglas del detector (RF-418)', () => {
  it('RF-418: imprime al menos los parches que el detector exige para ver una escalera', () => {
    expect(SHEET_PATCH_CODES.length).toBeGreaterThanOrEqual(MIN_PATCHES)
  })

  // Lightest first, which is also left to right on the sheet: a staircase runs in one
  // direction and the detector chases exactly that.
  it('RF-418: los parches van del claro al oscuro, sin volver atrás', () => {
    const sorted = [...SHEET_PATCH_CODES].sort((a, b) => b - a)
    expect([...SHEET_PATCH_CODES]).toEqual(sorted)
  })

  // MIN_STEP is what keeps a gradient out of the detector, so a wedge whose steps sit
  // below it is a wedge that reads as a wall lit from one side.
  it('RF-418: cada escalón supera MIN_STEP, con sitio de sobra para que la imprenta lo comprima', () => {
    const steps = SHEET_PATCH_CODES.slice(1).map((code, i) => SHEET_PATCH_CODES[i]! - code)
    for (const step of steps) expect(step).toBeGreaterThanOrEqual(MIN_STEP)
    // Twice the minimum: a domestic printer that halves the dark steps still prints
    // steps the detector counts.
    expect(Math.min(...steps)).toBeGreaterThanOrEqual(2 * MIN_STEP)
  })

  it('RF-418: el recorrido de la escalera supera MIN_TONE_RATIO en luz lineal', () => {
    const lightest = srgbToLinear(SHEET_PATCH_CODES[0]! / 255)
    const darkest = srgbToLinear(SHEET_PATCH_CODES[SHEET_PATCH_CODES.length - 1]! / 255)
    expect(lightest / darkest).toBeGreaterThan(MIN_TONE_RATIO)
  })

  // §3.5: a clipped channel has lost how far past the top it went and one in the noise
  // floor has lost its ratio to the others. The sheet is exposed for the artwork, not
  // for itself, so both extremes keep room.
  it('RF-418: los extremos se quedan lejos de los topes de la escala (§3.5)', () => {
    expect(Math.max(...SHEET_PATCH_CODES)).toBeLessThan(240)
    expect(Math.min(...SHEET_PATCH_CODES)).toBeGreaterThan(24)
  })

  /**
   * The rule around the patches has one job and two ways of not doing it: merging into
   * the black patch — which is harmless, it only widens it — or standing far enough
   * from it to be counted as one more step of the staircase. The second is what this
   * gap prevents.
   */
  it('RF-418: el marco oscuro nunca es un escalón más de la escalera', () => {
    const darkest = Math.min(...SHEET_PATCH_CODES)
    expect(darkest - SHEET_RULE_CODE).toBeLessThan(MIN_STEP)
    // And far enough not to be read as the same tone: the segmentation window of the
    // detector is a handful of codes wide.
    expect(darkest - SHEET_RULE_CODE).toBeGreaterThan(10)
  })
})

/* ------------------------------------------------------ the geometry of the sheet */

describe('grayTargetSheet: la disposición que el detector espera (RF-418)', () => {
  it('RF-418: los parches se dibujan iguales, como se dibuja cualquier escala', () => {
    const widths = layout.patches.map((patch) => patch.width)
    const ratio = Math.max(...widths) / Math.min(...widths)
    expect(ratio).toBe(1)
    expect(ratio).toBeLessThanOrEqual(MAX_PATCH_SIZE_RATIO)
    // Equal in height too: they are one band, not a staircase of steps.
    expect(new Set(layout.patches.map((patch) => patch.y))).toHaveProperty('size', 1)
    expect(new Set(layout.patches.map((patch) => patch.height))).toHaveProperty('size', 1)
  })

  // The detector chains CONTIGUOUS runs: a white gutter would break the chain, and the
  // intermediate tone of a seam would read as an extra patch and blow the size ratio.
  it('RF-418: los parches se tocan, sin pasillo blanco entre ellos', () => {
    for (let i = 1; i < layout.patches.length; i += 1) {
      const previous = layout.patches[i - 1]!
      expect(layout.patches[i]!.x).toBeCloseTo(previous.x + previous.width, 6)
    }
  })

  /**
   * The widest seam the detector tolerates between two patches is 15 % of the smallest
   * patch it accepts, and a patch of this sheet is never smaller than that in a
   * photograph where it can be measured at all. So a rule of a fifth of the patch is
   * always wider than the seam, and the white of the paper can never touch the light
   * patch.
   */
  it('RF-418: el marco es más grueso que la costura que el detector tolera', () => {
    expect(layout.keyline / patchWidth).toBeCloseTo(KEYLINE_SHARE, 6)
    expect(layout.keyline / patchWidth).toBeGreaterThan(0.15)
  })

  it('RF-418: el marco rodea los parches por los cuatro lados', () => {
    const first = layout.patches[0]!
    const last = layout.patches[layout.patches.length - 1]!
    expect(first.x - layout.frame.x).toBeCloseTo(layout.keyline, 6)
    expect(layout.frame.x + layout.frame.width - (last.x + last.width)).toBeCloseTo(
      layout.keyline,
      6,
    )
    expect(first.y - layout.frame.y).toBeCloseTo(layout.keyline, 6)
    expect(layout.frame.y + layout.frame.height - (first.y + first.height)).toBeCloseTo(
      layout.keyline,
      6,
    )
  })

  /**
   * Nine tenths of a patch's pixels have to sit within a few codes of its median, so a
   * number printed inside one would be exactly the fold the detector refuses. The
   * values go below the rule.
   */
  it('RF-418: los valores se imprimen fuera de los parches, nunca encima', () => {
    expect(layout.labels).toHaveLength(SHEET_PATCH_CODES.length)
    for (const label of layout.labels) {
      // The top of the text — its baseline plus its size — still clears the rule.
      expect(label.baseline + label.size).toBeLessThanOrEqual(layout.frame.y)
      expect(label.baseline).toBeGreaterThan(layout.margin)
    }
    expect(layout.labels.map((label) => label.text)).toEqual(
      SHEET_PATCH_CODES.map((code) => String(code)),
    )
  })

  it('la hoja cabe en su página, con sitio para las notas debajo', () => {
    expect(layout.frame.x).toBe(layout.margin)
    expect(layout.frame.x + layout.frame.width).toBeCloseTo(
      layout.page.width - layout.margin,
      6,
    )
    expect(layout.frame.y + layout.frame.height).toBeLessThan(layout.page.height - layout.margin)
    expect(layout.notesTop).toBeGreaterThan(layout.margin + 60)
  })
})

/* --------------------------------------------------------------- what it says */

describe('grayTargetSheet: lo que la hoja dice de sí misma (RF-418)', () => {
  /**
   * The sentence that distinguishes TARGET_PRINT from TARGET_CARD, printed where the
   * person holding the paper reads it: household ink is a pattern and a pair of
   * endpoints, not a measurement of the cast.
   */
  it('RF-418: advierte de que el gris de una impresora doméstica no es neutro', () => {
    const notes = GRAY_TARGET_SHEET_TEXT.notes.join(' ')
    expect(notes).toContain('no es neutro')
    expect(notes).toContain('puntos negro y blanco')
    expect(notes).toContain('carta de gris comprada')
  })

  // Derived from MIN_PATCH_SIDE and not written by hand: if the detector ever demands
  // bigger patches, the instruction on the sheet moves with it.
  it('RF-418: la talla mínima que pide sale de MIN_PATCH_SIDE, no de una opinión', () => {
    expect(MIN_FRAME_SHARE).toBeCloseTo(SHEET_PATCH_CODES.length * MIN_PATCH_SIDE, 10)
    const percent = `${Math.round(MIN_FRAME_SHARE * 100)}%`
    expect(GRAY_TARGET_SHEET_TEXT.notes.join(' ')).toContain(percent)
  })

  it('RF-418: explica qué son los números que van debajo de los parches', () => {
    expect(GRAY_TARGET_SHEET_TEXT.values).toContain('0 (negro)')
    expect(GRAY_TARGET_SHEET_TEXT.values).toContain('255 (blanco)')
  })

  /**
   * The trap `printableText` guards in the printed record: Helvetica only knows
   * WinAnsi, and one arrow or emoji pasted into this copy would throw at generation
   * time and leave the cataloger with no sheet at all. Here there is no user data, so
   * the fix is to keep the literals inside the repertoire — and to notice when they
   * leave it.
   */
  it('todo el texto de la hoja lo puede imprimir la Helvetica del PDF', () => {
    const printable = /^[ -~ -ÿ‘’“”–—…•€]*$/
    const texts = [
      GRAY_TARGET_SHEET_TEXT.title,
      GRAY_TARGET_SHEET_TEXT.intro,
      GRAY_TARGET_SHEET_TEXT.values,
      GRAY_TARGET_SHEET_TEXT.footer,
      ...GRAY_TARGET_SHEET_TEXT.notes,
    ]
    for (const text of texts) expect(text).toMatch(printable)
  })
})

/* ------------------------------------------------- a photograph of the sheet */

/**
 * A synthetic photograph of the printed sheet: the wall, the paper, the dark rule and
 * the five patches, laid out from the very layout the PDF is drawn with — so a change
 * in the arrangement moves this fixture with it instead of leaving it agreeing with a
 * sheet nobody prints any more.
 *
 * The ink and the paper are modelled as their codes and nothing else: what is being
 * verified is the **arrangement**, which is what this module decides. How the detector
 * behaves with noise, soft edges and perspective is its own test's business.
 *
 * `gain` is an exposure, applied in linear light because that is what an exposure
 * physically is: at half a stop or two stops down the codes move exactly as they move
 * in the storeroom, and the dark end of the scale compresses exactly as much.
 */
function photographOfSheet({
  width = 320,
  height = 220,
  stripShare = 0.65,
  gain = 1,
  rule = SHEET_RULE_CODE,
  paper = 250,
  wall = 128,
}: {
  width?: number
  height?: number
  /** Share of the frame's width the strip occupies. */
  stripShare?: number
  gain?: number
  /** The rule's code, or `paper` to see the sheet without it. */
  rule?: number
  paper?: number
  wall?: number
} = {}): PixelRaster {
  const exposed = (code: number) =>
    Math.round(linearToSrgb(Math.min(1, srgbToLinear(code / 255) * gain)) * 255)

  const data = new Uint8ClampedArray(width * height * 4)
  const paint = (box: { x: number; y: number; width: number; height: number }, code: number) => {
    const value = exposed(code)
    const x0 = Math.round(box.x)
    const y0 = Math.round(box.y)
    const x1 = Math.round(box.x + box.width)
    const y1 = Math.round(box.y + box.height)
    for (let y = Math.max(0, y0); y < Math.min(height, y1); y += 1) {
      for (let x = Math.max(0, x0); x < Math.min(width, x1); x += 1) {
        const at = (y * width + x) * 4
        data[at] = value
        data[at + 1] = value
        data[at + 2] = value
        data[at + 3] = 255
      }
    }
  }

  // The sheet, scaled so the strip takes its share of the frame and centred on the
  // wall: a target that reaches the border of the photograph is the background, and
  // the detector says so.
  const scale = (stripShare * width) / layout.frame.width
  const originX = (width - layout.page.width * scale) / 2
  const originY = (height - layout.page.height * scale) / 2
  // PDF coordinates grow upwards and pixels downwards.
  const toPixels = (box: { x: number; y: number; width: number; height: number }) => ({
    x: originX + box.x * scale,
    y: originY + (layout.page.height - box.y - box.height) * scale,
    width: box.width * scale,
    height: box.height * scale,
  })

  paint({ x: 0, y: 0, width, height }, wall)
  paint(toPixels({ x: 0, y: 0, width: layout.page.width, height: layout.page.height }), paper)
  paint(toPixels(layout.frame), rule)
  layout.patches.forEach((patch, i) => paint(toPixels(patch), SHEET_PATCH_CODES[i]!))

  return { data, width, height }
}

/** The codes the patches come out with at that exposure, lightest first. */
function exposedCodes(gain: number): number[] {
  return SHEET_PATCH_CODES.map((code) =>
    Math.round(linearToSrgb(Math.min(1, srgbToLinear(code / 255) * gain)) * 255),
  )
}

describe('grayTargetSheet: el detector reconoce la hoja que esta aplicación imprime (RF-418)', () => {
  /**
   * The end of the loop: whatever the arithmetic above says, this is a photograph of
   * the sheet handed to the code that has to find it. Without this test the two
   * modules can drift apart with every test still green, and the way it would be
   * discovered is a cataloger photographing a sheet this application printed and
   * being told there is no target in the frame.
   */
  it('RF-418: una fotografía de la hoja se detecta, y los tonos medidos son los impresos', () => {
    const analysis = analyseGrayTarget(photographOfSheet(), { kind: 'PRINT' })
    expect(analysis.declined).toBeNull()
    const [best] = analysis.candidates
    expect(best).toBeDefined()
    expect(best!.patches).toHaveLength(SHEET_PATCH_CODES.length)
    expect(best!.confidence).toBeGreaterThanOrEqual(MIN_CONFIDENCE)
    expect(best!.patches.map((patch) => patch.tone.r)).toEqual([...SHEET_PATCH_CODES])
    expect(best!.patches.map((patch) => patch.tone.g)).toEqual([...SHEET_PATCH_CODES])
    expect(best!.patches.map((patch) => patch.tone.b)).toEqual([...SHEET_PATCH_CODES])
  })

  /**
   * The declaration travels in and nothing in the pixels tells a card from a sheet, so
   * what the sheet earns is the state `TARGET_PRINT` and a grey that is NOT believed
   * as a cast: that is the whole reason this application prints a sheet and still asks
   * for a bought card.
   */
  it('RF-418: la hoja se registra como TARGET_PRINT y su gris no se cree como dominante', () => {
    const [best] = analyseGrayTarget(photographOfSheet(), { kind: 'PRINT' }).candidates
    expect(best!.reference).toBe('TARGET_PRINT')
    expect(best!.trustsGray).toBe(false)
    expect(best!.neutral).toBeNull()
  })

  // Two different sizes in the frame, because the rule around the patches is thicker
  // than the detector's seam in one and thinner in the other: the sheet has to work in
  // both, and the arithmetic that says so is worth checking against the code.
  it('RF-418: se detecta tanto ocupando media foto como ocupando dos tercios', () => {
    for (const stripShare of [0.5, 0.65]) {
      const analysis = analyseGrayTarget(photographOfSheet({ stripShare }), { kind: 'PRINT' })
      expect(analysis.candidates[0]?.patches).toHaveLength(SHEET_PATCH_CODES.length)
    }
  })

  /**
   * Two stops under, which is the target lying in the shade while the artwork is lit —
   * the case §4 has to keep working. The steps compress towards the dark end, and the
   * span of this sheet is what leaves them above `MIN_STEP` when they do.
   */
  it('RF-418: la hoja fotografiada dos pasos por debajo se sigue detectando', () => {
    const gain = 1 / 4
    const analysis = analyseGrayTarget(photographOfSheet({ gain }), { kind: 'PRINT' })
    expect(analysis.declined).toBeNull()
    const [best] = analysis.candidates
    expect(best!.patches).toHaveLength(SHEET_PATCH_CODES.length)
    expect(best!.patches.map((patch) => patch.tone.r)).toEqual(exposedCodes(gain))
  })

  /**
   * What the dark rule buys, measured: with the white margin of the paper touching the
   * light patch, the two are one step apart, the detector chains the margin onto the
   * staircase as one more patch — and then throws the whole thing away, because a
   * chain whose patches are that unequal is not a graded scale. The sheet would print
   * beautifully and be invisible.
   *
   * The reason it is *thrown away* rather than accepted with a wrong white point is the
   * detector's own prudence — maximal chains only, with no fallback to a shorter window
   * inside a rejected one. Which is why what this test pins down is that there is no
   * candidate at all: the exact stage it declines at depends on how bright the paper
   * came out, and that is not the sheet's business. The rule's is: with it there is
   * always a dark run between the paper and the light patch.
   */
  it('RF-418: sin el marco oscuro, el papel se encadena a la escalera y la hoja no se detecta', () => {
    const withoutRule = analyseGrayTarget(photographOfSheet({ rule: 250 }), { kind: 'PRINT' })
    expect(withoutRule.candidates).toHaveLength(0)
    expect(withoutRule.declined).not.toBeNull()

    const withRule = analyseGrayTarget(photographOfSheet(), { kind: 'PRINT' })
    expect(withRule.candidates[0]?.patches).toHaveLength(SHEET_PATCH_CODES.length)
  })
})

/* ------------------------------------------------------------------ the PDF */

const latin1 = (bytes: Uint8Array) => new TextDecoder('latin1').decode(bytes)

/**
 * What the sheet says and draws, read back from the document: pdf-lib compresses the
 * content streams, so checking that a literal reaches the paper means inflating them.
 * The same helper as `recordPdf.test.ts`, for the same reason.
 */
async function contentOf(bytes: Uint8Array): Promise<string> {
  const doc = await PDFDocument.load(bytes)
  let content = ''
  for (const [, object] of doc.context.enumerateIndirectObjects()) {
    if (!(object instanceof PDFRawStream)) continue
    try {
      content += latin1(new Uint8Array(inflateSync(object.contents)))
    } catch {
      // Not a Flate stream.
    }
  }
  return content
}

const asHex = (text: string) =>
  Array.from(text, (c) => c.charCodeAt(0).toString(16).padStart(2, '0')).join('')

async function sheetPdf() {
  const blob = await generateGrayTargetSheet()
  expect(blob.type).toBe('application/pdf')
  const bytes = new Uint8Array(await blob.arrayBuffer())
  expect(latin1(bytes).slice(0, 5)).toBe('%PDF-')
  const content = await contentOf(bytes)
  // pdf-lib writes the text in hexadecimal, in upper case, and one drawText call per
  // line: only literals that survive the wrapping can be looked for.
  const lowered = content.toLowerCase()
  return {
    bytes,
    content,
    prints: (text: string) =>
      lowered.includes(text.toLowerCase()) || lowered.includes(asHex(text)),
  }
}

describe('generateGrayTargetSheet: el PDF (RF-418)', () => {

  it('RF-418: genera un A5 apaisado de una sola página', async () => {
    const { bytes } = await sheetPdf()
    const doc = await PDFDocument.load(bytes)
    expect(doc.getPageCount()).toBe(1)
    const { width, height } = doc.getPage(0).getSize()
    expect(width).toBeCloseTo(A5_LANDSCAPE.width, 2)
    expect(height).toBeCloseTo(A5_LANDSCAPE.height, 2)
    expect(width).toBeGreaterThan(height)
  })

  it('RF-418: imprime el valor de cada parche', async () => {
    const { prints } = await sheetPdf()
    for (const code of SHEET_PATCH_CODES) expect(prints(String(code))).toBe(true)
  })

  it('RF-418: imprime la advertencia de que la tinta doméstica no es neutra', async () => {
    const { prints } = await sheetPdf()
    expect(prints('no es neutro')).toBe(true)
    expect(prints('carta de gris comprada')).toBe(true)
  })

  /**
   * One page and nothing spilling off it: the sheet is meant to be printed once and
   * laid on a table, and the notes are what gives way — never the strip, which is the
   * only part of this sheet a camera has to read.
   */
  it('nada se imprime por debajo del margen inferior, y la letra sigue siendo legible', async () => {
    const { content } = await sheetPdf()
    const baselines = Array.from(
      content.matchAll(/1 0 0 1 [\d.]+ ([\d.]+) Tm/g),
      (m) => Number(m[1]),
    )
    expect(baselines.length).toBeGreaterThan(10)
    expect(Math.min(...baselines)).toBeGreaterThanOrEqual(layout.margin)
    const sizes = Array.from(content.matchAll(/\/\S+ ([\d.]+) Tf/g), (m) => Number(m[1]))
    // The footer line is the only one allowed to be smaller: it says what the sheet is,
    // not how to use it.
    expect(sizes.filter((size) => size > 6.5).length).toBe(sizes.length - 1)
    expect(Math.min(...sizes.filter((size) => size > 6.5))).toBeGreaterThanOrEqual(7.5)
  })

  /**
   * The patches are written in **DeviceGray** (`g`), not as three equal RGB
   * components: a grey asked for in RGB goes through the printer's colour conversion
   * and comes back with a tint of coloured ink, which is the one thing a grey target
   * must not have.
   */
  it('RF-418: los parches se escriben en gris de dispositivo, con el código que anuncian', async () => {
    const { content } = await sheetPdf()
    const grays = Array.from(content.matchAll(/([\d.]+) g\b/g), (m) => Number(m[1]))
    for (const code of SHEET_PATCH_CODES) {
      expect(grays.some((gray) => Math.abs(gray - code / 255) < 0.002)).toBe(true)
    }
    expect(grays.some((gray) => Math.abs(gray - SHEET_RULE_CODE / 255) < 0.002)).toBe(true)
    expect(content).not.toMatch(/[\d.]+ [\d.]+ [\d.]+ rg\b/)
  })
})
