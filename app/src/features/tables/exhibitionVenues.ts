/**
 * The exhibition venues on the client side: what the maintenance screen decides
 * before it talks to the database, and what it says when the database says no
 * (RF-512, RF-1106, ADR-007).
 *
 * **Why this is not the tree of physical places, which is the question anybody
 * looking at the two screens is going to ask.** Both answer «dónde», and that is
 * the whole of what they share:
 *
 *   · A place of the tree answers WHERE THE ARTWORK IS TODAY. It is a container —
 *     «Castelar 4, almacén, estantería B, balda 2» — it is mutable because the
 *     studio gets reorganized, and moving it moves everything inside it (ADR-006).
 *   · A venue answers WHERE A SHOW HAPPENED IN 1985. It contains nothing, it is
 *     historical, and a room that closed in 1988 has to keep existing for ever,
 *     because the exhibition that happened in it did happen. It is not a location
 *     of the catalogue's own holdings.
 *
 * Merging them would put «Balda 2» in the venue chooser and the Museo del Prado
 * in the warehouse tree. That is the reason for the second table, and it is why
 * this screen has no hierarchy and no «Mover»: a venue is not inside another
 * venue, and its locality is a datum about it, not a parent.
 *
 * What is NOT here is any rule the database already holds — that (name, locality)
 * is unique, that a name cannot be blank, that a venue hosting exhibitions cannot
 * be retired. Those are enforced next to the data, and this module only translates
 * the refusal into a sentence with its practical consequence. A second copy of the
 * rule would be a rule that drifts. The one exception is deliberate and marked as
 * such: `planVenueEdit` checks the duplicate LOCALLY as well, to answer «esa sede
 * ya está en la lista» instead of a constraint name, and the database still has
 * the last word.
 */

import { placeKey } from '../../lib/places'
import type { ExhibitionVenue } from '../../lib/types'
import { isNetworkFailure } from './vocabularies'

// ── The venue as it is being written ─────────────────────────

/**
 * A venue being created or edited.
 *
 * The three fields that identify and print it (RF-502 composes «[año], [fechas],
 * [título], [institución], [lugar]» and needs the place apart from the name), plus
 * the note.
 *
 * `party_id` — the institution behind the venue — is NOT here on purpose: it is
 * optional in the schema because a casa de cultura is a real venue with no
 * institutional record behind it, and choosing one needs the register of people
 * and institutions, which is the other screen's chooser. Leaving it out keeps this
 * screen to one thumb; a venue created here can be linked to its institution when
 * that wiring exists, and nothing is lost meanwhile.
 */
export interface VenueDraft {
  name: string
  locality: string
  country: string
  note: string
}

/**
 * A blank draft.
 *
 * `country` starts on «España» for the same reason `emptyNewParty` does: nearly
 * every venue of this catalogue is Spanish, it is one field less to fill with the
 * document in hand, and it is one tap to change. The note starts empty and the add
 * form does not even paint it — what a venue's note says («la sala cerró en 1988»)
 * is learnt later, not while typing the name of a museum.
 */
export function emptyVenueDraft(): VenueDraft {
  return { name: '', locality: '', country: 'España', note: '' }
}

/** The draft that opens when an existing venue is edited. */
export function venueDraft(venue: ExhibitionVenue): VenueDraft {
  return {
    name: venue.name,
    locality: venue.locality,
    country: venue.country,
    note: venue.note,
  }
}

/** `Badajoz, España`, with whichever half is missing dropped. Empty when both are. */
export function venuePlaceText(venue: {
  locality: string
  country: string
}): string {
  return [venue.locality.trim(), venue.country.trim()].filter((part) => part).join(', ')
}

/**
 * What the row says under the name when the venue has no place written.
 *
 * Never a blank line: a venue with no locality is the one thing that makes the
 * list ambiguous — there is a «Casa de Cultura» in every town — so the row says
 * that the locality is missing instead of leaving the gap that looks like a bug in
 * the screen (RF-304). It is a datum to fill, and saying so is what gets it
 * filled — a blank line reads as «this venue has no town», which is never true.
 */
export function venuePlaceNotice(venue: { locality: string; country: string }): string {
  const place = venuePlaceText(venue)
  return place === '' ? 'Sin localidad' : place
}

