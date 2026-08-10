import { useMemo, useState } from 'react'
import { anyWritten } from '../../components/formDirty'
import { BottomSheet } from '../../components/ui'
import { useSheetGuard } from '../../components/useSheetGuard'
import { Marked } from '../exhibitions/Marked'
import type { ExhibitionRow } from '../documentary/documentaryRows'
import {
  exhibitionLinkedNotice,
  noExhibitionOptionsText,
  rankExhibitionLinkOptions,
} from './exhibitionLink'

/**
 * Linking this document to an exhibition (RF-516, RF-517).
 *
 * The panel `document_exhibition` was missing, which has been in the schema —with its
 * `grant execute` and its test that it restores the withdrawn link— since the archive's
 * migration and which nobody called. Without it, a show's poster could not be linked
 * to the show from any screen.
 *
 * It reuses the artwork record's exhibition finder, with its same boundary and for
 * the same reasons: **the withdrawn ones are left out** —offering them would bring them back into
 * circulation through the back door— and **the ones already linked are still listed**,
 * marked, because hiding them makes people type the same title over and over. `exhibitionLink.ts`
 * decides it, which is pure and has tests.
 *
 * The note belongs to the LINK and not to the document: what a poster says about the show is not what
 * it says about one of its artworks, and that is why each bridge table carries its own (RF-516).
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
  /** The exhibitions this document already has linked, so they can be marked. */
  linked: ReadonlySet<string>
  loading: boolean
  loadError: string | null
  /** Calls `document_exhibition`. Answers null when it went through. */
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
      // The sheet stays open: the sentence explains what happened and with what it can be
      // tried again.
      setFailure(problem)
      return
    }
    await onDone(exhibitionLinkedNotice(title))
    onClose()
  }

  // The link note is typed before choosing the show, so it is exactly what would be lost on
  // closing by accident. The search does not count.
  const guard = useSheetGuard({ onClose: busy ? () => {} : onClose, dirty: anyWritten(note) })

  return (
    <BottomSheet
      open
      onClose={busy ? () => {} : onClose}
      title="Enlazar con una exposición"
      guard={guard}
    >
      <p className="text-xs text-stone-500">
        El cartel, el díptico o la nota de prensa de la muestra.
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
          Solo de esa muestra. Lo que diga de una obra va en la ficha de la obra.
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
        onClick={guard.cancel}
        className="btn-secondary mt-3 w-full"
      >
        {busy ? 'Enlazando…' : 'Cancelar'}
      </button>
    </BottomSheet>
  )
}
