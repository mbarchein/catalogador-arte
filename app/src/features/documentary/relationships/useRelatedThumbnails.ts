import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { signedUrls } from '../../../lib/images'
import { readArtworksSnapshot, thumbnailsToSign } from '../../artworks/artworksCache'
import { relatedThumbnailUrls, seededThumbnails, thumbnailKey } from './relatedThumbnails'

/**
 * How long the signature of a thumbnail lasts. A week, the same as the list's,
 * and for the same reason (RF-110): the URL is the cache key of an image the
 * browser already downloaded, so re-signing on every visit throws away every
 * cached thumbnail. The value is repeated and not imported because the list keeps
 * it private; the trade is the same and it is bounded — a thumbnail is 400 px,
 * and the bucket stays private.
 */
const THUMBNAIL_URL_TTL_SECONDS = 7 * 24 * 60 * 60

/**
 * The thumbnail of each related artwork, by catalogue code.
 *
 * It paints from the mirror first and corrects itself with the query, which is
 * what makes the block usable offline and instant online. The decisions —
 * which URL survives, which file has to be signed again — are pure and live in
 * `relatedThumbnails.ts`; what is here is the request.
 *
 * A handful of codes, so the filter is an `in(...)` and not the whole view: the
 * list reads it whole because it needs hundreds, and a record needs the three
 * artworks in front of it.
 */
export function useRelatedThumbnails(catalogIds: readonly string[]): Record<string, string> {
  const key = thumbnailKey(catalogIds)
  // Read once per mount: the mirror does not change while a record is open, and
  // reading localStorage on every render to paint three thumbnails would be
  // paying for it sixty times a swipe.
  const cached = useRef(readArtworksSnapshot()?.thumbnails ?? {}).current

  const ids = useMemo(() => (key === '' ? [] : key.split(' ')), [key])
  const [urls, setUrls] = useState<Record<string, string>>(() => seededThumbnails(cached, ids))

  useEffect(() => {
    // The seed is re-applied on a change of artworks: without it, passing from a
    // record with photographs to one without would keep showing the previous
    // artwork's pictures until the query answers.
    setUrls(seededThumbnails(cached, ids))
    if (ids.length === 0) return

    let alive = true
    void (async () => {
      const { data, error } = await supabase
        .from('representative_image')
        .select('catalog_id, thumbnail_path')
        .in('catalog_id', ids)
      // Nothing is said on failure: the row already carries the code, the title
      // and the link, and a missing picture is not a missing datum. The seed, if
      // there was one, stays.
      if (error || !alive) return

      const paths: Record<string, string> = {}
      for (const row of (data ?? []) as { catalog_id: string; thumbnail_path: string }[]) {
        paths[row.catalog_id] = row.thumbnail_path
      }
      const stale = thumbnailsToSign(paths, cached)
      const fresh = stale.length > 0 ? await signedUrls(stale, THUMBNAIL_URL_TTL_SECONDS) : {}
      if (!alive) return
      setUrls(relatedThumbnailUrls(paths, cached, fresh))
    })()

    return () => {
      alive = false
    }
  }, [cached, ids])

  return urls
}
