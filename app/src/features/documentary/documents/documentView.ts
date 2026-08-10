/**
 * One line of «Documentación relacionada», decided before any JSX sees it
 * (RF-515, RF-516, RF-304).
 *
 * A row of this block is two rows of the database at once: the bridge that says
 * this document has to do with THIS artwork, and the document itself, which
 * belongs to the archive and may be linked to two more artworks and to an
 * exhibition. Both carry a note and they are not the same note — one says why the
 * cutting matters here, the other describes the cutting — and showing them as one
 * would be the record putting words in the cataloger's mouth.
 *
 * Everything that decides something is here and not in the component: which
 * sentence, which order of the crumbs, what an undated document reads as, what is
 * said where the download button is not. The battery runs in node, so anything
 * left inside the JSX is verified by nobody.
 */

import { ARTIST_LABEL, type ArtistFund } from '../../../lib/types'
import { displayStructuredDate, fileSizeText } from '../documentaryFormat'
import type { DocumentRow } from '../documentaryRows'
import { documentFileOffer, type DocumentFileOffer } from './documentFile'

/**
 * Quién enlaza el documento: una obra o una exposición.
 *
 * Lo único que cambia entre los dos lados de la tabla puente es UNA frase, la del
 * documento que no se puede leer, y ahí la frase tiene que nombrar bien a quién le falta
 * — decir «esta obra» en la ficha de una exposición no es un detalle de estilo, es contar
 * mal dónde está el hueco.
 */
export type DocumentOwner = 'artwork' | 'exhibition'

const UNAVAILABLE_NOTE: Record<DocumentOwner, string> = {
  artwork:
    'Hay un documento enlazado con esta obra que no se puede leer: puede estar retirado.',
  exhibition:
    'Hay un documento enlazado con esta exposición que no se puede leer: puede estar retirado.',
}

/**
 * Lo mínimo que una fila puente tiene que traer para pintarse.
 *
 * Ni `catalog_id` ni `exhibition_id`: esta función nunca los ha mirado, y acotarla a la
 * fila de una obra era lo único que impedía que la ficha de una exposición reutilizara el
 * bloque entero en vez de copiarlo.
 */
export interface DocumentLinkLike {
  id: string
  document_id: string
  note: string
  document: DocumentRow | null
}

export interface DocumentViewOptions {
  /**
   * Where the paper is, resolved by whoever owns the tree of places (ADR-006).
   *
   * It arrives as a function and not as a tree because this block is not going to
   * load the places for itself: the record already has them loaded, and a sixth
   * query from a phone to paint one crumb is not worth it. Without it the row
   * simply says nothing about the location, which is honest — it never guesses.
   */
  placeText?: (placeId: string) => string | null | undefined
  /** An artwork by default, which is where this block comes from. */
  owner?: DocumentOwner
}

/** One document as this record reads it. */
export interface DocumentView {
  /** The bridge row's identifier: what an edit or a retirement would act on. */
  id: string
  documentId: string
  /**
   * True when the document behind an active link cannot be read: retired beyond
   * what this session may see, or hidden by a policy. The link is real and the row
   * stays on screen saying so, because removing it would silently shorten the
   * documentation of the artwork.
   */
  unavailable: boolean
  title: string
  /** The signature written on the folder, when it has one. */
  code: string | null
  typeText: string
  /** The kind was retired from the vocabulary: still readable, no longer on offer (RF-901). */
  typeRetired: boolean
  seriesText: string
  seriesRetired: boolean
  /** The date as ADR-004 composes it, or «Sin fecha». Never a gap (RF-304). */
  dateText: string
  fundText: string
  /** The document itself is in the trash, behind a link that is not (RF-901). */
  retired: boolean
  /** Why this document is attached to THIS artwork. Null when nobody wrote it. */
  linkNote: string | null
  /** What the archive says about the document itself. */
  documentNote: string | null
  /** Where the paper is, when the caller can resolve it. */
  placeText: string | null
  /** The download, or null when the document is not digitised. */
  file: DocumentFileOffer | null
  /** What goes where the download button would be, when there is none. Never a gap. */
  fileNote: string | null
}

/**
 * The fund a document belongs to, with the null case written out.
 *
 * Null is NOT «sin revisar» here, and this is the one place in the block where
 * that distinction runs the other way: `artist_fund` was made nullable on purpose,
 * because a cutting about a joint show of both artists — or a context document
 * about neither — cannot choose one. So the empty value is a legitimate answer and
 * has to read like one, not like a gap somebody forgot to fill.
 */
export function fundText(fund: ArtistFund | null): string {
  if (fund === null) return 'No es de un solo fondo'
  // A fund the label map does not cover can only arrive from an enum value added
  // in a migration and not brought back here: the code is worth more than a blank.
  return ARTIST_LABEL[fund] ?? fund
}

