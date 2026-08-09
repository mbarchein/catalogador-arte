import { useState } from 'react'
import { DraftOfferBanner } from '../../../components/DraftOfferBanner'
import { draftFingerprint } from '../../../components/draftStore'
import { draftDirty } from '../../../components/formDirty'
import { useFormDraft } from '../../../components/useFormDraft'
import { BottomSheet, Chips, ToggleChip, YearStepper } from '../../../components/ui'
import { useSheetGuard } from '../../../components/useSheetGuard'
import {
  PROVENANCE_ACQUISITION_LABEL,
  PROVENANCE_CAPACITY_LABEL,
  type ProvenanceAcquisition,
  type ProvenanceCapacity,
} from '../../../lib/types'
import type { PartyRef } from '../documentaryFormat'
import { PartyPicker } from './PartyPicker'
import type { NewPartyDraft } from './partyChoice'
import {
  STEP_MIN_YEAR,
  draftDatePreview,
  draftProblems,
  problemsOf,
  stepMaxYear,
  type ProvenanceDraft,
} from './provenanceDraft'

/**
 * Writing or correcting one link of the chain (RF-509).
 *
 * A sheet over the record and not a page of its own: a link is written with the
 * chain in front — «and after the family, the museum» — and losing sight of what
 * is already there is what produces the duplicate link and the wrong order.
 *
 * **Nothing here decides whether it can be saved.** What is missing, which
 * combination the database refuses and what the stored date will look like come
 * from `provenanceDraft.ts`, which is pure and verified. This file places the
 * controls and hands the answer over.
 *
 * The two enums are asked as two questions and never merged, which is the whole
 * point of splitting the `estatus_legal` of the old field schema: «en depósito»
 * answers on what terms, «donación» answers how it arrived, and an artwork can be
 * on deposit having got there as a gift.
 */
