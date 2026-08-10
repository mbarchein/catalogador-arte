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
 * What to do with an attempt to leave **while the confirmation is on screen**.
 *
 * It never leaves: back and Escape withdraw the question and return to the sheet, with what was
 * written intact. It is the opposite of convenient and the only defensible thing — one back too
 * many, with a question in front saying the data is going to be lost, cannot be exactly the
 * press that loses it. To leave, one has to say so with the button that says so.
 */
export function confirmingExitAction(exit: SheetExit): 'dismiss' | 'ignore' {
  // The backdrop does not withdraw the question: covering it with a brush would leave the
  // sheet as it was, which is not harmful, but it is the same brush we were fleeing from.
  return exit === 'backdrop' ? 'ignore' : 'dismiss'
}

// ── What the question says ───────────────────────────────────

export const DISCARD_TITLE = 'Tienes datos a medio meter'

/**
 * What is read below the title, with **what does NOT happen** first.
 *
 * It is the whole project's criterion for a destructive question: what is needed
 * to decide is not what is going to be erased, it is what stays. Here what stays is the
 * whole catalogue — nothing inside has been stored yet, so leaving does not
 * change any record.
 *
 * @param extra What this particular sheet wants to add, already in Spanish. It serves for the
 *   datum the general sentence cannot know: that the file would have to be chosen again,
 *   for instance, which is the most expensive thing in the whole form to repeat.
 * @param kept The sheet notes the draft down and offers it on returning (see `useFormDraft`).
 *   Then leaving **does not lose the typing**, and saying it does would be frightening people with something that does not
 *   happen — which is the way for the question to stop being believed. With this the sentence promises
 *   what the sheet really does.
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
 * «Salir sin guardar» and not «Salir y perderlo».
 *
 * It changed when drafts started being noted down: with the draft stored, leaving no longer loses the
 * typing, and a button saying «perderlo» about something that is not lost is a button that
 * teaches people not to believe the warnings. What is true either way is that it is not
 * stored in the catalogue, which is what the button says now.
 */
export const DISCARD_LEAVE_LABEL = 'Salir sin guardar'
