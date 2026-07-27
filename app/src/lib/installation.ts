/**
 * PWA installation ("Add to home screen").
 *
 * Chrome and derivatives fire `beforeinstallprompt` when the application is
 * installable; that event must be retained to launch the dialog later, from a
 * user gesture. The listener is registered at module load because the event
 * can arrive before React mounts anything. Safari on iOS has no such event:
 * there the only option is explaining the manual gesture.
 */

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
}

let deferredEvent: BeforeInstallPromptEvent | null = null
const listeners = new Set<() => void>()

function notify() {
  listeners.forEach((listener) => listener())
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    // Without this, some browsers show their own prompt at an arbitrary
    // moment. It is retained and offered in "Mi perfil", where people look.
    event.preventDefault()
    deferredEvent = event as BeforeInstallPromptEvent
    notify()
  })
  window.addEventListener('appinstalled', () => {
    deferredEvent = null
    notify()
  })
}

/** For useSyncExternalStore: notifies when availability changes. */
export function subscribeInstall(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function canInstall(): boolean {
  return deferredEvent !== null
}

/** Already running as an installed app (full screen, no browser chrome). */
export function isInstalled(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(display-mode: standalone)').matches
}

export async function launchInstall(): Promise<void> {
  const event = deferredEvent
  // The browser only allows using the event once; if the user dismisses the
  // dialog, another beforeinstallprompt will fire when due.
  deferredEvent = null
  notify()
  await event?.prompt()
}