/**
 * What a non-digitised document says instead of a button (RF-408, RF-304).
 *
 * «Sin digitalizar» is a fact about the catalogue and not a claim about the
 * research: there is no `digitized` flag to be out of step with the file, the
 * answer IS that no path is stored. And it is an actionable fact, so the sentence
 * carries what the cataloger needs in order to go and find the paper: where it is,
 * when the record knows, and the signature to ask for it by.
 */
export function missingFileNote(input: {
  code: string | null
  placeText: string | null
}): string {
  const parts = ['Sin digitalizar: no consta ningún fichero subido, así que solo está en papel.']
  if (input.placeText) parts.push(`Está en ${input.placeText}.`)
  if (input.code) parts.push(`Se pide por su signatura: ${input.code}.`)
  return parts.join(' ')
}

/** A text column of the database as something to print, or null when it is blank. */
function written(text: string | null | undefined): string | null {
  const clean = (text ?? '').trim()
  return clean === '' ? null : clean
}

/** One row of the block, whole. */
export function documentView(
  row: DocumentLinkLike,
  options: DocumentViewOptions = {},
): DocumentView {
  const document = row.document
  const linkNote = written(row.note)

  if (!document) {
    return {
      id: row.id,
      documentId: row.document_id,
      unavailable: true,
      // The row is not dropped and it is not left blank: it says what it is.
      title: 'Documento no disponible',
      code: null,
      typeText: 'Tipo sin clasificar',
      typeRetired: false,
      seriesText: 'Sin clasificar en el archivo',
      seriesRetired: false,
      dateText: 'Sin fecha',
      fundText: 'No es de un solo fondo',
      retired: false,
      linkNote,
      documentNote: null,
      placeText: null,
      file: null,
      fileNote: UNAVAILABLE_NOTE[options.owner ?? 'artwork'],
    }
  }

  const code = written(document.archive_code)
  const place = document.physical_place_id
    ? written(options.placeText?.(document.physical_place_id))
    : null
  const file = documentFileOffer(document)

  return {
    id: row.id,
    documentId: row.document_id,
    unavailable: false,
    title: written(document.title) ?? 'Documento sin título',
    code,
    typeText: written(document.document_type?.name) ?? 'Tipo sin clasificar',
    typeRetired: document.document_type ? !document.document_type.active : false,
    seriesText: written(document.archive_series?.name) ?? 'Sin clasificar en el archivo',
    seriesRetired: document.archive_series ? !document.archive_series.active : false,
    dateText: displayStructuredDate(document),
    fundText: fundText(document.artist_fund),
    retired: !document.active,
    linkNote,
    documentNote: written(document.note),
    placeText: place,
    file,
    fileNote: file === null ? missingFileNote({ code, placeText: place }) : null,
  }
}

/** Every row of the block, in the order the query already sorted them by (oldest first). */
export function documentViews(
  rows: readonly DocumentLinkLike[],
  options: DocumentViewOptions = {},
): DocumentView[] {
  return rows.map((row) => documentView(row, options))
}

/**
 * What the open block says above the rows: how much of this is digitised and what
 * the whole lot would cost to download.
 *
 * It is one line and it answers the two questions asked before scrolling a list of
 * documents on a phone — «¿puedo verlos desde aquí?» and «¿cuánto me va a costar
 * bajarlos?» — which is the same reason the weight is on each button (RNF-106).
 *
 * Null when there are no rows: an empty block is explained by `blockState`, and a
 * second sentence over that one would be noise.
 */
export function documentsSummary(
  // The minimum it needs and not `DocumentView`: what the summary counts is
  // whether there is a file and what it weighs, so a caller — and a test — does
  // not have to build a whole row to ask.
  views: readonly { file: { bytes: number | null } | null }[],
): string | null {
  const total = views.length
  if (total === 0) return null

  const withFile = views.filter((view) => view.file !== null)
  const bytes = withFile.reduce((sum, view) => sum + (view.file?.bytes ?? 0), 0)
  const weight = fileSizeText(bytes)

  if (withFile.length === 0) {
    return total === 1
      ? 'Sin digitalizar: el original está en papel.'
      : 'Ninguno digitalizado: los originales están en papel.'
  }

  const counted =
    withFile.length === total
      ? total === 1
        ? 'Digitalizado'
        : `Los ${total} digitalizados`
      : `${withFile.length} de ${total} digitalizados`
  if (weight === null) return counted
  // «en total» only when there are several: over one file it is a word too many.
  return withFile.length === 1 ? `${counted} · ${weight}` : `${counted} · ${weight} en total`
}
