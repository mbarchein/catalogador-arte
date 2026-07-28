import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext'
import { Layout } from '../../components/Layout'
import { supabase } from '../../lib/supabase'
import { displayDate } from '../../lib/dates'
import { existenceNotice, attributedTitleNotice, displayMeasurements, displayTitle } from '../../lib/title'
import {
  ARTIST_LABEL,
  CONSERVATION_LABEL,
  EXISTENCE_LABEL,
  ATTRIBUTED_TITLE_LABEL,
  ATTRIBUTED_TITLE_DESCRIPTION,
  TRI_STATE_LABEL,
  type Artwork,
  type AttributedTitleValue,
} from '../../lib/types'
import {
  MIN_YEAR,
  adjustYear,
  parseManualDate,
  maxYear,
  composeDate,
} from '../../lib/structuredDate'
import {
  ActionBar,
  BanIcon,
  Chips,
  EllipsisIcon,
  FieldGroup,
  OptionCards,
  PenIcon,
  TagIcon,
  Toggle,
  ToggleChip,
  TriStateIcons,
  UnreviewedIcon,
  YearStepper,
} from '../../components/ui'
import { normalizeLocation, locationForSaving } from '../../lib/location'
import { useLiveChanges } from '../../lib/live'
import { ArtworkGallery } from './ArtworkGallery'
import { useArtwork } from './useArtworks'

const AUTHORSHIP_ICON: Record<AttributedTitleValue, typeof PenIcon> = {
  NO: PenIcon,
  YES: TagIcon,
  UNCONFIRMED: UnreviewedIcon,
  NOT_APPLICABLE: BanIcon,
  UNREVIEWED: EllipsisIcon,
}

function DataRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3 py-1.5">
      <dt className="w-32 shrink-0 text-sm text-stone-500">{label}</dt>
      {/* Never an empty gap (RF-304): when there is no datum, it is said. */}
      <dd className="text-sm">{value.trim() === '' ? <span className="text-stone-400">Sin dato</span> : value}</dd>
    </div>
  )
}

