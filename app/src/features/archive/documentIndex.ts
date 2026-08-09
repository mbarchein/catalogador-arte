/**
 * El índice del archivo: en qué orden se lee, qué caza la búsqueda y qué dice cada
 * fila (RF-515, RF-606, RF-609).
 *
 * Puro y sin React, como todo lo que decide en este proyecto: la batería corre en node
 * sin DOM, así que el orden de una lista y las palabras de una fila se verifican aquí o
 * no se verifican.
 *
 * **Reutiliza tal cual lo que ya decide el selector de la ficha de obra**
 * (`documentLink.ts`): las columnas, la línea de la fila y la frase de «sin
 * digitalizar». Un documento tiene que leerse IGUAL en el listado del archivo que en el
 * selector que lo enlaza, o son dos dialectos del mismo catálogo. Lo nuevo es solo lo
 * que necesita una lista y un selector no: el orden de la tabla entera y el recuento.
 *
 * ── POR QUÉ EXISTE ESTA PANTALLA ────────────────────────────
 *
 * Un documento del archivo se subía, se enlazaba, se descargaba, se corregía y se
 * digitalizaba — todo desde la ficha de una obra que lo tuviera enlazado. Así que a un
 * documento que ninguna obra tuviera enlazado **no se llegaba desde ningún sitio**: ni
 * el cartel de una exposición que no habla de una pieza concreta, ni el documento que
 * se dio de alta y cuyo vínculo se retiró después. Seguía en el archivo, ocupando su
 * signatura, invisible. Es el mismo hueco que tenía la bibliografía y se cierra igual.
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
 * Las columnas del índice, que son las que ya pide el selector.
 *
 * Importadas y no reescritas: las dos listas enseñan las mismas filas con las mismas
 * palabras, así que una columna que una necesite la necesita la otra.
 */
export { DOCUMENT_OPTION_COLUMNS as DOCUMENT_INDEX_COLUMNS }

/** Lo que la búsqueda mira, que es también lo que la fila enseña. */
export { documentOptionText as archiveSearchText }

/**
 * Con qué se ordena un documento: **por su signatura**, y los que no la tienen después.
 *
 * Es el orden de la estantería, y por eso es el bueno aquí: la signatura es la etiqueta
 * escrita en la carpeta y un archivo se recorre por ella. No es el orden del bloque de
 * una obra —que va de lo antiguo a lo reciente, porque allí lo que se lee es el
 * recorrido de una pieza— y la diferencia merece la pena señalarla: son dos preguntas
 * distintas sobre las mismas filas.
 *
 * **Los que no tienen signatura van al final**, y aquí sí, al contrario que la
 * referencia sin firma en la bibliografía. No es una incoherencia: un documento sin
 * signatura es un documento que todavía **no está archivado** —un recorte que se anotó
 * antes de guardarlo—, así que no tiene sitio en la estantería y ponerlo entre los que
 * lo tienen inventaría un orden. Una referencia sin autor, en cambio, sí tiene un sitio
 * natural en el alfabeto: el de su título.
 *
 * La comparación es la del índice único, `place_key`: dos signaturas que solo difieren
 * en mayúsculas o tildes son la misma signatura para la base, así que también para el
 * orden.
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

/** Una fila del índice, lista para pintar. */
export interface ArchiveIndexEntry {
  row: DocumentOption
  /** La signatura escrita en la carpeta, o null cuando el documento no está archivado. */
  code: string | null
  /** El título o descripción corta. Nunca vacío: la base lo exige. */
  title: string
  /** «Carta», «Recorte de prensa»… o «Tipo sin clasificar». Nunca un hueco (RF-304). */
  kind: string
  /** La fecha de ADR-004, o «Sin fecha». */
  date: string
  /** «Digitalizado · 3,2 MB» o «Sin digitalizar». Es la respuesta a si hay que ir al papel. */
  fileText: string
  /** Sin fichero subido: lo que decide si se puede leer desde aquí o hay que buscar el papel. */
  digitized: boolean
  /** En la papelera. Se pinta apagado — y SE DICE, porque el gris a secas es decoración. */
  retired: boolean
  text: string
  indices: number[]
}

/**
 * Las filas del índice, la mejor coincidencia primero.
 *
 * **Los retirados se esconden salvo que se pidan** (RF-609), y pedirlos es la única
 * forma de que uno vuelva.
 */
export function rankArchiveDocuments(
  rows: readonly DocumentOption[],
  query: string,
  options: { includeRetired?: boolean } = {},
): ArchiveIndexEntry[] {
  const visible = options.includeRetired === true ? rows : rows.filter((row) => row.active)
  // Ordenados ANTES de puntuar: `fuzzyRankBy` es estable y conserva el orden de quien
  // llama entre coincidencias igual de buenas, así que el orden de la estantería
  // sobrevive dentro de cada nivel del ranking.
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

/** Cuántos están en la papelera, para ofrecer el interruptor solo cuando hay algo dentro. */
export function retiredDocumentCount(rows: readonly DocumentOption[]): number {
  return rows.filter((row) => !row.active).length
}

/**
 * Lo que se lee encima de la lista: cuántos hay, cuántos se enseñan y **cuántos están
 * sin digitalizar**.
 *
 * La tercera cifra es la que solo tiene sentido en esta pantalla: es la lista de
 * trabajo del escaneo. En el bloque de una obra la pregunta es «¿puedo leer este
 * papel?»; aquí es «¿cuánto archivo queda por digitalizar?».
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

/** Cuántos de los que se están enseñando no tienen fichero. */
export function withoutFileCount(entries: readonly ArchiveIndexEntry[]): number {
  return entries.filter((entry) => !entry.digitized).length
}

/**
 * Lo que va donde irían las filas cuando no hay ninguna, o null cuando sí hay.
 *
 * **Nunca una página en blanco**, que es criterio del proyecto: una búsqueda sin
 * resultados devuelve la misma página con el motivo, y no una lista vacía que se lee
 * como un archivo vacío.
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
