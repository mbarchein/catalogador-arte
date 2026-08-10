/**
 * The bibliography's index: in what order it is read, what the search looks for and what
 * each row says (RF-506, RF-606, RF-609).
 *
 * Pure and without React, like everything that decides in this project: the suite runs in
 * node with no DOM, so a list's order and a row's words are
 * verified here or they are not verified.
 *
 * **Almost nothing about how a reference reads is written here, and that is as it should be.**
 * An artwork's record already had to name the authors, put «s.f.» when there is
 * no year and compose the imprint, and it does so in `documentary/bibliography/`.
 * This index reuses those functions as is: a reference has to read
 * THE SAME in its listing as inside the record that cites it, or the cataloguer is
 * reading two dialects of the same catalogue. What is new is only what a
 * list needs and a record does not: the whole table's order, the search and the count.
 *
 * ── WHY THIS SCREEN EXISTS ──────────────────────────────────
 *
 * A reference was created and corrected **only from an artwork that cited it**, so
 * a reference with no citations left could not be found
 * from anywhere: it was still in the catalogue, counting towards the unique index of the
 * BibTeX key, and it was invisible. The artwork record declared it out loud in its
 * «what still cannot be done here» card. This is the cheap half of
 * fixing it — the listing and its search—; its own record with its «obras
 * citadas» block (RF-506) is the other.
 */

import { fuzzyRankBy } from '../../lib/vocabulary'
import type { ReferenceRow } from '../documentary/documentaryRows'
import {
  referenceAuthorText,
  referenceYearText,
} from '../documentary/bibliography/citationFormat'
import {
  REFERENCE_COLUMNS,
  referenceOptionHint,
  referenceSearchText,
} from '../documentary/bibliography/referenceChoice'
import { referenceTitleText } from '../documentary/bibliography/referenceEdit'

/**
 * The index's columns, which are the ones the record's selector already asks for.
 *
 * Imported and not rewritten, on purpose: the two lists show the same rows
 * with the same words, so a column one of them needs the other needs too.
 * A second copy would be the failure a photograph's corners already cost
 * once — a field the query forgot arriving as `undefined` with the type
 * promising a value.
 */
export { REFERENCE_COLUMNS }

/** What the search looks at, which is also what the row shows. */
export { referenceSearchText as bibliographySearchText }

/**
 * What a reference is ordered by: **by author, and the anonymous ones by their title**.
 *
 * And not by descending year like the exhibition index, which is the comparison
 * worth making because the two lists look like the same kind of thing and
 * they are not. An exhibition listing is read to find the show whose
 * catalogue is on the table, and that one is very likely from this decade. A
 * bibliography is read as the printed bibliography of a catalogue raisonné is read:
 * looking for «Rotili» or «Zafra» among the surnames, which is where the eye goes. Ordering it
 * by year would leave an author's two articles twenty rows apart.
 *
 * The key is the author and, when there is none —an unsigned press clipping, which
 * is half of a real archive—, the title. **The unsigned reference does NOT go
 * last**: it is placed by its title among the rest, because «anonymous» is not an author
 * starting with z. It is the same decision as a document's empty date, the
 * other way round: there «no date» is not year zero and goes last; here «no author» does have
 * a natural place in the alphabet, its title's.
 */
export function bibliographyOrderKey(reference: ReferenceRow): string {
  return (referenceAuthorText(reference) ?? referenceTitleText(reference)).trim()
}

/**
 * The index's order, with the year ASCENDING within each author.
 *
 * Ascending and not descending: within an author what is read is their journey, and
 * it is the same criterion as an artwork's exhibition history (RF-502). The
 * comparisons go in es-ES with `sensitivity: 'base'`, so «Álvarez» sits
 * with the a's and not after the z, which is what would happen with byte order.
 *
 * The identifier breaks the final ties, so that two references do not swap
 * places between two loads of the same screen.
 */
export function sortReferences(rows: readonly ReferenceRow[]): ReferenceRow[] {
  return rows.slice().sort((a, b) => {
    const byKey = bibliographyOrderKey(a).localeCompare(bibliographyOrderKey(b), 'es', {
      sensitivity: 'base',
    })
    if (byKey !== 0) return byKey
    // With no year it goes AFTER the same author's years: «s.f.» is a legitimate datum
    // that is not a point in time, so it does not head their work.
    const ya = a.year ?? null
    const yb = b.year ?? null
    if (ya !== yb) {
      if (ya == null) return 1
      if (yb == null) return -1
      return ya - yb
    }
    return (
      referenceTitleText(a).localeCompare(referenceTitleText(b), 'es', { sensitivity: 'base' }) ||
      a.id.localeCompare(b.id)
    )
  })
}

