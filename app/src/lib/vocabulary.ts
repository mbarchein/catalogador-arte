/**
 * Text matching against a controlled vocabulary (RF-213).
 *
 * Pure logic, factored out of the ComboBox so the part that decides what the
 * cataloger sees — which options match, whether the typed text is a new
 * entry — is testable without a DOM.
 */

/**
 * Lowercase and without diacritics: on a phone keyboard, typing "oleo" must
 * find "Óleo". NFD splits each accented letter into base letter + combining
 * mark, and the combining marks (U+0300–U+036F) are then dropped.
 */
export function normalizeForSearch(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

/** Options that contain the query, case- and accent-insensitive. */
export function filterVocabulary(options: readonly string[], query: string): string[] {
  const q = normalizeForSearch(query)
  if (q === '') return [...options]
  return options.filter((o) => normalizeForSearch(o).includes(q))
}

/**
 * Loose matching for suggestions over free text: every whitespace- or
 * comma-separated token of the query must appear somewhere in the option,
 * in any order — "amarilla edif" finds "edificio a, habitacion amarilla,
 * bloque 3". Token containment instead of edit-distance fuzziness on
 * purpose: it is predictable, and the queries are fragments the cataloger
 * remembers, not typos to repair.
 */
export function fuzzyFilter(options: readonly string[], query: string): string[] {
  const tokens = normalizeForSearch(query)
    .split(/[\s,]+/)
    .filter(Boolean)
  if (tokens.length === 0) return [...options]
  return options.filter((o) => {
    const normalized = normalizeForSearch(o)
    return tokens.every((t) => normalized.includes(t))
  })
}

/**
 * The canonical entry the typed text is equivalent to, if any. Selecting it
 * instead of inserting keeps the vocabulary free of duplicates that differ
 * only in case or accents ("pintura" vs "Pintura").
 */
export function findEquivalent(options: readonly string[], text: string): string | undefined {
  const q = normalizeForSearch(text)
  if (q === '') return undefined
  return options.find((o) => normalizeForSearch(o) === q)
}
