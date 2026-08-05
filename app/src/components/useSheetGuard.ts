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
  /** El fondo oscuro cierra. Falso en las hojas que son un formulario. */
  backdropCloses: boolean
  /** Lo que esta hoja añade a la pregunta, para lo que la frase general no sabe. */
  discardNotice: string | null
  /** La hoja apunta el borrador y lo ofrece a la vuelta: la pregunta lo promete. */
  draftKept: boolean
  /** La pregunta está en pantalla. */
  confirming: boolean
  /** Un intento de salir por un camino. Lo llaman la hoja y sus cuatro salidas. */
  request: (exit: SheetExit) => void
  /** «Seguir rellenando»: retira la pregunta y deja el formulario como estaba. */
  dismiss: () => void
  /** «Salir sin guardar»: cierra de verdad. Lo escrito puede seguir apuntado, ver `draftKept`. */
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
  /** Cierra la hoja de verdad. Lo que la hoja pasaría a `BottomSheet` sin guardián. */
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
      // Con la pregunta delante no se sale por ningún camino: se retira y se vuelve al
      // formulario con lo escrito intacto.
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

  // Si lo escrito desaparece mientras la pregunta está en pantalla —se vacía el campo, o
  // el guardado termina y limpia el borrador— la pregunta se queda hablando de nada.
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