/**
 * The comparison key of the unique index, mirrored on this side:
 * `(place_key(name), place_key(locality))`.
 *
 * `placeKey` is the twin of the SQL `place_key` — lowercase, accents dropped, ñ
 * left standing — and it is imported and not rewritten precisely so the two
 * cannot drift: if they did, this screen would offer to create a venue the
 * database then rejects, with a unique-violation where the honest answer was «esa
 * sede ya está».
 *
 * The two halves are joined with a NUL, which cannot be typed into a text field,
 * so «Casa, de Cultura»/«Zafra» and «Casa»/«de Cultura, Zafra» stay two different
 * keys.
 */
export function venueKey(venue: { name: string; locality: string }): string {
  return `${placeKey(venue.name)}\u0000${placeKey(venue.locality)}`
}

/**
 * Venues sorted for reading: by name in es-ES, and by locality when the name
 * repeats.
 *
 * The name comes first because that is what is looked for. The locality is the
 * tiebreaker and not the heading, and it has to be one: with (name, locality)
 * unique, the two «Casa de Cultura» rows are the ones a flat list by name alone
 * would show as identical, and they must at least come out adjacent and in a
 * stable order.
 *
 * Retired venues are NOT pushed to the bottom, as in `sortByName`: the screen
 * greys them out, and moving a name away from where it is looked for hides it
 * twice.
 */
export function sortVenues<V extends ExhibitionVenue>(venues: readonly V[]): V[] {
  return venues.slice().sort((a, b) => {
    const byName = a.name.localeCompare(b.name, 'es', { sensitivity: 'base' })
    if (byName !== 0) return byName
    return a.locality.localeCompare(b.locality, 'es', { sensitivity: 'base' })
  })
}

/**
 * What stops a venue from being written, or null.
 *
 * Only the name, and only because the database demands it
 * (`exhibition_venues_name_not_blank`). The locality is NOT demanded even though
 * it is half the identity: refusing the venue over it would stop a show being
 * recorded from a press cutting that says «Galería Rayuela» and nothing else,
 * which is exactly when these get written. The row says «Sin localidad» so that
 * the hole is visible.
 */
export function venueDraftProblem(draft: VenueDraft): string | null {
  if (draft.name.trim() === '') return 'Escribe el nombre de la sede'
  return null
}

/**
 * What travels to `exhibition_venues`.
 *
 * Everything trimmed, and the name trimmed because the database demands the name
 * ALREADY IS trimmed (`name = btrim(name)`): letting « Sala Rayuela » through
 * would answer a perfectly reasonable request with the name of a check constraint
 * in English. Verified against the base — an untrimmed name comes back as 23514,
 * the same code as a blank one.
 */
export function venuePayload(draft: VenueDraft): {
  name: string
  locality: string
  country: string
  note: string
} {
  return {
    name: draft.name.trim(),
    locality: draft.locality.trim(),
    country: draft.country.trim(),
    note: draft.note.trim(),
  }
}

// ── Adding one ───────────────────────────────────────────────

/**
 * What typing a venue into the «Añadir» card has to do.
 *
 * The interesting case is `restore`, and it is why the decision is not left to the
 * database: inserting a venue that exists BUT IS RETIRED comes back as a unique
 * violation, indistinguishable from «somebody added it a second ago». Reporting
 * both as success would say «añadida» and leave the venue hidden. What the
 * cataloger meant by typing it is that she wants it back.
 *
 * `reuse` is the equivalent-and-active case: «casa de cultura de zafra» when «Casa
 * de Cultura de Zafra» is already there. Same locality, so the same row — the
 * database would refuse it too, and answering «ya está» is the truth.
 */
export type VenueAdditionPlan =
  | { action: 'blank'; message: string }
  | { action: 'insert'; payload: ReturnType<typeof venuePayload> }
  | { action: 'reuse'; venue: ExhibitionVenue }
  | { action: 'restore'; venue: ExhibitionVenue }

export function planVenueAddition(
  venues: readonly ExhibitionVenue[],
  draft: VenueDraft,
): VenueAdditionPlan {
  const problem = venueDraftProblem(draft)
  if (problem !== null) return { action: 'blank', message: problem }

  const payload = venuePayload(draft)
  const key = venueKey(payload)
  // Retired venues included: the index covers them, so this is the only way to
  // find the one that has to come back instead of failing.
  const known = venues.find((venue) => venueKey(venue) === key)
  if (known === undefined) return { action: 'insert', payload }
  return known.active ? { action: 'reuse', venue: known } : { action: 'restore', venue: known }
}

// ── Editing one ──────────────────────────────────────────────

