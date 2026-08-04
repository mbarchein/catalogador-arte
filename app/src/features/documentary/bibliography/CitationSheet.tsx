import { useMemo, useState } from 'react'
import { BottomSheet, Chips, PlusIcon, YearStepper } from '../../../components/ui'
import { maxYear } from '../../../lib/structuredDate'
import type { MasterRef, ReferenceRow } from '../documentaryRows'
import { MIN_REFERENCE_YEAR, displayCitationPages, type CitationEdit } from './citationFormat'
import {
  EMPTY_REFERENCE_DRAFT,
  citedReferenceIds,
  equivalentReference,
  equivalentReferenceNotice,
  newReferenceProblem,
  noReferenceOptionsText,
  referenceOptions,
  searchReferenceOptions,
  type ReferenceDraft,
} from './referenceChoice'
import type { CitationRow } from '../documentaryRows'

/**
 * The panel that records where an artwork is published (RF-504), and the same
 * panel corrected afterwards.
 *
 * Two moments, one screen, because in front of the artwork they are the same
 * sentence: «esta obra sale en la página 34 del catálogo de Zafra». Adding walks
 * two steps — which reference, then which page — and correcting starts on the
 * second, with the reference already fixed: changing which publication a citation
 * points at is not an edit, it is deleting one citation and making another.
 *
 * Nothing here decides any wording: which references are on offer, which the
 * typing reaches, whether a draft duplicates one already in the catalogue and
 * what is missing before it can be written are all in `referenceChoice.ts`, where
 * the battery reaches them. What is left here is the fold, the keyboard and the
 * order of the two steps.
 */
