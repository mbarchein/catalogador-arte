/**
 * Apuntar lo que se está escribiendo, y ofrecerlo a la vuelta (RNF-106).
 *
 * El cableado de `draftStore.ts`, que es quien decide. Aquí solo están los dos bordes que
 * necesitan un navegador: leer `localStorage` al abrir la hoja y escribirlo mientras se
 * teclea.
 *
 * **Se lee UNA vez, al abrir.** Volver a leerlo en cada render haría que el borrador
 * reapareciera después de haberlo descartado, y sobre todo se ofrecería a sí mismo: lo que
 * se acaba de escribir se guarda, y una lectura posterior lo encontraría y lo ofrecería
 * como si fuera de otra sesión.
 *
 * **Se escribe con retardo.** Un `localStorage.setItem` por pulsación de tecla es
 * síncrono y bloquea el hilo de la interfaz: en un móvil modesto, con un formulario de
 * quince campos, eso se nota al teclear. Medio segundo después de la última tecla es
 * invisible para quien escribe y sobra para lo que esto protege — recargar, que la pestaña
 * muera, quedarse sin batería.
 *
 * `localStorage` puede lanzar: modo privado de Safari, cuota llena, o el usuario con el
 * almacenamiento bloqueado. Nada de eso puede impedir rellenar un formulario, así que todo
 * va envuelto y el fallo se traga: lo que se pierde es la red de seguridad, no la hoja.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  draftOfferText,
  draftStorageKey,
  packDraft,
  readDraft,
  type DraftStatus,
} from './draftStore'

/** What is stored and can be offered. */
export interface DraftOffer<T> {
  draft: T
  status: DraftStatus
  /** The sentence that is read, already in Spanish and with the «hace…» inside. */
  text: string
  /** What is stored has changed since it was noted: look at it before saving. */
  stale: boolean
}

export interface FormDraft<T> {
  /** The draft there is to offer, or null. */
  offer: DraftOffer<T> | null
  /** Accepts it: returns the draft and withdraws the offer. The sheet puts it in its state. */
  accept: () => T | null
  /** Discards and deletes it: «empezar de cero». */
  discard: () => void
  /**
   * Lo borra sin ruido. Se llama **al guardar de verdad**: si no, la hoja ofrecería a la
   * vuelta un borrador idéntico a lo que ya está guardado.
   */
  clear: () => void
}

export function useFormDraft<T extends object>(input: {
  /**
   * Qué formulario y sobre qué fila, para la clave. Con el identificador dentro: dos
   * documentos a medio corregir son dos borradores, y compartir clave haría que el
   * segundo se ofreciera al abrir el primero.
   */
  scope: string
  /** The live draft, exactly as it stands in the sheet's state. */
  draft: T
  /** Something has been typed. Without this an empty draft would be stored on every open. */
  dirty: boolean
  /**
   * Cómo está la fila guardada, con `draftFingerprint`. Null en un formulario de alta.
   * Sirve para avisar si otra sesión la ha corregido mientras esto esperaba.
   */
  fingerprint?: string | null
  /** The form carried a file, which cannot be noted down. It is said when offering it. */
  filesLost?: boolean
}): FormDraft<T> {
  const { scope, draft, dirty, fingerprint = null, filesLost = false } = input
  const key = draftStorageKey(scope)

  // The read, once and on the first render: `useState` with a function and not an effect,
  // because an effect would paint the form empty before knowing there is something to offer.
  const [offer, setOffer] = useState<DraftOffer<T> | null>(() => {
    const now = new Date()
    const read = readDraft<T>(safeRead(key), { now, fingerprint })
    if (read.draft === null) {
      // An expired draft is cleared on the way through here. No sweep is needed: the sheet
      // that left it is the one that opens again.
      if (read.status === 'expired') safeRemove(key)
      return null
    }
    const text = draftOfferText({ status: read.status, at: read.at, now, filesLost })
    if (text === null) return null
    return { draft: read.draft, status: read.status, text, stale: read.status === 'stale' }
  })

  // What the timer needs, in a ref: that way the saving effect is not rescheduled on every
  // keystroke and the delay really counts from the last one.
  const latest = useRef({ draft, dirty, fingerprint, key })
  latest.current = { draft, dirty, fingerprint, key }

  const serialised = useMemo(() => JSON.stringify(draft), [draft])

  useEffect(() => {
    if (!dirty) {
      // Vaciar el formulario a mano también borra el borrador: dejarlo puesto haría que la
      // hoja ofreciera a la vuelta lo que se acaba de quitar a propósito.
      //
      // **Salvo mientras hay una oferta sin contestar**, y esto no es un detalle: al abrir
      // la hoja el formulario está limpio por definición —trae la fila guardada—, así que
      // sin esta condición el efecto de montaje borraba el borrador que la hoja acababa de
      // ofrecer. La oferta se seguía leyendo, porque se lee antes que los efectos, pero
      // debajo ya no había nada: recuperarlo y recargar, o salir sin guardar, lo perdía.
      // Encontrado en Chromium, recargando la página con el formulario a medias.
      if (offer === null) safeRemove(key)
      return
    }
    const timer = window.setTimeout(() => {
      const now = latest.current
      safeWrite(
        now.key,
        packDraft({ draft: now.draft, at: new Date(), fingerprint: now.fingerprint }),
      )
    }, 500)
    return () => window.clearTimeout(timer)
    // `serialised` and not `draft`: a new object with the same content —what any
    // `setDraft({ ...was, ...patch })` that changes nothing returns— reschedules nothing.
  }, [serialised, dirty, key, offer])

  const accept = useCallback(() => {
    const recovered = offer?.draft ?? null
    setOffer(null)
    return recovered
  }, [offer])

  const discard = useCallback(() => {
    setOffer(null)
    safeRemove(key)
  }, [key])

  const clear = useCallback(() => {
    setOffer(null)
    safeRemove(key)
  }, [key])

  return { offer, accept, discard, clear }
}

// ── Los tres bordes, envueltos ───────────────────────────────
// `localStorage` lanza en el modo privado de Safari, con la cuota llena y con el
// almacenamiento bloqueado por política. Ninguna de las tres puede impedir rellenar un
// formulario: lo que se pierde es la red, no la hoja.

function safeRead(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function safeWrite(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // No room or no permission. Nothing to do and nothing to say: telling the cataloger
    // about this would be reporting a breakage she cannot act on.
  }
}

function safeRemove(key: string): void {
  try {
    window.localStorage.removeItem(key)
  } catch {
    // Igual.
  }
}
