import { describe, expect, it } from 'vitest'
import {
  MAX_BAND_PIXELS,
  bandRows,
  checkNotMaster,
  colorLevelPixels,
  correctedColumns,
  correctedCopyFrom,
  correctedPath,
  levelTables,
  planWarpBands,
  probePoints,
  renderCorrectedCopy,
  warpBand,
  warpBandBox,
  type CorrectedSurface,
} from './imageRender'
import { buildColorLuts } from './imageColor'
import { NO_EDIT } from './imageEdits'
import { homographyFromUnitSquare, type Corners } from './perspective'

/**
 * What can be tested of the renderer.
 *
 * This module draws, and the test environment has neither `canvas` nor
 * `createImageBitmap`. So what is verified here is everything that is NOT drawing,
 * which turned out to be most of what can go wrong:
 *
 *  - the colour table over the pixels of a level, and the ORDER of the clipping
 *    count, which is the part that silently reports zero if it is done afterwards;
 *  - the bilinear warp of a strip, which is a pure function over plain arrays, and
 *    the invariant that matters for the full-resolution copy: warping in strips gives
 *    the same pixels as warping in one go;
 *  - the plan of strips: that it covers every row and that each strip's patch really
 *    contains every sample that strip is going to ask for;
 *  - **the policy of the corrected copy**, including the one failure this whole
 *    feature is built around: a canvas that comes out blank without throwing. That is
 *    why the surface is an interface — a fake one can fail that way, and a real one
 *    could only be watched failing on a phone.
 *
 * What remains a browser check is listed at the bottom of this file.
 */

/* ------------------------------------------------------------------- helpers */

/** A raster with every pixel at the same code, opaque. */
function flatRaster(width: number, height: number, code: number) {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < width * height; i += 1) {
    data[i * 4] = code
    data[i * 4 + 1] = code
    data[i * 4 + 2] = code
    data[i * 4 + 3] = 255
  }
  return { data, width, height }
}

/** A raster with a different code per pixel, so a copy can be told from a shift. */
function gradientRaster(width: number, height: number) {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const at = (y * width + x) * 4
      data[at] = 10 + x * 3
      data[at + 1] = 40 + y * 5
      data[at + 2] = 90
      data[at + 3] = 255
    }
  }
  return { data, width, height }
}

const FULL_CORNERS: Corners = {
  nw: { x: 0, y: 0 },
  ne: { x: 1, y: 0 },
  se: { x: 1, y: 1 },
  sw: { x: 0, y: 1 },
}

/** A keystone: the top edge narrower than the bottom, which is the real case. */
const KEYSTONE: Corners = {
  nw: { x: 0.18, y: 0.06 },
  ne: { x: 0.82, y: 0.11 },
  se: { x: 0.95, y: 0.9 },
  sw: { x: 0.05, y: 0.94 },
}

function homographyOf(corners: Corners) {
  const homography = homographyFromUnitSquare(corners)
  if (!homography) throw new Error('las esquinas del test no forman un cuadrilátero')
  return homography
}

/* ------------------------------------------------- the table over the levels */

