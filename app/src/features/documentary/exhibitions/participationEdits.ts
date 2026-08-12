/**
 * Adding and retiring the participation of an artwork in an exhibition
 * (RF-501, RF-517) — everything about it that is a decision rather than a query.
 *
 * The block only ever LINKS to exhibitions that are already in the catalogue.
 * Creating the exhibition itself is another screen (RF-309: the exhibition record
 * has its own title, dates, venue and catalogue), and pretending otherwise from
 * a bottom sheet on a phone is how a catalogue gets two rows for the same show.
 * What this module owes the cataloger is that the refusal be a sentence and not
 * an empty list.
 *
 * Pure and free of React: what gets offered, what gets marked, what gets
 * refused and why is verified by the battery, which cannot open a component.
 */

import type { ResearchStatus } from '../../../lib/types'
import { fuzzyRankBy } from '../../../lib/vocabulary'
import type { ExhibitionRow, ParticipationRow } from '../documentaryRows'
import { exhibitionVenueLine } from './exhibitionHistory'

/**
 * The exhibitions on offer, as PostgREST wants them.
 *
 * The same shape the history reads (`ExhibitionRow`), on purpose: the sheet shows
 * a show exactly as the row under it will once added, so choosing is comparing
 * like with like. Written out by hand because a type does not exist at run time,
 * and held to the interface by a test.
 */
export const EXHIBITION_OPTION_COLUMNS =
  'id, title, exhibition_type, venue_id, venue_note, year, start_date, end_date, date_note, ' +
  'catalogue_published, catalogue_reference_id, note, ' +
  // El cartel (RF-518): la miniatura la pinta el listado, así que viaja con la fila y
  // no en una segunda consulta por exposición.
  'poster_thumbnail_path, poster_derivative_path, poster_uploaded_at, active, ' +
  'venue:exhibition_venues(id, name, locality, country, party_id, note, active, ' +
  'party:parties(id, party_type, name, locality, country, active))'

/**
 * What the cataloger reads on a row of the chooser, which is also what the search
 * matches against.
 *
 * One string for both, and not a nice label plus a hidden search key: a list
 * whose rows match text they do not show looks arbitrary, and the same rule is
 * already written down in `SearchableCheckList`.
 *
 * The year is in it because two touring shows share a title, and the venue
 * because «Casa de Cultura» is in every town — the venues table is unique by name
 * AND locality for that very reason.
 */
export function exhibitionOptionText(option: ExhibitionRow): string {
  const year = option.year === null ? 'sin año' : String(option.year)
  return `${option.title.trim()} · ${year} · ${exhibitionVenueLine(option)}`
}

/** One row of the chooser. */
export interface ExhibitionChoice {
  option: ExhibitionRow
  /** `exhibitionOptionText`, ready to paint. */
  text: string
  /** Where the typed letters landed in `text`, for the emphasis. */
  indices: number[]
  /**
   * This artwork is already in that show. The row is still LISTED — hiding it
   * would make the chooser look as if the show were not registered and invite
   * creating a duplicate — but it cannot be chosen again.
   */
  alreadyInHistory: boolean
}

/** The exhibitions this artwork already participates in. */
export function participatingExhibitionIds(rows: readonly ParticipationRow[]): Set<string> {
  return new Set(rows.map((row) => row.exhibition_id))
}

/**
 * The exhibitions to offer, best match first.
 *
 * Retired shows are dropped and not marked: this is a list to CHOOSE from, and
 * offering something the catalogue has withdrawn would put it back into use
 * through the back door. That is the opposite of the rule that governs a show
 * already linked from a live participation, which is shown precisely because
 * hiding it would lose a name — a chooser and a record are not the same screen.
 */
export function rankExhibitionOptions(
  options: readonly ExhibitionRow[],
  query: string,
  taken: ReadonlySet<string>,
): ExhibitionChoice[] {
  const offered = options.filter((option) => option.active)
  return fuzzyRankBy(offered, exhibitionOptionText, query).map(({ item, indices }) => ({
    option: item,
    text: exhibitionOptionText(item),
    indices,
    alreadyInHistory: taken.has(item.id),
  }))
}

