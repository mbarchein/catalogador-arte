import { describe, expect, it } from 'vitest'
import { linearToSrgb } from './imageColor'
import type { PixelRaster } from './imagePixels'
import { cornersOfRect, rotateCorners } from './perspective'
import {
  MIN_CONFIDENCE,
  analyseGrayTarget,
  detectGrayTarget,
  grayTargetNotice,
  grayTargetReference,
  type GrayTargetOptions,
} from './grayTarget'

/**
 * The detector is exercised with synthetic photographs, which is the only way to
 * have ground truth: with a real one there is no answer to compare against, only an
 * opinion.
 *
 * The patches are built from **reflectances** and encoded through `linearToSrgb`,
 * and the light is applied as a per-channel gain in linear light — which is what a
 * bulb and a shadow physically are. That is not decoration: it is what makes the
 * fixtures able to prove that the staircase survives a cast and survives a shadow,
 * because in both cases the tones move exactly as they move in the storeroom.
 *
 * The wall is a mid grey, as in `edgeDetection.test.ts`, and the target is laid on it
 * without touching any border of the frame: a target that reaches the edge of the
 * photograph is the background, and the detector says so.
 */

/* ------------------------------------------------------------------ fixtures */

const WIDTH = 96
const HEIGHT = 64
const WALL = 128

/** Reflectances of a three-patch target: white, mid grey and black. */
const CARD = [0.9, 0.18, 0.05] as const

type Pixel = readonly [number, number, number]

/** A code from a reflectance under a per-channel gain. Linear light, then encoded. */
function toneCode(reflectance: number, gain = 1): number {
  return Math.round(linearToSrgb(Math.min(1, Math.max(0, reflectance * gain))) * 255)
}

/** A grey patch, or a patch under the three gains of an illuminant. */
function tone(reflectance: number, gains: readonly [number, number, number] = [1, 1, 1]): Pixel {
  return [
    toneCode(reflectance, gains[0]),
    toneCode(reflectance, gains[1]),
    toneCode(reflectance, gains[2]),
  ]
}

interface Canvas extends PixelRaster {
  data: Uint8ClampedArray
}

function canvas(width = WIDTH, height = HEIGHT, background: Pixel = [WALL, WALL, WALL]): Canvas {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < width * height; i += 1) {
    data[i * 4] = background[0]
    data[i * 4 + 1] = background[1]
    data[i * 4 + 2] = background[2]
    data[i * 4 + 3] = 255
  }
  return { data, width, height }
}

/** Paints a half-open rectangle of pixels. */
function fill(
  target: Canvas,
  box: { x: number; y: number; width: number; height: number },
  pixel: Pixel,
): void {
  for (let y = box.y; y < box.y + box.height; y += 1) {
    for (let x = box.x; x < box.x + box.width; x += 1) {
      const at = (y * target.width + x) * 4
      target.data[at] = pixel[0]
      target.data[at + 1] = pixel[1]
      target.data[at + 2] = pixel[2]
      target.data[at + 3] = 255
    }
  }
}

/** Deterministic pseudorandom numbers: a test with real noise is not a test. */
function randomizer(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 4294967296
  }
}

function addNoise(target: Canvas, amplitude: number, seed = 7): void {
  const random = randomizer(seed)
  for (let i = 0; i < target.width * target.height; i += 1) {
    const shift = Math.round((random() * 2 - 1) * amplitude)
    for (let c = 0; c < 3; c += 1) {
      target.data[i * 4 + c] = (target.data[i * 4 + c] ?? 0) + shift
    }
  }
}

const PATCH = { width: 20, height: 20 }
const STRIP = { x: 12, y: 22 }

/**
 * A target laid on the wall: three patches side by side, none of them touching a
 * border of the frame.
 */
function targetOn(
  target: Canvas,
  options: {
    x?: number
    y?: number
    gains?: readonly [number, number, number]
    reflectances?: readonly number[]
    patches?: readonly Pixel[]
  } = {},
): { x: number; y: number; width: number; height: number }[] {
  const x = options.x ?? STRIP.x
  const y = options.y ?? STRIP.y
  const pixels =
    options.patches ??
    (options.reflectances ?? CARD).map((reflectance) => tone(reflectance, options.gains))
  return pixels.map((pixel, i) => {
    const box = { x: x + i * PATCH.width, y, width: PATCH.width, height: PATCH.height }
    fill(target, box, pixel)
    return box
  })
}