describe('RF-414: la tabla de color al codificar cada nivel', () => {
  it('no construye ninguna tabla cuando el ajuste no hace nada', () => {
    // The point is the cost: with no table there is no `getImageData` and no pass
    // over the pixels, so una foto solo girada se codifica como antes del color.
    expect(levelTables(NO_EDIT)).toBeNull()
    expect(levelTables({ rotation: 90, crop: null })).toBeNull()
  })

  it('tampoco cuando el color se revisó y se dejó igual: eso no cambia ningún píxel', () => {
    expect(levelTables({ rotation: 0, crop: null, color: { source: 'REVIEWED_UNCHANGED' } })).toBeNull()
  })

  it('y cuando lo hace, es exactamente la tabla de imageColor: una sola definición', () => {
    const color = { temperature: 24, exposure: 0.5, gamma: 1.2 }
    const mine = levelTables({ rotation: 0, crop: null, color })
    const canonical = buildColorLuts(color)
    expect(mine).not.toBeNull()
    expect(Array.from(mine!.r)).toEqual(Array.from(canonical.r))
    expect(Array.from(mine!.g)).toEqual(Array.from(canonical.g))
    expect(Array.from(mine!.b)).toEqual(Array.from(canonical.b))
    expect(mine!.gray).toBe(canonical.gray)
  })

  it('el paso de blanco y negro viaja con la tabla', () => {
    expect(levelTables({ rotation: 0, crop: null, color: { gray: true } })?.gray).toBe(true)
  })

  it('aplica la tabla a todos los píxeles y no toca el alfa', () => {
    const pixels = flatRaster(4, 3, 100)
    const luts = buildColorLuts({ exposure: 1 })
    colorLevelPixels(pixels, luts)
    const expected = luts.r[100]
    for (let i = 0; i < 12; i += 1) {
      expect(pixels.data[i * 4]).toBe(expected)
      expect(pixels.data[i * 4 + 3]).toBe(255)
    }
  })

  it('sin tabla no toca nada y no mide nada: nulo es «nadie lo midió»', () => {
    const pixels = flatRaster(2, 2, 77)
    expect(colorLevelPixels(pixels, null)).toBeNull()
    expect(Array.from(pixels.data.slice(0, 4))).toEqual([77, 77, 77, 255])
  })

  /**
   * The order test, and the reason this function exists instead of two calls at the
   * call site. `clippingOf` only counts what THIS table crushed — a pixel already at
   * pure black does not count — so measuring after the table had been applied in
   * place would exclude precisely the pixels it just crushed, and the worst
   * correction of all would be stored as «nothing was lost».
   */
  it('cuenta lo empastado ANTES de aplicar la tabla, o el ajuste que más destruye contaría cero', () => {
    const pixels = flatRaster(10, 10, 10)
    const luts = buildColorLuts({ blackPoint: 64 })
    const clipping = colorLevelPixels(pixels, luts)
    expect(clipping).not.toBeNull()
    expect(clipping!.count).toBe(100)
    expect(clipping!.low).toBe(100)
    // 99,99 and not 100: the ceiling of the `numeric(4,2)` the column is, which
    // imageHistogram.ts saturates so the row is not REFUSED at the end of a
    // correction that took ten minutes.
    expect(clipping!.lowPercent).toBe(99.99)
    // And the pixels really did get crushed: the count is not describing a table
    // that was never applied.
    expect(pixels.data[0]).toBe(0)
  })

  it('la tabla identidad no empasta ni quema nada', () => {
    const pixels = gradientRaster(8, 8)
    const clipping = colorLevelPixels(pixels, buildColorLuts(null))
    expect(clipping!.low).toBe(0)
    expect(clipping!.high).toBe(0)
  })
})

/* ------------------------------------------------------------------ the warp */

