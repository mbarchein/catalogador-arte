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
   * The timer that will take it out of the registry, or null when none is pending.
   *
   * The unregistration is DEFERRED by one task instead of running in the cleanup,
   * and that is not a detail: React's development double-mount tears the effect down
   * and builds it straight back up, and consuming the history entry in between left
   * the application on the page's own entry — where the arbitration below reads «no
   * modal is open» and closes the sheet that had just been opened. Every sheet of the
   * application mounts already open, so in development they all shut instantly.
   *
   * Deferring it makes the double-mount invisible: the second `register` cancels the
   * pending unregistration and finds itself already registered, so nothing is pushed
   * and nothing is popped. A real unmount is one task later, which nobody can see.
   *
   * It is also how a REFUSED close is told from one that happened: a modal that did
   * not unmount has no unregistration pending.
   */
  pendingUnregister: number | null
}

/** The open modals, outermost first. */
const openModals: OpenModal[] = []
let stamps = 0
let listening = false

/**
 * A different stamp on every page load, and not an ornament.
 *
 * History entries survive a reload; the counter above does not. Without
 * this stamp, reloading with a sheet open left an entry marked «modal-1» and the
 * next sheet was marked «modal-1» again: the «back» landed on the old
 * entry, the arbiter recognised it as the open sheet's —same key— and closed
 * «whatever was on top», which was nothing. The sheet stayed open and the button
 * looked broken. Measured in Chromium.
 *
 * With the stamp, an entry from another load belongs to nobody, and that is already resolved:
 * it closes whatever is open.
 */
const session = Math.random().toString(36).slice(2, 8)

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

/**
 * Puts the modal in the registry with its history entry, or does nothing when it is
 * already there — which is the development double-mount arriving for the second time.
 */
function register(modal: OpenModal) {
  if (modal.pendingUnregister !== null) {
    window.clearTimeout(modal.pendingUnregister)
    modal.pendingUnregister = null
  }
  if (openModals.includes(modal)) return
  openModals.push(modal)
  pushEntry(modal.key)
}

/**
 * Takes it out and consumes its history entry, one task later.
 *
 * Only while that entry is still the current one: if something inside the modal
 * navigated elsewhere, the entry is buried and going back would leave the screen that
 * was just opened. And only while the modal is still registered: when the back button
 * is what closed it, the arbitration already took it out and the entry is spent.
 */
function scheduleUnregister(modal: OpenModal) {
  if (modal.pendingUnregister !== null) return
  modal.pendingUnregister = window.setTimeout(() => {
    modal.pendingUnregister = null
    const at = openModals.indexOf(modal)
    if (at < 0) return
    openModals.splice(at, 1)
    if (modalKeyOf(window.history.state) === modal.key) window.history.back()
  }, 0)
}

function onPopState() {
  const landed = modalKeyOf(window.history.state)
  // Landing on a modal's own entry closes only what was stacked above it. Landing
  // anywhere else — the page underneath, or an entry stamped by a modal nobody has
  // open — closes every modal there is.
  //
  // A key that no open modal claims is STALE, and reading it as the page underneath
  // is deliberate: it happens when the page is reloaded with a sheet open, and there
  // the sheet on screen is a NEW one whose entry sits on top. The alternative —
  // ignoring the pop — left that sheet needing two back presses. What used to make
  // ignoring it necessary was React's development double-mount, and that is handled
  // where it belongs now, by not consuming the entry in the first place.
  const at = landed === null ? -1 : openModals.findIndex((m) => m.key === landed)

  // From the inside out, because an outer modal closing may unmount the inner one.
  const closing = openModals.splice(at + 1)
  for (const modal of [...closing].reverse()) modal.close()
  if (closing.length === 0) return

  // A modal may refuse to close: the sheet that uploads a document does, while
  // the file is in flight. If it is still mounted, it gets its entry back — the
  // back button then does nothing at all, which is what the refusal asks for,
  // instead of leaving the NEXT back to walk out of the screen mid-upload.
  //
  // One task later, which is what makes «still mounted» answerable: React flushes
  // the state updates of this event before the task runs, so a modal that really
  // closed has already had its unregistration scheduled by its own cleanup, and one
  // that refused has not.
  window.setTimeout(() => {
    for (const modal of closing) {
      if (modal.pendingUnregister !== null || openModals.includes(modal)) continue
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

  /**
   * The modal's record, in a ref so it is ONE record for this component however many
   * times its effect is torn down and rebuilt.
   *
   * That is what survives the development double-mount: React remounts the effect,
   * not the component, so the ref hands the second run the same record, `register`
   * sees it is already registered and neither pushes a second history entry nor pops
   * the first. Building the record inside the effect gave the second run a new one,
   * and the entry of the first was consumed on the way through — which closed every
   * sheet of the application the instant it opened, in development.
   */
  const modalRef = useRef<OpenModal | null>(null)

  useEffect(() => {
    if (!open) return

    // Registered on first use and never removed: with no modal open the
    // arbitration above does nothing, and adding and removing the listener
    // around each modal is one more order to get wrong.
    if (!listening) {
      window.addEventListener('popstate', onPopState)
      listening = true
    }

    if (modalRef.current === null) {
      stamps += 1
      modalRef.current = {
        key: `modal-${session}-${stamps}`,
        pendingUnregister: null,
        close: () => onCloseRef.current(),
      }
    }
    const modal = modalRef.current
    register(modal)

    return () => scheduleUnregister(modal)
  }, [open])
}