/**
 * What saving an edited venue has to do.
 *
 * `unchanged` exists so that opening a row, reading it and closing it does not
 * write: the write would move `updated_at`… except that this table has no
 * `updated_at` (it is vocabulary, not a record with a trash screen of its own), so
 * what it would really do is spend a request and a reload to change nothing.
 *
 * `duplicate` is the one rule this module checks that the database also checks,
 * and it is on purpose: this is the pair (name, locality), the pair is unique, and
 * the collision is nearly always with a row the cataloger can see on the screen —
 * «esa sede ya está en la lista» beats a re-read that answers with a constraint
 * name. Retired venues count, because the index covers them; the sentence says so,
 * or the answer would look like a lie about a list that does not show it.
 *
 * The database still has the last word: the loaded copy can be stale, and 23505
 * is handled anyway.
 */
export type VenueEditPlan =
  | { action: 'blank'; message: string }
  | { action: 'duplicate'; message: string }
  | { action: 'unchanged' }
  | { action: 'update'; payload: ReturnType<typeof venuePayload> }

export function planVenueEdit(
  venues: readonly ExhibitionVenue[],
  id: string,
  draft: VenueDraft,
): VenueEditPlan {
  const problem = venueDraftProblem(draft)
  if (problem !== null) return { action: 'blank', message: problem }

  const payload = venuePayload(draft)
  const current = venues.find((venue) => venue.id === id)
  if (
    current !== undefined &&
    current.name === payload.name &&
    current.locality === payload.locality &&
    current.country === payload.country &&
    current.note === payload.note
  ) {
    return { action: 'unchanged' }
  }

  const key = venueKey(payload)
  const clash = venues.find((venue) => venue.id !== id && venueKey(venue) === key)
  if (clash !== undefined) {
    const place = venuePlaceText(clash)
    const where = place === '' ? 'sin localidad' : `en ${place}`
    return {
      action: 'duplicate',
      message: clash.active
        ? `Ya hay una sede llamada «${clash.name}» ${where}, y no puede haber dos iguales: usa esa, o distínguelas por la localidad.`
        : `«${clash.name}» ${where} ya existe, retirada. Recupérala en vez de crearla otra vez: así conserva las exposiciones que tuviera.`,
    }
  }

  return { action: 'update', payload }
}

// ── When the database says no ────────────────────────────────

/** What the Supabase client hands back when a request fails. */
export interface DatabaseFailure {
  code?: string | null
  message: string
  hint?: string | null
  details?: string | null
}

/** The operation being attempted, which is what the fallback sentence names. */
export type VenueOperation = 'load' | 'create' | 'save' | 'retire' | 'restore'

const OPERATION_TEXT: Record<VenueOperation, string> = {
  load: 'No se han podido cargar las sedes de exposición',
  create: 'No se ha podido crear la sede',
  save: 'No se ha podido guardar la sede',
  retire: 'No se ha podido retirar la sede',
  restore: 'No se ha podido recuperar la sede',
}

/**
 * The sentence for a refusal from the database, in Spanish and with the practical
 * consequence.
 *
 * **The codes are the ones the base really returns**, provoked against it through
 * the same REST gateway the application uses, not guessed:
 *
 *   · `23505` «duplicate key value violates unique constraint
 *     "exhibition_venues_name_unique"» — the pair (name, locality). The raw
 *     sentence names an index nobody has heard of and does not say that the
 *     locality is what tells two of them apart, which is the whole point.
 *   · `23514` «…violates check constraint "exhibition_venues_name_not_blank"» —
 *     a blank name, or one with spaces around it. The client trims and refuses
 *     blanks itself, so arriving here means a stale field or a race; the sentence
 *     is the same one either way.
 *   · `P0001` with the message «No se puede retirar una sede que todavía acoge
 *     exposiciones del catálogo» and the hint «Cambia antes la sede de esas
 *     exposiciones.» **This one is passed through, and the hint is glued to it**,
 *     which is the difference from the other screens of the section: the schema
 *     wrote that message in Spanish FOR THE CATALOGER, the hint is precisely the
 *     practical consequence, and dropping it — as the artwork-types and series
 *     screens do — leaves «no se puede» without «haz esto primero». Rewriting it
 *     here would be a second copy of a sentence that lives next to the rule.
 *   · `23503` on `exhibition_venues_party_id_fkey` — the institution behind the
 *     venue is gone. Unreachable while this screen does not offer the institution,
 *     and mapped anyway because the day it does, the raw message is a foreign-key
 *     name.
 *   · `42501` «new row violates row-level security policy» — a session that is
 *     not the Cataloger. The screen already sends a Reader to the list, so this is
 *     the expired-or-changed-role case, and what it needs to say is «vuelve a
 *     entrar», not the name of a policy.
 *
 * **And a failure with no code at all is not a refusal: it is nothing answering.**
 * That branch was missing, and the sentence it left on screen was «No se ha podido
 * retirar la sede: Failed to fetch» — the browser's own English, about fetch and
 * not about the connection, on the failure that is likeliest of all in a storeroom
 * with no coverage. The other five screens of the section all say it in Spanish and
 * add the half that matters: the change was not sent, so it is not lost.
 *
 * Anything else keeps the raw message after the sentence: an unexpected refusal
 * that hides what the database said is a refusal nobody can diagnose. That is the
 * shape the rest of the application already uses.
 */