describe('RF-420: el enderezado por franjas', () => {
  it('con el cuadrilátero completo devuelve la fotografía tal cual', () => {
    const patch = gradientRaster(8, 6)
    const destination = new Uint8ClampedArray(8 * 6 * 4)
    warpBand({
      destination,
      out: { width: 8, height: 6 },
      from: 0,
      rows: 6,
      homography: homographyOf(FULL_CORNERS),
      rotated: { width: 8, height: 6 },
      patch: { data: patch.data, width: 8, height: 6, originX: 0, originY: 0, scale: 1 },
    })
    for (let i = 0; i < 8 * 6; i += 1) {
      expect(destination[i * 4], `píxel ${i}`).toBe(patch.data[i * 4])
      expect(destination[i * 4 + 1]).toBe(patch.data[i * 4 + 1])
      expect(destination[i * 4 + 2]).toBe(patch.data[i * 4 + 2])
      expect(destination[i * 4 + 3]).toBe(255)
    }
  })

  /**
   * The invariant the full-resolution copy rests on. The reduced derivative asks for
   * one strip covering everything and the corrected copy asks for as many as the
   * device's memory allows: if the two answers differed, the file sent to a print
   * shop would not be the photograph on screen — and the way it would show is a seam
   * across the image, or nothing visible at all.
   */
  it('en franjas da exactamente los mismos píxeles que de una vez', () => {
    const patch = gradientRaster(40, 30)
    const homography = homographyOf(KEYSTONE)
    const out = { width: 24, height: 18 }
    const source = { data: patch.data, width: 40, height: 30, originX: 0, originY: 0, scale: 1 }
    const rotated = { width: 40, height: 30 }

    const whole = new Uint8ClampedArray(out.width * out.height * 4)
    warpBand({ destination: whole, out, from: 0, rows: out.height, homography, rotated, patch: source })

    const banded = new Uint8ClampedArray(out.width * out.height * 4)
    for (const [from, rows] of [
      [0, 5],
      [5, 1],
      [6, 7],
      [13, 5],
    ] as const) {
      const strip = new Uint8ClampedArray(out.width * rows * 4)
      warpBand({ destination: strip, out, from, rows, homography, rotated, patch: source })
      banded.set(strip, from * out.width * 4)
    }
    expect(Array.from(banded)).toEqual(Array.from(whole))
  })

  it('lo que cae fuera del recorte sale blanco y opaco, nunca un agujero negro', () => {
    // A corner dragged outside the photograph, which is the only way to straighten
    // the five shots of the catalog with a side out of frame.
    const patch = flatRaster(20, 20, 30)
    const outside: Corners = {
      nw: { x: -0.2, y: -0.2 },
      ne: { x: 1.2, y: -0.2 },
      se: { x: 1.2, y: 1.2 },
      sw: { x: -0.2, y: 1.2 },
    }
    const out = { width: 20, height: 20 }
    const destination = new Uint8ClampedArray(out.width * out.height * 4)
    warpBand({
      destination,
      out,
      from: 0,
      rows: out.height,
      homography: homographyOf(outside),
      rotated: { width: 20, height: 20 },
      patch: { data: patch.data, width: 20, height: 20, originX: 0, originY: 0, scale: 1 },
    })
    // The very first pixel comes from outside the patch.
    expect(Array.from(destination.slice(0, 4))).toEqual([255, 255, 255, 255])
    // And every pixel is opaque: a transparent one would sample black wherever it
    // was composited.
    for (let i = 0; i < out.width * out.height; i += 1) {
      expect(destination[i * 4 + 3], `alfa del píxel ${i}`).toBe(255)
    }
  })
})

