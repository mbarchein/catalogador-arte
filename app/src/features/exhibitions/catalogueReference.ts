/**
 * El catálogo de una exposición, que es una referencia de la bibliografía y no una
 * tabla propia (RF-503, RF-506).
 *
 * Puro y sin React, como el resto de las decisiones de esta carpeta.
 *
 * ── LO QUE FALTABA, Y NO ERA LA MITAD QUE PARECÍA ───────────
 *
 * `exhibitions.catalogue_reference_id` existe desde la primera migración de
 * exposiciones y **ninguna pantalla podía fijarlo**: el borrador de la ficha lo dejaba
 * fuera a propósito —«elegirlo necesita el selector de la bibliografía, que es otra
 * pantalla»— así que la columna estaba siempre a nulo. El plan de pruebas lo tenía
 * anotado como «la ficha de exposición dice si hubo catálogo pero no nombra la
 * referencia que lo es ni enlaza con ella, y no hay ficha de referencia adonde ir».
 * Ahora hay ficha de referencia, y esto es la otra mitad: poder decir cuál es.
 *
 * ── POR QUÉ ES UNA OPERACIÓN APARTE Y NO UN CAMPO MÁS ───────
 *
 * Porque no se comporta como los ocho campos del formulario:
 *
 *   · **La base la ata a otro campo.** `exhibitions_catalogue_reference_needs_catalogue`
 *     rechaza el vínculo mientras `catalogue_published` no sea «Sí», así que elegir una
 *     referencia depende de una respuesta que se da en otro sitio de la misma pantalla.
 *     Se dice ANTES, no después de un viaje de ida y vuelta.
 *   · **Se elige, no se escribe.** Necesita el catálogo entero de referencias cargado y
 *     un buscador, que es medio panel; los ocho campos son texto y desplegables.
 *   · **Y su ausencia tiene que poder decirse.** Quitar el vínculo es una operación con
 *     sentido propio —«esto no era su catálogo»— y no un campo que se deja vacío.
 *
 * El guardado del formulario sigue sin mandar esta columna, que es lo que garantiza que
 * corregir el título de una muestra no le borre su catálogo (está escrito en
 * `useExhibition`). Esta operación manda esta columna y ninguna otra.
 */

import type { TriState } from '../../lib/types'
import { referenceOptionHint } from '../documentary/bibliography/referenceChoice'
import { referenceTitleText } from '../documentary/bibliography/referenceEdit'
import type { ReferenceRow } from '../documentary/documentaryRows'

/**
 * Por qué no se puede elegir el catálogo todavía, o null cuando sí.
 *
 * Es el espejo de `exhibitions_catalogue_reference_needs_catalogue`, medido: la base
 * rechaza el vínculo si `catalogue_published` no es «Sí». Y las dos negativas son
 * distintas, que es lo que hace que la frase sirva de algo:
 *
 *   · «Sin revisar» es que **nadie ha mirado** si hubo catálogo. Lo que hay que hacer
 *     es investigarlo, y la respuesta puede ser que sí.
 *   · «No» es que se investigó y **no hubo catálogo**. Enlazar uno entonces no es
 *     completar la ficha: es contradecirla, y lo que hay que corregir es el «No».
 */
export function catalogueChoiceBlockedReason(cataloguePublished: TriState): string | null {
  if (cataloguePublished === 'YES') return null
  if (cataloguePublished === 'NO') {
    return (
      'Esta exposición consta SIN catálogo, así que no se le puede enlazar uno: sería contradecir la ' +
      'ficha. Si lo hubo, corrige antes «¿Se publicó catálogo?» y ponlo en «Sí».'
    )
  }
  return (
    'No consta todavía si esta exposición publicó catálogo, y la base no admite enlazar uno mientras ' +
    'no conste. Responde antes «¿Se publicó catálogo?»: «sin revisar» no es «no».'
  )
}

/**
 * Lo que la ficha lee sobre su catálogo, en una línea, y **nunca un hueco** (RF-304).
 *
 * Las cuatro respuestas son distintas y confundirlas cuesta una mañana de biblioteca:
 * que no consta, que no hubo, que hubo y sabemos cuál es, y que hubo y no está
 * enlazado — que es lo que hay que hacer y no un error.
 */
