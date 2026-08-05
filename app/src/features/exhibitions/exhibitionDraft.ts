/**
 * The exhibition as it is being written (RF-501, RF-502, RF-503, RF-512).
 *
 * Everything the form DECIDES before it talks to the database lives here: what a
 * blank draft holds, what stops it from being saved, what travels in the request
 * and what «no ha cambiado nada» means. The component next door only paints
 * fields.
 *
 * That split is the only way any of it gets verified: the battery runs in node,
 * with no DOM, so a rule written inside JSX is a rule nothing checks. And these
 * rules are the ones that decide whether the cataloger gets «revisa las dos
 * fechas» or the name of a check constraint in English.
 *
 * ── THE DATES ARE NOT THE STRUCTURED DATE OF ADR-004, AND THAT IS DELIBERATE ──
 *
 * The artwork and the links of a provenance chain carry `start_year`, `end_year`,
 * `approximate_date` and `unconfirmed_date`, because an artwork can be «c. 1975»
 * and a deposit can have begun «a finales de los setenta». An exhibition cannot.
 * It opened on a day and closed on a day, and either those days are known or they
 * are not: the schema says so in its own comment, and gives `exhibitions` a bare
 * `year` plus two real `date` columns. So there is no `c.` here and no `[?]`, and
 * the free text that carries what the structure cannot hold is `date_note`.
 *
 * ── THE YEAR IS NEVER WRITTEN NEXT TO A DATE ──────────────────
 *
 * `exhibitions_year_matches_start_date` refuses a year that contradicts the
 * opening date, and `tg_exhibition_year_from_dates` fills the year FROM the date
 * — never the other way round, because from a bare year a first of January would
 * be an opening nobody documented. Sending both is therefore asking to be
 * refused sooner or later: this module sends the year ONLY when there is no
 * opening date, and the database derives it otherwise. That check cannot be hit
 * from this screen by construction, which is better than a message explaining it.
 */

import type { Exhibition, ExhibitionTypeValue, TriState } from '../../lib/types'

/** The plausible bounds of `exhibitions_plausible_year`, mirrored so the form can say them. */
export const MIN_EXHIBITION_YEAR = 1000
export const MAX_EXHIBITION_YEAR = 2100

/**
 * An exhibition being created or corrected.
 *
 * Text and not numbers or nulls, because that is what a form holds: a half-typed
 * year is «19», which is neither a number nor an absence, and turning it into one
 * too early is how a field fights the finger typing in it. The conversion happens
 * once, in `exhibitionPayload`.
 *
 * `catalogue_reference_id` — the catalogue of the show as a bibliographic record
 * (RF-503) — is NOT here, and its absence is load-bearing: choosing it needs the
 * bibliography's own chooser, which is another screen. What IS here is
 * `hasCatalogueRecord`, read off the row being edited, because the database
 * refuses `catalogue_published <> 'YES'` while that link exists
 * (`exhibitions_catalogue_reference_needs_catalogue`) and this screen has no way
 * to remove it. Without knowing, the form would offer a save that cannot work.
 */
export interface ExhibitionDraft {
  title: string
  exhibitionType: ExhibitionTypeValue
  /** The venue's identifier, or '' for «no está identificada». Chosen, never typed. */
  venueId: string
  /** The venue as the source names it: «una galería de Madrid». */
  venueNote: string
  /** `YYYY-MM-DD` as `input[type=date]` hands it over, or ''. */
  startDate: string
  endDate: string
  /** Only read when there is no opening date. See the header. */
  year: string
  dateNote: string
  cataloguePublished: TriState
  note: string
  /**
   * The show already has its catalogue linked to a bibliographic record. Read
   * from the row and never edited here.
   */
  hasCatalogueRecord: boolean
}

/**
 * A blank draft.
 *
 * `exhibitionType` starts on `UNREVIEWED` and `cataloguePublished` too, and
 * neither is a placeholder: a press cutting gives the title of a show long before
 * it says whether the artist showed alone, and «sin revisar» no es «no». Starting
 * them on `INDIVIDUAL` or on `NO` would publish an answer nobody has given.
 */
export function emptyExhibitionDraft(): ExhibitionDraft {
  return {
    title: '',
    exhibitionType: 'UNREVIEWED',
    venueId: '',
    venueNote: '',
    startDate: '',
    endDate: '',
    year: '',
    dateNote: '',
    cataloguePublished: 'UNREVIEWED',
    note: '',
    hasCatalogueRecord: false,
  }
}

