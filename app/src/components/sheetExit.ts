/**
 * Salir de una hoja sin perder lo que se estaba escribiendo (RF-304, RNF-106).
 *
 * ── LO QUE PASÓ ─────────────────────────────────────────────
 *
 * Una hoja se cerraba por cuatro caminos —el fondo oscuro, la ✕, Escape y el botón de
 * atrás del móvil— y los cuatro eran inmediatos. Con la hoja ocupando tres cuartos de la
 * pantalla, el fondo queda justo donde se apoya el pulgar al desplazarse por un
 * formulario largo, y un roce ahí borraba diez minutos de tecleo sin preguntar. Ha pasado
 * dos veces, con datos dentro.
 *
 * ── LAS DOS DECISIONES, Y POR QUÉ SON DOS ───────────────────
 *
 * **El fondo deja de cerrar en las hojas que son un formulario**, y no solo cuando hay
 * algo escrito: la salida de un formulario está siempre en el mismo sitio —la ✕, arriba a
 * la derecha— y el pulgar la aprende. Una superficie que cierra unas veces y otras pide
 * confirmación es peor que una que no cierra nunca. En las hojas que son ELEGIR algo —un
 * sitio, una sede, un estado de investigación— el fondo sigue cerrando: ahí no hay nada
 * que perder y quitarlo sería quitar comodidad sin ganar nada.
 *
 * **Y las otras tres salidas preguntan cuando hay algo que perder.** Preguntar siempre
 * —también sobre un formulario en blanco— es la forma más rápida de que la pregunta se
 * despache sin leerla, y entonces deja de proteger. Así que la condición es «hay algo
 * escrito que se perdería», que la calcula cada hoja porque solo ella sabe qué es un dato
 * suyo y qué es una búsqueda a medio teclear.
 *
 * Todo aquí es puro: la batería corre en node.
 */

/** Por dónde se está intentando salir. Los cuatro caminos, nombrados. */
export type SheetExit =
  /** El fondo oscuro de detrás de la hoja. El que se toca sin querer. */
  | 'backdrop'
  /** La ✕ de la cabecera. */
  | 'close'
  | 'escape'
  /** El botón de atrás del móvil, o el del navegador. */
  | 'back'

/**
 * Qué hacer con un intento de salir.
 *
 * - `close`: se cierra, que es lo que ha pasado siempre.
 * - `confirm`: se pregunta antes, porque hay algo escrito.
 * - `ignore`: no se hace nada, porque ese camino no es una salida de esta hoja.
 */
export type SheetExitAction = 'close' | 'confirm' | 'ignore'

export function sheetExitAction(input: {
  /** Hay algo escrito que se perdería. Lo decide la hoja. */
  dirty: boolean
  exit: SheetExit
  /** El fondo cierra. Falso en las hojas que son un formulario. */
  backdropCloses: boolean
}): SheetExitAction {
  if (input.exit === 'backdrop' && !input.backdropCloses) return 'ignore'
  return input.dirty ? 'confirm' : 'close'
}

/**
 * Qué hacer con un intento de salir **mientras la confirmación está en pantalla**.
 *
 * Nunca se sale: el atrás y Escape retiran la pregunta y devuelven a la hoja, con lo
 * escrito intacto. Es lo contrario de lo cómodo y lo único defendible — un atrás de más,
 * con una pregunta delante que dice que se van a perder los datos, no puede ser justo la
 * pulsación que los pierde. Para salir hay que decirlo con el botón que lo dice.
 */
export function confirmingExitAction(exit: SheetExit): 'dismiss' | 'ignore' {
  // El fondo no retira la pregunta: taparla con un roce dejaría a la hoja como estaba,
  // que no es dañino, pero es el mismo roce del que veníamos huyendo.
  return exit === 'backdrop' ? 'ignore' : 'dismiss'
}

// ── Lo que dice la pregunta ──────────────────────────────────

export const DISCARD_TITLE = 'Tienes datos a medio meter'

/**
 * Lo que se lee debajo del título, con **lo que NO pasa** delante.
 *
 * Es el criterio de todo el proyecto para una pregunta destructiva: lo que hace falta
 * para decidir no es qué se va a borrar, es qué se queda. Aquí lo que se queda es el
 * catálogo entero — nada de lo que hay dentro se ha guardado todavía, así que salir no
 * cambia ninguna ficha —, y lo que se va es el rato de tecleo.
 *
 * @param extra Lo que esta hoja en concreto quiera añadir, ya en español. Sirve para el
 *   dato que la frase general no puede saber: que habría que volver a elegir el fichero,
 *   por ejemplo, que es lo más caro de repetir de todo el formulario.
 */
export function discardText(extra?: string | null): string {
  const base =
    'Si sales ahora, lo que has escrito aquí no se guarda. Del catálogo no se cambia nada: ' +
    'esta hoja no ha escrito todavía.'
  const clean = (extra ?? '').trim()
  return clean === '' ? base : `${base} ${clean}`
}

/** El botón que NO destruye va primero, que es donde cae el pulgar sin apuntar. */
export const DISCARD_KEEP_LABEL = 'Seguir rellenando'
export const DISCARD_LEAVE_LABEL = 'Salir y perderlo'
