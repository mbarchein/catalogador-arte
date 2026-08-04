import { useEffect, useRef, useState } from 'react'
import { readArtworksSnapshot, saveArtworksSnapshot } from '../../artworks/artworksCache'
import { fetchAllArtworks } from '../../artworks/useArtworks'
import type { ArtworkRef } from '../documentaryRows'

/**
 * The catalogue the picker searches: every active artwork, code and title.
 *
 * **It comes from the LOCAL MIRROR, not from a query.** The list already keeps a
 * copy of the whole catalogue in this device and the record page is walking it
 * for its previous/next, so choosing the other artwork of a relationship costs
 * nothing, answers while the finger is still moving, and keeps working with no
 * coverage — which is the difference between registering the pair with both
 * pieces in front of you and writing it on paper for later.
 *
 * The alternative was a `ilike` query per keystroke: a request per letter from a
 * storage room, no accent-insensitive matching, and nothing at all offline.
 *
 * The one case the mirror does not cover is a cold entry — the printed QR on a
 * device that has never opened the list — and it is handled the way
 * `useArtworkSequence` already handles it: fetch once, leave the snapshot warm,
 * and keep the thumbnails that were already signed instead of re-signing them.
 */
export function useCatalogArtworks(): { catalog: readonly ArtworkRef[]; loading: boolean } {
  const [rows, setRows] = useState<readonly ArtworkRef[]>(
    () => readArtworksSnapshot()?.rows ?? [],
  )
  const [loading, setLoading] = useState(false)
  const fetching = useRef(false)

  useEffect(() => {
    if (rows.length > 0 || fetching.current) return
    fetching.current = true
    setLoading(true)
    let alive = true
    void fetchAllArtworks()
      .then((fetched) => {
        saveArtworksSnapshot({
          rows: fetched,
          thumbnails: readArtworksSnapshot()?.thumbnails ?? {},
        })
        if (!alive) return
        setRows(fetched)
      })
      .catch(() => {
        // Nothing to say here: the panel that uses this says it, in one line,
        // where the list of artworks would have been.
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [rows.length])

  return { catalog: rows, loading }
}
