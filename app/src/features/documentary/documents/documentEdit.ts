/**
 * Correcting an archive document's data, and giving it whatever scan it is missing
 * (RF-515, RF-408, RF-516).
 *
 * Until today a document was registered and stayed however it had been registered: the
 * badly copied shelfmark, the unclassified type and the scan that was not at hand
 * were final, and the two panels that uploaded it warned about it before saving
 * because there was no screen that fixed it. The columns were editable and
 * the `archive_documents_update` policy had been in place since day one: what
 * was missing was this.
 *
 * **What this module does is decide, and that is why it is outside the form.** What
 * has really changed, what is going to be sent, how many people have what they read changed and
 * what is said when the document already has a file. The suite runs in node and cannot
 * open a panel or choose a file, so a rule inside the JSX is a
 * rule nobody checks.
 *
 * ── A DOCUMENT IS NOT A FIELD OF THIS ARTWORK ──
 * It is the bibliographic reference's same boundary, and it is crossed just as easily:
 * the panel opens from an artwork's record, so it looks as if it corrects the record.
 * It corrects the ARCHIVE. A press clipping linked to three artworks and to one
 * exhibition changes in all four places, and the warning says so with the number first,
 * because «the others will see it» is abstract and «the other three artworks and one
 * exhibition will see it» changes the decision.
 */

import { placeKey } from '../../../lib/places'
import { fileSizeText } from '../documentaryFormat'
import {
  documentDraftPayload,
  documentDraftProblems,
  type DocumentDraftProblem,
  type DocumentFields,
} from './documentDraft'

/**
 * What this module needs from the row. A structural subset of
 * `DocumentRow`, so a test can build the case without the two embedded
 * master tables or the four audit columns.
 */
export interface EditableDocument {
  id: string
  archive_code: string | null
  title: string
  document_type_id: string | null
  archive_series_id: string | null
  artist_fund: DocumentFields['artistFund']
  start_year: number | null
  end_year: number | null
  approximate_date: boolean
  unconfirmed_date: boolean
  date_note: string
  physical_place_id: string | null
  note: string
  file_path: string | null
  active: boolean
}

/**
 * The row as the form writes it.
 *
 * The text nulls are opened to an empty string because a controlled `input` with `null`
 * is a field React takes as uncontrolled; the foreign keys' nulls are
 * kept, because there null IS an answer —«sin clasificar»— and not a gap.
 */
export function documentEditDraft(document: EditableDocument): DocumentFields {
  return {
    archiveCode: document.archive_code ?? '',
    title: document.title,
    documentTypeId: document.document_type_id,
    archiveSeriesId: document.archive_series_id,
    artistFund: document.artist_fund,
    startYear: document.start_year,
    endYear: document.end_year,
    approximate: document.approximate_date,
    unconfirmed: document.unconfirmed_date,
    dateNote: document.date_note,
    physicalPlaceId: document.physical_place_id,
    note: document.note,
  }
}

export type DocumentEditPlan =
  /** Something is missing or there is an inconsistency: the base would reject it and it is said first. */
  | { action: 'problems'; problems: DocumentDraftProblem[] }
  /** Nothing to send. It is not an error and it is not presented as one. */
  | { action: 'unchanged' }
  | { action: 'update'; payload: Record<string, unknown> }

/**
 * What to do with what is in the form.
 *
 * The `unchanged` case is not a convenience: without it, opening the panel and closing it with
 * «Guardar» would write the row, and writing the row moves `updated_at`, `updated_by`
 * and an entry of the change history (RF-1501). A document that is recorded as
 * corrected today without anybody having corrected anything is a trace that lies, and this
 * application's history exists precisely so that it does not lie.
 *
 * The duplicate shelfmark is NOT checked here, unlike a reference's BibTeX key:
 * that panel has the whole reference list loaded and this one does not
 * have the archive's, so comparing it would be comparing it against nothing. It is answered
 * by the unique index on `place_key(archive_code)` and translated by
 * `describeDocumentRefusal`. What is done is normalising the shelfmark the same way
 * the index compares it, so that changing «ar-arch-1» for «AR-ARCH-1» does not come out as
 * a correction: for the base it is the same one.
 */
export function planDocumentEdit(
  document: EditableDocument,
  draft: DocumentFields,
): DocumentEditPlan {
  const problems = documentDraftProblems(draft)
  if (problems.length > 0) return { action: 'problems', problems }

  const payload = documentDraftPayload(draft)
  const before = documentDraftPayload(documentEditDraft(document))

  const sameCode =
    payload.archive_code === null || before.archive_code === null
      ? payload.archive_code === before.archive_code
      : placeKey(payload.archive_code) === placeKey(before.archive_code)

  const changed =
    !sameCode ||
    Object.keys(payload).some(
      (column) => column !== 'archive_code' && payload[column] !== before[column],
    )

  return changed ? { action: 'update', payload } : { action: 'unchanged' }
}

