/**
 * Linking an archive document to an exhibition, and removing the link
 * (RF-516, RF-517).
 *
 * Pure and without React: what is offered, what is excluded and what is said when the base
 * refuses are verified here.
 *
 * ── THE GAP ─────────────────────────────────────────────────
 *
 * `exhibition_documents` and its function `document_exhibition` have been in the schema since the
 * archive's migration, with their `grant execute` to the authenticated role and with their proof
 * that it restores the withdrawn link instead of clashing against uniqueness. **Nobody
 * called them.** So a show's poster, its leaflet or its press release —which are
 * documents that do not speak of a particular piece— could not be linked to the show
 * from any screen, and the document's record said so out loud in its empty
 * block. This is what calls it.
 *
 * ── WHY IT LIVES IN THE DOCUMENT'S RECORD ───────────────────
 *
 * The archive's record was declared read-only, and this is the reasoned exception: it is
 * the only write that cannot be done anywhere else. Uploading, correcting and
 * digitising live in an artwork's documentation because that is where the artwork the
 * document describes is; an exhibition has no document block, so the only
 * place where both things are together at once is the document's record.
 *
 * And it carries its withdrawal: a link that can be created and not removed is a trap, and in
 * this project nothing is deleted but everything is withdrawn.
 */

import { fuzzyRankBy, type RankedItem } from '../../lib/vocabulary'
import { exhibitionOptionText } from '../documentary/exhibitions/participationEdits'
import type { ExhibitionRow } from '../documentary/documentaryRows'

/** An exhibition as a document's chooser offers it. */
export interface ExhibitionLinkOption {
  id: string
  /** `Muestra de Zafra · 1985 · Casa de Cultura`, the same as the artwork record offers. */
  text: string
  /**
   * The bare title, to name the show in the warning that the link went in.
   *
   * It goes apart from `text` on purpose: the selector's line carries the year and the venue because
   * there they are needed to tell two tourings of the same title apart, but a warning that
   * said «Documento enlazado con «Muestra de Zafra · 1985 · Sede sin identificar»» is
   * reading a list's padding out to the cataloguer.
   */
  title: string
  /**
   * This document is already linked to it. The row **is still listed** and is not
   * offered: hiding it would make the cataloguer type the same title over and over
   * wondering where it has got to. It is the citation selector's same criterion.
   */
  alreadyLinked: boolean
}

/**
 * The exhibitions the selector offers, the best match first.
 *
 * **The withdrawn ones are left out and not marked**, unlike the already linked ones:
 * this is a list for CHOOSING, and offering something the catalogue has withdrawn would bring it back
 * into circulation through the back door. It is the same criterion, and with the same boundary,
 * as the exhibition selector of an artwork's record.
 */
export function rankExhibitionLinkOptions(
  exhibitions: readonly ExhibitionRow[],
  query: string,
  linked: ReadonlySet<string>,
): RankedItem<ExhibitionLinkOption>[] {
  const offered = exhibitions.filter((row) => row.active)
  return fuzzyRankBy(offered, exhibitionOptionText, query).map(({ item, indices }) => ({
    item: {
      id: item.id,
      text: exhibitionOptionText(item),
      title: item.title.trim() || 'Exposición sin título',
      alreadyLinked: linked.has(item.id),
    },
    indices,
  }))
}

/** The identifiers of the exhibitions this document already has linked. */
export function linkedExhibitionIds(
  rows: readonly { exhibition_id: string; active: boolean }[],
): Set<string> {
  // LIVE links only: a retired one is not a link, and marking it as «ya enlazada» would hide
  // the only way to get it back, which is to link it again.
  return new Set(rows.filter((row) => row.active).map((row) => row.exhibition_id))
}

/** What the chooser says instead of an empty list, which it never is (RF-304). */
export function noExhibitionOptionsText(total: number, query: string): string {
  if (total === 0) {
    return (
      'Todavía no hay ninguna exposición en el catálogo. Se dan de alta en la pantalla ' +
      '«Exposiciones», con «+ Nueva».'
    )
  }
  if (query.trim() === '') {
    return 'Escribe para buscar entre las exposiciones del catálogo.'
  }
  return (
    'Ninguna exposición coincide con lo que has escrito. Si la muestra no está todavía en el ' +
    'catálogo, se da de alta en «Exposiciones».'
  )
}

/** What is said once the link has gone through. */
export function exhibitionLinkedNotice(exhibitionTitle: string): string {
  const clean = exhibitionTitle.trim()
  return `Documento enlazado con ${clean === '' ? 'la exposición' : `«${clean}»`}.`
}

/**
 * What is asked before removing the link, and **what does NOT happen**, which is the half
 * that matters: the document stays in the archive with its file, and it is still seen by
 * the artworks and the other linked exhibitions. Two taps, as in the rest of the
 * project: on a touch screen, one alone and what somebody researched disappears.
 */
export function retireExhibitionLinkText(exhibitionTitle: string): string {
  const clean = exhibitionTitle.trim()
  return (
    `Se quita de ${clean === '' ? 'esta exposición' : `«${clean}»`}. El documento se queda en el ` +
    'archivo con su fichero, y lo siguen viendo las demás fichas enlazadas.'
  )
}

/**
 * La frase que sustituye a la del bloque vacío una vez que enlazar SÍ se puede.
 *
 * La anterior decía que no se hacía desde ninguna pantalla, y era verdad. Dejarla ahí
 * después de construir el botón es exactamente la deriva que la tarjeta de la ficha de
 * obra ha pagado seis veces.
 */
export const NO_LINKED_EXHIBITIONS_WRITABLE =
  'Ninguna exposición lo tiene enlazado. Si es de una muestra, enlázalo con ella aquí abajo.'

export const NO_LINKED_EXHIBITIONS_READONLY =
  'Ninguna exposición lo tiene enlazado.'
