import { useMemo, useRef, useState } from 'react'
import { BottomSheet, Toggle, YearStepper } from '../../../components/ui'
import { flattenPlaces, type PlaceTree } from '../../../lib/places'
import { ARTIST_FUNDS, ARTIST_LABEL, type ArtistFund, type DocumentTypeEntry } from '../../../lib/types'
import { sortByName } from '../../../lib/masterTables'
import { flattenSeries, seriesLevelLabel, type SeriesTree } from '../../tables/archiveSeries'
import { fileSizeText } from '../documentaryFormat'
import {
  documentDatePreview,
  documentDraftPayload,
  documentDraftProblems,
  DOCUMENT_MAX_YEAR,
  DOCUMENT_MIN_YEAR,
  emptyNewDocumentDraft,
  problemsOf,
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
  const datePreview = documentDatePreview(draft)
  const types = useMemo(() => sortByName(documentTypes.filter((entry) => entry.active)), [documentTypes])
  const series = useMemo(() => flattenSeries(seriesTree, (node) => node.active), [seriesTree])
  const places = useMemo(() => flattenPlaces(placeTree, (place) => place.active), [placeTree])

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
    await onDone(outcome.notice)
    onClose()
  }

  const busy = step !== null
  const blocked = problems.length > 0 || fileProblem !== null

  return (
    <BottomSheet open onClose={busy ? () => {} : onClose} title="Subir un documento del archivo">
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
          /* Se dice antes de guardar y no después: hoy no hay pantalla del archivo,
             así que el escaneo no se puede añadir más tarde. Prometer lo contrario
             sería dejar el documento sin fichero para siempre sin avisar. */
          <p className="mt-1 text-xs text-stone-500">
            Un PDF con todas las páginas del expediente, o el escaneo. Puedes registrar el documento
            sin fichero: constará «sin digitalizar» y solo en papel. Pero añadirle el escaneo más
            adelante todavía no se hace desde ninguna pantalla, así que si lo tienes, súbelo ahora.
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

      {/* 2 · QUÉ ES. Lo único que la base exige, porque un documento sin nada que lo
          nombre no se vuelve a encontrar. */}
      <div className="mt-3">
        <label className="label" htmlFor="upload-document-title">
          Título o descripción corta
        </label>
        <input
          id="upload-document-title"
          className="field"
          value={draft.title}
          disabled={busy}
          onChange={(event) => change({ title: event.target.value })}
          placeholder="Carta de la galería sobre la muestra de 1985"
        />
        <Problems problems={problemsOf(problems, 'title')} />
      </div>

      <div className="mt-3">
        <label className="label" htmlFor="upload-document-code">
          Signatura del archivo (opcional)
        </label>
        <input
          id="upload-document-code"
          className="field font-mono"
          value={draft.archiveCode}
          disabled={busy}
          onChange={(event) => change({ archiveCode: event.target.value })}
          placeholder="AR-ARCH-0001"
          autoComplete="off"
          autoCapitalize="characters"
        />
        <p className="mt-1 text-xs text-stone-500">
          {/* Decía «y esta se puede corregir después», y no era verdad: hoy no hay
              ninguna pantalla que corrija los datos de un documento del archivo, así
              que la signatura que se guarde aquí se queda. Lo dice, igual que cuatro
              líneas más arriba se dice del escaneo: prometer una corrección que no
              existe es cómo alguien deja un campo a medias para «arreglarlo luego». */}
          La que está escrita en la carpeta. Si el documento todavía no está archivado, déjala
          vacía: no hace falta inventar un código. Pero piénsalo antes de guardar, porque de
          momento no hay dónde corregirla después.
        </p>
        <Problems problems={problemsOf(problems, 'code')} />
      </div>

      {/* 3 · CUÁNDO. La forma estructurada de ADR-004, con la nota que gana al
          imprimirse cuando la estructura no da para tanto. */}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <YearStepper
          id="upload-document-start-year"
          label="Año"
          compact
          min={DOCUMENT_MIN_YEAR}
          max={DOCUMENT_MAX_YEAR}
          value={draft.startYear}
          onChange={(year) => change({ startYear: year })}
        />
        <YearStepper
          id="upload-document-end-year"
          label="Hasta (opcional)"
          compact
          min={DOCUMENT_MIN_YEAR}
          max={DOCUMENT_MAX_YEAR}
          value={draft.endYear}
          onChange={(year) => change({ endYear: year })}
        />
      </div>
      <Problems problems={problemsOf(problems, 'years')} />

      <div className="mt-2 space-y-2">
        <Toggle
          active={draft.approximate}
          onChange={(value) => change({ approximate: value })}
          label="Fecha aproximada"
          help="Se imprime «c. 1985»"
        />
        <Toggle
          active={draft.unconfirmed}
          onChange={(value) => change({ unconfirmed: value })}
          label="Fecha sin confirmar"
          help="Se imprime «1985 [?]»"
        />
      </div>
      <Problems problems={problemsOf(problems, 'flags')} />

      <div className="mt-3">
        <label className="label" htmlFor="upload-document-date-note">
          La fecha en palabras (opcional)
        </label>
        <input
          id="upload-document-date-note"
          className="field"
          value={draft.dateNote}
          disabled={busy}
          onChange={(event) => change({ dateNote: event.target.value })}
          placeholder="finales de los setenta"
        />
        <p className="mt-1 text-xs text-stone-500">
          Lo que la estructura no puede guardar. Si la escribes, es esto lo que se imprime en vez
          del año.
        </p>
      </div>

      {datePreview !== '' && (
        <p className="mt-2 rounded-lg bg-stone-100 p-2 text-sm">
          La fecha se guardará como <strong>{datePreview}</strong>.
        </p>
      )}

      {/* 4 · CÓMO SE CLASIFICA. Las tres maestras, todas opcionales: «sin
          clasificar» es una respuesta legítima mientras el documento se anota de una
          fotocopia. Y ninguna se puede crear desde aquí: tienen su pantalla. */}
      {mastersError !== null && (
        <p className="mt-3 rounded-lg bg-amber-50 p-2 text-xs text-amber-900">
          {mastersError} El documento se puede registrar igual: sin tipo consta «Tipo sin
          clasificar», que es un valor legítimo.
        </p>
      )}

      <div className="mt-3">
        <label className="label" htmlFor="upload-document-type">
          Tipo de documento
        </label>
        <select
          id="upload-document-type"
          className="field"
          value={draft.documentTypeId ?? ''}
          disabled={busy}
          onChange={(event) => change({ documentTypeId: event.target.value || null })}
        >
          <option value="">Sin clasificar</option>
          {types.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.name}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-stone-500">
          Carta, recorte de prensa, cartel… La lista se amplía en Tablas, no desde aquí.
        </p>
      </div>

      <div className="mt-3">
        <label className="label" htmlFor="upload-document-series">
          Fondo o serie del archivo
        </label>
        <select
          id="upload-document-series"
          className="field"
          value={draft.archiveSeriesId ?? ''}
          disabled={busy}
          onChange={(event) => change({ archiveSeriesId: event.target.value || null })}
        >
          <option value="">Sin clasificar en el archivo</option>
          {series.map(({ series: node, depth, path }) => (
            <option key={node.id} value={node.id}>
              {`${'  '.repeat(depth)}${node.name} · ${seriesLevelLabel(depth)}${
                depth > 0 ? ` de ${path.split(', ').slice(0, -1).join(', ')}` : ''
              }`}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-3">
        <label className="label" htmlFor="upload-document-fund">
          Fondo del artista
        </label>
        <select
          id="upload-document-fund"
          className="field"
          value={draft.artistFund ?? ''}
          disabled={busy}
          onChange={(event) =>
            change({ artistFund: (event.target.value || null) as ArtistFund | null })
          }
        >
          {/* Vacío es una respuesta y no un hueco: un recorte sobre una colectiva de
              los dos artistas —o un documento de contexto que no es de ninguno— no
              puede elegir, y por eso la columna es nulable. */}
          <option value="">No es de un solo fondo</option>
          {ARTIST_FUNDS.map((fund) => (
            <option key={fund} value={fund}>
              {ARTIST_LABEL[fund]}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-3">
        <label className="label" htmlFor="upload-document-place">
          Dónde está el papel
        </label>
        <select
          id="upload-document-place"
          className="field"
          value={draft.physicalPlaceId ?? ''}
          disabled={busy}
          onChange={(event) => change({ physicalPlaceId: event.target.value || null })}
        >
          <option value="">Todavía sin sitio</option>
          {places.map(({ place, depth, path }) => (
            <option key={place.id} value={place.id}>
              {`${'  '.repeat(depth)}${place.name}`}
              {depth > 0 ? ` · ${path}` : ''}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-stone-500">
          El mismo árbol de sitios que las obras: una caja de cartas está en el mismo edificio que
          los cuadros.
        </p>
      </div>

      {/* 5 · LAS DOS NOTAS, y la diferencia entre ellas dicha en su sitio. */}
      <div className="mt-3">
        <label className="label" htmlFor="upload-document-note">
          Nota del documento (opcional)
        </label>
        <textarea
          id="upload-document-note"
          className="field"
          rows={2}
          value={draft.note}
          disabled={busy}
          onChange={(event) => change({ note: event.target.value })}
          placeholder="tres folios mecanografiados, con firma"
        />
        <p className="mt-1 text-xs text-stone-500">
          Sobre el documento entero. La ven todas las obras enlazadas con él.
        </p>
      </div>

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

      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={busy || blocked}
          onClick={() => void save()}
          className="btn-primary min-h-touch disabled:opacity-60"
        >
          {step === null ? 'Subir y enlazar' : UPLOAD_STEP_TEXT[step]}
        </button>
        <button type="button" disabled={busy} onClick={onClose} className="btn-secondary">
          Cancelar
        </button>
      </div>
    </BottomSheet>
  )
}

/** The refusals that belong beside one field, or nothing. Never a silent field. */
function Problems({ problems }: { problems: readonly { text: string }[] }) {
  if (problems.length === 0) return null
  return (
    <>
      {problems.map((problem) => (
        <p key={problem.text} className="mt-1 rounded-lg bg-amber-50 p-2 text-xs text-amber-900">
          {problem.text}
        </p>
      ))}
    </>
  )
}
