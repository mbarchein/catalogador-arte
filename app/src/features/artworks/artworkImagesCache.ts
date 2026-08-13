import type { ImageRow } from './artworkImages'

/**
 * Mirror of a record's photographs: the gallery paints from here and refreshes in the
 * background (RNF-106).
 *
 * ── WHAT WAS SEEN ───────────────────────────────────────────
 *
 * Reopening a record still blinked. The signatures were already kept (`signedPaths`) and
 * the bytes too (the service worker), but WHICH photographs a record has was asked again
 * on every visit — so the gallery painted its grey placeholder, then the strip and the
 * large photo appeared. The artwork's text does not blink, because the list's mirror is
 * right there; its photographs did.
 *
 * ── WHAT IT KEEPS, AND WHAT IT DOES NOT ─────────────────────
 *
 * The rows of `images` and which one is the cover, per record. Not the signatures: those
 * live in `signedPaths`, shared with the list's thumbnails and the exhibition posters and
 * pruned by expiry — keeping them twice would be two truths about one URL. Not the bytes
 * either: `localStorage` holds strings.
 *
 * ── BOUNDED, AND WIPED ──────────────────────────────────────
 *
 * One record is of the order of two kilobytes, so the cap is on the number of RECORDS and
 * what goes when it is reached is whatever was visited longest ago: cataloging walks
 * forward through the sequence, so the useful mirror is always the recent one.
 *
 * It is catalog data on a device that may be shared, so it is cleared on sign out — from
 * `clearArtworksCache`, along with the list's mirror, the signatures and the bytes.
 */

const KEY = 'catalogador.artwork-images-mirror'
const VERSION = 1

/** How many records are mirrored at once. */
export const MAX_MIRRORED_ARTWORKS = 60

export interface ArtworkImagesSnapshot {
  rows: ImageRow[]
  /** The representative image, as the `representative_image` view decides it (RF-403). */
  mainId: string | null
  manuallyChosen: boolean
}

interface StoredRecord extends ArtworkImagesSnapshot {
  /** When it was last written, for the cap: the oldest visit is what goes. */
  at: number
}

function getStorage(): Storage | undefined {
  try {
    return window.localStorage
  } catch {
    return undefined
  }
}

function readAll(storage: Storage | undefined): Record<string, StoredRecord> {
  try {
    const raw = storage?.getItem(KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as { v?: unknown; records?: unknown }
    if (parsed.v !== VERSION || parsed.records === null || typeof parsed.records !== 'object') {
      return {}
    }
    return parsed.records as Record<string, StoredRecord>
  } catch {
    // Anything unrecognized is «there is nothing»: it asks, which is slower and works.
    return {}
  }
}

/**
 * What is painted from a row: its identifier, the two files and the shot type, which is
 * the label of the strip. A row missing any of them invalidates the whole record instead
 * of painting a thumbnail that leads nowhere or a badge that reads «undefined».
 */
function isRow(value: unknown): boolean {
  const row = value as ImageRow | null
  return (
    typeof row?.image_id === 'string' &&
    typeof row.thumbnail_path === 'string' &&
    typeof row.derivative_path === 'string' &&
    typeof row.shot_type === 'string'
  )
}

/** What is mirrored for a record, or null if there is nothing usable. */
export function readArtworkImagesSnapshot(
  catalogId: string,
  storage: Storage | undefined = getStorage(),
): ArtworkImagesSnapshot | null {
  const record = readAll(storage)[catalogId]
  if (!record || !Array.isArray(record.rows) || !record.rows.every(isRow)) return null
  return {
    rows: record.rows,
    mainId: typeof record.mainId === 'string' ? record.mainId : null,
    manuallyChosen: record.manuallyChosen === true,
  }
}

export function saveArtworkImagesSnapshot(
  catalogId: string,
  snapshot: ArtworkImagesSnapshot,
  storage: Storage | undefined = getStorage(),
  now: number = Date.now(),
): void {
  try {
    if (!storage) return
    const records = readAll(storage)
    records[catalogId] = { ...snapshot, at: now }
    const kept = Object.entries(records)
      .sort((a, b) => (b[1]?.at ?? 0) - (a[1]?.at ?? 0))
      .slice(0, MAX_MIRRORED_ARTWORKS)
    storage.setItem(KEY, JSON.stringify({ v: VERSION, records: Object.fromEntries(kept) }))
  } catch {
    // Without storage —quota, private browsing— everything still works: the only thing
    // lost is the instant paint.
  }
}

/** Wipes the mirror. On sign out, with the rest of what the session cached. */
export function clearArtworkImagesCache(storage: Storage | undefined = getStorage()): void {
  try {
    storage?.removeItem(KEY)
  } catch {
    /* nothing to clear */
  }
}
