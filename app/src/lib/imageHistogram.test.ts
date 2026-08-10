import { describe, expect, it } from 'vitest'
import { buildColorLuts } from './imageColor'
import type { PixelRaster } from './imagePixels'
import {
  ACHROMATIC_FRACTION,
  CLIPPING_NOTICE_PERCENT,
  MAX_CLIPPED_PERCENT,
  MIN_CLIPPED_PERCENT,
  clippingNotice,
  clippingOf,
  clippingToColumns,
  hasBelievableGray,
  histogramOf,
  histogramPath,
  histogramPeak,
  measureFrame,
  medianLuminance,
  percentileFrom,
  type ColorTables,
} from './imageHistogram'

/* ------------------------------------------------------------------ fixtures */

type Pixel = readonly [number, number, number] | readonly [number, number, number, number]

/** A raster built pixel by pixel, which is the only kind this repository can have. */
function raster(width: number, height: number, at: (x: number, y: number) => Pixel): PixelRaster {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const pixel = at(x, y)
      const i = (y * width + x) * 4
      data[i] = pixel[0]
      data[i + 1] = pixel[1]
      data[i + 2] = pixel[2]
      data[i + 3] = pixel[3] ?? 255
    }
  }
  return { data, width, height }
}

/** A raster of one colour. */
function solid(width: number, height: number, pixel: Pixel): PixelRaster {
  return raster(width, height, () => pixel)
}

/** A raster from a list of pixels, one row. */
function row(pixels: readonly Pixel[]): PixelRaster {
  return raster(pixels.length, 1, (x) => pixels[x]!)
}

/** The dark left half and the light right half: an artwork and its wall. */
function halves(width: number, height: number, left: Pixel, right: Pixel): PixelRaster {
  return raster(width, height, (x) => (x < width / 2 ? left : right))
}

/** The identity tables, as `buildColorLuts` builds them for a neutral adjustment. */
function identityTables(): ColorTables {
  return buildColorLuts(null)
}

/* ----------------------------------------------------------------- histogram */

