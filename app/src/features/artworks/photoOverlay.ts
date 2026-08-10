/**
 * The controls that sit ON the photograph: what they say and when they can be pressed
 * (RF-405, RF-901, RNF-106).
 *
 * ── WHY ON TOP AND NOT IN THE PANEL ─────────────────────────
 *
 * All four act on **the shot being looked at**, and while looking at a photograph the
 * eyes are on the photograph. In the data panel they were buttons that said «esta»
 * without showing which one «esta» was: in a record with four shots, «Quitar esta
 * fotografía» two screens away from the image is the ambiguity that gets the wrong one
 * removed.
 *
 * ── WHAT THIS MODULE DECIDES, AND WHY IT IS SEPARATE ────────
 *
 * An icon with no word beside it says only what its drawing and its state say, so the
 * screen-reader label **is** the text of this function, not a decorative attribute. It
 * lives outside the component so the battery can verify it, which runs in node: what is
 * checked is that the star's three states are told apart, and that the two ends of the
 * order do not offer an impossible move.
 */

/** The star when this shot is NOT the main one: pressing it makes it so. */
export const MAIN_SET_LABEL = 'Usar como imagen principal'
/**
 * The star when it IS the main one but **nobody chose it**.
 *
 * Unpinned, the main one is «the most recent general shot», so uploading another general
 * changes it on its own. That is a different state from the other two and gets its own
 * label: the star looks lit and there is still something to do.
 */
export const MAIN_PIN_LABEL = 'Fijar esta como imagen principal'
/** The star when it is already pinned by hand: lit, with nothing left to do. */
export const MAIN_IS_LABEL = 'Es la imagen principal'

export const MOVE_BEFORE_LABEL = 'Mover hacia el principio'
export const MOVE_AFTER_LABEL = 'Mover hacia el final'
export const REMOVE_LABEL = 'Quitar de la ficha'

/** How the star is painted and what it does. */
export interface MainButtonState {
  /** Filled when this shot is the main one, in either of the two ways. */
  filled: boolean
  /** Only once it is pinned by hand: nothing left to press. */
  disabled: boolean
  label: string
}

export function mainButtonState(isMain: boolean, manuallyChosen: boolean): MainButtonState {
  if (!isMain) return { filled: false, disabled: false, label: MAIN_SET_LABEL }
  if (manuallyChosen) return { filled: true, disabled: true, label: MAIN_IS_LABEL }
  return { filled: true, disabled: false, label: MAIN_PIN_LABEL }
}

/**
 * What is read under the photograph: whether it is the cover and where it sits.
 *
 * With a single photograph there is no order to state —«1 de 1» is noise— and no cover to
 * choose either, so it says nothing and returns the empty string; whoever paints decides
 * whether that is a gap or a line that is simply not there.
 */
export function photoStatusText(input: {
  isMain: boolean
  manuallyChosen: boolean
  /** Its place in the order, starting at 1. */
  position: number
  total: number
}): string {
  const order = input.total > 1 ? `${input.position} de ${input.total}` : ''
  if (!input.isMain) return order
  const main = input.manuallyChosen ? 'Principal' : 'Principal, sin fijar'
  return order === '' ? main : `${main} · ${order}`
}

/** The why of «sin fijar», which is the only part of this with a consequence. */
export const MAIN_AUTO_NOTE =
  'Es la principal porque es la general más reciente, no porque alguien la eligiera. ' +
  'Si se sube otra general, la portada cambia sola. Tocar la estrella fija esta.'

// ── Removing, the only thing here that takes something off the record ───────

export const REMOVE_TITLE = 'Quitar esta fotografía'
export const REMOVE_QUESTION = '¿Quitar esta fotografía de la ficha?'
/** What does NOT happen, which is the half that prevents the fright (RF-901). */
export const REMOVE_CONSEQUENCE = 'El fichero se conserva, pero deja de mostrarse.'
export const REMOVE_CONFIRM_LABEL = 'Sí, quitar'
export const REMOVE_CANCEL_LABEL = 'Cancelar'

/** Can it move that way? At the ends, no. */
export function canMove(position: number, total: number, step: -1 | 1): boolean {
  if (total < 2) return false
  return step === -1 ? position > 1 : position < total
}
