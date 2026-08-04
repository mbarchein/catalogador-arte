import type { AdditionPlan } from '../../lib/masterTables'
import type { DocumentTypeEntry } from '../../lib/types'
import { isNetworkFailure, planVocabularyAddition, vocabularyKey } from './vocabularies'

/**
 * What the document-types screen decides on its own (RF-515, RF-1106, ADR-007):
 * what typing a name into «Añadir» means, and which sentence in Spanish
 * corresponds to each refusal the database can send back.
 *
 * It lives apart from the screen for the usual reason of this project: there is no
 * DOM here and no request, so this is the part that can be tested for real. What
 * is NOT here is any rule the database already holds — that the name is unique,
 * that it cannot be blank, that a type still classifying documents cannot be
 * retired. Those live next to the data, where they cannot be bypassed, and this
 * only turns their answer into something the cataloger can act on.
 */

/**
 * The comparison key of a document-type name.
 *
 * **`document_types_name_unique` is an index over `public.place_key(name)`**, not
 * over the name, which is the one thing this vocabulary does differently from
 * `artwork_types`: the database itself refuses «cartel» next to «Cartel», accents
 * included. So the screen has to compare exactly as that function does, and
 * `placeKey` is the mirror of it that already exists — reusing it is the point,
 * because two normalizers that disagree would offer to create a type the database
 * then rejects.
 *
 * The tempting shortcut, `normalizeForSearch` (which is what `planAddition` of
 * masterTables uses for the artwork types), is NOT equivalent: it decomposes and
 * drops combining marks, so it flattens the ñ and the ç too. It would call
 * «Cañón» and «Canon» the same name, and then answer a request to add «Canon»
 * with a silent «already there» while the database would happily have taken it.
 */
export function documentTypeKey(name: string): string {
  return vocabularyKey(name)
}

/**
 * What typing a name into the «Añadir» field has to do, with the same four
 * outcomes as the other master tables (see `planAddition`): nothing, an insert, a
 * reuse of the equivalent name already on offer, or bringing a RETIRED one back.
 *
 * `restore` is the case that has to be decided here and not left to the insert:
 * nothing is ever deleted (RF-901), so a retired «Díptico» is still in the table
 * and inserting it comes back as a unique violation indistinguishable from «two
 * catalogers typed it at the same second». Treating both as success would answer
 * «añadido» and leave the type hidden — which is the opposite of what typing a
 * retired name means.
 */
export function planDocumentTypeAddition(
  entries: readonly DocumentTypeEntry[],
  text: string,
): AdditionPlan<DocumentTypeEntry> {
  // Shared with the publication types, because the decision came out identical
  // and because the ONE thing that could go wrong in it — comparing with a key
  // that flattens the ñ, which the unique index does not — is worth having in a
  // single place. See `vocabularies.ts`.
  return planVocabularyAddition(entries, text)
}

/** The four things this screen asks of the database, for the message it deserves. */
export type DocumentTypeAction = 'add' | 'rename' | 'retire' | 'restore'

/**
 * A refusal as it arrives from PostgREST: the SQLSTATE, the message and the hint,
 * which travel in three separate fields.
 *
 * Declared here instead of importing `PostgrestError` so this module stays free of
 * the client, and because only these three fields are read.
 */
export interface DatabaseRefusal {
  code?: string | null
  message: string
  hint?: string | null
}

const VERB: Record<DocumentTypeAction, string> = {
  add: 'añadir el tipo de documento',
  rename: 'renombrar el tipo de documento',
  retire: 'retirar el tipo de documento',
  restore: 'recuperar el tipo de documento',
}

/**
 * The one thing about retiring that the database does NOT say, and that changes
 * what the cataloger sees afterwards.
 *
 * `tg_document_type_deactivation` counts only ACTIVE documents, so a type used
 * exclusively by documents in the wastebasket CAN be retired — and then those
 * documents, if they come back, point at a type that the Reader's policy no longer
 * lets them read (`document_types_select` requires `active` for a Reader). Nobody
 * would guess that from a list of names, so the screen says it before the tap and
 * not after.
 */
export const RETIRE_CONSEQUENCE =
  'Retirar un tipo no cambia los documentos que ya lo tienen: solo deja de ofrecerse para ' +
  'los nuevos. Si algún documento activo lo usa, el catálogo no deja retirarlo hasta que se ' +
  'les cambie el tipo. Y si el único que lo usaba está en la papelera, al recuperarlo habrá ' +
  'que recuperar también el tipo.'

