/**
 * What leaving the photo editor does, layer by layer (RF-1205, RNF-106).
 *
 * The editor stacks things on top of the photograph: the colour or camera-data
 * panel takes the place of the tool row, and the eyedropper arms on top of
 * either. Leaving has to undo the innermost one and no more — a single gesture
 * that closed the editor from an open panel would discard the framing and the
 * colour that have not been applied yet, and applying is the one thing the
 * editor exists to do.
 *
 * It is a function of its own, and not three `if`s inside the component, because
 * TWO exits climb this ladder: the Escape key and the phone's back button. While
 * each carried its own copy, the back button — the only exit there is on a phone
 * without a browser bar — went straight out with the panel open, and Escape did
 * the right thing. Now both ask here.
 */

/** The layers that are up, from the component's state. */
export type EditorLayers = {
  eyedropper: boolean
  /** Whether the colour or camera-data panel has the footer, instead of the tools. */
  panelOpen: boolean
  /**
   * Whether this is the editor's own exit — the ✕, «Cancelar», «Aplicar» — and
   * not a step down the ladder. Those three are on screen WITH a panel open, and
   * from there «Aplicar» has to apply: peeling first would close the panel and
   * stay inside, which reads as a button that did nothing.
   */
  leaving: boolean
}

export type EditorExit = 'DISARM_EYEDROPPER' | 'CLOSE_PANEL' | 'LEAVE'

export function editorExit({ eyedropper, panelOpen, leaving }: EditorLayers): EditorExit {
  if (leaving) return 'LEAVE'
  // Innermost first: the eyedropper arms OVER the colour panel, so disarming it
  // has to come before closing the panel it was armed from.
  if (eyedropper) return 'DISARM_EYEDROPPER'
  if (panelOpen) return 'CLOSE_PANEL'
  return 'LEAVE'
}
