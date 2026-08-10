/**
 * The form of one link of the chain, as data (RF-509).
 *
 * Everything the editor decides lives here and not in the component: what a
 * half-filled link is missing, what the database will refuse and why, and what
 * exactly gets sent. The battery runs in node and cannot open a form, so a rule
 * left inside JSX is a rule nobody checks.
 *
 * The refusals are written in Spanish and mirror the CHECK constraints of
 * `provenance_events` one by one. That is a deliberate second copy: the database
 * is the authority and its message is shown verbatim when it speaks, but a form
 * that only finds out on save makes the cataloger fill a link twice, and one of
 * these constraints is easy to trip — a link has to say who it is about.
 */

import { MIN_YEAR, maxYear } from '../../../lib/structuredDate'
import { moveItem } from '../../../lib/reorder'
import type {
  ProvenanceAcquisition,
  ProvenanceCapacity,
  ResearchStatus,
} from '../../../lib/types'
import { partyName, structuredDateText } from '../documentaryFormat'
import type { ProvenanceEventRow } from '../documentaryRows'

/**
 * Plausible years for a link, as the DATABASE checks them: 1000..2100.
 *
 * The stepper offers the narrower range of the funds (1900..this year), the same
 * one the execution date uses — both artists are of the 20th century and a
 * provenance that starts in 1743 would be another artist's. These two are the
 * outer wall, and they exist so the refusal reads like the constraint that would
 * produce it if a year ever arrived typed from somewhere else.
 */
export const LINK_MIN_YEAR = 1000
export const LINK_MAX_YEAR = 2100

/** The years the stepper offers. Narrower than the database's on purpose (see above). */
export const STEP_MIN_YEAR = MIN_YEAR
export function stepMaxYear(): number {
  return maxYear()
}

/**
 * A link being written. Not a row: it has no `position` — the database places a
 * new link at the end of the chain and `reorder_provenance_events` is the only
 * thing that moves it — and no `date_text`, which is generated.
 */
export interface ProvenanceDraft {
  /** Null while creating; the row's identifier while editing. */
  id: string | null
  /** The party record, when the link names one. */
  partyId: string | null
  /** How the link consta without a record, or the precision a record does not give. */
  partyNote: string
  capacity: ProvenanceCapacity
  acquisition: ProvenanceAcquisition
  startYear: number | null
  endYear: number | null
  approximate: boolean
  unconfirmed: boolean
  /** The date the structure could not hold: «finales de los setenta». It wins when printing (ADR-004). */
  dateNote: string
  /** Source and reliability of the datum (RF-214). */
  note: string
}

/**
 * A new link, with both enums in «Sin revisar».
 *
 * That is the database's own default and it is the honest starting point: a link
 * is written the moment a name appears in a document, long before anybody knows
 * on what terms that party held the artwork. Starting it at `OWNER` would put a
 * legal fact in the record because a form needed a default.
 */
export function emptyProvenanceDraft(): ProvenanceDraft {
  return {
    id: null,
    partyId: null,
    partyNote: '',
    capacity: 'UNREVIEWED',
    acquisition: 'UNREVIEWED',
    startYear: null,
    endYear: null,
    approximate: false,
    unconfirmed: false,
    dateNote: '',
    note: '',
  }
}

/** An existing link, opened for editing. */
export function draftFromRow(row: ProvenanceEventRow): ProvenanceDraft {
  return {
    id: row.id,
    partyId: row.party_id,
    partyNote: row.party_note,
    capacity: row.capacity,
    acquisition: row.acquisition,
    startYear: row.start_year,
    endYear: row.end_year,
    approximate: row.approximate_date,
    unconfirmed: row.unconfirmed_date,
    dateNote: row.date_note,
    note: row.note,
  }
}

/** Where a refusal belongs, so the form can put it next to what caused it. */
export type DraftField = 'party' | 'years' | 'flags'

export interface DraftProblem {
  field: DraftField
  text: string
}

