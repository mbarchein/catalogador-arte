import { describe, expect, it } from 'vitest'
import {
  COLOR_PARAM_ORDER,
} from '../../lib/imageEdits'
import {
  COLOR_RANGES,
  NO_COLOR,
  buildColorLuts,
  colorSummary,
  isNoColor,
  lightPresetLabel,
  normalizeColor,
  sameColor,
  withNeutralPick,
  type ColorParam,
} from '../../lib/imageColor'
import type { GrayTargetCandidate } from '../../lib/grayTarget'
import type { PixelRaster } from '../../lib/imagePixels'
import {
  GRAY_TARGET_KINDS,
  colorFromGrayTarget,
  colorParamText,
  colorProvenanceText,
  colorValueText,
  frameSignature,
  framePixels,
  grayTargetOffer,
  handSource,
  histogramChannels,
  keyValue,
  reviewedColor,
  sampleAt,
  showsColorFilter,
  stepValue,
  stripRatio,
  stripValue,
} from './ColorControls'

/**
 * The pure part of the colour panel (RF-414, RF-417, RF-418).
 *
 * The panel itself cannot be rendered here: this repository has no DOM in its tests —
 * vitest runs on `node`, there is no `jsdom` and no `@testing-library`, and there is not a
 * single `*.test.tsx` in the tree. So everything that can be decided without a screen was
 * pulled out into exported functions, and this is them: what a strip does with a gesture
 * and with a key, what the panel says about where a number came from, and which pixels the
 * automatic and the eyedropper are handed.
 */

/** A raster whose pixel (x, y) carries a colour that identifies it. */
function raster(width: number, height: number, at: (x: number, y: number) => [number, number, number]): PixelRaster {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [r, g, b] = at(x, y)
      const i = (y * width + x) * 4
      data[i] = r
      data[i + 1] = g
      data[i + 2] = b
      data[i + 3] = 255
    }
  }
  return { data, width, height }
}

/** A flat raster of one colour. */
function flat(width: number, height: number, rgb: [number, number, number]): PixelRaster {
  return raster(width, height, () => rgb)
}

/** Every value a strip can hold, in order. */
function notches(param: ColorParam): number[] {
  const { min, max, step } = COLOR_RANGES[param]
  const values: number[] = []
  for (let i = 0; min + i * step <= max + 1e-9; i += 1) values.push(stripValue(param, i / ((max - min) / step)))
  return values
}

describe('RF-414 · lo que la tira dice y lo que la cabecera dice es la misma frase', () => {
  it('colorParamText coincide letra por letra con colorSummary en cada parámetro', () => {
    const samples: Record<ColorParam, number> = {
      temperature: 12,
      tint: -6,
      exposure: 0.5,
      blackPoint: 14,
      whitePoint: 240,
      gamma: 1.05,
      shoulder: 20,
    }
    for (const param of COLOR_PARAM_ORDER) {
      // colorSummary omite lo que está en su valor de identidad, así que con un solo
      // parámetro movido su salida es exactamente la frase de esa tira.
      expect(colorSummary({ [param]: samples[param] })).toBe(colorParamText(param, samples[param]))
    }
  })

  it('el signo se escribe en las escalas que van en los dos sentidos y no en las demás', () => {
    expect(colorValueText('temperature', 12)).toBe('+12')
    expect(colorValueText('temperature', -12)).toBe('-12')
    expect(colorValueText('temperature', 0)).toBe('0')
    expect(colorValueText('exposure', 0.5)).toBe('+0,50 EV')
    expect(colorValueText('blackPoint', 14)).toBe('14')
    expect(colorValueText('whitePoint', 255)).toBe('255')
    expect(colorValueText('gamma', 1.05)).toBe('1,05')
  })
})

