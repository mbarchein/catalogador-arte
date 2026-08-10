import { placeKey } from '../../lib/places'
import type { ArtworkRelationshipType } from '../../lib/types'
import { predicate } from '../documentary/relationships/relatedArtworks'
import { isNetworkFailure } from './vocabularies'

/**
 * Maintaining the vocabulary of relationship kinds (RF-217, RF-901, RF-1106,
 * ADR-007): what the «Tipos de relación» screen decides before it asks the
 * database, and how it says in Spanish whatever the database answers.
 *
 * **This is the only master with a DIRECTION**, and that is what makes it a
 * module of its own instead of one more caller of `masterTables.ts`. An entry is
 * not a name: it is a PAIR of readings — «Estudio previo de» from one artwork and
 * «Obra final de» from the other — plus the flag saying whether the two ends read
 * the same. Writing only one half is the failure this file exists to prevent: the
 * record of the second artwork reads `inverse_name` straight out of the row, so a
 * kind saved with the wrong inverse label publishes the study as the finished
 * work, and nothing downstream can tell — both halves are perfectly valid text.
 *
 * Everything here is pure: it answers either the columns to write or the sentence
 * explaining why not. The screen renders one or calls the other.
 *
 * **What is NOT here is any rule the database already holds.** Uniqueness by
 * comparison key, the coherence between `inverse_name` and `is_symmetric`, the
 * refusal to retire a kind that relationships still use and the freeze on the
 * symmetry of a kind already used (RF-217: «ninguna clase en uso cambia de
 * simetría») all live next to the data, and several of them answer in Spanish
 * already. What this file does with those is TRANSLATE them, from the code
 * PostgreSQL sends into the consequence the cataloger needs — never re-implement
 * them. The one exception is the equivalence check of `planRelationshipTypeAddition`,
 * and it is there for the reason `masterTables.ts` gives: a unique violation
 * cannot tell «somebody added it a second ago» from «it is in the trash», and
 * those two need opposite answers.
 */

/** What the add form and the rename field hold while they are being filled in. */
export interface RelationshipTypeDraft {
  /** The reading from the artwork the arrow leaves: «Estudio previo de». */
  name: string
  /**
   * The reading the artwork at the other end shows: «Obra final de». Ignored —
   * not rejected — when `symmetric` is on, so that toggling the direction back
   * and forth does not lose what was typed.
   */
  inverseName: string
  /** The relationship reads the same from both ends: «Pareja de». */
  symmetric: boolean
}

/** The three columns that describe a kind, named as the table names them. */
export interface RelationshipTypeColumns {
  name: string
  inverse_name: string
  is_symmetric: boolean
}

/** The kinds of write this screen does, for the sentence that reports a failure. */
export type RelationshipTypeAction = 'add' | 'rename' | 'retire' | 'restore'

const VERB: Record<RelationshipTypeAction, string> = {
  add: 'añadir el tipo de relación',
  rename: 'guardar el cambio',
  retire: 'retirar el tipo de relación',
  restore: 'recuperar el tipo de relación',
}

/** Stands in for a reading not written yet, in the preview of the form. */
const MISSING_LABEL = '…'

/**
 * The draft as the three columns would be stored.
 *
 * Trimmed here and not only shown trimmed: `artwork_relationship_types` has a
 * `check` that each label equals its own trim, so letting a trailing space
 * through would answer a request to add «Estudio previo de » with a constraint
 * name in English.
 *
 * A symmetric kind gets an EMPTY inverse label, whatever the field held. The
 * table demands it (`inverse_coherent`) and the reason is not bookkeeping: two
 * labels for one fact would let each record pick a different one.
 */
export function relationshipTypeColumns(draft: RelationshipTypeDraft): RelationshipTypeColumns {
  return {
    name: draft.name.trim(),
    inverse_name: draft.symmetric ? '' : draft.inverseName.trim(),
    is_symmetric: draft.symmetric,
  }
}

/** The draft that shows an existing kind in the rename field. */
export function relationshipTypeDraft(
  entry: Pick<ArtworkRelationshipType, 'name' | 'inverse_name' | 'is_symmetric'>,
): RelationshipTypeDraft {
  return { name: entry.name, inverseName: entry.inverse_name, symmetric: entry.is_symmetric }
}

/**
 * Why the draft is not ready, in Spanish, or null when it is.
 *
 * The three answers are the three ways a direction goes wrong, and they are given
 * HERE and not left to the check constraint because the constraint cannot say
 * which half is missing — it reports the row as a whole, in English, naming
 * itself.
 */
