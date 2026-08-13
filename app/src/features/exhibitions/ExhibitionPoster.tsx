import { useEffect, useRef, useState } from 'react'
import { cachedSignedPaths, signPaths } from '../../lib/signedPaths'
import { ConfirmSheet, ImageIcon, TrashIcon } from '../../components/ui'
import type { ExhibitionRow } from '../documentary/documentaryRows'
import {
  POSTER_STEP_TEXT,
  hasPoster,
  posterAlt,
  posterButtonLabel,
  posterFileRefusal,
  removePosterConfirmText,
  type PosterStep,
} from './exhibitionPoster'
import { preparePoster, savePoster, uploadPoster } from './exhibitionPosterActions'

/**
 * El cartel de la exposición: verlo, subirlo y quitarlo (RF-518).
 *
 * **Encabeza la ficha**, y eso es lo que decide el bloque: el cartel es lo que dice de
 * un vistazo qué exposición se está mirando, y debajo del historial de obras sería una
 * ilustración escondida. Sin cartel no hay hueco vacío: hay un recuadro que dice que no
 * lo hay, que es la regla de esta aplicación (RF-304).
 *
 * La imagen que se pinta es **la copia de consulta de 2000 px** y no el original,
 * porque no hay original: un cartel es una referencia para reconocer la exposición y no
 * el documento de conservación de una obra. Se abre en una pestaña al tocarla, con la
 * misma firma con la que se pinta — el bucket es privado (RF-110).
 *
 * Y la firma sale del **espejo de `signedPaths`**, como las fotografías de una obra: dura
 * una semana, se guarda, y se lee de forma síncrona antes del primer pintado. Sin eso, al
 * abrir una exposición ya visitada se veía el hueco un instante — los bytes estaban en el
 * teléfono, pero sin firma no hay `src` que buscar en el caché.
 */
