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

    // Del más claro al más oscuro, con los tonos que se pintaron.
    expect(candidate.patches.map((patch) => patch.tone.r)).toEqual(
      CARD.map((reflectance) => toneCode(reflectance)),
    )
    for (const patch of candidate.patches) {
      expect(patch.tone.r).toBe(patch.tone.g)
      expect(patch.tone.g).toBe(patch.tone.b)
      expect(patch.pixels).toBe(PATCH.width * PATCH.height)
    }

    // Posición y tamaño en fracciones del ráster analizado.
    expect(candidate.patches[0]!.box.x).toBeCloseTo(boxes[0]!.x / WIDTH, 6)
    expect(candidate.patches[0]!.box.y).toBeCloseTo(boxes[0]!.y / HEIGHT, 6)
    expect(candidate.patches[0]!.box.width).toBeCloseTo(PATCH.width / WIDTH, 6)
    expect(candidate.patches[0]!.box.height).toBeCloseTo(PATCH.height / HEIGHT, 6)
    expect(candidate.box.x).toBeCloseTo(STRIP.x / WIDTH, 6)
    expect(candidate.box.width).toBeCloseTo((3 * PATCH.width) / WIDTH, 6)

    // La escalera se reconoce por su estructura relativa, y eso es lo que se mide.
    expect(candidate.measure.toneRatio).toBeGreaterThan(10)
    expect(candidate.measure.sizeRatio).toBeCloseTo(1, 6)
    expect(candidate.measure.support).toBe(1)
    expect(candidate.measure.specularShare).toBe(0)
    expect(candidate.measure.clippedShare).toBe(0)

    // La declaración de la usuaria es lo único que distingue carta de papel.
    expect(candidate.reference).toBe('TARGET_CARD')
    expect(candidate.trustsGray).toBe(true)
    expect(grayTargetNotice(analysis)).toBeNull()
    expect(detectGrayTarget(photo, CARD_OPTIONS)).toEqual(analysis.candidates)
  })

  it('RF-418: la dominante de la bombilla no impide detectar la escalera, y su gris propone enfriarla', () => {
    const photo = canvas()
    // Una bombilla cálida: mucho rojo, algo menos de verde, bastante menos de azul.
    targetOn(photo, { gains: [1, 0.93, 0.82] })

    const candidate = detectGrayTarget(photo, CARD_OPTIONS)[0]
    expect(candidate).toBeDefined()
    expect(candidate!.patches).toHaveLength(3)
    // Los parches ya no son neutros en los códigos: lo que los delata es que los
    // tres comparten cromaticidad, porque una luz multiplica a todos por igual.
    expect(candidate!.patches[0]!.tone.r).toBeGreaterThan(candidate!.patches[0]!.tone.b)
    expect(candidate!.measure.chromaSpread).toBeLessThan(0.02)
    expect(candidate!.measure.castSpread).toBeGreaterThan(0.05)

    // Y el gris de una carta sí se cree: propone corregir hacia el azul.
    expect(candidate!.neutral).not.toBeNull()
    expect(candidate!.neutral!.temperature).toBeLessThan(0)
  })

  it('RF-418: el testigo en sombra se sigue detectando, porque la relación de tonos no depende de la exposición', () => {
    const photo = canvas()
    // La obra iluminada y el testigo a la sombra: un tercio de la luz.
    targetOn(photo, { gains: [0.35, 0.35, 0.35] })

    const analysis = analyseGrayTarget(photo, CARD_OPTIONS)
    expect(analysis.declined).toBeNull()
    expect(analysis.candidates).toHaveLength(1)
    const candidate = analysis.candidates[0]!
    expect(candidate.patches).toHaveLength(3)
    // Los códigos han bajado mucho y la razón de tonos en luz lineal no se ha movido.
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

    // Y una pared iluminada desde un lado tampoco: un degradado no tiene escalones.
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
    // Tres estantes en tres grises claros de la misma pared. Los escalones son de 27
    // y 28 códigos, holgadamente por encima de MIN_STEP, uniformes, alineados, del
    // mismo tamaño y acromáticos: pasan TODAS las demás reglas. Lo único que los
    // separa de un testigo es que del más claro al más oscuro solo hay una razón de
    // 2,1 en luz lineal, y una carta va de blanco a negro. Este es el caso que hace
    // que MIN_TONE_RATIO tenga dientes: sin él podría valer 1 y todo seguiría verde.
    targetOn(photo, { patches: [[140, 140, 140], [167, 167, 167], [195, 195, 195]] })

    const analysis = analyseGrayTarget(photo, CARD_OPTIONS)
    expect(analysis.candidates).toEqual([])
    expect(analysis.declined).toBe('no-staircase')
  })

  it('RF-418: una secuencia de parches desiguales no es un testigo, porque una escala se dibuja con celdas iguales', () => {
    const photo = canvas()
    // «Pared ancha, sombra estrecha, suelo ancho»: los tonos escalonan de blanco a
    // negro y la cromaticidad concuerda, pero 26 y 6 píxeles no son la misma celda.
    // Es la regla que la hoja imprimible del §4 tiene que respetar al dibujarse.
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
    // Crema, gris azulado y casi negro: escalonan de blanco a negro y ninguno lleva
    // color suficiente para que lo tumbe MAX_CAST_SPREAD —el suyo se queda en 0,16 de
    // los 0,35 que se toleran—, así que quien los rechaza es el acuerdo y no el techo.
    // Lo que los delata: una luz multiplica los tres parches por los mismos tres
    // números, luego una cromaticidad distinta en cada parche no la ha puesto la luz.
    targetOn(photo, { patches: [[240, 232, 216], [116, 128, 138], [46, 44, 42]] })

    const analysis = analyseGrayTarget(photo, CARD_OPTIONS)
    expect(analysis.candidates).toEqual([])
    expect(analysis.declined).toBe('not-neutral')
  })

  it('RF-418: un testigo demasiado pequeño en el encuadre se descarta, y el mismo testigo mayor se detecta', () => {
    // La regla es relativa al ráster, y el par de casos es lo que lo demuestra: los
    // dos van sobre la MISMA imagen de 400x300, y lo único que cambia es el tamaño
    // del testigo. Cinco píxeles de parche están por debajo de MIN_PATCH_SIDE y su
    // mediana no significa nada; pedir otra fotografía es la respuesta honesta.
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
    // Un brillo sobre el parche medio, ni quemado ni en todas las filas: es
    // exactamente lo que hace un reflejo de ventana sobre una carta.
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
    // La mitad inferior del parche medio, en sombra. El pliegue corre a lo LARGO de
    // las líneas de barrido, así que cada línea sigue viendo tres parches de la misma
    // anchura y con sus escalones: la escalera no se rompe. Lo que se rompe es que el
    // parche sea una superficie plana, y eso solo se ve en la segunda dimensión —que
    // es exactamente por lo que la uniformidad se mide sobre la caja y no sobre una
    // línea. Sin este caso, la regla podría estar en 0,1 y nada lo diría.
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
        // El rojo ha recortado: ya no se sabe cuánto se pasó, así que su
        // cromaticidad es un número que parece medido y no lo es.
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
    // Tres bandas de la misma pintura roja: comparten cromaticidad perfectamente
    // y sin embargo tienen color, que es lo que un testigo no tiene.
    targetOn(photo, { gains: [1, 0.25, 0.2] })

    const analysis = analyseGrayTarget(photo, CARD_OPTIONS)
    expect(analysis.candidates).toEqual([])
    expect(analysis.declined).toBe('not-neutral')
  })

  it('RF-418: la escalera se busca fuera de la obra, porque el testigo se pone al lado', () => {
    const photo = canvas()
    targetOn(photo)
    // Sin decir dónde está la obra, la escalera se encuentra.
    expect(detectGrayTarget(photo, CARD_OPTIONS)).toHaveLength(1)

    // Declarada la obra encima del testigo, deja de ser un candidato.
    const rect = { x: 0.1, y: 0.3, width: 0.68, height: 0.4 }
    const inside = analyseGrayTarget(photo, {
      kind: 'CARD',
      artwork: { corners: cornersOfRect(rect) },
    })
    expect(inside.candidates).toEqual([])
    expect(inside.declined).toBe('no-staircase')

    // Y el cuadrilátero llega en fracciones de la imagen YA GIRADA, como se guarda.
    const turned = analyseGrayTarget(photo, {
      kind: 'CARD',
      artwork: { rotation: 90, corners: rotateCorners(cornersOfRect(rect), 90) },
    })
    expect(turned.candidates).toEqual([])

    // Con un recorte en vez de esquinas, lo mismo.
    const cropped = analyseGrayTarget(photo, { kind: 'CARD', artwork: { crop: rect } })
    expect(cropped.candidates).toEqual([])
  })

  it('RF-418, §4: la hoja impresa se detecta igual, pero su gris no se cree', () => {
    const photo = canvas()
    targetOn(photo, { gains: [1, 0.93, 0.82] })

    const card = detectGrayTarget(photo, { kind: 'CARD' })[0]!
    const print = detectGrayTarget(photo, { kind: 'PRINT' })[0]!

    // La imagen es la misma: la distinción no está en los píxeles.
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
    // Ordenados por confianza, y sin repetir el mismo sitio dos veces.
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
    // La frontera entre dos parches nunca es de un píxel en una fotografía: entre
    // ellos hay una costura con el tono mezclado, y dejarla dentro la haría pasar
    // por un parche más.
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
    // La costura queda fuera de los parches medidos, no dentro.
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
    // Ordenados del más claro al más oscuro, siempre.
    const codes = candidate!.patches.map((patch) => patch.luminance)
    expect(codes).toEqual([...codes].sort((a, b) => b - a))
    expect(candidate!.reference).toBe('TARGET_PRINT')
  })

  it('RF-418: una escalera que sube justo detrás de un objeto claro no se pierde en el valle', () => {
    const photo = canvas()
    // Un objeto claro, y pegada a él la escalera al revés: el parche oscuro es a la
    // vez el final de un escalón hacia abajo y el principio de la escalera buena.
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
    // La escalera empieza en el parche oscuro, no en el objeto claro de la izquierda.
    expect(candidate.box.x).toBeCloseTo((8 + PATCH.width) / WIDTH, 6)
  })

  it('RF-418: tres franjas de luz en la pared no son un testigo, porque ocupan el encuadre', () => {
    const photo = canvas()
    // Uniformes, contiguas, alineadas, del mismo tamaño, acromáticas y en escalón:
    // cumplen todo menos ser un objeto pequeño al lado de la obra.
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
