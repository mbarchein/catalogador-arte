/**
 * What the exhibition screens say when the database says no, and what they say
 * where the rows would be.
 *
 * **Every code and every message here was provoked against the local base
 * through the same REST gateway the application uses**, as a real Cataloger and a
 * real Lector, and copied from the answer. Nothing is guessed: the eight refusals
 * of `exhibitions` all arrive as `23514` — one single code for eight different
 * mistakes — and the only thing that tells them apart is the name of the check
 * constraint inside `message`, in English, naming a constraint the cataloger has
 * never heard of. Reading that name is therefore not a hack, it is the only
 * available information.
 *
 * Measured on 4 August 2026, POST `/rest/v1/exhibitions`:
 *
 *   `23514 … violates check constraint "exhibitions_title_not_blank"`
 *   `23514 … "exhibitions_dated"`
 *   `23514 … "exhibitions_coherent_dates"`            (both halves: cierre antes de la apertura, y cierre sin apertura)
 *   `23514 … "exhibitions_year_matches_start_date"`
 *   `23514 … "exhibitions_plausible_year"`
 *   `23514 … "exhibitions_catalogue_reference_needs_catalogue"`
 *   `23503 insert or update on table "exhibitions" violates foreign key constraint "exhibitions_venue_id_fkey"`
 *   `42501 new row violates row-level security policy for table "exhibitions"`  (con la sesión del Lector)
 *   `PGRST116 JSON object requested, multiple (or no) rows returned`            (una ficha que no existe)
 *
 * Pure and free of React, like the rest of the decisions of this feature: the
 * battery runs in node and cannot open a component, so a sentence written inside
 * JSX is a sentence nothing verifies.
 */

import { isNetworkFailure } from '../tables/vocabularies'

/** What the Supabase client hands back when a request fails. Same shape the tables screens use. */
export interface DatabaseFailure {
  code?: string | null
  message: string
  hint?: string | null
  details?: string | null
}

/** The operation being attempted, which is what the fallback sentence names. */
export type ExhibitionOperation =
  | 'load'
  | 'loadOne'
  | 'loadArtworks'
  | 'create'
  | 'save'
  | 'retire'
  | 'restore'
  /** Saying which of the bibliography's references is its catalogue, or stopping saying it (RF-503). */
  | 'catalogue'

const OPERATION_TEXT: Record<ExhibitionOperation, string> = {
  load: 'No se han podido cargar las exposiciones',
  loadOne: 'No se ha podido cargar la exposición',
  loadArtworks: 'No se han podido cargar las obras de esta exposición',
  create: 'No se ha podido crear la exposición',
  save: 'No se ha podido guardar la exposición',
  retire: 'No se ha podido retirar la exposición',
  restore: 'No se ha podido recuperar la exposición',
  catalogue: 'No se ha podido guardar cuál es el catálogo de esta exposición',
}

/**
 * The connection failing, as opposed to the database refusing, is decided by
 * `isNetworkFailure` — imported from the master-tables screens and NOT copied.
 *
 * It is four strings plus the empty message, and a second copy would be a copy
 * that drifts: the day a browser renames its own error, one of the two would keep
 * showing English about `fetch`. **The branch is not defensive plumbing** — in a
 * storeroom with no coverage it is the likeliest failure of all, and what it has to
 * say is the half the browser never says: the change was not sent, so it is not
 * lost.
 *
 * The dependency goes one way and carries no React, no query and no state: it is a
 * predicate over a string.
 */

/**
 * The eight check constraints of `exhibitions`, each in the words of the
 * consequence.
 *
 * Six of them are also refused by `exhibitionDraftProblem` before the request
 * leaves, and the duplication is deliberate: reaching one of these means a stale
 * form, a race, or a bug on this side, and on that day the sentence still has to
 * be about the exhibition and not about a constraint.
 *
 * `exhibitions_year_matches_start_date` cannot be reached from these screens at
 * all — `exhibitionPayload` never sends a year next to a date — and it is mapped
 * anyway, because «unreachable» is a property of today's code.
 */