describe('RF-414 · la tira solo puede producir valores que la fila acepta', () => {
  it('cada muesca de cada tira sobrevive a normalizeColor sin moverse', () => {
    for (const param of COLOR_PARAM_ORDER) {
      for (const value of notches(param)) {
        // Si la tira produjera 0,4137 EV donde la columna guarda 0,41, la
        // previsualización y el fichero serían dos fotografías distintas en las sombras.
        expect(normalizeColor({ [param]: value })[param]).toBe(value)
      }
    }
  })

  it('los extremos de la posición son los extremos del rango, y fuera de rango se queda en el tope', () => {
    for (const param of COLOR_PARAM_ORDER) {
      const range = COLOR_RANGES[param]
      expect(stripValue(param, 0)).toBe(range.min)
      expect(stripValue(param, 1)).toBe(range.max)
      expect(stripValue(param, -3)).toBe(range.min)
      expect(stripValue(param, 4)).toBe(range.max)
      // Un ratio que no es un número es un rectángulo de ancho cero: se lee como el mínimo
      // y no como NaN, que llegaría a la tabla como un canal en blanco.
      expect(stripValue(param, Number.NaN)).toBe(range.min)
    }
  })

  it('la posición y el valor son inversos: el pulgar vuelve a la muesca de la que salió', () => {
    for (const param of COLOR_PARAM_ORDER) {
      for (const value of notches(param)) {
        expect(stripValue(param, stripRatio(param, value))).toBe(value)
      }
      expect(stripRatio(param, COLOR_RANGES[param].min)).toBe(0)
      expect(stripRatio(param, COLOR_RANGES[param].max)).toBe(1)
      // Y nunca se sale del carril, aunque le llegue un valor corrupto.
      expect(stripRatio(param, -1e6)).toBe(0)
      expect(stripRatio(param, 1e6)).toBe(1)
    }
  })

  it('la posición se ajusta a la muesca y no a cualquier número intermedio', () => {
    // Un sexto de paso es la muesca de la exposición y 0,17 es lo que cabe en numeric(3,2).
    // Un tercio de muesca por encima del centro sigue siendo el centro.
    expect(stripValue('exposure', 0.5 + (1 / 6 / 4) * 0.3)).toBe(0)
    expect(stripValue('exposure', 0.5 + (1 / 6 / 4) * 0.8)).toBe(0.17)
    expect(stripValue('exposure', 1 / 6 / 4)).toBe(-1.83)
    expect(stripValue('gamma', 0.5)).toBe(1.1)
    expect(stripValue('shoulder', 0.111)).toBe(10)
  })
})

describe('§7 · ningún gesto es el único camino: el teclado llega a todo', () => {
  it('las flechas mueven una muesca en los dos sentidos y los dos ejes', () => {
    expect(keyValue('temperature', 10, 'ArrowRight')).toBe(11)
    expect(keyValue('temperature', 10, 'ArrowUp')).toBe(11)
    expect(keyValue('temperature', 10, 'ArrowLeft')).toBe(9)
    expect(keyValue('temperature', 10, 'ArrowDown')).toBe(9)
    expect(keyValue('exposure', 0, 'ArrowRight')).toBe(0.17)
    expect(keyValue('gamma', 1, 'ArrowLeft')).toBe(0.95)
  })

  it('Inicio y Fin van a los topes', () => {
    for (const param of COLOR_PARAM_ORDER) {
      expect(keyValue(param, 0, 'Home')).toBe(COLOR_RANGES[param].min)
      expect(keyValue(param, 0, 'End')).toBe(COLOR_RANGES[param].max)
    }
  })

  it('PáginaArriba y PáginaAbajo dan un salto grande, para una escala de 120 muescas', () => {
    expect(keyValue('temperature', 0, 'PageUp')).toBe(12)
    expect(keyValue('temperature', 0, 'PageDown')).toBe(-12)
    // Nunca menos que una muesca: en una escala corta el salto grande sigue moviendo algo.
    expect(keyValue('gamma', 1, 'PageUp')).toBeGreaterThan(1)
  })

  it('una tecla que no es de la tira no la mueve, para que el editor la siga viendo', () => {
    // Escape tiene que llegar al editor: con el panel abierto cierra el panel, y si la
    // tira se lo comiera no habría forma de salir sin el ratón.
    expect(keyValue('temperature', 0, 'Escape')).toBeNull()
    expect(keyValue('temperature', 0, 'Enter')).toBeNull()
    expect(keyValue('temperature', 0, 'a')).toBeNull()
  })

  it('las teclas no se salen del rango en los topes', () => {
    for (const param of COLOR_PARAM_ORDER) {
      const range = COLOR_RANGES[param]
      expect(keyValue(param, range.max, 'ArrowRight')).toBe(range.max)
      expect(keyValue(param, range.min, 'ArrowLeft')).toBe(range.min)
      expect(stepValue(param, range.max, 5)).toBe(range.max)
      expect(stepValue(param, range.min, -5)).toBe(range.min)
    }
  })
})

