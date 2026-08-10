import type { AdditionPlan, MasterEntry } from '../../lib/masterTables'
import { placeKey } from '../../lib/places'

/**
 * What the FLAT vocabularies of the «Tablas» section decide alike (RF-1106,
 * ADR-007): what typing a name into «Añadir» means, and what saving a rename
 * means, for a table whose unique index is built over `public.place_key(name)`.
 *
 * ── WHY THIS FILE EXISTS AND WHY IT IS SO SMALL ──────────────
 *
 * Six master tables got a screen at once, and only the pure part of two of them
 * came out identical: the publication types and the archive document types. Both
 * had written the same ten lines, and both had written them because the shared
 * `planAddition` of `lib/masterTables` compares with `normalizeForSearch` — which
 * decomposes and drops combining marks, so it flattens the ñ and the ç too.
 *
 * That difference is not cosmetic and it is the reason this is shared rather than
 * repeated a third time. The unique indexes of the new master tables are over
 * `public.place_key(name)`, which lowercases and strips accents BUT LEAVES THE ñ
 * STANDING. With `normalizeForSearch`, asking to add «Canon» while the catalogue
 * holds «Cañón» would answer a silent «ya está» and add nothing, when the
 * database would have taken it happily. One place for that rule means the next
 * vocabulary cannot get it wrong by copying the wrong neighbour.
 *
 * **What is NOT here is anything the database already holds** — that a name is
 * unique, that it cannot be blank, that a type still in use cannot be retired.
 * Those live next to the data and each screen shows their sentence, in its own
 * words: «referencias del catálogo» and «documentos del archivo» are not the same
 * sentence, and a shared message would have to say neither. That is also why the
 * translation of the refusals stayed in each module and did not move here.
 */

/**
 * The comparison key of a vocabulary name: the mirror, character by character, of
 * `public.place_key`, which is the function the unique indexes are built on.
 *
 * So the prediction this side makes IS the index, and not an opinion about it.
 */
export function vocabularyKey(name: string): string {
  return placeKey(name)
}

/**
 * What typing a name into the «Añadir» field has to do: nothing, an insert, a
 * reuse of the equivalent already on offer, or bringing a RETIRED one back.
 *
 * `restore` is the outcome that cannot be left to the insert. Nothing is ever
 * really deleted (RF-901), so a retired entry is still in the table and its name
 * is still covered by the unique index: inserting it comes back as a duplicate
 * key, indistinguishable from «two catalogers typed it at the same second».
 * Treating both as success would answer «añadido» and leave the entry exactly as
 * hidden as it was — the opposite of what typing its name means.
 */
export function planVocabularyAddition<E extends MasterEntry>(
  entries: readonly E[],
  text: string,
): AdditionPlan<E> {
  // Trimmed here and not only shown trimmed: these columns check that the name
  // equals its own trim, so letting « Folleto » through would answer with a
  // PostgreSQL constraint name in English for what is not even a mistake.
  const name = text.trim()
  if (name === '') return { action: 'blank' }

  const key = vocabularyKey(name)
  const twin = entries.find((entry) => vocabularyKey(entry.name) === key)
  if (twin === undefined) return { action: 'insert', name }
  return twin.active ? { action: 'reuse', entry: twin } : { action: 'restore', entry: twin }
}

/**
 * What saving the rename field has to do.
 *
 * `unchanged` is worth its branch: opening the pencil and saving without typing
 * is a common gesture, and answering it with a write would move `updated_at` and
 * leave an audit row about a change that did not happen.
 *
 * `taken` is predicted here, rather than left to the index, for the answer it
 * buys: the cataloger is told before the round trip that the name belongs to
 * something already in the list, and whether that something is retired — which
 * are two different pieces of advice. The duplicate-key branch of each module
 * stays as the net for the race, which is the case a prediction cannot see.
 */
export type VocabularyRenamePlan<E extends MasterEntry> =
  | { action: 'blank' }
  | { action: 'unchanged' }
  | { action: 'taken'; entry: E }
  | { action: 'rename'; name: string }

export function planVocabularyRename<E extends MasterEntry>(
  entries: readonly E[],
  id: string,
  text: string,
): VocabularyRenamePlan<E> {
  const name = text.trim()
  if (name === '') return { action: 'blank' }

  const current = entries.find((entry) => entry.id === id)
  if (current !== undefined && current.name === name) return { action: 'unchanged' }

  const key = vocabularyKey(name)
  // Itself excluded on purpose: fixing «catalogo de exposicion» into «Catálogo de
  // exposición» does not change the key, and it is exactly the correction these
  // screens exist for.
  const twin = entries.find((entry) => entry.id !== id && vocabularyKey(entry.name) === key)
  if (twin !== undefined) return { action: 'taken', entry: twin }
  return { action: 'rename', name }
}

/**
 * The answer to a write that came back with NO error and zero rows touched.
 *
 * Measured against the local base with a Reader's token: a PATCH the policies
 * refuse answers 204 — or 200 with an empty list when the representation is
 * asked for — and no error at all. Reporting success there is the one mistake a
 * maintenance screen cannot make: the cataloger closes it believing the catalogue
 * is fixed.
 */
export const VOCABULARY_MISSING_ROW =
  'No se ha guardado nada: o tu sesión no puede mantener las tablas, o la entrada ya no está. Vuelve a entrar.'

/**
 * Whether an answer is «nothing answered» rather than «a rule said no».
 *
 * It matters because the two need opposite sentences: a rule saying no means the
 * change will never be accepted as written, and a dead connection means it was
 * not even sent — the change is not lost, and in a storeroom without coverage
 * that is the likeliest failure of these screens.
 */
export function isNetworkFailure(message: string): boolean {
  return (
    message.trim() === '' ||
    /failed to fetch|networkerror|network error|load failed/i.test(message)
  )
}
