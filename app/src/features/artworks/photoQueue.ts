import type { PreparedShot } from '../../lib/images'
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
 *
 * DATABASE, STORE AND RECORD FIELD NAMES ARE LEGACY, ON PURPOSE. They are the
 * on-disk format already written on users' phones: renaming them would require
 * an IndexedDB version migration whose only reward is prettier names in a blob
 * nobody reads. The English view of a row is `StoredShot`; the persisted shape
 * is `StoredShotRow`.
 */

const DB_NAME = 'catalogador'
const STORE = 'cola-fotos'
const VERSION = 1

/** Persisted row shape (legacy field names — data at rest, not code). */
interface StoredShotRow {
  clave: string
  /** May hold a pre-rename legacy value: normalized on read. */
  tipoToma: string
  esIndice: boolean
  master: Blob
  nombreMaster: string
  tipoMaster: string
  miniatura: Blob
  derivada: Blob
  anchoOriginal: number
  altoOriginal: number
}

/**
 * A queue written before the enum rename may carry the old Spanish shot-type
 * values. Losing the pending photos over a label would be absurd: they are
 * mapped to the current values, and anything unknown falls back to 'GENERAL',
 * which is the capture default.
 */
const LEGACY_SHOT_TYPES: Record<string, ShotTypeValue> = {
  DETALLE_FIRMA: 'SIGNATURE_DETAIL',
  REVERSO: 'BACK',
  DETALLE_DANO: 'DAMAGE_DETAIL',
  MARCO: 'FRAME',
  OTRO: 'OTHER',
}

const SHOT_TYPES: readonly ShotTypeValue[] = [
  'GENERAL', 'SIGNATURE_DETAIL', 'BACK', 'DAMAGE_DETAIL', 'FRAME', 'OTHER',
]

function normalizeShotType(value: string): ShotTypeValue {
  if ((SHOT_TYPES as readonly string[]).includes(value)) return value as ShotTypeValue
  return LEGACY_SHOT_TYPES[value] ?? 'GENERAL'
}

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
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'clave' })
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
      const row: StoredShotRow = {
        clave: s.key,
        tipoToma: s.shotType,
        esIndice: s.isIndex,
        master: s.prepared.master,
        nombreMaster: s.prepared.master.name,
        tipoMaster: s.prepared.master.type,
        miniatura: s.prepared.thumbnail,
        derivada: s.prepared.derivative,
        anchoOriginal: s.prepared.originalWidth,
        altoOriginal: s.prepared.originalHeight,
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
    const rows = await await_(tx.objectStore(STORE).getAll() as IDBRequest<StoredShotRow[]>)
    db.close()
    // The shape of what comes back is checked: a queue written by a previous
    // version cannot prevent cataloging today.
    return rows
      .filter(
        (r): r is StoredShotRow =>
          typeof r?.clave === 'string' && r.master instanceof Blob && r.miniatura instanceof Blob,
      )
      .map((r) => ({
        key: r.clave,
        shotType: normalizeShotType(r.tipoToma),
        isIndex: r.esIndice,
        master: r.master,
        masterName: r.nombreMaster,
        masterType: r.tipoMaster,
        thumbnail: r.miniatura,
        derivative: r.derivada,
        originalWidth: r.anchoOriginal,
        originalHeight: r.altoOriginal,
      }))
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
    },
  }
}
