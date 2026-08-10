import { useEffect } from 'react'

/**
 * How long a notice that dismisses itself stays on screen (RNF-106).
 *
 * Four seconds. Below three it is not read in full if the eyes were somewhere else
 * on the screen —and in this application they are normally on the photograph—, and
 * above five it stops reading as «this just happened» and sits there covering the
 * record. It is also the floor screen readers recommend for a `role="status"`: less
 * time than that and the announcement is cut halfway.
 */
export const AUTO_CLEAR_MS = 4000

/**
 * Clears `value` on its own, a few seconds after it appears.
 *
 * **Only for what confirms something that already happened**, which is read once and
 * never again: «Imagen principal actualizada». An error does NOT go here — it asks for
 * something to be done, and a notice that vanishes before that decision is made forces
 * the action to be repeated just to read why it failed.
 *
 * The timer restarts when `value` changes, so two confirmations in a row are each read
 * for four seconds instead of sharing the first one's. And it is cancelled on unmount: a
 * `setState` on a screen that is gone is a console warning and one leak per visit.
 */
export function useAutoClear(value: unknown, clear: () => void, ms = AUTO_CLEAR_MS): void {
  useEffect(() => {
    if (value === null || value === undefined || value === '') return
    const timer = setTimeout(clear, ms)
    return () => clearTimeout(timer)
    // `clear` is deliberately out of the dependencies: it is a new function on every
    // render when the caller writes it inline, and with it in there the timer would
    // restart on every paint and the notice would never leave.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, ms])
}
