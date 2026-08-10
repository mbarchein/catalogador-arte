/**
 * The chosen text size, applied and shared (RNF-106).
 *
 * What decides is in `textScale.ts`, which is pure. Here are the two edges that
 * need a browser —`localStorage` and the root's style— and the synchronisation, which
 * is genuinely needed: the profile changes it and the photograph editor suspends it while
 * it lives, so there are two places touching the same datum and **the last to speak cannot
 * win by accident**. An external store with `useSyncExternalStore`, the same pattern
 * the install prompt already uses.
 *
 * The initial value is NOT applied from here: `index.html`'s `<script>` does that, before
 * React mounts, so the first screen is not painted at the normal size and does not jump.
 * This reads it and changes it; the boot sets it.
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
    // Safari's private mode, or storage blocked by policy. It stays at the
    // normal size, which is what the boot script will have done too.
    return 'NORMAL'
  }
}

/**
 * Writes the size on the root.
 *
 * `document.documentElement` and not a Tailwind class: it is a computed value out of three
 * possible ones and not a variant, and putting it here is what makes **the `rem` of the whole
 * application** —text, padding, touch targets— move at once.
 */
function apply(scale: TextScale): void {
  const root = document.documentElement
  if (scale === 'NORMAL') {
    // It is removed instead of set to 16px: leaving it in place would nail the size against whoever has
    // enlarged it from the system, and the browser already knew how to do that before
    // this setting existed.
    root.style.removeProperty('font-size')
    return
  }
  root.style.fontSize = textScaleFontSize(scale)
}

function emit(): void {
  for (const listener of listeners) listener()
}

/** Changes the size: stores it, applies it and notifies whoever is watching it. */
export function setTextScale(scale: TextScale): void {
  current = scale
  try {
    window.localStorage.setItem(TEXT_SCALE_KEY, scale)
  } catch {
    // No room or no permission: the size is applied in this session and is not remembered. That
    // is preferred to doing nothing, and there is nothing to warn about — it is a breakdown the
    // cataloguer cannot act upon.
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

/** The chosen size, reactive. */
export function useTextScale(): TextScale {
  return useSyncExternalStore(subscribe, getSnapshot, () => 'NORMAL' as TextScale)
}

/**
 * Returns the root to the base size while this component lives, and restores it on leaving.
 *
 * For the **photograph editor**, which is the reasoned exception to the setting: it measures its canvas
 * in pixels and computes the position of the crop and perspective handles against the
 * element's real rectangle, so scaling it is asking for trouble in the one screen
 * of the project where a couple of points of deviation are visible. And since it takes up the whole
 * screen, while it is open there is nothing else to read: returning the whole root to the normal
 * size is coherent and needs no `zoom` trick over coordinates.
 *
 * It restores by reading the store, not a value captured on mounting: if somebody changed the
 * setting with the editor open, leaving the editor has to leave the new size.
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
