/**
 * How the exhibition history of an artwork reads (RF-501, RF-502).
 *
 * Everything this block DECIDES lives here: what a participation says on one
 * line, in what words the venue is named, how the character of the show is told
 * apart from nobody having decided it yet, and what the block says when the
 * catalogue holds nothing. The component next door only paints it.
 *
 * That split is not tidiness: the battery runs in node, with no DOM, so a
 * sentence written inside JSX is a sentence nothing verifies. And these
 * sentences are the ones that decide whether a reader concludes that an artwork
 * was never exhibited.
 *
 * The dates are NOT composed here. `displayExhibitionDates` already says the
 * interval in the shortest form that says everything, and it is shared with the
 * other four blocks so the whole record speaks one dialect of Spanish.
 */

import { EXHIBITION_TYPE_LABEL, type ExhibitionTypeValue, type ResearchStatus } from '../../../lib/types'
import { normalizeForSearch } from '../../../lib/vocabulary'
import { displayExhibitionDates } from '../documentaryFormat'
import type { ExhibitionRow, ParticipationRow, VenueRow } from '../documentaryRows'
import type { BlockState } from '../researchState'

// ── Individual or collective (RF-501) ────────────────────────

/**
 * The character of the show, with «Sin revisar» spelled out as a sentence.
 *
 * The enum's own label for `UNREVIEWED` is the bare «Sin revisar», which is
 * right on a form —the field is next to its own name— and wrong on a badge
 * hanging off the title of a show, where it would read as if the EXHIBITION were
 * unreviewed rather than its character. A press cutting gives the title long
 * before it says whether the artist showed alone.
 */
export function exhibitionKindText(type: ExhibitionTypeValue): string {
  if (type === 'UNREVIEWED') return 'Sin revisar si fue individual o colectiva'
  return EXHIBITION_TYPE_LABEL[type]
}

/**
 * Whether the character of the show is still an open question, for the badge to
 * be painted as a notice instead of as a datum.
 *
 * A name and not a colour, the same choice `BlockTone` makes: the wording and
 * the palette have to be able to move without each other.
 */
export function exhibitionKindPending(type: ExhibitionTypeValue): boolean {
  return type === 'UNREVIEWED'
}

// ── The venue (RF-502, RF-512) ───────────────────────────────

/** `Badajoz, España`, with whichever half is missing dropped. */
function placeText(row: { locality: string; country: string }): string {
  return [row.locality.trim(), row.country.trim()].filter((part) => part !== '').join(', ')
}

/**
 * The institution behind the venue, when saying it adds something.
 *
 * It is dropped when the venue name already carries it — «Museo de Bellas Artes
 * de Badajoz» whose institution is the «Museo de Bellas Artes de Badajoz» would
 * print the same name twice on a phone line — and kept when they differ, because
 * «Sala de exposiciones» alone identifies nothing and RF-502 asks for the
 * institution.
 *
 * The comparison is accent- and case-insensitive and by containment, which is
 * the same normalisation the vocabulary search uses: the two names are typed by
 * hand into two different tables, months apart.
 */
function institutionAside(venue: VenueRow): string | null {
  const institution = venue.party?.name.trim() ?? ''
  if (institution === '') return null
  const name = normalizeForSearch(venue.name)
  const other = normalizeForSearch(institution)
  if (other === '' || name.includes(other) || other.includes(name)) return null
  return institution
}

/**
 * Where the show happened, as one line: `Museo de Bellas Artes (Diputación de
 * Badajoz), Badajoz, España`.
 *
 * Three cases, and the third is the one that matters. A venue on record as free
 * text — «una galería de Madrid» — is a legitimate datum and not a missing
 * record: it is what the press cutting said, and inventing a venue record to be
 * able to store it is how a catalogue ends up with two Casas de Cultura. With
 * neither, the line says so rather than leaving the row headless (RF-304).
 */
export function exhibitionVenueLine(exhibition: ExhibitionRow): string {
  const venue = exhibition.venue
  if (venue) {
    const aside = institutionAside(venue)
    const head = aside === null ? venue.name.trim() : `${venue.name.trim()} (${aside})`
    const place = placeText(venue)
    return place === '' ? head : `${head}, ${place}`
  }
  const note = exhibition.venue_note.trim()
  return note !== '' ? note : 'Sede sin identificar'
}

/**
 * The free-text venue when there is ALSO a venue record, which is the only case
 * `exhibitionVenueLine` cannot print.
 *
 * It is not noise: it is usually what the source literally said («en la sala
 * baja»), kept next to the record somebody later identified. Dropping it would
 * silently discard a transcription.
 */
export function exhibitionVenueNote(exhibition: ExhibitionRow | null): string | null {
  if (exhibition === null) return null
  const note = exhibition.venue_note.trim()
  if (note === '' || exhibition.venue === null) return null
  return note
}

// ── The line of the history (RF-502) ─────────────────────────

