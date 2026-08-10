/**
 * Enlazar un documento del archivo con una exposición, y quitarle el vínculo
 * (RF-516, RF-517).
 *
 * Puro y sin React: lo que se ofrece, lo que se excluye y lo que se dice cuando la base
 * se niega se verifican aquí.
 *
 * ── EL HUECO ────────────────────────────────────────────────
 *
 * `exhibition_documents` y su función `document_exhibition` están en el esquema desde la
 * migración del archivo, con su `grant execute` al rol autenticado y con su prueba de
 * que restaura el vínculo retirado en vez de chocar contra la unicidad. **No las llamaba
 * nadie.** Así que el cartel de una muestra, su díptico o su nota de prensa —que son
 * documentos que no hablan de una pieza en concreto— no se podían enlazar con la muestra
 * desde ninguna pantalla, y la ficha del documento lo decía en voz alta en su bloque
 * vacío. Esto es quien la llama.
 *
 * ── POR QUÉ VIVE EN LA FICHA DEL DOCUMENTO ──────────────────
 *
 * La ficha del archivo se declaró de solo lectura, y esta es la excepción razonada: es
 * la única escritura que no se puede hacer en ningún otro sitio. Subir, corregir y
 * digitalizar viven en la documentación de una obra porque allí está la obra que el
 * documento describe; una exposición no tiene bloque de documentos, así que el único
 * sitio donde las dos cosas están a la vez es la ficha del documento.
 *
 * Y lleva su retirada: un vínculo que se puede crear y no quitar es una trampa, y en
 * este proyecto nada se borra pero todo se retira.
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
   * El título a secas, para nombrar la muestra en el aviso de que el vínculo entró.
   *
   * Va aparte de `text` a propósito: la línea del selector lleva el año y la sede porque
   * ahí hacen falta para distinguir dos itinerancias del mismo título, pero un aviso que
   * dijera «Documento enlazado con «Muestra de Zafra · 1985 · Sede sin identificar»» le
   * está leyendo a la catalogadora el relleno de una lista.
   */
  title: string
  /**
   * Este documento ya está enlazado con ella. La fila **se sigue listando** y no se
   * ofrece: esconderla haría que la catalogadora teclee el mismo título una y otra vez
   * preguntándose dónde se ha metido. Es el mismo criterio del selector de citas.
   */
  alreadyLinked: boolean
}

/**
 * Las exposiciones que el selector ofrece, la mejor coincidencia primero.
 *
 * **Las retiradas se dejan fuera y no se marcan**, al contrario que las ya enlazadas:
 * esto es una lista para ELEGIR, y ofrecer algo que el catálogo ha retirado lo devolvería
 * a la circulación por la puerta de atrás. Es el mismo criterio, y con la misma frontera,
 * que el selector de exposiciones de la ficha de una obra.
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
 * Lo que se pregunta antes de quitar el vínculo, y **lo que NO pasa**, que es la mitad
 * que importa: el documento se queda en el archivo con su fichero, y lo siguen viendo
 * las obras y las demás exposiciones enlazadas. Dos toques, como en el resto del
 * proyecto: en una pantalla táctil, uno solo y desaparece lo que alguien investigó.
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
