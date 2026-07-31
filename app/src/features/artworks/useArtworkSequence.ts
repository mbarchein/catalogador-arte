import { useEffect, useRef, useState } from 'react'
import type { Artwork } from '../../lib/types'
import { readArtworksSnapshot, saveArtworksSnapshot } from './artworksCache'
import type { ListView } from './listView'
import { navigationSequence, positionOf, type Position } from './sequence'
import { fetchAllArtworks } from './useArtworks'

/**
 * The sequence the record view walks, and where the record sits in it (RF-311).
 *
 * **It is frozen on entry, on purpose.** The mirror refreshes live — another
 * cataloger creates an artwork, or this one saves the record being read — and
 * with the default order (`RECENT`, by `updated_at`) editing the artwork in
 * front of you sends it to position 1, so «siguiente» would land somewhere the
 * cataloger never asked for. Worse, correcting the very thing a filter selects —
 * photographing an artwork found through «Sin fotografías» — drops it out of its
 * own queue mid-walk. So the queue is built once, from the snapshot present when
 * the record view opened, and it does not move under the finger. Going back to
 * the list and opening another record builds it again.
 *
 * The rows come from the mirror the list left behind, so there is no query here
 * in the normal case. There is one only when the mirror is empty — a cold entry
 * from the printed QR on a device that has not opened the list yet — because a
 * control that silently does nothing is worse than one fetch: it is the same
 * whole-catalog query the list runs on every visit, and it leaves the snapshot
 * warm for it.
 */
export interface ArtworkSequence extends Position {
  /** The mirror the sequence was built from; the record page paints from it. */
  rows: readonly Artwork[]
  /** Row of the previous artwork, for the label of the control. */
  previousRow: Artwork | null
  nextRow: Artwork | null
  /** False when walking the whole catalog because the artwork is not in the list. */
  fromList: boolean
}

const NOTHING: ArtworkSequence = {
  rows: [],
  previous: null,
  next: null,
  previousRow: null,
  nextRow: null,
  index: 0,
  total: 0,
  fromList: false,
}

export function useArtworkSequence(
  view: ListView,
  catalogId: string | undefined,
): ArtworkSequence {
  // The snapshot is read once per visit to the record view, not per record: the
  // component instance survives passing from artwork to artwork (same route),
  // which is exactly the life the frozen queue must have.
  const [rows, setRows] = useState<readonly Artwork[]>(() => readArtworksSnapshot()?.rows ?? [])
  const frozen = useRef<ReturnType<typeof navigationSequence> | null>(null)

  // Cold entry: no mirror on this device. The record itself already loads from
  // its own query; this only brings what the neighbors need.
  const fetching = useRef(false)
  useEffect(() => {
    if (rows.length > 0 || fetching.current) return
    fetching.current = true
    let current = true
    void fetchAllArtworks()
      .then((fetched) => {
        if (!current) return
        setRows(fetched)
        // Keeping the thumbnails already signed: re-signing them would hand out
        // different URLs for the same files and throw away the cached images.
        saveArtworksSnapshot({ rows: fetched, thumbnails: readArtworksSnapshot()?.thumbnails ?? {} })
      })
      .catch(() => {
        // Without neighbors the record still reads perfectly. Nothing to say.
      })
    return () => {
      current = false
    }
  }, [rows.length])

  if (rows.length === 0) return NOTHING

  // Built the first time there are rows to build it with, and kept from then on.
  if (!frozen.current) frozen.current = navigationSequence(rows, view, catalogId)
  const { ids, fromList } = frozen.current

  const position = positionOf(ids, catalogId)
  const rowOf = (id: string | null) =>
    id === null ? null : (rows.find((row) => row.catalog_id === id) ?? null)

  return {
    rows,
    ...position,
    previousRow: rowOf(position.previous),
    nextRow: rowOf(position.next),
    fromList,
  }
}
