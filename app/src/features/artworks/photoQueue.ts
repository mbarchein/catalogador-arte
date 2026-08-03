import type { PreparedShot } from '../../lib/images'
import { exifDateOnly, type ExifDateSource, type PhotoTakenDate } from '../../lib/exif'
import {
  normalizeEdit,
  normalizeRotation,
  type Crop,
  type CropSource,
  type PhotoEdit,
} from '../../lib/imageEdits'
import { CORNER_KEYS, isConvexQuadrilateral, type Corners } from '../../lib/perspective'
import type { PhotoProvenance, ShotTypeValue } from '../../lib/types'

/**
 * Queue of prepared photos, stored in IndexedDB.
 *
 * It exists because of a real failure: when the camera opens from the phone,
 * the system brings the camera app to the foreground and the browser may
 * **discard the tab** under memory pressure. On return, the page reloads and
 * everything living in memory is gone — including the photos already taken.
 * The cataloger sees that "the previous ones got deleted" without having done
 * anything.
 *
 * localStorage is no use: it only stores text, and here there are three blobs
 * per shot adding up to megabytes. IndexedDB stores blobs natively.
 *
 * Only the queue pending upload is stored. As soon as the photos are up, it is
 * emptied: the source of truth becomes the database.
 */

const DB_NAME = 'cataloger'
const STORE = 'photo-queue'

/**
 * Schema version of the database, NOT of the shape of a row.
 *
 * It stays at 1 while fields are added to the stored object — corners, crop source,
 * the date read from the file and the provenance were all added without touching it —
 * because an object store with a key path and no indexes has nothing to migrate:
 * IndexedDB stores whatever object it is given and the new fields simply appear in the
 * rows written from then on.
 * Raising it would run `onupgradeneeded` for no gain, and this project has
 * already paid once for treating stored data lightly (see LEGACY_DB_NAME): the
 * queue was lost over a rename.
 *
 * What that does demand is the other half, and it is not optional: a row written
 * by the previous version, without the new fields, must rehydrate into a valid
 * edit rather than into `undefined` travelling onwards. That is `storedEdit`'s
 * job and it has its test. A bump would only be needed to add an index or to
 * change the key path.
 */
const VERSION = 1

// The pre-rename database. Deleted on first open of the new one so megabytes
// of orphaned blobs do not linger on the phones. Deliberately WITHOUT
// migrating its content: losing a pending queue over the rename was accepted
// as a one-off cost.
const LEGACY_DB_NAME = 'catalogador'

export interface StoredShot {
  key: string
  shotType: ShotTypeValue
  isIndex: boolean
  // The master is stored as a blob plus its name and type, and rebuilt as a
  // File on read: not every browser preserves a File in IndexedDB, and the
  // name is needed for the file extension when uploading.
  master: Blob
  masterName: string
  masterType: string
  thumbnail: Blob
  derivative: Blob
  originalWidth: number
  originalHeight: number
  // Framing already applied to the two blobs above. Stored so that a tab
  // discarded while the camera was in the foreground does not silently lose it:
  // the copies would come back straightened and the row would be written as if
  // they were not, and the printed catalog would then reframe them wrong.
  // Absent in rows written before this feature existed (see storedEdit).
  rotation?: number
  crop?: Crop | null
  // The four corners, for the same reason and with more at stake: a perspective
  // correction lives ONLY here until the photo is uploaded, so losing it left the
  // derivatives straightened and the row written with no corners at all — the
  // record then claimed a framing the files do not have, and the correction could
  // never be loosened or undone because the numbers were gone. They take
  // precedence over `crop`, as everywhere else (see imageEdits.ts).
  corners?: Corners | null
  // Where the framing came from. Not decoration: it is what tells a rectangle the
  // cataloger drew from one the detector suggested, and without it every shot that
  // survived a reload would be uploaded as if it had been drawn by hand.
  cropSource?: CropSource
  // The date the file claims it was taken, read from the EXIF while the original was
  // still in the browser (RF-416). **This is the field with no second chance.** The
  // framing can be redone by hand and the crop source can be chosen again, but the
  // only moment the master is here to be read is `prepareShot`: once it is in B2,
  // recovering twenty bytes means downloading megabytes, and if the tab was discarded
  // the shot comes back with a date of null and the photograph is filed as if it had
  // no date. Absent in rows written before this existed (see storedFileDate).
  fileDate?: PhotoTakenDate | null
  // Where the photograph comes from (RF-417). Chosen by the cataloger in the staging
  // list, so it is the same case as `cropSource`: without storing it, a reload would
  // upload as own work a reproduction taken from somebody else's catalog — and the
  // consequence is not cosmetic, since colour adjustment is not offered on those.
  provenance?: PhotoProvenance
}

/**
 * The framing of a stored row, tolerating one written before it existed.
 *
 * Everything is checked instead of trusted because these rows outlive a deploy:
 * what comes back was written by whatever version of the application was
 * installed when the camera opened, which may be the one before the fields
 * existed. A row it cannot make sense of rehydrates as «no framing», never as
 * `undefined` passed along.
 */