export function ProvenanceLinkForm({
  initial,
  parties,
  onSave,
  catalogId,
  onCancel,
  onCreateParty,
  saving = false,
  partiesLoading = false,
  partiesError = null,
}: {
  initial: ProvenanceDraft
  parties: readonly PartyRef[]
  /** Answers null when it worked, and the database's own message when it did not. */
  onSave: (draft: ProvenanceDraft) => Promise<string | null>
  /**
   * De qué obra es esta cadena, para la clave del borrador apuntado.
   *
   * Lo pasa la sección porque este formulario no sabe de qué obra es —recibe el eslabón y
   * nada más— y la clave tiene que distinguirlas: si no, un eslabón a medio escribir en
   * una obra se ofrecería al añadir uno en otra.
   */
  catalogId: string
  onCancel: () => void
  onCreateParty: (draft: NewPartyDraft) => Promise<{ id: string } | { error: string }>
  saving?: boolean
  /** The register of people and institutions is on its way, or did not arrive. */
  partiesLoading?: boolean
  partiesError?: string | null
}) {
  const [draft, setDraft] = useState(initial)
  const [showProblems, setShowProblems] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Whether the tenure has a closing year. Kept apart from the value so that
  // switching it off and on again does not silently resurrect an old year.
  const [ranged, setRanged] = useState(initial.endYear !== null)

  const problems = draftProblems(draft)
  const preview = draftDatePreview(draft)

  function set<K extends keyof ProvenanceDraft>(field: K, value: ProvenanceDraft[K]) {
    setDraft((current) => ({ ...current, [field]: value }))
  }

  async function save() {
    if (problems.length > 0) {
      setShowProblems(true)
      return
    }
    setError(null)
    const failure = await onSave(draft)
    if (failure !== null) {
      setError(failure)
      return
    }
    stored.clear()
  }

  // Contra el punto de partida, que sirve igual para el eslabón nuevo —el borrador llega
  // vacío— y para el que se está corrigiendo.
  const dirty = draftDirty(draft, initial)

  // Y apuntado. El ámbito distingue el eslabón nuevo del que se corrige: `nuevo` es uno
  // por obra, que es lo correcto —solo se añade uno a la vez— y así el borrador de un alta
  // no se ofrece al abrir la corrección de otro eslabón.
  const stored = useFormDraft({
    scope: `procedencia:${catalogId}:${initial.id ?? 'nuevo'}`,
    draft,
    dirty,
    fingerprint:
      initial.id === null
        ? null
        : draftFingerprint(Object.values(initial) as (string | number | boolean | null)[]),
  })

  const guard = useSheetGuard({ onClose: onCancel, dirty, draftKept: true })

  return (
    <BottomSheet
      guard={guard}
      open
      onClose={onCancel}
      title={initial.id === null ? 'Añadir un eslabón' : 'Corregir el eslabón'}
    >
      <DraftOfferBanner
        offer={stored.offer}
        onAccept={() => {
          const recovered = stored.accept()
          if (recovered === null) return
          setDraft(recovered)
          // El interruptor de «hasta» se recoloca con lo recuperado: dejarlo apagado sobre
          // un borrador que traía año de cierre esconderría ese año en un campo invisible.
          setRanged(recovered.endYear !== null)
        }}
        onDiscard={stored.discard}
      />

      <div className="space-y-4">
        <PartyPicker
          parties={parties}
          partyId={draft.partyId}
          partyNote={draft.partyNote}
          onPick={(partyId) => set('partyId', partyId)}
          onWrite={(note) => set('partyNote', note)}
          onCreate={onCreateParty}
          disabled={saving}
          loading={partiesLoading}
          loadError={partiesError}
        />
        {showProblems &&
          problemsOf(problems, 'party').map((problem) => (
            <p key={problem.text} role="alert" className="rounded-lg bg-red-50 p-2 text-sm text-red-800">
              {problem.text}
            </p>
          ))}

        <Chips
          id="prov-capacity"
          label="En qué calidad la tuvo"
          columns={2}
          options={(Object.keys(PROVENANCE_CAPACITY_LABEL) as ProvenanceCapacity[]).map((value) => ({
            value,
            text: PROVENANCE_CAPACITY_LABEL[value],
          }))}
          value={draft.capacity}
          onChange={(value) => set('capacity', value)}
        />

        <Chips
          id="prov-acquisition"
          label="Cómo llegó a sus manos"
          columns={2}
          options={(Object.keys(PROVENANCE_ACQUISITION_LABEL) as ProvenanceAcquisition[]).map(
            (value) => ({ value, text: PROVENANCE_ACQUISITION_LABEL[value] }),
          )}
          value={draft.acquisition}
          onChange={(value) => set('acquisition', value)}
        />

        {/* «Se desconoce» y «Sin revisar» están los dos en la lista y no son lo
            mismo: uno es el resultado de haber buscado. */}
        <p className="text-xs text-stone-500">
          «Se desconoce» es haber buscado sin encontrarlo. «Sin revisar» es que nadie lo ha mirado.
        </p>

        <div>
          <span className="label">Entre qué años</span>
          <div className={ranged ? 'grid grid-cols-2 gap-2' : ''}>
            <YearStepper
              id="prov-start"
              label={ranged ? 'Desde' : 'Año'}
              compact={ranged}
              value={draft.startYear}
              min={STEP_MIN_YEAR}
              max={stepMaxYear()}
              onChange={(year) => set('startYear', year)}
            />
            {ranged && (
              <YearStepper
                id="prov-end"
                label="Hasta"
                compact
                value={draft.endYear}
                min={STEP_MIN_YEAR}
                max={stepMaxYear()}
                onChange={(year) => set('endYear', year)}
              />
            )}
          </div>

          <div className="mt-2 grid grid-cols-3 gap-2">
            <ToggleChip
              label="Hasta un año"
              active={ranged}
              onChange={(value) => {
                setRanged(value)
                if (!value) set('endYear', null)
              }}
            />
            <ToggleChip
              label="Aproximada"
              active={draft.approximate}
              onChange={(value) => set('approximate', value)}
            />
            <ToggleChip
              label="Sin confirmar"
              active={draft.unconfirmed}
              onChange={(value) => set('unconfirmed', value)}
            />
          </div>

          <p className="mt-2 text-xs text-stone-500">
            Sin año final, el eslabón dice desde cuándo y no hasta cuándo.
          </p>

          {showProblems &&
            [...problemsOf(problems, 'years'), ...problemsOf(problems, 'flags')].map((problem) => (
              <p
                key={problem.text}
                role="alert"
                className="mt-2 rounded-lg bg-red-50 p-2 text-sm text-red-800"
              >
                {problem.text}
              </p>
            ))}
        </div>

        <div>
          <label className="label" htmlFor="prov-date-note">
            Fecha escrita a mano
          </label>
          <input
            id="prov-date-note"
            className="field"
            value={draft.dateNote}
            onChange={(event) => set('dateNote', event.target.value)}
            placeholder="finales de los setenta"
          />
          <p className="mt-1 text-xs text-stone-500">
            Esto es lo que se imprime, por encima de los años. Los años siguen ordenando la cadena.
          </p>
        </div>

        {/* La fecha tal como la compondrá la base: no una aproximación. */}
        <p aria-live="polite" className="rounded-lg bg-stone-100 px-3 py-2 text-sm">
          {preview === '' ? (
            <span className="text-stone-500">Eslabón sin fechar</span>
          ) : (
            <>
              Se guardará como <span className="font-medium">{preview}</span>
            </>
          )}
        </p>

        <div>
          <label className="label" htmlFor="prov-note">
            De dónde sale el dato
          </label>
          <textarea
            id="prov-note"
            className="field"
            rows={2}
            value={draft.note}
            onChange={(event) => set('note', event.target.value)}
            placeholder="según el catálogo de la exposición de 1985"
          />
          <p className="mt-1 text-xs text-stone-500">
            La fuente y su fiabilidad, para poder comprobarlo dentro de diez años.
          </p>
        </div>

        {error && (
          <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">
            No se ha podido guardar: {error}
          </p>
        )}

        <div className="grid grid-cols-2 gap-2">
          <button type="button" disabled={saving} onClick={() => void save()} className="btn-primary">
            {saving ? 'Guardando…' : initial.id === null ? 'Añadir al final' : 'Guardar'}
          </button>
          <button type="button" disabled={saving} onClick={onCancel} className="btn-secondary">
            Cancelar
          </button>
        </div>
      </div>
    </BottomSheet>
  )
}
