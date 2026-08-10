/**
 * «Otros documentos relacionados» in an exhibition's record (RF-516, RF-517).
 *
 * ── WHAT WAS MISSING ────────────────────────────────────────
 *
 * An archive document —a press release, a poster, a leaflet, a letter from the
 * gallery— speaks at the same time of an artwork and of the show it was in, and the schema has it
 * provided for from the start: two bridge tables over one and the same document, which is
 * precisely what avoids storing the same scan twice. The link with an
 * exhibition could already be created, but only from the document's record; **the exhibition
 * did not show it**, so a press release linked to a show did not appear
 * anywhere in that show.
 *
 * ── WHY LINKING HAPPENS HERE AND UPLOADING DOES NOT ─────────
 *
 * Uploading a file, correcting a document's data and adding a scan to it still
 * live in an artwork's documentation, where the artwork the document describes is.
 * Here one that is ALREADY in the archive is linked, and the link is withdrawn. Spreading
 * the same write over two screens with two sets of controls is how one of the two
 * ends up letting something through — it is the same split the archive's record already makes.
 */

import type { ExhibitionDocumentLinkRow } from '../documentary/documentaryRows'

/** The heading's count, which is the only thing read before going through the list. */
export function exhibitionDocumentCountText(count: number): string {
  return count === 1 ? '1 documento' : `${count} documentos`
}

/**
 * The line read when the list cannot be walked through, and **never a gap** (RF-304).
 *
 * The three are different and confusing them costs an afternoon: that it is still being asked for,
 * that it could not be asked for, and that there is none — which is not an error and is not presented as
 * one, because an exhibition with no archive documents is the norm.
 */
export function exhibitionDocumentsNotice(input: {
  loading: boolean
  error: string | null
  count: number
}): string | null {
  if (input.loading) return 'Buscando los documentos de esta exposición…'
  if (input.error !== null) {
    return `No se han podido leer los documentos de esta exposición: ${input.error}`
  }
  if (input.count === 0) {
    return (
      'No hay ningún documento enlazado. Un cartel se sube desde la documentación de una obra y se enlaza aquí.'
    )
  }
  return null
}

/** What is said with edit permission and the list already populated, under the button. */
export const EXHIBITION_DOCUMENTS_HINT =
  'Se enlaza un documento que ya está en el archivo. Subir uno nuevo, corregir sus datos o ' +
  'añadirle el escaneo se hace desde la documentación de una obra.'

/** The ones already linked: they are listed, marked and not offered again. */
export function linkedDocumentIds(rows: readonly ExhibitionDocumentLinkRow[]): Set<string> {
  return new Set(rows.filter((row) => row.active).map((row) => row.document_id))
}

/**
 * What is read when asking for a link to be removed, before confirming it.
 *
 * It names the document and says what is NOT taken away: the document stays in the archive and its
 * other links stay alive. Without saying so, «quitar» on a document that also
 * hangs from three artworks looks like it is going to touch them (RF-901).
 */
export function retireDocumentLinkText(title: string): string {
  return (
    `¿Quitar «${title}» de esta exposición? El documento sigue en el archivo, y lo que diga de ` +
    'otras obras o de otras exposiciones no se toca. El vínculo va a la papelera y se puede ' +
    'devolver.'
  )
}

/** What is said when the link goes in, naming the document. */
export function documentLinkedNotice(title: string): string {
  return `«${title}» ya consta como documento de esta exposición.`
}

/** What is said when it is removed, in the same terms. */
export function documentUnlinkedNotice(title: string): string {
  return `«${title}» ya no consta en esta exposición. Sigue en el archivo.`
}

/**
 * The title a document is named by in these sentences.
 *
 * Without it, a document with no title would produce «¿Quitar «» de esta exposición?». It is the
 * same rule as in the rest: a placeholder rather than a gap.
 */
export function documentTitleText(title: string | null | undefined): string {
  const clean = (title ?? '').trim()
  return clean === '' ? 'Documento sin título' : clean
}
