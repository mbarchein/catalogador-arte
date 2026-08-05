/**
 * The artworks that were in one exhibition, with their thumbnails (RF-505).
 *
 * Read-only, and the reason is in `participatingArtworks.ts`: a participation is
 * a fact about an artwork and it is written from the artwork's record, where the
 * research status of its exhibition history is kept coherent. From here it is
 * read, counted and linked.
 *
 * The thumbnails come from `representative_image`, the database view that already
 * decides which photograph represents an artwork — the same view the list of
 * artworks uses. That rule is NOT recomputed here: it moved into the database
 * precisely so the list, the printed catalogue and this block cannot disagree
 * about which photograph is the one.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { signedUrls } from '../../lib/images'
import { supabase } from '../../lib/supabase'
import { exhibitionFailureText } from './exhibitionMessages'
import {
  PARTICIPANT_COLUMNS,
  thumbnailCatalogIds,
  type ParticipantRow,
} from './participatingArtworks'

/**
 * How long a thumbnail's signed URL lasts here: one hour, the default of
 * `signedUrls`.
 *
 * NOT the week the artworks list uses, and the difference is deliberate. That
 * list caches its URLs in `localStorage` so a revisit paints instantly offline,
 * and a short signature would throw the cache away; this block caches nothing and
 * is looked at for as long as one record stays open. An hour is longer than that
 * and shorter than a shared device left unlocked.
 */
const THUMBNAIL_TTL_SECONDS = 3600

export interface ExhibitionArtworksQuery {
  rows: ParticipantRow[]
  /** Signed URL of each artwork's thumbnail, by `catalog_id`. Absent means «no photograph». */
  thumbnails: Record<string, string>
  loading: boolean
  error: string | null
  reload: () => Promise<void>
}

export function useExhibitionArtworks(exhibitionId: string): ExhibitionArtworksQuery {
  const [rows, setRows] = useState<ParticipantRow[]>([])
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  const reload = useCallback(async () => {
    if (exhibitionId === '') return
    const { data, error: failure } = await supabase
      .from('artwork_exhibitions')
      .select(PARTICIPANT_COLUMNS)
      .eq('exhibition_id', exhibitionId)
    if (!alive.current) return
    setLoading(false)
    if (failure) {
      setError(exhibitionFailureText(failure, 'loadArtworks'))
      return
    }
    setError(null)
    const participations = (data ?? []) as unknown as ParticipantRow[]
    setRows(participations)

    // Only the artworks actually listed, and only when there are any: no rows must
    // produce no request at all, not a request to sign an empty list.
    const catalogIds = thumbnailCatalogIds(participations)
    if (catalogIds.length === 0) {
      setThumbnails({})
      return
    }
    // Filtered by identifier and not read whole, unlike the artworks list: a show
    // holds a handful of pieces out of the whole catalogue, and `in` on a handful
    // of codes is far cheaper than the view paginated. RLS still decides what
    // comes back.
    const { data: images } = await supabase
      .from('representative_image')
      .select('catalog_id, thumbnail_path')
      .in('catalog_id', catalogIds)
    if (!alive.current) return
    const paths: Record<string, string> = {}
    for (const row of (images ?? []) as { catalog_id: string; thumbnail_path: string }[]) {
      paths[row.catalog_id] = row.thumbnail_path
    }
    const urls = await signedUrls(Object.values(paths), THUMBNAIL_TTL_SECONDS)
    if (!alive.current) return
    // A thumbnail that could not be signed is simply absent, and the block paints
    // the placeholder: a broken image is worse than an honest empty frame, and an
    // unsigned photograph is not a reason to hide the artwork's code.
    setThumbnails(
      Object.fromEntries(
        Object.entries(paths).flatMap(([catalogId, path]) => {
          const url = urls[path]
          return url === undefined ? [] : [[catalogId, url] as const]
        }),
      ),
    )
  }, [exhibitionId])

  useEffect(() => {
    setLoading(true)
    void reload()
  }, [reload])

  return { rows, thumbnails, loading, error, reload }
}
