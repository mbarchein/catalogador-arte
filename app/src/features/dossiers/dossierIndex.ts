/**
 * The index of dossiers: what is asked of the database, in what order it reads,
 * what the search matches and what each row says (RF-1601, RF-1610, ADR-011).
 *
 * Pure and free of React, like everything that decides in this project: the
 * battery runs in node with no DOM, so the order of a list and the words of a
 * row are verified here or they are not verified at all.
 *
 * **Loaded whole and searched in the client**, the decision `useExhibitions`
 * already took and for the same reason: a studio makes dozens of dossiers, not
 * thousands, so one small query answers every keystroke with no round trip. The
 * day this passes a few hundred rows the search moves to the server and this
 * ranking stays exactly where it is.
 */

import { fuzzyRankBy } from '../../lib/vocabulary'
import type { Dossier } from '../../lib/types'

/**
 * The columns of the index, written out because a TypeScript type does not exist
 * at run time. Held to `Dossier` by a test: a field the query forgets arrives as
 * `undefined` with the type promising a value.
 *
 * The recipient comes joined and not as a second query — the row says who the
 * dossier is for, and a list of twelve dossiers would otherwise be thirteen
 * requests.
 */
export const DOSSIER_COLUMNS =
  'id, title, purpose, note, cover_text, recipient_party_id, ' +
  'show_provenance, show_exhibitions, show_bibliography, show_prices, show_index, active'

/** The same, plus the recipient's name, which is what the index paints. */
export const DOSSIER_INDEX_COLUMNS = `${DOSSIER_COLUMNS}, recipient:parties(id, name)`

/** A dossier as the index reads it: the row plus the name of who it goes to. */
export interface DossierRow extends Dossier {
  /** Null when there is no recipient, or when the party cannot be read. */
  recipient: { id: string; name: string } | null
}

/**
 * What the search matches, which is also what the row shows: title, purpose and
 * recipient in one string.
 *
 * A list whose rows match text they do not show looks arbitrary — the rule this
 * project already wrote down for the exhibitions chooser. The recipient is in it
 * because «la de la galería de Madrid» is how a dossier gets named out loud
 * months later.
 */
export function dossierSearchText(row: DossierRow): string {
  return [row.title.trim(), row.purpose.trim(), row.recipient?.name.trim() ?? '']
    .filter((part) => part !== '')
    .join(' · ')
}

/**
 * The order of the index: **the most recently touched first**, and the title as
 * tiebreaker.
 *
 * A dossier is not a chronology like an exhibition: it is a working document,
 * and the one being looked for is almost always the one being worked on. There
 * is no date in the row to sort by —`updated_at` is a trace column this client
 * does not read— so the order is the title in es-ES, which at least never swaps
 * two rows between two loads of the same screen. When the sort key changes this
 * comment is the place where the reason has to change with it.
 */
export function sortDossiers(rows: readonly DossierRow[]): DossierRow[] {
  return rows
    .slice()
    .sort(
      (a, b) =>
        a.title.localeCompare(b.title, 'es', { sensitivity: 'base' }) || a.id.localeCompare(b.id),
    )
}

/** One row of the index, ready to paint. */
export interface DossierIndexEntry {
  row: DossierRow
  /** Never empty: the database forbids a blank title. */
  title: string
  /** `Galería Serrano · con precios`, or «Sin destinatario». Never a gap (RF-304). */
  subtitle: string
  /** In the trash. Shown greyed out and SAYING so, because grey alone is decoration. */
  retired: boolean
  /** What the search matched, for the emphasis on the typed letters. */
  text: string
  indices: number[]
}

/**
 * What the second line of a row says: who it is for and whether it carries
 * prices.
 *
 * The prices are named here and nowhere else in the index, and on purpose: it is
 * the one setting with a consequence outside the studio, so the row that carries
 * them says it before anybody opens it (ADR-011 accepts that a consultation
 * account reads them).
 */
export function dossierSubtitle(row: DossierRow): string {
  const parts: string[] = []
  const who = row.recipient?.name.trim() ?? ''
  parts.push(who !== '' ? who : 'Sin destinatario')
  const purpose = row.purpose.trim()
  if (purpose !== '' && purpose !== who) parts.push(purpose)
  if (row.show_prices) parts.push('con precios')
  return parts.join(' · ')
}

/**
 * The rows of the index, best match first.
 *
 * **Retired dossiers are hidden unless they are asked for** (RF-609), and asking
 * for them is the only way one comes back: hiding them always would hide the
 * only way out. They are not silently mixed in — the entry says `retired` and
 * the screen says the word.
 */
export function rankDossiers(
  rows: readonly DossierRow[],
  query: string,
  options: { includeRetired?: boolean } = {},
): DossierIndexEntry[] {
  const visible = options.includeRetired === true ? rows : rows.filter((row) => row.active)
  // Sorted BEFORE ranking: `fuzzyRankBy` is stable and keeps this order among
  // equally good matches, so an empty query is a purely alphabetical index.
  const ordered = sortDossiers(visible)
  return fuzzyRankBy(ordered, dossierSearchText, query).map(({ item, indices }) => ({
    row: item,
    title: item.title.trim(),
    subtitle: dossierSubtitle(item),
    retired: !item.active,
    text: dossierSearchText(item),
    indices,
  }))
}

/**
 * How many of the index are in the trash, for the switch that shows them to say
 * so.
 *
 * A switch labelled «Ver también los retirados» that turns up nothing looks
 * broken; one that says «2 retirados» is an answer before it is pressed.
 */
export function retiredCount(rows: readonly DossierRow[]): number {
  return rows.filter((row) => !row.active).length
}

/**
 * What goes where the rows would go, or null when there are rows to paint
 * (RF-304: never a blank page).
 *
 * The three states are different answers and none of them is an empty list: the
 * query in the air, the query that failed —which says nothing here, because the
 * error has its own line and «no hay ninguno» over a failed query is the screen
 * asserting what it does not know— and the catalogue that genuinely has none.
 */
export function dossiersNotice(state: {
  loading: boolean
  error: string | null
  count: number
  query: string
}): string | null {
  if (state.error !== null) return null
  if (state.loading && state.count === 0) return 'Cargando los dossieres…'
  if (state.count > 0) return null
  if (state.query.trim() !== '') return 'No hay ningún dossier que coincida con lo que buscas.'
  return 'Todavía no hay ningún dossier. El primero se arma eligiendo obras del catálogo.'
}