const CHECK_TEXT: readonly (readonly [string, string])[] = [
  [
    'exhibitions_title_not_blank',
    'El título no puede quedar en blanco: es lo que imprime cada historial.',
  ],
  [
    'exhibitions_dated',
    'La exposición necesita al menos el año: el historial se ordena por fecha.',
  ],
  [
    'exhibitions_coherent_dates',
    'Las fechas no cuadran: la exposición cerraría antes de abrir, o tiene fecha de cierre sin ' +
      'fecha de apertura. Revisa las dos.',
  ],
  [
    'exhibitions_year_matches_start_date',
    'El año y la fecha de apertura se contradicen. Deja solo la fecha.',
  ],
  [
    'exhibitions_plausible_year',
    'El año tiene que estar entre 1000 y 2100: fuera de ahí es una errata, no una fecha.',
  ],
  [
    'exhibitions_catalogue_reference_needs_catalogue',
    'Su catálogo está dado de alta en la bibliografía: quítalo antes desde la bibliografía.',
  ],
]

/**
 * The sentence for a refusal, in Spanish and with the practical consequence.
 *
 * Anything unrecognised keeps the database's own message after the sentence: an
 * unexpected refusal that hides what the database said is a refusal nobody can
 * diagnose. That is the shape the rest of the application already uses.
 */
