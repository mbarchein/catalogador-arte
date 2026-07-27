/**
 * The execution date lives in structured fields (ADR-004): start_year,
 * end_year and two flags. The publishable text is composed by the DATABASE as
 * a generated column; `composeDate` here produces the same text and is only
 * used to preview in the interface before saving.
 *
 * The four formats, and the "[?]" suffix over any of them:
 *
 *   1978 · 1975-1978 · c. 1980 · c. 1975-1978
 *
 * **`c.` and `[?]` are not the same thing**, hence two flags and not one:
 *
 *   - `c.` — approximate date: the artwork is from around that year.
 *   - `[?]` — unconfirmed: the date is unknown and the year is an estimate.
 *
 * `decomposeDate` is the inverse and, since ADR-004, its role is parsing the
 * handwritten date (`parseManualDate`): whatever gets typed ends up in the
 * structure whenever possible, and only the unparseable remains as a note.
 */

import { searchableYear } from './dates'

export interface StructuredDate {
  year: number | null
  /** The artwork is from around that year. Rendered with the "c." prefix. */
  approximate: boolean
  /** Final year of the range, or null for a single date. */
  endYear: number | null
  /** The date is unknown and the year is an estimate. "[?]" suffix. */
  unconfirmed: boolean
}

export const EMPTY_DATE: StructuredDate = {
  year: null,
  approximate: false,
  endYear: null,
  unconfirmed: false,
}

/** Plausible bounds for the artwork of both funds. */
export const MIN_YEAR = 1900
export function maxYear(): number {
  return new Date().getFullYear()
}

export function composeDate(d: StructuredDate): string {
  if (d.year == null) return ''
  const prefix = d.approximate ? 'c. ' : ''
  // The suffix only makes sense when there is a datum to doubt: a bare "[?]"
  // says nothing, and an undated artwork is already rendered as an empty field.
  const suffix = d.unconfirmed ? ' [?]' : ''
  // A range that ends before it starts, or in the same year, is not a range.
  if (d.endYear == null || d.endYear <= d.year) return `${prefix}${d.year}${suffix}`
  return `${prefix}${d.year}-${d.endYear}${suffix}`
}

/**
 * Inverse of `composeDate`. Returns null when the text is not one of the
 * representable formats, so the interface does not try to rewrite it with the
 * controls.
 */
export function decomposeDate(text: string): StructuredDate | null {
  const clean = text.trim()
  if (clean === '') return EMPTY_DATE

  // Both "c." and "ca." are accepted, with or without a space, because those
  // are the two forms found in catalogs. Composing always emits "c. ".
  const pattern = /^(c\.|ca\.)?\s*(\d{4})(?:\s*[-–]\s*(\d{4}))?\s*(\[\?\])?$/i
  const match = clean.match(pattern)
  if (!match) return null

  const year = Number(match[2])
  const end = match[3] ? Number(match[3]) : null

  // An inverted range is a capture error, not a different format: null is
  // returned so the interface shows the text verbatim and someone fixes it
  // deliberately.
  if (end != null && end <= year) return null

  return {
    year,
    approximate: Boolean(match[1]),
    endYear: end,
    unconfirmed: Boolean(match[4]),
  }
}

/** Clamps the year within the plausible bounds, for the + and − buttons. */
export function adjustYear(year: number | null, delta: number): number {
  const base = year ?? maxYear()
  return Math.min(maxYear(), Math.max(MIN_YEAR, base + delta))
}

/**
 * What gets carried from one artwork to the next within a batch. The date is
 * inherited because a batch is usually a period or a folder, not artwork
 * scattered across fifty years; the title and the measurements never, because
 * they belong to the concrete piece and inheriting them would be making data
 * up.
 */
export function carriedDate(previous: StructuredDate): StructuredDate {
  return { ...previous }
}

/**
 * Parsing of the handwritten date, so what gets typed ends up in the
 * database's structured fields whenever possible:
 *
 *  - Canonical text (the four formats, with or without "[?]") → filled
 *    structure and empty note: typing "c.1975 - 1978" by hand and composing it
 *    with the buttons leave the record EXACTLY the same.
 *  - Any other text → kept verbatim as a note (it is what gets published), and
 *    the first plausible year is rescued into `year` so the artwork does not
 *    vanish from period searches.
 */
export function parseManualDate(text: string): { date: StructuredDate; note: string } {
  const clean = text.trim()
  const canonical = decomposeDate(clean)
  if (canonical) return { date: canonical, note: '' }
  return {
    date: { ...EMPTY_DATE, year: searchableYear(clean) },
    note: clean,
  }
}