describe('RF-420: el plan de franjas y el trozo de máster que cada una necesita', () => {
  const rotated = { width: 4000, height: 3000 }
  const out = { width: 40, height: 30 }
  const homography = homographyOf(KEYSTONE)

  it('una franja mide al menos una fila, aunque la imagen sea absurdamente ancha', () => {
    expect(bandRows(9248)).toBeGreaterThan(0)
    expect(bandRows(50_000_000)).toBe(1)
    expect(bandRows(Number.NaN)).toBeGreaterThan(0)
  })

  it('las franjas cubren todas las filas, en orden y sin huecos', () => {
    const plan = planWarpBands({ width: 2000, height: 1500 }, homography, rotated)
    expect(plan).not.toBeNull()
    let next = 0
    for (const band of plan!) {
      expect(band.from).toBe(next)
      expect(band.rows).toBeGreaterThan(0)
      next += band.rows
    }
    expect(next).toBe(1500)
  })

  /**
   * The one that would bite. A strip of the OUTPUT does not come from a strip of the
   * photograph: with a keystone correction it comes from a wedge. If the patch were
   * computed as «the same rows, over there», the samples that fell outside it would
   * be painted white — a white wedge across the artwork, in the file that goes to the
   * print shop and nowhere else.
   */
  it('el trozo de máster de cada franja contiene TODAS las muestras que esa franja pide', () => {
    const plan = planWarpBands(out, homography, rotated)
    expect(plan).not.toBeNull()
    for (const band of plan!) {
      for (let row = 0; row < band.rows; row += 1) {
        const v = (band.from + row + 0.5) / out.height
        for (let x = 0; x < out.width; x += 1) {
          const u = (x + 0.5) / out.width
          const w = homography[6]! * u + homography[7]! * v + homography[8]!
          const px = ((homography[0]! * u + homography[1]! * v + homography[2]!) / w) * rotated.width
          const py = ((homography[3]! * u + homography[4]! * v + homography[5]!) / w) * rotated.height
          // The same two lines `warpBand` computes, and the same window it whitens
          // anything outside: if a sample lands out here, that pixel comes out white.
          const sx = px - band.box.x - 0.5
          const sy = py - band.box.y - 0.5
          expect(sx, `franja ${band.from}, muestra en x`).toBeGreaterThanOrEqual(0)
          expect(sx, `franja ${band.from}, muestra en x`).toBeLessThanOrEqual(band.box.width - 1)
          expect(sy, `franja ${band.from}, muestra en y`).toBeGreaterThanOrEqual(0)
          expect(sy, `franja ${band.from}, muestra en y`).toBeLessThanOrEqual(band.box.height - 1)
        }
      }
    }
  })

  /**
   * And the reason the split is by halves and not by a fixed size: the patch of a
   * strip is **taller than the strip**, because a horizontal line of the straightened
   * output maps to a slanted line of the photograph. Here one single row of a 1500 px
   * output already needs a patch of some four hundred thousand pixels.
   */
  it('parte la franja hasta que su trozo cabe en el presupuesto', () => {
    const budget = 900_000
    const plan = planWarpBands({ width: 2000, height: 1500 }, homography, rotated, budget)
    expect(plan).not.toBeNull()
    expect(plan!.length).toBeGreaterThan(1)
    for (const band of plan!) {
      if (band.rows > 1) expect(band.box.width * band.box.height).toBeLessThanOrEqual(budget)
    }
  })

  it('y arranca de la franja más grande que cabe, para no repintar el máster cien veces', () => {
    const few = planWarpBands({ width: 2000, height: 1500 }, homography, rotated, 4_000_000)!
    const many = planWarpBands({ width: 2000, height: 1500 }, homography, rotated, 900_000)!
    expect(few.length).toBeLessThan(many.length)
  })

  // No silent reduction of the resolution: when even one row does not fit, the plan
  // says so and the copy stays pending.
  it('se rinde en vez de recortar la resolución cuando ni una fila cabe', () => {
    expect(planWarpBands({ width: 2000, height: 1500 }, homography, rotated, 10)).toBeNull()
  })

  it('el trozo puede empezar fuera de la fotografía, que es donde vive una esquina arrastrada', () => {
    const box = warpBandBox(0, 4, { width: 20, height: 20 }, homographyOf({
      nw: { x: -0.2, y: -0.2 },
      ne: { x: 1.2, y: -0.2 },
      se: { x: 1.2, y: 1.2 },
      sw: { x: -0.2, y: 1.2 },
    }), { width: 20, height: 20 })
    expect(box).not.toBeNull()
    expect(box!.x).toBeLessThan(0)
  })

  it('el presupuesto de una franja está por debajo de lo que un móvil puede sostener', () => {
    // 4 MB of pixels are 16 MB of array. What is being avoided is the whole master's 256 MB,
    // measured and documented in this same file.
    expect(MAX_BAND_PIXELS).toBeLessThan(64_000_000 / 4)
  })
})

/* ------------------------------------------------- the corrected copy: policy */

type ReadMode = 'PHOTO' | 'BLANK' | 'WHITE' | 'UNREADABLE'

interface FakeOptions {
  width?: number
  height?: number
  reads?: ReadMode
  prime?: boolean
  paint?: boolean
  color?: boolean
  blob?: Blob | null
}

/**
 * A surface that can fail the way a real one fails.
 *
 * `BLANK` is the case ADR-010 is written around: the device accepted a canvas bigger
 * than it can hold, nothing threw, and every pixel reads as transparent black.
 * `WHITE` is the same disaster one step later — the fill landed and the drawing did
 * not.
 */
