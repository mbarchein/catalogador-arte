/**
 * The geometry of the progress ring (RNF-106).
 *
 * An SVG circle is filled with `stroke-dasharray` and `stroke-dashoffset`: the stroke
 * measures the whole circumference and the offset decides how much is left unpainted.
 * It is one line of arithmetic and that is why it lives here and not inside the
 * component: computed wrong it draws an arc that runs backwards, or one that fills
 * before the upload ends, and **progress that lies is worse than no progress at all**
 * —whoever looks at it decides whether to wait or give up by what they see—.
 */

/** The radius and the thickness of the ring, in the units of the 24 `viewBox`. */
export const RING_RADIUS = 9
export const RING_STROKE = 2.5

/** The full turn, which is what the stroke measures. */
export const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS

/**
 * How much of the stroke is left UNPAINTED, for a given percentage.
 *
 * Zero is the complete ring and the whole circumference is the empty one. It is clamped
 * to [0, 100]: a badly measured total can give 103 %, and unclamped the offset would go
 * negative and the browser would paint the arc backwards.
 */
export function ringOffset(percent: number, circumference = RING_CIRCUMFERENCE): number {
  if (!Number.isFinite(percent)) return circumference
  const clamped = Math.min(100, Math.max(0, percent))
  return circumference * (1 - clamped / 100)
}

/**
 * What is said to whoever cannot see the ring.
 *
 * A drawing that informs only by its shape informs nobody using a screen reader, and
 * here the drawing IS the datum.
 */
export function ringLabel(action: string, percent: number | null): string {
  return percent === null ? `${action}…` : `${action}: ${percent}%`
}