/**
 * What the chooser says instead of an empty list, which it never is (RF-304).
 *
 * The two cases are different and confusing them wastes an afternoon: the
 * catalogue has no exhibitions at all yet, or it has them and none matches. The
 * second one also has to say where a new show is created, because otherwise the
 * cataloger types the title of a show she is holding a catalogue of, finds
 * nothing, and concludes the search is broken.
 *
 * Both sentences said «pendiente en esta entrega» until that screen was mounted;
 * now they say its NAME and where the door is, which is the whole difference between
 * a dead end and a detour. Neither uses guillemets: the third case of this chooser
 * is a search with nothing typed, and there the quotation marks would be empty.
 */
export function noOptionsText(total: number, query: string): string {
  if (total === 0) {
    return (
      'Todavía no hay ninguna exposición registrada. Se dan de alta en la pantalla Exposiciones.'
    )
  }
  const typed = query.trim()
  const about = typed === '' ? '' : ` con «${typed}»`
  return (
    `Ninguna de las exposiciones registradas coincide${about}. Aquí solo se enlaza con ` +
    'exposiciones que ya están en el catálogo: dar de alta una exposición nueva se hace en la ' +
    'pantalla Exposiciones, en el menú de abajo.'
  )
}

/**
 * Why a participation cannot be added right now, before asking the database.
 *
 * The database refuses it and says so in Spanish — `tg_artwork_exhibition_status_coherent`
 * — and that refusal is worth showing verbatim when it happens. But a control
 * that is going to be refused should say so BEFORE it is pressed: the cataloger
 * is standing up, and a round trip to be told no is worse than a disabled button
 * that explains itself.
 *
 * The wording follows the database's own hint, not a second version of the rule:
 * change the state of the research first, or retire nothing.
 */
export function addBlockedReason(status: ResearchStatus | null): string | null {
  if (status !== 'NONE_FOUND') return null
  return (
    'El historial consta «Investigado, sin resultados»: ponlo en «Investigación en curso» o «Investigación completa».'
  )
}

/** What is sent to `exhibit_artwork`, with the text trimmed as the database stores it. */
export interface ParticipationPayload {
  p_catalog_id: string
  p_exhibition_id: string
  p_catalogue_number: string
  p_note: string
}

/**
 * The arguments of the `exhibit_artwork` RPC — which is called instead of a plain
 * insert, and not for convenience: the unique constraint covers RETIRED
 * participations too, so re-adding one that is in the trash would crash into the
 * index with a message about a constraint (RF-517). The function restores it
 * instead.
 *
 * Blank fields are sent blank on purpose. The RPC keeps whatever is already
 * stored when what arrives is blank — «lo que no se manda no se borra» — so
 * re-adding a show from a form that opens empty cannot wipe the catalogue number
 * somebody researched.
 */
export function participationPayload(
  catalogId: string,
  exhibitionId: string,
  catalogueNumber: string,
  note: string,
): ParticipationPayload {
  return {
    p_catalog_id: catalogId,
    p_exhibition_id: exhibitionId,
    p_catalogue_number: catalogueNumber.trim(),
    p_note: note.trim(),
  }
}

/**
 * The two-tap confirmation of retiring a participation, which has to say exactly
 * what disappears and what does not.
 *
 * Nothing is ever deleted (RF-901): what happens is that this artwork stops being
 * listed in that show. The exhibition, its dates and its catalogue stay in the
 * catalogue for every other artwork, and saying so is what stops the cataloger
 * from thinking she is about to destroy a show she spent a morning documenting.
 */
export function retireConfirmText(row: ParticipationRow): string {
  const title = row.exhibition?.title.trim() ?? ''
  const about = title === '' ? 'esta exposición' : `«${title}»`
  return (
    `Se retirará la participación de esta obra en ${about}. La exposición sigue en el catálogo ` +
    'con el resto de sus obras, y la participación se puede volver a añadir.'
  )
}
