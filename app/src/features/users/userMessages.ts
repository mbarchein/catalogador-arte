import { isNetworkFailure } from '../tables/vocabularies'
import type { DatabaseFailure } from '../exhibitions/exhibitionMessages'

/**
 * Lo que dice la pantalla de usuarios cuando la base dice que no.
 *
 * **Los tres códigos y los tres textos se provocaron contra la base local y se copiaron
 * de la respuesta**, como el resto de los módulos de mensajes del proyecto. Medido el 14
 * de agosto de 2026, con la sesión de un catalogador y la de un superusuario:
 *
 *   `P0001 Solo el superusuario puede cambiar el rol de un usuario (RF-108)`
 *   `P0001 Solo el superusuario puede dar o quitar el acceso al catálogo`
 *     · hint: `Pídeselo a quien administre el catálogo.`
 *   `P0001 No se puede dejar el catálogo sin ningún superusuario`
 *     · hint: `Nombra antes a otro superusuario: si no queda ninguno, nadie podrá volver
 *       a asignar roles desde la aplicación.`
 *
 * Y lo que se midió además, que es lo que de verdad puede engañar a esta pantalla: **sobre
 * la fila de OTRA persona no hay excepción ninguna**. La política filtra la fila antes de
 * que el trigger llegue a opinar, así que la escritura de quien no administra no falla, no
 * toca nada y contesta cero filas. Dar por bueno «no hubo error» diría que el rol se
 * cambió cuando no se cambió, en la única pantalla del sistema donde eso significa creer
 * que alguien tiene permisos que no tiene.
 */

/** Lo que se estaba intentando, que es lo que nombra la frase de última instancia. */
export type UserOperation = 'load' | 'role' | 'access' | 'invite'

const OPERATION_TEXT: Record<UserOperation, string> = {
  load: 'No se ha podido cargar el equipo',
  role: 'No se ha podido cambiar el rol',
  access: 'No se ha podido cambiar el acceso',
  invite: 'No se ha podido invitar',
}

/**
 * El identificador del requisito, fuera del texto que se lee.
 *
 * El mensaje del trigger termina en «(RF-108)» desde la primera migración: ahí dentro es
 * la referencia que explica la regla, y en una pantalla es jerga que no dice nada a quien
 * cataloga. Se quita al mostrarlo y se queda donde estaba, que es en el código.
 */
export function withoutRequirementId(message: string): string {
  return message.replace(/\s*\((RF|RNF|DP|ADR)-\d+[a-z]?\)\s*$/i, '').trim()
}

/** Lo que se muestra de un fallo, con la pista de la base si la trae. */
export function userFailureText(failure: DatabaseFailure, operation: UserOperation): string {
  const code = failure.code ?? ''

  // Los tres triggers hablan español y dicen qué hacer: se muestran tal cual, sin el
  // identificador del requisito. Reescribirlos aquí sería una segunda copia de una regla
  // que vive junto al dato.
  if (code === 'P0001') {
    const said = withoutRequirementId(failure.message)
    const hint = (failure.hint ?? '').trim()
    return hint === '' ? said : `${said}. ${hint}`
  }

  // La política, cuando la escritura sí llega a intentarse.
  if (code === '42501') {
    return 'Tu sesión no puede administrar el equipo. Solo el superusuario asigna roles.'
  }

  if (isNetworkFailure(failure.message)) {
    return `${OPERATION_TEXT[operation]}: la aplicación no ha podido hablar con el catálogo. Comprueba la conexión y vuelve a intentarlo.`
  }

  return `${OPERATION_TEXT[operation]}: ${failure.message}`
}

/**
 * El resultado de una escritura: una frase que mostrar, o null cuando entró.
 *
 * `rows` es la razón de que esto exista, y no es fontanería defensiva: es el caso medido
 * arriba. Cero filas y ningún error es exactamente lo que recibe quien no administra
 * cuando toca la fila de otro.
 */
export function userWriteResult(
  operation: UserOperation,
  result: { failure?: DatabaseFailure | null; rows?: number },
): string | null {
  if (result.failure) return userFailureText(result.failure, operation)
  if (result.rows === 0) {
    return 'No se ha cambiado nada: o esa cuenta ya no está, o tu sesión no puede administrar el equipo. Vuelve a cargar.'
  }
  return null
}
