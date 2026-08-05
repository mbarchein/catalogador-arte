/**
 * Corregir los datos de un documento del archivo, y darle el escaneo que le falte
 * (RF-515, RF-408, RF-516).
 *
 * Hasta hoy un documento se registraba y se quedaba como se hubiera registrado: la
 * signatura mal copiada, el tipo sin clasificar y el escaneo que no se tenía a mano
 * eran definitivos, y los dos paneles que lo subían lo advertían antes de guardar
 * porque no había ninguna pantalla que lo arreglara. Las columnas eran editables y
 * la política `archive_documents_update` estaba puesta desde el primer día: lo que
 * faltaba era esto.
 *
 * **Lo que hace este módulo es decidir, y por eso está fuera del formulario.** Qué
 * ha cambiado de verdad, qué se va a mandar, a cuánta gente le cambia lo que lee y
 * qué se dice cuando el documento ya tiene fichero. La batería corre en node y no
 * puede abrir un panel ni elegir un fichero, así que una regla dentro del JSX es una
 * regla que nadie comprueba.
 *
 * ── UN DOCUMENTO NO ES UN CAMPO DE ESTA OBRA ──
 * Es la misma frontera que la referencia bibliográfica, y se cruza igual de fácil:
 * el panel se abre desde la ficha de una obra, así que parece que corrige la ficha.
 * Corrige el ARCHIVO. Un recorte de prensa enlazado con tres obras y con una
 * exposición cambia en los cuatro sitios, y el aviso lo dice con el número delante,
 * porque «lo verán las demás» es abstracto y «lo verán las otras tres obras y una
 * exposición» cambia la decisión.
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
 * Lo que este módulo necesita de la fila. Un subconjunto estructural de
 * `DocumentRow`, para que un test construya el caso sin las dos maestras
 * incrustadas ni las cuatro columnas de auditoría.
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
 * La fila como el formulario la escribe.
 *
 * Los nulos de texto se abren a cadena vacía porque un `input` controlado con `null`
 * es un campo que React da por no controlado; los nulos de las claves ajenas se
 * conservan, porque ahí el nulo ES una respuesta —«sin clasificar»— y no un hueco.
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
  /** Falta algo o hay una incoherencia: la base lo rechazaría y se dice antes. */
  | { action: 'problems'; problems: DocumentDraftProblem[] }
  /** Nada que mandar. No es un error y no se presenta como uno. */
  | { action: 'unchanged' }
  | { action: 'update'; payload: Record<string, unknown> }

/**
 * Qué hacer con lo que hay en el formulario.
 *
 * El caso `unchanged` no es una comodidad: sin él, abrir el panel y cerrarlo con
 * «Guardar» escribiría la fila, y escribir la fila mueve `updated_at`, `updated_by`
 * y una entrada del historial de cambios (RF-1501). Un documento que consta
 * corregido hoy sin que nadie haya corregido nada es una traza que miente, y el
 * historial de esta aplicación existe justamente para que no mienta.
 *
 * La signatura duplicada NO se comprueba aquí, al contrario que la clave BibTeX de
 * una referencia: aquel panel tiene la lista entera de referencias cargada y este no
 * tiene la del archivo, así que compararla sería compararla contra nada. La contesta
 * el índice único sobre `place_key(archive_code)` y la traduce
 * `describeDocumentRefusal`. Lo que sí se hace es normalizar la signatura igual que
 * el índice la compara, para que cambiar «ar-arch-1» por «AR-ARCH-1» no salga como
 * una corrección: para la base es la misma.
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

// ── Lo que hay que decir antes de guardar ─────────────────────

const SHARED_ROW =
  'Este documento es del archivo, no de esta obra: lo que corrijas aquí se lee igual desde ' +
  'cualquier ficha enlazada con él.'

/** A cuántas fichas más les cambia lo que leen. */
export interface DocumentReach {
  /** Obras distintas de esta, o null mientras se cuenta y cuando el recuento falló. */
  otherArtworks: number | null
  /** Exposiciones enlazadas con el documento, con el mismo criterio para el null. */
  exhibitions: number | null
}

