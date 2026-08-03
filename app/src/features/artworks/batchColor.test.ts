import { beforeEach, describe, expect, it } from 'vitest'
import {
  INITIAL_BATCH,
  forgetBatch,
  readBatch,
  readBatchColor,
  rememberBatchColor,
  saveBatch,
} from './batch'
import { NO_COLOR, buildColorLuts, normalizeColor } from '../../lib/imageColor'

/**
 * «El mismo color que la anterior» (RF-414): the light of the batch, remembered between
 * photographs.
 *
 * In its own file and not inside `batch.test.ts` because it is its own feature with its
 * own key, and above all because the case that matters — the capture page rewriting the
 * batch while the picker has just written a colour — needs the two halves side by side.
 */

/** Fake storage, to not depend on the test environment having one. */
function fakeStorage(initial: Record<string, string> = {}): Storage {
  const data = new Map(Object.entries(initial))
  return {
    get length() {
      return data.size
    },
    clear: () => data.clear(),
    getItem: (k) => data.get(k) ?? null,
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (k) => void data.delete(k),
    setItem: (k, v) => void data.set(k, v),
  }
}

/** Storage that always fails, like private browsing or exhausted quota. */
const brokenStorage: Storage = {
  length: 0,
  clear: () => {
    throw new Error('no access')
  },
  getItem: () => {
    throw new Error('no access')
  },
  key: () => {
    throw new Error('no access')
  },
  removeItem: () => {
    throw new Error('no access')
  },
  setItem: () => {
    throw new Error('no access')
  },
}

let storage: Storage

beforeEach(() => {
  storage = fakeStorage()
})

describe('el color de la tanda (RF-414)', () => {
  it('sin nada guardado no hay ajuste que repetir', () => {
    expect(readBatchColor(storage)).toBeNull()
  })

  it('sobrevive a la recarga con los mismos números', () => {
    rememberBatchColor({ temperature: 18, tint: -6, exposure: 0.5, gamma: 1.1 }, storage)
    const back = readBatchColor(storage)
    expect(back?.temperature).toBe(18)
    expect(back?.tint).toBe(-6)
    expect(back?.exposure).toBe(0.5)
    expect(back?.gamma).toBe(1.1)
  })

  it('lo que vuelve produce exactamente la misma tabla de 256 entradas', () => {
    // The point of carrying the adjustment is that the second photograph comes out the
    // same colour as the first. Comparing the parameters would pass with a value the
    // database could not store; comparing the tables is comparing the pixels.
    const color = { temperature: -25, tint: 11, exposure: -0.6667, blackPoint: 9, gamma: 0.85 }
    rememberBatchColor(color, storage)
    const stored = readBatchColor(storage)
    expect(stored).not.toBeNull()
    // Against the CANONICAL form of what went in — the one the row would store — because
    // the finger's 0,6667 EV becomes the 0,67 of `numeric(3,2)` on the way through, here
    // as in the database. Measured: that particular quantization moves none of the 256
    // entries, so it is not what this test would catch; what it catches is a parameter
    // lost or changed by the round trip through JSON.
    expect(buildColorLuts(stored)).toEqual(buildColorLuts(normalizeColor(color)))
    // And it is not two identity tables being compared, which is how this kind of test
    // passes while verifying nothing.
    expect(buildColorLuts(stored)).not.toEqual(buildColorLuts(NO_COLOR))
  })

  it('un ajuste neutro no es una luz: se borra en vez de guardarse', () => {
    rememberBatchColor({ temperature: 18 }, storage)
    rememberBatchColor(NO_COLOR, storage)
    expect(readBatchColor(storage)).toBeNull()
  })

  it('quitar la corrección de una foto retira la oferta', () => {
    // «Volver al original» hands a neutral adjustment over here, and the next photograph
    // must not be offered a light that was explicitly abandoned.
    rememberBatchColor({ temperature: 18 }, storage)
    rememberBatchColor(null, storage)
    expect(readBatchColor(storage)).toBeNull()
  })

  it('un valor imposible se lee como identidad en ese parámetro y no como el tope', () => {
    // Same rule as `normalizeColor` and the same rule as reading a row: of the readings
    // available, the identity is the one that shows the photograph as it is.
    storage.setItem('catalogador.batch-color', JSON.stringify({ temperature: 900, tint: 5 }))
    const back = readBatchColor(storage)
    expect(back?.temperature).toBe(0)
    expect(back?.tint).toBe(5)
  })

  it('un valor corrupto no impide fotografiar', () => {
    storage.setItem('catalogador.batch-color', 'no es json{')
    expect(readBatchColor(storage)).toBeNull()
  })

  it('sin almacenamiento, ni al leer ni al escribir se lanza nada', () => {
    expect(() => rememberBatchColor({ temperature: 4 }, brokenStorage)).not.toThrow()
    expect(readBatchColor(brokenStorage)).toBeNull()
    expect(readBatchColor(undefined)).toBeNull()
  })
})

describe('el color de la tanda vive al lado del resto del estado, no dentro (RF-414)', () => {
  it('guardar la tanda NO pisa el color que acaba de escribir el selector de fotos', () => {
    // The reason the colour is a sibling key. The capture page keeps the batch in React
    // state and rewrites the whole stored object whenever that state changes; the picker
    // writes the colour from a different component with no way to tell the page. Inside
    // `Batch`, the next tap on any batch field would wipe the light of the batch.
    rememberBatchColor({ temperature: 22 }, storage)
    saveBatch({ ...INITIAL_BATCH, carried: { ...INITIAL_BATCH.carried, technique: 'Óleo' } }, storage)
    expect(readBatchColor(storage)?.temperature).toBe(22)
    expect(readBatch(storage).carried.technique).toBe('Óleo')
  })

  it('cerrar la tanda olvida también la luz', () => {
    // The one deliberate gesture that says «he terminado con esta estantería». Carrying
    // an afternoon's colour into another room and another day is exactly the inherited
    // data nobody asked for.
    saveBatch(INITIAL_BATCH, storage)
    rememberBatchColor({ temperature: 22 }, storage)
    forgetBatch(storage)
    expect(readBatchColor(storage)).toBeNull()
    expect(readBatch(storage)).toEqual(INITIAL_BATCH)
  })
})
