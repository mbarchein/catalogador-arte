import type { Artwork } from '../../lib/types'

/**
 * Persisted snapshot of the artworks mirror (see useArtworks): the list paints
 * instantly from here and refreshes in the background. Same conventions as
 * batch.ts — the 'catalogador.' namespace, and a stored value with an
 * unexpected shape is discarded instead of breaking the page.
 *
 * Besides the rows it keeps each artwork's thumbnail: its storage path and the
 * signed URL. Two different things are cached with it:
 *
 *  - the MAPPING artwork → thumbnail, which saves asking the database which
 *    image represents each artwork on every visit;
 *  - the URL, which is what lets the browser reuse the image it already has.
 *    Signing again would produce a different URL for the same file, and a
 *    different URL is a different image as far as any cache is concerned.
 *
 * The bytes are not stored here — localStorage holds strings and hundreds of
 * thumbnails would blow its quota. Those live in the service worker cache,
 * keyed by path (see the runtimeCaching rule in vite.config.ts).
 *
 * The snapshot holds catalog data, not a preference: it is cleared on sign
 * out, so nothing readable survives the session on a shared device.
 */

const KEY = 'catalogador.artworks-mirror'
/**
 * Bumped to 3 when the location became a node of the tree (ADR-006): a snapshot
 * written by the previous version carries `physical_location` and no
 * `physical_place_id`, so every artwork in it would read as having no location
 * and the filter would answer nothing. There is nothing to migrate — the mirror
 * is a copy of the catalog and it is rebuilt from the server on the next load.
 */
const VERSION = 3

/** Name of the service worker cache holding the image bytes. */
export const IMAGE_CACHE = 'imagenes-obras'

export interface CachedThumbnail {
  /** Storage path: stable and immutable, so it identifies the file. */
  path: string
  /** Signed URL, valid until `expiresAt`. */
  url: string
  /** Absolute expiry, ms since epoch. */
  expiresAt: number
}

export interface ArtworksSnapshot {
  rows: Artwork[]
  /** By catalog_id. Only artworks with a representative image appear. */
  thumbnails: Record<string, CachedThumbnail>
}

function getStorage(): Storage | undefined {
  try {
    return window.localStorage
  } catch {
    return undefined
  }
}

function isThumbnail(value: unknown): value is CachedThumbnail {
  const t = value as CachedThumbnail | null
  return (
    typeof t?.path === 'string' && typeof t.url === 'string' && typeof t.expiresAt === 'number'
  )
}

/**
 * Reads the snapshot, dropping the thumbnails whose signature has expired:
 * their URL no longer works and painting a broken image would be worse than
 * painting the placeholder while the fresh one arrives. `now` is injectable
 * so the expiry can be tested.
 */
export function readArtworksSnapshot(
  storage: Storage | undefined = getStorage(),
  now: number = Date.now(),
): ArtworksSnapshot | null {
  try {
    const raw = storage?.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { v?: unknown; rows?: unknown; thumbnails?: unknown }
    if (parsed.v !== VERSION || !Array.isArray(parsed.rows)) return null
    if (!parsed.rows.every((r) => typeof (r as Artwork)?.catalog_id === 'string')) return null

    const thumbnails: Record<string, CachedThumbnail> = {}
    const stored = parsed.thumbnails
    if (stored !== null && typeof stored === 'object') {
      for (const [catalogId, value] of Object.entries(stored as Record<string, unknown>)) {
        if (isThumbnail(value) && value.expiresAt > now) thumbnails[catalogId] = value
      }
    }
    return { rows: parsed.rows as Artwork[], thumbnails }
  } catch {
    return null
  }
}

export function saveArtworksSnapshot(
  snapshot: ArtworksSnapshot,
  storage: Storage | undefined = getStorage(),
): void {
  try {
    storage?.setItem(KEY, JSON.stringify({ v: VERSION, ...snapshot }))
  } catch {
    // Without storage (quota, private browsing) the list still works: only
    // the instant first paint is lost.
  }
}

/**
 * Wipes what the session cached: the snapshot and the image bytes. Called on
 * sign out — on a shared device the next person must not find the catalog in
 * the browser.
 */
export function clearArtworksCache(storage: Storage | undefined = getStorage()): void {
  try {
    storage?.removeItem(KEY)
  } catch {
    /* nothing to clear */
  }
  try {
    void caches?.delete(IMAGE_CACHE)
  } catch {
    /* no Cache API (insecure context, old browser): nothing cached either */
  }
}

/**
 * Which thumbnails must be signed again: those never cached, those whose file
 * changed (a new main image is a different path) and those about to expire.
 * Reusing a still-valid URL is the whole point — a new signature would look
 * like a new image to every cache.
 *
 * The margin exists so a URL does not expire in the middle of the visit it was
 * handed out for.
 */
export function thumbnailsToSign(
  paths: Record<string, string>,
  cached: Record<string, CachedThumbnail>,
  now: number = Date.now(),
  marginMs: number = 6 * 60 * 60 * 1000,
): string[] {
  const stale = new Set<string>()
  for (const [catalogId, path] of Object.entries(paths)) {
    const hit = cached[catalogId]
    if (!hit || hit.path !== path || hit.expiresAt - marginMs <= now) stale.add(path)
  }
  return [...stale]
}
