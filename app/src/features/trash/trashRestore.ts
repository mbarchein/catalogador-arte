/**
 * Why a recovery did not work, told in Spanish.
 *
 * Recovering something from the wastebasket can fail **for legitimate reasons**, and a button
 * that stays mute when that happens is worse than having no wastebasket: the user touches,
 * nothing happens, and she does not know whether the catalogue ignored her or whether she did something
 * wrong. So every refusal the base can give has its sentence here.
 *
 * ── THE REFUSALS WERE MEASURED, NOT IMAGINED ─────────────────────
 *
 * Provoked against the local base through PostgREST, with the token of whoever
 * catalogues and with that of whoever only consults:
 *
 *  · **`P0001`** — a trigger says no, and it says it ALREADY IN SPANISH and to the user,
 *    in two separate fields. Measured on trying to recover a link of an artwork
 *    whose provenance is recorded as researched with no result:
 *      message: «La procedencia de la obra RC-0001 consta investigada sin resultado
 *                y este eslabón la contradice»
 *      hint:    «Cambia antes el estado de la procedencia a "En curso" o "Completa".»
 *    **The hint is the useful half**: it says what to do. Both are shown joined; the
 *    temptation to keep only the message leaves the user knowing she cannot and
 *    not knowing what to touch.
 *
 *  · **`23505`** — the slot that distinguished the row has been taken by another while it
 *    was in the wastebasket. Measured: `{"code":"23505", "hint":null, "message":
 *    "duplicate key value violates unique constraint \"...\""}`, HTTP 409. A
 *    message that names an index and helps nobody. And **it can hardly ever happen**:
 *    the master tables' unique indexes are not partial on `active`, so the
 *    name of something withdrawn stays reserved and nobody has been able to reuse it. Where it does
 *    occur is in the external links, whose indexes are `where ... and active`.
 *
 *  · **`42501`** — the session can no longer write. Measured with the reader's token:
 *    HTTP 403, «new row violates row-level security policy for table "..."».
 *
 *  · **`23503`** — the row it hangs from no longer exists at all. In this
 *    catalogue nothing is really deleted, so if it appears it is an anomaly and it is said
 *    as such instead of swallowed.
 *
 *  · **no refusal at all** (`null`) — and this is the dangerous one. Measured: a PATCH the
 *    policies reject answers **HTTP 200 with an empty list and no error**. A
 *    reader recovering a photograph gets exactly that. Without asking for the rows
 *    affected, the screen would say «recovered» without having recovered anything.
 */

import { isNetworkFailure } from '../tables/vocabularies'
import { kindSpec, type TrashKindId } from './trashKinds'

/**
 * A refusal as it arrives from PostgREST: the SQLSTATE, the message and the hint, which
 * travel in three different fields.
 *
 * Declared here instead of importing `PostgrestError` so this module does not depend
 * on the client, and because only these three fields are read.
 */
export interface DatabaseRefusal {
  code?: string | null
  message: string
  hint?: string | null
}

/**
 * The sentence the user sees when the recovery did not work.
 *
 * The unknown keeps the raw message behind an introduction in Spanish:
 * inventing a kind sentence for a failure never seen before hides the only
 * clue there is.
 */
export function describeRestoreRefusal(
  kind: TrashKindId,
  refusal: DatabaseRefusal | null,
): string {
  const spec = kindSpec(kind)

  if (refusal === null) {
    // Zero rows touched and no error. Either the session has stopped being able to catalogue
    // while the screen was open, or the row is no longer where it was. Both
    // end in «log in again and look», and neither is «recovered».
    return (
      'No se ha recuperado nada: o tu sesión no puede, o ya había vuelto. Vuelve a entrar y compruébalo.'
    )
  }

  const message = refusal.message.trim()

  if (refusal.code === 'P0001') {
    // The trigger writes for whoever catalogues, in Spanish. What it says is shown
    // and the hint with it, joined with a full stop and without doubling the one the message may
    // already carry.
    const hint = refusal.hint?.trim() ?? ''
    const head = message.replace(/[.\s]+$/, '')
    return hint === '' ? `${head}.` : `${head}. ${hint}`
  }

  if (refusal.code === '23505') {
    if (spec.duplicateText !== undefined) return spec.duplicateText
    return (
      `Mientras ${spec.one} estaba en la papelera, otra fila ha ocupado el hueco que la ` +
      'distinguía, y el catálogo no admite dos iguales activas. Mira si la nueva sirve; si la ' +
      'que quieres es esta, hay que retirar antes la otra.'
    )
  }

  if (refusal.code === '42501') {
    return (
      'Tu sesión no tiene permiso para recuperar lo retirado. Vuelve a entrar en la aplicación; ' +
      'si sigue igual, es que tu cuenta ya no es de catalogación.'
    )
  }

  if (refusal.code === '23503') {
    return (
      `Aquello de lo que cuelga ${spec.one} ya no existe en el catálogo, y no solo está ` +
      'retirado. En este catálogo nada se borra de verdad, así que esto no debería poder pasar: ' +
      'anótalo antes de seguir.'
    )
  }

  // With no code and with a network failure: the request never reached the catalogue. Saying so is
  // more useful than «Failed to fetch», and it warns that nothing has been left half-done.
  if (isNetworkFailure(message)) {
    return (
      `No se ha podido recuperar ${spec.one}: la aplicación no ha podido hablar con el catálogo. ` +
      'Comprueba la conexión y vuelve a intentarlo.'
    )
  }

  return `No se ha podido recuperar ${spec.one}: ${message}`
}

/**
 * The sentence for a failure in READING a class of the wastebasket.
 *
 * It is told per class and not for the whole screen on purpose: twenty queries go
 * in parallel, and one failing cannot leave blank the nineteen that did
 * answer. The line says which class could not be read, and the rest of the wastebasket
 * stays standing.
 */
export function describeLoadFailure(kind: TrashKindId, refusal: DatabaseRefusal): string {
  const spec = kindSpec(kind)
  const message = refusal.message.trim()
  if (isNetworkFailure(message)) {
    return `No se han podido leer las ${spec.many} retiradas: no hay conexión con el catálogo.`
  }
  if (refusal.code === '42501') {
    return `Tu sesión no tiene permiso para ver las ${spec.many} retiradas.`
  }
  return `No se han podido leer las ${spec.many} retiradas: ${message}`
}
