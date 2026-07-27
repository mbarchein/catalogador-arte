import { describe, expect, it } from 'vitest'
import { normalizeLocation, locationForSaving } from './location'

describe('normalizeLocation (field schema v11 convention)', () => {
  it('lowercases', () => {
    expect(normalizeLocation('Edificio A')).toBe('edificio a')
  })

  it('removes accents', () => {
    expect(normalizeLocation('Habitación Amarilla')).toBe('habitacion amarilla')
    expect(normalizeLocation('estantería')).toBe('estanteria')
  })

  it('keeps the ñ, which is a letter and not an accent', () => {
    // Turning "muñeca" into "muneca" would not be normalizing, it would be a
    // spelling error.
    expect(normalizeLocation('Sala de la Muñeca')).toBe('sala de la muñeca')
    expect(normalizeLocation('PEÑA')).toBe('peña')
  })

  it('tidies the spaces around commas', () => {
    expect(normalizeLocation('edificio a,habitacion 4')).toBe('edificio a, habitacion 4')
    expect(normalizeLocation('edificio a  ,   habitacion 4')).toBe('edificio a, habitacion 4')
  })

  it('collapses repeated spaces', () => {
    expect(normalizeLocation('edificio    a')).toBe('edificio a')
  })

  it('keeps the trailing space while typing', () => {
    // Without this "edificio a, habitacion" cannot be typed: the space after
    // the comma would vanish as soon as it is written.
    expect(normalizeLocation('edificio a, ')).toBe('edificio a, ')
  })

  it('turns two different spellings of the same place into the same string', () => {
    // The convention's reason for being: grouping by location to generate work
    // lists.
    const a = normalizeLocation('Edificio B, Habitación 4, Estantería 3')
    const b = normalizeLocation('edificio b,habitacion 4,   estanteria 3')
    expect(a).toBe(b)
    expect(a).toBe('edificio b, habitacion 4, estanteria 3')
  })
})

describe('locationForSaving', () => {
  it('trims the comma or space left at the end', () => {
    expect(locationForSaving('edificio a, habitacion 4, ')).toBe('edificio a, habitacion 4')
    expect(locationForSaving('edificio a,')).toBe('edificio a')
  })

  it('leaves empty what only had separators', () => {
    expect(locationForSaving('  ,  ')).toBe('')
  })
})
