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

/** Lo que hay guardado y se puede ofrecer. */
export interface DraftOffer<T> {
  draft: T
  status: DraftStatus
  /** La frase que se lee, ya en español y con el «hace…» dentro. */
  text: string
  /** Lo guardado ha cambiado desde que se apuntó: hay que mirarlo antes de guardar. */
  stale: boolean
}

export interface FormDraft<T> {
  /** El borrador que hay para ofrecer, o null. */
  offer: DraftOffer<T> | null
  /** Lo acepta: devuelve el borrador y retira la oferta. La hoja lo mete en su estado. */
  accept: () => T | null
  /** Lo descarta y lo borra: «empezar de cero». */
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
  /** El borrador vivo, tal cual está en el estado de la hoja. */
  draft: T
  /** Hay algo escrito. Sin esto se guardaría un borrador vacío en cada apertura. */
  dirty: boolean
  /**
   * Cómo está la fila guardada, con `draftFingerprint`. Null en un formulario de alta.
   * Sirve para avisar si otra sesión la ha corregido mientras esto esperaba.
   */
  fingerprint?: string | null
  /** El formulario llevaba un fichero, que no se puede apuntar. Se dice al ofrecerlo. */
  filesLost?: boolean
}): FormDraft<T> {
  const { scope, draft, dirty, fingerprint = null, filesLost = false } = input
  const key = draftStorageKey(scope)

  // La lectura, una sola vez y en el primer render: `useState` con función y no un efecto,
  // porque un efecto pintaría el formulario vacío antes de saber que hay algo que ofrecer.
  const [offer, setOffer] = useState<DraftOffer<T> | null>(() => {
    const now = new Date()
    const read = readDraft<T>(safeRead(key), { now, fingerprint })
    if (read.draft === null) {
      // Un borrador caducado se limpia al pasar por aquí. No hace falta un barrido: la
      // hoja que lo dejó es la que vuelve a abrirse.
      if (read.status === 'expired') safeRemove(key)
      return null
    }
    const text = draftOfferText({ status: read.status, at: read.at, now, filesLost })
    if (text === null) return null
    return { draft: read.draft, status: read.status, text, stale: read.status === 'stale' }
  })

  // Lo que el temporizador necesita, en un ref: así el efecto de guardar no se reprograma
  // en cada tecla y el retardo cuenta de verdad desde la última.
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
    // `serialised` y no `draft`: un objeto nuevo con el mismo contenido —lo que devuelve
    // cualquier `setDraft({ ...was, ...patch })` que no cambie nada— no reprograma nada.
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
    // Sin sitio o sin permiso. Nada que hacer y nada que decir: avisar de esto a la
    // catalogadora sería contarle una avería sobre la que no puede actuar.
  }
}

function safeRemove(key: string): void {
  try {
    window.localStorage.removeItem(key)
  } catch {
    // Igual.
  }
}