function fakeSurface(options: FakeOptions = {}) {
  const calls: string[] = []
  let painted = false
  const surface: CorrectedSurface = {
    width: options.width ?? 4000,
    height: options.height ?? 3000,
    prime() {
      calls.push('prime')
      return options.prime !== false
    },
    read() {
      calls.push('read')
      const mode = options.reads ?? 'PHOTO'
      if (mode === 'UNREADABLE') return null
      if (mode === 'BLANK') return [0, 0, 0, 0]
      if (mode === 'WHITE') return [255, 255, 255, 255]
      return painted ? [12, 34, 56, 255] : [255, 255, 255, 255]
    },
    paint() {
      calls.push('paint')
      if (options.paint === false) return false
      painted = true
      return true
    },
    color() {
      calls.push('color')
      return options.color !== false
    },
    async encode() {
      calls.push('encode')
      return options.blob === undefined ? new Blob(['bytes']) : options.blob
    },
  }
  return { surface, calls }
}

describe('RF-420: la copia corregida se comprueba antes de subirla', () => {
  it('la genera cuando el dispositivo puede', async () => {
    const { surface, calls } = fakeSurface({ width: 1200, height: 900 })
    const copy = await correctedCopyFrom(surface)
    expect(copy.status).toBe('READY')
    if (copy.status !== 'READY') return
    expect(copy.width).toBe(1200)
    expect(copy.height).toBe(900)
    expect(copy.blob.size).toBeGreaterThan(0)
    expect(calls).toContain('encode')
  })

  /**
   * **The test of this task.** The area of a canvas is limited by the device and
   * beyond it the canvas comes out blank without throwing anything: there is no
   * exception to catch. What must not happen is a valid JPEG of the right size, with
   * the right path in the row, completely white — nobody would find out until the
   * print shop opened it.
   */
  it('cuando el lienzo sale en blanco queda PENDIENTE y no se codifica ni se sube nada', async () => {
    const { surface, calls } = fakeSurface({ reads: 'BLANK' })
    const copy = await correctedCopyFrom(surface)
    expect(copy.status).toBe('PENDING')
    expect(calls).not.toContain('encode')
    // Not even drawn: the probe comes first, on purpose, so a device that cannot hold
    // the canvas does not spend a minute of the cataloger's time finding out.
    expect(calls).not.toContain('paint')
  })

  it('y tampoco se sube si el dibujo no ha llegado a los píxeles', async () => {
    const { surface, calls } = fakeSurface({ reads: 'WHITE' })
    const copy = await correctedCopyFrom(surface)
    expect(copy.status).toBe('PENDING')
    expect(calls).toContain('paint')
    expect(calls).not.toContain('encode')
  })

  it('un lienzo que no se puede leer también queda pendiente', async () => {
    const copy = await correctedCopyFrom(fakeSurface({ reads: 'UNREADABLE' }).surface)
    expect(copy.status).toBe('PENDING')
  })

  it('si el lienzo no se puede preparar, no se dibuja nada', async () => {
    const { surface, calls } = fakeSurface({ prime: false })
    expect((await correctedCopyFrom(surface)).status).toBe('PENDING')
    expect(calls).not.toContain('paint')
  })

  it('si el dibujo falla, no se codifica', async () => {
    const { surface, calls } = fakeSurface({ paint: false })
    expect((await correctedCopyFrom(surface)).status).toBe('PENDING')
    expect(calls).not.toContain('encode')
  })

  it('si el color falla, no se codifica: media corrección no se manda a una imprenta', async () => {
    const { surface, calls } = fakeSurface({ color: false })
    expect((await correctedCopyFrom(surface)).status).toBe('PENDING')
    expect(calls).not.toContain('encode')
  })

  it('un codificador que devuelve nada, o cero bytes, deja la copia pendiente', async () => {
    expect((await correctedCopyFrom(fakeSurface({ blob: null }).surface)).status).toBe('PENDING')
    expect((await correctedCopyFrom(fakeSurface({ blob: new Blob([]) }).surface)).status).toBe(
      'PENDING',
    )
  })

  /**
   * The other silent reduction: a browser that CLAMPS the canvas instead of refusing
   * it. The copy would then come out perfect and smaller than the master, and nothing
   * would say so — which is the half of RF-420 that is easiest to lose.
   */
  it('un lienzo que el navegador ha recortado queda pendiente: la resolución no baja en silencio', async () => {
    const { surface, calls } = fakeSurface({ width: 4096, height: 4096 })
    const copy = await correctedCopyFrom(surface, { width: 9248, height: 6936 })
    expect(copy.status).toBe('PENDING')
    if (copy.status === 'PENDING') expect(copy.reason).toContain('9248 × 6936')
    expect(calls).toEqual([])
  })

  it('y con el tamaño esperado igual al del lienzo sigue adelante', async () => {
    const { surface } = fakeSurface({ width: 1200, height: 900 })
    expect((await correctedCopyFrom(surface, { width: 1200, height: 900 })).status).toBe('READY')
  })

  it('un tamaño imposible se rechaza sin tocar el lienzo', async () => {
    const { surface, calls } = fakeSurface({ width: 0, reads: 'PHOTO' })
    expect((await correctedCopyFrom(surface)).status).toBe('PENDING')
    expect(calls).toEqual([])
  })

  /**
   * «Nunca una página en blanco» applied to a failure: the row records that the copy
   * is missing, and the sentence has to say what is safe. The master is the one thing
   * the cataloger will want to hear about.
   */
  it('toda razón de pendiente dice el tamaño, que se genera después y que el máster está intacto', async () => {
    for (const options of [
      { reads: 'BLANK' as ReadMode },
      { reads: 'WHITE' as ReadMode },
      { prime: false },
      { paint: false },
      { color: false },
      { blob: null },
    ]) {
      const copy = await correctedCopyFrom(fakeSurface({ ...options, width: 4000, height: 3000 }).surface)
      expect(copy.status).toBe('PENDING')
      if (copy.status !== 'PENDING') continue
      expect(copy.reason.length).toBeGreaterThan(20)
      expect(copy.reason).toContain('4000 × 3000')
      expect(copy.reason).toContain('máster')
      expect(copy.reason).toContain('pendiente')
    }
  })

  it('el sondeo mira las cuatro esquinas, y ninguna cae fuera del lienzo', () => {
    const points = probePoints(4000, 3000)
    expect(points).toContainEqual({ x: 0, y: 0 })
    // The far corner is where a device that allocated less than it promised fails.
    expect(points).toContainEqual({ x: 3999, y: 2999 })
    for (const at of points) {
      expect(at.x).toBeGreaterThanOrEqual(0)
      expect(at.y).toBeGreaterThanOrEqual(0)
      expect(at.x).toBeLessThan(4000)
      expect(at.y).toBeLessThan(3000)
    }
    // And it answers for a one-pixel surface without asking for pixel −1.
    for (const at of probePoints(1, 1)) expect(at).toEqual({ x: 0, y: 0 })
  })

  it('sin ninguna corrección no hay copia, y no se decodifica nada para averiguarlo', async () => {
    // No `createImageBitmap` in this environment: if it were reached, this would
    // throw. Answering without decoding is the behaviour, not an accident.
    expect(await renderCorrectedCopy(new Blob(['x']), NO_EDIT)).toEqual({ status: 'NOT_NEEDED' })
    expect(
      await renderCorrectedCopy(new Blob(['x']), {
        rotation: 0,
        crop: { x: 0, y: 0, width: 1, height: 1 },
      }),
    ).toEqual({ status: 'NOT_NEEDED' })
    // Reviewed and left alone changes no pixel either: no copy, and no upload of a
    // duplicate of the master.
    expect(
      await renderCorrectedCopy(new Blob(['x']), {
        rotation: 0,
        crop: null,
        color: { source: 'REVIEWED_UNCHANGED' },
      }),
    ).toEqual({ status: 'NOT_NEEDED' })
  })
})

