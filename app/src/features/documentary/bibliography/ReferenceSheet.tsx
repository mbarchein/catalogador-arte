import { useMemo, useState } from 'react'
import { draftDirty } from '../../../components/formDirty'
import { DraftOfferBanner } from '../../../components/DraftOfferBanner'
import { draftFingerprint } from '../../../components/draftStore'
import { useFormDraft } from '../../../components/useFormDraft'
import { BottomSheet, Chips, SheetFooter, YearStepper } from '../../../components/ui'
import { useSheetGuard } from '../../../components/useSheetGuard'
import { maxYear } from '../../../lib/structuredDate'
import type { MasterRef, ReferenceRow } from '../documentaryRows'
import { MIN_REFERENCE_YEAR } from './citationFormat'
import {
  referenceEdit,
  referenceReachNotice,
  referenceRetiredNotice,
  referenceTitleText,
  referenceTypeOptions,
  type ReferenceEdit,
} from './referenceEdit'

/**
 * The panel that corrects a reference of the catalogue from the record of an
 * artwork that cites it.
 *
 * **A SEPARATE panel from `CitationSheet`, and that is the design and not an
 * accident of the code.** They look alike and they write two different scopes:
 * the citation sheet corrects the page where THIS artwork appears, which belongs
 * to this record, while this one corrects the publication itself, which belongs
 * to the catalogue and is read from every record citing it. One form holding both
 * would let a cataloger fix a page and rename a book in the same gesture without
 * ever seeing the difference — so the two are two panels, and this one opens with
 * the reach of what it is about to do (`referenceReachNotice`) above the fields
 * and not under the button.
 *
 * Nothing here decides any wording: the warning, the state of a retired
 * reference, what is missing, what the write means and what a refusal says are in
 * `referenceEdit.ts`, where the battery reaches them — it runs in node and cannot
 * open a component. What is left here is the fold, the keyboard and the order of
 * the fields.
 */