describe('histograma del encuadre (RF-414)', () => {
  it('cuenta cada canal y la luminancia de un campo uniforme', () => {
    const measure = measureFrame(solid(8, 8, [128, 128, 128]))
    expect(measure.count).toBe(64)
    expect(measure.histogram.count).toBe(64)
    expect(measure.histogram.r[128]).toBe(64)
    expect(measure.histogram.g[128]).toBe(64)
    expect(measure.histogram.b[128]).toBe(64)
    // Rec. 709's weights add up to 1, so a grey falls on its own code.
    expect(measure.histogram.luminance[128]).toBe(64)
    expect(measure.median).toBe(128)
  })

  it('mide el encuadre elegido y no la fotografía entera: el gotelé queda fuera (RF-414)', () => {
    // The left half is the artwork (dark) and the right one the wall (light). Measured
    // whole, the high percentile and the median are the wall's.
    const photo = halves(8, 4, [20, 20, 20], [240, 240, 240])
    const whole = measureFrame(photo)
    expect(whole.count).toBe(32)
    expect(whole.histogram.r[20]).toBe(16)
    expect(whole.histogram.r[240]).toBe(16)
    expect(whole.percentileHigh).toBe(240)

    const framed = measureFrame(photo, { crop: { x: 0, y: 0, width: 0.5, height: 1 } })
    expect(framed.count).toBe(16)
    expect(framed.histogram.r[20]).toBe(16)
    expect(framed.histogram.r[240]).toBe(0)
    expect(framed.percentileHigh).toBe(20)
  })

  it('deshace el giro: el recorte llega en fracciones de la imagen ya girada (RF-414)', () => {
    const photo = halves(8, 4, [20, 20, 20], [240, 240, 240])
    // With the photo rotated 90° the master's left column is the top strip.
    const top = measureFrame(photo, {
      rotation: 90,
      crop: { x: 0, y: 0, width: 1, height: 0.5 },
    })
    expect(top.count).toBe(16)
    expect(top.histogram.r[20]).toBe(16)
    expect(top.histogram.r[240]).toBe(0)

    const bottom = measureFrame(photo, {
      rotation: 90,
      crop: { x: 0, y: 0.5, width: 1, height: 0.5 },
    })
    expect(bottom.histogram.r[240]).toBe(16)
    expect(bottom.histogram.r[20]).toBe(0)
  })

  it('mide el cuadrilátero de las esquinas, no su caja (RF-414)', () => {
    const photo = raster(10, 10, (x, y) =>
      x >= 2 && x < 8 && y >= 2 && y < 8 ? [200, 200, 200] : [10, 10, 10],
    )
    const measure = measureFrame(photo, {
      corners: {
        nw: { x: 0.2, y: 0.2 },
        ne: { x: 0.8, y: 0.2 },
        se: { x: 0.8, y: 0.8 },
        sw: { x: 0.2, y: 0.8 },
      },
    })
    expect(measure.count).toBe(36)
    expect(measure.histogram.r[200]).toBe(36)
    expect(measure.histogram.r[10]).toBe(0)
  })

  it('un cuadrilátero ladeado excluye las esquinas del fotograma (RF-414)', () => {
    // Pared blanca en las cuatro esquinas del fotograma y obra en el rombo central:
    // la caja envolvente del rombo es todo el fotograma, así que si se midiera la
    // caja la pared entraría.
    const photo = raster(8, 8, (x, y) => {
      const corner = (x < 2 || x >= 6) && (y < 2 || y >= 6)
      return corner ? [255, 255, 255] : [100, 100, 100]
    })
    const measure = measureFrame(photo, {
      corners: {
        nw: { x: 0.5, y: 0 },
        ne: { x: 1, y: 0.5 },
        se: { x: 0.5, y: 1 },
        sw: { x: 0, y: 0.5 },
      },
    })
    expect(measure.histogram.r[255]).toBe(0)
    expect(measure.count).toBeGreaterThan(0)
    expect(measure.count).toBeLessThan(64)
  })

  it('las esquinas mandan sobre el recorte, como en el resto de la edición (RF-414)', () => {
    const photo = halves(8, 8, [20, 20, 20], [240, 240, 240])
    const measure = measureFrame(photo, {
      crop: { x: 0.5, y: 0, width: 0.5, height: 1 },
      corners: {
        nw: { x: 0, y: 0 },
        ne: { x: 0.5, y: 0 },
        se: { x: 0.5, y: 1 },
        sw: { x: 0, y: 1 },
      },
    })
    expect(measure.histogram.r[20]).toBe(32)
    expect(measure.histogram.r[240]).toBe(0)
  })

  it('no mide los píxeles transparentes, que no son de la fotografía (RF-414)', () => {
    const measure = measureFrame(
      row([[10, 10, 10], [10, 10, 10, 0], [200, 200, 200], [200, 200, 200, 0]]),
    )
    expect(measure.count).toBe(2)
    expect(measure.histogram.r[10]).toBe(1)
    expect(measure.histogram.r[200]).toBe(1)
  })

  it('sin píxeles medibles no lanza y lo dice con el recuento (RF-414)', () => {
    for (const empty of [
      null,
      undefined,
      { data: new Uint8ClampedArray(0), width: 0, height: 0 },
      { data: new Uint8ClampedArray(0), width: 4, height: Number.NaN },
    ]) {
      const measure = measureFrame(empty as PixelRaster | null)
      expect(measure.count).toBe(0)
      expect(measure.median).toBe(0)
      expect(measure.achromaticFraction).toBe(0)
      expect(measure.achromaticMedian).toBeNull()
      expect(hasBelievableGray(measure)).toBe(false)
    }
  })

  it('un búfer truncado se mide hasta donde llega en vez de lanzar (RF-414)', () => {
    const truncated: PixelRaster = {
      data: new Uint8ClampedArray([200, 200, 200, 255, 200, 200]),
      width: 2,
      height: 1,
    }
    const measure = measureFrame(truncated)
    expect(measure.count).toBe(1)
    expect(measure.histogram.r[200]).toBe(1)
  })

  it('un encuadre inservible mide la foto entera antes que devolver un panel vacío (RF-414)', () => {
    const photo = halves(8, 4, [20, 20, 20], [240, 240, 240])
    const broken = measureFrame(photo, {
      rotation: Number.NaN,
      corners: {
        nw: { x: Number.NaN, y: 0 },
        ne: { x: 1, y: 0 },
        se: { x: 1, y: 1 },
        sw: { x: 0, y: 1 },
      },
    })
    expect(broken.count).toBe(32)
  })

  it('histogramOf devuelve el mismo histograma que measureFrame (RF-414)', () => {
    const photo = halves(6, 2, [30, 30, 30], [220, 220, 220])
    const frame = { crop: { x: 0.5, y: 0, width: 0.5, height: 1 } }
    expect(Array.from(histogramOf(photo, frame).r)).toEqual(
      Array.from(measureFrame(photo, frame).histogram.r),
    )
  })
})

