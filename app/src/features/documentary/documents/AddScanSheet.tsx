import { useRef, useState } from 'react'
import { BottomSheet, SheetFooter } from '../../../components/ui'
import { useSheetGuard } from '../../../components/useSheetGuard'
import { fileSizeText } from '../documentaryFormat'
import { scanAddedNotice, scanTargetProblem, type EditableDocument } from './documentEdit'
import {
  BUCKET_FILE_LIMIT_BYTES,
  documentFileProblem,
  runAddScan,
  SCAN_STEP_TEXT,
  type AddScanDeps,
  type ScanStep,
} from './documentUpload'

/**
 * Giving its scan to a document that was registered without one (RF-408, RF-515).
 *
 * It is the half the creation was missing. An undigitised document is a legitimate
 * state of the archive —the original is on paper and sometimes it is noted down from a
 * photocopy—, but until today it was a state with no way out: the upload panel
 * warned about it before saving precisely because there was no screen that fixed
 * the «I'll upload it later». Now there is, and that is why that warning no longer says that.
 *
 * **A separate sheet and not one more field of the correction panel**, for the same reason
 * uploading and linking are two different buttons in this block: they are two acts with two
 * different risks. Correcting the shelfmark writes one column; this uploads tens of
 * megabytes over a phone line and then writes four. A single «Guardar» for both
 * things is a button that sometimes takes a quarter of an hour and sometimes does not, and that when
 * it fails does not say which of the two halves has been left half-done.
 *
 * What decides what can be done is in `documentEdit.ts` and `documentUpload.ts`: why
 * a document that already has a file does not change it here, what weight the store accepts and
 * what is said when somebody has got there first.
 */
export function AddScanSheet({
  document,
  onAdd,
  onClose,
  onDone,
}: {
  document: EditableDocument & { title: string }
  /** The two impure edges, injected by the section: upload and note down. */
  onAdd: Pick<AddScanDeps, 'upload' | 'attach'>
  onClose: () => void
  onDone: (notice: string) => Promise<void>
}) {
  const [file, setFile] = useState<File | null>(null)
  const [step, setStep] = useState<ScanStep | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  // It is cleared through the DOM on removing the file: an `input type="file"` keeps its own
  // value, and without this removing a 40 MB scan and choosing the same one again would
  // fire no event.
  const input = useRef<HTMLInputElement>(null)

  // The only refusal the document can bring: that it already has a file. It is checked
  // here and not only when painting the button, because between opening the record and opening this sheet
  // somebody may have uploaded it from another.
  const blocked = scanTargetProblem(document)
  const fileProblem = documentFileProblem(file)
  const busy = step !== null

  async function add() {
    if (file === null) return
    setFailure(null)
    setStep('uploading')
    const outcome = await runAddScan(document, file, { ...onAdd, onStep: setStep })
    setStep(null)
    if (!outcome.ok) {
      // The sheet stays OPEN: when the failure is the one that matters —the file uploaded
      // and the note did not— the sentence explaining that it must not be repeated cannot
      // disappear with the panel.
      setFailure(outcome.problem)
      return
    }
    await onDone(scanAddedNotice(document.title, file.size))
    onClose()
  }

  // What is lost here is not typing: it is having found the file on the phone,
  // which is the most tiresome thing on the whole sheet to repeat.
  const guard = useSheetGuard({
    onClose: busy ? () => {} : onClose,
    dirty: file !== null,
    discardNotice: 'El fichero que has elegido habría que volver a buscarlo.',
  })

  return (
    <BottomSheet
      open
      onClose={busy ? () => {} : onClose}
      title="Añadir el escaneo"
      guard={guard}
    >
      <p className="text-sm text-stone-700">
        {document.title.trim() === '' ? 'Este documento' : `«${document.title.trim()}»`} consta sin
        digitalizar. El fichero se guarda una sola vez en el archivo y se puede descargar desde
        cualquier ficha enlazada con él.
      </p>

      {blocked !== null ? (
        <p role="alert" className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          {blocked}
        </p>
      ) : (
        <>
          <div className="mt-3">
            <label className="label" htmlFor="add-scan-file">
              El fichero escaneado
            </label>
            <input
              id="add-scan-file"
              ref={input}
              type="file"
              className="field"
              disabled={busy}
              onChange={(event) => {
                setFailure(null)
                setFile(event.target.files?.[0] ?? null)
              }}
            />
            {file !== null && (
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
            )}
            {fileProblem !== null && (
              <p role="alert" className="mt-1 rounded-lg bg-red-50 p-2 text-xs text-red-800">
                {fileProblem}
              </p>
            )}
            <p className="mt-1 text-xs text-stone-500">
              Un PDF con todas las páginas, o el escaneo. Cabe cualquier tipo de fichero, hasta{' '}
              {fileSizeText(BUCKET_FILE_LIMIT_BYTES)}. Una vez subido no se sustituye: los ficheros
              del almacén no se sobrescriben nunca.
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
              disabled={busy || file === null || fileProblem !== null}
              onClick={() => void add()}
              className="btn-primary min-h-touch flex-1 disabled:opacity-60"
            >
              {step === null ? 'Añadir el escaneo' : SCAN_STEP_TEXT[step]}
            </button>
            <button type="button" disabled={busy} onClick={guard.cancel} className="btn-secondary">
              Cancelar
            </button>
          </SheetFooter>
        </>
      )}
    </BottomSheet>
  )
}
