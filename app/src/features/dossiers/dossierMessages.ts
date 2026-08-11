/**
 * What the dossier screens say when the database says no.
 *
 * **The codes and the constraint names below were provoked, one by one, against
 * the schema itself** — the same 50 migrations, applied to a local base, with the
 * failing insert written by hand and the answer copied verbatim (11 August 2026).
 * They are not guessed, and the reason for the care is the one the exhibitions
 * module already wrote down: six different mistakes all arrive as `23514`, and the
 * only thing that tells them apart is the name of a check constraint, in English,
 * naming something the cataloguer has never heard of. Reading that name is not a
 * hack, it is the only available information.
 *
 *   `23514 … violates check constraint "dossiers_title_not_blank"`
 *   `23514 … "dossier_items_price_positive"`
 *   `23514 … "dossier_items_currency_shape"`
 *   `23514 … "dossier_items_artwork_shape"`
 *   `23514 … "dossier_items_text_shape"`
 *   `23514 … "dossier_items_biography_shape"`
 *   `23505 duplicate key value violates unique constraint "dossier_items_unique"`
 *   `23503 … violates foreign key constraint "dossier_items_catalog_id_fkey"`
 *   `P0001 La fotografía AR-0001_v99 no es de la obra AR-0001`   (trigger, ya en español)
 *
 * What was NOT provoked here is what the REST gateway adds on top —`42501` for a
 * session that cannot write, `PGRST116` for a record that is not there— and those
 * two are carried over from `exhibitionMessages`, where they were measured against
 * the real gateway with a real Lector's session. Said out loud so that nobody
 * reads this list as more than it is.
 *
 * Pure and free of React: the battery runs in node and cannot open a component,
 * so a sentence written inside JSX is a sentence nothing verifies.
 */

import type { DossierItemKind } from '../../lib/types'
import { isNetworkFailure } from '../tables/vocabularies'
import type { DatabaseFailure } from '../exhibitions/exhibitionMessages'

export type { DatabaseFailure }

/** The operation being attempted, which is what the fallback sentence names. */
export type DossierOperation =
  | 'load'
  | 'loadOne'
  | 'loadItems'
  | 'create'
  | 'save'
  | 'addArtwork'
  | 'addText'
  | 'addBiography'
  | 'addSection'
  | 'reorder'
  | 'setSection'
  | 'editItem'
  | 'removeItem'
  | 'retire'
  | 'restore'

const OPERATION_TEXT: Record<DossierOperation, string> = {
  load: 'No se han podido cargar los dossieres',
  loadOne: 'No se ha podido cargar el dossier',
  loadItems: 'No se ha podido cargar lo que lleva este dossier',
  create: 'No se ha podido crear el dossier',
  save: 'No se ha podido guardar el dossier',
  addArtwork: 'No se ha podido añadir la obra',
  addText: 'No se ha podido añadir el texto',
  addBiography: 'No se ha podido añadir la biografía',
  addSection: 'No se ha podido añadir la sección',
  reorder: 'No se ha podido cambiar el orden',
  setSection: 'No se ha podido cambiar de sección',
  editItem: 'No se ha podido guardar el cambio',
  removeItem: 'No se ha podido quitar del dossier',
  retire: 'No se ha podido retirar el dossier',
  restore: 'No se ha podido recuperar el dossier',
}

/**
 * The six check constraints, each in the words of its consequence.
 *
 * Three of them —the shapes of the three kinds— cannot be reached from these
 * screens at all, because every write goes through a function that composes the
 * row. They are mapped anyway: «unreachable» is a property of today's code, and
 * the day a fourth kind or a second writer appears the sentence still has to be
 * about the dossier and not about a constraint.
 */
const CHECK_TEXT: readonly (readonly [string, string])[] = [
  [
    'dossiers_title_not_blank',
    'El título no puede quedar en blanco: es como vas a encontrar el dossier dentro de un año.',
  ],
  [
    'dossier_items_price_positive',
    'Cero no es un precio. Deja el precio vacío si esa obra no lleva precio en este dossier.',
  ],
  [
    'dossier_items_currency_shape',
    'La moneda se escribe con el código de tres letras: EUR, USD.',
  ],
  [
    'dossier_items_artwork_shape',
    'Una obra del dossier no lleva texto libre dentro. Añade el párrafo como un texto aparte.',
  ],
  [
    'dossier_items_text_shape',
    'Un texto necesita al menos un rótulo o un párrafo, y no lleva obra ni precio.',
  ],
  [
    'dossier_items_biography_shape',
    'La biografía se escribe en la ficha del fondo, no en el dossier: aquí solo se elige de qué ' +
      'artista es y si lleva el currículum.',
  ],
  [
    'dossier_items_section_not_nested',
    'Una sección no va dentro de otra: no hay subsecciones.',
  ],
  [
    'dossier_items_section_not_self',
    'Una sección no puede estar dentro de sí misma. Vuelve a cargar la pantalla.',
  ],
]

/**
 * The sentence for a refusal, in Spanish and with the practical consequence.
 *
 * Anything unrecognised keeps the database's own message after the sentence: an
 * unexpected refusal that hides what the database said is a refusal nobody can
 * diagnose.
 */