export function ReferenceSheet({
  open,
  onClose,
  reference,
  publicationTypes,
  otherArtworks,
  onSave,
}: {
  open: boolean
  onClose: () => void
  /**
   * The reference as the record already read it, embedded in the citation: no
   * second query to open the panel, and no chance of showing a copy that
   * disagrees with the row underneath.
   */
  reference: ReferenceRow
  publicationTypes: readonly MasterRef[]
  /** Other artworks citing it, or null while unknown. Feeds the warning, verbatim. */
  otherArtworks: number | null
  /** Resolves to null when it was saved, and to the sentence to show when not. */
  onSave: (draft: ReferenceEdit) => Promise<string | null>
}) {
  // Seeded once from the row: the section remounts this sheet on every opening
  // (see its `key`), so there is no stale draft to synchronize.
  const [draft, setDraft] = useState<ReferenceEdit>(() => referenceEdit(reference))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const retired = referenceRetiredNotice(reference)
  const reach = referenceReachNotice(otherArtworks)

  // Which kinds are on offer, and above all which one has to stay on the list so
  // that a classification is not lost by tapping around: decided in
  // `referenceTypeOptions`, where the battery reaches it.
  const typeOptions = useMemo(
    () =>
      referenceTypeOptions(publicationTypes, draft.publicationTypeId, reference.publication_type),
    [publicationTypes, draft.publicationTypeId, reference.publication_type],
  )

  async function save() {
    setError(null)
    setBusy(true)
    const failure = await onSave(draft)
    setBusy(false)
    if (failure !== null) {
      setError(failure)
      return
    }
    stored.clear()
    onClose()
  }

  // Not losing the correction to a brush. Against the stored row, which is where the draft
  // came from: this reference is read by every artwork that cites it.
  const dirty = draftDirty(draft, referenceEdit(reference))

  // Y apuntada, con huella: esta fila la corrigen desde la ficha de la referencia y desde
  // la bibliografía de cualquier obra que la cite, así que es de las más expuestas a que
  // otra sesión la haya tocado mientras el borrador esperaba.
  const stored = useFormDraft({
    scope: `referencia-editar:${reference.id}`,
    draft,
    dirty,
    fingerprint: draftFingerprint(
      Object.values(referenceEdit(reference)) as (string | number | boolean | null)[],
    ),
  })

  const guard = useSheetGuard({ onClose, dirty, draftKept: true })

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="Corregir la referencia"
      guard={guard}
    >
      <DraftOfferBanner
        offer={stored.offer}
        onAccept={() => {
          const recovered = stored.accept()
          if (recovered !== null) setDraft(recovered)
        }}
        onDiscard={stored.discard}
      />

      <div className="space-y-3">
        {/* Lo primero que se lee, antes de cualquier campo: lo que se corrige no
            es un dato de esta obra. Con el número de obras afectadas cuando se ha
            podido contar. */}
        <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{reach}</p>

        {retired !== null && (
          <p className="rounded-lg bg-stone-100 p-3 text-sm text-stone-700">{retired}</p>
        )}

        <div>
          <label className="label" htmlFor="reference-title">
            Título
          </label>
          <input
            id="reference-title"
            className="field"
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          />
        </div>

        <div>
          <label className="label" htmlFor="reference-authors">
            Autoría
          </label>
          <input
            id="reference-authors"
            className="field"
            value={draft.authors}
            onChange={(e) => setDraft({ ...draft, authors: e.target.value })}
            placeholder="Sin firma, si no la lleva"
          />
        </div>

        <div>
          <label className="label" htmlFor="reference-editors">
            Edición o coordinación
          </label>
          <input
            id="reference-editors"
            className="field"
            value={draft.editors}
            onChange={(e) => setDraft({ ...draft, editors: e.target.value })}
            placeholder="Quien firma el volumen, si no es la autoría"
          />
          {/* La ficha imprime «(ed.)» detrás de esto cuando no hay autoría, y por
              eso está aquí: es un dato que se lee en la ficha de cada obra. */}
        </div>

        <div>
          <label className="label" htmlFor="reference-container">
            Revista, periódico o volumen
          </label>
          <input
            id="reference-container"
            className="field"
            value={draft.containerTitle}
            onChange={(e) => setDraft({ ...draft, containerTitle: e.target.value })}
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="label" htmlFor="reference-place">
              Lugar
            </label>
            <input
              id="reference-place"
              className="field"
              value={draft.place}
              onChange={(e) => setDraft({ ...draft, place: e.target.value })}
            />
          </div>
          <div>
            <label className="label" htmlFor="reference-publisher">
              Editorial
            </label>
            <input
              id="reference-publisher"
              className="field"
              value={draft.publisher}
              onChange={(e) => setDraft({ ...draft, publisher: e.target.value })}
            />
          </div>
        </div>

        <YearStepper
          id="reference-year"
          label="Año de publicación"
          value={draft.year}
          onChange={(year) => setDraft({ ...draft, year })}
          min={MIN_REFERENCE_YEAR}
          max={maxYear()}
          compact
        />
        <p className="-mt-2 text-xs text-stone-500">
          Déjalo vacío si la publicación no lleva año: se cita como «s.f.».
        </p>

        <Chips
          id="reference-type"
          label="Tipo de publicación"
          columns={2}
          options={typeOptions}
          value={draft.publicationTypeId ?? ''}
          onChange={(value) =>
            setDraft({ ...draft, publicationTypeId: value === '' ? null : value })
          }
        />

        <div>
          <label className="label" htmlFor="reference-bibtex-key">
            Clave BibTeX
          </label>
          <input
            id="reference-bibtex-key"
            className="field font-mono"
            value={draft.bibtexKey}
            onChange={(e) => setDraft({ ...draft, bibtexKey: e.target.value })}
            placeholder="rotili1985muba"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
          <p className="mt-1 text-xs text-stone-500">
            Asa corta, sin espacios ni comas y sin repetir. Puede quedar vacía.
          </p>
        </div>

        {error !== null && (
          <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">
            {error}
          </p>
        )}

        {/* Qué se está corrigiendo, en gris y por encima de los botones: el título
            editable de arriba puede estar a medio escribir, y esto es la referencia
            tal como está guardada ahora mismo. Iba debajo, y con los botones pegados
            al borde de la hoja lo de debajo ya no existe. */}
        <p className="text-xs text-stone-400">
          Estás corrigiendo «{referenceTitleText(reference)}».
        </p>

        <SheetFooter>
          <button
            type="button"
            disabled={busy}
            onClick={() => void save()}
            className="btn min-h-touch flex-1 bg-stone-900 text-white"
          >
            {busy ? 'Guardando…' : 'Guardar la referencia'}
          </button>
          <button type="button" disabled={busy} onClick={guard.cancel} className="btn-secondary">
            Cancelar
          </button>
        </SheetFooter>
      </div>
    </BottomSheet>
  )
}