export function CitationSheet({
  open,
  onClose,
  catalogId,
  citations,
  references,
  publicationTypes,
  editing,
  onCite,
  onUpdate,
  onCreateReference,
}: {
  open: boolean
  onClose: () => void
  catalogId: string
  /** The citations already on the record: what is already cited is not offered twice. */
  citations: readonly CitationRow[]
  references: readonly ReferenceRow[]
  publicationTypes: readonly MasterRef[]
  /** Set to correct a citation already recorded; absent to add a new one. */
  editing?: CitationEdit | null
  onCite: (referenceId: string, pages: string, note: string) => Promise<string | null>
  onUpdate: (id: string, pages: string, note: string) => Promise<string | null>
  onCreateReference: (draft: ReferenceDraft) => Promise<{ id: string } | { error: string }>
}) {
  const [query, setQuery] = useState('')
  const [chosen, setChosen] = useState<{ id: string; title: string } | null>(null)
  const [creating, setCreating] = useState(false)
  const [draft, setDraft] = useState<ReferenceDraft>(EMPTY_REFERENCE_DRAFT)
  // Seeded from the citation being corrected, once: the section remounts this
  // sheet on every opening (see its `key`), so there is no stale draft to sync.
  const [pages, setPages] = useState(() => editing?.pages ?? '')
  const [note, setNote] = useState(() => editing?.note ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const cited = useMemo(() => citedReferenceIds(citations), [citations])
  const matches = useMemo(
    () => searchReferenceOptions(references, cited, query),
    [references, cited, query],
  )
  // How many the catalogue could offer at all, regardless of the typing: with the
  // whole catalogue withdrawn, «ninguna coincide» would leave the cataloger typing
  // variants of a title that IS registered.
  const offered = useMemo(() => referenceOptions(references, cited).length, [references, cited])
  const twin = useMemo(() => equivalentReference(references, draft), [references, draft])
  const problem = newReferenceProblem(draft)

  // The sheet is remounted on every opening by its key in the section, so there
  // is no stale draft to clear here — except when the caller reopens it for a
  // different citation, which the key covers too.
  const target = editing ?? null
  const step: 'reference' | 'pages' = target !== null || chosen !== null ? 'pages' : 'reference'
  const title = target !== null ? 'Corregir la cita' : 'Citar esta obra'

  function reset() {
    setError(null)
    setBusy(false)
  }

  async function useDraft() {
    reset()
    // A reference already in the catalogue is REUSED and not written again: two
    // rows for the same book split the citations of the catalogue in half for
    // ever (see equivalentReference).
    if (twin !== undefined) {
      setChosen({ id: twin.id, title: twin.title })
      setCreating(false)
      return
    }
    if (problem !== null) {
      setError(problem)
      return
    }
    setBusy(true)
    const answer = await onCreateReference(draft)
    setBusy(false)
    if ('error' in answer) {
      setError(`No se ha podido guardar la referencia: ${answer.error}`)
      return
    }
    setChosen({ id: answer.id, title: draft.title.trim() })
    setCreating(false)
  }

  async function confirm() {
    reset()
    setBusy(true)
    const failure =
      target !== null
        ? await onUpdate(target.id, pages, note)
        : chosen !== null
          ? await onCite(chosen.id, pages, note)
          : 'Elige primero una referencia'
    setBusy(false)
    if (failure !== null) {
      setError(failure)
      return
    }
    onClose()
  }

  const typeOptions = useMemo(
    () => [
      { value: '', text: 'Sin clasificar' },
      ...publicationTypes.filter((t) => t.active).map((t) => ({ value: t.id, text: t.name })),
    ],
    [publicationTypes],
  )

  return (
    <BottomSheet open={open} onClose={onClose} title={title}>
      {step === 'reference' ? (
        <div className="space-y-3">
          <p className="text-sm text-stone-600">
            ¿En qué publicación sale {catalogId}? Busca la referencia en el catálogo compartido; si
            no está todavía, se añade aquí mismo.
          </p>

          <input
            className="field"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Título, autor, revista, año…"
            aria-label="Buscar una referencia"
            autoComplete="off"
            autoCapitalize="none"
          />

          {matches.length === 0 ? (
            /* Nunca un desplegable vacío sin explicación, y la explicación
               correcta de las tres posibles (RF-304): se decide en
               `noReferenceOptionsText`, donde la batería la comprueba. */
            <p className="px-1 text-sm text-stone-600">
              {noReferenceOptionsText(offered, references.length, query)}
            </p>
          ) : (
            <ul className="space-y-1">
              {matches.map(({ item }) => (
                <li key={item.id}>
                  <button
                    type="button"
                    disabled={item.alreadyCited}
                    onClick={() => setChosen({ id: item.id, title: item.text })}
                    className={`w-full rounded-lg px-3 py-2 text-left ${
                      item.alreadyCited ? 'bg-stone-100 text-stone-400' : 'active:bg-stone-100'
                    }`}
                  >
                    <span className="block text-sm font-medium">{item.text}</span>
                    <span className="block text-xs text-stone-500">
                      {item.alreadyCited ? 'Ya citada en esta obra' : item.hint}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {creating ? (
            <div className="space-y-3 rounded-lg border border-stone-200 p-3">
              <p className="text-xs text-stone-500">
                Lo mínimo para poder citarla. El resto de los datos de la referencia se completan
                después, en su propia ficha.
              </p>
              <div>
                <label className="label" htmlFor="new-reference-title">
                  Título
                </label>
                <input
                  id="new-reference-title"
                  className="field"
                  value={draft.title}
                  onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                />
              </div>
              <div>
                <label className="label" htmlFor="new-reference-authors">
                  Autoría
                </label>
                <input
                  id="new-reference-authors"
                  className="field"
                  value={draft.authors}
                  onChange={(e) => setDraft({ ...draft, authors: e.target.value })}
                  placeholder="Sin firma, si no la lleva"
                />
              </div>
              <div>
                <label className="label" htmlFor="new-reference-container">
                  Revista, periódico o volumen
                </label>
                <input
                  id="new-reference-container"
                  className="field"
                  value={draft.containerTitle}
                  onChange={(e) => setDraft({ ...draft, containerTitle: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="label" htmlFor="new-reference-place">
                    Lugar
                  </label>
                  <input
                    id="new-reference-place"
                    className="field"
                    value={draft.place}
                    onChange={(e) => setDraft({ ...draft, place: e.target.value })}
                  />
                </div>
                <div>
                  <label className="label" htmlFor="new-reference-publisher">
                    Editorial
                  </label>
                  <input
                    id="new-reference-publisher"
                    className="field"
                    value={draft.publisher}
                    onChange={(e) => setDraft({ ...draft, publisher: e.target.value })}
                  />
                </div>
              </div>
              <YearStepper
                id="new-reference-year"
                label="Año de publicación"
                value={draft.year}
                onChange={(year) => setDraft({ ...draft, year })}
                min={MIN_REFERENCE_YEAR}
                max={maxYear()}
                compact
              />
              <p className="-mt-2 text-xs text-stone-500">
                Déjalo vacío si la publicación no lleva año: se cita como «s.f.», que es un dato y
                no un hueco.
              </p>
              <Chips
                id="new-reference-type"
                label="Tipo de publicación"
                columns={2}
                options={typeOptions}
                value={draft.publicationTypeId ?? ''}
                onChange={(value) =>
                  setDraft({ ...draft, publicationTypeId: value === '' ? null : value })
                }
              />

              {twin !== undefined && (
                <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-900">
                  {equivalentReferenceNotice(twin)}
                </p>
              )}

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void useDraft()}
                  className="btn min-h-touch bg-stone-900 text-white"
                >
                  {busy ? 'Guardando…' : twin !== undefined ? 'Usar la que ya hay' : 'Continuar'}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setCreating(false)}
                  className="btn-secondary"
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                setCreating(true)
                setDraft({ ...EMPTY_REFERENCE_DRAFT, title: query.trim() })
              }}
              className="flex min-h-touch w-full items-center gap-2 rounded-lg border border-stone-300 px-3 text-left text-sm font-medium active:bg-stone-100"
            >
              <PlusIcon className="h-4 w-4 shrink-0" />
              <span>No está en el catálogo: añadir una referencia nueva</span>
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="rounded-lg bg-stone-100 p-3">
            <p className="text-xs uppercase tracking-wide text-stone-500">Referencia</p>
            <p className="text-sm font-medium">{target?.title ?? chosen?.title}</p>
            {target === null && chosen !== null && (
              <button
                type="button"
                onClick={() => setChosen(null)}
                className="mt-1 min-h-touch text-sm text-stone-600 underline"
              >
                Elegir otra
              </button>
            )}
          </div>

          <div>
            <label className="label" htmlFor="citation-pages">
              Página donde sale esta obra
            </label>
            <input
              id="citation-pages"
              className="field"
              value={pages}
              onChange={(e) => setPages(e.target.value)}
              placeholder="34, 34-36, lám. XII, s/p…"
              autoCapitalize="none"
            />
            {/* Lo que se va a leer en la ficha, tal cual, antes de guardarlo. */}
            <p className="mt-1 text-xs text-stone-500">
              En la ficha se leerá: {displayCitationPages(pages)}
            </p>
          </div>

          <div>
            <label className="label" htmlFor="citation-note">
              Nota de esta cita
            </label>
            <input
              id="citation-note"
              className="field"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Reproducida a color, citada de pasada…"
            />
          </div>

          {error !== null && (
            <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">
              {error}
            </p>
          )}

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void confirm()}
              className="btn min-h-touch bg-stone-900 text-white"
            >
              {busy ? 'Guardando…' : target !== null ? 'Guardar' : 'Añadir la cita'}
            </button>
            <button type="button" disabled={busy} onClick={onClose} className="btn-secondary">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {step === 'reference' && error !== null && (
        <p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-800">
          {error}
        </p>
      )}
    </BottomSheet>
  )
}