export function dossierFailureText(
  failure: DatabaseFailure,
  operation: DossierOperation,
): string {
  const code = failure.code ?? ''

  if (code === '23514') {
    const hit = CHECK_TEXT.find(([name]) => failure.message.includes(name))
    if (hit) return hit[1]
  }

  // The same artwork twice in one dossier. It should never arrive, because adding
  // goes through `add_artwork_to_dossier`, which restores the withdrawn item
  // instead of colliding — so reaching this means the row was written some other
  // way, and the sentence still has to be useful.
  if (code === '23505' && failure.message.includes('dossier_items_unique')) {
    return 'Esa obra ya está en el dossier. Búscala en la lista: puede estar más abajo.'
  }

  if (code === '23503') {
    if (failure.message.includes('catalog_id')) {
      return 'Esa obra ya no está en el catálogo. Vuelve a cargar la pantalla.'
    }
    if (failure.message.includes('image_id')) {
      return 'Esa fotografía ya no está en el catálogo. Elige otra, o déjalo en la representativa.'
    }
    if (failure.message.includes('recipient_party_id')) {
      return 'El destinatario que habías elegido ya no está en el catálogo. Vuelve a elegirlo.'
    }
    if (failure.message.includes('artist_fund')) {
      return 'Ese fondo ya no está en el catálogo. Vuelve a cargar la pantalla.'
    }
    if (failure.message.includes('dossier_items_section_fk')) {
      return 'Esa sección ya no está en el dossier. Vuelve a cargar la pantalla.'
    }
    return `${OPERATION_TEXT[operation]}: algo con lo que estaba enlazado ya no está en el catálogo. Vuelve a cargar la pantalla.`
  }

  // Written by a trigger or by one of the three `add_*` functions, in Spanish and
  // for the cataloguer: passed through with its hint glued on. Rewriting it here
  // would be a second copy of a sentence that lives next to the rule — and these
  // are the ones that matter most, because they include «la fotografía no es de la
  // obra» and «este dossier ya lleva la biografía de ese fondo».
  if (code === 'P0001') {
    const hint = (failure.hint ?? '').trim()
    return hint === '' ? failure.message : `${failure.message}. ${hint}`
  }

  if (code === '42501') {
    return (
      'Tu sesión puede leer los dossieres pero no cambiarlos: eso es del Catalogador. Vuelve a ' +
      'entrar y prueba otra vez.'
    )
  }

  if (code === 'PGRST116') {
    return 'Ese dossier no está en el catálogo.'
  }

  if (isNetworkFailure(failure.message)) {
    return `${OPERATION_TEXT[operation]}: la aplicación no ha podido hablar con el catálogo. Comprueba la conexión y vuelve a intentarlo.`
  }

  return `${OPERATION_TEXT[operation]}: ${failure.message}`
}

/**
 * The result of a write, as a sentence to show or null when it worked.
 *
 * `rows` is why this exists: **PostgREST answers `[]` and no error to an update
 * that matched nothing** — measured on this project before, a PATCH on an
 * identifier that is not there comes back 200 with an empty array. Trusting «no
 * error» would make the screen say the dossier was changed while it was not.
 *
 * `undefined` means «not counted» and not «zero»: a call to an RPC returns no rows
 * to count.
 */
export function dossierWriteResult(
  operation: DossierOperation,
  result: { failure?: DatabaseFailure | null; rows?: number },
): string | null {
  if (result.failure) return dossierFailureText(result.failure, operation)
  if (result.rows === 0) {
    return 'No se ha tocado nada: o ya no está, o tu sesión no puede editarlo. Vuelve a cargar.'
  }
  return null
}

/**
 * The confirmation of quitting an item, which is not the same sentence for the
 * three kinds (RF-1612).
 *
 * An artwork comes back with its note and its price if it is added again, and
 * saying so is what stops somebody from not daring to tidy the dossier. A text
 * does not come back — there is nothing to restore it by, because two paragraphs
 * are not the same row — and that difference has to be on screen BEFORE the tap,
 * not discovered after it.
 */
export function removeItemConfirmText(kind: DossierItemKind, name: string): string {
  const named = name.trim() === '' ? '' : ` «${name.trim()}»`
  switch (kind) {
    case 'ARTWORK':
      return (
        `Se quitará${named} de este dossier. No se borra nada del catálogo, y si la añades otra vez ` +
        'vuelve con su nota y su precio.'
      )
    case 'TEXT':
      return (
        `Se quitará el texto${named}. El párrafo deja de salir en el PDF y no se puede recuperar ` +
        'desde aquí: habría que escribirlo otra vez.'
      )
    case 'BIOGRAPHY':
      return (
        'Se quitará la biografía de este dossier. El texto sigue en la ficha del fondo, así que se ' +
        'puede volver a añadir cuando quieras.'
      )
    case 'SECTION':
      return (
        `Se quitará la sección${named}. Sus obras no se van: pasan a la sección de antes, o al ` +
        'principio del dossier si no había ninguna.'
      )
  }
}

/**
 * The confirmation of retiring the whole dossier (RF-901).
 *
 * It names what it holds, because that is what changes the decision, and it ends
 * with the reassurance: nothing is deleted and the PDF already issued is
 * untouched, which is the part somebody is actually afraid of.
 */
export function retireDossierConfirmText(title: string, contents: string): string {
  const named = title.trim() === '' ? 'este dossier' : `«${title.trim()}»`
  return (
    `Se retirará ${named} (${contents}). No se borra: deja de aparecer en el listado y se puede ` +
    'recuperar desde aquí mismo. Los PDF que ya se hayan emitido no se tocan.'
  )
}