describe('RF-414 · el histograma es contextual', () => {
  it('el balance de blancos se lee en los tres canales y el rango tonal en la luminancia', () => {
    expect(histogramChannels('temperature')).toBe('rgb')
    expect(histogramChannels('tint')).toBe('rgb')
    for (const param of ['exposure', 'blackPoint', 'whitePoint', 'gamma', 'shoulder'] as const) {
      expect(histogramChannels(param)).toBe('luminance')
    }
  })
})

describe('RF-414 · la medición se repite cuando el encuadre se mueve y no cuando React repinta', () => {
  const crop = { x: 0.1, y: 0.2, width: 0.5, height: 0.5 }
  const corners = {
    nw: { x: 0, y: 0 },
    ne: { x: 1, y: 0.05 },
    se: { x: 1, y: 1 },
    sw: { x: 0, y: 0.95 },
  }

  it('dos objetos distintos con los mismos números dan la misma firma', () => {
    expect(frameSignature({ rotation: 90, crop: { ...crop }, corners: null })).toBe(
      frameSignature({ rotation: 90, crop: { ...crop }, corners: null }),
    )
  })

  it('cambia con el giro, con el rectángulo y con cualquiera de las cuatro esquinas', () => {
    const base = frameSignature({ rotation: 0, crop, corners: null })
    expect(frameSignature({ rotation: 90, crop, corners: null })).not.toBe(base)
    expect(frameSignature({ rotation: 0, crop: { ...crop, x: 0.11 }, corners: null })).not.toBe(base)
    const quad = frameSignature({ rotation: 0, crop: null, corners })
    expect(quad).not.toBe(base)
    for (const key of ['nw', 'ne', 'se', 'sw'] as const) {
      const moved = { ...corners, [key]: { x: corners[key].x, y: corners[key].y + 0.01 } }
      expect(frameSignature({ rotation: 0, crop: null, corners: moved })).not.toBe(quad)
    }
  })

  it('sin encuadre tiene su propia firma y no revienta', () => {
    expect(frameSignature(null)).toBe('none')
    expect(frameSignature({})).not.toBe('none')
  })
})

describe('RF-414 · el automático mide el encuadre y no la pared de alrededor', () => {
  it('sin recorte devuelve el búfer mismo, sin copiarlo', () => {
    const source = flat(4, 4, [10, 20, 30])
    expect(framePixels(source, null)).toBe(source.data)
    expect(framePixels(source, { rotation: 0, crop: null, corners: null })).toBe(source.data)
  })

  it('con recorte devuelve exactamente los píxeles del rectángulo', () => {
    // Cada píxel lleva su columna en el rojo y su fila en el verde.
    const source = raster(4, 4, (x, y) => [x * 10, y * 10, 0])
    const pixels = framePixels(source, {
      rotation: 0,
      crop: { x: 0.5, y: 0.5, width: 0.5, height: 0.5 },
      corners: null,
    })
    expect(pixels).not.toBeNull()
    expect(pixels!.length).toBe(2 * 2 * 4)
    expect([...pixels!.filter((_, i) => i % 4 === 0)]).toEqual([20, 30, 20, 30])
    expect([...pixels!.filter((_, i) => i % 4 === 1)]).toEqual([20, 20, 30, 30])
  })

  it('deshace el giro: el recorte vive en fracciones de la imagen YA GIRADA', () => {
    const source = raster(4, 2, (x, y) => [x * 10, y * 100, 0])
    // La mitad izquierda de la imagen girada 90° es la fila de abajo de la imagen decodificada.
    const pixels = framePixels(source, {
      rotation: 90,
      crop: { x: 0, y: 0, width: 0.5, height: 1 },
      corners: null,
    })
    expect(pixels).not.toBeNull()
    expect(pixels!.length).toBe(4 * 1 * 4)
    expect([...pixels!.filter((_, i) => i % 4 === 1)]).toEqual([100, 100, 100, 100])
  })

  it('con cuatro esquinas usa su caja envolvente, que es menos pared que la foto entera', () => {
    const source = raster(4, 4, (x, y) => [x * 10, y * 10, 0])
    const pixels = framePixels(source, {
      rotation: 0,
      crop: null,
      corners: {
        nw: { x: 0.5, y: 0.5 },
        ne: { x: 1, y: 0.5 },
        se: { x: 1, y: 1 },
        sw: { x: 0.5, y: 1 },
      },
    })
    expect(pixels!.length).toBe(2 * 2 * 4)
  })

  it('una caja envolvente que se sale de la imagen se mete dentro, no se rechaza', () => {
    // Las esquinas pueden estar legítimamente fuera del encuadre (CORNER_REACH).
    const source = raster(4, 4, (x, y) => [x * 10, y * 10, 0])
    const pixels = framePixels(source, {
      rotation: 0,
      crop: null,
      corners: {
        nw: { x: -0.2, y: -0.2 },
        ne: { x: 1.2, y: -0.1 },
        se: { x: 1.2, y: 1.2 },
        sw: { x: -0.2, y: 1.2 },
      },
    })
    expect(pixels).toBe(source.data)
  })

  it('sin píxeles no hay medición, y no una excepción', () => {
    expect(framePixels(null, null)).toBeNull()
    expect(framePixels({ data: new Uint8ClampedArray(0), width: 0, height: 0 }, null)).toBeNull()
  })
})

