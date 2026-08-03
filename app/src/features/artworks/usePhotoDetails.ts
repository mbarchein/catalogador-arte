import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { ImageRow } from './artworkImages'
import { PHOTO_DETAIL_COLUMNS, provenanceOf, type PhotoDetailRow } from './photoDetails'

/**
 * The columns of the photographs that the gallery's query does not ask for: the
 * colour, the date the file carries, the size of the original, the provenance and the
 * state of the full-resolution copy (see photoDetails.ts for why they are read
 * separately).
 *
 * It lives in its own file, and not inside the photo management page where it was
 * born, because the RECORD needs it too: offering the corrected copy of RF-420 means
 * knowing whether there is one, and that answer is in these columns. Copying the query
 * into the gallery would have been a second place to forget a column — and the record
 * is exactly the screen the Reader sees, the one RF-411 exists for.
 *
 * Not in `photoDetails.ts` either: that module is pure and is tested as such, and
 * importing React and the Supabase client into it would drag a client into the tests
 * of a function that only builds sentences.
 *
 * Reloaded whenever the gallery's rows are replaced, which happens on mount, after
 * every action of the management screen and whenever Realtime says somebody else
 * touched a photograph — `useArtworkImages` hands back a NEW array each time it
 * reloads, so depending on it is depending on «the rows were read again».
 * Deliberately not a second `useLiveChanges` on the same table: two channels with the
 * same topic name for the same filter is a fight over the same subscription, and there
 * is nothing here to learn that the reload does not already bring.
 *
 * `error` is not decoration. These columns decide whether the colour panel is offered
 * (RF-417) and, above all, they are WRITTEN BACK on every save: the fourteen colour
 * columns travel inside `editToColumns`, so a save built on a row that could not be
 * read would quietly overwrite a real adjustment with the identity. What depends on
 * that is not this display but `openEditor`, which reads the row again on its own and
 * refuses to open without it. On the record it decides something smaller and just as
 * necessary: whether the missing corrected copy is «no hay» or «no lo sé».
 */
export function usePhotoDetails(catalogId: string, images: readonly ImageRow[], loading: boolean) {
  const [details, setDetails] = useState<Record<string, PhotoDetailRow>>({})
  const [error, setError] = useState(false)

  useEffect(() => {
    if (loading) return
    if (images.length === 0) {
      setDetails({})
      setError(false)
      return
    }
    let current = true
    void supabase
      .from('images')
      .select(PHOTO_DETAIL_COLUMNS)
      .eq('catalog_id', catalogId)
      .eq('active', true)
      .then(({ data, error: failure }) => {
        if (!current) return
        setError(failure !== null)
        const rows = (data ?? []) as unknown as PhotoDetailRow[]
        setDetails(
          Object.fromEntries(
            rows.map((row) => [row.image_id, { ...row, provenance: provenanceOf(row.provenance) }]),
          ),
        )
      })
    return () => {
      current = false
    }
  }, [catalogId, images, loading])

  return { details, detailsFailed: error }
}
