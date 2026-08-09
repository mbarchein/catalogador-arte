import { useMemo } from 'react'
import { Toggle, YearStepper } from '../../../components/ui'
import { flattenPlaces, type PlaceTree } from '../../../lib/places'
import { ARTIST_FUNDS, ARTIST_LABEL, type ArtistFund, type DocumentTypeEntry } from '../../../lib/types'
import { sortByName } from '../../../lib/masterTables'
import { flattenSeries, seriesLevelLabel, type SeriesTree } from '../../tables/archiveSeries'
import {
  documentDatePreview,
  documentDraftProblems,
  DOCUMENT_MAX_YEAR,
  DOCUMENT_MIN_YEAR,
  problemsOf,
  type DocumentFields,
} from './documentDraft'

/**
 * Los campos de un documento del archivo, los mismos para registrarlo y para
 * corregirlo (RF-515).
 *
 * Existe porque hay DOS formularios sobre las mismas doce columnas, y la segunda copia
 * de doscientas líneas de JSX es cómo el panel de alta acaba ofreciendo un campo que
 * el de corrección no tiene —o peor, cómo la ayuda de la signatura sigue diciendo en
 * uno lo que ya no es verdad en el otro—. Lo que cambia entre los dos no son los
 * campos: es qué se hace al guardar.
 *
 * El orden es el que el papel da: qué es, cuándo, cómo se clasifica, dónde está. El
 * fichero no está aquí a propósito — al registrar se elige antes que nada, porque es
 * lo único que hay que decidir mientras el teléfono lo tiene en la mano, y al corregir
 * no se toca —.
 *
 * Nada de aquí decide nada: lo que falta, lo que la base rechazará y cómo se va a
 * guardar la fecha lo contestan `documentDraft.ts` y `documentEdit.ts`, que la batería
 * alcanza porque corre en node y no puede abrir un formulario.
 */
