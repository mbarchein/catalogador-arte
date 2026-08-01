import { EMPTY_DATE, type StructuredDate } from '../../lib/structuredDate'
import { ARTIST_FUNDS, type ArtistFund } from '../../lib/types'

/**
 * State of a capture batch. The distinction between the two halves is what
 * prevents a batch from ending up with inherited data nobody wanted:
 *
 *  - **Fixed**: chosen when opening the batch and unchanged while it stays
 *    open. Changing them requires closing the batch, which is a deliberate
 *    gesture. They are the two fields that define "what am I cataloging now":
 *    fund and artwork type.
 *
 *  - **Carried**: they start from the previous artwork's value and get
 *    adjusted on each one. They are fields that tend to repeat within a batch
 *    but belong to the piece, not to the batch.
 *
 * What is NEVER carried: title and measurements. Inheriting them would be
 * inventing data of one artwork from another, which is the worst thing an
 * inventory can do.
 */
export interface Batch {
  fixed: {
    artist: ArtistFund
    artworkType: string
    /** Series of the batch, from the vocabulary. Empty is legitimate. */
    series: string
  }
  carried: {
    date: StructuredDate
    technique: string
    /**
     * Identifier of the place in the tree, or null (ADR-006). It carries over
     * because a batch is normally photographed shelf by shelf, and it is an
     * identifier and not a name so that renaming the shelf mid-batch does not
     * leave the batch pointing at a place that no longer answers.
     */
    placeId: string | null
  }
}

export const INITIAL_BATCH: Batch = {
  fixed: { artist: 'ROTILI', artworkType: '', series: '' },
  carried: { date: EMPTY_DATE, technique: '', placeId: null },
}

// 'catalogador' is the product name and acts as the storage namespace.
const KEY = 'catalogador.batch'
// One-shot migration: batches saved by previous versions live under this key.
// On first read it is moved to KEY and removed; a pre-rename value shape
// simply normalizes to the initial batch, the documented behavior for foreign
// shapes.
const LEGACY_KEY = 'catalogador.lote'

/**
 * The batch survives reloads and the phone discarding the tab. In a storage
 * room that happens: the screen locks, a call is taken, one comes back.
 * Losing the batch settings on the third artwork is what makes people abandon
 * a tool.
 *
 * No data of the artwork in progress is stored, only the batch configuration.
 */
export function readBatch(storage: Storage | undefined = getStorage()): Batch {
  if (!storage) return INITIAL_BATCH
  try {
    const raw = storage.getItem(KEY)
    if (raw) return normalize(JSON.parse(raw))

    // One-shot migration from the legacy key: read, rewrite under the new
    // key, delete the old one. Losing the open batch on an app update would
    // be exactly the annoyance this persistence exists to prevent.
    const legacy = storage.getItem(LEGACY_KEY)
    if (legacy) {
      const batch = normalize(JSON.parse(legacy))
      storage.setItem(KEY, JSON.stringify(batch))
      storage.removeItem(LEGACY_KEY)
      return batch
    }

    return INITIAL_BATCH
  } catch {
    // A corrupt value, or one from a previous version, cannot prevent
    // cataloging.
    return INITIAL_BATCH
  }
}

export function saveBatch(batch: Batch, storage: Storage | undefined = getStorage()): void {
  try {
    storage?.setItem(KEY, JSON.stringify(batch))
  } catch {
    // Private browsing or exhausted quota: work continues without persistence.
  }
}

export function forgetBatch(storage: Storage | undefined = getStorage()): void {
  try {
    storage?.removeItem(KEY)
    storage?.removeItem(LEGACY_KEY)
  } catch {
    /* nothing to do */
  }
}

/**
 * Checks field by field what comes from outside. Trusting the shape of a
 * foreign JSON is how a value stored months ago takes the whole application
 * down.
 */
function normalize(value: unknown): Batch {
  if (typeof value !== 'object' || value === null) return INITIAL_BATCH
  const v = value as Record<string, unknown>
  const fixed = (v.fixed ?? {}) as Record<string, unknown>
  const carried = (v.carried ?? {}) as Record<string, unknown>
  const date = (carried.date ?? {}) as Record<string, unknown>

  return {
    fixed: {
      artist: ARTIST_FUNDS.includes(fixed.artist as ArtistFund)
        ? (fixed.artist as ArtistFund)
        : 'ROTILI',
      artworkType: typeof fixed.artworkType === 'string' ? fixed.artworkType : '',
      // A batch stored before the series existed simply has none.
      series: typeof fixed.series === 'string' ? fixed.series : '',
    },
    carried: {
      date: {
        year: typeof date.year === 'number' ? date.year : null,
        approximate: date.approximate === true,
        endYear: typeof date.endYear === 'number' ? date.endYear : null,
        unconfirmed: date.unconfirmed === true,
      },
      technique: typeof carried.technique === 'string' ? carried.technique : '',
      // A batch stored before the tree existed carries `location`, a text with
      // the old notation convention. It is dropped rather than converted: a name
      // is not an identity — which is the whole reason for ADR-006 — and
      // resolving it would need the tree here, where there is no data access.
      // The cost is choosing the place once on the next artwork.
      placeId: typeof carried.placeId === 'string' ? carried.placeId : null,
    },
  }
}

function getStorage(): Storage | undefined {
  try {
    return window.localStorage
  } catch {
    return undefined
  }
}

/** A batch is ready to capture when its two fixed fields have a value. */
export function batchConfigured(batch: Batch): boolean {
  return batch.fixed.artworkType.trim() !== ''
}
