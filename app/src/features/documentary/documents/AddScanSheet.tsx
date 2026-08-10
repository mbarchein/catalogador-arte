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
 * Darle su escaneo a un documento que se registró sin él (RF-408, RF-515).
 *
 * Es la mitad que le faltaba al alta. Un documento sin digitalizar es un estado
 * legítimo del archivo —el original está en papel y a veces se anota de una
 * fotocopia—, pero hasta hoy era un estado del que no se salía: el panel de subida lo
 * advertía antes de guardar precisamente porque no había ninguna pantalla que arreglara
 * el «luego lo subo». Ya la hay, y por eso ese aviso ya no dice eso.
 *
 * **Una hoja aparte y no un campo más del panel de corrección**, por lo mismo que
 * subir y enlazar son dos botones distintos en este bloque: son dos actos con dos
 * riesgos distintos. Corregir la signatura escribe una columna; esto sube decenas de
 * megas por una línea de móvil y luego escribe cuatro. Un solo «Guardar» para las dos
 * cosas es un botón que a veces tarda un cuarto de hora y a veces no, y que cuando
 * falla no dice cuál de las dos mitades se ha quedado a medias.
 *
 * Lo que decide qué se puede hacer está en `documentEdit.ts` y `documentUpload.ts`: por
 * qué un documento que ya tiene fichero no lo cambia aquí, qué peso acepta el almacén y
 * qué se dice cuando alguien se ha adelantado.
 */
export function AddScanSheet({
  document,
  onAdd,
  onClose,
  onDone,
}: {
  document: EditableDocument & { title: string }
  /** Los dos bordes impuros, inyectados por la sección: subir y anotar. */
  onAdd: Pick<AddScanDeps, 'upload' | 'attach'>
  onClose: () => void
  onDone: (notice: string) => Promise<void>
}) {
  const [file, setFile] = useState<File | null>(null)
  const [step, setStep] = useState<ScanStep | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  // Se limpia por el DOM al quitar el fichero: un `input type="file"` guarda su propio
  // valor, y sin esto quitar un escaneo de 40 MB y volver a elegir el mismo no
  // dispararía ningún evento.
  const input = useRef<HTMLInputElement>(null)

  // La única negativa que puede traer el documento: que ya tenga fichero. Se comprueba
  // aquí y no solo al pintar el botón, porque entre abrir la ficha y abrir esta hoja
  // alguien puede haberlo subido desde otra.
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
      // La hoja se queda ABIERTA: cuando el fallo es el que importa —el fichero subió
      // y la anotación no— la frase que explica que no hay que repetirlo no puede
      // desaparecer con el panel.
      setFailure(outcome.problem)
      return
    }
    await onDone(scanAddedNotice(document.title, file.size))
    onClose()
  }

  // Aquí lo que se pierde no es tecleo: es haber encontrado el fichero en el teléfono,
  // que es lo más engorroso de repetir de toda la hoja.
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