/**
 * El aviso de encima de los campos, con el alcance MEDIDO cuando se puede.
 *
 * `null` es «no contado» y no «cero», y es el caso que no puede mentir: mientras el
 * recuento viaja, o cuando se cayó —una barra de cobertura en un almacén—, el aviso
 * conserva la parte que es cierta y dice en voz alta que el número no se sabe.
 * Escribir «no lo tiene enlazado nada más» sobre un recuento fallido es cómo alguien
 * reescribe una signatura creyendo que es cosa suya.
 *
 * Las dos mitades se cuentan aparte porque son dos tablas puente (RF-516) y una
 * exposición no es una obra: un cartel enlazado con la muestra y con ninguna obra
 * más sigue siendo un cartel que otra ficha lee.
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
 * Lo que dice el panel cuando el documento que se corrige está retirado del archivo
 * (RF-901), o null cuando está en circulación.
 *
 * Un Catalogador ve documentos retirados —la ficha de una obra enlazada con uno lo
 * muestra con su etiqueta—, así que el panel se puede abrir sobre uno, y corregirlo
 * es legítimo: el vínculo es real y su título se lee. Lo que no puede pasar es que
 * la corrección lo devuelva a circulación sin que nadie lo haya pedido.
 */
export function documentRetiredNotice(document: Pick<EditableDocument, 'active'>): string | null {
  if (document.active) return null
  return (
    'Este documento está retirado del archivo. Se puede corregir, y seguirá retirado: ' +
    'recuperarlo se hace desde la papelera, no desde aquí.'
  )
}

/** Lo que se dice cuando la corrección ha entrado. */
export function documentEditedNotice(title: string): string {
  const clean = title.trim()
  return `${clean === '' ? 'El documento' : `«${clean}»`} queda corregido en el archivo.`
}

// ── El escaneo que faltaba ────────────────────────────────────

/**
 * Por qué no se puede añadir un escaneo a este documento, o null cuando sí.
 *
 * Una sola negativa y es la que importa: **ya tiene fichero**. Las rutas de este
 * almacén son inmutables porque el *service worker* cachea por ruta, así que
 * «cambiar el escaneo» no es sobrescribir: es subir otro fichero y dejar huérfano el
 * anterior, con la ficha diciendo un peso que ya no es el que hay detrás. Eso es una
 * decisión aparte —qué se hace con el que sobra— y hasta que se tome, este panel
 * añade lo que falta y no sustituye lo que hay.
 *
 * No se comprueba si el documento está retirado: un expediente que se retiró del
 * archivo sigue mereciendo su escaneo, y digitalizarlo no lo devuelve a circulación.
 */
export function scanTargetProblem(document: Pick<EditableDocument, 'file_path'>): string | null {
  const path = document.file_path?.trim() ?? ''
  if (path === '') return null
  return (
    'Este documento ya tiene su fichero subido. Sustituirlo no se hace desde aquí: los ficheros ' +
    'del almacén no se sobrescriben nunca —la ficha y el navegador los recuerdan por su ruta—, así ' +
    'que cambiar el escaneo dejaría el anterior suelto y sin que nadie lo pueda encontrar. Si el ' +
    'que está subido está mal, regístralo como un documento nuevo y retira este de la ficha.'
  )
}

/** Lo que se dice cuando el escaneo ya está arriba. */
export function scanAddedNotice(title: string, bytes: number): string {
  const clean = title.trim()
  const weight = fileSizeText(bytes)
  const size = weight === null ? '' : ` (${weight})`
  return (
    `${clean === '' ? 'El documento' : `«${clean}»`} ya está digitalizado${size}: ` +
    'se puede descargar desde cualquier ficha enlazada con él.'
  )
}