/* --------------------------------------------------------------- percentiles */

describe('percentiles y mediana del encuadre (RF-414)', () => {
  it('el percentil 0,1 no lo mueve un puñado de píxeles perdidos (RF-414)', () => {
    // Nine pixels at 5 out of ten thousand: less than a thousandth, which is precisely the
    // reason for reading the percentile and not the minimum.
    const bins = new Int32Array(256)
    bins[5] = 9
    bins[128] = 9991
    expect(percentileFrom(bins, 10000, 0.001)).toBe(128)
    expect(percentileFrom(bins, 10000, 0.999)).toBe(128)
    expect(percentileFrom(bins, 10000, 0.5)).toBe(128)
  })

  it('el percentil es el rango más cercano y no interpola entre códigos (RF-414)', () => {
    const bins = new Int32Array(256)
    bins[10] = 500
    bins[200] = 500
    expect(percentileFrom(bins, 1000, 0.5)).toBe(10)
    expect(percentileFrom(bins, 1000, 0.51)).toBe(200)
  })

  it('sin píxeles el percentil es 0 y la fracción se acota (RF-414)', () => {
    const bins = new Int32Array(256)
    bins[64] = 4
    expect(percentileFrom(bins, 0, 0.5)).toBe(0)
    expect(percentileFrom(bins, 4, -1)).toBe(64)
    expect(percentileFrom(bins, 4, 2)).toBe(64)
    expect(percentileFrom(bins, 4, Number.NaN)).toBe(64)
  })

  it('los dos percentiles del encuadre son los que lee el automático (RF-414)', () => {
    // Ten thousand pixels: one at 0, one at 255 and the rest at 128. With 0.1 % and
    // 99.9 % the two lone extremes do not count, which is §3.4's prudence.
    const photo = raster(100, 100, (x, y) => {
      const index = y * 100 + x
      if (index === 0) return [0, 0, 0]
      if (index === 1) return [255, 255, 255]
      return [128, 128, 128]
    })
    const measure = measureFrame(photo)
    expect(measure.count).toBe(10000)
    expect(measure.percentileLow).toBe(128)
    expect(measure.percentileHigh).toBe(128)
  })

  it('la mediana de luminancia sale del histograma de luminancia (RF-414)', () => {
    const photo = row([[0, 0, 0], [85, 85, 85], [170, 170, 170], [255, 255, 255]])
    expect(medianLuminance(histogramOf(photo))).toBe(85)
    expect(medianLuminance(null)).toBe(0)
  })
})

/* ------------------------------------------------------------- gris creíble */