export function exhibitionFailureText(
  failure: DatabaseFailure,
  operation: ExhibitionOperation,
): string {
  const code = failure.code ?? ''

  if (code === '23514') {
    const hit = CHECK_TEXT.find(([name]) => failure.message.includes(name))
    if (hit) return hit[1]
  }

  if (code === '23503') {
    // Two foreign keys can break, and they break for the same reason — the row at
    // the other end is gone — but not with the same consequence, so they do not
    // get the same sentence.
    if (failure.message.includes('exhibitions_venue_id_fkey')) {
      return (
        'La sede que habías elegido ya no está en el catálogo. Vuelve a elegirla, o guarda la ' +
        'exposición sin sede y escribe en «la sede consta así» lo que diga la fuente.'
      )
    }
    if (failure.message.includes('catalogue_reference')) {
      return (
        'La ficha bibliográfica del catálogo de esta muestra ya no está en el catálogo. Vuelve a ' +
        'enlazarla desde la bibliografía.'
      )
    }
    return `${OPERATION_TEXT[operation]}: algo con lo que estaba enlazada ya no está en el catálogo. Vuelve a cargar la pantalla.`
  }

  // Written by a trigger, in Spanish and for the cataloger: it is passed through
  // with its hint glued on, exactly as the venues screen does. Rewriting it here
  // would be a second copy of a sentence that lives next to the rule.
  if (code === 'P0001') {
    const hint = (failure.hint ?? '').trim()
    return hint === '' ? failure.message : `${failure.message}. ${hint}`
  }

  if (code === '42501') {
    return (
      'Tu sesión no puede dar de alta ni corregir exposiciones: solo el Catalogador. Vuelve a ' +
      'entrar y prueba otra vez.'
    )
  }

  // The address of a record that is not there: a link from a chat, a bookmark of
  // something never created, or a typed identifier. It is not an error of the
  // catalogue and it must not read as one.
  if (code === 'PGRST116') {
    return 'Esa exposición no está en el catálogo.'
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
 * answers `[]` and no error to an update that matched nothing** — measured, a
 * PATCH on an identifier that is not there comes back 200 with an empty array.
 * Trusting «no error» would make the screen say the exhibition was corrected
 * while it was not, which is the one failure a maintenance screen must never
 * have: the cataloger closes it believing the catalogue was fixed.
 *
 * `undefined` means «not counted» and not «zero»: an insert without a `select`
 * returns no rows to count.
 */
export function exhibitionWriteResult(
  operation: ExhibitionOperation,
  result: { failure?: DatabaseFailure | null; rows?: number },
): string | null {
  if (result.failure) return exhibitionFailureText(result.failure, operation)
  if (result.rows === 0) {
    return (
      'La exposición no se ha tocado: o ya no está, o tu sesión no puede editarla. Vuelve a cargar.'
    )
  }
  return null
}

// ── Retiring one, which the schema allows on purpose ─────────

/**
 * What retiring this exhibition is going to do, said with the number of artworks
 * it holds — BEFORE it is done.
 *
 * **The schema does not refuse this, and that was measured too**: unlike a venue,
 * which `tg_exhibition_venue_deactivation` protects while it still hosts shows, an
 * exhibition with participations retires without complaint and its bridge rows
 * simply stop being visible. RF-905 says so in as many words, and the select
 * policy of `artwork_exhibitions` implements it: a Lector stops seeing the
 * participation, because the policy demands the exhibition be visible too.
 *
 * So there is no refusal to translate here. What there is instead is a
 * consequence nobody can see from this screen — three artworks lose a line of
 * their exhibition history, each one somebody's afternoon in an archive — and the
 * confirmation has to name it and count it. A bare «¿Retirar?» is how a morning's
 * work disappears on one tap.
 *
 * Null when nothing hangs from it: then the confirmation is the ordinary one and
 * padding it with «ninguna obra» would train the eye to skip the sentence that
 * matters.
 */
export function retireImpactText(artworkCount: number): string | null {
  const count = Math.max(0, Math.trunc(artworkCount))
  if (count === 0) return null
  const artworks = count === 1 ? '1 obra' : `${count} obras`
  const their = count === 1 ? 'su historial expositivo' : 'sus historiales expositivos'
  return (
    `Esta exposición sostiene ${artworks} del catálogo: al retirarla desaparece de ${their}, con ` +
    'el número de catálogo y las notas de cada participación. No se borra nada y se puede ' +
    'recuperar desde aquí mismo.'
  )
}

/**
 * The confirmation of retiring, whole (RF-901).
 *
 * The impact goes first when there is one, because it is the part that changes the
 * decision, and the reassurance goes last: nothing is ever really deleted, and
 * saying so is what stops the cataloger from not daring to tidy the catalogue.
 */
export function retireConfirmText(title: string, artworkCount: number): string {
  const named = title.trim() === '' ? 'esta exposición' : `«${title.trim()}»`
  const impact = retireImpactText(artworkCount)
  if (impact === null) {
    return (
      `Se retirará ${named}. No se borra: deja de aparecer en las búsquedas y se puede recuperar ` +
      'desde esta misma ficha.'
    )
  }
  return `Se retirará ${named}. ${impact}`
}

// ── What the list says when it has nothing to show ───────────

/**
 * The notice that goes where the rows would be, or null when there are rows to
 * paint.
 *
 * Five situations and only ONE of them is «there are no exhibitions», which is the
 * whole point of the function: printing «todavía no hay ninguna exposición» while
 * the query is in the air, or after it failed, is the screen asserting something
 * about the catalogue that it does not know. And it is the assertion that makes
 * somebody create a second record for a show that already has one.
 *
 * The empty case explains what this screen is for, because that is when there is
 * room to say it and when it is needed: the catalogue starts with zero
 * exhibitions, and until this screen existed a show could only be created from
 * SQL.
 */
export function exhibitionListNotice(state: {
  loading: boolean
  error: string | null
  /** How many the catalogue holds, before the search. */
  total: number
  /** How many survive the search. */
  shown: number
  query: string
  /** Retired ones are being listed too. Changes what «none matches» means. */
  includingRetired: boolean
}): string | null {
  if (state.error !== null) return null
  if (state.loading && state.total === 0) return 'Cargando las exposiciones…'
  if (state.total === 0) {
    return (
      'Todavía no hay ninguna exposición registrada. Aquí se dan de alta.'
    )
  }
  if (state.shown === 0) {
    const typed = state.query.trim()
    const about = typed === '' ? '' : ` con «${typed}»`
    const retired = state.includingRetired
      ? ''
      : ' Las retiradas no se están mostrando: enséñalas si buscabas una de ellas.'
    return `No se han encontrado exposiciones${about}.${retired}`
  }
  return null
}

/** `3 exposiciones`, `1 exposición`, and never a bare zero — that case is a sentence. */
export function exhibitionCountText(count: number): string {
  const rows = Math.max(0, Math.trunc(count))
  return rows === 1 ? '1 exposición' : `${rows} exposiciones`
}
