import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { signedUrl } from '../../lib/images'
import { useLiveChanges } from '../../lib/live'
import type { ShotTypeValue } from '../../lib/types'

export interface ImageRow {
  image_id: string
  thumbnail_path: string
  derivative_path: string
  master_path: string | null
  shot_type: ShotTypeValue
  index_image: boolean
  photo_date: string | null
  sort_order: number
}

/**
 * The images of an artwork, their signed thumbnail URLs (RF-110: the bucket
 * is private) and which one represents it, kept live. Shared by the record
 * gallery and the photo management page so both always see the same thing.
 *
 * Which image is the main one comes from the `representative_image` view,
 * which applies the RF-403 rule. The client does not recompute it: if it did,
 * the list, the record and the printed catalog could disagree.
 */
export function useArtworkImages(catalogId: string) {
  const [images, setImages] = useState<ImageRow[]>([])
  const [thumbUrls, setThumbUrls] = useState<Record<string, string>>({})
  const [mainId, setMainId] = useState<string | null>(null)
  const [manuallyChosen, setManuallyChosen] = useState(false)
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    const { data } = await supabase
      .from('images')
      .select(
        'image_id, thumbnail_path, derivative_path, master_path, shot_type, index_image, photo_date, sort_order',
      )
      .eq('catalog_id', catalogId)
      .eq('active', true)
      // RF-401: the order the cataloger arranged; the identifier only breaks
      // ties, so two photos never swap places on their own between loads.
      .order('sort_order', { ascending: true })
      .order('image_id', { ascending: true })

    const rows = (data ?? []) as unknown as ImageRow[]
    setImages(rows)

    const { data: rep } = await supabase
      .from('representative_image')
      .select('image_id, manually_chosen')
      .eq('catalog_id', catalogId)
      .maybeSingle()
    const representative = rep as { image_id: string; manually_chosen: boolean } | null
    setMainId(representative?.image_id ?? null)
    setManuallyChosen(representative?.manually_chosen ?? false)

    const pairs = await Promise.all(
      rows.map(async (r) => [r.image_id, await signedUrl(r.thumbnail_path)] as const),
    )
    setThumbUrls(Object.fromEntries(pairs.filter((p): p is [string, string] => p[1] !== null)))
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
