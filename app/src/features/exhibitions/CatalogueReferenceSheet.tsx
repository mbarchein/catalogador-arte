import { useMemo, useState } from 'react'
import { BottomSheet } from '../../components/ui'
import { Marked } from './Marked'
import {
  referenceOptions,
  searchReferenceOptions,
} from '../documentary/bibliography/referenceChoice'
import type { ReferenceRow } from '../documentary/documentaryRows'
import {
  catalogueChoiceBlockedReason,
  noCatalogueOptionsText,
  planCatalogueReference,
} from './catalogueReference'
import type { TriState } from '../../lib/types'

/**
 * Choosing which of the bibliography's references is this show's catalogue
 * (RF-503, RF-506).
 *
 * The selector the `catalogue_reference_id` column was missing, which had existed since the
 * first exhibitions migration and which no screen could set. It reuses the
 * artwork record's reference finder (`searchReferenceOptions`) as is: a
 * reference is searched for the same from an artwork that cites it as from the show whose
 * catalogue it is.
 *
 * **The first thing read is the refusal, when there is one**: the base ties the link to
 * `catalogue_published`, so if it is not recorded that there was a catalogue this cannot be stored,
 * and it is said before anything is chosen — with two different sentences, because «sin revisar» and
 * «No» lead to doing different things. `catalogueChoiceBlockedReason` decides it.
 *
 * And removing the link is offered whenever there is one, also over an inconsistent record:
 * it is the only way out of a row that had arrived through SQL.
 */
export function CatalogueReferenceSheet({
  cataloguePublished,
  current,
  references,
  loading,
  loadError,
  onSave,
  onClose,
}: {
  cataloguePublished: TriState
  /** The reference recorded today, or null. */
  current: string | null
  references: readonly ReferenceRow[]
  loading: boolean
  /** Why the bibliography could not be loaded, already in Spanish. */
  loadError: string | null
  /** Writes the column. Answers null when it went in, or the sentence to show. */
  onSave: (referenceId: string | null) => Promise<string | null>
  onClose: () => void
}) {
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)

  const blocked = catalogueChoiceBlockedReason(cataloguePublished)
  // `citedIds` empty: here there is no «already cited» to mark — what is chosen is ONE
  // reference and they do not accumulate—, so the artwork record's selector's mark does not
  // apply. The one already recorded is pointed out separately, further down.
  const empty = useMemo(() => new Set<string>(), [])
  const offered = useMemo(() => referenceOptions(references, empty), [references, empty])
  const matches = useMemo(
    () => searchReferenceOptions(references, empty, query),
    [references, empty, query],
  )

  async function choose(referenceId: string | null) {
    setFailure(null)
    const plan = planCatalogueReference({ cataloguePublished, current, chosen: referenceId })
    if (plan.action === 'blocked') {
      setFailure(plan.message)
      return
    }
    if (plan.action === 'unchanged') {
      onClose()
      return
    }
    setBusy(true)
    const problem = await onSave(plan.action === 'clear' ? null : plan.referenceId)
    setBusy(false)
    if (problem !== null) {
      setFailure(problem)
      return
    }
    onClose()
  }

  return (
    <BottomSheet
      open
      onClose={busy ? () => {} : onClose}
      title="El catálogo de esta exposición"
    >
      {blocked !== null && (
        <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{blocked}</p>
      )}

      {loadError !== null && (
        <p role="alert" className="mt-2 rounded-lg bg-red-50 p-3 text-sm text-red-800">
          {loadError}
        </p>
      )}

      {blocked === null && (
        <>
          <p className="mt-2 text-xs text-stone-500">
            Elige la referencia del catálogo. Si no está, cítala antes desde una obra.
          </p>

          <input
            id="catalogue-reference-search"
            className="field mt-2"
            type="search"
            value={query}
            disabled={busy}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Autor, título, año, revista o lugar"
            aria-label="Buscar una referencia de la bibliografía"
            autoComplete="off"
            autoCapitalize="none"
          />

          {/* Nunca una lista vacía: los tres casos —bibliografía vacía, nada teclado y
              sin coincidencias— dicen cosas distintas. */}
          {matches.length === 0 ? (
            <p className="mt-2 rounded-lg bg-stone-100 p-3 text-sm text-stone-600">
              {loading ? 'Cargando la bibliografía…' : noCatalogueOptionsText(offered.length, query)}
            </p>
          ) : (
            <ul className="mt-2 space-y-1">
              {matches.map(({ item, indices }) => (
                <li key={item.id}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void choose(item.id)}
                    className={`flex min-h-touch w-full flex-col items-start rounded-lg px-3 py-2 text-left active:bg-stone-100 ${
                      item.id === current ? 'bg-stone-100' : ''
                    }`}
                  >
                    <span className="break-words text-sm font-medium">
                      <Marked text={item.text} indices={indices} />
                    </span>
                    <span className="break-words text-xs text-stone-500">{item.hint}</span>
                    {item.id === current && (
                      <span className="mt-1 text-xs text-stone-600">
                        Es la que consta ahora mismo.
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {failure !== null && (
        <p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-800">
          {failure}
        </p>
      )}

      {/* Quitar el vínculo se ofrece siempre que haya uno, también con la ficha en «No»:
          es la única salida de una fila incoherente. */}
      <div className="mt-3 grid grid-cols-2 gap-2">
        {current !== null ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void choose(null)}
            className="btn min-h-touch border border-stone-600 text-sm disabled:opacity-60"
          >
            Dejar de decir cuál es
          </button>
        ) : (
          <span />
        )}
        <button type="button" disabled={busy} onClick={onClose} className="btn-secondary">
          {busy ? 'Guardando…' : 'Cancelar'}
        </button>
      </div>
    </BottomSheet>
  )
}