/**
 * The sentence the screen shows when the database says no.
 *
 * **The five cases are the ones the base really answers**, provoked against the
 * local database through PostgREST and not imagined:
 *  - `23505` for a repeated name, on insert and on rename alike, with the message
 *    «duplicate key value violates unique constraint "document_types_name_unique"»
 *    — a sentence that names an index and helps nobody;
 *  - `23514` for a blank name or one with spaces around it;
 *  - `P0001` for the trigger that refuses to retire a type documents still use.
 *    **Its message is already in Spanish and its hint is the useful half**, and
 *    they arrive in two fields: the places screen shows the message alone and
 *    drops «Cambia antes el tipo de esos documentos», which is precisely the part
 *    that says what to do. Here they are joined;
 *  - `42501` when the session is no longer allowed to write;
 *  - a missing refusal (`null`) for the quiet one: **an update that RLS denies
 *    comes back 204 with zero rows and NO error**, so the screen would otherwise
 *    report success and change nothing. Checked: a Reader renaming a type gets
 *    exactly that.
 *
 * Anything else keeps the raw message behind a Spanish lead-in, because inventing
 * a friendly sentence for an unknown failure hides the only clue there is.
 */
export function describeDocumentTypeRefusal(
  action: DocumentTypeAction,
  refusal: DatabaseRefusal | null,
): string {
  if (refusal === null) {
    // Zero rows touched and no error: either the session lost the Cataloger role
    // while the screen was open, or the row is gone. Both end in «reload and look
    // again», and neither is «guardado».
    return (
      'No se ha guardado nada. Puede que tu sesión ya no tenga permiso para mantener las ' +
      'tablas del catálogo: vuelve a entrar y comprueba si el cambio está.'
    )
  }

  const message = refusal.message.trim()

  if (refusal.code === '23505') {
    const shared =
      'Las mayúsculas y las tildes no cuentan para distinguirlos, así que «Cartel» y ' +
      '«cartel» serían el mismo tipo.'
    return action === 'rename'
      ? `Ya hay otro tipo de documento con ese nombre. ${shared} Si lo que quieres es unir los dos, cambia antes el tipo de los documentos que usan el que sobra.`
      : `Ya hay un tipo de documento con ese nombre. ${shared}`
  }

  if (refusal.code === '23514') {
    return 'El nombre no puede quedar vacío, ni empezar ni acabar con un espacio.'
  }

  if (refusal.code === 'P0001') {
    // The trigger writes for the cataloger, in Spanish: what it says is shown, and
    // the hint with it. Joined with a full stop, and without doubling the one the
    // message might already end with.
    const hint = refusal.hint?.trim() ?? ''
    const head = message.replace(/[.\s]+$/, '')
    return hint === '' ? `${head}.` : `${head}. ${hint}`
  }

  if (refusal.code === '42501') {
    return (
      'Tu sesión no tiene permiso para mantener los tipos de documento. Vuelve a entrar en ' +
      'la aplicación; si sigue igual, es que tu cuenta ya no es de catalogación.'
    )
  }

  // No code and a fetch failure: the request never reached the catalog. Saying so
  // is more useful than «Failed to fetch», and it tells her the cambio is not lost,
  // just not sent.
  if (isNetworkFailure(message)) {
    return `No se ha podido ${VERB[action]}: la aplicación no ha podido hablar con el catálogo. Comprueba la conexión y vuelve a intentarlo.`
  }

  return `No se ha podido ${VERB[action]}: ${message}`
}

/**
 * The sentence for a load that failed, which is NOT one of the four actions.
 *
 * It exists because the hook was showing `error.message` as it arrived, and the
 * screen was pasting it after a Spanish lead-in: on a phone with no coverage —
 * the likeliest failure of this screen — that read «No se han podido cargar los
 * tipos de documento: TypeError: Failed to fetch». English, and about fetch
 * rather than about the connection.
 *
 * Separate from `describeDocumentTypeRefusal` and not a fifth action of it,
 * because a failed load is not a refusal: nothing was being written, so there is
 * nothing to say about what was not saved, and the whole answer is «what you are
 * reading is not the vocabulary».
 */
export function describeDocumentTypeLoadFailure(refusal: DatabaseRefusal): string {
  if (isNetworkFailure(refusal.message)) {
    return (
      'No se ha podido leer la lista de tipos de documento: la aplicación no ha podido hablar ' +
      'con el catálogo. Comprueba la conexión y vuelve a entrar en esta pantalla.'
    )
  }
  // Verbatim behind a Spanish lead-in: an unpredicted failure is worth reporting,
  // but framed, so it reads as an answer and not as a broken screen.
  return `No se ha podido leer la lista de tipos de documento. La base de datos ha contestado: ${refusal.message.trim()}`
}

/**
 * The line under the title: how many types there are and how many are retired.
 *
 * It exists because **this vocabulary is not born empty.** The migration seeded
 * the ten values of the source document, so «no hay nada» is never the honest
 * reading of this screen, and a bare list of names gives no clue that three of
 * them stopped being offered months ago. Null when there is nothing to count, so
 * the empty state can speak instead.
 */
export function summarizeDocumentTypes(entries: readonly DocumentTypeEntry[]): string | null {
  if (entries.length === 0) return null
  const retired = entries.filter((entry) => !entry.active).length
  const active = entries.length - retired
  const onOffer = active === 1 ? '1 tipo en uso' : `${active} tipos en uso`
  if (retired === 0) return onOffer
  return `${onOffer} y ${retired === 1 ? '1 retirado' : `${retired} retirados`}`
}
