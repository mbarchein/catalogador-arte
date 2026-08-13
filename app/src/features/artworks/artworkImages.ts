import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { cachedSignedPaths, signPaths } from '../../lib/signedPaths'
import { useLiveChanges } from '../../lib/live'
import type { ShotTypeValue } from '../../lib/types'
import { readArtworkImagesSnapshot, saveArtworkImagesSnapshot } from './artworkImagesCache'

export interface ImageRow {
  image_id: string
  thumbnail_path: string
  derivative_path: string
  master_path: string | null
  shot_type: ShotTypeValue
  index_image: boolean
  photo_date: string | null
  sort_order: number
  // Framing applied to the copies that are served, kept as data so it can be
  // reapplied to the master (see imageEdits.ts). The four crop columns are all null
  // or all present, and so are the eight corner ones; the database guarantees both.
  //
  // The corners have to be READ and not only written, which is not obvious and cost
  // a bug: without them here the straightening was stored and never came back, so
  // the editor reopened without it and the summary announced «sin giro ni recorte»
  // over a photograph that was straightened. Whatever field this type declares, the
  // query below has to select.
  rotation: number
  crop_x: number | null
  crop_y: number | null
  crop_width: number | null
  crop_height: number | null
  corner_nw_x: number | null
  corner_nw_y: number | null
  corner_ne_x: number | null
  corner_ne_y: number | null
  corner_se_x: number | null
  corner_se_y: number | null
  corner_sw_x: number | null
  corner_sw_y: number | null
}

/**
 * The images of an artwork, their signed thumbnail URLs (RF-110: the bucket
 * is private) and which one represents it, kept live. Shared by the record
 * gallery and the photo management page so both always see the same thing.
 *
 * Which image is the main one comes from the `representative_image` view,
 * which applies the RF-403 rule. The client does not recompute it: if it did,
 * the list, the record and the printed catalog could disagree.
 *
 * It paints from the mirror and refreshes behind, like the artworks list: a record
 * visited before opens with its photographs already there, and the query only corrects.
 * See `artworkImagesCache.ts`.
 */
export function useArtworkImages(catalogId: string) {
  // Read ONCE per record: the gallery remounts per record (the swipe area is keyed by
  // catalog_id), and reading `localStorage` on every repaint to paint four thumbnails
  // would be paying for it on each gesture.
  const mirrored = useRef(readArtworkImagesSnapshot(catalogId)).current
  const [images, setImages] = useState<ImageRow[]>(mirrored?.rows ?? [])
  // The signatures WITHOUT waiting: `signPaths` is a promise, so even with everything
  // cached the screen paints once before it resolves, and in that frame the thumbnails
  // have no `src` — which is the blink. What is missing is corrected below.
  const [thumbUrls, setThumbUrls] = useState<Record<string, string>>(() => {
    if (!mirrored) return {}
    const urls = cachedSignedPaths(mirrored.rows.map((r) => r.thumbnail_path))
    return Object.fromEntries(
      mirrored.rows
        .map((r) => [r.image_id, urls[r.thumbnail_path]] as const)
        .filter((pair): pair is [string, string] => pair[1] !== undefined),
    )
  })
  const [mainId, setMainId] = useState<string | null>(mirrored?.mainId ?? null)
  const [manuallyChosen, setManuallyChosen] = useState(mirrored?.manuallyChosen ?? false)
  // Waiting only when there is nothing to paint: with a mirror the gallery is on screen
  // from the first frame, and the grey placeholder would be a blink of its own.
  const [loading, setLoading] = useState(mirrored === null)

  const reload = useCallback(async () => {
    // ── BOTH AT ONCE, NOT ONE AFTER THE OTHER ───────────────────
    //
    // Which photographs there are and which one is the cover are two independent
    // questions: the `representative_image` view needs nothing from the first query. In
    // series they were two round trips back to back, and on mobile data in a storeroom
    // that is between half a second and three seconds of a record with its text painted
    // and the photo gaps empty — which is what was seen, because the artwork's data does
    // paint instantly, off the list's mirror.
    //
    // The signatures no longer cost network (see `signPaths`), so this wait was **all**
    // the wait. The one thing it does not fix is the first visit to a record: there it
    // still has to ask, but once and not twice.
    const [imagesAnswer, repAnswer] = await Promise.all([
      supabase
        .from('images')
        .select(
          'image_id, thumbnail_path, derivative_path, master_path, shot_type, index_image, ' +
            'photo_date, sort_order, rotation, crop_x, crop_y, crop_width, crop_height, ' +
            'corner_nw_x, corner_nw_y, corner_ne_x, corner_ne_y, ' +
            'corner_se_x, corner_se_y, corner_sw_x, corner_sw_y',
        )
        .eq('catalog_id', catalogId)
        .eq('active', true)
        // RF-401: the order the cataloger arranged; the identifier only breaks
        // ties, so two photos never swap places on their own between loads.
        .order('sort_order', { ascending: true })
        .order('image_id', { ascending: true }),
      supabase
        .from('representative_image')
        .select('image_id, manually_chosen')
        .eq('catalog_id', catalogId)
        .maybeSingle(),
    ])

    const rows = (imagesAnswer.data ?? []) as unknown as ImageRow[]
    // A NEW array on every answer, deliberately, even when it carries the same rows:
    // «the rows were read again» is what `usePhotoDetails` depends on to read the columns
    // this query does not ask for. Handing back the previous array when nothing changed
    // would save a small request per visit and break the one action that changes only
    // those columns — annotating that a colour was reviewed and left alone, which is what
    // tells «revisado» from «sin revisar».
    setImages(rows)

    const representative = repAnswer.data as {
      image_id: string
      manually_chosen: boolean
    } | null
    setMainId(representative?.image_id ?? null)
    setManuallyChosen(representative?.manually_chosen ?? false)
    saveArtworkImagesSnapshot(catalogId, {
      rows,
      mainId: representative?.image_id ?? null,
      manuallyChosen: representative?.manually_chosen ?? false,
    })

    // One request for all of them, and none at all if they were already signed:
    // `signPaths` keeps the signatures by path and for a week. It used to be one request
    // per thumbnail and for one hour, so reopening the record asked for them all again
    // —and with no coverage none of them showed, even with the bytes on the phone,
    // because with no signature there is no `src` to look up in the cache—.
    const urls = await signPaths(rows.map((r) => r.thumbnail_path))
    setThumbUrls(
      Object.fromEntries(
        rows
          .map((r) => [r.image_id, urls[r.thumbnail_path]] as const)
          .filter((p): p is [string, string] => p[1] !== undefined),
      ),
    )
    setLoading(false)
    return { rows, main: representative?.image_id ?? null }
  }, [catalogId])

  // Photos another cataloger adds or retires appear without reloading.
  useLiveChanges('images', () => void reload(), `catalog_id=eq.${catalogId}`)

  useEffect(() => {
    void reload()
  }, [reload])

  return { images, thumbUrls, mainId, manuallyChosen, loading, reload }
}

// The per-image derivative loading lives in PhotoCarousel, which fetches the
// viewed slide and its neighbors.
