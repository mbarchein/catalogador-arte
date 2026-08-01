import { ARTIST_FUNDS, type ArtistFund } from './types'
import { normalizeForSearch } from './vocabulary'

/**
 * The master tables on the client side: artwork types and series (RF-1106,
 * ADR-007).
 *
 * The two screens of the «Tablas» section list rows, sort them and decide what
 * adding a name means. None of that needs a DOM or a request, so it lives here
 * and can be tested for real — same criterion as places.ts and vocabulary.ts.
 *
 * What is NOT here is any rule the database already holds: that a name is unique,
 * that a type with artworks inside cannot be retired, that a name cannot be
 * blank. Those are enforced next to the data, in Spanish and with a hint, and the
 * screens show that sentence. A second copy here would be a rule that drifts.
 */

/**
 * What both master tables have in common: an identity, a name, and whether the
 * entry is still on offer.
 *
 * Structural and not an inheritance chain, so an `ArtworkTypeEntry` and a
 * `SeriesEntry` both fit without either of them knowing about this file.
 */
export interface MasterEntry {
  id: string
  name: string
  active: boolean
}

/**
 * Entries sorted for reading, with es-ES collation: the database default
 * collation may order accented names after 'z', and «Óleo» belongs with the o's.
 * Retired entries are NOT pushed to the bottom — the screen greys them out, and
 * moving a name away from where it is looked for hides it twice.
 */
export function sortByName<E extends MasterEntry>(entries: readonly E[]): E[] {
  return entries
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }))
}

/**
 * What typing a name into the «Añadir» field has to do.
 *
 * The interesting case is `restore`, and it is the reason this decision is not
 * left to the database: inserting a name that exists BUT IS RETIRED comes back as
 * a unique violation, indistinguishable from the one that means «someone else
 * added it a second ago». Treating both as success — which is what the ComboBox
 * did while nothing could be retired — would tell the cataloger «added» and leave
 * the vocabulary exactly as it was, with the entry still hidden. What she meant
 * by typing a retired name is that she wants it back.
 *
 * `reuse` is the equivalent-and-active case: «pintura» when «Pintura» is already
 * there. The unique index is case- and accent-sensitive, so the database would
 * happily take both; keeping the vocabulary free of that pair is a client job
 * (see findEquivalent), and it is done by comparing normalized names.
 */
export type AdditionPlan<E extends MasterEntry> =
  | { action: 'blank' }
  | { action: 'insert'; name: string }
  | { action: 'reuse'; entry: E }
  | { action: 'restore'; entry: E }

export function planAddition<E extends MasterEntry>(
  entries: readonly E[],
  text: string,
): AdditionPlan<E> {
  // Trimmed here and not only shown trimmed: the column has a `check` that the
  // name equals its own trim, and letting a trailing space through would answer
  // a request to add «Pintura » with a PostgreSQL constraint name in English.
  const name = text.trim()
  if (name === '') return { action: 'blank' }

  const key = normalizeForSearch(name)
  const equivalent = entries.find((entry) => normalizeForSearch(entry.name) === key)
  if (equivalent === undefined) return { action: 'insert', name }
  return equivalent.active
    ? { action: 'reuse', entry: equivalent }
    : { action: 'restore', entry: equivalent }
}

/** One fund and its series, for the grouped list of the series screen. */
export interface FundGroup<E> {
  fund: ArtistFund
  entries: E[]
}

/**
 * Series grouped by fund, in the order the funds are declared, each group
 * sorted by name.
 *
 * Grouped and not one flat list because the fund is not decoration: two funds may
 * each have a «Retratos del taller» and they are two different series — the pair
 * is what is unique. A list that shows the names alone would show the same name
 * twice with no way to tell which is which.
 *
 * Funds with no series are left out: an empty heading says nothing that the add
 * form above it does not already offer.
 */
export function groupByFund<E extends MasterEntry & { artist: ArtistFund }>(
  entries: readonly E[],
): FundGroup<E>[] {
  return ARTIST_FUNDS.map((fund) => ({
    fund,
    entries: sortByName(entries.filter((entry) => entry.artist === fund)),
  })).filter((group) => group.entries.length > 0)
}

/** The names still on offer, which is what a ComboBox of the record shows. */
export function activeNames(entries: readonly MasterEntry[]): string[] {
  return entries.filter((entry) => entry.active).map((entry) => entry.name)
}
