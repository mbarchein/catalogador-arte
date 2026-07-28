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

/** One character, comparable: lowercase and with its diacritics dropped. */
function normalizeChar(ch: string): string {
  return ch
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
}

export interface FuzzyMatch {
  option: string
  /** Positions in `option` of the letters the query matched, for highlighting. */
  indices: number[]
}

/**
 * Subsequence matching for suggestions over free text: the letters of the
 * query must appear in the option in the same order, but NOT necessarily
 * together — "edam" finds "EDificio a, habitacion AMarilla". Case- and
 * accent-insensitive; spaces and commas in the query are ignored (they
 * separate nothing when any gap is allowed). Returns where each letter
 * landed, so the list can show WHY an option matched, or null when it does
 * not.
 */
export function fuzzyMatch(option: string, query: string): number[] | null {
  const letters = [...normalizeForSearch(query)].filter((c) => c !== ' ' && c !== ',')
  const indices: number[] = []
  let qi = 0
  for (let i = 0; i < option.length && qi < letters.length; i += 1) {
    if (normalizeChar(option[i] as string) === letters[qi]) {
      indices.push(i)
      qi += 1
    }
  }
  return qi === letters.length ? indices : null
}

/**
 * Matching options, best first: the tightest match (least spread between the
 * first and last matched letter), then the earliest, then alphabetical. The
 * empty query ranks everything, in the caller's order.
 */
export function fuzzyRank(options: readonly string[], query: string): FuzzyMatch[] {
  const matches: FuzzyMatch[] = []
  for (const option of options) {
    const indices = fuzzyMatch(option, query)
    if (indices !== null) matches.push({ option, indices })
  }
  const spread = (m: FuzzyMatch) =>
    m.indices.length === 0 ? 0 : (m.indices[m.indices.length - 1] as number) - (m.indices[0] as number)
  // Ties keep the caller's order: sort is stable, and no alphabetical
  // tiebreak — the caller already chose how to present equals.
  return matches.sort(
    (a, b) => spread(a) - spread(b) || (a.indices[0] ?? 0) - (b.indices[0] ?? 0),
  )
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
