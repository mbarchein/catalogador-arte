import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { signedUrls } from '../../lib/images'
import type { ArtistFund, Artwork } from '../../lib/types'
import { DEFAULT_VIEW, matchesSearch, matchesView, sortArtworks, type ListView } from './listView'
import { readArtworksSnapshot, saveArtworksSnapshot } from './artworksCache'

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
  const [all, setAll] = useState<Artwork[] | null>(() => readArtworksSnapshot())
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    try {
      const rows = await fetchAllArtworks()
      setAll(rows)
      saveArtworksSnapshot(rows)
      setError(null)
    } catch (e) {
      // The stale mirror stays on screen: outdated data plus a notice beats
      // an empty list in a storage room with intermittent coverage.
      setError(e instanceof Error ? e.message : String(e))
      setAll((current) => current ?? [])
    }
  }, [])

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

  // RF-604: thumbnails for the WHOLE mirror, once per refresh — filtering
  // never refetches signatures. Two requests regardless of size: the view
  // with each artwork's representative image, and the signature of every
  // path at once.
  useEffect(() => {
    if (!all || all.length === 0) {
      setThumbnails({})
      return
    }
    let current = true
    void (async () => {
      const { data: representatives } = await supabase
        .from('representative_image')
        .select('catalog_id, thumbnail_path')
        .in('catalog_id', all.map((a) => a.catalog_id))

      const repRows = (representatives ?? []) as { catalog_id: string; thumbnail_path: string }[]
      const urls = await signedUrls(repRows.map((r) => r.thumbnail_path))
      if (!current) return
      setThumbnails(
        Object.fromEntries(
          repRows.flatMap((r) => {
            const u = urls[r.thumbnail_path]
            return u ? [[r.catalog_id, u] as const] : []
          }),
        ),
      )
    })()
    return () => {
      current = false
    }
  }, [all])

  // Loading only when there is no snapshot at all: with one, the list paints
  // instantly and the refresh happens behind it.
  return { artworks, thumbnails, loading: all === null, error, reload }
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