export function venueFailureText(failure: DatabaseFailure, operation: VenueOperation): string {
  const code = failure.code ?? ''
  if (code === '23505') {
    return (
      'Ya hay una sede con ese nombre en esa localidad, y no puede haber dos iguales. ' +
      'Puede estar retirada: recupérala desde la lista, o distínguela cambiándole la localidad.'
    )
  }
  if (code === '23514') {
    return 'El nombre de la sede no puede quedar en blanco: es lo que la ficha de la obra imprime.'
  }
  if (code === 'P0001') {
    const hint = (failure.hint ?? '').trim()
    return hint === '' ? failure.message : `${failure.message}. ${hint}`
  }
  if (code === '23503') {
    return (
      'La institución que había detrás de esta sede ya no está en el catálogo. ' +
      'Guarda la sede sin institución y vuelve a elegirla.'
    )
  }
  if (code === '42501') {
    return (
      'Tu sesión no puede mantener las sedes de exposición: solo el Catalogador. ' +
      'Vuelve a entrar y prueba otra vez.'
    )
  }
  if (isNetworkFailure(failure.message)) {
    return `${OPERATION_TEXT[operation]}: la aplicación no ha podido hablar con el catálogo. Comprueba la conexión y vuelve a intentarlo.`
  }
  return `${OPERATION_TEXT[operation]}: ${failure.message}`
}

/**
 * The result of a write, as a sentence to show or null when it worked.
 *
 * `rows` is why this exists, and it is not defensive plumbing: **PostgREST
 * answers 204 and no error to an update that matched nothing.** Verified against
 * the base — a Reader patching a venue gets 204 with zero rows changed, and so
 * does an update on an identifier that is no longer there. Trusting «no error» in
 * that case would make the screen say the venue was renamed while it was not,
 * which is the one failure a maintenance screen must never have: the cataloger
 * would close it believing the catalogue was corrected.
 *
 * A row count is not asked of an insert with no `select`, and `undefined` means
 * «not counted» and not «zero».
 */
export function venueWriteResult(
  operation: VenueOperation,
  result: { failure?: DatabaseFailure | null; rows?: number },
): string | null {
  if (result.failure) return venueFailureText(result.failure, operation)
  if (result.rows === 0) {
    return (
      'La sede no se ha tocado: o ya no está en el catálogo, o tu sesión ha dejado de poder ' +
      'editarla. Vuelve a cargar la pantalla.'
    )
  }
  return null
}

// ── What the list says when it has nothing to show ───────────

/**
 * The notice that goes where the rows would be, or null when there are rows to
 * paint.
 *
 * Four situations and only ONE of them is «there are no venues», which is the
 * point of the function: printing «todavía no hay ninguna sede» while the query is
 * still in the air, or after it failed, is the screen asserting something about
 * the catalogue that it does not know — and it is the assertion that makes
 * somebody create a second record for a museum that already has one.
 *
 * The empty case explains what the maestra is and why it is not the tree of
 * places, because that is when there is room to say it and when it is needed: a
 * screen called «Sedes de exposición» next to one called «Ubicaciones» invites
 * filing «Balda 2» here.
 */
export function venueListNotice(state: {
  loading: boolean
  error: string | null
  count: number
}): string | null {
  if (state.count > 0) return null
  if (state.loading) return 'Cargando las sedes…'
  // The error already has its own paragraph at the top of the screen: repeating it
  // here would say it twice, and claiming the list is empty would say it wrong.
  if (state.error !== null) return null
  return (
    'Todavía no hay ninguna sede de exposición. Son los sitios donde ocurrieron las muestras —un ' +
    'museo, una casa de cultura, una galería—, y el historial expositivo de cada obra elige de ' +
    'aquí en vez de escribirlos a mano. No son las ubicaciones del almacén: aquellas dicen dónde ' +
    'está la obra hoy, y una sede dice dónde estuvo expuesta en 1985. La primera se crea aquí ' +
    'arriba.'
  )
}
