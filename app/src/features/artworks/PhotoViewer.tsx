import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { SHOT_TYPE_LABEL } from '../../lib/types'
import { NoIcon } from '../../components/ui'
import { useCloseOnBack } from '../../components/useCloseOnBack'
import type { ImageRow } from './artworkImages'
import { PhotoCarousel } from './PhotoCarousel'

/**
 * Full-viewport photo viewer: the app covering itself with the image, not a
 * page and not the browser's Fullscreen API (iOS does not support it for
 * elements, and the phone is the primary device). Inside, the same carousel.
 *
 * Closing works with the ✕, with Escape and — the important one on a phone —
 * with the BACK button, which is `useCloseOnBack` and the same exit every modal
 * of the application has. In the installed PWA, with no browser bar, that is the
 * difference between a viewer and a trap. The derivative is what is shown: the
 * master never appears in a view (RF-411).
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
  // The back button closes the viewer, with the history entry it pushes on
  // opening. It lives in `useCloseOnBack` and not here because it is the same exit
  // the sheets and the editor have: with each one having its own, a «back» with
  // two modals open closed both.
  useCloseOnBack(onClose)

  // What the arrows need to know lives in a ref so the keyboard
  // listener is registered only once: registering it again on every render could
  // miss a keypress.
  const paso = useRef({ images, viewId, onView })
  paso.current = { images, viewId, onView }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // «f» closes just like Escape: the same key that opens is the one that leaves, with no
      // need to remember another. And it leaves by the same path as everything else
      // —consuming the history entry— so that the phone's back button
      // and the keyboard do not keep separate counts.
      if (e.key === 'Escape' || e.key === 'f' || e.key === 'F') {
        if (e.metaKey || e.ctrlKey || e.altKey) return
        e.preventDefault()
        window.history.back()
        return
      }

      // With the viewer open, the arrows move among this artwork's
      // PHOTOGRAPHS and not among artworks: what is being looked at is the gallery, and moving between
      // records from here would leave the viewer showing another piece's photos. The one that
      // navigates the listing is the record underneath, and it steps aside while this is
      // open (see ArtworkPage's guard).
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return

      const { images: fotos, viewId: actual, onView: ver } = paso.current
      const desde = fotos.findIndex((r) => r.image_id === actual)
      const destino = fotos[(e.key === 'ArrowLeft' ? desde - 1 : desde + 1)]
      // No wrapping around, same as the artwork queue: at the ends nothing happens.
      if (desde < 0 || !destino) return
      e.preventDefault()
      ver(destino.image_id)
    }
    window.addEventListener('keydown', onKey)

    // The page under the viewer must not scroll along with the swipes.
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
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
      // What the record underneath knows the viewer is open by and that it must not
      // attend to the arrows. An attribute in the DOM and not shared state:
      // the viewer belongs to the gallery, and lifting the state up to the page so that
      // it steps aside would be more wiring than the problem asks for.
      data-photo-viewer
      className="fixed inset-0 z-50 flex flex-col bg-black"
    >
      <div className="flex items-center justify-between p-3 text-white">
        <button
          type="button"
          aria-label="Cerrar el visor (Escape o tecla F)"
          title="Cerrar · Escape o F"
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