export function relationshipTypeDraftProblem(draft: RelationshipTypeDraft): string | null {
  const columns = relationshipTypeColumns(draft)
  if (columns.name === '') {
    return 'Escribe cómo se lee la relación desde una obra, por ejemplo «Estudio previo de».'
  }
  if (columns.is_symmetric) return null

  if (columns.inverse_name === '') {
    return (
      'Escribe también cómo se lee desde la otra obra, por ejemplo «Obra final de». Sin esa ' +
      'lectura, la ficha de la segunda obra no tendría nada que decir de la relación.'
    )
  }
  // Compared without capitals or accents, and the database only forbids the two
  // labels being IDENTICAL: «Copia de» and «copia de» would pass its check and
  // would leave a symmetric type badly declared, which is the state the rows'
  // canonicalisation does not apply to.
  if (placeKey(columns.name) === placeKey(columns.inverse_name)) {
    return (
      'Las dos lecturas dicen lo mismo. Si la relación se lee igual desde las dos obras, elige ' +
      '«Se lee igual desde las dos»; si no, cambia la segunda lectura.'
    )
  }
  return null
}

/** One kind summed up in a sentence, for the answer «ya hay un tipo con ese nombre». */
export function relationshipTypeSummary(
  entry: Pick<ArtworkRelationshipType, 'name' | 'inverse_name' | 'is_symmetric'>,
): string {
  return entry.is_symmetric
    ? `«${entry.name}», que se lee igual desde las dos obras`
    : `«${entry.name}», que desde la otra obra se lee «${entry.inverse_name}»`
}

/** Which end of the relationship a line is read from. */
export type RelationshipSide = 'DIRECT' | 'INVERSE' | 'BOTH'

export interface RelationshipTypeReading {
  side: RelationshipSide
  /** The fact spelled out: «Una obra es estudio previo de la otra». */
  text: string
}

/**
 * The kind read out loud from each end, which is the whole point of the screen.
 *
 * One line for a symmetric kind and TWO for a directed one, because the second
 * line is the half the cataloger cannot see from the field she is typing in: she
 * writes «Estudio previo de» and what the other record will end up saying is
 * «Obra final de». Showing both while she types is what stops the catalogue from
 * reading the relationship backwards on the far side.
 *
 * Neutral wording — «una obra», «la otra» — and no sample codes: the record's own
 * form says the same sentence with the two real `catalog_id`s (see
 * `directionOptions`), and inventing «AR-0001» on a maintenance screen would look
 * like data.
 *
 * Blank labels come out as «…» instead of a gap, because this also feeds the live
 * preview of a half-typed form.
 */
export function relationshipTypeReadings(
  entry: Pick<ArtworkRelationshipType, 'name' | 'inverse_name' | 'is_symmetric'>,
): RelationshipTypeReading[] {
  if (entry.is_symmetric) {
    return [
      {
        side: 'BOTH',
        text: `Cada obra es ${reading(entry.name)} la otra. Se registra una sola vez.`,
      },
    ]
  }
  return [
    { side: 'DIRECT', text: `Una obra es ${reading(entry.name)} la otra.` },
    { side: 'INVERSE', text: `Y esa otra es ${reading(entry.inverse_name)} la primera.` },
  ]
}

/** The draft read out loud, for the preview under the fields. */
export function relationshipTypeDraftReadings(
  draft: RelationshipTypeDraft,
): RelationshipTypeReading[] {
  const columns = relationshipTypeColumns(draft)
  return relationshipTypeReadings(columns)
}

/**
 * A label as the middle of a sentence. `predicate` is the record's own helper —
 * «Estudio previo de» → «estudio previo de», leaving acronyms alone — reused and
 * not copied, so the maintenance screen and the record read a kind the same way.
 */
function reading(label: string): string {
  const text = label.trim()
  return text === '' ? MISSING_LABEL : predicate(text)
}

/** What pressing «Añadir» has to do. */
export type RelationshipTypeAddition =
  /** Nothing to write, and the sentence saying why: the field keeps what it holds. */
  | { action: 'problem'; problem: string }
  /** The name is in the trash: it comes back, with the direction just typed. */
  | { action: 'restore'; entry: ArtworkRelationshipType; columns: RelationshipTypeColumns }
  | { action: 'insert'; columns: RelationshipTypeColumns }

