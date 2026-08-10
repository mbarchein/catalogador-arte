/**
 * El guardián de una hoja con formulario: no perder lo escrito por un roce (RNF-106).
 *
 * ── POR QUÉ UN HOOK Y NO TRES PROPS ─────────────────────────
 *
 * Una hoja tiene **cinco** salidas —el fondo oscuro, la ✕, Escape, el botón de atrás del
 * móvil y el «Cancelar» del pie— y hay que taparlas todas: la que se quedara fuera sería
 * la que pierde los datos. Cuatro las controla `BottomSheet`, pero el «Cancelar» lo pinta
 * cada formulario, **en el mismo componente que pinta la hoja y no debajo** — así que ni
 * un contexto ni una prop de `BottomSheet` le llegan.
 *
 * De ahí que el estado viva aquí, en el llamador, y que `BottomSheet` reciba el guardián
 * entero: un solo dueño de «¿estoy preguntando?», y las cinco salidas entrando por la
 * misma puerta. La alternativa —que cada hoja se guardara su propio `confirming`— es
 * cinco copias de la misma pregunta y cinco sitios donde olvidar una salida.
 *
 * Lo que se DECIDE es puro y está en `sheetExit.ts`, con sus tests. Aquí solo hay estado.
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
   * La quinta salida: el «Cancelar» que el formulario pinta al pie.
   *
   * Es la ✕ con otro botón, así que entra por la misma puerta. Un «Cancelar» es un gesto
   * deliberado, sí, pero está pegado a «Guardar» y en un móvil eso son unos milímetros.
   */
  cancel: () => void
}

export function useSheetGuard(input: {
  /**
   * Hay algo escrito que se perdería al cerrar. Lo calcula la hoja —ver `formDirty.ts`—
   * porque solo ella sabe qué es un dato suyo y qué es una búsqueda a medio teclear.
   *
   * Y **no vale con «alguien ha tocado la hoja»**: una pregunta que sale siempre se
   * aprende a despachar sin leerla, y el día que importa tampoco se lee.
   */
  dirty: boolean
  /** Really closes the sheet. What the sheet would pass to `BottomSheet` with no guard. */
  onClose: () => void
  /**
   * El fondo cierra. **Por omisión NO**, que es lo que necesita un formulario: con la
   * hoja a tres cuartos de pantalla, el fondo cae justo donde se apoya el pulgar al
   * desplazarse, y un roce ahí borraba diez minutos de tecleo. Las hojas de dos modos
   * —elegir de una lista o dar de alta— lo pasan según el modo.
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
