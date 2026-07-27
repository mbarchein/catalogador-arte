import { beforeEach, describe, expect, it } from 'vitest'
import { INITIAL_BATCH, saveBatch, readBatch, batchConfigured, forgetBatch, type Batch } from './batch'

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

describe('batch persistence', () => {
  it('returns the initial batch when nothing is stored', () => {
    expect(readBatch(storage)).toEqual(INITIAL_BATCH)
  })

  it('keeps the configuration between reloads', () => {
    // The real case: the phone screen locks in the storage room and one comes
    // back.
    const batch: Batch = {
      fixed: { artist: 'RUIZ_CAMPINS', artworkType: 'Dibujo' },
      carried: {
        date: { year: 1968, approximate: true, endYear: null, unconfirmed: true },
        technique: 'Carboncillo sobre papel',
        location: 'edificio b, habitacion 4',
      },
    }
    saveBatch(batch, storage)
    expect(readBatch(storage)).toEqual(batch)
  })

  it('forgets the batch when it closes', () => {
    saveBatch(INITIAL_BATCH, storage)
    forgetBatch(storage)
    expect(readBatch(storage)).toEqual(INITIAL_BATCH)
  })
})

describe('resilience to foreign data', () => {
  it('does not break with a corrupt value', () => {
    expect(readBatch(fakeStorage({ 'catalogador.lote': 'no es json{' }))).toEqual(INITIAL_BATCH)
  })

  it('does not break with a shape from another version', () => {
    // A batch stored by a previous version of the application (including the
    // Spanish-keyed shape) cannot prevent cataloging today.
    const old = JSON.stringify({ fijos: { artista: 'ROTILI', tipoObra: 'Pintura' } })
    expect(readBatch(fakeStorage({ 'catalogador.lote': old }))).toEqual(INITIAL_BATCH)
  })

  it('discards a fund that does not exist instead of trusting it', () => {
    const odd = JSON.stringify({ fixed: { artist: 'PICASSO', artworkType: 'Pintura' } })
    expect(readBatch(fakeStorage({ 'catalogador.lote': odd })).fixed.artist).toBe('ROTILI')
  })

  it('keeps the TEST rehearsal fund, which does exist (RF-202)', () => {
    const stored = JSON.stringify({ fixed: { artist: 'TEST', artworkType: 'Pintura' } })
    expect(readBatch(fakeStorage({ 'catalogador.lote': stored })).fixed.artist).toBe('TEST')
  })

  it('discards wrong types inside the date', () => {
    const odd = JSON.stringify({
      carried: { date: { year: '1978', approximate: 'sí', endYear: [] } },
    })
    expect(readBatch(fakeStorage({ 'catalogador.lote': odd })).carried.date).toEqual({
      year: null,
      approximate: false,
      endYear: null,
      unconfirmed: false,
    })
  })

  it('keeps working with no storage available', () => {
    // Private browsing: cataloging goes on, only persistence is lost.
    expect(() => saveBatch(INITIAL_BATCH, brokenStorage)).not.toThrow()
    expect(() => forgetBatch(brokenStorage)).not.toThrow()
    expect(readBatch(brokenStorage)).toEqual(INITIAL_BATCH)
  })
})

describe('batchConfigured', () => {
  it('requires an artwork type before starting to capture', () => {
    expect(batchConfigured(INITIAL_BATCH)).toBe(false)
    expect(
      batchConfigured({
        ...INITIAL_BATCH,
        fixed: { artist: 'ROTILI', artworkType: 'Pintura' },
      }),
    ).toBe(true)
  })

  it('does not accept a type made only of spaces', () => {
    expect(
      batchConfigured({ ...INITIAL_BATCH, fixed: { artist: 'ROTILI', artworkType: '   ' } }),
    ).toBe(false)
  })
})
