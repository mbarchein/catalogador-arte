/**
 * How ONE artwork related to another reads on the record (RF-212, RF-217,
 * RF-305).
 *
 * The whole difficulty of this block is that a relationship has two ends and a
 * direction, and it is stored ONCE. «AR-0012 es estudio previo de AR-0013» is a
 * single row, and the record of AR-0013 has to read it backwards — «Obra final
 * de AR-0012» — out of that same row, because the migration deliberately
 * refused to store the reverse pair: two rows for one fact can diverge, and a
 * catalogue raisonné that contradicts itself about which piece is the study is
 * worse than one that says nothing.
 *
 * The direction is already resolved by `relationshipView` in the foundations,
 * which picks `name` or `inverse_name` depending on which end this record sits
 * at. What is decided HERE is everything that turns that into a line the
 * cataloger can read and tap: the title of the other artwork, its byline, what
 * is said when its record cannot be read, and how the lines are grouped.
 *
 * Pure, and it has to be: the battery runs in node with no DOM, so a component
 * would leave every one of these sentences unverified — and getting the
 * direction backwards would publish the study as the finished work.
 */

import { displayDate } from '../../../lib/dates'
import { displayTitle } from '../../../lib/title'
import { ARTIST_LABEL } from '../../../lib/types'
import {
  relationshipViews,
  type ArtworkRef,
  type RelationshipRow,
  type RelationshipView,
} from '../documentaryRows'

/** One related artwork, as the record paints it. */
export interface RelatedArtworkRow {
  /** The relationship row, unchanged: it is what retiring or editing acts on. */
  id: string
  /** The OTHER artwork's code. Always known, even when its record is not readable. */
  catalogId: string
  /** How this artwork relates to that one, in words, already read from this end. */
  label: string
  /** True when this record sits at the far end of an asymmetric relationship. */
  reversed: boolean
  /** Title of the other artwork, or the notice that its record cannot be read. */
  title: string
  /** «Alberto Rotili · 1978». Null when the other record could not be read. */
  byline: string | null
  /** Whether the row links to the other record (RF-305). */
  linked: boolean
  /** What has to be said about the other artwork before quoting it, or null. */
  notice: string | null
  /** The circumstance of THIS relationship, free text. Empty is the normal case. */
  note: string
}

/**
 * What goes where the title would go when the other record cannot be read.
 *
 * It happens for real: the relationship is visible to a Reader while the artwork
 * at the other end is retired, and `artworks` hides retired rows from her. The
 * relationship is a fact and it is shown; what cannot be shown is said.
 */
export const UNREADABLE_TITLE = 'Ficha no disponible'

export const UNREADABLE_NOTICE =
  'La relación consta, pero la ficha de esta obra no se puede abrir desde esta sesión: puede ' +
  'estar dada de baja o quedar fuera de tu permiso.'

/** A retired artwork at the other end. Only an editor ever sees this one. */
export const RETIRED_NOTICE =
  'Esta obra está dada de baja: la relación consta, pero su ficha no está activa.'

/**
 * A relationship whose kind has a name in neither direction. The database
 * forbids it — an asymmetric kind must carry a non-empty `inverse_name` — and if
 * one arrives anyway the row keeps its verb instead of showing a code next to a
 * blank, which reads as a bug in the screen and not as a broken vocabulary entry.
 */
export const NAMELESS_LABEL = 'Relación sin nombre en el catálogo de tipos'

/** `Alberto Rotili · 1978`, never a bare code (RF-304). */
export function artworkByline(other: ArtworkRef): string {
  return `${ARTIST_LABEL[other.artist]} · ${displayDate(other.execution_date)}`
}