/**
 * The three pieces of the canonical line, in the order RF-502 fixes: when,
 * what, where.
 *
 * They come out apart and not joined because the title goes in italics on
 * screen, and `exhibitionCitationLine` joins these very three so the printed
 * line and the painted row can never say different things — there is a test
 * holding them together.
 */
export interface ExhibitionCitationParts {
  /** `12 de marzo – 4 de mayo de 1985`, or `1985`. Never empty (RF-304). */
  dates: string
  /** The title of the show. In italics on screen (RF-502). */
  title: string
  /** `Museo de Bellas Artes, Badajoz, España`. */
  venue: string
}

/**
 * What the reader of the record cannot see: the exhibition row itself.
 *
 * It happens to a Reader when the show has been retired — the bridge row of this
 * artwork is alive, the exhibition behind it is in the trash, and the select
 * policy hands over the first and not the second. The participation is real, and
 * saying that its exhibition is not available is the only honest thing to print.
 */
export const EXHIBITION_UNAVAILABLE = 'Exposición no disponible'

/** The pieces of the RF-502 line for one participation. */
export function exhibitionCitationParts(row: ParticipationRow): ExhibitionCitationParts {
  const exhibition = row.exhibition
  if (exhibition === null) {
    return { dates: '', title: EXHIBITION_UNAVAILABLE, venue: '' }
  }
  return {
    dates: displayExhibitionDates(exhibition),
    title: exhibition.title.trim(),
    venue: exhibitionVenueLine(exhibition),
  }
}

/**
 * The participation as the catalogue cites it, on one line (RF-502).
 *
 * The chronology heads it because that is the order RF-502 fixes and because
 * this list is read as a career: the eye goes down the years. It is also the
 * accessible name of the row, which is why it has to be a whole sentence and not
 * the fragments the layout happens to stack.
 */
export function exhibitionCitationLine(row: ParticipationRow): string {
  const { dates, title, venue } = exhibitionCitationParts(row)
  return [dates, title, venue].filter((part) => part.trim() !== '').join(', ')
}

// ── The catalogue of the show (RF-503, RF-513) ───────────────

/**
 * Whether the show had a catalogue, and whether that catalogue is already a
 * bibliographic record (RF-503).
 *
 * Three answers and not two, because `catalogue_published` is a `TriState` and
 * «Sin revisar» is not «No»: a show whose catalogue nobody has looked for is not
 * a show without a catalogue, and the difference is a morning in a library.
 */
export function catalogueText(exhibition: ExhibitionRow): string {
  if (exhibition.catalogue_published === 'NO') return 'Sin catálogo'
  if (exhibition.catalogue_published === 'UNREVIEWED') return 'Sin revisar si hubo catálogo'
  return exhibition.catalogue_reference_id === null
    ? 'Con catálogo, todavía sin ficha en la bibliografía'
    : 'Con catálogo, con ficha en la bibliografía'
}

/**
 * The number this artwork carried in that show's catalogue (RF-513), or the
 * sentence saying it is not recorded — or nothing at all.
 *
 * The third case is the point. «Sin número de catálogo registrado» only means
 * something where a catalogue exists to have a number in: printed under a show
 * that consta sin catálogo it would invent a gap, and under one whose catalogue
 * nobody has looked for it would answer a question that has not been asked. So
 * it is said when the catalogue consta publicado, and kept quiet otherwise.
 */
export function catalogueNumberText(row: ParticipationRow): string | null {
  const number = row.catalogue_number.trim()
  if (number !== '') return `Nº ${number} en el catálogo`
  if (row.exhibition?.catalogue_published === 'YES') return 'Sin número de catálogo registrado'
  return null
}

// ── Retired rows behind a live participation (RF-901) ────────

/**
 * That what is being read is in the trash, said out loud.
 *
 * The queries of this feature do not hide a retired exhibition or a retired
 * venue behind a live participation, for the reason `usePhysicalPlaces` wrote
 * down once: hiding it would leave a blank where a name used to be. What is
 * shown greyed out has to also SAY why it looks different, or the grey is
 * decoration.
 *
 * The exhibition wins over the venue when both are retired: it is the row this
 * line is about, and two notices on one row of a phone is one too many.
 */
export function retirementNotice(exhibition: ExhibitionRow | null): string | null {
  if (exhibition === null) return null
  if (!exhibition.active) {
    return 'Esta exposición está retirada del catálogo; se muestra porque la participación de esta obra sigue viva.'
  }
  if (exhibition.venue !== null && !exhibition.venue.active) {
    return 'La sede está retirada del catálogo.'
  }
  return null
}

// ── Individual and collective, counted (RF-501) ──────────────

export interface ExhibitionKindCounts {
  individual: number
  collective: number
  /** Shows whose character nobody has decided yet. Not «neither»: unknown. */
  unreviewed: number
}

