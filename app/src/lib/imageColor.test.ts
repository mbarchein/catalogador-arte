import { describe, expect, it } from 'vitest'
import * as imageColor from './imageColor'
import {
  COLOR_RANGES,
  GRAY_LABEL,
  LIGHT_PRESETS,
  NO_COLOR,
  applyColorLuts,
  applyColorToRgb,
  autoColorFrom,
  buildColorLuts,
  clampColorParam,
  colorFromColumns,
  colorFromLightPreset,
  colorSummary,
  colorSvgTables,
  colorToColumns,
  gainsFromNeutral,
  grayFromRgb,
  isNoColor,
  lightPresetLabel,
  linearToSrgb,
  neutralFromSample,
  normalizeColor,
  patchMedian,
  referenceTrustsGray,
  sameColor,
  srgbToLinear,
  withNeutralPick,
  type ColorEdit,
  type ColorLuts,
} from './imageColor'

/** The three tables, so a check can be written once and run on all of them. */
function channels(luts: ColorLuts): Uint8Array[] {
  return [luts.r, luts.g, luts.b]
}

/** A frame of identical pixels, interleaved RGBA as `ImageData` gives them. */
function field(color: { r: number; g: number; b: number }, count: number): Uint8ClampedArray {
  const data = new Uint8ClampedArray(count * 4)
  for (let i = 0; i < count; i += 1) {
    data[i * 4] = color.r
    data[i * 4 + 1] = color.g
    data[i * 4 + 2] = color.b
    data[i * 4 + 3] = 255
  }
  return data
}

/** A frame built from a list of «this many pixels of this grey». */
function greys(runs: { code: number; count: number }[]): Uint8ClampedArray {
  const total = runs.reduce((sum, run) => sum + run.count, 0)
  const data = new Uint8ClampedArray(total * 4)
  let pixel = 0
  for (const run of runs) {
    for (let i = 0; i < run.count; i += 1, pixel += 1) {
      data[pixel * 4] = run.code
      data[pixel * 4 + 1] = run.code
      data[pixel * 4 + 2] = run.code
      data[pixel * 4 + 3] = 255
    }
  }
  return data
}

/** A spread of adjustments to run the invariants over. */
const SAMPLE_EDITS: Partial<ColorEdit>[] = [
  {},
  { temperature: 60 },
  { temperature: -60 },
  { tint: 40 },
  { tint: -40 },
  { exposure: 2 },
  { exposure: -2 },
  { blackPoint: 64 },
  { whitePoint: 192 },
  { gamma: 0.6 },
  { gamma: 1.6 },
  { shoulder: 100 },
  { shoulder: 50 },
  { temperature: -45, tint: 12, exposure: 0.83, blackPoint: 18, whitePoint: 240, gamma: 0.75, shoulder: 35 },
  { temperature: 33, tint: -20, exposure: -1.17, blackPoint: 5, whitePoint: 250, gamma: 1.45, shoulder: 5 },
]