describe('píxeles acromáticos creíbles del encuadre (RF-414)', () => {
  it('un campo gris neutro es todo acromático y su mediana es su gris (RF-414)', () => {
    const measure = measureFrame(solid(8, 8, [128, 128, 128]))
    expect(measure.achromatic).toBe(64)
    expect(measure.achromaticFraction).toBe(1)
    expect(measure.achromaticMedian).toEqual({ r: 128, g: 128, b: 128 })
    expect(hasBelievableGray(measure)).toBe(true)
  })

  it('un campo saturado no aporta ningún gris y el balance tiene que callar (RF-414)', () => {
    const measure = measureFrame(solid(8, 8, [200, 120, 120]))
    expect(measure.count).toBe(64)
    expect(measure.achromatic).toBe(0)
    expect(measure.achromaticMedian).toBeNull()
    expect(hasBelievableGray(measure)).toBe(false)
  })

  it('solo cuenta el tercio central de luminancia (RF-414)', () => {
    for (const dark of [[40, 40, 40], [220, 220, 220]] as const) {
      const measure = measureFrame(solid(4, 4, dark))
      expect(measure.count).toBe(16)
      expect(measure.achromatic).toBe(0)
      expect(hasBelievableGray(measure)).toBe(false)
    }
  })

  it('la desviación se mide sobre el máximo del propio píxel, no en códigos (RF-414)', () => {
    // Eight codes of max−min difference in both cases: over a light grey it is
    // a slight tint (5 %) and over a dark one it is violent (8 %).
    expect(measureFrame(solid(4, 4, [160, 152, 152])).achromatic).toBe(16)
    expect(measureFrame(solid(4, 4, [100, 92, 92])).achromatic).toBe(0)
  })

  it('por debajo del 0,5% de grises creíbles el automático no puede opinar (RF-414)', () => {
    const withGreys = (greys: number) =>
      measureFrame(
        raster(40, 25, (x, y) => (y * 40 + x < greys ? [128, 128, 128] : [200, 120, 120])),
      )
    const scarce = withGreys(4)
    expect(scarce.count).toBe(1000)
    expect(scarce.achromaticFraction).toBeCloseTo(0.004, 6)
    expect(scarce.achromaticFraction).toBeLessThan(ACHROMATIC_FRACTION)
    expect(hasBelievableGray(scarce)).toBe(false)

    const enough = withGreys(6)
    expect(enough.achromaticFraction).toBeCloseTo(0.006, 6)
    expect(hasBelievableGray(enough)).toBe(true)
    expect(enough.achromaticMedian).toEqual({ r: 128, g: 128, b: 128 })
  })

  it('la referencia gris es la mediana y no la media: un píxel raro no la arrastra (RF-414)', () => {
    const photo = row([
      [120, 120, 120],
      [130, 130, 130],
      [160, 160, 160],
      [200, 120, 120],
    ])
    const measure = measureFrame(photo)
    expect(measure.count).toBe(4)
    expect(measure.achromatic).toBe(3)
    // The mean of 120, 130 and 160 is 136.67; the median is 130.
    expect(measure.achromaticMedian).toEqual({ r: 130, g: 130, b: 130 })
  })

  it('el gris se busca en el encuadre, no en la pared (RF-414)', () => {
    // Neutral grey wall on the right, tinted artwork on the left: with the
    // artwork framed, there is no grey to believe and the automatic has to keep quiet.
    const photo = halves(8, 4, [160, 140, 120], [128, 128, 128])
    expect(hasBelievableGray(measureFrame(photo))).toBe(true)
    expect(
      hasBelievableGray(measureFrame(photo, { crop: { x: 0, y: 0, width: 0.5, height: 1 } })),
    ).toBe(false)
  })
})

/* ------------------------------------------------------------------ recorte */

