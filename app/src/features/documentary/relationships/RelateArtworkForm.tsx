import { useMemo, useState } from 'react'
import { PlusIcon, RadioList } from '../../../components/ui'
import type { RelationshipRow } from '../documentaryRows'
import type { RelatedArtworkRow } from './relatedArtworks'
import { relateArtworks } from './relateActions'
import {
  artworkChoices,
  chosenArtwork,
  directionOptions,
  planRelation,
  type RelationDirection,
} from './relateForm'
import { useCatalogArtworks } from './useCatalogArtworks'
import { useRelationshipTypes } from './useRelationshipTypes'

/**
 * Registering a relationship between this artwork and another one (RF-217).
 *
 * Three questions in the order they can be answered — which artwork, of what
 * kind, which way round — and the third one only when it exists: a symmetric
 * kind has one reading and asking about it would invent a decision.
 *
 * **Nothing here decides anything.** Which artworks are on offer, what each
 * direction means, whether the pair can be registered and with which arguments
 * are all answered by `relateForm.ts`, which the battery can reach. What is left
 * in this file is the fold of the panel and the plumbing of the request — and the
 * one thing a component must not get wrong, the direction of an asymmetric
 * relationship, is chosen from two sentences that name both artworks.
 */
export function RelateArtworkForm({
  catalogId,
  related,
  existing,
  onDone,
  onCancel,
}: {
  catalogId: string
  /** What is already related, to mark it in the list instead of hiding it. */
  related: readonly RelatedArtworkRow[]
  /** The active relationships of this artwork, for the refusals said in advance. */
  existing: readonly RelationshipRow[]
  /** Reloads the block. The relationships do not arrive by Realtime. */
  onDone: () => Promise<void>
  onCancel: () => void
}) {
  const { catalog, loading: catalogLoading } = useCatalogArtworks()
  const { offered, loading: typesLoading, error: typesError } = useRelationshipTypes()

  const [query, setQuery] = useState('')
  const [otherCatalogId, setOther] = useState('')
  const [typeId, setTypeId] = useState('')
  const [direction, setDirection] = useState<RelationDirection>('THIS_TO_OTHER')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  const choices = useMemo(
    () => artworkChoices(catalog, query, catalogId, related),
    [catalog, query, catalogId, related],
  )
  const chosen = chosenArtwork(catalog, otherCatalogId)
  const type = offered.find((entry) => entry.id === typeId) ?? null
  const directions = type ? directionOptions(type, catalogId, otherCatalogId) : []

  async function save() {
    setSaving(true)
    setProblem(null)
    const plan = planRelation(
      { catalogId, otherCatalogId, type, direction, note },
      existing,
    )
    if (!plan.ok) {
      setProblem(plan.problem)
      setSaving(false)
      return
    }
    const failure = await relateArtworks(plan.args)
    if (failure) {
      // The database's own sentence, verbatim: it is in Spanish, it says what to
      // do first, and it knows about relationships written a minute ago by
      // somebody else that this panel never loaded.
      setProblem(failure)
      setSaving(false)
      return
    }
    await onDone()
  }

  return (
    <div className="space-y-3">
      {/* 1 · WHICH ARTWORK. Chosen first because both other questions read its
          code out loud, and choosing a kind before knowing the pair would ask
          about a sentence with a hole in it. */}
      {chosen ? (
        <div className="flex items-center gap-2 rounded-lg border border-stone-300 bg-stone-50 p-2">
          <span className="min-w-0 flex-1">
            <span className="block font-mono text-xs font-semibold">{chosen.catalogId}</span>
            <span className="block truncate text-sm">{chosen.title}</span>
            <span className="block text-xs text-stone-500">{chosen.byline}</span>
          </span>
          <button
            type="button"
            onClick={() => {
              setOther('')
              setProblem(null)
            }}
            className="btn-secondary min-h-touch shrink-0 px-3 text-sm"
          >
            Cambiar
          </button>
        </div>
      ) : (
        <div>
          <label className="label" htmlFor="relate-search">
            Obra con la que se relaciona
          </label>
          <input
            id="relate-search"
            className="field"
            type="search"
            autoComplete="off"
            autoCapitalize="characters"
            placeholder="Código o título"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          {catalogLoading && choices.length === 0 ? (
            <p className="p-2 text-sm text-stone-600">Cargando el catálogo…</p>
          ) : choices.length === 0 ? (
            /* Never a blank list under a search field: it reads as «no hay obras». */
            <p className="p-2 text-sm text-stone-600">
              {catalog.length === 0
                ? 'No se ha podido cargar el catálogo en este dispositivo. Vuelve a intentarlo donde haya cobertura.'
                : 'Ninguna obra coincide con la búsqueda.'}
            </p>
          ) : (
            <ul className="mt-1 max-h-64 overflow-y-auto rounded-lg border border-stone-200">
              {choices.map((choice) => (
                <li key={choice.catalogId} className="border-b border-stone-100 last:border-0">
                  <button
                    type="button"
                    onClick={() => {
                      setOther(choice.catalogId)
                      setProblem(null)
                    }}
                    className="flex min-h-touch w-full items-center gap-2 px-3 py-2 text-left active:bg-stone-100"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block font-mono text-xs font-semibold">
                        {choice.catalogId}
                      </span>
                      <span className="block truncate text-sm">{choice.title}</span>
                      {/* Already related, and still on offer: two different kinds
                          between the same pair do coexist. */}
                      {choice.existing.length > 0 && (
                        <span className="block text-xs text-amber-800">
                          Ya consta: {choice.existing.join(' · ')}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* 2 · WHAT KIND. The hint of each one says what the OTHER record will end
          up showing, which is the half of the decision that is invisible here. */}
      <div>
        <span className="label">Tipo de relación</span>
        {typesError ? (
          <p role="alert" className="rounded-lg bg-red-50 p-2 text-sm text-red-800">
            No se ha podido cargar el catálogo de tipos de relación. ({typesError})
          </p>
        ) : typesLoading ? (
          <p className="p-2 text-sm text-stone-600">Cargando…</p>
        ) : offered.length === 0 ? (
          <p className="p-2 text-sm text-stone-600">
            No hay ningún tipo de relación disponible en el catálogo compartido.
          </p>
        ) : (
          <RadioList
            options={offered.map((entry) => ({
              value: entry.id,
              text: entry.name,
              hint: entry.is_symmetric
                ? 'Simétrica: las dos fichas dicen lo mismo'
                : `La otra ficha dirá «${entry.inverse_name}»`,
            }))}
            value={typeId}
            onChange={(value) => {
              setTypeId(value)
              setDirection('THIS_TO_OTHER')
              setProblem(null)
            }}
          />
        )}
      </div>

      {/* 3 · WHICH WAY ROUND. Only when the kind has two readings; with a single
          one the sentence is shown as what will be recorded, not as a choice. */}
      {directions.length > 1 ? (
        <div>
          <span className="label">Cómo se lee la relación</span>
          <RadioList
            options={directions.map((option) => ({
              value: option.value,
              text: option.text,
              hint: option.hint,
            }))}
            value={direction}
            onChange={(value) => {
              setDirection(value)
              setProblem(null)
            }}
          />
        </div>
      ) : (
        directions.map((option) => (
          <p key={option.value} className="rounded-lg bg-stone-100 p-2 text-sm">
            Se registrará «{option.text}». {option.hint}
          </p>
        ))
      )}

      <div>
        <label className="label" htmlFor="relate-note">
          Nota (opcional)
        </label>
        <textarea
          id="relate-note"
          className="field"
          rows={2}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="el reverso se separó del soporte en la restauración de 1998"
        />
        <p className="mt-1 text-xs text-stone-500">
          La circunstancia de esta relación concreta, no del tipo.
        </p>
      </div>

      {problem && (
        <p role="alert" className="rounded-lg bg-red-50 p-2 text-sm text-red-800">
          {problem}
        </p>
      )}

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={saving}
          onClick={() => void save()}
          className="btn-primary min-h-touch"
        >
          <PlusIcon className="h-5 w-5" />
          {saving ? 'Guardando…' : 'Relacionar'}
        </button>
        <button type="button" disabled={saving} onClick={onCancel} className="btn-secondary">
          Cancelar
        </button>
      </div>
    </div>
  )
}