describe('buildColorLuts, la cadena canónica (RF-414)', () => {
  it('el ajuste neutro es la identidad exacta en los 256 códigos y los tres canales', () => {
    // Lo que garantiza que abrir el editor, mirar y aplicar no reescriba los
    // ficheros: si la identidad no fuera exacta, `sameColor` diría que la
    // fotografía ha cambiado y se generarían rutas nuevas en el bucket.
    const luts = buildColorLuts(NO_COLOR)
    for (const lut of channels(luts)) {
      expect(lut).toHaveLength(256)
      for (let i = 0; i < 256; i += 1) expect(lut[i]).toBe(i)
    }
    expect(luts.gray).toBe(false)
  })

  it('no hay ajuste que la haga decrecer, y ninguna entrada sale del rango', () => {
    for (const edit of SAMPLE_EDITS) {
      const luts = buildColorLuts(edit)
      for (const lut of channels(luts)) {
        for (let i = 1; i < 256; i += 1) {
          expect(lut[i]!).toBeGreaterThanOrEqual(lut[i - 1]!)
        }
        for (let i = 0; i < 256; i += 1) {
          expect(Number.isInteger(lut[i])).toBe(true)
          expect(lut[i]!).toBeGreaterThanOrEqual(0)
          expect(lut[i]!).toBeLessThanOrEqual(255)
        }
      }
    }
  })

  it('el punto negro va a 0 y el punto blanco a 255', () => {
    for (const [blackPoint, whitePoint] of [
      [0, 255],
      [12, 244],
      [64, 192],
    ] as const) {
      const luts = buildColorLuts({ blackPoint, whitePoint })
      for (const lut of channels(luts)) {
        expect(lut[blackPoint]).toBe(0)
        expect(lut[whitePoint]).toBe(255)
        for (let i = 0; i < blackPoint; i += 1) expect(lut[i]).toBe(0)
        for (let i = whitePoint; i < 256; i += 1) expect(lut[i]).toBe(255)
      }
    }
  })

  it('el punto negro con medios tonos por debajo de 1 no produce NaN ni un canal en blanco', () => {
    // El `max(0, …)` del paso 7. Sin él, los códigos por debajo del punto negro son
    // negativos, `pow(negativo, 1/0,6)` es NaN, y un NaN guardado en un Uint8Array
    // es un 0: la tabla saldría con el canal entero a cero y la fotografía con un
    // canal en blanco, que se descubre en el bucket y no en el editor.
    const luts = buildColorLuts({ blackPoint: 40, gamma: 0.6 })
    for (const lut of channels(luts)) {
      expect(lut[255]).toBe(255)
      expect(lut[40]).toBe(0)
      // Y la tabla sube de verdad: no es el canal a cero que produciría el NaN.
      // Con medios tonos por debajo de 1 el exponente es mayor que 1 y oscurece,
      // así que el valor esperado está por debajo de la entrada, pero muy lejos de
      // cero: (200−40)/(255−40) elevado a 1/0,6.
      expect(lut[200]).toBe(Math.round((160 / 215) ** (1 / 0.6) * 255))
      expect(lut[200]!).toBeGreaterThan(100)
      expect(lut.reduce((sum, value) => sum + value, 0)).toBeGreaterThan(0)
    }
  })

  it('el balance de blancos nunca lleva un canal a 255 si no lo estaba', () => {
    // The gains are normalised to max(gain) = 1, so correcting the
    // cast can only darken and never clips highlights on its own.
    for (const temperature of [-60, -37, -1, 0, 1, 25, 60]) {
      for (const tint of [-40, -9, 0, 14, 40]) {
        const gains = gainsFromNeutral({ temperature, tint })
        expect(Math.max(gains.r, gains.g, gains.b)).toBeCloseTo(1, 12)
        const luts = buildColorLuts({ temperature, tint })
        for (const lut of channels(luts)) {
          for (let i = 0; i < 256; i += 1) {
            expect(lut[i]!).toBeLessThanOrEqual(i)
            if (lut[i] === 255) expect(i).toBe(255)
          }
        }
      }
    }
  })

  it('medios tonos a 1 y exposición a 0 son la identidad', () => {
    const luts = buildColorLuts({ gamma: 1, exposure: 0, shoulder: 0 })
    for (const lut of channels(luts)) {
      for (let i = 0; i < 256; i += 1) expect(lut[i]).toBe(i)
    }
  })

  it('+1 EV duplica la luz lineal en el centro, dentro del error de cuantización', () => {
    const luts = buildColorLuts({ exposure: 1 })
    const doubled = 2 * srgbToLinear(128 / 255)
    const expected = Math.round(linearToSrgb(doubled) * 255)
    for (const lut of channels(luts)) {
      expect(Math.abs(lut[128]! - expected)).toBeLessThanOrEqual(1)
    }
    // And −1 EV returns it to the centre: exposure is a multiplication of light.
    const back = buildColorLuts({ exposure: -1 })
    for (const lut of channels(back)) {
      expect(Math.abs(lut[128]! - Math.round(linearToSrgb(srgbToLinear(128 / 255) / 2) * 255)))
        .toBeLessThanOrEqual(1)
    }
  })

  it('las altas luces suaves comprimen sin escalones y sin llegar a blanco', () => {
    const luts = buildColorLuts({ shoulder: 100 })
    for (const lut of channels(luts)) {
      // Below the knee it touches nothing.
      expect(lut[64]).toBe(64)
      // And above it compresses: white comes down, which is the intended consequence.
      expect(lut[255]!).toBeLessThan(255)
      expect(lut[255]!).toBeGreaterThan(230)
    }
    // With the parameter at 0 there is no compression at all.
    const off = buildColorLuts({ shoulder: 0 })
    for (const lut of channels(off)) expect(lut[255]).toBe(255)
  })

  it('NaN, Infinity y los valores fuera de rango dan la identidad', () => {
    const garbage = buildColorLuts({
      temperature: Number.NaN,
      tint: Number.POSITIVE_INFINITY,
      exposure: Number.NaN,
      blackPoint: -5,
      whitePoint: 999,
      gamma: 0,
      shoulder: Number.NEGATIVE_INFINITY,
    } as unknown as Partial<ColorEdit>)
    for (const lut of channels(garbage)) {
      for (let i = 0; i < 256; i += 1) expect(lut[i]).toBe(i)
    }
    // And what a gesture does produce —going past the cap— is clamped, not discarded.
    expect(clampColorParam('temperature', 90)).toBe(60)
    expect(clampColorParam('gamma', 0.2)).toBe(0.6)
    expect(clampColorParam('exposure', Number.NaN)).toBe(0)
  })
})