describe('RF-418 · el cuentagotas mide los píxeles crudos del punto que se tocó', () => {
  it('devuelve la mediana del parche, así que un píxel de polvo no la mueve', () => {
    const source = raster(21, 21, (x, y) => (x === 10 && y === 10 ? [255, 255, 255] : [120, 118, 130]))
    expect(sampleAt(source, 0, { x: 10.5 / 21, y: 10.5 / 21 })).toEqual({ r: 120, g: 118, b: 130 })
  })

  it('deshace el giro, porque el punto vive en fracciones de la imagen ya girada', () => {
    // Mitad izquierda gris claro, mitad derecha gris oscuro, sin girar.
    const source = raster(40, 40, (x) => (x < 20 ? [200, 200, 200] : [60, 60, 60]))
    // Sin girar, tocar a la izquierda da el claro.
    expect(sampleAt(source, 0, { x: 0.25, y: 0.5 })?.r).toBe(200)
    // Girada 90°, la mitad izquierda de la imagen decodificada aparece ARRIBA: tocar
    // arriba tiene que dar el claro y tocar a la izquierda ya no.
    expect(sampleAt(source, 90, { x: 0.5, y: 0.25 })?.r).toBe(200)
    expect(sampleAt(source, 90, { x: 0.5, y: 0.75 })?.r).toBe(60)
  })

  it('un punto fuera de la fotografía no se acerca al borde: no se toma muestra', () => {
    const source = flat(20, 20, [128, 128, 128])
    expect(sampleAt(source, 0, { x: 1.4, y: 0.5 })).toBeNull()
    expect(sampleAt(source, 0, { x: 0.5, y: -0.1 })).toBeNull()
    expect(sampleAt(source, 0, { x: Number.NaN, y: 0.5 })).toBeNull()
    expect(sampleAt(null, 0, { x: 0.5, y: 0.5 })).toBeNull()
  })

  it('un parche en el borde se mide con lo que hay, sin salirse del búfer', () => {
    const source = flat(6, 6, [77, 88, 99])
    expect(sampleAt(source, 0, { x: 0, y: 0 })).toEqual({ r: 77, g: 88, b: 99 })
    expect(sampleAt(source, 0, { x: 1, y: 1 })).toEqual({ r: 77, g: 88, b: 99 })
  })

  it('un gris quemado se rechaza en vez de dar un número que parece medido', () => {
    const blown = flat(20, 20, [254, 252, 251])
    const buried = flat(20, 20, [3, 2, 4])
    for (const source of [blown, buried]) {
      const sample = sampleAt(source, 0, { x: 0.5, y: 0.5 })
      expect(sample).not.toBeNull()
      // La negativa es de neutralFromSample: aquí lo que se comprueba es que la cadena
      // completa —parche, mediana, muestra— llega a ella y no la esquiva.
      expect(withNeutralPick(NO_COLOR, sample, { x: 0.5, y: 0.5 })).toBeNull()
    }
  })

  it('un gris con dominante cálida se corrige hacia el azul y anota dónde se tomó', () => {
    const warm = flat(20, 20, [150, 128, 100])
    const picked = withNeutralPick(NO_COLOR, sampleAt(warm, 0, { x: 0.4, y: 0.6 }), { x: 0.4, y: 0.6 })
    expect(picked).not.toBeNull()
    expect(picked!.temperature).toBeLessThan(0)
    expect(picked!.source).toBe('NEUTRAL_PICKED')
    expect(picked!.reference).toBe('SCENE')
    expect(picked!.neutral).toEqual({ x: 0.4, y: 0.6 })
  })
})