describe('recuento de píxeles empastados y quemados (RF-414)', () => {
  it('la tabla neutra no recorta nada, y eso es lo que hace fiable el aviso (RF-414)', () => {
    const gradient = raster(16, 16, (x, y) => {
      const code = y * 16 + x
      return [code, code, code]
    })
    const clipping = clippingOf(gradient, identityTables())
    expect(clipping.count).toBe(256)
    expect(clipping.low).toBe(0)
    expect(clipping.high).toBe(0)
    expect(clipping.lowPercent).toBe(0)
    expect(clipping.highPercent).toBe(0)
  })

  it('el punto de negros empasta las sombras y se cuenta (RF-414)', () => {
    const photo = row([[10, 10, 10], [0, 0, 0], [200, 200, 200], [255, 255, 255]])
    const clipping = clippingOf(photo, buildColorLuts({ blackPoint: 32 }))
    expect(clipping.count).toBe(4)
    // The pixel at 10 is lost; the one that was already pure black is not lost by this adjustment.
    expect(clipping.low).toBe(1)
    expect(clipping.high).toBe(0)
    expect(clipping.lowPercent).toBe(25)
  })

  it('el punto de blancos quema las luces y se cuenta (RF-414)', () => {
    const photo = row([[10, 10, 10], [0, 0, 0], [200, 200, 200], [255, 255, 255]])
    const clipping = clippingOf(photo, buildColorLuts({ whitePoint: 192 }))
    expect(clipping.high).toBe(1)
    expect(clipping.highPercent).toBe(25)
  })

  it('lo que ya estaba en negro puro no lo empasta el ajuste (RF-414)', () => {
    const night = solid(4, 4, [0, 0, 0])
    expect(clippingOf(night, identityTables()).low).toBe(0)
    expect(clippingOf(night, buildColorLuts({ blackPoint: 64 })).low).toBe(0)
    const overexposed = solid(4, 4, [255, 255, 255])
    expect(clippingOf(overexposed, buildColorLuts({ whitePoint: 192 })).high).toBe(0)
  })

  it('un canal a cero no es un píxel perdido; los tres sí (RF-414)', () => {
    // Strong white balance: blue's gain comes down and the channel goes to zero
    // in a dark pixel that keeps its detail in red and green.
    const tables = buildColorLuts({ temperature: 60 })
    expect(tables.b[1]).toBe(0)
    expect(tables.r[1]).toBeGreaterThan(0)
    expect(clippingOf(solid(2, 2, [90, 40, 1]), tables).low).toBe(0)
    expect(clippingOf(solid(2, 2, [0, 0, 1]), tables).low).toBe(4)
  })

  it('con blanco y negro el recuento pasa por la luminancia del §3.2 (RF-414)', () => {
    const tables: ColorTables = { ...identityTables(), gray: true }
    // Un azul purísimo y oscuro sobrevive en color y desaparece en luminancia.
    expect(clippingOf(solid(2, 2, [0, 0, 3]), identityTables()).low).toBe(0)
    expect(clippingOf(solid(2, 2, [0, 0, 3]), tables).low).toBe(4)
  })

  it('el encuadre manda también en el recuento (RF-414)', () => {
    const photo = halves(8, 4, [10, 10, 10], [240, 240, 240])
    const tables = buildColorLuts({ blackPoint: 32 })
    expect(clippingOf(photo, tables).low).toBe(16)
    expect(clippingOf(photo, tables, { crop: { x: 0.5, y: 0, width: 0.5, height: 1 } }).low).toBe(0)
  })

  it('sin tabla no hay recorte, y sin píxeles no hay medición (RF-414)', () => {
    expect(clippingOf(solid(2, 2, [10, 10, 10]), null).low).toBe(0)
    const nothing = clippingOf(null, identityTables())
    expect(nothing.count).toBe(0)
    expect(nothing.lowPercent).toBe(0)
  })

  it('una pérdida real nunca se anota como 0,00 por redondeo (RF-414)', () => {
    // One pixel out of thirty thousand is 0.0033 %, which rounded to two decimals is
    // zero: the column would say «nothing was lost» next to a lost detail.
    const photo = raster(200, 150, (x, y) => (x === 0 && y === 0 ? [10, 10, 10] : [128, 128, 128]))
    const clipping = clippingOf(photo, buildColorLuts({ blackPoint: 32 }))
    expect(clipping.count).toBe(30000)
    expect(clipping.low).toBe(1)
    expect(clipping.lowPercent).toBe(MIN_CLIPPED_PERCENT)
  })

  it('el 100% se anota como 99,99, que es lo que la columna puede guardar (RF-414)', () => {
    const clipping = clippingOf(solid(2, 2, [10, 10, 10]), buildColorLuts({ blackPoint: 32 }))
    expect(clipping.low).toBe(4)
    expect(clipping.lowPercent).toBe(MAX_CLIPPED_PERCENT)
    expect(clippingToColumns(clipping).color_clipped_low).toBe(99.99)
  })

  it('cero es una medición y nulo es no haber medido (RF-414)', () => {
    const measured = clippingToColumns(clippingOf(solid(2, 2, [128, 128, 128]), identityTables()))
    expect(measured).toEqual({ color_clipped_low: 0, color_clipped_high: 0 })
    expect(clippingToColumns(clippingOf(null, identityTables()))).toEqual({
      color_clipped_low: null,
      color_clipped_high: null,
    })
    expect(clippingToColumns(null)).toEqual({
      color_clipped_low: null,
      color_clipped_high: null,
    })
  })
})