/** The draft that opens when an existing exhibition is corrected. */
export function exhibitionDraft(row: Exhibition): ExhibitionDraft {
  return {
    title: row.title,
    exhibitionType: row.exhibition_type,
    venueId: row.venue_id ?? '',
    venueNote: row.venue_note,
    startDate: row.start_date ?? '',
    endDate: row.end_date ?? '',
    // The year is shown only when it is the only date there is: with an opening
    // date it is the database's own derivation, and offering it for editing would
    // offer a contradiction.
    year: row.start_date === null && row.year !== null ? String(row.year) : '',
    dateNote: row.date_note,
    cataloguePublished: row.catalogue_published,
    note: row.note,
    hasCatalogueRecord: row.catalogue_reference_id !== null,
  }
}

/** `YYYY-MM-DD`, and a real day of a real month. `input[type=date]` gives this or ''. */
export function isIsoDate(text: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text)
  if (!match) return false
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])]
  if (month < 1 || month > 12 || day < 1 || day > 31) return false
  // Taken apart by hand and compared back, never through the local time zone: an
  // exhibition date is a wall-clock day, and the same reasoning as
  // `documentaryFormat.splitIso`. `Date.UTC` is arithmetic, not a zone.
  const probe = new Date(Date.UTC(year, month - 1, day))
  return probe.getUTCFullYear() === year && probe.getUTCMonth() === month - 1 && probe.getUTCDate() === day
}

/** The year the draft claims, or null when it says nothing. NaN is not a year. */
function draftYear(draft: ExhibitionDraft): number | null {
  const typed = draft.year.trim()
  if (typed === '') return null
  if (!/^\d{1,4}$/.test(typed)) return Number.NaN
  return Number(typed)
}

/**
 * What stops this draft from being saved, or null — said in Spanish, with the
 * consequence, and BEFORE the round trip.
 *
 * Every sentence here mirrors a rule the database also holds, and the duplication
 * is deliberate and bounded: the cataloger is standing up in a storeroom, and
 * being told «revisa las dos fechas» by the field she is looking at beats being
 * told `exhibitions_coherent_dates` by a server three seconds later. The database
 * still has the last word — `exhibitionFailureText` translates every one of these
 * codes for the day a draft gets past this function.
 *
 * The order matters: the title first, because a show with no title cannot be
 * cited at all, and the dates in the order they are typed.
 */
export function exhibitionDraftProblem(draft: ExhibitionDraft): string | null {
  if (draft.title.trim() === '') {
    return 'Escribe el título de la exposición: es lo que la ficha de cada obra imprime en su historial.'
  }

  const start = draft.startDate.trim()
  const end = draft.endDate.trim()
  if (start !== '' && !isIsoDate(start)) return 'La fecha de apertura no es una fecha: revísala.'
  if (end !== '' && !isIsoDate(end)) return 'La fecha de cierre no es una fecha: revísala.'

  // `exhibitions_coherent_dates`, both halves. A closing date with no opening one
  // is half a date, and the schema rejects it with the same all-or-nothing
  // criterion it applies to the corrected copy of a photograph.
  if (end !== '' && start === '') {
    return (
      'Una fecha de cierre sin fecha de apertura es media fecha. Pon la de apertura, o deja solo ' +
      'el año y escribe lo que sepas en la nota de las fechas.'
    )
  }
  if (start !== '' && end !== '' && end < start) {
    return 'La exposición cerraría antes de abrir. Revisa las dos fechas.'
  }

  const year = draftYear(draft)
  if (start === '') {
    // `exhibitions_dated`: no year and no opening date cannot be placed in a
    // chronological history, and placing it last «porque no se sabe» would be
    // inventing the datum.
    if (year === null) {
      return (
        'Pon al menos el año. El historial expositivo de cada obra se ordena por fecha, y una ' +
        'exposición sin fechar no se puede colocar en él.'
      )
    }
    if (Number.isNaN(year)) return 'El año son cuatro cifras: 1985.'
    if (year < MIN_EXHIBITION_YEAR || year > MAX_EXHIBITION_YEAR) {
      return `El año tiene que estar entre ${MIN_EXHIBITION_YEAR} y ${MAX_EXHIBITION_YEAR}: fuera de ahí es una errata, no una fecha.`
    }
  }

  // `exhibitions_catalogue_reference_needs_catalogue`. The reverse is allowed and
  // is the normal state while researching: a catalogue can be on record as
  // published and not yet be a bibliographic record.
  if (draft.hasCatalogueRecord && draft.cataloguePublished !== 'YES') {
    return (
      'El catálogo de esta exposición ya está dado de alta en la bibliografía, así que no puede ' +
      'constar que no lo hubo. Deja «Sí», o quita antes esa ficha del catálogo desde la ' +
      'bibliografía.'
    )
  }

  return null
}