export function ArtworkPage() {
  const { id } = useParams<{ id: string }>()
  const { artwork, loading, error, reload } = useArtwork(id)
  const { canEdit } = useAuth()
  const [editing, setEditing] = useState(false)
  const [generatingPdf, setGeneratingPdf] = useState(false)
  const [pdfError, setPdfError] = useState('')

  // pdf-lib loads only when the record is requested: it must not bloat the
  // initial bundle.
  async function printRecord(theArtwork: Artwork) {
    setGeneratingPdf(true)
    setPdfError('')
    try {
      const { generateRecordPdf } = await import('../../lib/recordPdf')
      const blob = await generateRecordPdf(theArtwork)
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${theArtwork.catalog_id}-ficha.pdf`
      link.click()
      // Generous margin: some browsers download deferred.
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch {
      setPdfError('No se ha podido generar el PDF. Vuelve a intentarlo.')
    } finally {
      setGeneratingPdf(false)
    }
  }

  // The record in view mode refreshes when someone else changes it. While
  // editing it does NOT: overwriting a half-filled form with foreign data
  // would destroy work — the concurrent-edit conflict belongs to the edit lock
  // (RF-700), pending.
  useLiveChanges('artworks', () => {
    if (!editing) void reload()
  }, id ? `catalog_id=eq.${id}` : undefined)

  if (loading) {
    return (
      <Layout title={id} back="/">
        <p className="text-sm text-stone-600">Cargando…</p>
      </Layout>
    )
  }

  if (error || !artwork) {
    return (
      <Layout title={id} back="/">
        <div className="card text-sm">
          <p className="font-medium">No se ha encontrado la ficha {id}.</p>
          <p className="mt-1 text-stone-600">
            Puede que esté dada de baja, o que no tengas permiso para verla.
          </p>
        </div>
      </Layout>
    )
  }

  if (editing) {
    return (
      <Layout title={`Editando ${artwork.catalog_id}`} back="/">
        <EditForm
          artwork={artwork}
          onDone={async () => {
            await reload()
            setEditing(false)
          }}
          onCancel={() => setEditing(false)}
        />
      </Layout>
    )
  }

  const titleNotice = attributedTitleNotice(artwork.attributed_title)
  const statusNotice = existenceNotice(artwork)

  return (
    <Layout
      title={artwork.catalog_id}
      back="/"
      // In the fixed header, not inside the page: this way editing is within
      // reach without scrolling back up, however long the record.
      action={
        canEdit ? (
          <button
            onClick={() => setEditing(true)}
            className="btn-primary min-h-[2.5rem] px-4 text-sm"
          >
            Editar
          </button>
        ) : undefined
      }
    >
      <header className="mb-4">
        <p className="font-mono text-sm text-stone-500">{artwork.catalog_id}</p>
        <h1 className="text-xl font-semibold">{displayTitle(artwork.title)}</h1>
        <p className="text-sm text-stone-600">
          {ARTIST_LABEL[artwork.artist]} · {displayDate(artwork.execution_date)}
        </p>

        <div className="mt-2 flex flex-wrap gap-1.5">
          <Badge
            active={artwork.inventory_phase_completed}
            text={artwork.inventory_phase_completed ? 'Fase 1 completa' : 'Fase 1 en curso'}
          />
          <Badge
            active={artwork.documentation_phase_completed}
            text={artwork.documentation_phase_completed ? 'Fase 2 completa' : 'Fase 2 en curso'}
          />
          {/* RF-306 and RF-307: the notices that change how the record reads
              go at the top, not buried among the data. */}
          {statusNotice && (
            <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-900">
              {statusNotice}
            </span>
          )}
          {titleNotice && (
            <span className="rounded bg-stone-200 px-2 py-0.5 text-xs text-stone-700">
              {titleNotice}
            </span>
          )}
        </div>

      </header>

      <ArtworkGallery catalogId={artwork.catalog_id} />

      <section className="card mb-3">
        <h2 className="mb-2 font-medium">Identificación</h2>
        <dl className="divide-y divide-stone-100">
          <DataRow label="Tipo" value={artwork.artwork_type} />
          <DataRow label="Técnica" value={artwork.technique} />
          <DataRow label="Soporte" value={artwork.support} />
          <DataRow label="Medidas" value={displayMeasurements(artwork)} />
          <DataRow
            label="Firmada"
            value={
              artwork.signed === 'YES' && artwork.signature_description
                ? `Sí, ${artwork.signature_description}`
                : TRI_STATE_LABEL[artwork.signed]
            }
          />
          <DataRow label="Fecha en la obra" value={TRI_STATE_LABEL[artwork.dated_on_artwork]} />
          <DataRow label="Título" value={ATTRIBUTED_TITLE_LABEL[artwork.attributed_title]} />
        </dl>
      </section>

      <section className="card mb-3">
        <h2 className="mb-2 font-medium">Conservación y localización</h2>
        <dl className="divide-y divide-stone-100">
          <DataRow label="Conservación" value={CONSERVATION_LABEL[artwork.conservation_status]} />
          <DataRow label="Existencia" value={EXISTENCE_LABEL[artwork.existence_status]} />
          <DataRow label="Ubicación" value={artwork.physical_location} />
        </dl>
      </section>

      <section className="card mb-3">
        <h2 className="mb-2 font-medium">Estado del proceso</h2>
        <dl className="divide-y divide-stone-100">
          <DataRow label="Fotografiada" value={artwork.photographed ? 'Sí' : 'No'} />
          <DataRow label="Medidas verificadas" value={artwork.measurements_verified ? 'Sí' : 'No'} />
          <DataRow
            label="Ficha publicable"
            value={artwork.catalog_record_complete ? 'Sí' : 'No'}
          />
          <DataRow label="Notas" value={artwork.inventory_process_notes} />
          <DataRow
            label="Actualizada"
            value={new Date(artwork.updated_at).toLocaleString('es-ES')}
          />
          <DataRow
            label="Toma de datos"
            value={
              artwork.basic_updated_at
                ? new Date(artwork.basic_updated_at).toLocaleString('es-ES')
                : ''
            }
          />
        </dl>
      </section>

      <section className="card mb-3">
        <h2 className="mb-2 font-medium">Etiqueta e impresión</h2>
        <p className="mb-3 text-sm text-stone-600">
          Ficha en A5 con los datos principales y un código QR que abre esta misma página — para
          acompañar a la etiqueta física {artwork.catalog_id}.
        </p>
        {pdfError && (
          <p role="alert" className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-800">
            {pdfError}
          </p>
        )}
        <button
          type="button"
          onClick={() => void printRecord(artwork)}
          disabled={generatingPdf}
          className="btn-secondary w-full"
        >
          {generatingPdf ? 'Generando…' : 'Descargar ficha en PDF (A5)'}
        </button>
      </section>

      {/* The blocks the field schema defines but this delivery does not cover
          are declared instead of omitted: this way what is missing shows and
          the record does not look complete. */}
      <section className="card text-sm text-stone-500">
        <p className="font-medium text-stone-700">Pendiente en esta entrega</p>
        <p className="mt-1">
          Procedencia, historial expositivo, bibliografía, documentación relacionada, series y obras
          relacionadas. También la descarga del máster de archivo. Ver el orden de construcción en la
          documentación.
        </p>
      </section>
    </Layout>
  )
}

function Badge({ active, text }: { active: boolean; text: string }) {
  return (
    <span
      className={`rounded px-2 py-0.5 text-xs ${
        active ? 'bg-green-100 text-green-900' : 'bg-stone-200 text-stone-700'
      }`}
    >
      {text}
    </span>
  )
}

function EditForm({
  artwork,
  onDone,
  onCancel,
}: {
  artwork: Artwork
  onDone: () => Promise<void>
  onCancel: () => void
}) {
  const [data, setData] = useState(artwork)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function set<K extends keyof Artwork>(field: K, value: Artwork[K]) {
    setData((d) => ({ ...d, [field]: value }))
  }

  /**
   * RF-209: the authorship states split by whether a title is written, and
   * the database enforces it (artworks_attributed_title_matches_title).
   * Crossing the line moves the authorship to the pending state of the other
   * side and says so: a silent change would look like the form lost the datum.
   */
  const [authorshipHint, setAuthorshipHint] = useState<string | null>(null)

  function setTitle(value: string) {
    const blank = value.trim() === ''
    const current = data.attributed_title
    let attributed = current
    if (blank && (current === 'NO' || current === 'YES' || current === 'UNCONFIRMED')) {
      attributed = 'UNREVIEWED'
    }
    if (!blank && (current === 'UNREVIEWED' || current === 'NOT_APPLICABLE')) {
      attributed = 'UNCONFIRMED'
    }
    if (attributed !== current) {
      setAuthorshipHint(
        current === 'NOT_APPLICABLE'
          ? 'Constaba «No consta título» y ahora hay un título escrito: la autoría pasa a «Sin confirmar».'
          : blank
            ? 'El título ha quedado vacío: la autoría vuelve a «Sin revisar».'
            : 'Con título escrito, la autoría pasa a «Sin confirmar».',
      )
    }
    setData((d) => ({ ...d, title: value, attributed_title: attributed }))
  }

  const toNumber = (v: string) => {
    const clean = v.replace(',', '.').trim()
    if (clean === '') return null
    const n = Number(clean)
    return Number.isFinite(n) ? n : null
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)

    // catalog_id and artist are not sent: they are immutable (RF-204) and a
    // database trigger rejects the change. Not sending them avoids provoking
    // the error.
    const { error } = await supabase
      .from('artworks')
      .update({
        title: data.title.trim(),
        attributed_title: data.attributed_title,
        artwork_type: data.artwork_type.trim(),
        // execution_date is not sent: the database composes it (generated column).
        start_year: data.start_year,
        end_year: data.end_year,
        approximate_date: data.start_year != null && data.approximate_date,
        unconfirmed_date: data.start_year != null && data.unconfirmed_date,
        date_note: data.date_note.trim(),
        technique: data.technique.trim(),
        support: data.support.trim(),
        height_cm: data.height_cm,
        width_cm: data.width_cm,
        depth_cm: data.depth_cm,
        signed: data.signed,
        signature_description: data.signature_description.trim(),
        dated_on_artwork: data.dated_on_artwork,
        conservation_status: data.conservation_status,
        existence_status: data.existence_status,
        physical_location: locationForSaving(data.physical_location),
        measurements_verified: data.measurements_verified,
        inventory_phase_completed: data.inventory_phase_completed,
        documentation_phase_completed: data.documentation_phase_completed,
        catalog_record_complete: data.catalog_record_complete,
        inventory_process_notes: data.inventory_process_notes,
      })
      .eq('catalog_id', artwork.catalog_id)

    if (error) {
      setError(error.message)
      setSaving(false)
      return
    }
    await onDone()
  }

  return (
    <form onSubmit={save} className="space-y-3">
      {/* RF-308: the whole record enters edit mode at once, header included.
          The primary key is shown read-only (RF-204). */}
      <FieldGroup title="Identificación">
        <div>
          <label className="label">Código de catalogación</label>
          <input className="field bg-stone-100 text-stone-500" value={artwork.catalog_id} readOnly />
          <p className="mt-1 text-xs text-stone-500">
            No es editable: es la etiqueta pegada en la obra y el eje de las tablas relacionadas.
          </p>
        </div>

        <div>
          <label className="label" htmlFor="e-type">
            Tipo de obra
          </label>
          <input
            id="e-type"
            className="field"
            value={data.artwork_type}
            onChange={(e) => set('artwork_type', e.target.value)}
          />
        </div>

      </FieldGroup>

      <FieldGroup title="Título">
        <div>
          <input
            id="e-title"
            aria-label="Título"
            className="field"
            value={data.title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <p className="mt-1 text-xs text-stone-500">
            Déjalo vacío si no consta título: la ficha mostrará [Sin título].
          </p>
        </div>

        <div>
          {/* Only the states that apply to the current field are offered:
              with a blank title, pending or verified-untitled; with a written
              one, the three authorship answers about it. */}
          <OptionCards
            id="e-attributed"
            label="Autoría"
            options={(
              (data.title.trim() === ''
                ? ['UNREVIEWED', 'NOT_APPLICABLE']
                : ['NO', 'YES', 'UNCONFIRMED']) as AttributedTitleValue[]
            ).map((v) => ({
              value: v,
              text: ATTRIBUTED_TITLE_LABEL[v],
              description: ATTRIBUTED_TITLE_DESCRIPTION[v],
              Icon: AUTHORSHIP_ICON[v],
            }))}
            value={data.attributed_title}
            onChange={(v) => {
              setAuthorshipHint(null)
              set('attributed_title', v)
            }}
          />
          {authorshipHint && (
            <p role="status" className="mt-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-900">
              {authorshipHint}
            </p>
          )}
        </div>
      </FieldGroup>

      <FieldGroup title="Fecha de ejecución">
        <DateField data={data} set={set} />
      </FieldGroup>

      <FieldGroup title="Con la obra delante" hint="medidas, materia y firma">

        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className="label" htmlFor="e-height">
              Alto
            </label>
            <input
              id="e-height"
              className="field"
              inputMode="decimal"
              value={data.height_cm ?? ''}
              onChange={(e) => set('height_cm', toNumber(e.target.value))}
            />
          </div>
          <div>
            <label className="label" htmlFor="e-width">
              Ancho
            </label>
            <input
              id="e-width"
              className="field"
              inputMode="decimal"
              value={data.width_cm ?? ''}
              onChange={(e) => set('width_cm', toNumber(e.target.value))}
            />
          </div>
          <div>
            <label className="label" htmlFor="e-depth">
              Prof.
            </label>
            <input
              id="e-depth"
              className="field"
              inputMode="decimal"
              value={data.depth_cm ?? ''}
              onChange={(e) => set('depth_cm', toNumber(e.target.value))}
            />
          </div>
        </div>

        <div>
          <label className="label" htmlFor="e-technique">
            Técnica
          </label>
          <input
            id="e-technique"
            className="field"
            value={data.technique}
            onChange={(e) => set('technique', e.target.value)}
          />
        </div>

        <div>
          <label className="label" htmlFor="e-support">
            Soporte
          </label>
          <input
            id="e-support"
            className="field"
            value={data.support}
            onChange={(e) => set('support', e.target.value)}
          />
        </div>

        <TriStateIcons
          id="e-signed"
          label="Firmada"
          value={data.signed}
          onChange={(v) => set('signed', v)}
        />

        {/* Describing the signature only makes sense when there is one. */}
        {data.signed === 'YES' && (
          <div>
            <label className="label" htmlFor="e-signature-desc">
              Descripción de la firma
            </label>
            <input
              id="e-signature-desc"
              className="field"
              value={data.signature_description}
              onChange={(e) => set('signature_description', e.target.value)}
              placeholder="ángulo inferior derecho, a lápiz"
            />
          </div>
        )}

        <TriStateIcons
          id="e-dated"
          label="Lleva fecha inscrita"
          value={data.dated_on_artwork}
          onChange={(v) => set('dated_on_artwork', v)}
        />
      </FieldGroup>

      <FieldGroup title="Conservación y localización">
        <Chips
          id="e-conservation"
          label="Estado de conservación"
          options={Object.entries(CONSERVATION_LABEL).map(([v, t]) => ({
            value: v as Artwork['conservation_status'],
            text: t,
          }))}
          value={data.conservation_status}
          onChange={(v) => set('conservation_status', v)}
        />

        <Chips
          id="e-existence"
          label="Estado de existencia"
          options={Object.entries(EXISTENCE_LABEL).map(([v, t]) => ({
            value: v as Artwork['existence_status'],
            text: t,
          }))}
          value={data.existence_status}
          onChange={(v) => set('existence_status', v)}
        />

        <div>
          <label className="label" htmlFor="e-location">
            Ubicación física
          </label>
          <input
            id="e-location"
            className="field"
            autoCapitalize="none"
            value={data.physical_location}
            onChange={(e) => set('physical_location', normalizeLocation(e.target.value))}
          />
        </div>
      </FieldGroup>

      <FieldGroup title="Estado del proceso" hint="uso interno, no se publica">
        <Toggle
          label="Medidas verificadas físicamente"
          help="Solo si alguien del equipo las ha medido, no si vienen de un catálogo antiguo."
          active={data.measurements_verified}
          onChange={(v) => set('measurements_verified', v)}
        />
        <Toggle
          label="Fase 1 completada"
          help="Toma de datos con la obra delante."
          active={data.inventory_phase_completed}
          onChange={(v) => set('inventory_phase_completed', v)}
        />
        <Toggle
          label="Fase 2 completada"
          help="Documentación e investigación."
          active={data.documentation_phase_completed}
          onChange={(v) => set('documentation_phase_completed', v)}
        />
        <Toggle
          label="Ficha lista para publicar"
          help="Revisión editorial final. No se deduce de las dos fases anteriores."
          active={data.catalog_record_complete}
          onChange={(v) => set('catalog_record_complete', v)}
        />

        <div className="pt-2">
          <label className="label" htmlFor="e-notes">
            Notas del proceso
          </label>
          <textarea
            id="e-notes"
            className="field"
            rows={3}
            value={data.inventory_process_notes}
            onChange={(e) => set('inventory_process_notes', e.target.value)}
            placeholder="pendiente contactar con la familia para confirmar medidas"
          />
          <p className="mt-1 text-xs text-stone-500">
            Uso interno del equipo. No se publica en el catálogo.
          </p>
        </div>
      </FieldGroup>

      {/* Save and cancel always under the thumb: the form is long and the save
          error appears next to the button just pressed. */}
      <ActionBar
        notice={
          error ? (
            <p role="alert" className="rounded-lg bg-red-50 p-2 text-sm text-red-800">
              No se ha podido guardar: {error}
            </p>
          ) : null
        }
      >
        <button className="btn-primary min-h-[3.25rem] flex-1 text-base" disabled={saving}>
          {saving ? 'Guardando…' : 'Guardar'}
        </button>
        <button type="button" className="btn-secondary" onClick={onCancel} disabled={saving}>
          Cancelar
        </button>
      </ActionBar>
    </form>
  )
}

/**
 * Execution date over the structured fields (ADR-004), with the same controls
 * as the capture flow, and an escape hatch that ALSO structures:
 *
 * "Escribir a mano" parses what is typed. If it is one of the canonical
 * formats ("c.1975 - 1978", with the catalog variants), it fills the
 * structured fields and no note remains: typing it and composing it with
 * buttons yield the same record. Only the unparseable ("finales de los
 * setenta") is kept as a note — it is what gets published — and even then the
 * first plausible year is rescued so the artwork does not vanish from period
 * searches.
 */
function DateField({
  data,
  set,
}: {
  data: Artwork
  set: <K extends keyof Artwork>(field: K, value: Artwork[K]) => void
}) {
  const [range, setRange] = useState(() => data.end_year != null)
  const [byHand, setByHand] = useState(() => data.date_note !== '')
  const [draft, setDraft] = useState(() => data.date_note || data.execution_date)

  const structure = {
    year: data.start_year,
    endYear: range ? data.end_year : null,
    approximate: data.approximate_date,
    unconfirmed: data.unconfirmed_date,
  }

  function applyManual() {
    const { date, note } = parseManualDate(draft)
    set('start_year', date.year)
    set('end_year', date.endYear)
    set('approximate_date', date.approximate)
    set('unconfirmed_date', date.unconfirmed)
    set('date_note', note)
    setRange(date.endYear != null)
    // If the text was canonical, it is already structured: back to the buttons.
    if (note === '') setByHand(false)
  }

  if (byHand) {
    const { date, note } = parseManualDate(draft)
    return (
      <div>
        <label className="label" htmlFor="e-date">
          Fecha, escrita a mano
        </label>
        <div className="flex gap-2">
          <input
            id="e-date"
            className="field flex-1"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={applyManual}
            placeholder="1978 · c. 1975-1978 · finales de los setenta"
          />
          <button type="button" className="btn-secondary shrink-0" onClick={applyManual}>
            Aplicar
          </button>
        </div>
        {/* The parse result is anticipated BEFORE applying: knowing whether
            what was typed will be structured or kept as a note avoids
            surprises. */}
        <p aria-live="polite" className="mt-1 text-xs text-stone-500">
          {draft.trim() === '' ? (
            'Vacío: obra sin fechar.'
          ) : note === '' ? (
            <>Se reconoce como «{composeDate(date)}» y se guardará estructurada.</>
          ) : date.year != null ? (
            <>Se guardará tal cual, y se encontrará al buscar por {date.year}.</>
          ) : (
            'Se guardará tal cual. Sin ningún año, no aparecerá en las búsquedas por época.'
          )}
        </p>
        <button
          type="button"
          className="mt-1 text-xs text-stone-600 underline"
          onClick={() => {
            applyManual()
            setByHand(false)
          }}
        >
          Volver a los botones
        </button>
      </div>
    )
  }

  function put(changes: {
    year?: number | null
    endYear?: number | null
    approximate?: boolean
    unconfirmed?: boolean
  }) {
    if ('year' in changes) set('start_year', changes.year ?? null)
    if ('endYear' in changes) set('end_year', changes.endYear ?? null)
    if ('approximate' in changes) set('approximate_date', changes.approximate ?? false)
    if ('unconfirmed' in changes) set('unconfirmed_date', changes.unconfirmed ?? false)
  }

  return (
    <div className="space-y-3">
      {range ? (
        /* Both years of the range on the same line: they are one datum. */
        <div className="grid grid-cols-2 gap-2">
          <YearStepper
            id="e-year"
            label="Año inicial"
            compact
            value={structure.year}
            min={MIN_YEAR}
            max={maxYear()}
            onChange={(year) => put({ year })}
          />
          <YearStepper
            id="e-end-year"
            label="Año final"
            compact
            value={structure.endYear}
            min={MIN_YEAR}
            max={maxYear()}
            onChange={(endYear) => put({ endYear })}
          />
        </div>
      ) : (
        <YearStepper
          id="e-year"
          label="Año"
          value={structure.year}
          min={MIN_YEAR}
          max={maxYear()}
          onChange={(year) => put({ year })}
        />
      )}

      <div className="grid grid-cols-3 gap-2">
        <ToggleChip
          label="Aproximada"
          active={structure.approximate}
          onChange={(v) => put({ approximate: v })}
        />
        <ToggleChip
          label="Rango"
          active={range}
          onChange={(v) => {
            setRange(v)
            if (v && structure.year != null && data.end_year == null) {
              put({ endYear: adjustYear(structure.year, 1) })
            }
            if (!v) put({ endYear: null })
          }}
        />
        <ToggleChip
          label="Sin confirmar"
          active={structure.unconfirmed}
          onChange={(v) => put({ unconfirmed: v })}
        />
      </div>

      <p className="text-xs text-stone-500">
        «Aproximada»: de alrededor de ese año (c.). «Sin confirmar»: se desconoce; el año es una
        estimación ([?]).
      </p>

      <div className="flex items-center justify-between gap-2 rounded-lg bg-stone-100 px-3 py-2">
        <span id="date-preview" aria-live="polite" className="text-sm">
          {structure.year == null ? (
            <span className="text-stone-500">Sin fechar</span>
          ) : (
            <>
              Se guardará como <span className="font-medium">{composeDate(structure)}</span>
            </>
          )}
        </span>
        <button
          type="button"
          className="shrink-0 text-xs text-stone-600 underline"
          onClick={() => {
            setDraft(composeDate(structure))
            setByHand(true)
          }}
        >
          Escribir a mano
        </button>
      </div>
    </div>
  )
}
