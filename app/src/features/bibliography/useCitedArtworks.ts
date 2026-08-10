/**
 * The artworks that cite a reference (RF-506, RF-504).
 *
 * It is the mirror query of the one an artwork's record makes: that one asks for the
 * citations of a `catalog_id` with the reference embedded, and this one asks for the citations of a
 * reference with the artwork embedded. Two queries and not one, because they are two different
 * questions and each one embeds the end the other already has.
 *
 * **With no thumbnails, and not to save**: RF-506 says so. Here the row answers «on which
 * page does it appear?», which is a question of text; in an exhibition's record there ARE
 * some because there what is recognised is the wall. Incidentally, this screen signs
 * no URL and downloads not a byte of image.
 *
 * What is shown and in what order is decided by `referenceRecord.ts`, which is pure and has
 * tests. Here is the wiring.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { referenceFailureText } from '../documentary/bibliography/referenceEdit'
import { CITED_ARTWORK_COLUMNS, type CitedArtworkRow } from './referenceRecord'

export interface CitedArtworksQuery {
  rows: CitedArtworkRow[]
  loading: boolean
  error: string | null
  reload: () => Promise<void>
}

export function useCitedArtworks(bibliographyId: string): CitedArtworksQuery {
  const [rows, setRows] = useState<CitedArtworkRow[]>([])
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
    if (bibliographyId === '') {
      setLoading(false)
      return
    }
    const { data, error: failure } = await supabase
      .from('artwork_bibliography')
      .select(CITED_ARTWORK_COLUMNS)
      .eq('bibliography_id', bibliographyId)
    if (!alive.current) return
    setLoading(false)
    if (failure) {
      setError(referenceFailureText(failure))
      return
    }
    setError(null)
    // No `order` in the query: the block's order is that of the cataloguing identifier
    // and it is decided in `sortCitedArtworks`, where it is pure and tested.
    setRows((data ?? []) as unknown as CitedArtworkRow[])
  }, [bibliographyId])

  useEffect(() => {
    void reload()
  }, [reload])

  return { rows, loading, error, reload }
}
