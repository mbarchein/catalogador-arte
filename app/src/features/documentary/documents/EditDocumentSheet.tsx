import { useState } from 'react'
import { draftDirty } from '../../../components/formDirty'
import { BottomSheet } from '../../../components/ui'
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
 * Corregir los datos de un documento del archivo, desde la ficha de una obra
 * enlazada con él (RF-515, RF-516).
 *
 * **Se corrige desde donde se usa, y no desde una ficha propia**, que es la misma
 * decisión que tomó el panel de la referencia bibliográfica y por el mismo motivo: el
 * documento no tiene todavía pantalla suya, y esperar a tenerla dejaba la signatura
 * mal copiada dentro del catálogo para siempre. El día que la tenga, este panel es su
 * zona de edición y no hay nada que reescribir.
 *
 * Lo que el panel tiene que decir antes de que se toque un campo es que **esto no es
 * un dato de esta obra**: el aviso de arriba lo dice con el alcance contado —cuántas
 * otras obras y cuántas exposiciones leen lo mismo— porque «lo verán las demás» no
 * cambia ninguna decisión y «lo verán las otras tres obras» sí.
 *
 * La nota del vínculo va en el mismo panel y aparte, con su propio título: es la única
 * cosa de aquí que SÍ es de esta obra. Estaban las dos sin ninguna pantalla —la
 * operación que la guarda existía y no la llamaba nadie— y separarlas en dos hojas
 * habría sido pedir dos gestos para corregir un documento que se está mirando una vez.
 *
 * Nada de aquí decide nada: los campos son `DocumentFieldsForm`, y qué ha cambiado, qué
 * se manda y qué se dice lo contesta `documentEdit.ts`, que la batería alcanza.
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
  /** Lo que este documento dice de ESTA obra, de la fila puente. */
  linkNote: string
  documentTypes: readonly DocumentTypeEntry[]
  seriesTree: SeriesTree
  placeTree: PlaceTree
  mastersError: string | null
  /** Escribe `archive_documents`. Responde null cuando entró, o la frase que mostrar. */
  onSave: (payload: Record<string, unknown>) => Promise<string | null>
  /** Escribe la nota de la fila puente. Solo se llama si cambió. */
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
      // Los avisos ya están pintados junto a cada campo por el formulario
      // compartido; lo que falta aquí es que el botón diga por qué no ha hecho nada.
      setFailure('Revisa lo que está marcado más arriba: la base rechazaría el documento así.')
      return
    }
    if (plan.action === 'unchanged' && !noteChanged) {
      // No es un error y no se pinta como uno. Y sobre todo no se guarda: escribir la
      // fila movería `updated_at` y dejaría una entrada del historial de un cambio que
      // nadie ha hecho (RF-1501).
      setUnchanged(true)
      return
    }

    setSaving(true)
    // Primero el documento y después la nota, y las dos por separado a propósito: son
    // dos tablas y no hay transacción que las una desde el cliente. Si la segunda
    // falla, la primera está hecha y hay que decirlo, porque volver a intentarlo
    // guardaría lo mismo otra vez.
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
    await onDone(
      plan.action === 'update'
        ? documentEditedNotice(draft.title)
        : `Se ha guardado lo que este documento dice de ${catalogId}.`,
    )
    onClose()
  }

  // La corrección sin guardar, por los dos lados que esta hoja escribe: los campos del
  // documento —contra la fila guardada, que es de donde salió el borrador— y la nota del
  // vínculo con esta obra.
  const dirty = draftDirty(draft, documentEditDraft(document)) || note.trim() !== linkNote.trim()

  const guard = useSheetGuard({ onClose: saving ? () => {} : onClose, dirty })

  return (
    <BottomSheet
      open
      onClose={saving ? () => {} : onClose}
      title="Corregir los datos del documento"
      guard={guard}
    >
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
          No has cambiado nada, así que no se ha guardado: el documento se queda como estaba y no
          consta corregido hoy.
        </p>
      )}
      {failure !== null && (
        <p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-800">
          {failure}
        </p>
      )}

      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={saving}
          onClick={() => void save()}
          className="btn-primary min-h-touch disabled:opacity-60"
        >
          {saving ? 'Guardando…' : 'Guardar la corrección'}
        </button>
        <button type="button" disabled={saving} onClick={guard.cancel} className="btn-secondary">
          Cancelar
        </button>
      </div>
    </BottomSheet>
  )
}