/** How many of each character the history holds. Rows without a visible exhibition are not counted. */
export function exhibitionKindCounts(rows: readonly ParticipationRow[]): ExhibitionKindCounts {
  const counts: ExhibitionKindCounts = { individual: 0, collective: 0, unreviewed: 0 }
  for (const row of rows) {
    const type = row.exhibition?.exhibition_type
    if (type === 'INDIVIDUAL') counts.individual += 1
    else if (type === 'COLLECTIVE') counts.collective += 1
    else if (type === 'UNREVIEWED') counts.unreviewed += 1
  }
  return counts
}

/** `1 individual, 2 colectivas y 1 sin clasificar`, agreeing in number. */
function kindPieces(counts: ExhibitionKindCounts): string[] {
  const pieces: string[] = []
  if (counts.individual > 0) {
    pieces.push(`${counts.individual} ${counts.individual === 1 ? 'individual' : 'individuales'}`)
  }
  if (counts.collective > 0) {
    pieces.push(`${counts.collective} ${counts.collective === 1 ? 'colectiva' : 'colectivas'}`)
  }
  // «Sin clasificar» is invariable, and it is the piece that must not be dressed
  // up as an answer: these are shows nobody has told apart yet.
  if (counts.unreviewed > 0) pieces.push(`${counts.unreviewed} sin clasificar`)
  return pieces
}

/**
 * What the history is made of, above the rows: «Del historial registrado: 1
 * individual y 2 colectivas.»
 *
 * Null with fewer than two shows, and that is deliberate: with one row the badge
 * on that row already says its character, and a summary repeating it is a line
 * of a phone spent saying nothing. Null too when no row has a visible
 * exhibition, because then nothing has been counted.
 */
export function exhibitionKindSummary(rows: readonly ParticipationRow[]): string | null {
  if (rows.length < 2) return null
  const pieces = kindPieces(exhibitionKindCounts(rows))
  if (pieces.length === 0) return null
  const last = pieces[pieces.length - 1] ?? ''
  const list = pieces.length === 1 ? last : `${pieces.slice(0, -1).join(', ')} y ${last}`
  return `Del historial registrado: ${list}.`
}

// ── What the block can say, given what loaded ────────────────

export interface HistoryLoadInput {
  /** The participations query is in flight. */
  rowsLoading: boolean
  /** The database's own message from the participations query, or null. */
  rowsError: string | null
  /** The research status of this block, null when it is not known. */
  status: ResearchStatus | null
  /** The artwork's documentary row is in flight. */
  statusLoading: boolean
  /** The database's own message from the documentary row, or null. */
  statusError?: string | null
}

export interface HistoryLoadState {
  loading: boolean
  error: string | null
  /**
   * Said above everything when the participations are known and the state of the
   * research is not. Null when it is known.
   */
  statusUnknownNotice: string | null
}

/**
 * What the block shows while its TWO queries settle — the participations, and
 * the artwork row that says whether anybody has investigated them.
 *
 * The combination that needs deciding is the awkward one: rows loaded, status
 * not. Painting «Ninguna registrada» then would be publishing the sentence this
 * whole feature exists to avoid, because with no status the block cannot tell
 * «nobody has looked» from «looked and found nothing». So while the status is in
 * flight the heading says «Cargando…», and if it never arrives the block says
 * out loud that it cannot tell.
 *
 * A failure of the participations themselves wins over everything: nothing is
 * shown, because a list that lost a row is worse than no list.
 */
export function historyLoadState(input: HistoryLoadInput): HistoryLoadState {
  if (input.rowsError !== null) {
    return { loading: false, error: input.rowsError, statusUnknownNotice: null }
  }
  if (input.rowsLoading || input.statusLoading) {
    return { loading: true, error: null, statusUnknownNotice: null }
  }
  if (input.status === null) {
    const message = (input.statusError ?? '').trim()
    return {
      loading: false,
      error: null,
      statusUnknownNotice:
        'No se ha podido leer si alguien ha investigado el historial expositivo de esta obra: ' +
        'que aquí no aparezca una exposición no significa que la obra no se haya expuesto.' +
        (message === '' ? '' : ` (${message})`),
    }
  }
  return { loading: false, error: null, statusUnknownNotice: null }
}

/**
 * The block's state with the «nobody could read the research state» notice put
 * where it will actually be read.
 *
 * It cannot simply be painted among the rows, and that is the whole reason this
 * function exists: `DocumentarySection` shows the rows only when the block HAS
 * rows, so on an empty block — precisely the case where the distinction decides
 * how the emptiness is read — a notice among the children would never appear. So
 * it takes the place of the empty text when there are no rows, and rides above
 * them when there are.
 *
 * With no notice the state is returned untouched, which is the ordinary path: the
 * research state was read and `blockState` has already said everything.
 */
export function historyBlockState(state: BlockState, notice: string | null): BlockState {
  if (notice === null) return state
  return {
    ...state,
    emptyText: state.count === 0 ? notice : null,
    partialText: state.count === 0 ? null : notice,
  }
}
