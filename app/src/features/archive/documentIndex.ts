/**
 * The archive's index: in what order it is read, what the search catches and what each
 * row says (RF-515, RF-606, RF-609).
 *
 * Pure and without React, like everything that decides in this project: the suite runs in node
 * with no DOM, so a list's order and a row's words are verified here or
 * they are not verified.
 *
 * **It reuses as is what the artwork record's selector already decides**
 * (`documentLink.ts`): the columns, the row's line and the «sin
 * digitalizar» sentence. A document has to read the SAME in the archive's listing as in the
 * selector that links it, or they are two dialects of the same catalogue. What is new is only what
 * a list needs and a selector does not: the whole table's order and the count.
 *
 * ── WHY THIS SCREEN EXISTS ──────────────────────────────────
 *
 * An archive document could be uploaded, linked, downloaded, corrected and
 * digitised — all from the record of an artwork that had it linked. So a
 * document that no artwork had linked **was not reachable from anywhere**: neither
 * the poster of an exhibition that does not speak of a particular piece, nor the document that
 * was created and whose link was withdrawn afterwards. It was still in the archive, taking up its
 * shelfmark, invisible. It is the same gap the bibliography had and it is closed the same way.
 */

import { placeKey } from '../../lib/places'
import { fuzzyRankBy } from '../../lib/vocabulary'
import {
  DOCUMENT_OPTION_COLUMNS,
  documentOptionFileText,
  documentOptionText,
  type DocumentOption,
} from '../documentary/documents/documentLink'
import { displayStructuredDate } from '../documentary/documentaryFormat'

/**
 * The index's columns, which are the ones the selector already asks for.
 *
 * Imported and not rewritten: the two lists show the same rows with the same
 * words, so a column one of them needs the other needs too.
 */
export { DOCUMENT_OPTION_COLUMNS as DOCUMENT_INDEX_COLUMNS }

/** What the search looks at, which is also what the row shows. */
export { documentOptionText as archiveSearchText }

/**
 * What a document is ordered by: **its shelfmark**, and the ones without it afterwards.
 *
 * It is the shelf's order, and that is why it is the right one here: the shelfmark is the label
 * written on the folder and an archive is walked through by it. It is not an artwork's block's
 * order —which goes from old to recent, because what is read there is a
 * piece's journey— and the difference is worth pointing out: they are two different
 * questions about the same rows.
 *
 * **The ones with no shelfmark go last**, and here they do, unlike the
 * reference with no signature in the bibliography. It is not an inconsistency: a document with no
 * shelfmark is a document that is **not filed yet** —a clipping noted down
 * before storing it—, so it has no place on the shelf and putting it among those that
 * have one would invent an order. A reference with no author, by contrast, does have a natural
 * place in the alphabet: its title's.
 *
 * The comparison is the unique index's, `place_key`: two shelfmarks differing only
 * in capitals or accents are the same shelfmark for the base, so also for the
 * order.
 */
export function archiveOrderKey(option: DocumentOption): string | null {
  const code = (option.archive_code ?? '').trim()
  return code === '' ? null : placeKey(code)
}

export function sortArchiveDocuments(rows: readonly DocumentOption[]): DocumentOption[] {
  return rows.slice().sort((a, b) => {
    const ka = archiveOrderKey(a)
    const kb = archiveOrderKey(b)
    if (ka !== kb) {
      if (ka === null) return 1
      if (kb === null) return -1
      return ka.localeCompare(kb, 'es')
    }
    return (
      a.title.localeCompare(b.title, 'es', { sensitivity: 'base' }) || a.id.localeCompare(b.id)
    )
  })
}

