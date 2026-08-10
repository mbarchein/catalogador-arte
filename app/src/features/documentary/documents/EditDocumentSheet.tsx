import { useState } from 'react'
import { draftDirty } from '../../../components/formDirty'
import { DraftOfferBanner } from '../../../components/DraftOfferBanner'
import { draftFingerprint } from '../../../components/draftStore'
import { useFormDraft } from '../../../components/useFormDraft'
import { BottomSheet, SheetFooter } from '../../../components/ui'
import { useSheetGuard } from '../../../components/useSheetGuard'
import type { PlaceTree } from '../../../lib/places'
import type { DocumentTypeEntry } from '../../../lib/types'
import type { SeriesTree } from '../../tables/archiveSeries'
import { DocumentFieldsForm } from './DocumentFieldsForm'
import type { DocumentFields } from './documentDraft'
import {
  documentEditDraft,
  documentEditedNotice,
  documentReachNotice,
  documentRetiredNotice,
  planDocumentEdit,
  type EditableDocument,
} from './documentEdit'
import { useDocumentUsage } from './useDocumentUsage'

/**
 * Correcting the data of an archive document, from the record of an artwork
 * linked to it (RF-515, RF-516).
 *
 * **It is corrected from where it is used, and not from a record of its own**, which is the same
 * decision the bibliographic reference panel took and for the same reason: the
 * document does not have its own screen yet, and waiting to have one left the shelfmark
 * badly copied inside the catalogue forever. The day it has one, this panel is its
 * editing area and there is nothing to rewrite.
 *
 * What the panel has to say before a field is touched is that **this is not
 * a datum of this artwork**: the warning above says so with the scope counted —how many
 * other artworks and how many exhibitions read the same thing— because «the others will see it» does not
 * change any decision and «the other three artworks will see it» does.
 *
 * The link's note goes in the same panel and apart, with its own title: it is the only
 * thing here that IS this artwork's. Both were without any screen —the
 * operation that stores it existed and nobody called it— and separating them into two sheets
 * would have been asking for two gestures to correct a document being looked at once.
 *
 * Nothing here decides anything: the fields are `DocumentFieldsForm`, and what has changed, what
 * is sent and what is said are answered by `documentEdit.ts`, which the suite reaches.
 */