// ── What has to be said before saving ─────────────────────────

const SHARED_ROW =
  'Este documento es del archivo, no de esta obra: lo que corrijas aquí se lee igual desde ' +
  'cualquier ficha enlazada con él.'

/** How many more records have what they read changed. */
export interface DocumentReach {
  /** Artworks other than this one, or null while counting and when the count failed. */
  otherArtworks: number | null
  /** Exhibitions linked to the document, with the same criterion for the null. */
  exhibitions: number | null
}

/**
 * The warning above the fields, with the scope MEASURED when it can be.
 *
 * `null` is «not counted» and not «zero», and it is the case that cannot lie: while the
 * count travels, or when it fell over —one bar of coverage in a storeroom—, the warning
 * keeps the part that is true and says out loud that the number is not known.
 * Writing «nothing else has it linked» over a failed count is how somebody
 * rewrites a shelfmark believing it is a matter of their own.
 *
 * The two halves are counted separately because they are two bridge tables (RF-516) and an
 * exhibition is not an artwork: a poster linked to the show and to no other
 * artwork is still a poster another record reads.
 */
export function documentReachNotice(reach: DocumentReach): string {
  const { otherArtworks, exhibitions } = reach
  if (otherArtworks === null || exhibitions === null) {
    return `${SHARED_ROW} No se ha podido contar con qué más está enlazado, así que cuenta con que no sea solo esta obra.`
  }
  const parts: string[] = []
  if (otherArtworks === 1) parts.push('otra obra')
  else if (otherArtworks > 1) parts.push(`otras ${otherArtworks} obras`)
  if (exhibitions === 1) parts.push('una exposición')
  else if (exhibitions > 1) parts.push(`${exhibitions} exposiciones`)

  if (parts.length === 0) {
    return `${SHARED_ROW} Ahora mismo no lo tiene enlazado nada más, pero sigue en el archivo para lo que se enlace mañana.`
  }
  return `${SHARED_ROW} Está enlazado además con ${parts.join(' y ')}: también cambiará lo que se lee ahí.`
}

/**
 * What the panel says when the document being corrected is withdrawn from the archive
 * (RF-901), or null when it is in circulation.
 *
 * A Cataloguer sees withdrawn documents —the record of an artwork linked to one shows
 * it with its label—, so the panel can be opened over one, and correcting it
 * is legitimate: the link is real and its title is read. What cannot happen is that
 * the correction puts it back in circulation without anybody having asked.
 */
export function documentRetiredNotice(document: Pick<EditableDocument, 'active'>): string | null {
  if (document.active) return null
  return (
    'Este documento está retirado del archivo. Se puede corregir, y seguirá retirado: ' +
    'recuperarlo se hace desde la papelera, no desde aquí.'
  )
}

/** What is said when the correction has gone in. */
export function documentEditedNotice(title: string): string {
  const clean = title.trim()
  return `${clean === '' ? 'El documento' : `«${clean}»`} queda corregido en el archivo.`
}

// ── The scan that was missing ─────────────────────────────────

/**
 * Why a scan cannot be added to this document, or null when it can.
 *
 * A single refusal and it is the one that matters: **it already has a file**. This store's
 * paths are immutable because the *service worker* caches by path, so
 * «changing the scan» is not overwriting: it is uploading another file and orphaning the
 * previous one, with the record saying a weight that is no longer the one behind it. That is
 * a separate decision —what is done with the leftover one— and until it is taken, this panel
 * adds what is missing and does not replace what is there.
 *
 * Whether the document is withdrawn is not checked: a file withdrawn from the
 * archive still deserves its scan, and digitising it does not put it back in circulation.
 */
export function scanTargetProblem(document: Pick<EditableDocument, 'file_path'>): string | null {
  const path = document.file_path?.trim() ?? ''
  if (path === '') return null
  return (
    'Este documento ya tiene fichero, y los ficheros no se sobrescriben. Si está mal, sube un documento nuevo.'
  )
}

/** What is said when the scan is already up. */
export function scanAddedNotice(title: string, bytes: number): string {
  const clean = title.trim()
  const weight = fileSizeText(bytes)
  const size = weight === null ? '' : ` (${weight})`
  return (
    `${clean === '' ? 'El documento' : `«${clean}»`} ya está digitalizado${size}: ` +
    'se puede descargar desde cualquier ficha enlazada con él.'
  )
}
