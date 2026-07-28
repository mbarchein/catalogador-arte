import { describe, expect, it } from 'vitest'
import { filterVocabulary, findEquivalent, fuzzyFilter, normalizeForSearch } from './vocabulary'

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

describe('fuzzyFilter (suggestions over free text, e.g. physical locations)', () => {
  const LOCATIONS = [
    'edificio a, habitacion amarilla, bloque 3',
    'edificio b, habitacion 4, estanteria 3, balda 2',
    'almacen exterior, jaula 2',
  ]

  it('matches every token in any order, case- and accent-insensitive', () => {
    expect(fuzzyFilter(LOCATIONS, 'amarilla edif')).toEqual([
      'edificio a, habitacion amarilla, bloque 3',
    ])
    expect(fuzzyFilter(LOCATIONS, 'Edificio HABITACIÓN')).toHaveLength(2)
  })

  it('treats commas as token separators', () => {
    expect(fuzzyFilter(LOCATIONS, 'jaula, exterior')).toEqual(['almacen exterior, jaula 2'])
  })

  it('returns everything for the empty query', () => {
    expect(fuzzyFilter(LOCATIONS, '  ')).toHaveLength(3)
  })

  it('returns nothing when a token matches nowhere', () => {
    expect(fuzzyFilter(LOCATIONS, 'edificio z')).toEqual([])
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
