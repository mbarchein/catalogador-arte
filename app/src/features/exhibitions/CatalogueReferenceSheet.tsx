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
 * Elegir cuál de las referencias de la bibliografía es el catálogo de esta muestra
 * (RF-503, RF-506).
 *
 * El selector que le faltaba a la columna `catalogue_reference_id`, que existía desde la
 * primera migración de exposiciones y que ninguna pantalla podía fijar. Reutiliza el
 * buscador de referencias de la ficha de obra (`searchReferenceOptions`) tal cual: se
 * busca una referencia igual desde una obra que la cita que desde la muestra cuyo
 * catálogo es.
 *
 * **Lo primero que se lee es la negativa, cuando la hay**: la base ata el vínculo a
 * `catalogue_published`, así que si no consta que hubo catálogo esto no se puede guardar,
 * y se dice antes de que se elija nada — con dos frases distintas, porque «sin revisar» y
 * «No» llevan a hacer cosas distintas. Lo decide `catalogueChoiceBlockedReason`.
 *
 * Y quitar el vínculo se ofrece siempre que haya uno, también sobre una ficha incoherente:
 * es la única salida de una fila que hubiera llegado por SQL.
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
  /** La referencia que consta hoy, o null. */
  current: string | null
  references: readonly ReferenceRow[]
  loading: boolean
  /** Por qué no se ha podido cargar la bibliografía, ya en español. */
  loadError: string | null
  /** Escribe la columna. Responde null cuando entró, o la frase que mostrar. */
  onSave: (referenceId: string | null) => Promise<string | null>
  onClose: () => void
}) {
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)

  const blocked = catalogueChoiceBlockedReason(cataloguePublished)
  // `citedIds` vacío: aquí no hay «ya citada» que marcar — lo que se elige es UNA
  // referencia y no se acumulan—, así que la marca del selector de la ficha de obra no
  // aplica. La que ya consta se señala aparte, más abajo.
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
            El catálogo de una muestra no es una tabla aparte: es una referencia de la bibliografía.
            Elige la que sea, y si todavía no está, se da de alta citándola desde una obra que
            aparezca en él.
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
