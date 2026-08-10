/**
 * The guard of a sheet with a form: not losing what was written to a brush (RNF-106).
 *
 * ── WHY A HOOK AND NOT THREE PROPS ──────────────────────────
 *
 * A sheet has **five** exits —the dark backdrop, the ✕, Escape, the phone's back
 * button and the footer's «Cancelar»— and all of them have to be covered: the one left
 * out would be the one that loses the data. `BottomSheet` controls four, but the «Cancelar» is painted
 * by each form, **in the same component that paints the sheet and not below it** — so neither
 * a context nor a `BottomSheet` prop reaches it.
 *
 * Hence the state living here, in the caller, and `BottomSheet` receiving the whole
 * guard: a single owner of «am I asking?», and the five exits coming in through the
 * same door. The alternative —each sheet keeping its own `confirming`— is
 * five copies of the same question and five places to forget an exit.
 *
 * What is DECIDED is pure and lives in `sheetExit.ts`, with its tests. Here there is only state.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { confirmingExitAction, sheetExitAction, type SheetExit } from './sheetExit'

export interface SheetGuard {
  /** The dark backdrop closes. False in the sheets that are a form. */
  backdropCloses: boolean
  /** What this sheet adds to the question, for what the general sentence cannot know. */
  discardNotice: string | null
  /** The sheet notes the draft down and offers it on return: the question promises it. */
  draftKept: boolean
  /** The question is on screen. */
  confirming: boolean
  /** An attempt to leave by one path. Called by the sheet and its four exits. */
  request: (exit: SheetExit) => void
  /** «Seguir rellenando»: withdraws the question and leaves the form as it was. */
  dismiss: () => void
  /** «Salir sin guardar»: really closes. What was typed may still be noted, see `draftKept`. */
  leave: () => void
  /**
   * The fifth exit: the «Cancelar» the form paints at the foot.
   *
   * It is the ✕ with another button, so it comes in through the same door. A «Cancelar» is a
   * deliberate gesture, yes, but it is right next to «Guardar» and on a phone that is a few millimetres.
   */
  cancel: () => void
}

export function useSheetGuard(input: {
  /**
   * There is something written that would be lost on closing. The sheet calculates it —see `formDirty.ts`—
   * because only it knows what is a datum of its own and what is a half-typed search.
   *
   * And **«somebody has touched the sheet» is not enough**: a question that always comes up is
   * learnt to be dismissed unread, and on the day it matters it is not read either.
   */
  dirty: boolean
  /** Really closes the sheet. What the sheet would pass to `BottomSheet` with no guard. */
  onClose: () => void
  /**
   * The backdrop closes. **By default NOT**, which is what a form needs: with the
   * sheet at three quarters of the screen, the backdrop falls exactly where the thumb rests when
   * scrolling, and a brush there erased ten minutes of typing. The two-mode sheets
   * —choosing from a list or creating— pass it according to the mode.
   */
  backdropCloses?: boolean
  discardNotice?: string | null
  /**
   * La hoja apunta lo escrito con `useFormDraft` y lo ofrece a la vuelta.
   *
   * Cambia lo que la pregunta puede prometer, y eso importa: decir «vas a perderlo» sobre
   * algo que no se pierde es la forma de que la pregunta deje de creerse.
   */
  draftKept?: boolean
}): SheetGuard {
  const {
    dirty,
    onClose,
    backdropCloses = false,
    discardNotice = null,
    draftKept = false,
  } = input
  const [confirming, setConfirming] = useState(false)

  // Lo que el árbitro necesita saber, en un ref: `request` se registra en el listener del
  // botón de atrás y en el del teclado, y volver a registrarlos en cada pulsación de tecla
  // del formulario podría perderse una.
  const state = useRef({ dirty, backdropCloses, onClose, confirming })
  state.current = { dirty, backdropCloses, onClose, confirming }

  const request = useCallback((exit: SheetExit) => {
    const now = state.current
    if (now.confirming) {
      // With the question in front, no path leaves: it is withdrawn and the form comes back
      // with what was typed untouched.
      if (confirmingExitAction(exit) === 'dismiss') setConfirming(false)
      return
    }
    const action = sheetExitAction({
      dirty: now.dirty,
      exit,
      backdropCloses: now.backdropCloses,
    })
    if (action === 'ignore') return
    if (action === 'confirm') {
      setConfirming(true)
      return
    }
    now.onClose()
  }, [])

  const dismiss = useCallback(() => setConfirming(false), [])
  const leave = useCallback(() => {
    setConfirming(false)
    state.current.onClose()
  }, [])
  const cancel = useCallback(() => request('close'), [request])

  // If what was typed disappears while the question is on screen —the field is emptied, or
  // the save finishes and clears the draft— the question is left talking about nothing.
  useEffect(() => {
    if (!dirty) setConfirming(false)
  }, [dirty])

  return {
    backdropCloses,
    discardNotice,
    draftKept,
    confirming,
    request,
    dismiss,
    leave,
    cancel,
  }
}
