import { useMemo, useState } from 'react'
import { BottomSheet } from '../../components/ui'
import { Marked } from '../exhibitions/Marked'
import type { ExhibitionRow } from '../documentary/documentaryRows'
import {
  exhibitionLinkedNotice,
  noExhibitionOptionsText,
  rankExhibitionLinkOptions,
} from './exhibitionLink'

/**
 * Enlazar este documento con una exposición (RF-516, RF-517).
 *
 * El panel que le faltaba a `document_exhibition`, que está en el esquema —con su
 * `grant execute` y su test de que restaura el vínculo retirado— desde la migración del
 * archivo y que no llamaba nadie. Sin él, el cartel de una muestra no se podía enlazar
 * con la muestra desde ninguna pantalla.
 *
 * Reutiliza el buscador de exposiciones de la ficha de obra, con su misma frontera y por
 * los mismos motivos: **las retiradas se dejan fuera** —ofrecerlas las devolvería a
 * circulación por la puerta de atrás— y **las ya enlazadas se siguen listando**,
 * marcadas, porque esconderlas hace teclear el mismo título una y otra vez. Lo decide
 * `exhibitionLink.ts`, que es puro y tiene tests.
 *
 * La nota es del VÍNCULO y no del documento: lo que un cartel dice de la muestra no es lo
 * que dice de una obra suya, y por eso cada tabla puente lleva la suya (RF-516).
 */
export function LinkExhibitionSheet({
  exhibitions,
  linked,
  loading,
  loadError,
  onLink,
  onClose,
  onDone,
}: {
  exhibitions: readonly ExhibitionRow[]
  /** Las exposiciones que este documento ya tiene enlazadas, para marcarlas. */
  linked: ReadonlySet<string>
  loading: boolean
  loadError: string | null
  /** Llama a `document_exhibition`. Responde null cuando entró. */
  onLink: (exhibitionId: string, note: string) => Promise<string | null>
  onClose: () => void
  onDone: (notice: string) => Promise<void>
}) {
  const [query, setQuery] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)

  const offered = useMemo(
    () => rankExhibitionLinkOptions(exhibitions, query, linked),
    [exhibitions, query, linked],
  )
  const total = useMemo(() => exhibitions.filter((row) => row.active).length, [exhibitions])

  async function link(exhibitionId: string, title: string) {
    setFailure(null)
    setBusy(true)
    const problem = await onLink(exhibitionId, note)
    setBusy(false)
    if (problem !== null) {
      // La hoja se queda abierta: la frase explica qué ha pasado y con qué se puede
      // volver a intentar.
      setFailure(problem)
      return
    }
    await onDone(exhibitionLinkedNotice(title))
    onClose()
  }

  return (
    <BottomSheet open onClose={busy ? () => {} : onClose} title="Enlazar con una exposición">
      <p className="text-xs text-stone-500">
        Para el cartel, el díptico o la nota de prensa de una muestra: documentos que hablan de la
        exposición y no de una pieza en concreto. El fichero se guarda una sola vez y cuelga de
        tantas fichas como hable.
      </p>

      {loadError !== null && (
        <p role="alert" className="mt-2 rounded-lg bg-red-50 p-3 text-sm text-red-800">
          {loadError}
        </p>
      )}

      <div className="mt-3">
        <label className="label" htmlFor="link-exhibition-note">
          Qué dice de esa exposición (opcional)
        </label>
        <textarea
          id="link-exhibition-note"
          className="field"
          rows={2}
          value={note}
          disabled={busy}
          onChange={(event) => setNote(event.target.value)}
          placeholder="cartel de la muestra"
        />
        <p className="mt-1 text-xs text-stone-500">
          Solo de esa muestra. Lo que el documento diga de una obra suya se escribe en la ficha de
          la obra.
        </p>
      </div>

      <input
        id="link-exhibition-search"
        className="field mt-3"
        type="search"
        value={query}
        disabled={busy}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Título, año o sede"
        aria-label="Buscar una exposición"
        autoComplete="off"
        autoCapitalize="none"
      />

      {/* Nunca una lista vacía: los tres casos dicen cosas distintas. */}
      {offered.length === 0 ? (
        <p className="mt-2 rounded-lg bg-stone-100 p-3 text-sm text-stone-600">
          {loading ? 'Cargando las exposiciones…' : noExhibitionOptionsText(total, query)}
        </p>
      ) : (
        <ul className="mt-2 space-y-1">
          {offered.map(({ item, indices }) => (
            <li key={item.id}>
              <button
                type="button"
                disabled={busy || item.alreadyLinked}
                onClick={() => void link(item.id, item.title)}
                className="flex min-h-touch w-full flex-col items-start rounded-lg px-3 py-2 text-left active:bg-stone-100 disabled:opacity-60"
              >
                <span className="break-words text-sm">
                  <Marked text={item.text} indices={indices} />
                </span>
                {item.alreadyLinked && (
                  <span className="text-xs text-stone-500">Ya está enlazada con este documento.</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      {failure !== null && (
        <p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-800">
          {failure}
        </p>
      )}

      <button
        type="button"
        disabled={busy}
        onClick={onClose}
        className="btn-secondary mt-3 w-full"
      >
        {busy ? 'Enlazando…' : 'Cancelar'}
      </button>
    </BottomSheet>
  )
}