describe('el paso de blanco y negro (RF-414)', () => {
  it('es luminancia Rec. 709 en luz lineal, después de la tabla', () => {
    const luts = buildColorLuts({ gray: true })
    expect(luts.gray).toBe(true)
    const applied = applyColorToRgb(luts, 200, 100, 50)
    expect(applied.r).toBe(applied.g)
    expect(applied.g).toBe(applied.b)
    const expected = Math.round(
      linearToSrgb(
        0.2126 * srgbToLinear(200 / 255) + 0.7152 * srgbToLinear(100 / 255) + 0.0722 * srgbToLinear(50 / 255),
      ) * 255,
    )
    expect(applied.r).toBe(expected)
    // And it is not the mean of the codes, which is the mistake that crushes the greens.
    expect(applied.r).not.toBe(Math.round((200 + 100 + 50) / 3))
  })

  it('un gris se queda igual, y el búfer RGBA conserva su alfa', () => {
    expect(grayFromRgb(128, 128, 128)).toBe(128)
    const data = new Uint8ClampedArray([200, 100, 50, 128, 10, 10, 10, 255])
    applyColorLuts(buildColorLuts({ gray: true }), data)
    expect(data[0]).toBe(data[1])
    expect(data[1]).toBe(data[2])
    expect(data[3]).toBe(128)
    expect(data[7]).toBe(255)
  })

  it('sin blanco y negro, aplicar la tabla es aplicar la tabla', () => {
    const luts = buildColorLuts({ exposure: 0.5 })
    const data = new Uint8ClampedArray([10, 128, 250, 255])
    applyColorLuts(luts, data)
    expect(data[0]).toBe(luts.r[10])
    expect(data[1]).toBe(luts.g[128])
    expect(data[2]).toBe(luts.b[250])
  })
})

describe('colorSvgTables, la previsualización (RF-414)', () => {
  it('fija color-interpolation-filters="sRGB" por igualdad literal', () => {
    // Su olvido es el fallo silencioso número uno: el filtro interpola en linearRGB
    // por omisión, nada lanza, y la previsualización deja de coincidir con el
    // fichero que se escribe.
    expect(colorSvgTables(NO_COLOR).colorInterpolationFilters).toBe('sRGB')
    expect(colorSvgTables({ exposure: 1, gray: true }).colorInterpolationFilters).toBe('sRGB')
  })

  it('emite las 256 entradas, no un submuestreo', () => {
    const tables = colorSvgTables({ gamma: 0.6, blackPoint: 8 })
    for (const values of [tables.r, tables.g, tables.b]) {
      expect(values.split(' ')).toHaveLength(256)
    }
  })

  it('las entradas son la misma tabla que se aplica, en fracciones de 1', () => {
    const edit = { temperature: -20, exposure: 0.33, blackPoint: 6, gamma: 0.85 }
    const luts = buildColorLuts(edit)
    const tables = colorSvgTables(edit)
    const pairs: [string, Uint8Array][] = [
      [tables.r, luts.r],
      [tables.g, luts.g],
      [tables.b, luts.b],
    ]
    for (const [values, lut] of pairs) {
      const parsed = values.split(' ').map(Number)
      for (let i = 0; i < 256; i += 1) {
        expect(Math.round(parsed[i]! * 255)).toBe(lut[i])
      }
    }
    // And the identity is written as such, starting at 0 and ending at 1.
    const identity = colorSvgTables(NO_COLOR).r.split(' ')
    expect(identity[0]).toBe('0')
    expect(identity[1]).toBe('0.00392')
    expect(identity[255]).toBe('1')
  })

  it('el blanco y negro viaja como su propia matriz, y en linearRGB', () => {
    expect(colorSvgTables(NO_COLOR).grayMatrix).toBeNull()
    const gray = colorSvgTables({ gray: true }).grayMatrix
    expect(gray).not.toBeNull()
    // linearRGB en esta primitiva y solo en esta: es lo que hace que el navegador
    // linealice, aplique la matriz y vuelva a codificar, que es exactamente la
    // luminancia Rec. 709 en luz lineal que aplica la exportación.
    expect(gray?.colorInterpolationFilters).toBe('linearRGB')
    expect(gray?.values).toBe(
      '0.2126 0.7152 0.0722 0 0 0.2126 0.7152 0.0722 0 0 0.2126 0.7152 0.0722 0 0 0 0 0 1 0',
    )
  })
})

