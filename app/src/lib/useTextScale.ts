/**
 * El tamaño de letra elegido, aplicado y compartido (RNF-106).
 *
 * Lo que decide está en `textScale.ts`, que es puro. Aquí están los dos bordes que
 * necesitan un navegador —`localStorage` y el estilo de la raíz— y la sincronización, que
 * hace falta de verdad: el perfil lo cambia y el editor de fotografía lo suspende mientras
 * vive, así que hay dos sitios tocando el mismo dato y **el último en hablar no puede
 * ganar por accidente**. Un almacén externo con `useSyncExternalStore`, el mismo patrón que
 * ya usa el aviso de instalación.
 *
 * El valor inicial NO se aplica desde aquí: lo hace el `<script>` de `index.html`, antes de
 * que React monte, para que la primera pantalla no se pinte al tamaño normal y salte.
 * Esto lo lee y lo cambia; el arranque lo pone.
 */

import { useEffect, useSyncExternalStore } from 'react'
import {
  BASE_FONT_PX,
  normalizeTextScale,
  TEXT_SCALE_KEY,
  textScaleFontSize,
  type TextScale,
} from './textScale'

let current: TextScale = readStored()
const listeners = new Set<() => void>()

function readStored(): TextScale {
  try {
    return normalizeTextScale(window.localStorage.getItem(TEXT_SCALE_KEY))
  } catch {
    // Modo privado de Safari, o almacenamiento bloqueado por política. Se queda en el
    // tamaño normal, que es lo que el script de arranque habrá hecho también.
    return 'NORMAL'
  }
}

/**
 * Escribe el tamaño en la raíz.
 *
 * `document.documentElement` y no una clase de Tailwind: es un valor calculado de tres
 * posibles y no una variante, y ponerlo aquí es lo que hace que **el `rem` de toda la
 * aplicación** —texto, relleno, objetivos de toque— se mueva a la vez.
 */
function apply(scale: TextScale): void {
  const root = document.documentElement
  if (scale === 'NORMAL') {
    // Se quita en vez de fijarse en 16px: dejarlo puesto clavaría el tamaño contra quien lo
    // haya agrandado desde el sistema, y eso el navegador ya lo sabía hacer antes de que
    // existiera este ajuste.
    root.style.removeProperty('font-size')
    return
  }
  root.style.fontSize = textScaleFontSize(scale)
}

function emit(): void {
  for (const listener of listeners) listener()
}

/** Cambia el tamaño: lo guarda, lo aplica y avisa a quien lo esté mirando. */
export function setTextScale(scale: TextScale): void {
  current = scale
  try {
    window.localStorage.setItem(TEXT_SCALE_KEY, scale)
  } catch {
    // Sin sitio o sin permiso: el tamaño se aplica en esta sesión y no se recuerda. Se
    // prefiere eso a no hacer nada, y no hay nada que avisar — es una avería sobre la que
    // la catalogadora no puede actuar.
  }
  apply(scale)
  emit()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function getSnapshot(): TextScale {
  return current
}

/** El tamaño elegido, reactivo. */
export function useTextScale(): TextScale {
  return useSyncExternalStore(subscribe, getSnapshot, () => 'NORMAL' as TextScale)
}

/**
 * Devuelve la raíz al tamaño base mientras este componente viva, y la restituye al salir.
 *
 * Para el **editor de fotografía**, que es la excepción razonada al ajuste: mide su lienzo
 * en píxeles y calcula la posición de los tiradores de recorte y perspectiva contra el
 * rectángulo real del elemento, así que escalarlo es pedirle problemas a la única pantalla
 * del proyecto donde un par de puntos de desviación se ven. Y como ocupa la pantalla
 * entera, mientras está abierto no hay nada más que leer: devolver la raíz entera al tamaño
 * normal es coherente y no necesita ningún truco de `zoom` sobre coordenadas.
 *
 * Restituye leyendo el almacén, no un valor capturado al montar: si alguien cambiara el
 * ajuste con el editor abierto, salir del editor tiene que dejar el tamaño nuevo.
 */
export function useBaseTextScaleHere(): void {
  useEffect(() => {
    const root = document.documentElement
    root.style.fontSize = `${BASE_FONT_PX}px`
    return () => {
      apply(current)
    }
  }, [])
}