/**
 * One relationship as a line of the record.
 *
 * The three states of the other end are kept apart on purpose, because they mean
 * different things and a screen that merges them lies once a week:
 *
 *   · READABLE AND ACTIVE — the ordinary case, a link and nothing else to say.
 *   · READABLE AND RETIRED — an editor looking at a relationship with a
 *     withdrawn artwork. Still linked (the editor can open it) and said out loud.
 *   · NOT READABLE — no link at all. Sending the cataloger to a record that
 *     answers «no se ha encontrado» would make her think the relationship is
 *     broken, when what is missing is the permission.
 */
export function relatedRow(view: RelationshipView): RelatedArtworkRow {
  const other = view.other
  const label = view.label.trim() === '' ? NAMELESS_LABEL : view.label
  return {
    id: view.id,
    catalogId: view.otherCatalogId,
    label,
    reversed: view.reversed,
    title: other === null ? UNREADABLE_TITLE : displayTitle(other.title),
    byline: other === null ? null : artworkByline(other),
    linked: other !== null,
    notice: other === null ? UNREADABLE_NOTICE : other.active ? null : RETIRED_NOTICE,
    note: view.note,
  }
}

/**
 * Every relationship of an artwork, read from ITS end and ready to paint.
 *
 * The order comes from `relationshipViews`: the kind first, then the code of the
 * other artwork. Grouping by kind is how these are read — «los estudios previos»
 * is a question somebody asks, «lo relacionado con AR-0042» is not.
 */
export function relatedRows(
  rows: readonly RelationshipRow[],
  catalogId: string,
): RelatedArtworkRow[] {
  return relationshipViews(rows, catalogId).map(relatedRow)
}

export interface RelatedGroup {
  /** The kind, as this record reads it: it is the heading of the group. */
  label: string
  rows: RelatedArtworkRow[]
}

/**
 * The lines grouped under their kind, in the order they arrive.
 *
 * Adjacency and not a map: the rows are already sorted by label, so equal labels
 * are together, and keeping the incoming order means the groups appear in the
 * same sequence the list does. A map would also reorder the groups by insertion,
 * which is the same thing until somebody sorts the rows differently.
 */
export function relatedGroups(rows: readonly RelatedArtworkRow[]): RelatedGroup[] {
  const groups: RelatedGroup[] = []
  for (const row of rows) {
    const last = groups[groups.length - 1]
    if (last && last.label === row.label) last.rows.push(row)
    else groups.push({ label: row.label, rows: [row] })
  }
  return groups
}

/**
 * The whole line read out loud, for the accessible name of the link: the verb,
 * the code and the title.
 *
 * On screen the title may be cut and the label sits in a group heading above; a
 * screen reader gets neither for free, and «AR-0013» alone does not say what the
 * relationship is.
 */
export function relatedSentence(row: RelatedArtworkRow): string {
  return `${row.label} ${row.catalogId}, ${row.title}`
}

/**
 * A relationship type name turned into the middle of a sentence: «Estudio previo
 * de» → «estudio previo de», so that `AR-0001 es estudio previo de AR-0002`
 * reads as Spanish and not as a label glued into a gap.
 *
 * Only the first letter, and only when the word is not an acronym: a vocabulary
 * is open (RF-217) and somebody will eventually add «MNCARS lo cataloga como».
 * Lowercasing that would be worse than leaving the capital.
 */
export function predicate(name: string): string {
  const text = name.trim()
  const first = text.slice(0, 1)
  const rest = text.slice(1)
  const word = rest.split(' ')[0] ?? ''
  // An acronym: the rest of the first word is capitals too. Left alone.
  if (word !== '' && word === word.toUpperCase() && word !== word.toLowerCase()) return text
  return first.toLowerCase() + rest
}

/**
 * Where the link of a related artwork points (RF-305), carrying the list's view
 * along in the query string.
 *
 * The view is what defines the sequence the record belongs to (RF-311), and the
 * whole record page passes it on every navigation: dropping it here would make
 * tapping a related artwork silently reset the queue the cataloger was walking.
 */
export function recordLink(
  catalogId: string,
  search = '',
): { pathname: string; search: string } {
  return { pathname: `/artwork/${catalogId}`, search }
}
