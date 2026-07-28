import { describe, expect, it } from 'vitest'
import { filterVocabulary, findEquivalent, normalizeForSearch } from './vocabulary'

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
