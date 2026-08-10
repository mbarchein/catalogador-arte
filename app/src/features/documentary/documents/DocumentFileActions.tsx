import { useState } from 'react'
import { useAutoClear } from '../../../components/useAutoClear'
import { DownloadFailure } from '../../../lib/download'
import {
  DOCUMENT_STEP_TEXT,
  runDocumentDownload,
  signDocumentFile,
  type DocumentDownloadStep,
  type DocumentFileOffer,
} from './documentFile'
import { PREVIEW_BLOCKED_TEXT } from './documentPreview'
import { DocumentImageViewer } from './DocumentImageViewer'

/**
 * An document's file's ways out: seeing it and downloading it (RF-408, RF-411, RNF-106).
 *
 * **A single copy of this, and there used to be two.** An artwork's documentation and the archive's
 * record each had their own download button, alike and separate, and on adding
 * the viewer it would have had to be added twice — which is exactly the drift by
 * which one screen ends up showing something the other no longer shows. What the row decides
 * is still its own; what the file does belongs here.
 *
 * **Viewing goes ahead of downloading when the format allows it**, and downloading stays
 * as a link below. With the artwork in front and in a storeroom, reading a clipping should not
 * cost three steps —tap, wait, hunt for the file in the phone's downloads— and
 * leave a stray file on the phone nobody is going to delete. But downloading does not
 * disappear: taking the document out of the catalogue is a requirement in itself (RF-411), and what
 * it loses is the place of the primary action, not its existence.
 *
 * Which format allows it is decided by `documentPreview.ts`, which is pure and has tests. Here
 * only the two edges that need a browser are left: opening a window and signing.
 */
export function DocumentFileActions({
  offer,
  title,
  className = 'mt-1.5',
}: {
  offer: DocumentFileOffer
  /** The document's title, for the viewer. */
  title: string
  className?: string
}) {
  const [busy, setBusy] = useState<DocumentDownloadStep | null>(null)
  const [opening, setOpening] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  // It confirms something that already happened, so it leaves on its own: see `useAutoClear`.
  useAutoClear(notice, () => setNotice(null))
  const [viewing, setViewing] = useState(false)

  function clear() {
    // Both, before starting: a red band from an earlier attempt on top of a
    // download that has just worked is the screen contradicting itself.
    setError(null)
    setNotice(null)
  }

  async function download() {
    clear()
    setBusy('signing')
    try {
      setNotice(await runDocumentDownload(offer, { onStep: setBusy }))
    } catch (cause) {
      // `DownloadFailure` already carries the sentence to show; anything else is a program
      // failure and is shown as is rather than swallowed, since a mute button is worse.
      setError(
        cause instanceof DownloadFailure || cause instanceof Error ? cause.message : String(cause),
      )
    } finally {
      setBusy(null)
    }
  }

  /**
   * Opens the PDF in the browser's viewer.
   *
   * **The window is opened BEFORE signing, and empty.** It is the only way that works:
   * a `window.open` after an `await` arrives outside the finger's gesture and
   * browsers block it as if it were an advertising pop-up. So
   * it is opened first —inside the tap, which is when it is allowed— and then the
   * signed address is sent to it.
   *
   * With no `noopener` in the options on purpose: with it, `window.open` returns null and there
   * would be nobody to send the address to. The same protection is achieved by clearing its
   * `opener`, which is what the line below does.
   */
  async function openApart() {
    clear()
    const win = window.open('', '_blank')
    if (win === null) {
      setError(PREVIEW_BLOCKED_TEXT)
      return
    }
    win.opener = null
    setOpening(true)
    try {
      const url = await signDocumentFile(offer)
      win.location.replace(url)
    } catch (cause) {
      // The blank tab does not stay there: closing it is part of reporting the failure, or the
      // warning lands on a screen nobody is looking at any more.
      win.close()
      setError(
        cause instanceof DownloadFailure || cause instanceof Error ? cause.message : String(cause),
      )
    } finally {
      setOpening(false)
    }
  }

  const previewing = offer.preview !== null && offer.previewLabel !== null
  const label = busy === null ? offer.label : DOCUMENT_STEP_TEXT[busy]

  return (
    <div className={className}>
      {previewing ? (
        <>
          <button
            type="button"
            disabled={opening || busy !== null}
            onClick={() => {
              if (offer.preview === 'image') {
                clear()
                setViewing(true)
                return
              }
              void openApart()
            }}
            className="btn-secondary w-full text-sm disabled:opacity-60"
          >
            {opening ? 'Pidiendo permiso…' : offer.previewLabel}
          </button>
          {/* Descargar baja a enlace, no a un segundo botón del mismo tamaño: dos
              botones iguales obligan a leerlos los dos cada vez que se quiere lo de
              siempre. */}
          <button
            type="button"
            disabled={opening || busy !== null}
            onClick={() => void download()}
            className="mt-1 min-h-touch text-xs text-stone-600 underline disabled:opacity-60"
          >
            {label}
          </button>
        </>
      ) : (
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => void download()}
          className="btn-secondary w-full text-sm disabled:opacity-60"
        >
          {label}
        </button>
      )}

      <p className="mt-1 text-xs text-stone-500">{offer.kindText}</p>
      {offer.previewHint && <p className="mt-1 text-xs text-stone-500">{offer.previewHint}</p>}
      {/* Nada se trae sin pedirlo, y lo que se pide dice lo que cuesta ANTES del toque.
          Vale igual para ver que para descargar: verlo se trae el fichero entero. */}
      {offer.weightWarning && <p className="mt-1 text-xs text-amber-900">{offer.weightWarning}</p>}
      {error && (
        <p role="alert" className="mt-1 rounded-lg bg-red-50 p-2 text-xs text-red-800">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="mt-1 text-xs text-stone-700">
          {notice}
        </p>
      )}

      {viewing && (
        <DocumentImageViewer offer={offer} title={title} onClose={() => setViewing(false)} />
      )}
    </div>
  )
}