export function ExhibitionPoster({
  exhibition,
  canEdit,
  onSaved,
}: {
  exhibition: ExhibitionRow
  canEdit: boolean
  /** Para que la ficha vuelva a leer la fila: la que tiene en la mano ya no vale. */
  onSaved: () => void
}) {
  // Se arranca con la firma que ya esté guardada: `signPaths` es una promesa, y sin esto
  // la ficha pinta un fotograma con el hueco antes de resolverla — que al abrir una
  // exposición ya visitada se ve como un parpadeo.
  const [url, setUrl] = useState<string | null>(() => cached(exhibition.poster_derivative_path))
  const [step, setStep] = useState<PosterStep | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [removing, setRemoving] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  const path = exhibition.poster_derivative_path

  useEffect(() => {
    if (path === null) {
      setUrl(null)
      return
    }
    setUrl(cached(path))
    let alive = true
    // El mismo espejo de firmas que las fotografías de una obra: una semana de validez y
    // guardada, así que la segunda visita no pide nada y el navegador reutiliza los bytes
    // que ya tiene. Firmar otra vez daría una URL distinta, y una URL distinta es otra
    // imagen para cualquier caché.
    void signPaths([path]).then((signed) => {
      if (alive && signed[path] !== undefined) setUrl(signed[path])
    })
    return () => {
      alive = false
    }
  }, [path])

  async function upload(file: File) {
    setProblem(null)
    // Lo que se puede saber sin decodificar, antes de gastar un byte de datos móviles.
    const refusal = posterFileRefusal(file)
    if (refusal !== null) {
      setProblem(refusal)
      return
    }

    setStep('preparing')
    let prepared
    try {
      prepared = await preparePoster(exhibition.id, file)
    } catch {
      setStep(null)
      setProblem('No se ha podido leer la imagen. Prueba con otra, o hazle una foto.')
      return
    }
    // Mientras sube se pinta lo que se acaba de elegir: la espera con la imagen
    // delante es la mitad de larga.
    setUrl(prepared.preview)

    setStep('uploading')
    const failure = await uploadPoster(prepared)
    if (failure !== null) {
      setStep(null)
      setProblem(failure)
      return
    }

    setStep('saving')
    const saved = await savePoster(exhibition.id, prepared.paths)
    setStep(null)
    URL.revokeObjectURL(prepared.preview)
    if (saved.error !== null) {
      setProblem(`No se ha podido guardar el cartel: ${saved.error.message}`)
      return
    }
    if (saved.rows === 0) {
      setProblem('No se ha tocado nada: o la exposición ya no está, o tu sesión no puede editarla.')
      return
    }
    onSaved()
  }

  async function remove() {
    setProblem(null)
    setStep('saving')
    const saved = await savePoster(exhibition.id, null)
    setStep(null)
    if (saved.error !== null || saved.rows === 0) {
      setProblem('No se ha podido quitar el cartel. Vuelve a cargar la pantalla.')
      return
    }
    onSaved()
  }

  const busy = step !== null

  return (
    <section className="card">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-medium">Cartel</h2>
        {canEdit && hasPoster(exhibition) && (
          <button
            type="button"
            aria-label="Quitar el cartel"
            className="flex min-h-[2.5rem] min-w-[2.5rem] items-center justify-center rounded border border-red-200 text-red-800 disabled:opacity-50"
            disabled={busy}
            onClick={() => setRemoving(true)}
          >
            <TrashIcon className="h-5 w-5" />
          </button>
        )}
      </div>

      {url !== null ? (
        // Se abre aparte y a tamaño completo: en un cartel lo que se quiere leer es la
        // letra pequeña —las fechas, la sede, los patrocinadores— y para eso hace falta
        // el zoom del navegador.
        <a href={url} target="_blank" rel="noreferrer" className="mt-2 block">
          <img
            src={url}
            alt={posterAlt(exhibition.title)}
            className="max-h-[60vh] w-full rounded-lg border border-stone-200 object-contain"
          />
        </a>
      ) : (
        // Nunca un hueco: el recuadro dice que no hay cartel, y con eso se distingue de
        // una imagen que no ha cargado.
        <p className="mt-2 flex min-h-[6rem] items-center justify-center gap-2 rounded-lg border border-dashed border-stone-300 text-sm text-stone-500">
          <ImageIcon className="h-5 w-5" />
          {hasPoster(exhibition) ? 'Cargando el cartel…' : 'Sin cartel'}
        </p>
      )}

      {canEdit && (
        <>
          {/* Un `input` de fichero y no una cámara a secas: el cartel se sube casi
              siempre desde una foto que ya está en el teléfono o desde un fichero del
              ordenador, y `capture` forzaría la cámara en el móvil. */}
          <input
            ref={input}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0]
              // El valor se limpia para que elegir DOS VECES el mismo fichero dispare el
              // cambio: sin esto, un segundo intento después de un fallo no hace nada.
              event.target.value = ''
              if (file !== undefined) void upload(file)
            }}
          />
          <button
            type="button"
            className="btn-secondary mt-2 w-full"
            disabled={busy}
            onClick={() => input.current?.click()}
          >
            {busy ? POSTER_STEP_TEXT[step] : posterButtonLabel(exhibition)}
          </button>
        </>
      )}

      {problem !== null && (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {problem}
        </p>
      )}

      {removing && (
        <ConfirmSheet
          open
          title="¿Quitar el cartel?"
          text={removePosterConfirmText(exhibition.title)}
          confirmLabel="Sí, quitar"
          busy={busy}
          onClose={() => setRemoving(false)}
          onConfirm={() => {
            setRemoving(false)
            void remove()
          }}
        />
      )}
    </section>
  )
}

/** La firma guardada de una ruta, o null. Síncrona: es lo que quita el parpadeo. */
function cached(path: string | null): string | null {
  if (path === null) return null
  return cachedSignedPaths([path])[path] ?? null
}
