import { isNoColor, normalizeColor, type ColorEdit, type ColorInput } from '../../lib/imageColor'
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
 * The colour adjustment of the last photograph corrected in the batch (RF-414).
 *
 * A sibling key and **not a field of `Batch`**, which is where it belongs
 * conceptually and where it would be lost. The capture page holds the batch in React
 * state and rewrites the whole stored object whenever that state changes, so a colour
 * written here by the photo picker — a different component, with no way to tell the
 * page about it — would be wiped by the next tap on any batch field. Two keys in the
 * same namespace, written and cleared by the same three functions of this module, is
 * the same lifetime without that race.
 *
 * No migration from an older key: this one is new and nothing was ever stored under
 * it. A value of a shape this version does not understand normalizes to the neutral
 * adjustment, which reads as «nothing to carry» — the documented behavior of this file
 * for foreign shapes.
 */
const COLOR_KEY = 'catalogador.batch-color'

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
    // Closing the batch forgets the light too. It is the one deliberate gesture that
    // says «I am done with this shelf», and carrying an afternoon's colour into the
    // next session — another room, another window, another day — is precisely the
    // inherited data nobody asked for that the two halves of `Batch` exist to prevent.
    storage?.removeItem(COLOR_KEY)
  } catch {
    /* nothing to do */
  }
}

/**
 * The colour adjustment to offer as «el mismo color que la anterior», or null.
 *
 * Null both when nothing has been remembered and when what was remembered does
 * nothing: an adjustment at its identity is not a light to carry, and offering it would
 * be a control that visibly does nothing when tapped.
 *
 * Everything that comes from storage goes through `normalizeColor`, which reads
 * anything out of range, `NaN`, or an enum value it does not know as that field's
 * identity — so a value written by a future version, or by hand, cannot put a number
 * on screen that the database would refuse.
 */
export function readBatchColor(storage: Storage | undefined = getStorage()): ColorEdit | null {
  if (!storage) return null
  try {
    const raw = storage.getItem(COLOR_KEY)
    if (!raw) return null
    const color = normalizeColor(JSON.parse(raw) as ColorInput)
    return isNoColor(color) ? null : color
  } catch {
    // A corrupt value cannot prevent photographing.
    return null
  }
}

/**
 * Remembers the adjustment just applied, so the next shot of the batch starts from it.
 *
 * Stored normalized, which is what the row stores as well: the value that comes back
 * is the value the database accepted, and not a finger's raw drag. An adjustment that
 * does nothing REMOVES the key instead of writing a neutral one — undoing a correction
 * has to undo the offer too, or the next photograph would be handed a light that was
 * explicitly abandoned.
 */
export function rememberBatchColor(
  color: ColorInput,
  storage: Storage | undefined = getStorage(),
): void {
  try {
    if (!color || isNoColor(color)) {
      storage?.removeItem(COLOR_KEY)
      return
    }
    storage?.setItem(COLOR_KEY, JSON.stringify(normalizeColor(color)))
  } catch {
    // Private browsing or exhausted quota: work continues without persistence.
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
