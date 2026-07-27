/**
 * Rescues a searchable year out of a free-text date.
 *
 * Since ADR-004 the date lives in structured fields and this function only
 * acts on `date_note` — the handwritten wording the structure cannot
 * represent —: "hacia 1972, quizá" still shows up when searching the seventies
 * because its `start_year` comes from here. Criterion inherited from the field
 * schema: the first plausible year in the text.
 */
export function searchableYear(text: string): number | null {
  const found = text.match(/\d{4}/)
  if (!found) return null

  const year = Number(found[0])
  // A year outside the plausible range is a typing slip, not a date. The
  // oldest possible fund is from the 20th century, so anything before 1800 or
  // after next year is suspicious, and it is better not to sort by it than to
  // sort wrong in silence.
  const upperBound = new Date().getFullYear() + 1
  if (year < 1800 || year > upperBound) return null

  return year
}

/**
 * Date text for display. When there is no datum it is stated explicitly
 * instead of leaving a gap (general criterion: never an unexplained blank).
 */
export function displayDate(executionDate: string): string {
  return executionDate.trim() === '' ? 'Sin fecha' : executionDate
}
