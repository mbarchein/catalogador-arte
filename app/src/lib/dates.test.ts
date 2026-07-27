import { describe, expect, it } from 'vitest'
import { searchableYear, displayDate } from './dates'

describe('searchableYear (rescuing the year of a date_note, ADR-004)', () => {
  it('takes the year of an exact date', () => {
    expect(searchableYear('1978')).toBe(1978)
  })

  it('takes the start year of a range', () => {
    expect(searchableYear('1975-1978')).toBe(1975)
  })

  it('takes the year of an approximate date', () => {
    expect(searchableYear('c. 1980')).toBe(1980)
  })

  it('takes the start year of an approximate range', () => {
    expect(searchableYear('c. 1975-1978')).toBe(1975)
  })

  it('returns null when there is no date', () => {
    expect(searchableYear('')).toBeNull()
    expect(searchableYear('sin fechar')).toBeNull()
  })

  it('ignores an implausible year instead of silently sorting wrong', () => {
    // Four digits that are not a year: a measurement, an old inventory number
    // or a slip. Sorting by 197 or 9999 would be worse than not sorting.
    expect(searchableYear('0197')).toBeNull()
    expect(searchableYear('9999')).toBeNull()
  })

  it('accepts the current year', () => {
    const thisYear = new Date().getFullYear()
    expect(searchableYear(String(thisYear))).toBe(thisYear)
  })

  it('rescues the year from free wording', () => {
    // The real case of date_note: the structure cannot represent the nuance,
    // but the year must keep serving period searches.
    expect(searchableYear('hacia 1972, quizá')).toBe(1972)
    expect(searchableYear('anterior a 1965 según la familia')).toBe(1965)
    expect(searchableYear('finales de los setenta')).toBeNull()
  })
})

describe('displayDate', () => {
  it('says there is no date instead of leaving a gap', () => {
    expect(displayDate('')).toBe('Sin fecha')
    expect(displayDate('   ')).toBe('Sin fecha')
  })

  it('respects the text as documented', () => {
    expect(displayDate('c. 1975-1978')).toBe('c. 1975-1978')
  })
})