export function DocumentFieldsForm({
  idPrefix,
  draft,
  onChange,
  disabled = false,
  documentTypes,
  seriesTree,
  placeTree,
  mastersError,
}: {
  /** Prefijo de los `id`, para que dos formularios montados a la vez no compartan `label`. */
  idPrefix: string
  draft: DocumentFields
  onChange: (patch: Partial<DocumentFields>) => void
  disabled?: boolean
  documentTypes: readonly DocumentTypeEntry[]
  seriesTree: SeriesTree
  placeTree: PlaceTree
  /** Por qué falta una lista maestra, ya en español. No impide guardar. */
  mastersError: string | null
}) {
  const problems = documentDraftProblems(draft)
  const datePreview = documentDatePreview(draft)
  const types = useMemo(
    () => sortByName(documentTypes.filter((entry) => entry.active)),
    [documentTypes],
  )
  const series = useMemo(() => flattenSeries(seriesTree, (node) => node.active), [seriesTree])
  const places = useMemo(() => flattenPlaces(placeTree, (place) => place.active), [placeTree])
  const id = (field: string) => `${idPrefix}-${field}`

  return (
    <>
      {/* 1 · QUÉ ES. Lo único que la base exige, porque un documento sin nada que lo
          nombre no se vuelve a encontrar. */}
      <div>
        <label className="label" htmlFor={id('title')}>
          Título o descripción corta
        </label>
        <input
          id={id('title')}
          className="field"
          value={draft.title}
          disabled={disabled}
          onChange={(event) => onChange({ title: event.target.value })}
          placeholder="Carta de la galería sobre la muestra de 1985"
        />
        <Problems problems={problemsOf(problems, 'title')} />
      </div>

      <div className="mt-3">
        <label className="label" htmlFor={id('code')}>
          Signatura del archivo (opcional)
        </label>
        <input
          id={id('code')}
          className="field font-mono"
          value={draft.archiveCode}
          disabled={disabled}
          onChange={(event) => onChange({ archiveCode: event.target.value })}
          placeholder="AR-ARCH-0001"
          autoComplete="off"
          autoCapitalize="characters"
        />
        <p className="mt-1 text-xs text-stone-500">
          {/* Esta ayuda ha dicho dos cosas distintas y las dos eran verdad cuando se
              escribieron: primero «se puede corregir después», que no lo era porque no
              había pantalla, y luego «no hay dónde corregirla», que dejó de serlo el día
              que la hubo. Ahora se puede, y se dice desde dónde. */}
          La que está escrita en la carpeta. Vacía si todavía no está archivado.
        </p>
        <Problems problems={problemsOf(problems, 'code')} />
      </div>

      {/* 2 · CUÁNDO. La forma estructurada de ADR-004, con la nota que gana al
          imprimirse cuando la estructura no da para tanto. */}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <YearStepper
          id={id('start-year')}
          label="Año"
          compact
          min={DOCUMENT_MIN_YEAR}
          max={DOCUMENT_MAX_YEAR}
          value={draft.startYear}
          onChange={(year) => onChange({ startYear: year })}
        />
        <YearStepper
          id={id('end-year')}
          label="Hasta (opcional)"
          compact
          min={DOCUMENT_MIN_YEAR}
          max={DOCUMENT_MAX_YEAR}
          value={draft.endYear}
          onChange={(year) => onChange({ endYear: year })}
        />
      </div>
      <Problems problems={problemsOf(problems, 'years')} />

      <div className="mt-2 space-y-2">
        <Toggle
          active={draft.approximate}
          onChange={(value) => onChange({ approximate: value })}
          label="Fecha aproximada"
          help="Se imprime «c. 1985»"
        />
        <Toggle
          active={draft.unconfirmed}
          onChange={(value) => onChange({ unconfirmed: value })}
          label="Fecha sin confirmar"
          help="Se imprime «1985 [?]»"
        />
      </div>
      <Problems problems={problemsOf(problems, 'flags')} />

      <div className="mt-3">
        <label className="label" htmlFor={id('date-note')}>
          La fecha en palabras (opcional)
        </label>
        <input
          id={id('date-note')}
          className="field"
          value={draft.dateNote}
          disabled={disabled}
          onChange={(event) => onChange({ dateNote: event.target.value })}
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

      {/* 3 · CÓMO SE CLASIFICA. Las tres maestras, todas opcionales: «sin clasificar»
          es una respuesta legítima mientras el documento se anota de una fotocopia. Y
          ninguna se puede crear desde aquí: tienen su pantalla. */}
      {mastersError !== null && (
        <p className="mt-3 rounded-lg bg-amber-50 p-2 text-xs text-amber-900">
          {mastersError} El documento se puede guardar igual: sin tipo consta «Tipo sin
          clasificar», que es un valor legítimo.
        </p>
      )}

      <div className="mt-3">
        <label className="label" htmlFor={id('type')}>
          Tipo de documento
        </label>
        <select
          id={id('type')}
          className="field"
          value={draft.documentTypeId ?? ''}
          disabled={disabled}
          onChange={(event) => onChange({ documentTypeId: event.target.value || null })}
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
        <label className="label" htmlFor={id('series')}>
          Fondo o serie del archivo
        </label>
        <select
          id={id('series')}
          className="field"
          value={draft.archiveSeriesId ?? ''}
          disabled={disabled}
          onChange={(event) => onChange({ archiveSeriesId: event.target.value || null })}
        >
          <option value="">Sin clasificar en el archivo</option>
          {series.map(({ series: node, depth, path }) => (
            <option key={node.id} value={node.id}>
              {`${'  '.repeat(depth)}${node.name} · ${seriesLevelLabel(depth)}${
                depth > 0 ? ` de ${path.split(', ').slice(0, -1).join(', ')}` : ''
              }`}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-3">
        <label className="label" htmlFor={id('fund')}>
          Fondo del artista
        </label>
        <select
          id={id('fund')}
          className="field"
          value={draft.artistFund ?? ''}
          disabled={disabled}
          onChange={(event) =>
            onChange({ artistFund: (event.target.value || null) as ArtistFund | null })
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
        <label className="label" htmlFor={id('place')}>
          Dónde está el papel
        </label>
        <select
          id={id('place')}
          className="field"
          value={draft.physicalPlaceId ?? ''}
          disabled={disabled}
          onChange={(event) => onChange({ physicalPlaceId: event.target.value || null })}
        >
          <option value="">Todavía sin sitio</option>
          {places.map(({ place, depth, path }) => (
            <option key={place.id} value={place.id}>
              {`${'  '.repeat(depth)}${place.name}`}
              {depth > 0 ? ` · ${path}` : ''}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-stone-500">
          El mismo árbol de sitios que las obras: una caja de cartas está en el mismo edificio que
          los cuadros.
        </p>
      </div>

      <div className="mt-3">
        <label className="label" htmlFor={id('note')}>
          Nota del documento (opcional)
        </label>
        <textarea
          id={id('note')}
          className="field"
          rows={2}
          value={draft.note}
          disabled={disabled}
          onChange={(event) => onChange({ note: event.target.value })}
          placeholder="tres folios mecanografiados, con firma"
        />
        <p className="mt-1 text-xs text-stone-500">
          Sobre el documento entero. La ven todas las obras enlazadas con él.
        </p>
      </div>
    </>
  )
}

/** The refusals that belong beside one field, or nothing. Never a silent field. */
export function Problems({ problems }: { problems: readonly { text: string }[] }) {
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
