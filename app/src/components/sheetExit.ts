/**
 * Leaving a sheet without losing what was being written (RF-304, RNF-106).
 *
 * ── WHAT HAPPENED ───────────────────────────────────────────
 *
 * A sheet closed by five paths —the dark backdrop, the ✕, Escape, the phone's back
 * button and the footer's «Cancelar»— and all five were immediate. With the sheet taking up three quarters of the
 * screen, the backdrop is exactly where the thumb rests when scrolling through a long
 * form, and a brush there erased ten minutes of typing with no question asked. It has happened
 * twice, with data inside.
 *
 * And what is written **is also noted down on the phone** and offered on returning
 * (`useFormDraft`), which is the only thing covering the exits that cannot be asked about:
 * reloading, the phone killing the tab, running out of battery. That changes what this
 * question means, and that is why `discardText` has two wordings.
 *
 * ── THE TWO DECISIONS, AND WHY THEY ARE TWO ─────────────────
 *
 * **The backdrop stops closing on the sheets that are a form**, and not only when there is
 * something written: a form's exit is always in the same place —the ✕, top
 * right— and the thumb learns it. A surface that closes sometimes and asks for
 * confirmation other times is worse than one that never closes. On the sheets that are CHOOSING something —a
 * place, a venue, a research state— the backdrop still closes: there is nothing there
 * to lose and removing it would remove convenience while gaining nothing.
 *
 * **And the other four exits ask when there is something to lose.** Always asking
 * —including about a blank form— is the quickest way for the question to be
 * dismissed unread, and then it stops protecting. So the condition is «there is something
 * written that would be lost», which each sheet calculates because only it knows what is a datum
 * of its own and what is a half-typed search.
 *
 * Everything here is pure: the suite runs in node.
 */

/** Which way out is being attempted. The four paths, named. */
export type SheetExit =
  /** The dark backdrop behind the sheet. The one touched by accident. */
  | 'backdrop'
  /** The ✕ in the header. */
  | 'close'
  | 'escape'
  /** The phone's back button, or the browser's. */
  | 'back'

/**
 * What to do with an attempt to leave.
 *
 * - `close`: it closes, which is what has always happened.
 * - `confirm`: it asks first, because there is something written.
 * - `ignore`: nothing is done, because that path is not an exit of this sheet.
 */
export type SheetExitAction = 'close' | 'confirm' | 'ignore'

export function sheetExitAction(input: {
  /** There is something typed that would be lost. The sheet decides. */
  dirty: boolean
  exit: SheetExit
  /** The backdrop closes. False in the sheets that are a form. */
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
  // The backdrop does not withdraw the question: covering it with a brush would leave the
  // sheet as it was, which is not harmful, but it is the same brush we were fleeing from.
  return exit === 'backdrop' ? 'ignore' : 'dismiss'
}

// ── What the question says ───────────────────────────────────

export const DISCARD_TITLE = 'Tienes datos a medio meter'

/**
 * Lo que se lee debajo del título, con **lo que NO pasa** delante.
 *
 * Es el criterio de todo el proyecto para una pregunta destructiva: lo que hace falta
 * para decidir no es qué se va a borrar, es qué se queda. Aquí lo que se queda es el
 * catálogo entero — nada de lo que hay dentro se ha guardado todavía, así que salir no
 * cambia ninguna ficha.
 *
 * @param extra Lo que esta hoja en concreto quiera añadir, ya en español. Sirve para el
 *   dato que la frase general no puede saber: que habría que volver a elegir el fichero,
 *   por ejemplo, que es lo más caro de repetir de todo el formulario.
 * @param kept La hoja apunta el borrador y lo ofrece a la vuelta (ver `useFormDraft`).
 *   Entonces salir **no pierde el tecleo**, y decir que sí sería asustar con algo que no
 *   pasa — que es la forma de que la pregunta deje de creerse. Con esto la frase promete
 *   lo que la hoja de verdad hace.
 */
export function discardText(extra?: string | null, kept = false): string {
  const base = kept
    ? 'Del catálogo no se cambia nada: esta hoja no ha escrito todavía. Y lo que has escrito ' +
      'se queda apuntado en este teléfono y se ofrece al volver a abrirla.'
    : 'Si sales ahora, lo que has escrito aquí no se guarda. Del catálogo no se cambia nada: ' +
      'esta hoja no ha escrito todavía.'
  const clean = (extra ?? '').trim()
  return clean === '' ? base : `${base} ${clean}`
}

/** The button that does NOT destroy goes first, which is where the thumb lands unaimed. */
export const DISCARD_KEEP_LABEL = 'Seguir rellenando'

/**
 * «Salir sin guardar» y no «Salir y perderlo».
 *
 * Cambió al apuntarse los borradores: con el borrador guardado, salir ya no pierde el
 * tecleo, y un botón que dice «perderlo» sobre algo que no se pierde es un botón que
 * enseña a no creerse los avisos. Lo que sí es verdad de las dos formas es que no se
 * guarda en el catálogo, que es lo que el botón dice ahora.
 */
export const DISCARD_LEAVE_LABEL = 'Salir sin guardar'
