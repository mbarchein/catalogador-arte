import type { AdditionPlan, MasterEntry } from '../../lib/masterTables'
import {
  planVocabularyAddition,
  planVocabularyRename,
  type VocabularyRenamePlan,
} from './vocabularies'

/**
 * What the publication-types screen decides on its own (RF-514, RF-1106,
 * ADR-007): what typing a name means, what renaming one means, and which
 * sentence in Spanish corresponds to each answer the database can give.
 *
 * It lives apart from the screen for the usual reason of this project: there is
 * no DOM in the test suite, so anything that decides something has to be
 * reachable without one. What is left in the JSX is layout.
 *
 * **The rules themselves are not here.** That a name is unique, that a name
 * cannot be blank, that a type still classifying references cannot be retired:
 * all three live next to the data, and the last one is even written in Spanish
 * for the cataloger. A second copy on this side would be a copy that drifts.
 * What IS here is the translation of the first two, because those come back in
 * PostgreSQL's English — checked against the local database, not imagined:
 *
 *   {"code":"23505","message":"duplicate key value violates unique constraint
 *     \"publication_types_name_unique\"","hint":null}
 *   {"code":"23514","message":"new row for relation \"publication_types\"
 *     violates check constraint \"publication_types_name_not_blank\"","hint":null}
 *   {"code":"42501","message":"new row violates row-level security policy for
 *     table \"publication_types\"","hint":null}
 *
 * and the third comes back ready to show, message and hint separately:
 *
 *   {"code":"P0001","message":"No se puede retirar un tipo de publicación que
 *     todavía usan referencias del catálogo",
 *    "hint":"Cambia antes el tipo de esas referencias."}
 */

/**
 * What typing a name into «Añadir» has to do, and what saving a rename has to
 * do: the same two decisions as the archive document types, so they are made in
 * ONE place now that both vocabularies exist (see `vocabularies.ts`).
 *
 * They are shared and not copied because of the comparison key, which is
 * `place_key` and NOT `normalizeForSearch`: `publication_types_name_unique` is a
 * unique index over `place_key(name)`, so the key this side compares with IS the
 * index. `normalizeForSearch` — what the artwork types use, where the index is on
 * the literal name — also flattens the ñ and the cedilla, and predicting a
 * collision the database does not have would silently reuse «Reseña» for someone
 * who typed «Resena». One copy of that rule is one copy that cannot drift.
 *
 * The names stay because they are what this screen and its tests ask for, and
 * because a reader of the screen should not have to know which vocabulary the
 * generic version was written for.
 */
export const planPublicationTypeAddition = planVocabularyAddition
export const planPublicationTypeRename = planVocabularyRename
export type RenamePlan<E extends MasterEntry> = VocabularyRenamePlan<E>
export type { AdditionPlan }

/**
 * The sentence for a name that is already in the list, told with what to do
 * about it.
 *
 * Shared by the local prediction and by the duplicate-key answer, so the same
 * collision reads the same whether it was seen before the request or after.
 * `twinActive` is null when it is not known which type holds the name, which is
 * the case of the race.
 */
export function duplicateNameMessage(twinActive: boolean | null): string {
  const collision =
    'Ya hay un tipo de publicación con ese nombre: para el catálogo, «catalogo de subasta» y «Catálogo de subasta» son el mismo.'
  if (twinActive === false) {
    return `${collision} El que lo tiene está retirado: recupéralo aquí mismo en vez de dejar dos iguales.`
  }
  return `${collision} Unir dos tipos en uno no se hace aquí: cambia antes el tipo de las referencias que usen el que sobra y retíralo.`
}

/** What was being attempted, which is what an unexpected answer has to say. */
export type PublicationTypeAction = 'load' | 'add' | 'rename' | 'retire' | 'restore'

const ATTEMPT: Record<PublicationTypeAction, string> = {
  load: 'No se han podido cargar los tipos de publicación',
  add: 'No se ha podido añadir el tipo de publicación',
  rename: 'No se ha podido cambiar el nombre',
  retire: 'No se ha podido retirar el tipo de publicación',
  restore: 'No se ha podido recuperar el tipo de publicación',
}

/**
 * The shape of a failed write, as supabase-js hands it over. Declared narrow so
 * the translation can be tested without a client: a `PostgrestError` fits.
 */
export interface WriteFailure {
  /** PostgreSQL's SQLSTATE, or PostgREST's own. Empty when nothing answered. */
  code?: string | null
  message: string
  hint?: string | null
}

/**
 * The Spanish sentence for an answer from the database.
 *
 * The order of the branches is the order of what actually happens on this
 * screen, and each one is a message the cataloger can act on. The last branch
 * still carries the database's own words: a failure nobody predicted is worth
 * reporting verbatim, but framed, because «duplicate key value violates…» alone
 * looks like the application broke rather than like an answer.
 */
export function describePublicationTypeFailure(
  action: PublicationTypeAction,
  failure: WriteFailure,
): string {
  const code = failure.code ?? ''

  // Written for the cataloger by the trigger itself, hint included: «No se puede
  // retirar un tipo de publicación que todavía usan referencias del catálogo.
  // Cambia antes el tipo de esas referencias.» Rewriting it here would be a
  // second copy of a sentence that already says the consequence.
  if (code === 'P0001') {
    const hint = (failure.hint ?? '').trim()
    const sentence = failure.message.trim().replace(/\.$/, '')
    return hint === '' ? `${sentence}.` : `${sentence}. ${hint}`
  }

  if (code === '23505') return duplicateNameMessage(null)

  // The client trims before writing, so a blank name only reaches the database
  // when the field was empty and something got past the disabled button.
  if (code === '23514') return 'El nombre no puede quedar en blanco.'

  // A Cataloger who was one a minute ago and is not one now: the session
  // expired, or her role changed while the screen stayed open.
  if (code === '42501') {
    return `${ATTEMPT[action]}: tu sesión no tiene permiso para mantener las tablas. Puede que haya caducado; vuelve a entrar.`
  }

  // No code at all is not a rule saying no, it is nothing answering: the request
  // never arrived. Saying so matters because the change was NOT saved, and in a
  // storeroom without coverage that is the most likely failure of the screen.
  if (code === '') {
    return `${ATTEMPT[action]}: no hay conexión con el catálogo. Compruébala y vuelve a intentarlo.`
  }

  return `${ATTEMPT[action]}. La base de datos ha contestado: ${failure.message}`
}