/** One row of the index, ready to paint. */
export interface ArchiveIndexEntry {
  row: DocumentOption
  /** The reference written on the folder, or null when the document is not filed. */
  code: string | null
  /** The title or short description. Never empty: the database demands it. */
  title: string
  /** «Carta», «Recorte de prensa»… or «Tipo sin clasificar». Never a gap (RF-304). */
  kind: string
  /** The date of ADR-004, or «Sin fecha». */
  date: string
  /** «Digitalizado · 3,2 MB» or «Sin digitalizar». It answers whether the paper is needed. */
  fileText: string
  /** No file uploaded: what decides whether it can be read from here or the paper must be found. */
  digitized: boolean
  /** In the wastebasket. Painted dimmed — and SAID, because grey on its own is decoration. */
  retired: boolean
  text: string
  indices: number[]
}

/**
 * The index's rows, the best match first.
 *
 * **The withdrawn ones are hidden unless asked for** (RF-609), and asking for them is the only
 * way for one to come back.
 */
export function rankArchiveDocuments(
  rows: readonly DocumentOption[],
  query: string,
  options: { includeRetired?: boolean } = {},
): ArchiveIndexEntry[] {
  const visible = options.includeRetired === true ? rows : rows.filter((row) => row.active)
  // Sorted BEFORE scoring: `fuzzyRankBy` is stable and keeps the caller's
  // order among equally good matches, so the shelf's order
  // survives inside each level of the ranking.
  const ordered = sortArchiveDocuments(visible)
  return fuzzyRankBy(ordered, documentOptionText, query).map(({ item, indices }) => {
    const path = item.file_path?.trim() ?? ''
    return {
      row: item,
      code: (item.archive_code ?? '').trim() || null,
      title: item.title.trim() || 'Documento sin título',
      kind: item.document_type?.name.trim() || 'Tipo sin clasificar',
      date: displayStructuredDate(item),
      fileText: documentOptionFileText(item),
      digitized: path !== '',
      retired: !item.active,
      text: documentOptionText(item),
      indices,
    }
  })
}

/** How many are in the wastebasket, to offer the switch only when there is something inside. */
export function retiredDocumentCount(rows: readonly DocumentOption[]): number {
  return rows.filter((row) => !row.active).length
}

/**
 * What is read above the list: how many there are, how many are shown and **how many are
 * undigitised**.
 *
 * The third figure is the one that only makes sense on this screen: it is the scanning
 * work list. In an artwork's block the question is «can I read this
 * paper?»; here it is «how much archive is left to digitise?».
 */
export function archiveCountText(input: {
  total: number
  shown: number
  searching: boolean
  withoutFile: number
}): string {
  const { total, shown, searching, withoutFile } = input
  const all = total === 1 ? '1 documento' : `${total} documentos`
  const head = !searching || shown === total ? all : `${shown} de ${all}`
  if (withoutFile === 0) return head
  return `${head} · ${withoutFile === 1 ? '1 sin digitalizar' : `${withoutFile} sin digitalizar`}`
}

/** How many of those being shown have no file. */
export function withoutFileCount(entries: readonly ArchiveIndexEntry[]): number {
  return entries.filter((entry) => !entry.digitized).length
}

/**
 * What goes where the rows would go when there are none, or null when there are.
 *
 * **Never a blank page**, which is a criterion of the project: a search with no
 * results returns the same page with the reason, and not an empty list that reads
 * as an empty archive.
 */
export function archiveListNotice(input: {
  loading: boolean
  error: string | null
  total: number
  shown: number
  query: string
  includingRetired: boolean
}): string | null {
  const { loading, error, total, shown, query, includingRetired } = input
  if (error !== null) return error
  if (loading) return 'Cargando el archivo…'
  if (shown > 0) return null

  if (query.trim() !== '') {
    return includingRetired
      ? 'No se ha encontrado ningún documento, ni entre los retirados.'
      : 'No se ha encontrado ningún documento. Puede estar retirado: incluye la papelera.'
  }
  if (total === 0) {
    return (
      'Todavía no hay ningún documento. Se suben desde la documentación de una obra.'
    )
  }
  return 'Todos los documentos del archivo están retirados. Inclúyelos para verlos y recuperarlos.'
}
