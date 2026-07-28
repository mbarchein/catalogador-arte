import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { SHOT_TYPE_LABEL } from '../../lib/types'
import { NoIcon } from '../../components/ui'
import type { ImageRow } from './artworkImages'
import { PhotoCarousel } from './PhotoCarousel'

/**
 * Full-viewport photo viewer: the app covering itself with the image, not a
 * page and not the browser's Fullscreen API (iOS does not support it for
 * elements, and the phone is the primary device). Inside, the same carousel.
 *
 * Closing works with the ✕, with Escape and — the important one on a phone —
 * with the BACK button: opening pushes one history entry without leaving the
 * page, and back consumes it instead of leaving the record. In the installed
 * PWA, with no browser bar, that is the difference between a viewer and a
 * trap. The derivative is what is shown: the master never appears in a view
 * (RF-411).
 */
export function PhotoViewer({
  images,
  thumbUrls,
  viewId,
  onView,
  catalogId,
  onClose,
}: {
  images: ImageRow[]
  thumbUrls: Record<string, string>
  viewId: string | null
  onView: (imageId: string) => void
  catalogId: string
  onClose: () => void
}) {
  // The callback lives in a ref so the history/keyboard listeners register
  // once: re-registering on every render could miss the closing pop.
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    // One history entry for the viewer. Pushing state does not notify the
    // router (same URL); popping it fires our listener and closes.
    window.history.pushState({ photoViewer: true }, '')
    const onPop = () => onCloseRef.current()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') window.history.back()
    }
    window.addEventListener('popstate', onPop)
    window.addEventListener('keydown', onKey)

    // The page under the viewer must not scroll along with the swipes.
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      window.removeEventListener('popstate', onPop)
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = previousOverflow
    }
  }, [])

  const viewing = images.find((r) => r.image_id === viewId)
  const viewIndex = Math.max(
    0,
    images.findIndex((r) => r.image_id === viewId),
  )

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Fotografías de ${catalogId} a pantalla completa`}
      className="fixed inset-0 z-50 flex flex-col bg-black"
    >
      <div className="flex items-center justify-between p-3 text-white">
        <button
          type="button"
          aria-label="Cerrar el visor"
          // Closing goes through history.back(): the entry pushed on opening
          // is consumed and the popstate listener does the actual close, the
          // same path the phone's back button takes.
          onClick={() => window.history.back()}
          className="flex min-h-touch min-w-[2.75rem] items-center justify-center rounded-full bg-white/10"
        >
          <NoIcon className="h-5 w-5" />
        </button>
        <span className="text-sm text-stone-300">
          {viewIndex + 1} de {images.length}
        </span>
      </div>

      <div className="min-h-0 flex-1">
        <PhotoCarousel
          images={images}
          thumbUrls={thumbUrls}
          viewId={viewId}
          onView={onView}
          catalogId={catalogId}
          fullscreen
        />
      </div>

      <p className="p-3 text-center text-sm text-stone-300">
        {viewing ? `${SHOT_TYPE_LABEL[viewing.shot_type]} · ${catalogId}` : catalogId}
      </p>
    </div>,
    document.body,
  )
}