const CARD_OPTIONS: GrayTargetOptions = { kind: 'CARD' }

/* --------------------------------------------------------------------- tests */

describe('grayTarget: la escalera de un testigo de gris (RF-418, §4)', () => {
  it('RF-418: detecta una carta de tres parches bien puesta y devuelve sus tonos', () => {
    const photo = canvas()
    const boxes = targetOn(photo)

    const analysis = analyseGrayTarget(photo, CARD_OPTIONS)
    expect(analysis.declined).toBeNull()
    expect(analysis.candidates).toHaveLength(1)

    const candidate = analysis.candidates[0]!
    expect(candidate.axis).toBe('horizontal')
    expect(candidate.patches).toHaveLength(3)
    expect(candidate.confidence).toBeGreaterThan(0.9)

    // From the lightest to the darkest, with the tones that were painted.
    expect(candidate.patches.map((patch) => patch.tone.r)).toEqual(
      CARD.map((reflectance) => toneCode(reflectance)),
    )
    for (const patch of candidate.patches) {
      expect(patch.tone.r).toBe(patch.tone.g)
      expect(patch.tone.g).toBe(patch.tone.b)
      expect(patch.pixels).toBe(PATCH.width * PATCH.height)
    }

    // Position and size as fractions of the analysed raster.
    expect(candidate.patches[0]!.box.x).toBeCloseTo(boxes[0]!.x / WIDTH, 6)
    expect(candidate.patches[0]!.box.y).toBeCloseTo(boxes[0]!.y / HEIGHT, 6)
    expect(candidate.patches[0]!.box.width).toBeCloseTo(PATCH.width / WIDTH, 6)
    expect(candidate.patches[0]!.box.height).toBeCloseTo(PATCH.height / HEIGHT, 6)
    expect(candidate.box.x).toBeCloseTo(STRIP.x / WIDTH, 6)
    expect(candidate.box.width).toBeCloseTo((3 * PATCH.width) / WIDTH, 6)

    // The staircase is recognised by its relative structure, and that is what is measured.
    expect(candidate.measure.toneRatio).toBeGreaterThan(10)
    expect(candidate.measure.sizeRatio).toBeCloseTo(1, 6)
    expect(candidate.measure.support).toBe(1)
    expect(candidate.measure.specularShare).toBe(0)
    expect(candidate.measure.clippedShare).toBe(0)

    // The user's declaration is the only thing telling a chart from paper.
    expect(candidate.reference).toBe('TARGET_CARD')
    expect(candidate.trustsGray).toBe(true)
    expect(grayTargetNotice(analysis)).toBeNull()
    expect(detectGrayTarget(photo, CARD_OPTIONS)).toEqual(analysis.candidates)
  })

  it('RF-418: la dominante de la bombilla no impide detectar la escalera, y su gris propone enfriarla', () => {
    const photo = canvas()
    // A warm bulb: plenty of red, somewhat less green, considerably less blue.
    targetOn(photo, { gains: [1, 0.93, 0.82] })

    const candidate = detectGrayTarget(photo, CARD_OPTIONS)[0]
    expect(candidate).toBeDefined()
    expect(candidate!.patches).toHaveLength(3)
    // The patches are no longer neutral in the codes: what gives them away is that the
    // three share chromaticity, because a light multiplies them all equally.
    expect(candidate!.patches[0]!.tone.r).toBeGreaterThan(candidate!.patches[0]!.tone.b)
    expect(candidate!.measure.chromaSpread).toBeLessThan(0.02)
    expect(candidate!.measure.castSpread).toBeGreaterThan(0.05)

    // And a chart's grey is believed: it proposes correcting towards blue.
    expect(candidate!.neutral).not.toBeNull()
    expect(candidate!.neutral!.temperature).toBeLessThan(0)
  })

  it('RF-418: el testigo en sombra se sigue detectando, porque la relación de tonos no depende de la exposición', () => {
    const photo = canvas()
    // The artwork lit and the target in the shade: a third of the light.
    targetOn(photo, { gains: [0.35, 0.35, 0.35] })

    const analysis = analyseGrayTarget(photo, CARD_OPTIONS)
    expect(analysis.declined).toBeNull()
    expect(analysis.candidates).toHaveLength(1)
    const candidate = analysis.candidates[0]!
    expect(candidate.patches).toHaveLength(3)
    // The codes have dropped a lot and the tone ratio in linear light has not moved.
    expect(candidate.patches[0]!.tone.r).toBeLessThan(toneCode(CARD[0]) - 60)
    expect(candidate.measure.toneRatio).toBeGreaterThan(10)
    expect(candidate.confidence).toBeGreaterThanOrEqual(MIN_CONFIDENCE)
  })

  it('RF-418: una pared uniforme no da ningún candidato de escalera', () => {
    const flat = canvas()
    addNoise(flat, 6)
    const flatAnalysis = analyseGrayTarget(flat, CARD_OPTIONS)
    expect(flatAnalysis.candidates).toEqual([])
    expect(flatAnalysis.declined).toBe('no-staircase')

    // And a wall lit from one side does not either: a gradient has no steps.
    const lit = canvas()
    for (let x = 0; x < WIDTH; x += 1) {
      const code = Math.round(96 + (80 * x) / WIDTH)
      fill(lit, { x, y: 0, width: 1, height: HEIGHT }, [code, code, code])
    }
    addNoise(lit, 2, 11)
    const litAnalysis = analyseGrayTarget(lit, CARD_OPTIONS)
    expect(litAnalysis.candidates).toEqual([])
    expect(litAnalysis.declined).toBe('no-staircase')
  })

  it('RF-418: dos parches no son una escalera, porque el borde de cualquier objeto los da', () => {
    const photo = canvas()
    targetOn(photo, { reflectances: [0.9, 0.05] })

    const analysis = analyseGrayTarget(photo, CARD_OPTIONS)
    expect(analysis.candidates).toEqual([])
    expect(analysis.declined).toBe('no-staircase')
  })

  it('RF-418: tres grises cercanos con escalones de sobra no son un testigo, porque les falta recorrido', () => {
    const photo = canvas()
    // Three shelves in three light greys of the same wall. The steps are of 27
    // and 28 codes, comfortably above MIN_STEP, uniform, aligned, the
    // same size and achromatic: they pass ALL the other rules. The only thing that
    // separates them from a target is that from the lightest to the darkest there is only a ratio
    // of 2.1 in linear light, and a chart goes from white to black. This is the case that makes
    // MIN_TONE_RATIO have teeth: without it, it could be 1 and everything would stay green.
    targetOn(photo, { patches: [[140, 140, 140], [167, 167, 167], [195, 195, 195]] })

    const analysis = analyseGrayTarget(photo, CARD_OPTIONS)
    expect(analysis.candidates).toEqual([])
    expect(analysis.declined).toBe('no-staircase')
  })

  it('RF-418: una secuencia de parches desiguales no es un testigo, porque una escala se dibuja con celdas iguales', () => {
    const photo = canvas()
    // «Wide wall, narrow shadow, wide floor»: the tones step from white to
    // black and the chromaticity agrees, but 26 and 6 pixels are not the same cell.
    // It is the rule §4's printable sheet has to respect when it is drawn.
    const widths = [26, 6, 26]
    let x = 10
    CARD.forEach((reflectance, i) => {
      const width = widths[i]!
      fill(photo, { x, y: STRIP.y, width, height: PATCH.height }, tone(reflectance))
      x += width
    })

    const analysis = analyseGrayTarget(photo, CARD_OPTIONS)
    expect(analysis.candidates).toEqual([])
    expect(analysis.declined).toBe('no-staircase')
  })

  it('RF-418: parches que no concuerdan en cromaticidad no son un testigo, aunque ninguno tenga mucho color', () => {
    const photo = canvas()
    // Cream, bluish grey and almost black: they step from white to black and none carries
    // enough colour for MAX_CAST_SPREAD to knock it out —theirs stays at 0.16 of
    // the 0.35 tolerated—, so what rejects them is the agreement and not the ceiling.
    // What gives them away: a light multiplies the three patches by the same three
    // numbers, so a different chromaticity in each patch was not put there by the light.
    targetOn(photo, { patches: [[240, 232, 216], [116, 128, 138], [46, 44, 42]] })

    const analysis = analyseGrayTarget(photo, CARD_OPTIONS)
    expect(analysis.candidates).toEqual([])
    expect(analysis.declined).toBe('not-neutral')
  })

  it('RF-418: un testigo demasiado pequeño en el encuadre se descarta, y el mismo testigo mayor se detecta', () => {
    // The rule is relative to the raster, and the pair of cases is what proves it: both
    // go over the SAME 400x300 image, and the only thing that changes is the target's
    // size. Five pixels of patch are below MIN_PATCH_SIDE and their
    // median means nothing; asking for another photograph is the honest answer.
    const far = canvas(400, 300)
    CARD.forEach((reflectance, i) => {
      fill(far, { x: 100 + i * 5, y: 100, width: 5, height: 5 }, tone(reflectance))
    })
    const distant = analyseGrayTarget(far, CARD_OPTIONS)
    expect(distant.candidates).toEqual([])
    expect(distant.declined).toBe('no-staircase')

    const near = canvas(400, 300)
    CARD.forEach((reflectance, i) => {
      fill(near, { x: 100 + i * 20, y: 100, width: 20, height: 20 }, tone(reflectance))
    })
    const analysis = analyseGrayTarget(near, CARD_OPTIONS)
    expect(analysis.declined).toBeNull()
    expect(analysis.candidates).toHaveLength(1)
    expect(analysis.candidates[0]!.patches).toHaveLength(3)
  })

  it('RF-418: un reflejo especular sobre un parche descarta el candidato', () => {
    const photo = canvas()
    const boxes = targetOn(photo)
    const middle = boxes[1]!
    // A highlight over the middle patch, neither blown out nor on every row: it is
    // exactly what a window reflection on a chart does.
    fill(photo, { x: middle.x + 4, y: middle.y + 8, width: 14, height: 4 }, [178, 178, 178])

    const analysis = analyseGrayTarget(photo, CARD_OPTIONS)
    expect(analysis.candidates).toEqual([])
    expect(analysis.declined).toBe('specular')
    expect(grayTargetNotice(analysis)).toContain('reflejo')
  })

  it('RF-418: un pliegue que cruza un parche lo descarta, aunque cada línea siga viendo la escalera', () => {
    const photo = canvas()
    const boxes = targetOn(photo)
    const middle = boxes[1]!
    // The lower half of the middle patch, in shade. The fold runs ALONG
    // the scan lines, so each line still sees three patches of the same
    // width and with their steps: the staircase does not break. What breaks is that
    // the patch be a flat surface, and that is only visible in the second dimension —which
    // is exactly why uniformity is measured over the box and not over a
    // line. Without this case, the rule could be at 0.1 and nothing would say so.
    fill(
      photo,
      { x: middle.x, y: middle.y + PATCH.height / 2, width: PATCH.width, height: PATCH.height / 2 },
      tone(CARD[1], [0.6, 0.6, 0.6]),
    )

    const analysis = analyseGrayTarget(photo, CARD_OPTIONS)
    expect(analysis.candidates).toEqual([])
    expect(analysis.declined).toBe('not-uniform')
  })

  it('RF-418: un parche con un canal saturado a 255 se descarta (§3.5)', () => {
    const photo = canvas()
    targetOn(photo, {
      patches: [
        // Red has clipped: how far it went over is no longer known, so its
        // chromaticity is a number that looks measured and is not.
        [255, 236, 232],
        tone(CARD[1]),
        tone(CARD[2]),
      ],
    })

    const analysis = analyseGrayTarget(photo, CARD_OPTIONS)
    expect(analysis.candidates).toEqual([])
    expect(analysis.declined).toBe('clipped')
  })

  it('RF-418: una escalera de un color propio no es un testigo de gris', () => {
    const photo = canvas()
    // Three bands of the same red paint: they share chromaticity perfectly
    // and yet they have colour, which is what a target does not have.
    targetOn(photo, { gains: [1, 0.25, 0.2] })

    const analysis = analyseGrayTarget(photo, CARD_OPTIONS)
    expect(analysis.candidates).toEqual([])
    expect(analysis.declined).toBe('not-neutral')
  })

  it('RF-418: la escalera se busca fuera de la obra, porque el testigo se pone al lado', () => {
    const photo = canvas()
    targetOn(photo)
    // Without saying where the artwork is, the staircase is found.
    expect(detectGrayTarget(photo, CARD_OPTIONS)).toHaveLength(1)

    // With the artwork declared on top of the target, it stops being a candidate.
    const rect = { x: 0.1, y: 0.3, width: 0.68, height: 0.4 }
    const inside = analyseGrayTarget(photo, {
      kind: 'CARD',
      artwork: { corners: cornersOfRect(rect) },
    })
    expect(inside.candidates).toEqual([])
    expect(inside.declined).toBe('no-staircase')

    // And the quadrilateral arrives as fractions of the ALREADY ROTATED image, as it is stored.
    const turned = analyseGrayTarget(photo, {
      kind: 'CARD',
      artwork: { rotation: 90, corners: rotateCorners(cornersOfRect(rect), 90) },
    })
    expect(turned.candidates).toEqual([])

    // With a crop instead of corners, the same.
    const cropped = analyseGrayTarget(photo, { kind: 'CARD', artwork: { crop: rect } })
    expect(cropped.candidates).toEqual([])
  })

  it('RF-418, §4: la hoja impresa se detecta igual, pero su gris no se cree', () => {
    const photo = canvas()
    targetOn(photo, { gains: [1, 0.93, 0.82] })

    const card = detectGrayTarget(photo, { kind: 'CARD' })[0]!
    const print = detectGrayTarget(photo, { kind: 'PRINT' })[0]!

    // The image is the same: the distinction is not in the pixels.
    expect(print.box).toEqual(card.box)
    expect(print.patches.map((patch) => patch.tone)).toEqual(
      card.patches.map((patch) => patch.tone),
    )
    expect(print.confidence).toBe(card.confidence)

    expect(print.reference).toBe('TARGET_PRINT')
    expect(print.trustsGray).toBe(false)
    expect(print.neutral).toBeNull()
    expect(card.neutral).not.toBeNull()
    expect(grayTargetReference('PRINT')).toBe('TARGET_PRINT')
    expect(grayTargetReference('CARD')).toBe('TARGET_CARD')
  })

  it('RF-418: devuelve candidatos y no decide: dos testigos en la foto son dos candidatos', () => {
    const photo = canvas()
    targetOn(photo, { y: 8 })
    targetOn(photo, { y: 40 })

    const candidates = detectGrayTarget(photo, CARD_OPTIONS)
    expect(candidates).toHaveLength(2)
    for (const candidate of candidates) {
      expect(candidate.patches).toHaveLength(3)
      expect(candidate.confidence).toBeGreaterThanOrEqual(MIN_CONFIDENCE)
    }
    // Ordered by confidence, and without repeating the same place twice.
    expect(candidates[0]!.confidence).toBeGreaterThanOrEqual(candidates[1]!.confidence)
    expect(candidates[0]!.box.y).not.toBeCloseTo(candidates[1]!.box.y, 3)
  })

  it('RF-418: un ráster inservible no lanza, no inventa y lo dice', () => {
    for (const raster of [null, undefined, canvas(4, 4), { data: new Uint8ClampedArray(0), width: 0, height: 0 }]) {
      const analysis = analyseGrayTarget(raster as PixelRaster | null, CARD_OPTIONS)
      expect(analysis.candidates).toEqual([])
      expect(analysis.declined).toBe('unusable-image')
      expect(grayTargetNotice(analysis)).toContain('no se ha buscado el testigo')
    }
  })

  it('RF-418: un testigo fotografiado de verdad, con ruido y bordes blandos, se detecta', () => {
    const photo = canvas()
    const boxes = targetOn(photo, { gains: [1, 0.95, 0.88] })
    // The border between two patches is never one pixel wide in a photograph: between
    // them there is a seam with the tone blended, and leaving it inside would make it pass
    // for one more patch.
    for (let i = 1; i < boxes.length; i += 1) {
      const before = tone(CARD[i - 1]!)
      const after = tone(CARD[i]!)
      const seam: Pixel = [
        Math.round((before[0] + after[0]) / 2),
        Math.round((before[1] + after[1]) / 2),
        Math.round((before[2] + after[2]) / 2),
      ]
      fill(photo, { x: boxes[i]!.x - 1, y: boxes[i]!.y, width: 2, height: PATCH.height }, seam)
    }
    addNoise(photo, 3, 23)

    const analysis = analyseGrayTarget(photo, CARD_OPTIONS)
    expect(analysis.declined).toBeNull()
    expect(analysis.candidates).toHaveLength(1)
    const candidate = analysis.candidates[0]!
    expect(candidate.patches).toHaveLength(3)
    // The seam falls outside the measured patches, not inside.
    expect(candidate.measure.sizeRatio).toBeLessThan(1.3)
    expect(candidate.measure.uniformShare).toBeGreaterThanOrEqual(0.9)
    expect(candidate.confidence).toBeGreaterThan(0.9)
  })

  it('RF-418: una escalera de cinco parches, como la de una hoja impresa, también es una escalera', () => {
    const photo = canvas(140, 64)
    targetOn(photo, { x: 10, reflectances: [0.85, 0.45, 0.22, 0.1, 0.04] })

    const candidate = detectGrayTarget(photo, { kind: 'PRINT' })[0]
    expect(candidate).toBeDefined()
    expect(candidate!.patches).toHaveLength(5)
    // Ordered from the lightest to the darkest, always.
    const codes = candidate!.patches.map((patch) => patch.luminance)
    expect(codes).toEqual([...codes].sort((a, b) => b - a))
    expect(candidate!.reference).toBe('TARGET_PRINT')
  })

  it('RF-418: una escalera que sube justo detrás de un objeto claro no se pierde en el valle', () => {
    const photo = canvas()
    // A light object, and stuck to it the staircase backwards: the dark patch is at the
    // same time the end of a step going down and the start of the good staircase.
    targetOn(photo, {
      x: 8,
      patches: [tone(CARD[0]), tone(CARD[2]), tone(CARD[1]), tone(CARD[0])],
    })

    const analysis = analyseGrayTarget(photo, CARD_OPTIONS)
    expect(analysis.declined).toBeNull()
    expect(analysis.candidates).toHaveLength(1)
    const candidate = analysis.candidates[0]!
    expect(candidate.patches.map((patch) => patch.tone.r)).toEqual(
      CARD.map((reflectance) => toneCode(reflectance)),
    )
    // The staircase starts at the dark patch, not at the light object on the left.
    expect(candidate.box.x).toBeCloseTo((8 + PATCH.width) / WIDTH, 6)
  })

  it('RF-418: tres franjas de luz en la pared no son un testigo, porque ocupan el encuadre', () => {
    const photo = canvas()
    // Uniform, contiguous, aligned, the same size, achromatic and stepped:
    // they meet everything except being a small object next to the artwork.
    CARD.forEach((reflectance, i) => {
      fill(photo, { x: 0, y: 6 + i * 16, width: WIDTH, height: 16 }, tone(reflectance))
    })

    const analysis = analyseGrayTarget(photo, CARD_OPTIONS)
    expect(analysis.candidates).toEqual([])
    expect(analysis.declined).toBe('too-large')
    expect(grayTargetNotice(analysis)).toContain('ocupa casi todo')
  })

  it('RF-418: sin candidato hay una explicación, nunca un hueco', () => {
    const flat = canvas()
    addNoise(flat, 6)
    const notice = grayTargetNotice(analyseGrayTarget(flat, CARD_OPTIONS))
    expect(notice).toContain('No se ha encontrado ningún testigo')
    expect(notice).toContain('cuentagotas')
    expect(grayTargetNotice(null)).toBeNull()
  })
})
