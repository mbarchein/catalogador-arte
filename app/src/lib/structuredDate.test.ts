import { describe, expect, it } from 'vitest'
import {
  MIN_YEAR,
  adjustYear,
  parseManualDate,
  maxYear,
  composeDate,
  decomposeDate,
} from './structuredDate'
import { searchableYear } from './dates'

describe('composeDate (RF-207)', () => {
  it('composes the four formats of the field schema', () => {
    expect(composeDate({ year: 1978, approximate: false, endYear: null, unconfirmed: false })).toBe('1978')
    expect(composeDate({ year: 1975, approximate: false, endYear: 1978, unconfirmed: false })).toBe('1975-1978')
    expect(composeDate({ year: 1980, approximate: true, endYear: null, unconfirmed: false })).toBe('c. 1980')
    expect(composeDate({ year: 1975, approximate: true, endYear: 1978, unconfirmed: false })).toBe('c. 1975-1978')
  })

  it('returns empty when there is no year, which means "undated artwork"', () => {
    expect(composeDate({ year: null, approximate: true, endYear: 1980, unconfirmed: false })).toBe('')
  })

  it('does not write a range when the end year is not later', () => {
    // Tapping "range" without moving the second year must not produce
    // "1978-1978".
    expect(composeDate({ year: 1978, approximate: false, endYear: 1978, unconfirmed: false })).toBe('1978')
    expect(composeDate({ year: 1978, approximate: false, endYear: 1970, unconfirmed: false })).toBe('1978')
  })
})

describe('decomposeDate', () => {
  it('recognizes the four formats', () => {
    expect(decomposeDate('1978')).toEqual({ year: 1978, approximate: false, endYear: null, unconfirmed: false })
    expect(decomposeDate('1975-1978')).toEqual({ year: 1975, approximate: false, endYear: 1978, unconfirmed: false })
    expect(decomposeDate('c. 1980')).toEqual({ year: 1980, approximate: true, endYear: null, unconfirmed: false })
    expect(decomposeDate('c. 1975-1978')).toEqual({
      year: 1975,
      approximate: true,
      endYear: 1978,
      unconfirmed: false,
    })
  })

  it('tolerates the variants that appear in real catalogs', () => {
    // "ca.", no space, em dash: they read the same, even though composing
    // always emits the canonical form.
    expect(decomposeDate('ca. 1980')?.year).toBe(1980)
    expect(decomposeDate('c.1980')?.approximate).toBe(true)
    expect(decomposeDate('1975 – 1978')?.endYear).toBe(1978)
  })

  it('treats empty as an undated artwork, not as unrepresentable text', () => {
    expect(decomposeDate('')).toEqual({ year: null, approximate: false, endYear: null, unconfirmed: false })
    expect(decomposeDate('   ')).toEqual({ year: null, approximate: false, endYear: null, unconfirmed: false })
  })

  it('returns null for text the controls do not represent', () => {
    // This is what protects the handwritten datum: the interface will show a
    // text field instead of rewriting the nuance.
    expect(decomposeDate('finales de los setenta')).toBeNull()
    expect(decomposeDate('c. 1975-1978 o posterior')).toBeNull()
    expect(decomposeDate('siglo XX')).toBeNull()
    expect(decomposeDate('1978?')).toBeNull() // without brackets it is not the convention
  })

  it('returns null for an inverted range, instead of silently normalizing it', () => {
    expect(decomposeDate('1978-1975')).toBeNull()
  })

  it('is the inverse of composeDate for every representable format', () => {
    const cases = [
      { year: 1978, approximate: false, endYear: null, unconfirmed: false },
      { year: 1975, approximate: false, endYear: 1978, unconfirmed: false },
      { year: 1980, approximate: true, endYear: null, unconfirmed: false },
      { year: 1975, approximate: true, endYear: 1978, unconfirmed: false },
    ]
    for (const c of cases) {
      expect(decomposeDate(composeDate(c))).toEqual(c)
    }
  })

  it('always produces text from which the year can be extracted', () => {
    // The whole string matters: the controls feed execution_date, which the
    // catalog sorts by.
    expect(searchableYear(composeDate({ year: 1975, approximate: true, endYear: 1978, unconfirmed: false }))).toBe(
      1975,
    )
    expect(searchableYear(composeDate({ year: 1980, approximate: true, endYear: null, unconfirmed: false }))).toBe(
      1980,
    )
  })
})