/** One row of the index, ready to paint. */
export interface BibliographyIndexEntry {
  row: ReferenceRow
  /** The title. Never empty: the base requires it, and if it arrived empty it is said. */
  title: string
  /** `Rotili, A. · 1985 · Revista de Estudios Extremeños · Artículo`. Never a gap (RF-304). */
  hint: string
  /** The year or «s.f.», apart, for the column read vertically. */
  year: string
  /** The BibTeX key, when it has one: it is how it is cited in the essay. */
  bibtexKey: string | null
  /** In the wastebasket. Painted dimmed — and SAID, because grey alone is decoration. */
  retired: boolean
  /** What the search has looked at, and what the row shows as one line. */
  text: string
  /** Where the typed letters have landed inside `text`, for the emphasis. */
  indices: number[]
}

/**
 * The index's rows, the best match first.
 *
 * **Withdrawn references are hidden unless asked for** (RF-609: the indexes
 * exclude what is withdrawn), and asking for them is the only way for one to come back —
 * always hiding them hides the only way out, which is the reasoning the venues
 * screen already wrote. They are not mixed in silently: the row says `retired` and the screen says the
 * word.
 */
export function rankReferences(
  rows: readonly ReferenceRow[],
  query: string,
  options: { includeRetired?: boolean } = {},
): BibliographyIndexEntry[] {
  const visible = options.includeRetired === true ? rows : rows.filter((row) => row.active)
  // Sorted BEFORE scoring, not after: `fuzzyRankBy` is stable and keeps the
  // caller's order among equally good matches, so the alphabet
  // survives inside each level of the ranking. With the search empty everything ties, and
  // then the index is purely alphabetical, which is what it looks like being.
  const ordered = sortReferences(visible)
  return fuzzyRankBy(ordered, referenceSearchText, query).map(({ item, indices }) => ({
    row: item,
    title: referenceTitleText(item),
    hint: referenceOptionHint(item),
    year: referenceYearText(item),
    bibtexKey: item.bibtex_key?.trim() || null,
    retired: !item.active,
    text: referenceSearchText(item),
    indices,
  }))
}

/** How many are in the wastebasket, to offer the switch only when there is something inside. */
export function retiredReferenceCount(rows: readonly ReferenceRow[]): number {
  return rows.filter((row) => !row.active).length
}

/**
 * What is read above the list: how many there are, and how many are being shown
 * when the search has narrowed it.
 *
 * The number is said because it is the information that decides whether it is worth going on
 * typing or whether what is being looked for is not in the catalogue.
 */
export function referenceCountText(input: {
  total: number
  shown: number
  searching: boolean
}): string {
  const { total, shown, searching } = input
  const all = total === 1 ? '1 referencia' : `${total} referencias`
  if (!searching || shown === total) return all
  return `${shown} de ${all}`
}

/**
 * What goes where the rows would go when there are none, or null when there are.
 *
 * **Never a blank page**, which is a criterion of the project and not of this
 * screen: a search with no results returns the same page with the reason, and not
 * an empty list that reads as an empty catalogue.
 */
export function bibliographyListNotice(input: {
  loading: boolean
  error: string | null
  total: number
  shown: number
  query: string
  includingRetired: boolean
}): string | null {
  const { loading, error, total, shown, query, includingRetired } = input
  if (error !== null) return error
  if (loading) return 'Cargando la bibliografía…'
  if (shown > 0) return null

  const searching = query.trim() !== ''
  if (searching) {
    return includingRetired
      ? 'No se ha encontrado ninguna referencia, ni entre las retiradas.'
      : 'No se ha encontrado ninguna referencia. Puede estar retirada: incluye la papelera.'
  }
  if (total === 0) {
    return (
      'Todavía no hay ninguna referencia. Se crean desde la bibliografía de una obra, al citarla.'
    )
  }
  // Total > 0 and none shown without searching: they are all in the wastebasket.
  return 'Todas las referencias del catálogo están retiradas. Inclúyelas para verlas y recuperarlas.'
}
