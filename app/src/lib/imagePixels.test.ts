import { describe, expect, it } from 'vitest'
import {
  ANALYSIS_LONG_EDGE,
  analysisRasterSize,
  luminanceOf,
  type PixelRaster,
} from './imagePixels'

/**
 * What can be tested of imagePixels.ts is its two pure halves: how big the
 * analysis raster comes out, and how a raster of pixels becomes luminance. The
 * decode itself needs `createImageBitmap` and a canvas, which this environment
 * does not have, and is checked in the browser with real photographs — the same
 * split as imageEdits.ts against imageRender.ts.
 *
 * A raster is built here by hand from RGB triples, which is the only way to have
 * a ground truth to compare against.
 */

function raster(width: number, height: number, pixels: [number, number, number][]): PixelRaster {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < width * height; i += 1) {
    const [r, g, b] = pixels[i % pixels.length]!
    data[i * 4] = r
    data[i * 4 + 1] = g
    data[i * 4 + 2] = b
    data[i * 4 + 3] = 255
  }
  return { data, width, height }
}

const flat = (r: number, g: number, b: number): PixelRaster => raster(1, 1, [[r, g, b]])

describe('analysisRasterSize: el tamaño del ráster de análisis (RF-410, RF-414)', () => {
  it('reduce el lado largo al de análisis conservando la proporción', () => {
    // Fotografía de móvil típica, horizontal.
    expect(analysisRasterSize(4032, 3024, 700)).toEqual({ width: 700, height: 525 })
  })

  it('hace lo mismo en vertical, sin intercambiar los lados', () => {
    expect(analysisRasterSize(3024, 4032, 700)).toEqual({ width: 525, height: 700 })
  })

  it('por omisión usa el lado largo de análisis del módulo', () => {
    expect(ANALYSIS_LONG_EDGE).toBe(700)
    expect(analysisRasterSize(4032, 3024)).toEqual(analysisRasterSize(4032, 3024, ANALYSIS_LONG_EDGE))
  })

  it('nunca amplía una imagen pequeña: analizar píxeles inventados no mide nada', () => {
    expect(analysisRasterSize(300, 200, 700)).toEqual({ width: 300, height: 200 })
  })

  it('devuelve píxeles enteros aunque el decodificador dé un tamaño fraccionario', () => {
    expect(analysisRasterSize(1400.9, 700.4, 700)).toEqual({ width: 700, height: 350 })
  })

  it('niega el ráster de un bitmap con un lado a cero: un lienzo de cero no se puede leer', () => {
    expect(analysisRasterSize(0, 0)).toBeNull()
    expect(analysisRasterSize(700, 0)).toBeNull()
    expect(analysisRasterSize(0.4, 700)).toBeNull()
    expect(analysisRasterSize(-700, 700)).toBeNull()
  })

  it('niega el ráster ante un tamaño que no es un número', () => {
    expect(analysisRasterSize(Number.NaN, 700)).toBeNull()
    expect(analysisRasterSize(700, Number.POSITIVE_INFINITY)).toBeNull()
  })
})

describe('luminanceOf: la luminancia de un ráster (RF-410, RF-414)', () => {
  it('da un valor por píxel, en orden y por filas', () => {
    const pixels = raster(2, 2, [
      [255, 0, 0],
      [0, 255, 0],
      [0, 0, 255],
      [0, 0, 0],
    ])
    // Pesos Rec. 709 sobre los valores sRGB tal cual: 0,2126 · 0,7152 · 0,0722.
    expect(Array.from(luminanceOf(pixels))).toEqual([54, 182, 18, 0])
  })

  it('un gris neutro vuelve como el mismo código', () => {
    expect(luminanceOf(flat(0, 0, 0))[0]).toBe(0)
    expect(luminanceOf(flat(128, 128, 128))[0]).toBe(128)
    // El truncado a entero pierde a lo sumo un nivel, y todos los consumidores
    // leen diferencias entre vecinos, donde un desplazamiento constante se va.
    expect(luminanceOf(flat(255, 255, 255))[0]).toBe(254)
  })

  it('no lineariza: un gris medio se queda en el código medio y no baja al 55 de la luz lineal', () => {
    expect(luminanceOf(flat(128, 128, 128))[0]).toBe(128)
  })

  it('ignora el canal alfa: un píxel transparente pesa lo mismo que uno opaco', () => {
    const opaque = raster(1, 1, [[200, 100, 50]])
    const transparent: PixelRaster = {
      data: Uint8ClampedArray.from([...opaque.data.slice(0, 3), 0]),
      width: 1,
      height: 1,
    }
    expect(Array.from(luminanceOf(transparent))).toEqual(Array.from(luminanceOf(opaque)))
  })

  it('no toca el ráster: el color sobrevive para el histograma y el balance de blancos', () => {
    // Es la razón de existir del módulo: el mismo ráster decodificado una vez
    // sirve al detector de bordes, que solo quiere luminancia, y al ajuste de
    // color, que necesita los tres canales.
    const pixels = raster(2, 1, [
      [220, 200, 150],
      [40, 60, 90],
    ])
    const before = Array.from(pixels.data)
    luminanceOf(pixels)
    expect(Array.from(pixels.data)).toEqual(before)
  })

  it('lee width · height píxeles y no lo que quepa en el búfer', () => {
    // Un ráster de dos píxeles dentro de un búfer de cuatro: lo que manda es el
    // tamaño declarado.
    const wide = raster(4, 1, [[255, 255, 255]])
    const declared: PixelRaster = { data: wide.data, width: 2, height: 1 }
    expect(luminanceOf(declared)).toHaveLength(2)
  })
})
