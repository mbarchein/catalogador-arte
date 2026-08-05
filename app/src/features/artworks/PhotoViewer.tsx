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
  // El botón de atrás cierra el visor, con la entrada de historia que empuja al
  // abrirse. Vive en `useCloseOnBack` y no aquí porque es la misma salida que
  // tienen las hojas y el editor: teniéndola cada uno por su lado, un «atrás» con
  // dos modales abiertos cerraba los dos.
  useCloseOnBack(onClose)

  // Lo que las flechas necesitan saber vive en un ref para que el listener de
  // teclado se registre una sola vez: volver a registrarlo en cada render podría
  // perderse una pulsación.
  const paso = useRef({ images, viewId, onView })
  paso.current = { images, viewId, onView }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // «f» cierra igual que Escape: la misma tecla que abre es la que sale, sin
      // tener que recordar otra. Y sale por el mismo camino que todo lo demás
      // —consumir la entrada de historia— para que el botón de atrás del móvil
      // y el teclado no lleven la cuenta por separado.
      if (e.key === 'Escape' || e.key === 'f' || e.key === 'F') {
        if (e.metaKey || e.ctrlKey || e.altKey) return
        e.preventDefault()
        window.history.back()
        return
      }

      // Con el visor abierto, las flechas mueven entre las FOTOGRAFÍAS de esta
      // obra y no entre obras: lo que se está mirando es la galería, y pasar de
      // ficha desde aquí dejaría al visor enseñando fotos de otra pieza. Quien
      // navega el listado es la ficha de debajo, y se aparta mientras esto está
      // abierto (ver el guardián de ArtworkPage).
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return

      const { images: fotos, viewId: actual, onView: ver } = paso.current
      const desde = fotos.findIndex((r) => r.image_id === actual)
      const destino = fotos[(e.key === 'ArrowLeft' ? desde - 1 : desde + 1)]
      // Sin dar la vuelta, como la cola de obras: en los extremos no pasa nada.
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
      // Con qué la ficha de debajo sabe que el visor está abierto y no debe
      // atender a las flechas. Un atributo en el DOM y no un estado compartido:
      // el visor es de la galería, y subir el estado hasta la página para que
      // esta se aparte sería más cableado del que el problema pide.
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
