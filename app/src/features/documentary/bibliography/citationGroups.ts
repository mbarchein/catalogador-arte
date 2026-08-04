/**
 * Whether the bibliography of an artwork is read better in one list or split by
 * kind of publication (RF-504, RF-514).
 *
 * Grouping is not free. Every heading costs a line of a phone screen and one
 * more decision before the eye lands on a reference, so it has to earn its
 * place: three references fit whole in the palm of a hand and want no headings
 * at all, while fourteen — a book, four articles, seven press cuttings and two
 * exhibition catalogues — are unreadable as one column, because «¿está en algún
 * catálogo de exposición?» is the question that gets asked and the answer would
 * be scattered.
 *
 * So the block groups WHEN IT HELPS and not always, and the rule that decides it
 * lives here as a pure function instead of inside the JSX, where nobody could
 * check it.
 */

import type { CitationRow } from '../documentaryRows'
import { citationView, type CitationView } from './citationFormat'

/** Key of the group holding the references nobody has classified yet. */
export const UNCLASSIFIED_GROUP = 'UNCLASSIFIED'

/**
 * Heading of the unclassified group.
 *
 * «Sin clasificar» and not «Otro»: `Otro` is an entry of the vocabulary
 * (RF-514) that somebody chose on purpose after looking, and a null
 * `publication_type_id` is nobody having looked. The same distinction as
 * everywhere else in this catalogue, and mixing the two would bury the
 * references that still need a decision.
 */
export const UNCLASSIFIED_TITLE = 'Sin clasificar'

/** Below this many references a list is read whole and headings only get in the way. */
export const MIN_ROWS_TO_GROUP = 4

export interface CitationGroup {
  /** The publication type's identifier, or `UNCLASSIFIED`. */
  key: string
  /** The heading. Null on the single group of an ungrouped list. */
  title: string | null
  views: CitationView[]
}

export interface CitationList {
  /** True when the block paints headings. */
  grouped: boolean
  /** One group when it is not grouped, one per kind of publication when it is. */
  groups: CitationGroup[]
}

/** The group a citation belongs to: its publication type, or the unclassified one. */
function groupKeyOf(row: CitationRow): string {
  return row.reference?.publication_type?.id ?? UNCLASSIFIED_GROUP
}

function groupTitleOf(row: CitationRow): string {
  const name = row.reference?.publication_type?.name.trim()
  return name === undefined || name === '' ? UNCLASSIFIED_TITLE : name
}

/**
 * Whether splitting this bibliography by kind of publication earns its headings.
 *
 * Three conditions, and each one rules out a shape that reads worse split than
 * whole:
 *
 *   · at least four references — below that the list is read at a glance;
 *   · at least two kinds — a single heading over the whole block says nothing
 *     that the reference lines do not already say;
 *   · groups of two on average — the case this exists to prevent is five
 *     references of five kinds, which grouped is five headings over five lines
 *     and twice as long for the same content.
 *
 * The average and not a minimum per group: a real bibliography is lopsided —
 * eight press cuttings, one book — and forcing every group to hold two would
 * refuse to group precisely the block that needs it most.
 */
export function groupingHelps(rows: readonly CitationRow[]): boolean {
  if (rows.length < MIN_ROWS_TO_GROUP) return false
  const kinds = new Set(rows.map(groupKeyOf)).size
  return kinds >= 2 && kinds * 2 <= rows.length
}

/**
 * The bibliography of an artwork, ready to paint: either one list or one list
 * per kind of publication.
 *
 * The incoming ORDER IS KEPT inside every group — the hook already sorted it
 * chronologically, oldest first, with the undated last — because the order
 * within a kind is what a reader follows. What gets decided here is only the
 * order OF the groups: alphabetical by the vocabulary's own name, with the
 * unclassified last.
 *
 * Alphabetical and not by size or by date: the entries of the vocabulary are
 * renamed by hand (RF-216) and a heading that jumps around between two artworks
 * makes the block unreadable as a habit. The unclassified group goes last
 * because it is a pending decision of the catalogue and not a kind of
 * publication — but it is never hidden, which is how a block ends up looking
 * complete while nobody has classified anything.
 *
 * The group's title is the vocabulary entry VERBATIM, never pluralized: the
 * entries are free text a cataloger writes («Tesis» is already plural in form,
 * «Catálogo de exposición» pluralizes on the first word), and guessing a plural
 * out of that prints a word nobody chose.
 */
export function citationList(rows: readonly CitationRow[]): CitationList {
  const views = rows.map(citationView)
  if (!groupingHelps(rows)) {
    return { grouped: false, groups: [{ key: 'all', title: null, views }] }
  }

  const groups: CitationGroup[] = []
  const byKey = new Map<string, CitationGroup>()
  rows.forEach((row, index) => {
    const key = groupKeyOf(row)
    let group = byKey.get(key)
    if (group === undefined) {
      group = { key, title: groupTitleOf(row), views: [] }
      byKey.set(key, group)
      groups.push(group)
    }
    // `views` was built from `rows` in one pass, so index by index they match.
    group.views.push(views[index] as CitationView)
  })

  groups.sort((a, b) => {
    if (a.key === UNCLASSIFIED_GROUP) return 1
    if (b.key === UNCLASSIFIED_GROUP) return -1
    return (
      (a.title ?? '').localeCompare(b.title ?? '', 'es', { sensitivity: 'base' }) ||
      a.key.localeCompare(b.key)
    )
  })
  return { grouped: true, groups }
}