/**
 * Either the row to write, or the sentence explaining why nothing is written.
 *
 * The interesting case is `restore`, and it is why this decision is not left to
 * the unique index: inserting a name that exists BUT IS RETIRED comes back as a
 * unique violation, indistinguishable from «somebody added it a second ago».
 * What typing a retired name means is that she wants it back — and here it also
 * means she wants it back WITH THE DIRECTION SHE JUST TYPED, so the restore
 * carries the three columns and not only `active`. If that changes the symmetry of
 * a kind that has already been used, the database refuses with its own sentence
 * (RF-217), which is the one place that knows.
 *
 * An equivalent name that is STILL ON OFFER is answered and not silently reused,
 * unlike in the flat vocabularies. Two reasons: the entry may differ in exactly
 * the part that matters — same name, other inverse label — and clearing the field
 * with a green silence after typing three fields reads as «added» when nothing
 * was. Saying WHICH entry matched is what turns the refusal into something she can
 * act on, because the match may be a name she did not type: the comparison ignores
 * capitals and accents, exactly as the unique index does.
 */
export function planRelationshipTypeAddition(
  entries: readonly ArtworkRelationshipType[],
  draft: RelationshipTypeDraft,
): RelationshipTypeAddition {
  const problem = relationshipTypeDraftProblem(draft)
  if (problem !== null) return { action: 'problem', problem }

  const columns = relationshipTypeColumns(draft)
  // `placeKey` and not a normalizer of its own: it mirrors `public.place_key`
  // character for character, which is the function the unique index of this table
  // is built on. A stricter key here — one that also flattened the ñ — would
  // answer «ya está en la lista» for «Nino de» when the catalogue has «Niño de»,
  // refusing a type the database would have accepted.
  const key = placeKey(columns.name)
  const equivalent = entries.find((entry) => placeKey(entry.name) === key)
  if (equivalent === undefined) return { action: 'insert', columns }

  if (!equivalent.active) {
    // The stored name is kept and only the direction is applied: what she asked
    // for by typing an equivalent name is that entry, and «Copia de» in the
    // catalogue does not become «copia de» because it was typed in a hurry.
    return {
      action: 'restore',
      entry: equivalent,
      columns: { ...columns, name: equivalent.name },
    }
  }

  const summary = relationshipTypeSummary(equivalent)
  return {
    action: 'problem',
    problem: sameReadings(equivalent, columns)
      ? `Ya está en la lista: ${summary}. No hace falta añadirlo otra vez.`
      : `Ya hay un tipo de relación con ese nombre: ${summary}. Si la lectura no es la que ` +
        'necesitas, cámbiala en su fila con el lápiz en vez de crear un segundo tipo que diga ' +
        'casi lo mismo.',
  }
}

/** Whether two kinds are read the same from both ends, capitals and accents aside. */
function sameReadings(
  a: Pick<ArtworkRelationshipType, 'inverse_name' | 'is_symmetric'>,
  b: Pick<RelationshipTypeColumns, 'inverse_name' | 'is_symmetric'>,
): boolean {
  return a.is_symmetric === b.is_symmetric && placeKey(a.inverse_name) === placeKey(b.inverse_name)
}

/** What pressing «Guardar» on a row has to do. */
export type RelationshipTypeEdit =
  | { action: 'problem'; problem: string }
  /** Not one letter changed: the field closes without a write. */
  | { action: 'unchanged' }
  | { action: 'update'; columns: RelationshipTypeColumns }

/**
 * Either the three columns to write, or why not.
 *
 * `unchanged` is not an optimization. Every update of this table sends the three
 * columns together — the symmetry and its inverse label are one decision and
 * cannot travel in separate requests — and the symmetry trigger only complains
 * when the flag actually MOVES. So reopening a row, changing nothing and saving
 * must not become an update that the database has to accept or refuse: on a kind
 * already in use, that would be a refusal for an edit nobody made.
 *
 * A name that collides with another kind is NOT predicted here. It is one unique
 * index away and the answer is the same either way, so the database keeps the
 * last word and `relationshipTypeFailure` says it in Spanish.
 */
export function planRelationshipTypeEdit(
  entry: Pick<ArtworkRelationshipType, 'name' | 'inverse_name' | 'is_symmetric'>,
  draft: RelationshipTypeDraft,
): RelationshipTypeEdit {
  const problem = relationshipTypeDraftProblem(draft)
  if (problem !== null) return { action: 'problem', problem }

  const columns = relationshipTypeColumns(draft)
  if (
    columns.name === entry.name &&
    columns.inverse_name === entry.inverse_name &&
    columns.is_symmetric === entry.is_symmetric
  ) {
    return { action: 'unchanged' }
  }
  return { action: 'update', columns }
}

/** A refusal as PostgREST hands it over. */
export interface DatabaseFailure {
  code: string
  message: string
  hint?: string | null
}

