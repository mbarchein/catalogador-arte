import { describe, expect, it } from 'vitest'
import {
  readArtworksSnapshot,
  saveArtworksSnapshot,
  thumbnailsToSign,
  type ArtworksSnapshot,
  type CachedThumbnail,
} from './artworksCache'
import type { Artwork } from '../../lib/types'

/** Minimal in-memory Storage, like the one batch.test.ts uses. */
function memoryStorage(initial: Record<string, string> = {}): Storage {
  const data = new Map(Object.entries(initial))
  return {
    get length() {
      return data.size
    },
    clear: () => data.clear(),
    getItem: (k: string) => data.get(k) ?? null,
    key: (i: number) => [...data.keys()][i] ?? null,
    removeItem: (k: string) => void data.delete(k),
    setItem: (k: string, v: string) => void data.set(k, v),
  }
}

const ARTWORK = { catalog_id: 'AR-0001' } as Artwork
const HOUR = 60 * 60 * 1000

function snapshot(thumbnails: Record<string, CachedThumbnail>): ArtworksSnapshot {
  return { rows: [ARTWORK], thumbnails }
}

describe('artworks snapshot (instant paint of the list)', () => {
  it('round-trips rows and thumbnails', () => {
    const storage = memoryStorage()
    const now = 1_000_000
    const thumb = { path: 'AR-0001/a_min.webp', url: 'https://x/y?token=1', expiresAt: now + HOUR }
    saveArtworksSnapshot(snapshot({ 'AR-0001': thumb }), storage)

    const read = readArtworksSnapshot(storage, now)
    expect(read?.rows).toHaveLength(1)
    expect(read?.thumbnails['AR-0001']).toEqual(thumb)
  })

  it('drops the thumbnail whose signature already expired', () => {
    const storage = memoryStorage()
    const now = 1_000_000
    saveArtworksSnapshot(
      snapshot({
        'AR-0001': { path: 'p', url: 'u', expiresAt: now - 1 },
        'AR-0002': { path: 'q', url: 'v', expiresAt: now + HOUR },
      }),
      storage,
    )
    const read = readArtworksSnapshot(storage, now)
    // The rows survive: only the URL went stale, not the catalog.
    expect(read?.rows).toHaveLength(1)
    expect(read?.thumbnails).toEqual({
      'AR-0002': { path: 'q', url: 'v', expiresAt: now + HOUR },
    })
  })

  it('discards a snapshot written by another version', () => {
    const storage = memoryStorage({
      'catalogador.artworks-mirror': JSON.stringify({ v: 1, rows: [ARTWORK] }),
    })
    expect(readArtworksSnapshot(storage, 0)).toBeNull()
  })

  it('discards a foreign shape instead of breaking the list', () => {
    expect(readArtworksSnapshot(memoryStorage(), 0)).toBeNull()
    expect(
      readArtworksSnapshot(memoryStorage({ 'catalogador.artworks-mirror': 'basura' }), 0),
    ).toBeNull()
  })

  it('tolerates thumbnails of an unexpected shape', () => {
    const storage = memoryStorage({
      'catalogador.artworks-mirror': JSON.stringify({
        v: 3,
        rows: [ARTWORK],
        thumbnails: { 'AR-0001': { path: 'p' }, 'AR-0002': 42 },
      }),
    })
    expect(readArtworksSnapshot(storage, 0)?.thumbnails).toEqual({})
  })
})

describe('thumbnailsToSign (RF-604: only what changed is signed again)', () => {
  const now = 10_000_000
  const valid = (path: string): CachedThumbnail => ({
    path,
    url: 'https://x/' + path,
    expiresAt: now + 7 * 24 * HOUR,
  })

  it('signs nothing when every thumbnail is cached and fresh', () => {
    expect(thumbnailsToSign({ 'AR-0001': 'p' }, { 'AR-0001': valid('p') }, now)).toEqual([])
  })

  it('signs the artwork that had no thumbnail yet', () => {
    expect(thumbnailsToSign({ 'AR-0001': 'p' }, {}, now)).toEqual(['p'])
  })

  it('signs when the main image changed: a different photo is a different path', () => {
    expect(thumbnailsToSign({ 'AR-0001': 'nueva' }, { 'AR-0001': valid('vieja') }, now)).toEqual([
      'nueva',
    ])
  })

  it('signs again before the signature expires, not after', () => {
    const almost: CachedThumbnail = { path: 'p', url: 'u', expiresAt: now + HOUR }
    expect(thumbnailsToSign({ 'AR-0001': 'p' }, { 'AR-0001': almost }, now)).toEqual(['p'])
  })

  it('does not repeat a path shared by two artworks', () => {
    expect(thumbnailsToSign({ 'AR-0001': 'p', 'AR-0002': 'p' }, {}, now)).toEqual(['p'])
  })
})