describe('RF-414 · el origen del ajuste se guarda y se dice', () => {
  it('lo que se retoca después del automático queda como automático corregido', () => {
    expect(handSource('AUTO')).toBe('AUTO_ADJUSTED')
    expect(handSource('AUTO_ADJUSTED')).toBe('AUTO_ADJUSTED')
  })

  it('todo lo demás que se mueve a mano es a mano', () => {
    for (const previous of [null, undefined, 'MANUAL', 'PRESET', 'NEUTRAL_PICKED', 'REVIEWED_UNCHANGED'] as const) {
      expect(handSource(previous)).toBe('MANUAL')
    }
  })

  it('la línea de origen nunca muestra un valor de enum en crudo', () => {
    const sources = ['MANUAL', 'NEUTRAL_PICKED', 'AUTO', 'AUTO_ADJUSTED', 'PRESET', 'REVIEWED_UNCHANGED'] as const
    for (const source of sources) {
      const text = colorProvenanceText({ source })
      expect(text).not.toBeNull()
      expect(text!.length).toBeGreaterThan(0)
      expect(text).not.toMatch(/[A-Z]{2,}/)
    }
  })

  it('sin origen no hay línea: nadie ha mirado todavía el color de esta fotografía', () => {
    expect(colorProvenanceText(null)).toBeNull()
    expect(colorProvenanceText(NO_COLOR)).toBeNull()
  })

  it('la referencia del gris cambia la frase, porque cambia cuánto se puede creer', () => {
    expect(colorProvenanceText({ source: 'NEUTRAL_PICKED', reference: 'TARGET_CARD' })).toContain('carta de grises')
    expect(colorProvenanceText({ source: 'NEUTRAL_PICKED', reference: 'TARGET_PRINT' })).toContain('hoja impresa')
    expect(colorProvenanceText({ source: 'NEUTRAL_PICKED', reference: 'SCENE' })).toContain('cuentagotas')
  })

  it('dice el tipo de luz por su etiqueta, y que el ajuste es heredado', () => {
    const text = colorProvenanceText({ source: 'PRESET', light: 'INCANDESCENT', inherited: true })
    expect(text).toContain(lightPresetLabel('INCANDESCENT')!)
    expect(text).toContain('heredado de la toma general')
  })
})

describe('RF-414 · «se miró y se dejó como estaba» no es «no se ha mirado»', () => {
  it('un panel abierto sobre un color neutro deja constancia de la revisión', () => {
    const reviewed = reviewedColor(null, true)
    expect(reviewed.source).toBe('REVIEWED_UNCHANGED')
  })

  it('y no cambia ni un píxel: la tabla sigue siendo la identidad', () => {
    const luts = buildColorLuts(reviewedColor(null, true))
    for (let code = 0; code < 256; code += 1) {
      expect(luts.r[code]).toBe(code)
      expect(luts.g[code]).toBe(code)
      expect(luts.b[code]).toBe(code)
    }
    expect(isNoColor(reviewedColor(null, true))).toBe(true)
  })

  it('no se inventa una revisión que no ocurrió, ni pisa un origen que ya existe', () => {
    expect(reviewedColor(null, false).source).toBeNull()
    expect(reviewedColor({ source: 'MANUAL' }, true).source).toBe('MANUAL')
    // Con el ajuste hecho, el origen ya lo escribió quien lo hizo.
    expect(reviewedColor({ temperature: 12 }, true).source).toBeNull()
  })
})