describe('el conjunto de operaciones es cerrado (RF-415)', () => {
  it('no exporta saturación, vibrancia, contraste, sombras, altas luces por rango, nitidez ni velo', () => {
    // Requisito negativo, y por eso tiene test: falsearían el documento de
    // catalogación. Un barniz amarilleado y un color apagado son el estado de la
    // obra, que es justo lo que la fotografía tiene que testificar.
    const forbidden = /satur|vibran|contrast|shadow|highlight|sharp|dehaze|deshaze|sepia|hue|glare|reflex/i
    for (const name of Object.keys(imageColor)) {
      expect(name).not.toMatch(forbidden)
    }
    for (const key of Object.keys(NO_COLOR)) {
      expect(key).not.toMatch(forbidden)
    }
    for (const key of Object.keys(COLOR_RANGES)) {
      expect(key).not.toMatch(forbidden)
    }
    for (const key of Object.keys(colorToColumns(NO_COLOR))) {
      expect(key).not.toMatch(forbidden)
    }
  })

  it('y la previsualización no cuela ninguna por el filtro', () => {
    const tables = colorSvgTables({ temperature: 20, gray: true })
    const emitted = [tables.r, tables.g, tables.b, tables.grayMatrix?.values ?? ''].join(' ')
    expect(emitted).not.toMatch(/saturate|hueRotate|matrix\(/)
  })
})

describe('neutralFromSample, el cuentagotas (RF-414, RF-418)', () => {
  it('la tabla construida desde una muestra teñida deja un gris de verdad', () => {
    const sample = { r: 150, g: 128, b: 100 }
    const picked = withNeutralPick(NO_COLOR, sample, { x: 0.25, y: 0.75 })
    expect(picked).not.toBeNull()
    const luts = buildColorLuts(picked)
    const corrected = applyColorToRgb(luts, sample.r, sample.g, sample.b)
    expect(Math.abs(corrected.r - corrected.g)).toBeLessThan(2)
    expect(Math.abs(corrected.g - corrected.b)).toBeLessThan(2)
    // And where the grey came from is recorded (RF-418).
    expect(picked?.source).toBe('NEUTRAL_PICKED')
    expect(picked?.reference).toBe('SCENE')
    expect(picked?.neutral).toEqual({ x: 0.25, y: 0.75 })
  })

  it('corrige en el sentido que toca y las dos dominantes', () => {
    // A warm sample cools down: negative temperature.
    expect(neutralFromSample({ r: 150, g: 128, b: 100 })!.temperature).toBeLessThan(0)
    // A cool sample warms up.
    expect(neutralFromSample({ r: 100, g: 128, b: 150 })!.temperature).toBeGreaterThan(0)
    // A greenish sample moves towards magenta, which is the positive tint.
    expect(neutralFromSample({ r: 120, g: 140, b: 120 })!.tint).toBeGreaterThan(0)
    expect(neutralFromSample({ r: 140, g: 120, b: 140 })!.tint).toBeLessThan(0)
    // A grey moves nothing.
    expect(neutralFromSample({ r: 128, g: 128, b: 128 })).toEqual({ temperature: 0, tint: 0 })
  })

  it('rechaza la muestra con un canal a 250 o más, o a 5 o menos', () => {
    // Un canal recortado ha perdido cuánto se pasó del tope y uno enterrado en el
    // ruido ha perdido su proporción: los dos devuelven un número con pinta de
    // medido que no lo es, y una sugerencia equivocada es peor que ninguna.
    expect(neutralFromSample({ r: 250, g: 128, b: 100 })).toBeNull()
    expect(neutralFromSample({ r: 128, g: 251, b: 100 })).toBeNull()
    expect(neutralFromSample({ r: 128, g: 100, b: 5 })).toBeNull()
    expect(neutralFromSample({ r: 128, g: 3, b: 100 })).toBeNull()
    expect(neutralFromSample({ r: 249, g: 200, b: 200 })).not.toBeNull()
    expect(neutralFromSample(null)).toBeNull()
    expect(neutralFromSample({ r: Number.NaN, g: 128, b: 128 })).toBeNull()
    // And the editor finds out: the action changes nothing and it can say so.
    expect(withNeutralPick(NO_COLOR, { r: 255, g: 255, b: 255 }, { x: 0.5, y: 0.5 })).toBeNull()
  })

  it('el parche se resume por la mediana y no por la media', () => {
    // Eighty pixels of grey and one specular: the mean would go off with the specular one,
    // the median does not move.
    const patch = new Uint8ClampedArray(81 * 4)
    for (let i = 0; i < 81; i += 1) {
      patch[i * 4] = 128
      patch[i * 4 + 1] = 128
      patch[i * 4 + 2] = 128
      patch[i * 4 + 3] = 255
    }
    patch[0] = 255
    patch[1] = 255
    patch[2] = 255
    expect(patchMedian(patch)).toEqual({ r: 128, g: 128, b: 128 })
    expect(patchMedian(new Uint8ClampedArray(0))).toBeNull()
  })

  it('el gris de una hoja impresa en casa no se cree como dominante (RF-418)', () => {
    expect(referenceTrustsGray('TARGET_CARD')).toBe(true)
    expect(referenceTrustsGray('SCENE')).toBe(true)
    // Domestic ink is not neutral: it serves for the pattern and for the black
    // and white points, not as a cast reference.
    expect(referenceTrustsGray('TARGET_PRINT')).toBe(false)
    expect(referenceTrustsGray('NONE')).toBe(false)
    expect(referenceTrustsGray(null)).toBe(false)
    const picked = withNeutralPick(NO_COLOR, { r: 140, g: 130, b: 120 }, null, 'TARGET_PRINT')
    expect(picked?.reference).toBe('TARGET_PRINT')
  })
})

describe('autoColorFrom, el ajuste automático (RF-414)', () => {
  it('respeta los cuatro topes', () => {
    // A uniform, light photograph: the 0.1 percentile is well above 64 and
    // the 99.9 well below 192, so both caps have to bite.
    const flat = autoColorFrom(greys([{ code: 100, count: 400 }]))
    expect(flat.color.blackPoint).toBe(COLOR_RANGES.blackPoint.max)
    expect(flat.color.whitePoint).toBe(COLOR_RANGES.whitePoint.min)
    // And a very dark one: the exposure stops at 1 EV, half the manual range.
    const dark = autoColorFrom(greys([{ code: 10, count: 400 }]))
    expect(dark.color.exposure).toBe(1)
    expect(dark.color.exposure).toBeLessThanOrEqual(1)
    for (const proposal of [flat, dark]) {
      expect(proposal.color.blackPoint).toBeLessThanOrEqual(COLOR_RANGES.blackPoint.max)
      expect(proposal.color.whitePoint).toBeGreaterThanOrEqual(COLOR_RANGES.whitePoint.min)
      expect(Math.abs(proposal.color.exposure)).toBeLessThanOrEqual(1)
    }
  })

  it('no propone nada ante un histograma ya centrado, y lo dice', () => {
    // It reaches black and white and its median is already at the encoded middle grey.
    const centered = autoColorFrom(
      greys([
        { code: 0, count: 5 },
        { code: 115, count: 990 },
        { code: 255, count: 5 },
      ]),
    )
    expect(centered.movedLevels).toBe(false)
    expect(centered.movedExposure).toBe(false)
    expect(centered.movedWhiteBalance).toBe(false)
    expect(centered.color.blackPoint).toBe(0)
    expect(centered.color.whitePoint).toBe(255)
    expect(isNoColor(centered.color)).toBe(true)
    // Never a gap: if the automatic does nothing, the help says why.
    expect(centered.notice).toMatch(/negro y al blanco/)
  })

  it('calla en el balance de blancos cuando no hay grises creíbles', () => {
    // A whole frame of colour, without one achromatic pixel: the automatic does not touch
    // the cast and says so in the help.
    const colored = autoColorFrom(field({ r: 150, g: 100, b: 100 }, 400))
    expect(colored.movedWhiteBalance).toBe(false)
    expect(colored.color.temperature).toBe(0)
    expect(colored.color.tint).toBe(0)
    expect(colored.color.reference).toBe('NONE')
    expect(colored.notice).toMatch(/gris fiable/)
    expect(colored.detail.achromaticFraction).toBe(0)
  })

  it('propone el balance de blancos cuando hay grises teñidos, y con su procedencia', () => {
    const warm = autoColorFrom(field({ r: 131, g: 128, b: 125 }, 400))
    expect(warm.movedWhiteBalance).toBe(true)
    expect(warm.color.temperature).toBeLessThan(0)
    expect(warm.color.source).toBe('AUTO')
    expect(warm.color.reference).toBe('SCENE')
    expect(warm.notice).toBeNull()
    // And it corrects for real: the tinted grey comes out grey.
    const corrected = applyColorToRgb(buildColorLuts(warm.color), 131, 128, 125)
    expect(Math.abs(corrected.r - corrected.g)).toBeLessThan(2)
    expect(Math.abs(corrected.g - corrected.b)).toBeLessThan(2)
  })

  it('un encuadre sin píxeles medibles no propone nada y no lanza', () => {
    const empty = autoColorFrom(new Uint8ClampedArray(0))
    expect(isNoColor(empty.color)).toBe(true)
    expect(empty.notice).not.toBeNull()
    expect(empty.detail.pixels).toBe(0)
    // And a transparent buffer does not vote with its invisible black either.
    const transparent = new Uint8ClampedArray(16)
    expect(autoColorFrom(transparent).detail.pixels).toBe(0)
  })

  it('mide el encuadre que se le da y no una foto entera', () => {
    // Two frames of the same size and different light give different proposals: it is the
    // guarantee that the wall around the artwork does not set the black point.
    const dark = autoColorFrom(greys([{ code: 40, count: 400 }]))
    const light = autoColorFrom(greys([{ code: 200, count: 400 }]))
    expect(dark.color.exposure).toBeGreaterThan(light.color.exposure)
  })
})

describe('los presets de tipo de luz (RF-414)', () => {
  it('son los ocho del acuerdo, con su etiqueta en español y dentro de rango', () => {
    expect(LIGHT_PRESETS.map((preset) => preset.value)).toEqual([
      'DAYLIGHT',
      'OVERCAST',
      'FLUORESCENT_COOL',
      'FLUORESCENT_WARM',
      'LED_NEUTRAL',
      'INCANDESCENT',
      'MIXED_WINDOW_CEILING',
      'FLASH',
    ])
    expect(LIGHT_PRESETS.map((preset) => preset.label)).toEqual([
      'Luz de ventana',
      'Día nublado',
      'Fluorescente blanco frío',
      'Fluorescente cálido',
      'LED neutro',
      'Bombilla incandescente',
      'Mezcla de ventana y techo',
      'Flash del móvil',
    ])
    for (const preset of LIGHT_PRESETS) {
      expect(preset.temperature).toBeGreaterThanOrEqual(COLOR_RANGES.temperature.min)
      expect(preset.temperature).toBeLessThanOrEqual(COLOR_RANGES.temperature.max)
      expect(preset.tint).toBeGreaterThanOrEqual(COLOR_RANGES.tint.min)
      expect(preset.tint).toBeLessThanOrEqual(COLOR_RANGES.tint.max)
    }
    expect(lightPresetLabel('INCANDESCENT')).toBe('Bombilla incandescente')
    expect(lightPresetLabel(null)).toBeNull()
  })

  it('son punto de partida: mueven el balance de blancos y nada más', () => {
    const base = normalizeColor({ exposure: 0.5, blackPoint: 10, gamma: 0.9, gray: true })
    const bulb = colorFromLightPreset(base, 'INCANDESCENT')
    // The light says nothing about the exposure or the range, and does not touch them.
    expect(bulb.exposure).toBe(0.5)
    expect(bulb.blackPoint).toBe(10)
    expect(bulb.gamma).toBe(0.9)
    expect(bulb.gray).toBe(true)
    // The bulb is the warmest thing on the list, so the correction cools.
    expect(bulb.temperature).toBeLessThan(0)
    expect(bulb.source).toBe('PRESET')
    expect(bulb.light).toBe('INCANDESCENT')
    // And it is not a measurement: no grey reference is noted down.
    expect(bulb.reference).toBe('NONE')
    expect(bulb.neutral).toBeNull()
  })

  it('la luz de ventana es la referencia: no cambia ningún píxel y aun así queda anotada', () => {
    const daylight = colorFromLightPreset(NO_COLOR, 'DAYLIGHT')
    expect(isNoColor(daylight)).toBe(true)
    expect(daylight.light).toBe('DAYLIGHT')
    for (const lut of channels(buildColorLuts(daylight))) {
      for (let i = 0; i < 256; i += 1) expect(lut[i]).toBe(i)
    }
  })
})

describe('normalizeColor, isNoColor y sameColor (RF-414)', () => {
  it('la forma canónica redondea a lo que la columna puede guardar', () => {
    // La tira mueve la exposición de sexto en sexto de EV y la columna es
    // numeric(3,2): si la forma canónica no redondeara, el valor de la fila y el de
    // la pantalla dejarían de coincidir y «Aplicar» regeneraría ficheros iguales.
    expect(normalizeColor({ exposure: 1 / 6 }).exposure).toBe(0.17)
    expect(normalizeColor({ exposure: -5 / 6 }).exposure).toBe(-0.83)
    expect(normalizeColor({ gamma: 0.8500000001 }).gamma).toBe(0.85)
    expect(normalizeColor({ temperature: 12.4 }).temperature).toBe(12)
    expect(normalizeColor(null)).toEqual(NO_COLOR)
    expect(normalizeColor(undefined)).toEqual(NO_COLOR)
  })

  it('el punto del cuentagotas viaja completo o no viaja', () => {
    expect(normalizeColor({ neutral: { x: 0.123456, y: 0.5 } }).neutral).toEqual({
      x: 0.12346,
      y: 0.5,
    })
    expect(normalizeColor({ neutral: { x: 0.5, y: Number.NaN } }).neutral).toBeNull()
    // Outside the image it is discarded instead of stuck to the edge: it would point at a
    // pixel nobody sampled.
    expect(normalizeColor({ neutral: { x: 1.4, y: 0.5 } }).neutral).toBeNull()
  })

  it('isNoColor mira los píxeles y no la procedencia', () => {
    expect(isNoColor(NO_COLOR)).toBe(true)
    expect(isNoColor(null)).toBe(true)
    // «Se miró con la obra delante y se dejó como estaba» no cambia ningún píxel.
    expect(isNoColor({ source: 'REVIEWED_UNCHANGED', inherited: true })).toBe(true)
    expect(isNoColor({ exposure: 1 / 6 })).toBe(false)
    expect(isNoColor({ gray: true })).toBe(false)
    expect(isNoColor({ whitePoint: 254 })).toBe(false)
  })

  it('sameColor distingue dos ajustes que solo difieren en un parámetro', () => {
    expect(sameColor(NO_COLOR, {})).toBe(true)
    expect(sameColor({ temperature: 10 }, { temperature: 10, source: 'AUTO' })).toBe(true)
    expect(sameColor({ temperature: 10 }, { temperature: 11 })).toBe(false)
    expect(sameColor({ exposure: 0.17 }, { exposure: 1 / 6 })).toBe(true)
    expect(sameColor({ gray: true }, { gray: false })).toBe(false)
    expect(sameColor({ shoulder: 5 }, {})).toBe(false)
  })

  it('colorSummary cuenta lo que se hizo, en español, y nada cuando no se hizo nada', () => {
    expect(colorSummary(NO_COLOR)).toBeNull()
    expect(colorSummary({ source: 'AUTO' })).toBeNull()
    expect(colorSummary({ temperature: 12 })).toBe('Temperatura +12')
    expect(colorSummary({ tint: -6 })).toBe('Matiz -6')
    expect(colorSummary({ exposure: 1 / 3 })).toBe('Exposición +0,33 EV')
    expect(colorSummary({ exposure: -1 / 3 })).toBe('Exposición -0,33 EV')
    expect(colorSummary({ gamma: 0.85 })).toBe('Medios tonos 0,85')
    expect(colorSummary({ gray: true })).toBe(GRAY_LABEL)
    expect(colorSummary({ temperature: -20, blackPoint: 8, whitePoint: 240, shoulder: 25 })).toBe(
      'Temperatura -20 · Negros 8 · Blancos 240 · Altas luces suaves 25',
    )
  })
})

describe('las columnas del color (RF-414, RF-418)', () => {
  it('ida y vuelta completa, con procedencia', () => {
    const color = normalizeColor({
      temperature: -34,
      tint: 8,
      exposure: 0.5,
      blackPoint: 12,
      whitePoint: 244,
      gamma: 0.85,
      shoulder: 25,
      gray: true,
      neutral: { x: 0.4, y: 0.6 },
      source: 'AUTO_ADJUSTED',
      reference: 'TARGET_CARD',
      light: 'INCANDESCENT',
      inherited: true,
    })
    expect(colorFromColumns(colorToColumns(color))).toEqual(color)
  })

  it('nulo es identidad: el ajuste neutro no escribe ningún número', () => {
    // It is what allows the single-phase deployment and what makes a row
    // predating the migration read as neutral.
    expect(colorToColumns(NO_COLOR)).toEqual({
      color_temperature: null,
      color_tint: null,
      color_exposure: null,
      color_black: null,
      color_white: null,
      color_gamma: null,
      color_shoulder: null,
      color_gray: false,
      color_neutral_x: null,
      color_neutral_y: null,
      color_source: null,
      color_reference: null,
      color_light: null,
      color_inherited: false,
    })
    expect(colorFromColumns({})).toEqual(NO_COLOR)
    expect(colorFromColumns(null)).toEqual(NO_COLOR)
    // A row from before the migration: only the columns that already existed.
    expect(isNoColor(colorFromColumns({ color_gray: false }))).toBe(true)
  })

  it('«sin revisar» no es «no»: el origen sí distingue el nulo', () => {
    const reviewed = colorToColumns({ source: 'REVIEWED_UNCHANGED' })
    expect(reviewed.color_source).toBe('REVIEWED_UNCHANGED')
    expect(reviewed.color_temperature).toBeNull()
    expect(colorFromColumns(reviewed).source).toBe('REVIEWED_UNCHANGED')
  })

  it('una fila con un valor que la base no habría aceptado se lee sin romper nada', () => {
    const broken = colorFromColumns({
      color_exposure: 9,
      color_gamma: 0,
      color_black: 200,
      color_source: 'INVENTADO' as never,
      color_reference: 'OTRA' as never,
      color_light: 'NEÓN' as never,
      color_neutral_x: 0.5,
    })
    expect(isNoColor(broken)).toBe(true)
    expect(broken.source).toBeNull()
    expect(broken.reference).toBeNull()
    expect(broken.light).toBeNull()
    // Half a neutral point is not a point: the row forbids it and here it is ignored.
    expect(broken.neutral).toBeNull()
  })

  it('el rango almacenable garantiza la restricción de los dos puntos', () => {
    // check (coalesce(color_white,255) - coalesce(color_black,0) >= 128): con los
    // topes de las dos tiras la diferencia mínima es 192 − 64 = 128, así que la
    // forma canónica no puede escribir una fila que la base rechace.
    for (const color of [
      { blackPoint: 64, whitePoint: 192 },
      { blackPoint: 100, whitePoint: 150 },
      { blackPoint: 64 },
      { whitePoint: 192 },
    ]) {
      const columns = colorToColumns(color)
      const white = columns.color_white ?? 255
      const black = columns.color_black ?? 0
      expect(white - black).toBeGreaterThanOrEqual(128)
    }
  })
})
