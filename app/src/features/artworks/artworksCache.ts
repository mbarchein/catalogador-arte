import type { Artwork } from '../../lib/types'

/**
 * Persisted snapshot of the artworks mirror (see useArtworks): the list
 * paints instantly from here and refreshes in the background. Same
 * conventions as batch.ts — the 'catalogador.' namespace, and a stored value
 * with an unexpected shape is discarded instead of breaking the page.
 *
 * The snapshot holds catalog data, not a preference: it is cleared on sign
 * out, so nothing readable survives the session on a shared device.
 */

const KEY = 'catalogador.artworks-mirror'
const VERSION = 1

function getStorage(): Storage | undefined {
  try {
    return window.localStorage
  } catch {
    return undefined
  }
}

export function readArtworksSnapshot(
  storage: Storage | undefined = getStorage(),
): Artwork[] | null {
  try {
    const raw = storage?.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { v?: unknown; rows?: unknown }
    if (parsed.v !== VERSION || !Array.isArray(parsed.rows)) return null
    if (!parsed.rows.every((r) => typeof (r as Artwork)?.catalog_id === 'string')) return null
    return parsed.rows as Artwork[]
  } catch {
    return null
  }
}

export function saveArtworksSnapshot(
  rows: readonly Artwork[],
  storage: Storage | undefined = getStorage(),
): void {
  try {
    storage?.setItem(KEY, JSON.stringify({ v: VERSION, rows }))
  } catch {
    // Without storage (quota, private browsing) the list still works: only
    // the instant first paint is lost.
  }
}

export function clearArtworksSnapshot(storage: Storage | undefined = getStorage()): void {
  try {
    storage?.removeItem(KEY)
  } catch {
    /* nothing to clear */
  }
}