export function catalogueReferenceLine(input: {
  cataloguePublished: TriState
  reference: ReferenceRow | null
  /** Verdadero cuando la columna apunta a una referencia que esta sesión no puede leer. */
  unreadable?: boolean
}): string {
  const { cataloguePublished, reference, unreadable = false } = input
  if (cataloguePublished === 'UNREVIEWED') return 'No consta si publicó catálogo.'
  if (cataloguePublished === 'NO') return 'No publicó catálogo.'
  if (unreadable) {
    return (
      'Publicó catálogo, y consta cuál es, pero esa referencia no se puede leer desde aquí: puede ' +
      'estar retirada del catálogo.'
    )
  }
  if (reference === null) {
    return 'Publicó catálogo, y todavía no consta cuál de las referencias de la bibliografía lo es.'
  }
  return `Publicó catálogo: ${referenceTitleText(reference)}.`
}

/** La segunda línea del catálogo enlazado: quién, cuándo y dónde salió. */
export function catalogueReferenceHint(reference: ReferenceRow): string {
  return referenceOptionHint(reference)
}

export type CatalogueReferencePlan =
  | { action: 'blocked'; message: string }
  /** Nada que mandar: no es un error y no se presenta como uno. */
  | { action: 'unchanged' }
  | { action: 'set'; referenceId: string }
  | { action: 'clear' }

/**
 * Qué hacer con la elección.
 *
 * `unchanged` importa por lo mismo que en el resto del proyecto: escribir la fila mueve
 * `updated_at` y deja una línea del historial de un cambio que nadie ha hecho
 * (RF-1501). Y quitar el vínculo de una exposición que no lo tenía es también nada.
 */
export function planCatalogueReference(input: {
  cataloguePublished: TriState
  current: string | null
  /** Null es «quitar el vínculo». */
  chosen: string | null
}): CatalogueReferencePlan {
  const { cataloguePublished, current, chosen } = input
  if (chosen === current) return { action: 'unchanged' }
  if (chosen === null) return { action: 'clear' }
  // Quitar el vínculo se admite SIEMPRE, también con la ficha en «No» o «sin revisar»:
  // es la única salida de una fila incoherente que hubiera llegado por SQL, y negarla
  // dejaría a la pantalla sin forma de arreglarla.
  const blocked = catalogueChoiceBlockedReason(cataloguePublished)
  if (blocked !== null) return { action: 'blocked', message: blocked }
  return { action: 'set', referenceId: chosen }
}

/** Lo que se dice cuando la elección ha entrado. */
export function catalogueReferenceNotice(plan: CatalogueReferencePlan, title: string): string {
  if (plan.action === 'clear') {
    return 'Ya no consta cuál es su catálogo. La referencia sigue en la bibliografía.'
  }
  const clean = title.trim()
  return `${clean === '' ? 'La referencia' : `«${clean}»`} queda como el catálogo de esta exposición.`
}

/**
 * Lo que dice el selector en vez de una lista vacía, que nunca lo es (RF-304).
 *
 * Los dos casos son distintos: la bibliografía está vacía, o tiene referencias y ninguna
 * coincide. El segundo tiene que decir **de dónde sale una referencia nueva**, porque si
 * no, se teclea el título del catálogo que se tiene en la mano, no aparece nada y se
 * concluye que el buscador está roto.
 */
export function noCatalogueOptionsText(total: number, query: string): string {
  if (total === 0) {
    return (
      'Todavía no hay ninguna referencia en la bibliografía. El catálogo de una muestra se da de alta ' +
      'como cualquier referencia: citándolo desde la bibliografía de una obra que aparezca en él.'
    )
  }
  if (query.trim() === '') {
    return 'Escribe para buscar entre las referencias de la bibliografía.'
  }
  return (
    'Ninguna referencia coincide con lo que has escrito. Si el catálogo de esta muestra no está ' +
    'todavía en la bibliografía, se da de alta citándolo desde una obra que aparezca en él.'
  )
}