describe('RF-418 · el testigo se ofrece, nunca se aplica solo', () => {
  const patch = (tone: number) => ({
    box: { x: 0, y: 0, width: 0.1, height: 0.1 },
    tone: { r: tone, g: tone, b: tone },
    luminance: tone,
    pixels: 400,
  })
  const candidate = (over: Partial<GrayTargetCandidate>): GrayTargetCandidate =>
    ({
      axis: 'horizontal',
      box: { x: 0.6, y: 0.7, width: 0.3, height: 0.1 },
      patches: [patch(225), patch(180), patch(135), patch(90), patch(45)],
      confidence: 0.82,
      measure: {} as GrayTargetCandidate['measure'],
      reference: 'TARGET_CARD',
      neutral: { temperature: -8, tint: 3 },
      trustsGray: true,
      ...over,
    }) as GrayTargetCandidate

  it('las dos declaraciones son las de §4 y se ven en español', () => {
    expect(GRAY_TARGET_KINDS.map((one) => one.value)).toEqual(['CARD', 'PRINT'])
    for (const one of GRAY_TARGET_KINDS) expect(one.label).not.toMatch(/[A-Z]{2,}/)
  })

  it('una carta comprada mueve el balance de blancos y lo dice', () => {
    const offer = grayTargetOffer(candidate({}))
    expect(offer.movesWhiteBalance).toBe(true)
    expect(offer.detail).toContain('5 parches')
    expect(offer.detail).toContain('82 %')
  })

  it('una hoja impresa se anota y NO mueve el balance de blancos', () => {
    const offer = grayTargetOffer(candidate({ reference: 'TARGET_PRINT', neutral: null, trustsGray: false }))
    expect(offer.movesWhiteBalance).toBe(false)
    expect(offer.detail).toContain('tinta doméstica no es neutra')
  })

  it('aceptar una carta fija temperatura y matiz y anota el centro del testigo', () => {
    const next = colorFromGrayTarget(NO_COLOR, candidate({}), { x: 0.75, y: 0.75 })
    expect(next.temperature).toBe(-8)
    expect(next.tint).toBe(3)
    expect(next.source).toBe('NEUTRAL_PICKED')
    expect(next.reference).toBe('TARGET_CARD')
    expect(next.neutral).toEqual({ x: 0.75, y: 0.75 })
  })

  it('aceptar una hoja impresa deja los píxeles intactos y solo anota la referencia', () => {
    const before = normalizeColor({ temperature: 20, exposure: 0.5 })
    const next = colorFromGrayTarget(before, candidate({ reference: 'TARGET_PRINT', neutral: null, trustsGray: false }), {
      x: 0.5,
      y: 0.5,
    })
    // El aspecto es el mismo: la tinta de una impresora no puede corregir una dominante.
    expect(sameColor(before, next)).toBe(true)
    expect(next.reference).toBe('TARGET_PRINT')
  })
})

describe('§7 · el filtro de previsualización está puesto ANTES del primer arrastre', () => {
  it('con el panel abierto está puesto aunque el ajuste sea neutro', () => {
    // Las tiras escriben las tablas directamente en el DOM: un filtro que React todavía no
    // hubiera pintado dejaría el primer arrastre de una foto sin tocar sin previsualizar
    // nada. La tabla neutra es la identidad exacta, así que tenerlo puesto no cambia nada.
    expect(showsColorFilter(true, NO_COLOR)).toBe(true)
    expect(showsColorFilter(true, null)).toBe(true)
  })

  it('con el panel cerrado solo está puesto si hay algo que mostrar', () => {
    expect(showsColorFilter(false, NO_COLOR)).toBe(false)
    expect(showsColorFilter(false, { temperature: 4 })).toBe(true)
    // Un «revisado y sin cambios» no pinta nada: no mueve ningún píxel.
    expect(showsColorFilter(false, { source: 'REVIEWED_UNCHANGED' })).toBe(false)
  })
})