/**
 * What the database answered, turned into a sentence for the cataloger.
 *
 * The codes and the texts are the ones this table returns FOR REAL, provoked
 * against the local database and read back through PostgREST, not guessed:
 *
 *  - `P0001` are the two triggers of the table, and they already answer in
 *    Spanish, with the practical consequence and a hint about what to do first
 *    («Cambia antes el tipo de esas relaciones.»). PostgREST carries the hint in
 *    its own field, so it is joined to the message instead of dropped — without
 *    it, «no se puede retirar» is a dead end.
 *  - `23505` is the unique index over `place_key(name)`, whose message is
 *    `duplicate key value violates unique constraint …`. Rewritten, and the reason
 *    the sentence mentions capitals and accents is that the index ignores them:
 *    without saying so, refusing «copia de» when «Copia de» is on screen looks
 *    like a bug.
 *  - `23514` are the three checks, and the message only names the constraint. The
 *    important one is `inverse_coherent`, which is the direction being incoherent
 *    and is worth spelling out even though the form checks it first — the form
 *    could be wrong.
 *  - `42501` is RLS: the screen is the Cataloger's (RF-1106), so this is a
 *    session that no longer edits, and the honest answer says so.
 *
 * Anything else keeps the original message behind a sentence that says which
 * action failed. Swallowing an unknown code would leave the screen looking like
 * it ignored the tap.
 */
export function relationshipTypeFailure(
  failure: DatabaseFailure,
  action: RelationshipTypeAction,
): string {
  if (failure.code === 'P0001') return joinSentences(failure.message, failure.hint)

  if (failure.code === '23505') {
    return (
      'Ya hay otro tipo de relación con ese nombre. Los nombres no distinguen mayúsculas ni ' +
      'tildes, así que «Copia de» y «copia de» serían el mismo.'
    )
  }

  if (failure.code === '23514') {
    if (failure.message.includes('inverse_coherent')) {
      return (
        'Una relación con dirección necesita las dos lecturas, y distintas entre sí. Si se lee ' +
        'igual desde las dos obras, elige «Se lee igual desde las dos».'
      )
    }
    if (failure.message.includes('inverse_name_trimmed')) {
      return 'La lectura desde la otra obra no puede empezar ni acabar con espacios.'
    }
    if (failure.message.includes('name_not_blank')) {
      return 'El nombre no puede quedar vacío ni empezar o acabar con espacios.'
    }
  }

  if (failure.code === '42501') {
    return (
      `No se ha podido ${VERB[action]}: esta sesión no puede editar el catálogo. Vuelve a entrar ` +
      'como catalogadora.'
    )
  }

  // No code and the browser's own words: nothing answered, the request never
  // arrived. It needs its own sentence because it is the opposite of a rule saying
  // no — the change was not refused, it was not sent — and because «Failed to
  // fetch» is English about a function nobody here calls.
  if (isNetworkFailure(failure.message)) {
    return `No se ha podido ${VERB[action]}: la aplicación no ha podido hablar con el catálogo. Comprueba la conexión y vuelve a intentarlo.`
  }

  return `No se ha podido ${VERB[action]}: ${failure.message}`
}

/**
 * The sentence for a list that could not be loaded.
 *
 * Separate from `relationshipTypeFailure` because a failed load is not a refusal:
 * nothing was being written, so there is nothing to say about what was not saved,
 * and the whole answer is «what you are reading is not the vocabulary». The
 * reading hook lives in the record's feature and hands the message over raw, so
 * this is where it stops being PostgreSQL's or the browser's English.
 */
export function relationshipTypeLoadFailure(message: string): string {
  if (isNetworkFailure(message)) {
    return (
      'No se ha podido leer la lista de tipos de relación: la aplicación no ha podido hablar ' +
      'con el catálogo. Comprueba la conexión y vuelve a entrar en esta pantalla.'
    )
  }
  return `No se ha podido leer la lista de tipos de relación. La base de datos ha contestado: ${message.trim()}`
}

/**
 * The answer when the write reported no error and touched no row.
 *
 * It is a real case and it is silent, which is why it gets a sentence of its own:
 * an update whose row is invisible to the RLS `using` clause — a session that
 * stopped being able to edit — comes back as 200 with an empty list, not as a
 * refusal. Reporting success there would leave the screen showing the old value
 * as if it had been saved.
 */
export function relationshipTypeMissingRow(action: RelationshipTypeAction): string {
  return (
    `No se ha podido ${VERB[action]}: la lista ha cambiado o esta sesión ya no puede editarla. ` +
    'Vuelve a entrar en la pantalla para ver cómo ha quedado.'
  )
}

/** Message and hint as one paragraph, with the stop the `raise` does not carry. */
function joinSentences(message: string, hint?: string | null): string {
  const text = message.trim()
  const extra = (hint ?? '').trim()
  if (extra === '') return text
  return /[.!?]$/.test(text) ? `${text} ${extra}` : `${text}. ${extra}`
}
