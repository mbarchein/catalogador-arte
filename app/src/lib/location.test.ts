import { describe, expect, it } from 'vitest'
import { locationForSaving, locationLevels, locationWithin, normalizeLocation } from './location'

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

describe('locationLevels (the hierarchy of the convention)', () => {
  it('splits by comma, largest to smallest', () => {
    expect(locationLevels('edificio a, habitacion amarilla, bloque 3')).toEqual([
      'edificio a',
      'habitacion amarilla',
      'bloque 3',
    ])
  })

  it('normalizes first, so a hand-typed value compares with a stored one', () => {
    expect(locationLevels('Edificio A,  Habitación Amarilla ')).toEqual([
      'edificio a',
      'habitacion amarilla',
    ])
  })

  it('an empty location has no levels', () => {
    expect(locationLevels('')).toEqual([])
    expect(locationLevels(' , ')).toEqual([])
  })
})

describe('locationWithin (a place reaches everything inside it)', () => {
  const YELLOW = 'edificio a, habitacion amarilla, bloque 3'

  it('a place reaches itself', () => {
    expect(locationWithin(YELLOW, YELLOW)).toBe(true)
  })

  it('an outer level reaches everything under it', () => {
    // What makes the filter usable in a storage room: "everything in the
    // yellow room" must bring every shelf, folder and box under it.
    expect(locationWithin(YELLOW, 'edificio a')).toBe(true)
    expect(locationWithin(YELLOW, 'edificio a, habitacion amarilla')).toBe(true)
  })

  it('does not reach upwards: the building is not inside the room', () => {
    expect(locationWithin('edificio a', 'edificio a, habitacion amarilla')).toBe(false)
  })

  it('compares whole levels: «edificio a» is not «edificio ab»', () => {
    // A raw prefix comparison would mix two different buildings.
    expect(locationWithin('edificio ab, habitacion 1', 'edificio a')).toBe(false)
    expect(locationWithin('edificio a, habitacion 1', 'edificio ab')).toBe(false)
  })

  it('a sibling branch does not match', () => {
    expect(locationWithin(YELLOW, 'edificio a, habitacion azul')).toBe(false)
  })

  it('nothing is inside an empty place, and an unplaced artwork is nowhere', () => {
    expect(locationWithin(YELLOW, '')).toBe(false)
    expect(locationWithin('', 'edificio a')).toBe(false)
  })
})