export function EditDocumentSheet({
  catalogId,
  document,
  linkNote,
  documentTypes,
  seriesTree,
  placeTree,
  mastersError,
  onSave,
  onSaveLinkNote,
  onClose,
  onDone,
}: {
  catalogId: string
  document: EditableDocument & { title: string }
  /** What this document says about THIS artwork, from the bridge row. */
  linkNote: string
  documentTypes: readonly DocumentTypeEntry[]
  seriesTree: SeriesTree
  placeTree: PlaceTree
  mastersError: string | null
  /** Writes `archive_documents`. Answers null when it went in, or the sentence to show. */
  onSave: (payload: Record<string, unknown>) => Promise<string | null>
  /** Writes the bridge row's note. Only called if it changed. */
  onSaveLinkNote: (note: string) => Promise<string | null>
  onClose: () => void
  onDone: (notice: string) => Promise<void>
}) {
  const [draft, setDraft] = useState<DocumentFields>(() => documentEditDraft(document))
  const [note, setNote] = useState(linkNote)
  const [saving, setSaving] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const [unchanged, setUnchanged] = useState(false)

  const reach = useDocumentUsage(document.id, catalogId, true)
  const retired = documentRetiredNotice(document)

  function change(patch: Partial<DocumentFields>) {
    setFailure(null)
    setUnchanged(false)
    setDraft((was) => ({ ...was, ...patch }))
  }

  async function save() {
    setFailure(null)
    setUnchanged(false)
    const plan = planDocumentEdit(document, draft)
    const noteChanged = note.trim() !== linkNote.trim()

    if (plan.action === 'problems') {
      // The warnings are already painted next to each field by the shared
      // form; what is missing here is the button saying why it has done nothing.
      setFailure('Revisa lo que está marcado más arriba: la base rechazaría el documento así.')
      return
    }
    if (plan.action === 'unchanged' && !noteChanged) {
      // It is not an error and it is not painted as one. And above all it is not stored: writing the
      // row would move `updated_at` and would leave a history entry for a change
      // nobody has made (RF-1501).
      setUnchanged(true)
      return
    }

    setSaving(true)
    // First the document and then the note, and both separately on purpose: they are
    // two tables and there is no transaction joining them from the client. If the second
    // fails, the first is done and it has to be said, because trying again
    // would store the same thing over.
    if (plan.action === 'update') {
      const problem = await onSave(plan.payload)
      if (problem !== null) {
        setSaving(false)
        setFailure(problem)
        return
      }
    }
    if (noteChanged) {
      const problem = await onSaveLinkNote(note)
      if (problem !== null) {
        setSaving(false)
        setFailure(
          plan.action === 'update'
            ? `Los datos del documento sí se han corregido, pero lo que dice de ${catalogId} no: ${problem}`
            : problem,
        )
        return
      }
    }
    setSaving(false)
    stored.clear()
    await onDone(
      plan.action === 'update'
        ? documentEditedNotice(draft.title)
        : `Se ha guardado lo que este documento dice de ${catalogId}.`,
    )
    onClose()
  }

  // The unsaved correction, on both sides this sheet writes: the document's fields
  // —against the stored row, which is where the draft came from— and the note of the
  // link with this artwork.
  const dirty = draftDirty(draft, documentEditDraft(document)) || note.trim() !== linkNote.trim()

  // What was written is noted down and offered on returning. With the stored row's fingerprint: if another
  // session has corrected the document while this was waiting, recovering the draft
  // would revert that correction, and that is said beforehand instead of letting it pass in silence.
  // Only with the fields THIS form writes: if they have touched something it does not touch, the
  // draft is still valid and warning would be warning about nothing.
  const stored = useFormDraft({
    scope: `documento-editar:${document.id}:${catalogId}`,
    draft: { ...draft, linkNote: note },
    dirty,
    fingerprint: draftFingerprint([
      ...Object.values(documentEditDraft(document)) as (string | number | boolean | null)[],
      linkNote,
    ]),
  })

  const guard = useSheetGuard({
    onClose: saving ? () => {} : onClose,
    dirty,
    draftKept: true,
  })

  return (
    <BottomSheet
      open
      onClose={saving ? () => {} : onClose}
      title="Corregir los datos del documento"
      guard={guard}
    >
      <DraftOfferBanner
        offer={stored.offer}
        onAccept={() => {
          const recovered = stored.accept()
          if (recovered === null) return
          const { linkNote: recoveredNote, ...fields } = recovered
          setDraft(fields)
          setNote(recoveredNote)
        }}
        onDiscard={stored.discard}
      />

      {/* Lo primero y antes de cualquier campo: esto es del archivo y no de esta obra. */}
      <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-900">
        {documentReachNotice(reach)}
      </p>
      {retired !== null && (
        <p className="mt-2 rounded-lg bg-stone-100 p-3 text-xs text-stone-700">{retired}</p>
      )}

      <div className="mt-3">
        <DocumentFieldsForm
          idPrefix="edit-document"
          draft={draft}
          onChange={change}
          disabled={saving}
          documentTypes={documentTypes}
          seriesTree={seriesTree}
          placeTree={placeTree}
          mastersError={mastersError}
        />
      </div>

      {/* La única cosa de este panel que sí es de esta obra. */}
      <div className="mt-3 border-t border-stone-200 pt-3">
        <label className="label" htmlFor="edit-document-link-note">
          Qué dice de esta obra (opcional)
        </label>
        <textarea
          id="edit-document-link-note"
          className="field"
          rows={2}
          value={note}
          disabled={saving}
          onChange={(event) => {
            setFailure(null)
            setUnchanged(false)
            setNote(event.target.value)
          }}
          placeholder="reproducida en la página 3"
        />
        <p className="mt-1 text-xs text-stone-500">
          Solo de {catalogId}, al contrario que todo lo de arriba. Si el documento habla de más
          obras, cada una lleva la suya.
        </p>
      </div>

      {unchanged && (
        <p role="status" className="mt-3 rounded-lg bg-stone-100 p-3 text-sm text-stone-700">
          No has cambiado nada, así que no se ha guardado ni consta corregido hoy.
        </p>
      )}
      {failure !== null && (
        <p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-800">
          {failure}
        </p>
      )}

      <SheetFooter>
        <button
          type="button"
          disabled={saving}
          onClick={() => void save()}
          className="btn-primary min-h-touch flex-1 disabled:opacity-60"
        >
          {saving ? 'Guardando…' : 'Guardar la corrección'}
        </button>
        <button type="button" disabled={saving} onClick={guard.cancel} className="btn-secondary">
          Cancelar
        </button>
      </SheetFooter>
    </BottomSheet>
  )
}