describe('aviso de recorte (RF-414)', () => {
  it('calla por debajo del medio por ciento, que lo tiene cualquier fotografía (RF-414)', () => {
    const photo = raster(100, 10, (x, y) => (x === 0 && y === 0 ? [10, 10, 10] : [128, 128, 128]))
    const clipping = clippingOf(photo, buildColorLuts({ blackPoint: 32 }))
    expect(clipping.lowPercent).toBeLessThan(CLIPPING_NOTICE_PERCENT)
    expect(clippingNotice(clipping)).toBeNull()
  })

  it('avisa de las sombras empastadas en español y con la salida (RF-414)', () => {
    const notice = clippingNotice(
      clippingOf(
        raster(10, 10, (_x, y) => (y < 2 ? [10, 10, 10] : [128, 128, 128])),
        buildColorLuts({ blackPoint: 32 }),
      ),
    )
    expect(notice).toContain('20,00%')
    expect(notice).toContain('negro puro')
    expect(notice).toContain('bajar los negros')
  })

  it('avisa de las luces quemadas (RF-414)', () => {
    const notice = clippingNotice(
      clippingOf(
        raster(10, 10, (_x, y) => (y < 1 ? [250, 250, 250] : [128, 128, 128])),
        buildColorLuts({ whitePoint: 192 }),
      ),
    )
    expect(notice).toContain('10,00%')
    expect(notice).toContain('blanco puro')
    expect(notice).toContain('subir los blancos')
  })

  it('avisa de las dos a la vez sin repetir el aviso (RF-414)', () => {
    const photo = raster(10, 10, (_x, y) => {
      if (y < 2) return [10, 10, 10]
      if (y < 4) return [250, 250, 250]
      return [128, 128, 128]
    })
    const notice = clippingNotice(
      clippingOf(photo, buildColorLuts({ blackPoint: 32, whitePoint: 192 })),
    )
    expect(notice).toContain('20,00%')
    expect(notice).toContain('negro puro')
    expect(notice).toContain('blanco puro')
    expect(notice?.split('Con este ajuste').length).toBe(2)
  })

  it('sin medición no dice nada: quien no pudo medir lo cuenta con su propia frase (RF-414)', () => {
    expect(clippingNotice(clippingOf(null, identityTables()))).toBeNull()
    expect(clippingNotice(null)).toBeNull()
  })
})