/* --------------------------------------------- the corrected copy: the row */

describe('RF-420: las tres columnas de la copia corregida', () => {
  it('no hace falta: todo nulo y nada pendiente', () => {
    expect(correctedColumns({ status: 'NOT_NEEDED' })).toEqual({
      corrected_path: null,
      corrected_bytes: null,
      corrected_pending: false,
    })
  })

  it('pendiente: sin ruta, y por tanto sin violar images_corrected_pending_exclusive', () => {
    const columns = correctedColumns({ status: 'PENDING', reason: 'lo que sea' })
    expect(columns.corrected_pending).toBe(true)
    expect(columns.corrected_path).toBeNull()
    expect(columns.corrected_bytes).toBeNull()
  })

  it('subida: ruta y tamaño juntos, que es lo que exige images_corrected_copy_pair', () => {
    const columns = correctedColumns({
      status: 'UPLOADED',
      path: 'AR-0001/AR-0001_ab12cd34_corrected.jpg',
      bytes: 5_242_880,
    })
    expect(columns).toEqual({
      corrected_path: 'AR-0001/AR-0001_ab12cd34_corrected.jpg',
      corrected_bytes: 5_242_880,
      corrected_pending: false,
    })
  })

  it('el tamaño nunca es cero ni negativo: images_corrected_bytes_positive', () => {
    expect(correctedColumns({ status: 'UPLOADED', path: 'x_corrected.jpg', bytes: 0 }).corrected_bytes)
      .toBeGreaterThan(0)
    expect(
      correctedColumns({ status: 'UPLOADED', path: 'x_corrected.jpg', bytes: -3 }).corrected_bytes,
    ).toBeGreaterThan(0)
  })
})

