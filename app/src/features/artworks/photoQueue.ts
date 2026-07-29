import type { PreparedShot } from '../../lib/images'
import { normalizeRotation, type Crop, type PhotoEdit } from '../../lib/imageEdits'
import type { ShotTypeValue } from '../../lib/types'

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
}

/** The framing of a stored row, tolerating one written before it existed. */
function storedEdit(row: StoredShot): PhotoEdit {
  const rotation = normalizeRotation(row.rotation ?? 0)
  const crop = row.crop
  if (
    !crop ||
    typeof crop.x !== 'number' ||
    typeof crop.y !== 'number' ||
    typeof crop.width !== 'number' ||
    typeof crop.height !== 'number'
  ) {
    return { rotation, crop: null }
  }
  return { rotation, crop: { x: crop.x, y: crop.y, width: crop.width, height: crop.height } }
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

/**
 * Rewrites the whole queue. It is cleared and rewritten instead of diffing:
 * these are a handful of photos, and a half-updated queue would be worse than
 * any inefficiency.
 */
export async function saveQueue(
  shots: { key: string; shotType: ShotTypeValue; isIndex: boolean; prepared: PreparedShot }[],
): Promise<void> {
  try {
    const db = await open()
    const tx = db.transaction(STORE, 'readwrite')
    const store = tx.objectStore(STORE)
    store.clear()
    for (const s of shots) {
      const row: StoredShot = {
        key: s.key,
        shotType: s.shotType,
        isIndex: s.isIndex,
        master: s.prepared.master,
        masterName: s.prepared.master.name,
        masterType: s.prepared.master.type,
        thumbnail: s.prepared.thumbnail,
        derivative: s.prepared.derivative,
        originalWidth: s.prepared.originalWidth,
        originalHeight: s.prepared.originalHeight,
        rotation: s.prepared.edit.rotation,
        crop: s.prepared.edit.crop,
      }
      store.put(row)
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
      master: new File([row.master], row.masterName, { type: row.masterType }),
      thumbnail: row.thumbnail,
      derivative: row.derivative,
      originalWidth: row.originalWidth,
      originalHeight: row.originalHeight,
      // The previous object URL died with the page: a new one is created.
      preview: URL.createObjectURL(row.thumbnail),
      edit: storedEdit(row),
    },
  }
}
