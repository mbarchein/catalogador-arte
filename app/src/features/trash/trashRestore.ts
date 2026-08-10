/**
 * Por qué una recuperación no ha salido, contado en español.
 *
 * Recuperar algo de la papelera puede fallar **por razones legítimas**, y un botón
 * que se queda mudo cuando eso pasa es peor que no tener papelera: la usuaria toca,
 * no ocurre nada, y no sabe si el catálogo la ha ignorado o si ella ha hecho algo
 * mal. Así que cada negativa que la base sabe dar tiene aquí su frase.
 *
 * ── LAS NEGATIVAS SE MIDIERON, NO SE IMAGINARON ──────────────────
 *
 * Provocadas contra la base local a través de PostgREST, con el token de quien
 * cataloga y con el de quien solo consulta:
 *
 *  · **`P0001`** — un disparador dice no, y lo dice YA EN ESPAÑOL y a la usuaria,
 *    en dos campos separados. Medido al intentar recuperar un eslabón de una obra
 *    cuya procedencia consta investigada sin resultado:
 *      message: «La procedencia de la obra RC-0001 consta investigada sin resultado
 *                y este eslabón la contradice»
 *      hint:    «Cambia antes el estado de la procedencia a "En curso" o "Completa".»
 *    **La pista es la mitad útil**: dice qué hacer. Se muestran las dos unidas; la
 *    tentación de quedarse con el mensaje deja a la usuaria sabiendo que no puede y
 *    sin saber qué tocar.
 *
 *  · **`23505`** — el hueco que distinguía la fila lo ha ocupado otra mientras
 *    estaba en la papelera. Medido: `{"code":"23505", "hint":null, "message":
 *    "duplicate key value violates unique constraint \"...\""}`, HTTP 409. Un
 *    mensaje que nombra un índice y no ayuda a nadie. Y **casi nunca puede pasar**:
 *    los índices únicos de las maestras no son parciales sobre `active`, así que el
 *    nombre de algo retirado sigue reservado y nadie ha podido reutilizarlo. Donde sí
 *    ocurre es en los enlaces externos, cuyos índices son `where ... and active`.
 *
 *  · **`42501`** — la sesión ya no puede escribir. Medido con el token del lector:
 *    HTTP 403, «new row violates row-level security policy for table "..."».
 *
 *  · **`23503`** — la fila de la que cuelga ya no existe en absoluto. En este
 *    catálogo nada se borra de verdad, así que si aparece es una anomalía y se dice
 *    como tal en vez de tragársela.
 *
 *  · **ninguna negativa** (`null`) — y esta es la peligrosa. Medido: un PATCH que
 *    las políticas rechazan contesta **HTTP 200 con la lista vacía y sin error**. Un
 *    lector recuperando una fotografía obtiene exactamente eso. Sin pedir las filas
 *    afectadas, la pantalla diría «recuperado» sin haber recuperado nada.
 */

import { isNetworkFailure } from '../tables/vocabularies'
import { kindSpec, type TrashKindId } from './trashKinds'

/**
 * Una negativa tal como llega de PostgREST: el SQLSTATE, el mensaje y la pista, que
 * viajan en tres campos distintos.
 *
 * Declarada aquí en vez de importar `PostgrestError` para que este módulo no dependa
 * del cliente, y porque solo se leen estos tres campos.
 */
export interface DatabaseRefusal {
  code?: string | null
  message: string
  hint?: string | null
}

/**
 * La frase que ve la usuaria cuando la recuperación no ha salido.
 *
 * Lo desconocido conserva el mensaje crudo detrás de una entradilla en español:
 * inventar una frase amable para un fallo que no se ha visto nunca esconde la única
 * pista que hay.
 */
export function describeRestoreRefusal(
  kind: TrashKindId,
  refusal: DatabaseRefusal | null,
): string {
  const spec = kindSpec(kind)

  if (refusal === null) {
    // Cero filas tocadas y ningún error. O la sesión ha dejado de poder catalogar
    // mientras la pantalla estaba abierta, o la fila ya no está donde estaba. Las
    // dos acaban en «vuelve a entrar y mira», y ninguna es «recuperado».
    return (
      'No se ha recuperado nada: o tu sesión no puede, o ya había vuelto. Vuelve a entrar y compruébalo.'
    )
  }

  const message = refusal.message.trim()

  if (refusal.code === 'P0001') {
    // El disparador escribe para quien cataloga, en español. Se muestra lo que dice
    // y la pista con ello, unidas con un punto y sin doblar el que el mensaje quizá
    // ya traiga.
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
 * La frase de un fallo al LEER una clase de la papelera.
 *
 * Se cuenta por clase y no para la pantalla entera a propósito: veinte consultas van
 * en paralelo, y que una falle no puede dejar en blanco las diecinueve que sí han
 * contestado. La línea dice qué clase no se ha podido leer, y el resto de la papelera
 * sigue en pie.
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
