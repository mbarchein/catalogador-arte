/**
 * The index of exhibitions: what is asked of the database, in what order it is
 * read, what the search matches and what each row says (RF-502, RF-606, RF-609).
 *
 * Pure and free of React, like everything that decides in this feature: the
 * battery runs in node with no DOM, so the order of a list and the words of a row
 * are verified here or they are not verified at all.
 *
 * **Almost nothing about how an exhibition reads is written here, and that is the
 * point.** The record of an artwork already had to say the dates of a show, name
 * its venue, tell «individual» from «nobody has decided yet» and say whether
 * there was a catalogue, and it says all of it in `documentary/exhibitions/`. This
 * index reuses those functions verbatim: an exhibition has to read the SAME on its
 * own screen as inside the history of an artwork, or the cataloger is reading two
 * dialects of one catalogue. What is new here is only what a list needs and a
 * record does not: the order of the whole table, the search, and the count.
 */

import { fuzzyRankBy } from '../../lib/vocabulary'
import { displayExhibitionDates, exhibitionOrderKey } from '../documentary/documentaryFormat'
import type { ExhibitionRow } from '../documentary/documentaryRows'
import {
  exhibitionOptionText,
  EXHIBITION_OPTION_COLUMNS,
} from '../documentary/exhibitions/participationEdits'
import { exhibitionKindText, exhibitionVenueLine } from '../documentary/exhibitions/exhibitionHistory'

/**
 * The columns of the index, which are the ones the artwork record's chooser
 * already asks for — the whole exhibition plus its venue and the institution
 * behind it.
 *
 * Imported and not rewritten, on purpose: the two lists show the same rows with
 * the same words, so a column added for one of them is a column the other needs.
 * A second copy would be the bug the corners of a photograph already cost this
 * project once — a field the query forgot arriving as `undefined` with the type
 * promising a value.
 */
export const EXHIBITION_COLUMNS = EXHIBITION_OPTION_COLUMNS

/**
 * What the search matches, which is also what the row shows: title, year and
 * venue, in one string.
 *
 * Reused from the chooser, and the reason is the same one written down there: a
 * list whose rows match text they do not show looks arbitrary. The year is in it
 * because two touring shows share a title, and the venue because there is a «Casa
 * de Cultura» in every town.
 */
export { exhibitionOptionText as exhibitionSearchText }

/**
 * The order of the index: **most recent first**, which is the opposite of the
 * history inside an artwork's record.
 *
 * Not a preference, and the two are not in conflict. The history of one artwork is
 * read as a career and the eye goes down the years, so it ascends (RF-502). An
 * index is read to FIND the show whose catalogue is on the table right now, and
 * that one is far likelier to be from this decade than from 1978 — the chooser of
 * the record already sorts this way for exactly that reason.
 *
 * The key is `coalesce(start_date, make_date(year, 1, 1))`, the same the database
 * indexes. A show with no date at all cannot exist — `exhibitions_dated` — and if
 * one arrives anyway it goes LAST and not first, where a missing key would put it
 * at the head of the index.
 *
 * Ties break by title in es-ES and then by identifier, so two shows never swap
 * places between two loads of the same screen.
 */
export function sortExhibitions(rows: readonly ExhibitionRow[]): ExhibitionRow[] {
  return rows.slice().sort((a, b) => {
    const ka = exhibitionOrderKey(a)
    const kb = exhibitionOrderKey(b)
    if (ka !== kb) {
      if (ka == null) return 1
      if (kb == null) return -1
      return ka < kb ? 1 : -1
    }
    return (
      a.title.localeCompare(b.title, 'es', { sensitivity: 'base' }) || a.id.localeCompare(b.id)
    )
  })
}

/** One row of the index, ready to paint. */
export interface ExhibitionIndexEntry {
  row: ExhibitionRow
  /** `12 de marzo – 4 de mayo de 1985`, or `1985`. Never a gap (RF-304). */
  dates: string
  /** The title, in italics on screen (RF-502). Never empty: the database forbids it. */
  title: string
  /** `Museo de Bellas Artes (Diputación de Badajoz), Badajoz, España`, or «Sede sin identificar». */
  venue: string
  /** «Individual», «Colectiva» or the whole sentence for «nobody has decided». */
  kind: string
  /** The character of the show is still an open question, for the badge to read as a notice. */
  kindPending: boolean
  /** In the trash. Shown greyed out — and SAYING so, because grey alone is decoration. */
  retired: boolean
  /** What the search matched, and what the row shows as one line. */
  text: string
  /** Where the typed letters landed in `text`, for the emphasis. */
  indices: number[]
}