/**
 * What stops this link from being saved, in the order the form reads.
 *
 * Empty means the database will accept it. Each entry mirrors one constraint:
 *
 *   · `provenance_events_link_has_an_end` — a link has to say who it is about.
 *   · `provenance_events_coherent_range` — and it is `>=`, NOT `>`: an artwork
 *     bought and sold in 1985 is a real holding and «1985-1985» is what gets
 *     stored. The execution date of an artwork is the opposite case and its
 *     check is stricter; copying that rule here would refuse a legitimate link.
 *   · `provenance_events_flags_require_year` — «c.» and «[?]» talk about a year.
 *   · `provenance_events_plausible_years` — a year outside 1000..2100 is a typo.
 */
export function draftProblems(draft: ProvenanceDraft): DraftProblem[] {
  const problems: DraftProblem[] = []

  if (draft.partyId === null && draft.partyNote.trim() === '') {
    problems.push({
      field: 'party',
      text:
        'Di de quién habla este eslabón: elige una ficha de persona o institución, o escribe cómo ' +
        'consta cuando no hay ficha detrás («Colección particular, España»).',
    })
  }

  if (draft.endYear !== null && draft.startYear === null) {
    problems.push({
      field: 'years',
      text: 'Hay año final y no hay año inicial: un tramo tiene que empezar en algún sitio.',
    })
  }

  if (draft.startYear !== null && draft.endYear !== null && draft.endYear < draft.startYear) {
    problems.push({
      field: 'years',
      text: `El año final (${draft.endYear}) es anterior al inicial (${draft.startYear}).`,
    })
  }

  for (const [year, which] of [
    [draft.startYear, 'inicial'],
    [draft.endYear, 'final'],
  ] as const) {
    if (year !== null && (year < LINK_MIN_YEAR || year > LINK_MAX_YEAR)) {
      problems.push({
        field: 'years',
        text: `El año ${which} (${year}) está fuera de ${LINK_MIN_YEAR}-${LINK_MAX_YEAR}: es una errata, no una fecha.`,
      })
    }
  }

  if (draft.startYear === null && (draft.approximate || draft.unconfirmed)) {
    problems.push({
      field: 'flags',
      text:
        '«Aproximada» y «sin confirmar» hablan de un año, y este eslabón no lo tiene: sin año no ' +
        'hay nada que aproximar ni que poner en duda.',
    })
  }

  return problems
}

/** Whether the link can be sent. */
export function draftIsSaveable(draft: ProvenanceDraft): boolean {
  return draftProblems(draft).length === 0
}

/** The refusals that belong beside one field of the form. */
export function problemsOf(problems: readonly DraftProblem[], field: DraftField): DraftProblem[] {
  return problems.filter((problem) => problem.field === field)
}

/**
 * The date as the database will store it, for the preview under the fields.
 *
 * It goes through `structuredDateText` — the mirror of the generated column of
 * THESE tables — and not through `composeDate`, which trims a range whose end
 * equals its start. Here «1978-1978» is what gets stored, and a preview that
 * disagrees with the stored value is worse than no preview.
 */
export function draftDatePreview(draft: ProvenanceDraft): string {
  return structuredDateText({
    start_year: draft.startYear,
    end_year: draft.endYear,
    approximate_date: draft.approximate,
    unconfirmed_date: draft.unconfirmed,
    date_note: draft.dateNote,
  })
}

/**
 * What travels to the database.
 *
 * `date_text` and `position` are NOT here, and that is the point of building the
 * payload apart from the draft: the first is a generated column and any value
 * sent for it is an error, and the second is assigned by a trigger at the end of
 * the chain and moved only by `reorder_provenance_events`. `catalog_id` goes in
 * on insert and is left out on update: it is the artwork the chain belongs to,
 * not a field of the link.
 *
 * The flags are normalised against the year instead of being trusted: dropping
 * the year of a link that was marked «c.» must not send a combination the
 * database refuses.
 */