/* ---------------------------------------------------------------- ruta SVG */

describe('ruta SVG del histograma (RF-414)', () => {
  it('dibuja una escalera de códigos, no una curva entre centros (RF-414)', () => {
    expect(histogramPath([0, 1, 0], { width: 3, height: 10 })).toBe(
      'M 0 10 L 1 10 L 1 0 L 2 0 L 2 10 L 3 10 Z',
    )
  })

  it('suelta los vértices colineales de los tramos llanos (RF-414)', () => {
    expect(histogramPath([1, 1, 1], { width: 3, height: 10 })).toBe('M 0 10 L 0 0 L 3 0 L 3 10 Z')
  })

  it('sin nada que dibujar devuelve vacío en vez de una línea de base falsa (RF-414)', () => {
    expect(histogramPath([], { width: 4, height: 10 })).toBe('')
    expect(histogramPath(null)).toBe('')
    expect(histogramPath([0, 0, 0], { width: 3, height: 10 })).toBe('')
  })

  it('la raíz cuadrada deja ver la cola que la escala lineal aplasta (RF-414)', () => {
    const sqrt = histogramPath([100, 1], { width: 2, height: 100 })
    const linear = histogramPath([100, 1], { width: 2, height: 100, scale: 'linear' })
    // The single-pixel bin: 10 units tall with the square root, 1 with the linear scale.
    expect(sqrt).toContain('90')
    expect(linear).toContain('99')
    expect(sqrt).not.toBe(linear)
  })

  it('un pico compartido pone los tres canales a la misma escala (RF-414)', () => {
    const red = [4, 0]
    const blue = [1, 0]
    expect(histogramPeak(red, blue)).toBe(4)
    expect(histogramPeak(null, undefined)).toBe(0)
    // Without a shared peak, blue would reach the top as if it were as tall as red.
    expect(histogramPath(blue, { width: 2, height: 100 })).toContain('L 0 0')
    expect(histogramPath(blue, { width: 2, height: 100, peak: histogramPeak(red, blue) })).toContain(
      'L 0 50',
    )
  })

  it('la ruta nunca se sale de su caja y respeta el orden de los bins (RF-414)', () => {
    const bins = Array.from({ length: 256 }, (_, code) => (code % 7) * code)
    const path = histogramPath(bins, { width: 512, height: 64 })
    const numbers = path.match(/-?\d+(\.\d+)?/g)?.map(Number) ?? []
    expect(numbers.length).toBeGreaterThan(0)
    for (let i = 0; i < numbers.length; i += 2) {
      expect(numbers[i]).toBeGreaterThanOrEqual(0)
      expect(numbers[i]).toBeLessThanOrEqual(512)
      expect(numbers[i + 1]).toBeGreaterThanOrEqual(0)
      expect(numbers[i + 1]).toBeLessThanOrEqual(64)
    }
    expect(path.startsWith('M 0 64')).toBe(true)
    expect(path.endsWith('Z')).toBe(true)
  })

  it('un bin con más píxeles se dibuja más alto (RF-414)', () => {
    const tops = (bins: number[]) =>
      (histogramPath(bins, { width: 2, height: 100 }).match(/-?\d+(\.\d+)?/g) ?? []).map(Number)
    // [1, 4]: the second bin is the peak and the first is left at half height.
    expect(tops([1, 4])).toContain(50)
    expect(tops([1, 4])).toContain(0)
  })

  it('se dibuja del histograma del encuadre (RF-414)', () => {
    const photo = halves(8, 4, [20, 20, 20], [240, 240, 240])
    const framed = histogramOf(photo, { crop: { x: 0, y: 0, width: 0.5, height: 1 } })
    const path = histogramPath(framed.luminance, { width: 256, height: 100 })
    expect(path).toContain('L 20 0')
    expect(histogramPath(histogramOf(photo).luminance, { width: 256, height: 100 })).not.toBe(path)
  })
})
