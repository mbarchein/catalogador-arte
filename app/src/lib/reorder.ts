/**
 * Moves one element to another position, without mutating the input. The
 * dragged item lands AT `to` and the rest close the gap — which is what a
 * finger dropping a thumbnail between two others means.
 *
 * Out-of-range positions are clamped instead of throwing: a drag ending past
 * the edge of the grid is a normal gesture, not an error.
 */
export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  if (items.length === 0) return []
  const last = items.length - 1
  const source = Math.min(last, Math.max(0, from))
  const target = Math.min(last, Math.max(0, to))
  if (source === target) return [...items]

  const next = [...items]
  const [moved] = next.splice(source, 1)
  next.splice(target, 0, moved as T)
  return next
}
