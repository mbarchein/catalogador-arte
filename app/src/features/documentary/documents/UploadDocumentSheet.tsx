import { useRef, useState } from 'react'
import { DraftOfferBanner } from '../../../components/DraftOfferBanner'
import { draftDirty } from '../../../components/formDirty'
import { BottomSheet, SheetFooter } from '../../../components/ui'
import { useFormDraft } from '../../../components/useFormDraft'
import { useSheetGuard } from '../../../components/useSheetGuard'
import type { PlaceTree } from '../../../lib/places'
import type { DocumentTypeEntry } from '../../../lib/types'
import type { SeriesTree } from '../../tables/archiveSeries'
import { fileSizeText } from '../documentaryFormat'
import { DocumentFieldsForm } from './DocumentFieldsForm'
import {
  documentDraftPayload,
  documentDraftProblems,
  emptyNewDocumentDraft,
  type NewDocumentDraft,
} from './documentDraft'
import {
  BUCKET_FILE_LIMIT_BYTES,
  documentFileProblem,
  runDocumentUpload,
  UPLOAD_STEP_TEXT,
  type UploadDocumentDeps,
  type UploadStep,
} from './documentUpload'

/**
 * Subir un documento del archivo y dejarlo enlazado con esta obra (RF-408, RF-515,
 * RF-516).
 *
 * Two acts in one gesture, and the panel says so out loud: the document goes into
 * the ARCHIVE, where it is shared, and a link is written to this artwork. It is the
 * short way for the normal case — the letter in your hand talks about the artwork
 * in front of you — and the sheet still names the two halves, because the day the
 * same cutting turns up on a second record the cataloger has to reach for «Enlazar»
 * and not for this button.
 *
 * **Nothing here decides anything.** What the file may weigh, where it lands in the
 * bucket, what is missing before saving, what travels to the two tables and what is
 * said when the middle step fails are all answered by `documentUpload.ts` and
 * `documentDraft.ts`, which the battery can reach — it runs in node and cannot open
 * a form, nor pick a file.
 *
 * The order of the fields is the order the paper gives them up: what it is (the
 * title), when it is from, what kind, whose fund, where it is filed, where the
 * paper physically is. The file is FIRST because it is the only thing that has to be
 * chosen while the phone is still holding it.
 */
