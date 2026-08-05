import { useEffect, useRef } from 'react'

/**
 * The phone's back button closes the modal on top, it does not leave the screen
 * (RNF-106).
 *
 * On a phone the back gesture is THE way out of anything that covers the screen,
 * and in the installed application there is no browser bar offering a second one.
 * Without this, backing out of an open sheet abandons the record — with whatever
 * was half typed in it — and the sheet's own ✕ becomes the only exit: a trap, in
 * the one place where a trap is most expensive.
 *
 * How: opening pushes ONE history entry that does not change the URL, so the
 * router sees no navigation and the page underneath is not re-rendered; the back
 * button consumes that entry and this closes the modal instead. Closing by any
 * other route — the ✕, Escape, tapping an option — consumes the same entry from
 * the cleanup, so the back button never lands on a modal that is already gone.
 *
 * The entry is stamped with a key naming WHICH modal pushed it, and that is what
 * makes stacked modals work: the party picker opened from inside the provenance
 * sheet closes on its own and leaves the sheet underneath standing. A single
 * `popstate` listener arbitrates for all of them, because every mounted modal
 * hearing every back is exactly how two of them close at once.
 */

/** One open modal. */
type OpenModal = {
  /** Stamp of its history entry, to recognize it on the way back. */
  key: string
  close: () => void
  /**
   * False from the moment the component unmounts. It is how a close that was
   * REFUSED is told from one that happened.
   */
  alive: boolean
}

/** The open modals, outermost first. */
const openModals: OpenModal[] = []
let stamps = 0
let listening = false

function modalKeyOf(state: unknown): string | null {
  if (typeof state !== 'object' || state === null) return null
  const key = (state as { modalKey?: unknown }).modalKey
  return typeof key === 'string' ? key : null
}

/**
 * The modal's history entry. The router's own state is carried over rather than
 * replaced: the URL does not change, so nothing the router counts about this
 * entry should change either.
 */
function pushEntry(key: string) {
  const current = window.history.state
  const carried = typeof current === 'object' && current !== null ? current : {}
  window.history.pushState({ ...carried, modalKey: key }, '')
}

function onPopState() {
  const landed = modalKeyOf(window.history.state)
  const at = landed === null ? -1 : openModals.findIndex((m) => m.key === landed)
  // An entry with a key no open modal claims is a STALE entry, not the page
  // underneath: React's development double-mount leaves one behind, and so does
  // navigating away from an open modal. Reading it as the page would close the
  // modal that just opened.
  if (landed !== null && at < 0) return

  // Landing on the page underneath closes every modal; landing on a modal's own
  // entry closes only what was stacked above it. From the inside out, because an
  // outer modal closing may unmount the inner one.
  const closing = openModals.splice(at + 1)
  for (const modal of [...closing].reverse()) modal.close()
  if (closing.length === 0) return

  // A modal may refuse to close: the sheet that uploads a document does, while
  // the file is in flight. If it is still mounted, it gets its entry back — the
  // back button then does nothing at all, which is what the refusal asks for,
  // instead of leaving the NEXT back to walk out of the screen mid-upload.
  window.setTimeout(() => {
    for (const modal of closing) {
      if (!modal.alive || openModals.includes(modal)) continue
      openModals.push(modal)
      pushEntry(modal.key)
    }
  }, 0)
}

/**
 * @param onClose What the back button must do. The same close the ✕ calls.
 * @param open Whether the modal is on screen. Omit it for a modal that only
 *   exists while open — the full-screen viewer and editor are mounted and
 *   unmounted, the bottom sheet is told with a prop.
 */
export function useCloseOnBack(onClose: () => void, open = true) {
  // The close lives in a ref so the modal registers ONCE: registering again on
  // every render could miss the very back that closes it.
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!open) return

    // Registered on first use and never removed: with no modal open the
    // arbitration above does nothing, and adding and removing the listener
    // around each modal is one more order to get wrong.
    if (!listening) {
      window.addEventListener('popstate', onPopState)
      listening = true
    }

    stamps += 1
    const modal: OpenModal = {
      key: `modal-${stamps}`,
      alive: true,
      close: () => onCloseRef.current(),
    }
    openModals.push(modal)
    pushEntry(modal.key)

    return () => {
      modal.alive = false
      const at = openModals.indexOf(modal)
      // Gone from the registry already: the back button closed it and its entry
      // is spent.
      if (at < 0) return
      openModals.splice(at, 1)
      // Closed by another route, so the pushed entry has to be consumed here or
      // the next back would appear to do nothing. Only while it is still the
      // current entry: if something inside the modal navigated elsewhere, that
      // entry is buried and going back would leave the screen just opened.
      if (modalKeyOf(window.history.state) === modal.key) window.history.back()
    }
  }, [open])
}