export function draftPayload(draft: ProvenanceDraft): Record<string, unknown> {
  const dated = draft.startYear !== null
  return {
    party_id: draft.partyId,
    party_note: draft.partyNote.trim(),
    capacity: draft.capacity,
    acquisition: draft.acquisition,
    start_year: draft.startYear,
    end_year: draft.startYear === null ? null : draft.endYear,
    approximate_date: dated && draft.approximate,
    unconfirmed_date: dated && draft.unconfirmed,
    date_note: draft.dateNote.trim(),
    note: draft.note.trim(),
  }
}

/** The same payload with the artwork it hangs from, for the insert. */
export function insertPayload(draft: ProvenanceDraft, catalogId: string): Record<string, unknown> {
  return { ...draftPayload(draft), catalog_id: catalogId }
}

/**
 * The chain's identifiers with one link moved, for `reorder_provenance_events`.
 *
 * The RPC demands EXACTLY the artwork's active links and refuses anything else,
 * so the list is built from what is on screen and never patched: a stale client
 * gets a readable refusal instead of half an order, and half an order is worse
 * than none because it reads like an order.
 */
export function movedChainIds(
  rows: readonly ProvenanceEventRow[],
  from: number,
  to: number,
): string[] {
  return moveItem(
    rows.map((row) => row.id),
    from,
    to,
  )
}

/**
 * Where a link would land when moved one step, or null when it cannot move.
 *
 * Null and not a clamped index: the buttons at the ends of the chain have to be
 * disabled and not silently do nothing, which is how a cataloger concludes the
 * reordering is broken.
 */
export function stepTarget(rows: readonly unknown[], index: number, delta: number): number | null {
  const target = index + delta
  if (index < 0 || index >= rows.length) return null
  if (target < 0 || target >= rows.length) return null
  return target
}

/**
 * Why the order can be rearranged by hand, said once above the chain.
 *
 * Without it the arrows look like a defect: every other list of this application
 * sorts itself — the exhibitions by their opening date, the bibliography by year
 * — and a cataloger who has just seen those two will read a hand-sorted chain as
 * one that failed to sort. The reason is the datum: half the links of a catalogue
 * raisonné have no year, and a sequence derived from nulls is not a sequence.
 *
 * Null under two links, where there is no order to explain and the sentence would
 * be one more thing to scroll past.
 */
export function reorderHint(count: number): string | null {
  if (count < 2) return null
  return (
    'El orden de la cadena lo pones tú: la mitad de los eslabones no llevan año.'
  )
}

/**
 * Why a link cannot be added right now, or null when it can (RF-218).
 *
 * The database refuses to hang a link on an artwork whose provenance is on record
 * as investigated with no results, and it is right to refuse: that declaration
 * says «se buscó y no hay nada», and a link underneath it would contradict it. Said
 * here, before the form opens, the cataloger changes the state instead of writing
 * a link that will bounce — and learns that the two things are connected, which is
 * the part the refusal alone does not teach.
 */
export function addBlockedReason(status: ResearchStatus | null): string | null {
  if (status !== 'NONE_FOUND') return null
  return (
    'La procedencia consta «Investigado, sin resultados»: ponla en «Investigación en curso» o «Investigación completa».'
  )
}

/**
 * What retiring a link takes with it (RF-517, RF-901).
 *
 * Two consequences, and the second one is the one nobody expects: the chain
 * closes over the hole. The years that link covered stop being documented, so a
 * gap may open where there was none — which is the honest outcome and has to be
 * announced, because the cataloger is looking at a continuous chain while she
 * taps.
 *
 * That it can be added again is said in the same breath: this is a retirement and
 * not a deletion, and a cataloger who believes she is destroying evidence will
 * leave a wrong link in the catalogue instead.
 */
export function retireConfirmText(row: ProvenanceEventRow): string {
  const name = partyName(row.party, row.party_note)
  const dates = (row.date_text ?? '').trim()
  const when = dates === '' ? '' : ` (${dates})`
  return (
    `Se retirará el eslabón de ${name}${when}. La cadena se recompone sin él, así que el tramo ` +
    'que cubría deja de constar y puede quedar un hueco. Se puede volver a añadir desde la papelera.'
  )
}
