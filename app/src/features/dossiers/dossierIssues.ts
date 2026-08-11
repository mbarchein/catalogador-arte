/**
 * The PDFs already issued from a dossier, as they are read (RF-1607, RF-1608).
 *
 * Append-only, so this block has no editing and no wastebasket: a version that
 * left in an email is never rewritten. What it does have is the two answers the
 * dossier exists for — «qué le mandé en marzo» is this list, and «mándalo otra vez
 * con los datos al día» is the button next to it.
 *
 * Pure, like the rest of the decisions of the feature.
 */

import type { DossierIssue } from '../../lib/types'

/** The columns of the block. Held to `DossierIssue` by a test. */
export const DOSSIER_ISSUE_COLUMNS =
  'id, dossier_id, version, issued_at, issued_by, file_path, file_bytes, note'

/** One issue as its row reads. */
export interface IssueEntry {
  id: string
  version: number
  /** `Versión 2`. The number the database assigned, never one computed here. */
  label: string
  /** `11 de agosto de 2026, 18:04`. */
  when: string
  /** `1,2 MB`, or null when nobody measured it. */
  size: string | null
  path: string
}

/**
 * The most recent first.
 *
 * The opposite of the items of the dossier, and for the reason an index is read:
 * what gets asked for is almost always the last one sent. The version is the sort
 * key and not the date — they agree, and the version is the one the database
 * guarantees consecutive.
 */
export function sortIssues(rows: readonly DossierIssue[]): DossierIssue[] {
  return rows.slice().sort((a, b) => b.version - a.version)
}

/**
 * The date and time of an issue, in Madrid and in Spanish (RNF-105).
 *
 * The time is on it and not only the date: two versions of the same afternoon are
 * the normal case —«mándalo sin los dos dibujos»— and two rows saying «11 de agosto
 * de 2026» would be indistinguishable.
 */
export function issuedAtText(iso: string): string {
  const when = new Date(iso)
  if (Number.isNaN(when.getTime())) return 'Fecha desconocida'
  return when.toLocaleString('es-ES', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Madrid',
  })
}

/** `1,2 MB`, `284 KB`. Null when the row does not say — which is a datum, not a zero. */
export function issueSizeText(bytes: number | null): string | null {
  if (bytes === null || bytes <= 0) return null
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toLocaleString('es-ES', { maximumFractionDigits: 1 })} MB`
}

export function issueEntries(rows: readonly DossierIssue[]): IssueEntry[] {
  return sortIssues(rows).map((row) => ({
    id: row.id,
    version: row.version,
    label: `Versión ${row.version}`,
    when: issuedAtText(row.issued_at),
    size: issueSizeText(row.file_bytes),
    path: row.file_path,
  }))
}

/**
 * What goes where the list of issues would go, or null when there are rows
 * (RF-304).
 *
 * The empty case is the normal one and it says what the button next to it does,
 * because until it is pressed the dossier is a selection and not a document.
 */
export function issuesNotice(state: {
  loading: boolean
  error: string | null
  count: number
}): string | null {
  if (state.error !== null) return null
  if (state.loading && state.count === 0) return 'Cargando lo que se ha emitido…'
  if (state.count > 0) return null
  return 'Todavía no se ha emitido ningún PDF de este dossier.'
}

/**
 * What the button says, which is not the same the first time as the fourth.
 *
 * «Emitir la versión 3» is the whole point of the append-only design said in three
 * words: nothing is being corrected, another document is being made, and the one
 * from March stays exactly as it was sent.
 */
export function issueButtonLabel(rows: readonly DossierIssue[]): string {
  const last = sortIssues(rows)[0]
  if (last === undefined) return 'Emitir el PDF'
  return `Emitir la versión ${last.version + 1}`
}

/**
 * What is said after issuing, with the consequence that matters: this one is a new
 * document and the previous ones are untouched.
 */
export function issuedNotice(version: number): string {
  if (version <= 1) return 'Emitido el PDF. Queda guardado con su fecha.'
  return `Emitida la versión ${version}. Las anteriores siguen como estaban.`
}
