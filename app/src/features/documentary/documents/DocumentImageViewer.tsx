import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { NoIcon } from '../../../components/ui'
import { useCloseOnBack } from '../../../components/useCloseOnBack'
import { DownloadFailure } from '../../../lib/download'
import { signDocumentFile, type DocumentFileOffer } from './documentFile'
import { PREVIEW_IMAGE_FAILED_TEXT } from './documentPreview'

/**
 * A scanned document, looked at without downloading it (RF-408, RF-411).
 *
 * It is the same pattern as the photograph viewer and for the same reasons: the application
 * covers itself with the image —not a page, nor the browser's full-screen
 * API, which iOS does not support for elements— and it is left with the phone's back
 * button, with Escape and with the ✕. In the installed PWA, with no browser bar, that exit
 * is the difference between a viewer and a trap. It lives in `useCloseOnBack`, which is the single
 * exit of every modal in the application.
 *
 * **And it carries zoom, which here is not an ornament.** What is being looked at is a typewritten
 * letter or a newspaper clipping: fitted to a 390-point screen the
 * body text falls below legibility, so a viewer with no magnification serves
 * to know which document it is and not to read it. Two states and not a continuous gesture: on a
 * phone, pinch-zooming inside a scrolling element fights with the
 * page's scroll, and this viewer has to work with one hand.
 *
 * What it does **not** do is replace the download. Taking the file out of the catalogue is a
 * requirement in itself (RF-411) and its button is still in the row, below: this takes away its
 * place as the primary action, not its existence.
 */
export function DocumentImageViewer({
  offer,
  title,
  onClose,
}: {
  offer: DocumentFileOffer
  /** The document's title, to know what is being looked at. */
  title: string
  onClose: () => void
}) {
  useCloseOnBack(onClose)

  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [zoomed, setZoomed] = useState(false)

  // The signature is asked for on opening and only once: the private bucket's permission lasts
  // an hour (RF-110), and asking again on every render would be one request per keystroke.
  useEffect(() => {
    let alive = true
    signDocumentFile(offer)
      .then((signed) => {
        if (alive) setUrl(signed)
      })
      .catch((cause: unknown) => {
        if (!alive) return
        setError(
          cause instanceof DownloadFailure || cause instanceof Error
            ? cause.message
            : String(cause),
        )
      })
    return () => {
      alive = false
    }
  }, [offer])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (event.metaKey || event.ctrlKey || event.altKey) return
      event.preventDefault()
      // Down the same path as the back button —consuming the history entry— so that
      // the keyboard and the phone do not keep separate counts.
      window.history.back()
    }
    window.addEventListener('keydown', onKey)

    // The page underneath does not scroll with the viewer open.
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = previousOverflow
    }
  }, [])

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${title} a pantalla completa`}
      data-document-viewer
      className="fixed inset-0 z-50 flex flex-col bg-black"
    >
      <div className="flex items-center gap-2 p-3 text-white">
        <button
          type="button"
          aria-label="Cerrar el visor (Escape)"
          title="Cerrar · Escape"
          onClick={() => window.history.back()}
          className="flex min-h-touch min-w-[2.75rem] shrink-0 items-center justify-center rounded-full bg-white/10"
        >
          <NoIcon className="h-5 w-5" />
        </button>
        <span className="min-w-0 flex-1 truncate text-sm text-stone-300">{title}</span>
        {url !== null && error === null && (
          <button
            type="button"
            onClick={() => setZoomed((value) => !value)}
            className="min-h-touch shrink-0 rounded-full bg-white/10 px-3 text-sm text-white"
          >
            {zoomed ? 'Ajustar' : 'Ampliar'}
          </button>
        )}
      </div>

      <div className={`min-h-0 flex-1 ${zoomed ? 'overflow-auto' : 'flex items-center justify-center p-2'}`}>
        {error !== null ? (
          <p role="alert" className="m-3 rounded-lg bg-red-950 p-3 text-sm text-red-200">
            {error}
          </p>
        ) : url === null ? (
          /* Never a black screen with no explanation: asking for the bucket's permission
             takes a while, and without this line the viewer looks stuck. */
          <p className="text-sm text-stone-400">Pidiendo permiso…</p>
        ) : (
          <img
            src={url}
            alt={title}
            // Double tap on the image itself besides the button: on a phone, the
            // thumb is already on the image and not on the top bar.
            onDoubleClick={() => setZoomed((value) => !value)}
            onError={() => setError(PREVIEW_IMAGE_FAILED_TEXT)}
            className={
              zoomed
                ? 'w-[250%] max-w-none'
                : 'max-h-full max-w-full object-contain'
            }
          />
        )}
      </div>

      {url !== null && error === null && (
        <p className="p-3 text-center text-xs text-stone-400">
          {zoomed
            ? 'Arrastra para moverte por el documento. «Ajustar» lo devuelve a la pantalla.'
            : 'Toca «Ampliar» para leerlo, o dos veces sobre el documento.'}
        </p>
      )}
    </div>,
    document.body,
  )
}