/**
 * The rows of the index, best match first.
 *
 * **Retired exhibitions are hidden unless they are asked for** (RF-609: the
 * indexes exclude withdrawn records), and asking for them is the only way one
 * comes back — hiding them always would hide the only way out, which is the same
 * reasoning the venues screen wrote down. They are not silently mixed in: the
 * entry says `retired`, and the screen says the word.
 */
export function rankExhibitions(
  rows: readonly ExhibitionRow[],
  query: string,
  options: { includeRetired?: boolean } = {},
): ExhibitionIndexEntry[] {
  const visible = options.includeRetired === true ? rows : rows.filter((row) => row.active)
  // Sorted BEFORE ranking, not after: `fuzzyRankBy` is stable and keeps the
  // caller's order among equally good matches, so the chronology survives inside
  // each tier of the ranking. An empty query is all ties, and then the index is
  // purely chronological, which is what it looks like it is.
  const ordered = sortExhibitions(visible)
  // `fuzzyRankBy` is the same ranking the chooser and the vocabularies use, so
  // the emphasis on the matched letters behaves identically everywhere.
  return fuzzyRankBy(ordered, exhibitionOptionText, query).map(({ item, indices }) => ({
    row: item,
    dates: displayExhibitionDates(item),
    title: item.title.trim(),
    venue: exhibitionVenueLine(item),
    kind: exhibitionKindText(item.exhibition_type),
    kindPending: item.exhibition_type === 'UNREVIEWED',
    retired: !item.active,
    text: exhibitionOptionText(item),
    indices,
  }))
}

/**
 * How many of the index are in the trash, for the switch that shows them to say
 * so.
 *
 * A switch labelled «Ver también las retiradas» that turns up nothing is a switch
 * that looks broken; one that says «2 retiradas» is an answer before it is
 * pressed.
 */
export function retiredCount(rows: readonly ExhibitionRow[]): number {
  return rows.filter((row) => !row.active).length
}

/**
 * Exhibitions that already carry this title, for the WARNING when one is being
 * created — never for a refusal.
 *
 * `exhibitions` has NO unique index on the title, deliberately and written down in
 * the migration: two touring shows of different years are called the same, and
 * «Alberto Rotili. Antológica» in Badajoz and in Cáceres are two exhibitions. So
 * this cannot refuse anything. What it can do is put the show that already exists
 * in front of the cataloger before she creates the second one, which is the only
 * moment the duplicate is cheap to avoid (RF-909 leaves the rest to team review).
 *
 * The comparison ignores case, accents and surrounding space, because that is how
 * the same title gets typed twice months apart. Retired ones count: a duplicate of
 * something in the trash is still a duplicate, and knowing it is there is what
 * makes somebody recover it instead.
 */
export function similarExhibitions(
  rows: readonly ExhibitionRow[],
  title: string,
): ExhibitionRow[] {
  const key = normalizeTitle(title)
  if (key === '') return []
  return sortExhibitions(rows.filter((row) => normalizeTitle(row.title) === key))
}

/**
 * The comparison key of a title: lowercase, accents dropped, runs of space
 * collapsed.
 *
 * It is NOT `normalizeForSearch` from `vocabulary.ts`, which also strips
 * punctuation: a title is punctuated on purpose — «Rotili. Obra reciente» — and
 * two shows whose titles differ only in a colon are two different titles the
 * cataloger typed differently. It is not `placeKey` either, which keeps the ñ for
 * place names and belongs to the unique index of the venues.
 */
function normalizeTitle(text: string): string {
  return text
    .trim()
    .toLocaleLowerCase('es')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
}

/**
 * The sentence that warns about a title already in the catalogue, with the show
 * that carries it named so the cataloger can tell whether it is hers.
 *
 * Null when there is nothing to warn about. It is an aside and not an error:
 * pressing «Crear» anyway is a legitimate act.
 */
export function similarTitleNotice(matches: readonly ExhibitionRow[]): string | null {
  const first = matches[0]
  if (first === undefined) return null
  const named = `«${first.title.trim()}», ${displayExhibitionDates(first)}, ${exhibitionVenueLine(first)}`
  const more =
    matches.length > 1 ? ` y ${matches.length - 1} más con ese mismo título.` : ''
  const retired = !first.active ? ' Está retirada: recupérala en vez de crearla otra vez.' : ''
  return (
    `Ya hay una exposición con ese título: ${named}.${more}${retired} Puede ser correcto —una ` +
    'itinerante repite el título en cada sede— pero compruébalo antes de crear la segunda.'
  )
}
