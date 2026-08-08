/**
 * «Otros documentos relacionados» en la ficha de una exposición (RF-516, RF-517).
 *
 * ── QUÉ FALTABA ─────────────────────────────────────────────
 *
 * Un documento del archivo —una nota de prensa, un cartel, un díptico, una carta de la
 * galería— habla a la vez de una obra y de la muestra donde estuvo, y el esquema lo tiene
 * previsto desde el principio: dos tablas puente sobre un mismo documento, que es
 * precisamente lo que evita guardar el mismo escaneo dos veces. El vínculo con una
 * exposición ya se podía crear, pero solo desde la ficha del documento; **la exposición
 * no lo mostraba**, así que una nota de prensa enlazada con una muestra no aparecía en
 * ninguna parte de esa muestra.
 *
 * ── POR QUÉ AQUÍ SE ENLAZA Y NO SE SUBE ─────────────────────
 *
 * Subir un fichero, corregir los datos de un documento y añadirle un escaneo siguen
 * viviendo en la documentación de una obra, donde está la obra que el documento describe.
 * Aquí se enlaza uno que YA está en el archivo, y se retira el vínculo. Repartir la
 * misma escritura por dos pantallas con dos juegos de controles es cómo una de las dos
 * acaba dejando pasar algo — es el mismo reparto que ya hace la ficha del archivo.
 */

import type { ExhibitionDocumentLinkRow } from '../documentary/documentaryRows'

/** El recuento de la cabecera, que es lo único que se lee antes de recorrer la lista. */
export function exhibitionDocumentCountText(count: number): string {
  return count === 1 ? '1 documento' : `${count} documentos`
}

/**
 * La línea que se lee cuando la lista no se puede recorrer, y **nunca un hueco** (RF-304).
 *
 * Las tres son distintas y confundirlas cuesta una tarde: que todavía se está pidiendo,
 * que no se pudo pedir, y que no hay ninguno — que no es un error y no se presenta como
 * uno, porque una exposición sin documentos de archivo es lo normal.
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
      'No hay ningún documento del archivo enlazado con esta exposición. Una nota de prensa, un ' +
      'cartel o un díptico se suben desde la documentación de una obra y se enlazan aquí.'
    )
  }
  return null
}

/** Lo que se dice con permiso de edición y la lista ya poblada, debajo del botón. */
export const EXHIBITION_DOCUMENTS_HINT =
  'Se enlaza un documento que ya está en el archivo. Subir uno nuevo, corregir sus datos o ' +
  'añadirle el escaneo se hace desde la documentación de una obra.'

/** Los que ya están enlazados: se listan, se marcan y no se vuelven a ofrecer. */
export function linkedDocumentIds(rows: readonly ExhibitionDocumentLinkRow[]): Set<string> {
  return new Set(rows.filter((row) => row.active).map((row) => row.document_id))
}

/**
 * Lo que se lee al pedir que se quite un vínculo, antes de confirmarlo.
 *
 * Nombra el documento y dice qué NO se lleva: el documento sigue en el archivo y sus
 * otros vínculos siguen vivos. Sin decirlo, «quitar» sobre un documento que también
 * cuelga de tres obras parece que las va a tocar (RF-901).
 */
export function retireDocumentLinkText(title: string): string {
  return (
    `¿Quitar «${title}» de esta exposición? El documento sigue en el archivo, y lo que diga de ` +
    'otras obras o de otras exposiciones no se toca. El vínculo va a la papelera y se puede ' +
    'devolver.'
  )
}

/** Lo que se dice cuando el vínculo entra, nombrando el documento. */
export function documentLinkedNotice(title: string): string {
  return `«${title}» ya consta como documento de esta exposición.`
}

/** Lo que se dice cuando se quita, en los mismos términos. */
export function documentUnlinkedNotice(title: string): string {
  return `«${title}» ya no consta en esta exposición. Sigue en el archivo.`
}

/**
 * El título con el que se nombra un documento en estas frases.
 *
 * Sin él, un documento sin título produciría «¿Quitar «» de esta exposición?». Es la
 * misma regla que en el resto: antes un marcador que un hueco.
 */
export function documentTitleText(title: string | null | undefined): string {
  const clean = (title ?? '').trim()
  return clean === '' ? 'Documento sin título' : clean
}
