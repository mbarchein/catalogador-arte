import { useEffect, useRef, useState, type ReactNode } from 'react'

/**
 * Mounts its children the first time they are about to be needed — when the
 * scroll gets close to them — and leaves a placeholder in their place until then.
 *
 * It exists for one situation and it is worth naming: the documentary half of the
 * artwork record. Those five blocks are secondary to the artwork in front of you,
 * each one reads its own table, and the record is walked one artwork after another
 * over mobile data in a warehouse. Mounting them with the record means that
 * swiping past thirty artworks pays for five queries on each of the thirty, for
 * five blocks nobody scrolled down to.
 *
 * **What it must never do is put a lie on the screen while it waits.** So the
 * placeholder is not a grey box: the caller writes it, it says what is underneath,
 * and it carries a button that mounts the children on the spot. That button is not
 * decoration — with the keyboard or a screen reader there is no scroll to trigger
 * anything, and content that can only be reached by a gesture is content that
 * cannot be reached.
 *
 * **Once mounted, mounted for good.** Coming back to the placeholder would throw
 * away every query the blocks have just paid for, and any half-written form in
 * them.
 *
 * The margin is generous on purpose: the point is for the blocks to be there,
 * loaded, by the time the thumb arrives — not to watch them appear.
 */
export function WhenNearby({
  margin = '600px',
  placeholder,
  children,
}: {
  /** How far ahead of the viewport counts as «nearby». A CSS length. */
  margin?: string
  /** What stands in the way meanwhile. `reveal` mounts the children now. */
  placeholder: (reveal: () => void) => ReactNode
  children: ReactNode
}) {
  // Without the observer — an old browser, or a test environment with no DOM —
  // the children are mounted straight away. Failing towards showing everything
  // is the only safe direction: the other one hides half the record.
  const [near, setNear] = useState(() => typeof IntersectionObserver === 'undefined')
  const anchor = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (near) return
    const element = anchor.current
    if (!element) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return
        // Disconnected here and not only on cleanup: the callback can fire again
        // while React is re-rendering, and one reveal is all this needs.
        observer.disconnect()
        setNear(true)
      },
      { rootMargin: margin },
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [near, margin])

  if (near) return <>{children}</>
  return <div ref={anchor}>{placeholder(() => setNear(true))}</div>
}
