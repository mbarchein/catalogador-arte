import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { signedUrls } from '../../lib/images'
import type { ArtistFund, Artwork } from '../../lib/types'
import { DEFAULT_VIEW, matchesSearch, matchesView, sortArtworks, type ListView } from './listView'
import {
  readArtworksSnapshot,
  saveArtworksSnapshot,
  thumbnailsToSign,
  type CachedThumbnail,
} from './artworksCache'

const FIELDS = `
  catalog_id, artist, title, attributed_title, artwork_type,
  execution_date, start_year, end_year, approximate_date, unconfirmed_date, date_note,
  technique, support,
  height_cm, width_cm, depth_cm,
  signed, signature_description, dated_on_artwork,
  conservation_status, physical_location, existence_status,
  photographed, measurements_verified, inventory_phase_completed, documentation_phase_completed,
  catalog_record_complete, inventory_process_notes,
  updated_at, basic_updated_at, updated_by, active
`

/** Page size of the mirror fetch: the API caps a single response. */
const PAGE = 500

/**
 * How long a thumbnail's signed URL lasts. A week, unlike the hour used for
 * the derivative and the master (RF-110): the URL is the cache key of the
 * image the browser already downloaded, so re-signing on every visit would
 * throw away every cached thumbnail. The trade is bounded — a thumbnail is
 * 400 px, the level with the least to leak, and the bucket stays private.
 */
const THUMBNAIL_URL_TTL_SECONDS = 7 * 24 * 60 * 60

/**
 * The whole active catalog, paged so no row is silently dropped by the API
 * cap (RF-602). RF-609: deactivated records do not appear in the list. The
 * RLS policy already hides them from the Reader, but a cataloger does see
 * them, so the explicit filter is needed here too.
 */
async function fetchAllArtworks(): Promise<Artwork[]> {
  const all: Artwork[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('artworks')
      .select(FIELDS)
      .eq('active', true)
      .order('catalog_id', { ascending: true })
      .range(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    const rows = (data ?? []) as unknown as Artwork[]
    all.push(...rows)
    if (rows.length < PAGE) return all
  }
}

/**
 * The list works over a LOCAL MIRROR of the catalog: filtering, ordering and
 * searching are instant because they never leave the device. The mirror
 * paints from the persisted snapshot, refreshes in the background on mount,
 * and again on every Realtime push (the page subscribes with useLiveChanges
 * and calls `reload`). A few hundred records make this cheap; the paged
 * fetch keeps it correct if the catalog outgrows a single response.
 */
export function useArtworks(search: string, view: ListView = DEFAULT_VIEW) {
  const snapshot = useRef(readArtworksSnapshot()).current
  const [all, setAll] = useState<Artwork[] | null>(snapshot?.rows ?? null)
  // Thumbnails paint from the snapshot: their URLs are the ones handed out
  // before, so the browser reuses the images it already has instead of
  // downloading the whole index again.
  const [thumbnails, setThumbnails] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      Object.entries(snapshot?.thumbnails ?? {}).map(([id, t]) => [id, t.url]),
    ),
  )
  const [error, setError] = useState<string | null>(null)

  const rowsRef = useRef<Artwork[] | null>(all)
  rowsRef.current = all
  const cachedRef = useRef<Record<string, CachedThumbnail>>(snapshot?.thumbnails ?? {})

  /**
   * Refreshes which image represents each artwork (RF-403, decided by the
   * `representative_image` view) and signs only what changed: a new main
   * image, a photo added or retired, or a signature about to expire. An
   * unchanged thumbnail keeps its URL, which is what makes the revisit free.
   */
  const refreshThumbnails = useCallback(async () => {
    const rows = rowsRef.current
    if (!rows || rows.length === 0) {
      cachedRef.current = {}
      setThumbnails({})
      return
    }

    // The whole view, not filtered by identifier: RLS already limits it to
    // what this session may read, and a list of hundreds of identifiers in
    // the query string would eventually outgrow the URL.
    const paths: Record<string, string> = {}
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from('representative_image')
        .select('catalog_id, thumbnail_path')
        .order('catalog_id', { ascending: true })
        .range(from, from + PAGE - 1)
      if (error) return
      const page = (data ?? []) as { catalog_id: string; thumbnail_path: string }[]
      for (const r of page) paths[r.catalog_id] = r.thumbnail_path
      if (page.length < PAGE) break
    }

    const stalePaths = thumbnailsToSign(paths, cachedRef.current)
    const fresh = stalePaths.length > 0 ? await signedUrls(stalePaths, THUMBNAIL_URL_TTL_SECONDS) : {}
    const expiresAt = Date.now() + THUMBNAIL_URL_TTL_SECONDS * 1000

    const next: Record<string, CachedThumbnail> = {}
    for (const [catalogId, path] of Object.entries(paths)) {
      const cached = cachedRef.current[catalogId]
      const url = fresh[path]
      if (url) {
        next[catalogId] = { path, url, expiresAt }
      } else if (cached && cached.path === path) {
        // Nothing to sign, or the signing failed: what works stays.
        next[catalogId] = cached
      }
    }

    cachedRef.current = next
    setThumbnails(Object.fromEntries(Object.entries(next).map(([id, t]) => [id, t.url])))
    saveArtworksSnapshot({ rows, thumbnails: next })
  }, [])

  const reload = useCallback(async () => {
    try {
      const rows = await fetchAllArtworks()
      setAll(rows)
      rowsRef.current = rows
      saveArtworksSnapshot({ rows, thumbnails: cachedRef.current })
      setError(null)
      await refreshThumbnails()
    } catch (e) {
      // The stale mirror stays on screen: outdated data plus a notice beats
      // an empty list in a storage room with intermittent coverage.
      setError(e instanceof Error ? e.message : String(e))
      setAll((current) => current ?? [])
    }
  }, [refreshThumbnails])

  useEffect(() => {
    void reload()
  }, [reload])

  // The view travels field by field: its object identity changes on every
  // parse of the URL, and depending on it would refilter on each render.
  const artworks = useMemo(() => {
    if (!all) return []
    const term = search.trim()
    const rows = all.filter((a) => matchesView(a, view) && matchesSearch(a, term))
    return sortArtworks(rows, view.order)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all, search, view.funds.join(','), view.types.join(','), view.status, view.order])

  // Loading only when there is no snapshot at all: with one, the list paints
  // instantly and the refresh happens behind it.
  //
  // `refreshThumbnails` is exposed so the page can react to photo changes
  // (Realtime on `images`) without refetching the whole mirror: adding,
  // retiring or re-marking a photo changes which image represents the artwork,
  // not the artwork's own data.
  return { artworks, thumbnails, loading: all === null, error, reload, refreshThumbnails }
}

export function useArtwork(id: string | undefined) {
  const [artwork, setArtwork] = useState<Artwork | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    if (!id) return
    setLoading(true)
    const { data, error } = await supabase
      .from('artworks')
      .select(FIELDS)
      .eq('catalog_id', id)
      .maybeSingle()
    if (error) setError(error.message)
    setArtwork((data ?? null) as unknown as Artwork | null)
    setLoading(false)
  }, [id])

  useEffect(() => {
    void reload()
  }, [reload])

  return { artwork, loading, error, reload }
}

/**
 * Previews the identifier that would be assigned (DP-01). It does not reserve
 * it: between the query and the save, another cataloger may have created a
 * record. The final number is set by the database, with a per-fund lock, and
 * is the one the insert returns.
 */
export async function previewId(artist: ArtistFund): Promise<string | null> {
  const { data, error } = await supabase.rpc('next_catalog_id', { p_artist: artist })
  return error ? null : (data as string)
}
