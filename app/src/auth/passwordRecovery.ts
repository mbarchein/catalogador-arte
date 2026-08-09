/**
 * Recuperar la contraseña olvidada (RF-112).
 *
 * ── LA REGLA QUE MANDA SOBRE TODAS: NO SE ENUMERA ───────────
 *
 * Esta pantalla la puede usar cualquiera sin haber entrado, así que **nada de lo
 * que conteste puede decir si una cuenta existe**. Ni el texto, ni la ausencia de
 * texto, ni un error distinto, ni un botón que se comporta diferente. El equipo
 * son tres personas y sus correos son adivinables, y saber cuál de ellos tiene
 * acceso al catálogo es media intrusión: convierte «probar contraseñas contra
 * varias direcciones» en «probar contraseñas contra la buena».
 *
 * De ahí que el resultado sea **el mismo en todos los casos menos uno**: si el
 * servidor no contesta. Esa excepción no filtra nada —que la red esté caída no
 * dice nada de ninguna cuenta— y sin ella el fallo más común de todos, estar sin
 * cobertura en un almacén, se leería como «el correo ya está enviado» y se
 * esperaría un mensaje que no va a llegar nunca.
 *
 * ── LA ESPERA ENTRE ENVÍOS ──────────────────────────────────
 *
 * El servicio de identidad ya limita el ritmo por su cuenta. La espera de aquí es
 * otra cosa: hace que **el ritmo lo marque esta pantalla y no el servidor**, para
 * que un rechazo por exceso de peticiones no llegue a producirse y no haya
 * diferencia observable entre pedirlo para una dirección que existe y para una
 * que no.
 */

/** Segundos que la pantalla obliga a esperar entre dos envíos. */
export const RESEND_COOLDOWN_SECONDS = 60

/**
 * Lo que se contesta siempre.
 *
 * En condicional —«si la cuenta existe»— y no en afirmativo: afirmar que se ha
 * enviado sería mentir la mitad de las veces, y quien lo lea tras teclear mal su
 * propia dirección se quedaría esperando un correo que nadie mandó.
 */
export const RECOVERY_NOTICE =
  'Si esa dirección tiene cuenta, llegará un correo con el enlace. Mira también el spam.'

/** El único caso que se cuenta aparte, porque no habla de cuentas sino de la red. */
export const UNREACHABLE_NOTICE =
  'No se ha podido contactar con el servidor. Comprueba la conexión y vuelve a intentarlo.'

/**
 * La dirección tal como se manda.
 *
 * Recortada y en minúsculas: el correo no distingue mayúsculas y un espacio
 * pegado al pegar desde otra aplicación es la causa más tonta de «no me llega».
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

/** Lo que puede pasar al pedir el enlace. Dos casos, y solo dos. */
export type RecoveryOutcome = 'requested' | 'unreachable'

/**
 * Cómo se clasifica lo que conteste el servicio de identidad.
 *
 * **Todo lo que no sea un fallo de red cuenta como pedido.** Un rechazo por
 * ritmo, una dirección sin cuenta, una plantilla de correo mal configurada: la
 * usuaria lee lo mismo en los tres casos. Es deliberado y es el punto entero de
 * este módulo — un mensaje distinto para alguno de ellos sería la pista que aquí
 * no puede darse.
 *
 * `status` viene del error del cliente: ausente o cero es que la petición no
 * llegó a salir.
 */
export function recoveryOutcome(failure: { status?: number } | null): RecoveryOutcome {
  if (failure === null) return 'requested'
  return failure.status === undefined || failure.status === 0 ? 'unreachable' : 'requested'
}

/** El texto que corresponde a cada resultado. */
export function recoveryText(outcome: RecoveryOutcome): string {
  return outcome === 'unreachable' ? UNREACHABLE_NOTICE : RECOVERY_NOTICE
}

/**
 * Cuántos segundos faltan para poder volver a pedirlo.
 *
 * Cero cuando ya se puede. Las dos marcas de tiempo llegan como argumento en vez
 * de leerse aquí para que esto se pueda probar sin reloj.
 */
export function secondsLeft(sentAt: number | null, now: number): number {
  if (sentAt === null) return 0
  const elapsed = Math.floor((now - sentAt) / 1000)
  return Math.max(0, RESEND_COOLDOWN_SECONDS - elapsed)
}

/** Lo que dice el botón mientras hay que esperar. */
export function resendText(left: number): string {
  return left > 0 ? `Volver a enviarlo en ${left} s` : 'Enviarme el enlace'
}
