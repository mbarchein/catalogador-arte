import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { signedUrls } from '../../lib/images'
import type { ArtistFund, Artwork } from '../../lib/types'
import { DEFAULT_VIEW, compareByTitle, queryPlan, type ListView } from './listView'

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

export function useArtworks(search: string, view: ListView = DEFAULT_VIEW) {
  const [artworks, setArtworks] = useState<Artwork[]>([])
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)

    // The view→query mapping lives in listView.ts, where it has tests. This
    // hook only walks the plan.
    const plan = queryPlan(view)

    let query = supabase
      .from('artworks')
      .select(FIELDS)
      // RF-609: deactivated records do not appear in the list. The RLS policy
      // already hides them from the Reader, but a cataloger does see them, so
      // the explicit filter is needed here too.
      .eq('active', true)

    // RF-602: the filters travel in the query, they do not prune in the
    // client — the API caps the response (500 rows), and a client-side filter
    // over a capped page would silently drop matches.
    for (const f of plan.filters) {
      query = query.eq(f.column, f.value)
    }
    for (const o of plan.orders) {
      query = query.order(o.column, {
        ascending: o.ascending,
        ...(o.nullsFirst === undefined ? {} : { nullsFirst: o.nullsFirst }),
      })
    }

    const term = search.trim()
    if (term !== '') {
      // RF-602: free-text search looks at identifier and title.
      // `titulos_alt` will be added when the field exists.
      const pattern = `%${term}%`
      query = query.or(`catalog_id.ilike.${pattern},title.ilike.${pattern}`)
    }

    const { data, error } = await query
    if (error) {
      setError(error.message)
      setArtworks([])
      setThumbnails({})
      setLoading(false)
      return
    }

    let rows = (data ?? []) as unknown as Artwork[]
    // Title order finishes in the client: es-ES collation with the untitled
    // last, which the API's order clause cannot express (see listView.ts).
    if (plan.sortInClient) rows = [...rows].sort(compareByTitle)
    setArtworks(rows)
    // The list can already be painted: thumbnails arrive later and appear over
    // the placeholders. Waiting for them would delay seeing the data, which is
    // what one came for.
    setLoading(false)

    // RF-604: thumbnail in the list. Three requests in total, regardless of
    // how many artworks there are:
    //   1. the artworks (already done),
    //   2. the view with each one's representative image,
    //   3. the signature of every path at once.
    // The rule of which image represents the artwork lives in the view, not
    // here.
    const ids = rows.map((a) => a.catalog_id)
    if (ids.length === 0) {
      setThumbnails({})
      return
    }

    const { data: representatives } = await supabase
      .from('representative_image')
      .select('catalog_id, thumbnail_path')
      .in('catalog_id', ids)

    const repRows = (representatives ?? []) as { catalog_id: string; thumbnail_path: string }[]
    const urls = await signedUrls(repRows.map((r) => r.thumbnail_path))
    setThumbnails(
      Object.fromEntries(
        repRows.flatMap((r) => {
          const u = urls[r.thumbnail_path]
          return u ? [[r.catalog_id, u] as const] : []
        }),
      ),
    )
    // The view travels field by field: its object identity changes on every
    // parse of the URL, and depending on it would refetch on each render.
  }, [search, view.fund, view.type, view.status, view.order])

  useEffect(() => {
    void reload()
  }, [reload])

  return { artworks, thumbnails, loading, error, reload }
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
