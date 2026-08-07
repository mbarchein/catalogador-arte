import { useEffect } from 'react'

/**
 * Asks the browser to confirm before a reload or a close would throw work away (RNF-106).
 *
 * ── QUÉ SE PUEDE Y QUÉ NO ───────────────────────────────────
 *
 * The only mechanism is `beforeunload`, and it is a narrow one: the browser shows **its
 * own** dialog with **its own** words — «¿Seguro que quieres salir de este sitio?» or
 * whatever the phone says in its language — and there is no way to explain what is at
 * stake in it. Every browser stopped honouring custom text years ago, precisely because
 * pages abused it. So this cannot say «tienes tres fotos sin subir»; it can only make the
 * reload stop and ask.
 *
 * A reload also cannot be *disabled*. Pull-to-refresh, the browser's own button and
 * closing the tab are outside the page's reach, and a page that could truly trap someone
 * would be a worse thing than the loss it prevents.
 *
 * ── CUÁNDO SÍ Y CUÁNDO NO ───────────────────────────────────
 *
 * Only while there is something to lose. A guard that is always on is a dialog that
 * appears on every exit, and one that appears every time gets dismissed by reflex — which
 * is exactly the muscle memory that makes it useless on the day it matters. So it is
 * armed by a condition and disarmed the moment the work is safe.
 *
 * It is also not free: a registered `beforeunload` disables the browser's back/forward
 * cache, so going back to this page will rebuild it instead of restoring it. That is a
 * fair trade while a photograph is going up and a bad one the rest of the time, which is
 * the same reason it is conditional.
 *
 * ── LO QUE NO CUBRE ─────────────────────────────────────────
 *
 * Moving around **inside** the application: React Router changes the screen without the
 * browser unloading anything, so this never fires. Leaving a screen with photographs
 * staged loses them just the same, and that is a separate problem with a separate answer.
 */
export function useUnloadGuard(active: boolean): void {
  useEffect(() => {
    if (!active) return

    const ask = (event: BeforeUnloadEvent) => {
      // `preventDefault` is what the specification asks for today; `returnValue` is what
      // several browsers still read. Both, because the cost of the obsolete one is a
      // line and the cost of missing the live one is the photograph.
      event.preventDefault()
      event.returnValue = ''
    }

    window.addEventListener('beforeunload', ask)
    return () => window.removeEventListener('beforeunload', ask)
  }, [active])
}