/**
 * §0.1 of the specification, and the only rule of this module that is not about
 * pixels: the master is inalterable. The realistic way to break it is not a
 * malicious update, it is deriving the name of the corrected copy from the master's
 * and having them coincide one day.
 */
describe('RF-420 y ADR-002: la ruta de la copia nunca es la del máster', () => {
  it('se llama como una copia corregida y no como un máster', () => {
    const path = correctedPath('AR-0001', 'AR-0001/AR-0001_zzzz1111_master.jpg')
    expect(path.startsWith('AR-0001/AR-0001_')).toBe(true)
    expect(path.endsWith('_corrected.jpg')).toBe(true)
    expect(path).not.toContain('_master')
  })

  it('cada llamada da una ruta nueva: reeditar no sobrescribe la anterior', () => {
    const first = correctedPath('AR-0001', null)
    const second = correctedPath('AR-0001', null)
    expect(first).not.toBe(second)
  })

  it('se niega cuando la ruta calculada sería la del máster', () => {
    expect(() =>
      correctedPath('AR-0001', 'AR-0001/AR-0001_ab12cd34_corrected.jpg', 'ab12cd34'),
    ).toThrow(/máster/)
  })

  it('se niega ante cualquier ruta con forma de máster, aunque la fila no lo sepa', () => {
    expect(() => checkNotMaster('AR-0001/AR-0001_ab12cd34_master.jpg')).toThrow(/máster/)
    expect(() => checkNotMaster('AR-0001/AR-0001_ab12cd34_master.jpg', null)).toThrow(/máster/)
  })

  it('y ante una ruta que no es la de una copia corregida', () => {
    expect(() => checkNotMaster('AR-0001/AR-0001_ab12cd34_der.webp')).toThrow(/copia corregida/)
  })

  it('acepta la ruta buena', () => {
    expect(() =>
      checkNotMaster('AR-0001/AR-0001_ab12cd34_corrected.jpg', 'AR-0001/AR-0001_zzzz_master.jpg'),
    ).not.toThrow()
  })

  it('sin id de catalogación no se nombra nada, y lo dice sin hablar del máster', () => {
    expect(() => correctedPath('', null)).toThrow(/id de catalogación/)
  })
})

/**
 * What is left as a BROWSER check, written down instead of pretended:
 *
 *  - that `encodeLevel` really reads back the level canvas and writes the coloured
 *    pixels into it (`getImageData` / `putImageData`), and that the two levels come
 *    out of the same table object;
 *  - that the rotate-and-crop path is still a single `drawImage` at full resolution,
 *    and that no path ever calls `getImageData` on a canvas the size of the master;
 *  - that a real oversized canvas is caught by the probe on the device it fails on,
 *    which is the one thing a fake surface can only imitate;
 *  - that `toBlob` with `image/jpeg` and 0,92 is honoured, and what the file weighs;
 *  - that the corrected copy of a straightened photograph comes out visually
 *    identical to the consultation copy, seams included.
 */