describe('the "[?]" flag is independent of precision', () => {
  // It is the reason for two flags instead of five formats: "c." speaks of
  // precision — a grounded estimate — and "[?]" of confidence — an unverified
  // datum. All eight combinations make sense and can be expressed.
  const combinations: [string, Parameters<typeof composeDate>[0]][] = [
    ['1978', { year: 1978, approximate: false, endYear: null, unconfirmed: false }],
    ['1978 [?]', { year: 1978, approximate: false, endYear: null, unconfirmed: true }],
    ['1975-1978', { year: 1975, approximate: false, endYear: 1978, unconfirmed: false }],
    ['1975-1978 [?]', { year: 1975, approximate: false, endYear: 1978, unconfirmed: true }],
    ['c. 1980', { year: 1980, approximate: true, endYear: null, unconfirmed: false }],
    ['c. 1980 [?]', { year: 1980, approximate: true, endYear: null, unconfirmed: true }],
    ['c. 1975-1978', { year: 1975, approximate: true, endYear: 1978, unconfirmed: false }],
    ['c. 1975-1978 [?]', { year: 1975, approximate: true, endYear: 1978, unconfirmed: true }],
  ]

  it.each(combinations)('composes «%s»', (text, structure) => {
    expect(composeDate(structure)).toBe(text)
  })

  it.each(combinations)('decomposes «%s» and comes back to the same', (text, structure) => {
    expect(decomposeDate(text)).toEqual(structure)
  })

  it.each(combinations)('«%s» still yields its year', (text, structure) => {
    // The suffix has no digits, so it cannot confuse the year rescue.
    expect(searchableYear(text)).toBe(structure.year)
  })

  it('does not write "[?]" over an undated artwork', () => {
    // A bare "[?]" says nothing: the doubt must be about some datum.
    expect(composeDate({ year: null, approximate: false, endYear: null, unconfirmed: true })).toBe(
      '',
    )
  })

  it('tolerates the suffix glued or separated when reading', () => {
    expect(decomposeDate('1978[?]')?.unconfirmed).toBe(true)
    expect(decomposeDate('1978   [?]')?.unconfirmed).toBe(true)
  })
})

describe('adjustYear', () => {
  it('goes up and down one by one', () => {
    expect(adjustYear(1978, 1)).toBe(1979)
    expect(adjustYear(1978, -1)).toBe(1977)
  })

  it('jumps ten by ten', () => {
    expect(adjustYear(1978, 10)).toBe(1988)
    expect(adjustYear(1978, -10)).toBe(1968)
  })

  it('does not leave the plausible bounds', () => {
    expect(adjustYear(MIN_YEAR, -1)).toBe(MIN_YEAR)
    expect(adjustYear(maxYear(), 1)).toBe(maxYear())
    expect(adjustYear(1905, -10)).toBe(MIN_YEAR)
  })

  it('starts from the current year when there was no date', () => {
    expect(adjustYear(null, 0)).toBe(maxYear())
    expect(adjustYear(null, -1)).toBe(maxYear() - 1)
  })
})

describe('parseManualDate (handwriting also structures)', () => {
  it('canonical text fills the structure and leaves no note', () => {
    // Typing it by hand and composing it with the buttons yield the same
    // record.
    expect(parseManualDate('c.1975 - 1978')).toEqual({
      date: { year: 1975, approximate: true, endYear: 1978, unconfirmed: false },
      note: '',
    })
    expect(parseManualDate('1978 [?]')).toEqual({
      date: { year: 1978, approximate: false, endYear: null, unconfirmed: true },
      note: '',
    })
  })

  it('the unparseable is kept verbatim as a note, rescuing the year', () => {
    const r = parseManualDate('hacia 1972, quizá')
    expect(r.note).toBe('hacia 1972, quizá')
    expect(r.date.year).toBe(1972)
    expect(r.date.approximate).toBe(false)
  })

  it('with no year at all, the note has no search year', () => {
    const r = parseManualDate('finales de los setenta')
    expect(r.note).toBe('finales de los setenta')
    expect(r.date.year).toBeNull()
  })

  it('an inverted range is not structured: it goes to the note for someone to fix', () => {
    const r = parseManualDate('1978-1975')
    expect(r.note).toBe('1978-1975')
    // Even so a year is rescued so the artwork is not lost in searches.
    expect(r.date.year).toBe(1978)
  })

  it('empty means "undated artwork", not a note', () => {
    expect(parseManualDate('   ')).toEqual({
      date: { year: null, approximate: false, endYear: null, unconfirmed: false },
      note: '',
    })
  })
})