export function UploadDocumentSheet({
  catalogId,
  documentTypes,
  seriesTree,
  placeTree,
  mastersError,
  deps,
  onClose,
  onDone,
}: {
  catalogId: string
  documentTypes: readonly DocumentTypeEntry[]
  seriesTree: SeriesTree
  placeTree: PlaceTree
  /** Why a master list is missing, already in Spanish. It does not stop the upload. */
  mastersError: string | null
  /** The three impure edges, injected by the section: upload, insert, link. */
  deps: Pick<UploadDocumentDeps, 'upload' | 'insert' | 'link'>
  onClose: () => void
  /** Reloads the block and shows what happened. These rows do not arrive by Realtime. */
  onDone: (notice: string) => Promise<void>
}) {
  const [draft, setDraft] = useState<NewDocumentDraft>(emptyNewDocumentDraft)
  const [file, setFile] = useState<File | null>(null)
  const [step, setStep] = useState<UploadStep | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  // The input is cleared through the DOM when the file is dropped: an `<input
  // type="file">` keeps its own value, and without this, unpicking a 40 MB scan and
  // picking the same one again would fire no change event at all.
  const input = useRef<HTMLInputElement>(null)

  const problems = documentDraftProblems(draft)
  const fileProblem = documentFileProblem(file)

  const busy = step !== null
  const blocked = problems.length > 0 || fileProblem !== null
  // Lo que se perdería al cerrar: el formulario entero y, sobre todo, el fichero — que
  // es lo único de aquí que hay que volver a buscar en el teléfono.
  const dirty = draftDirty(draft, emptyNewDocumentDraft()) || file !== null

  // Lo escrito se apunta en el teléfono y se ofrece a la vuelta. Aquí es donde más se
  // nota: es el formulario más largo del proyecto, se rellena de pie en un almacén, y las
  // salidas que ninguna confirmación puede tapar —recargar, que el móvil mate la pestaña—
  // son exactamente las que se comen media hora de trabajo.
  //
  // El ámbito lleva el código de la obra: dos documentos a medio subir desde dos fichas
  // son dos borradores, y compartir clave haría que el de una se ofreciera en la otra. Sin
  // huella, que aquí no hay fila guardada con la que chocar: es un alta.
  const stored = useFormDraft({
    scope: `documento-subir:${catalogId}`,
    draft,
    dirty,
    filesLost: file !== null,
  })

  function change(patch: Partial<NewDocumentDraft>) {
    setFailure(null)
    setDraft((was) => ({ ...was, ...patch }))
  }

  async function save() {
    setFailure(null)
    setStep('uploading')
    const outcome = await runDocumentUpload(
      {
        catalogId,
        document: documentDraftPayload(draft),
        file,
        linkNote: draft.linkNote,
      },
      { ...deps, onStep: setStep },
    )
    setStep(null)
    if (!outcome.ok) {
      setFailure(outcome.problem)
      // The sheet stays OPEN on failure, and on the failure that matters most it has
      // to: the document may already be in the archive, and the sentence explaining
      // that re-uploading would duplicate it must not vanish with the panel.
      return
    }
    stored.clear()
    await onDone(outcome.notice)
    onClose()
  }

  // El formulario más largo del proyecto y el más caro de repetir.
  const guard = useSheetGuard({
    onClose: busy ? () => {} : onClose,
    dirty,
    discardNotice: file === null ? null : 'El fichero que has elegido habría que volver a buscarlo.',
    draftKept: true,
  })

  return (
    <BottomSheet
      open
      onClose={busy ? () => {} : onClose}
      title="Subir un documento del archivo"
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

      {/* 1 · EL FICHERO. Lo primero, porque es lo único que hay que elegir mientras
          el teléfono todavía lo tiene en la mano. Y es OPCIONAL: un documento sin
          digitalizar es un estado legítimo del archivo (RF-408). */}
      <div>
        <label className="label" htmlFor="upload-document-file">
          El fichero escaneado
        </label>
        <input
          id="upload-document-file"
          ref={input}
          type="file"
          className="field"
          disabled={busy}
          onChange={(event) => {
            setFailure(null)
            setFile(event.target.files?.[0] ?? null)
          }}
        />
        {file !== null ? (
          <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-stone-600">
            <span>
              {file.name} · {fileSizeText(file.size) ?? 'tamaño desconocido'}
            </span>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setFile(null)
                setFailure(null)
                if (input.current) input.current.value = ''
              }}
              className="min-h-touch text-stone-600 underline"
            >
              Quitar el fichero
            </button>
          </p>
        ) : (
          /* Esta advertencia existía porque el escaneo no se podía añadir más tarde y
             prometer lo contrario dejaba documentos sin fichero para siempre. Ya se
             puede, y lo que se dice ahora es dónde — sin quitarle el «súbelo ahora si
             lo tienes», que sigue siendo el consejo: el fichero está en la mano una vez. */
          <p className="mt-1 text-xs text-stone-500">
            El PDF o el escaneo. Sin fichero constará «sin digitalizar», y se añade después.
          </p>
        )}
        {fileProblem !== null && (
          <p role="alert" className="mt-1 rounded-lg bg-red-50 p-2 text-xs text-red-800">
            {fileProblem}
          </p>
        )}
        <p className="mt-1 text-xs text-stone-500">
          Cabe cualquier tipo de fichero, hasta {fileSizeText(BUCKET_FILE_LIMIT_BYTES)} cada uno.
        </p>
      </div>

      {/* 2 · EL DOCUMENTO. Los mismos campos que corrigen uno ya registrado, en un
          componente compartido: dos copias de este formulario es cómo el alta acaba
          ofreciendo un campo que la corrección no tiene. */}
      <div className="mt-3">
        <DocumentFieldsForm
          idPrefix="upload-document"
          draft={draft}
          onChange={change}
          disabled={busy}
          documentTypes={documentTypes}
          seriesTree={seriesTree}
          placeTree={placeTree}
          mastersError={mastersError}
        />
      </div>

      {/* 3 · LA SEGUNDA NOTA. La del documento la pinta el formulario compartido, y
          esta va aquí porque no es del documento: es del vínculo con ESTA obra. La
          diferencia se dice debajo de cada una. */}
      <div className="mt-3">
        <label className="label" htmlFor="upload-document-link-note">
          Qué dice de esta obra (opcional)
        </label>
        <textarea
          id="upload-document-link-note"
          className="field"
          rows={2}
          value={draft.linkNote}
          disabled={busy}
          onChange={(event) => change({ linkNote: event.target.value })}
          placeholder="reproducida en la página 3"
        />
        <p className="mt-1 text-xs text-stone-500">
          Solo de {catalogId}. Si el documento habla de más obras, cada una lleva la suya.
        </p>
      </div>

      {failure !== null && (
        <p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-800">
          {failure}
        </p>
      )}

      <SheetFooter>
        <button
          type="button"
          disabled={busy || blocked}
          onClick={() => void save()}
          className="btn-primary min-h-touch flex-1 disabled:opacity-60"
        >
          {step === null ? 'Subir y enlazar' : UPLOAD_STEP_TEXT[step]}
        </button>
        <button type="button" disabled={busy} onClick={guard.cancel} className="btn-secondary">
          Cancelar
        </button>
      </SheetFooter>
    </BottomSheet>
  )
}
