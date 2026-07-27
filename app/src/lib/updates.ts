/**
 * When to ask whether a new version has been published.
 *
 * The app shell is served from cache to start instantly (RF-1202), and the
 * browser only revisits the service worker when the application opens: a tab
 * that spends the day open in the storage room would keep the old version
 * indefinitely. Here we decide when to ask again; the reload when the new
 * version activates is done by the registration in main.tsx (autoUpdate).
 */

export const CHECK_INTERVAL_MS = 15 * 60 * 1000

/** The only thing needed from `document`, so tests can fake it. */
export interface VisibilitySource {
  visibilityState: DocumentVisibilityState
  addEventListener(type: 'visibilitychange', handler: () => void): void
}

export function scheduleChecks(
  check: () => void,
  doc: VisibilitySource = document,
): void {
  // Every quarter of an hour while the application stays open...
  setInterval(check, CHECK_INTERVAL_MS)

  // ...and when coming back to the foreground: on a phone, locking the screen
  // or switching apps does not close the tab, so this is the typical moment of
  // resuming — sometimes days after the last full load.
  doc.addEventListener('visibilitychange', () => {
    if (doc.visibilityState === 'visible') check()
  })
}
