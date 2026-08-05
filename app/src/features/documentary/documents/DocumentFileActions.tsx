import { useState } from 'react'
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
 * Las salidas del fichero de un documento: verlo y bajárselo (RF-408, RF-411, RNF-106).
 *
 * **Una sola copia de esto, y antes había dos.** La documentación de una obra y la ficha
 * del archivo tenían cada una su botón de descargar, iguales y por separado, y al añadir
 * el visor habría hecho falta añadirlo dos veces — que es exactamente la deriva por la
 * que una pantalla acaba enseñando algo que la otra ya no enseña. Lo que la fila decide
 * sigue siendo suyo; lo que el fichero hace es de aquí.
 *
 * **Ver pasa delante de descargar cuando el formato lo permite**, y descargar se queda
 * como enlace debajo. Con la obra delante y en un almacén, leer un recorte no debería
 * costar tres pasos —tocar, esperar, buscar el fichero en las descargas del teléfono— y
 * dejar un fichero suelto en el móvil que nadie va a borrar. Pero descargar no
 * desaparece: sacar el documento del catálogo es un requisito por sí mismo (RF-411), y lo
 * que pierde es el sitio de acción principal, no la existencia.
 *
 * Qué formato lo permite lo decide `documentPreview.ts`, que es puro y tiene tests. Aquí
 * solo quedan los dos bordes que necesitan un navegador: abrir una ventana y firmar.
 */
export function DocumentFileActions({
  offer,
  title,
  className = 'mt-1.5',
}: {
  offer: DocumentFileOffer
  /** El título del documento, para el visor. */
  title: string
  className?: string
}) {
  const [busy, setBusy] = useState<DocumentDownloadStep | null>(null)
  const [opening, setOpening] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [viewing, setViewing] = useState(false)

  function clear() {
    // Los dos, antes de empezar: una franja roja de un intento anterior encima de una
    // descarga que acaba de funcionar es la pantalla contradiciéndose.
    setError(null)
    setNotice(null)
  }

  async function download() {
    clear()
    setBusy('signing')
    try {
      setNotice(await runDocumentDownload(offer, { onStep: setBusy }))
    } catch (cause) {
      // `DownloadFailure` ya trae la frase que mostrar; cualquier otra cosa es un fallo
      // del programa y se enseña tal cual antes que tragárselo, que un botón mudo es peor.
      setError(
        cause instanceof DownloadFailure || cause instanceof Error ? cause.message : String(cause),
      )
    } finally {
      setBusy(null)
    }
  }

  /**
   * Abre el PDF en el visor del navegador.
   *
   * **La ventana se abre ANTES de firmar, y en vacío.** Es la única forma que funciona:
   * un `window.open` después de un `await` llega fuera del gesto del dedo y los
   * navegadores lo bloquean como si fuera una ventana emergente de publicidad. Así que
   * primero se abre —dentro del toque, que es cuando está permitido— y luego se le manda
   * la dirección firmada.
   *
   * Sin `noopener` en las opciones a propósito: con él, `window.open` devuelve null y no
   * habría a quién mandar la dirección. La misma protección se consigue borrándole el
   * `opener`, que es lo que hace la línea de abajo.
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
      // La pestaña en blanco no se queda ahí: cerrarla es parte de contar el fallo, o el
      // aviso queda en una pantalla que ya no se está mirando.
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
