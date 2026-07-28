import { describe, expect, it } from 'vitest'
import {
  filterVocabulary,
  findEquivalent,
  fuzzyMatch,
  fuzzyRank,
  normalizeForSearch,
} from './vocabulary'

const TYPES = ['Dibujo', 'Escultura', 'Óleo sobre tabla', 'Pintura', 'Técnica mixta']

describe('normalizeForSearch', () => {
  it('ignores case, accents and surrounding spaces', () => {
    expect(normalizeForSearch('  ÓLEO ')).toBe('oleo')
    expect(normalizeForSearch('Técnica')).toBe('tecnica')
  })
})

describe('filterVocabulary (RF-213: quick search over the type catalog)', () => {
  it('returns everything when nothing is typed yet', () => {
    expect(filterVocabulary(TYPES, '')).toEqual(TYPES)
    expect(filterVocabulary(TYPES, '   ')).toEqual(TYPES)
  })

  it('matches without caring about case or accents, anywhere in the name', () => {
    // The real case: a phone keyboard without hunting for the accent.
    expect(filterVocabulary(TYPES, 'oleo')).toEqual(['Óleo sobre tabla'])
    expect(filterVocabulary(TYPES, 'TEC')).toEqual(['Técnica mixta'])
    expect(filterVocabulary(TYPES, 'ura')).toEqual(['Escultura', 'Pintura'])
  })

  it('returns nothing for a query no option contains', () => {
    expect(filterVocabulary(TYPES, 'acuarela')).toEqual([])
  })
})

describe('fuzzyMatch (subsequence: the letters count even apart)', () => {
  it('matches letters in order with any gaps, and says where they landed', () => {
    // "edam": ED from EDificio, then the greedy leftmost A (the standalone
    // "a") and the M of aMarilla — letters apart still count.
    const indices = fuzzyMatch('edificio a, habitacion amarilla', 'edam')
    expect(indices).toEqual([0, 1, 9, 24])
  })

  it('is case- and accent-insensitive', () => {
    expect(fuzzyMatch('Habitación 4', 'HACIO')).not.toBeNull()
  })

  it('ignores spaces and commas in the query', () => {
    expect(fuzzyMatch('almacen exterior, jaula 2', 'alm, jau')).not.toBeNull()
  })

  it('rejects letters out of order or absent', () => {
    expect(fuzzyMatch('edificio a', 'eo')).not.toBeNull()
    expect(fuzzyMatch('edificio a', 'oe')).toBeNull()
    expect(fuzzyMatch('edificio a', 'zx')).toBeNull()
  })

  it('the empty query matches with nothing highlighted', () => {
    expect(fuzzyMatch('edificio a', ' ')).toEqual([])
  })
})

describe('fuzzyRank (best match first)', () => {
  const LOCATIONS = [
    'edificio b, habitacion 4, estanteria 3, balda 2',
    'edificio a, habitacion amarilla, bloque 3',
    'almacen exterior, jaula 2',
  ]

  it('keeps only what matches, tightest match first', () => {
    const ranked = fuzzyRank(LOCATIONS, 'amarilla')
    expect(ranked.map((m) => m.option)).toEqual(['edificio a, habitacion amarilla, bloque 3'])
  })

  it('prefers the option where the letters sit closest together', () => {
    const ranked = fuzzyRank(['a-x-b-y-c', 'z abc'], 'abc')
    expect(ranked[0]?.option).toBe('z abc')
  })

  it('ranks everything for the empty query, in the given order', () => {
    expect(fuzzyRank(LOCATIONS, '')).toHaveLength(3)
    expect(fuzzyRank(LOCATIONS, '')[0]?.option).toBe(LOCATIONS[0])
  })
})

describe('findEquivalent (avoids case/accent duplicates in the vocabulary)', () => {
  it('finds the canonical entry the typed text is equivalent to', () => {
    expect(findEquivalent(TYPES, 'pintura')).toBe('Pintura')
    expect(findEquivalent(TYPES, 'oleo sobre tabla ')).toBe('Óleo sobre tabla')
  })

  it('does not treat a partial match as equivalent', () => {
    expect(findEquivalent(TYPES, 'Pint')).toBeUndefined()
  })

  it('never matches the empty text', () => {
    expect(findEquivalent(TYPES, '')).toBeUndefined()
  })
})