function storedEdit(row: StoredShot): PhotoEdit {
  const rotation = normalizeRotation(row.rotation ?? 0)

  // Corners first, because they take precedence in the row too. Four whole points
  // and a quadrilateral that can actually be straightened: a crossed one would
  // fold the image over itself, and showing the photograph unstraightened is
  // better than that. Same reading as `editFromColumns` does for a database row.
  const corners = row.corners
  const whole = !!corners && CORNER_KEYS.every((key) => isPoint(corners[key]))
  if (whole && isConvexQuadrilateral(corners)) {
    return normalizeEdit({ rotation, crop: null, corners })
  }

  const crop = row.crop
  if (
    !crop ||
    typeof crop.x !== 'number' ||
    typeof crop.y !== 'number' ||
    typeof crop.width !== 'number' ||
    typeof crop.height !== 'number'
  ) {
    return { rotation, crop: null, corners: null }
  }
  return {
    rotation,
    crop: { x: crop.x, y: crop.y, width: crop.width, height: crop.height },
    corners: null,
  }
}

function isPoint(value: unknown): boolean {
  const point = value as { x?: unknown; y?: unknown } | null | undefined
  return !!point && Number.isFinite(point.x) && Number.isFinite(point.y)
}

/**
 * Every crop source, to validate what comes out of the store.
 *
 * Listed here and not imported because the vocabulary of an edit is a type and
 * not a list (see imageEdits.ts). A `Record` keyed by the type and not an array,
 * so that adding a value to `CropSource` without adding it here is a compile
 * error rather than a framing silently downgraded to «drawn by hand».
 *
 * The check matters because a row can have been written by another version of
 * the application: an unknown label would travel to the database, be rejected by
 * the enum, and lose the whole shot over a word.
 */
const CROP_SOURCES: Record<CropSource, true> = {
  MANUAL: true,
  SUGGESTED: true,
  SUGGESTED_ADJUSTED: true,
}

function storedCropSource(row: StoredShot): CropSource | undefined {
  const value = row.cropSource
  return value && CROP_SOURCES[value] === true ? value : undefined
}

/**
 * Every provenance, to validate what comes out of the store, for the same reason and
 * with the same shape as `CROP_SOURCES`: a `Record` keyed by the type, so adding a
 * value to `PhotoProvenance` without adding it here is a compile error and not a
 * photograph silently filed as own work.
 */
const PROVENANCES: Record<PhotoProvenance, true> = {
  OWN: true,
  OTHER_CATALOG: true,
  THIRD_PARTY: true,
}

function storedProvenance(row: StoredShot): PhotoProvenance | undefined {
  const value = row.provenance
  return value && PROVENANCES[value] === true ? value : undefined
}

/** The two tags a date can come from, listed to validate a stored row (see above). */
const DATE_SOURCES: Record<ExifDateSource, true> = {
  DATE_TIME_ORIGINAL: true,
  IFD0_DATE_TIME: true,
}

/**
 * The date of a stored row, rebuilt instead of trusted.
 *
 * Three fields are **derived and not read**, and each one is a way the row could
 * otherwise contradict itself after a deploy:
 *
 *  - `exact` comes from `source`, because it is the same fact written twice — a row
 *    claiming `DATE_TIME_ORIGINAL` with `exact: false` would reach the database as an
 *    approximate date that is not approximate, and the column that tells the 2022
 *    batch apart from the rest would start lying;
 *  - `date` comes from `when` through `exifDateOnly`, the same function that produced
 *    it, so the text and the parts cannot drift;
 *  - anything that is not one of the two known sources, or whose clock is not six
 *    plausible numbers, is «no date» — never `undefined` travelling onwards into the
 *    insert.
 *
 * The calendar is not re-verified here (February 30th, leap years): the value was
 * written by `readPhotoExif`, which refuses those, and this check exists to reject a
 * foreign shape, not to keep a second copy of the parser.
 */
function storedFileDate(row: StoredShot): PhotoTakenDate | null {
  const stored = row.fileDate
  if (!stored || DATE_SOURCES[stored.source] !== true) return null
  const when = stored.when
  if (
    !when ||
    !isWholeNumber(when.year) ||
    !isWholeNumber(when.month) ||
    !isWholeNumber(when.day) ||
    !isWholeNumber(when.hour) ||
    !isWholeNumber(when.minute) ||
    !isWholeNumber(when.second) ||
    when.year < 1826 ||
    when.month < 1 ||
    when.month > 12 ||
    when.day < 1 ||
    when.day > 31 ||
    when.hour > 23 ||
    when.minute > 59 ||
    when.second > 59
  ) {
    return null
  }
  const source = stored.source
  return {
    when: {
      year: when.year,
      month: when.month,
      day: when.day,
      hour: when.hour,
      minute: when.minute,
      second: when.second,
    },
    source,
    exact: source === 'DATE_TIME_ORIGINAL',
    date: exifDateOnly(when),
  }
}

function isWholeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value)
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'key' })
      }
      // First open of the new database: polite cleanup of the legacy one.
      // Fire-and-forget — if it fails (another tab holding it open), the only
      // consequence is some orphaned blobs until the next attempt.
      try {
        indexedDB.deleteDatabase(LEGACY_DB_NAME)
      } catch {
        /* nothing to do */
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function await_<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export interface QueuedShotInput {
  key: string
  shotType: ShotTypeValue
  isIndex: boolean
  prepared: PreparedShot
}

/**
 * What gets written to IndexedDB for one shot.
 *
 * Split out of `saveQueue` — and paired with `rehydrate` — because the loss of
 * data this module exists to prevent happens here, in what is copied out and
 * what is read back, and not in the database plumbing. Kept pure so the round
 * trip can be tested for real instead of mocking IndexedDB whole.
 */
export function toStoredShot(shot: QueuedShotInput): StoredShot {
  return {
    key: shot.key,
    shotType: shot.shotType,
    isIndex: shot.isIndex,
    master: shot.prepared.master,
    masterName: shot.prepared.master.name,
    masterType: shot.prepared.master.type,
    thumbnail: shot.prepared.thumbnail,
    derivative: shot.prepared.derivative,
    originalWidth: shot.prepared.originalWidth,
    originalHeight: shot.prepared.originalHeight,
    rotation: shot.prepared.edit.rotation,
    crop: shot.prepared.edit.crop,
    corners: shot.prepared.edit.corners ?? null,
    cropSource: shot.prepared.cropSource,
    // Plain data, so IndexedDB stores it by structured clone with nothing to rebuild
    // on the way back. `null` and absent both mean «this photograph does not say when
    // it was taken», which is the truth for 9 of the 44 masters.
    fileDate: shot.prepared.fileDate ?? null,
    provenance: shot.prepared.provenance,
  }
}

/**
 * Rewrites the whole queue. It is cleared and rewritten instead of diffing:
 * these are a handful of photos, and a half-updated queue would be worse than
 * any inefficiency.
 */
export async function saveQueue(shots: QueuedShotInput[]): Promise<void> {
  try {
    const db = await open()
    const tx = db.transaction(STORE, 'readwrite')
    const store = tx.objectStore(STORE)
    store.clear()
    for (const s of shots) {
      store.put(toStoredShot(s))
    }
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    db.close()
  } catch {
    // Without IndexedDB — private browsing in some browsers, quota exhausted —
    // cataloging continues; only the safety net against a reload is lost.
  }
}

export async function readQueue(): Promise<StoredShot[]> {
  try {
    const db = await open()
    const tx = db.transaction(STORE, 'readonly')
    const rows = await await_(tx.objectStore(STORE).getAll() as IDBRequest<StoredShot[]>)
    db.close()
    // The shape of what comes back is checked: a broken row cannot prevent
    // cataloging today.
    return rows.filter(
      (r): r is StoredShot =>
        typeof r?.key === 'string' && r.master instanceof Blob && r.thumbnail instanceof Blob,
    )
  } catch {
    return []
  }
}

export async function clearQueue(): Promise<void> {
  try {
    const db = await open()
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).clear()
    await new Promise<void>((resolve) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
    })
    db.close()
  } catch {
    /* nothing to do */
  }
}

/** Rebuilds a usable shot from what was stored. */
export function rehydrate(row: StoredShot): {
  key: string
  shotType: ShotTypeValue
  isIndex: boolean
  prepared: PreparedShot
} {
  return {
    key: row.key,
    shotType: row.shotType,
    isIndex: row.isIndex,
    prepared: {
      // **`lastModified` of this File is NOT the date of the photograph and must
      // never be read as one.** The fourth argument of the constructor is not
      // passed, so the rebuilt File is stamped with the moment of this call: a
      // shot that survived a reload would claim to have been taken now. It is
      // not passed on purpose — the bytes are what matters and the queue is not
      // an archive of file metadata — and it is not going to be fixed here,
      // because the file date would be no more trustworthy anyway: the phone
      // rewrites it on copy, download or share. The date of a photograph comes
      // from inside the file (see the EXIF reader) and only from there — it is
      // `fileDate` a few lines below, read from the original at `prepareShot` and
      // stored with the row precisely so that this rebuild does not have to invent
      // anything.
      master: new File([row.master], row.masterName, { type: row.masterType }),
      thumbnail: row.thumbnail,
      derivative: row.derivative,
      originalWidth: row.originalWidth,
      originalHeight: row.originalHeight,
      // The previous object URL died with the page: a new one is created.
      preview: URL.createObjectURL(row.thumbnail),
      cropSource: storedCropSource(row),
      // The date read from the original before it left the browser. It survives here
      // or it does not survive at all: see the field in StoredShot.
      fileDate: storedFileDate(row),
      provenance: storedProvenance(row),
      edit: storedEdit(row),
    },
  }
}