/** What travels to `exhibitions`, with every text trimmed as the database stores it. */
export interface ExhibitionPayload {
  title: string
  exhibition_type: ExhibitionTypeValue
  venue_id: string | null
  venue_note: string
  year: number | null
  start_date: string | null
  end_date: string | null
  date_note: string
  catalogue_published: TriState
  note: string
}

/**
 * The draft as a row.
 *
 * The title is trimmed because `exhibitions_title_not_blank` demands it is not
 * blank — unlike the venues table it does NOT demand it already be trimmed, a
 * title gets pasted out of a PDF, and trimming it anyway is what stops «Rotili »
 * and «Rotili» from being two shows in the index.
 *
 * `year: null` whenever there is an opening date: the trigger derives it, and the
 * check that would refuse a contradiction can therefore never be reached from
 * this screen. See the header.
 *
 * An empty `venueId` travels as `null` and not as '': the column is a foreign key
 * and '' is not a uuid. And `venue_note` is kept whatever the venue is, because
 * it is usually the literal transcription of the source — «en la sala baja» — next
 * to the record somebody later identified.
 */
export function exhibitionPayload(draft: ExhibitionDraft): ExhibitionPayload {
  const start = draft.startDate.trim()
  const end = draft.endDate.trim()
  const year = draftYear(draft)
  return {
    title: draft.title.trim(),
    exhibition_type: draft.exhibitionType,
    venue_id: draft.venueId.trim() === '' ? null : draft.venueId.trim(),
    venue_note: draft.venueNote.trim(),
    year: start === '' ? (year === null || Number.isNaN(year) ? null : year) : null,
    start_date: start === '' ? null : start,
    end_date: end === '' ? null : end,
    date_note: draft.dateNote.trim(),
    catalogue_published: draft.cataloguePublished,
    note: draft.note.trim(),
  }
}

// ── Creating one ─────────────────────────────────────────────

export type ExhibitionCreatePlan =
  | { action: 'blank'; message: string }
  | { action: 'insert'; payload: ExhibitionPayload }

/**
 * What pressing «Crear exposición» has to do.
 *
 * No duplicate check, and that is not an omission: `exhibitions` has NO unique
 * index on the title, on purpose and written down in the migration — two touring
 * shows of different years share a title, and «Alberto Rotili. Antológica» in
 * Badajoz and in Cáceres are two exhibitions. A screen that refused the second
 * one would refuse a real show. What the screen does instead is WARN, with
 * `similarExhibitions`, and let the cataloger decide.
 */
export function planExhibitionCreate(draft: ExhibitionDraft): ExhibitionCreatePlan {
  const problem = exhibitionDraftProblem(draft)
  if (problem !== null) return { action: 'blank', message: problem }
  return { action: 'insert', payload: exhibitionPayload(draft) }
}

// ── Correcting one ───────────────────────────────────────────

export type ExhibitionSavePlan =
  | { action: 'blank'; message: string }
  | { action: 'unchanged' }
  | { action: 'update'; payload: ExhibitionPayload }

/**
 * What saving a corrected exhibition has to do.
 *
 * `unchanged` exists because this table DOES carry `updated_at` and
 * `updated_by`, sealed by `tg_row_audit`: opening a record, reading it and
 * pressing «Guardar» would stamp the cataloger's name on a change that changed
 * nothing, and the change history of RF-1501 would show an edit that never
 * happened. The comparison is against the row's own draft, so it survives the
 * database deriving the year.
 */
export function planExhibitionSave(
  current: Exhibition,
  draft: ExhibitionDraft,
): ExhibitionSavePlan {
  const problem = exhibitionDraftProblem(draft)
  if (problem !== null) return { action: 'blank', message: problem }

  const payload = exhibitionPayload(draft)
  const stored = exhibitionPayload(exhibitionDraft(current))
  const same =
    stored.title === payload.title &&
    stored.exhibition_type === payload.exhibition_type &&
    stored.venue_id === payload.venue_id &&
    stored.venue_note === payload.venue_note &&
    stored.year === payload.year &&
    stored.start_date === payload.start_date &&
    stored.end_date === payload.end_date &&
    stored.date_note === payload.date_note &&
    stored.catalogue_published === payload.catalogue_published &&
    stored.note === payload.note
  if (same) return { action: 'unchanged' }

  return { action: 'update', payload }
}
