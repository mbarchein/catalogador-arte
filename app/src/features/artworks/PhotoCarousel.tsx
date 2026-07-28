import { useEffect, useRef, useState } from 'react'
import { signedUrl } from '../../lib/images'
import { SHOT_TYPE_LABEL } from '../../lib/types'
import type { ImageRow } from './artworkImages'

/**
 * Native scroll-snap carousel over an artwork's derivatives, shared by the
 * record gallery and the photo management page: swiping slides the neighbor
 * in from offscreen with the system's own physics, no animation library.
 *
 * Selection flows both ways: swiping reports the settled slide through
 * `onView`, and changing `viewId` from outside (a thumbnail tap) scrolls the
 * carousel there. Only the viewed derivative and its two neighbors are
 * fetched — fetching all of them would spend data on what nobody opened; the
 * other slides show their thumbnail meanwhile (RF-110: everything signed, the
 * bucket is private).
 */
export function PhotoCarousel({
  images,
  thumbUrls,
  viewId,
  onView,
  catalogId,
  fullscreen = false,
  onImageTap,
}: {
  images: ImageRow[]
  thumbUrls: Record<string, string>
  viewId: string | null
  onView: (imageId: string) => void
  catalogId: string
  /** Viewer variant: black slides filling the container instead of cards. */
  fullscreen?: boolean
  /** Tap on a slide (a swipe never fires it: the browser eats the click). */
  onImageTap?: () => void
}) {
  const [slideUrls, setSlideUrls] = useState<Record<string, string>>({})
  const trackRef = useRef<HTMLDivElement>(null)
  const positioned = useRef(false)
  // Index a programmatic scroll is traveling to, or null when the user owns
  // the scroll. Our own smooth scroll fires the same events as a finger, and
  // reporting its halfway positions through onView made two mounted carousels
  // (gallery + fullscreen viewer) undo each other in an endless pendulum.
  const pendingTarget = useRef<number | null>(null)

  const viewIndex = Math.max(
    0,
    images.findIndex((r) => r.image_id === viewId),
  )

  // Derivatives for the viewed slide and its neighbors, so the one sliding in
  // from offscreen is already there.
  useEffect(() => {
    const wanted = [viewIndex - 1, viewIndex, viewIndex + 1]
      .map((i) => images[i])
      .filter((r): r is ImageRow => r !== undefined && !(r.image_id in slideUrls))
    if (wanted.length === 0) return
    let current = true
    void Promise.all(
      wanted.map(async (r) => [r.image_id, await signedUrl(r.derivative_path)] as const),
    ).then((pairs) => {
      if (!current) return
      setSlideUrls((u) => ({
        ...u,
        ...Object.fromEntries(pairs.filter((p): p is [string, string] => p[1] !== null)),
      }))
    })
    return () => {
      current = false
    }
  }, [viewIndex, images, slideUrls])

  // External selection moves the carousel; the first time lands directly on
  // the initial image, without a visible scroll.
  useEffect(() => {
    const el = trackRef.current
    if (!el || el.clientWidth === 0) return
    if (!positioned.current) {
      if (viewIndex > 0) {
        pendingTarget.current = viewIndex
        el.scrollTo({ left: viewIndex * el.clientWidth })
      }
      positioned.current = true
      return
    }
    if (Math.round(el.scrollLeft / el.clientWidth) !== viewIndex) {
      pendingTarget.current = viewIndex
      el.scrollTo({ left: viewIndex * el.clientWidth, behavior: 'smooth' })
    }
  }, [viewIndex])

  /** The slide the user settled on, derived from the scroll position. */
  function onTrackScroll() {
    const el = trackRef.current
    if (!el || el.clientWidth === 0) return
    const rounded = Math.round(el.scrollLeft / el.clientWidth)
    if (pendingTarget.current !== null) {
      // Echo of our own scroll: swallow it, and release once it lands.
      if (
        rounded === pendingTarget.current &&
        Math.abs(el.scrollLeft - rounded * el.clientWidth) < 2
      ) {
        pendingTarget.current = null
      }
      return
    }
    const row = images[rounded]
    if (row && row.image_id !== viewId) onView(row.image_id)
  }

  return (
    <div
      ref={trackRef}
      onScroll={onTrackScroll}
      // A finger interrupting our smooth scroll takes over: from that moment
      // the positions are the user's and must be reported again.
      onTouchStart={() => {
        pendingTarget.current = null
      }}
      className={`flex snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${
        fullscreen ? 'h-full' : 'rounded-xl'
      }`}
    >
      {images.map((r) => (
        <div key={r.image_id} className="w-full shrink-0 snap-center">
          <div
            onClick={onImageTap}
            className={
              fullscreen
                ? 'flex h-full items-center justify-center bg-black'
                : `flex aspect-[4/3] items-center justify-center rounded-xl border border-stone-200 bg-white ${
                    onImageTap ? 'cursor-zoom-in' : ''
                  }`
            }
          >
            {slideUrls[r.image_id] ? (
              <img
                src={slideUrls[r.image_id]}
                alt={`${SHOT_TYPE_LABEL[r.shot_type]} de ${catalogId}`}
                className="max-h-full max-w-full object-contain"
              />
            ) : thumbUrls[r.image_id] ? (
              // The thumbnail keeps the slide from being a hole while its
              // derivative arrives.
              <img src={thumbUrls[r.image_id]} alt="" className="max-h-full max-w-full blur-sm" />
            ) : (
              <span className="text-xs text-stone-400">Cargando…</span>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
