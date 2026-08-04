/**
 * The thumbnail of each related artwork, decided without a DOM and without a
 * request.
 *
 * A related artwork is shown with its picture when it has one (RF-403 decides
 * WHICH picture, in the `representative_image` view, and the client never
 * recomputes it: the list, the record and the printed catalogue cannot be allowed
 * to disagree about which photograph represents an artwork).
 *
 * Two sources, and the order between them is the whole point:
 *
 *   · the MIRROR the list left behind, whose thumbnails are already signed for a
 *     week — so the block paints instantly, and it paints in a storage room with
 *     no coverage;
 *   · the query, which corrects it — a main photograph changed since the mirror
 *     was written is a different path, and a path is a file forever.
 *
 * Reusing a still-valid URL is not a micro-optimisation: a new signature is a
 * new URL, and a new URL is a cache miss for every image the browser already
 * downloaded (see `thumbnailsToSign`).
 */

import type { CachedThumbnail } from '../../artworks/artworksCache'

/**
 * What the mirror can already show, out of the artworks this block needs.
 *
 * `readArtworksSnapshot` has dropped the expired signatures before this is
 * called, so whatever is here works. An artwork with no photograph is simply
 * absent — the row shows its placeholder, which is a different thing from a
 * broken image.
 */
export function seededThumbnails(
  cached: Record<string, CachedThumbnail>,
  catalogIds: readonly string[],
): Record<string, string> {
  const urls: Record<string, string> = {}
  for (const catalogId of catalogIds) {
    const hit = cached[catalogId]
    if (hit) urls[catalogId] = hit.url
  }
  return urls
}

/**
 * The URL of each related artwork's thumbnail, once the query has said which
 * file represents it and the freshly signed ones have arrived.
 *
 * A cached URL survives ONLY when it points at the same file: after a new main
 * photograph the cached one is a picture of the right artwork and the wrong
 * shot, which is exactly the kind of quiet wrongness a catalogue cannot carry.
 * And when the signing fails, what already works stays — an expired URL is a
 * broken image, a missing one is the placeholder, and the placeholder is honest.
 */
export function relatedThumbnailUrls(
  paths: Record<string, string>,
  cached: Record<string, CachedThumbnail>,
  fresh: Record<string, string>,
): Record<string, string> {
  const urls: Record<string, string> = {}
  for (const [catalogId, path] of Object.entries(paths)) {
    const signed = fresh[path]
    const hit = cached[catalogId]
    if (signed) urls[catalogId] = signed
    else if (hit && hit.path === path) urls[catalogId] = hit.url
  }
  return urls
}

/**
 * The identity of a set of codes, for the dependency of the effect that loads
 * them.
 *
 * The array is rebuilt on every render of the record and depending on it would
 * query on every render; sorted and joined, the same artworks are the same key
 * however the list is ordered.
 */
export function thumbnailKey(catalogIds: readonly string[]): string {
  return [...catalogIds].sort().join(' ')
}
