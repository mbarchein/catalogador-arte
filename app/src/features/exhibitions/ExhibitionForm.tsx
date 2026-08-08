import { Chips, FieldGroup, TriStateIcons } from '../../components/ui'
import type { ExhibitionVenue, ExhibitionTypeValue, TriState } from '../../lib/types'
import { EXHIBITION_TYPE_LABEL } from '../../lib/types'
import {
  MAX_EXHIBITION_YEAR,
  MIN_EXHIBITION_YEAR,
  type ExhibitionDraft,
} from './exhibitionDraft'
import { VenuePicker } from './VenuePicker'

/**
 * The fields of an exhibition, shared by creating one and correcting one (RF-309,
 * RF-501, RF-502, RF-503).
 *
 * One form and not two, because they are the same fields with the same rules, and
 * two copies would be two places for «la sede consta así» to lose its help text.
 * What the two screens do NOT share is what surrounds it: the alta warns about a
 * repeated title and navigates to the record it creates, the ficha compares
 * against what is stored and can retire it.
 *
 * **Every rule about what is valid is in `exhibitionDraft.ts` and none is here.**
 * This component does not disable «Guardar» according to the dates, does not
 * compute the year and does not check the coherence of the catalogue: it paints
 * fields and reports what was typed. The battery runs in node and cannot open a
 * JSX, so a rule written here is a rule nothing verifies.
 *
 * ── WHY THE YEAR DISAPPEARS WHEN THERE IS AN OPENING DATE ─────
 *
 * `tg_exhibition_year_from_dates` derives the year FROM the opening date and never
 * the other way round, and `exhibitions_year_matches_start_date` refuses a year
 * that contradicts it. Offering both fields at once would therefore be offering a
 * contradiction the database will refuse — so the year is only a field while it is
 * the ONLY date there is, and once a day is written it becomes a sentence saying
 * where the year comes from. Nothing is lost: a bare year is what half the press
 * cuttings give, and it stays writable for exactly those.
 */
export function ExhibitionForm({
  draft,
  onChange,
  /** The venue the row embeds, so the chooser can name a retired one while its list loads. */
  embeddedVenue = null,
  disabled = false,
}: {
  draft: ExhibitionDraft
  onChange: (draft: ExhibitionDraft) => void
  embeddedVenue?: ExhibitionVenue | null
  disabled?: boolean
}) {
  function set<K extends keyof ExhibitionDraft>(key: K, value: ExhibitionDraft[K]) {
    onChange({ ...draft, [key]: value })
  }

  const hasStartDate = draft.startDate.trim() !== ''

  return (
    <div className="space-y-4">
      <FieldGroup title="La muestra">
        <div>
          <label className="label" htmlFor="exhibition-title">
            Título
          </label>
          <input
            id="exhibition-title"
            className="field"
            value={draft.title}
            disabled={disabled}
            onChange={(event) => set('title', event.target.value)}
            placeholder="Alberto Rotili. Obra reciente"
            autoComplete="off"
          />
          <p className="mt-1 text-xs text-stone-500">
            Tal como se imprimió. Es lo que el historial expositivo de cada obra imprime en
            cursiva, y puede repetirse: una itinerante lleva el mismo título en cada sede.
          </p>
        </div>

        {/* Tres opciones y no dos: «Sin revisar» no es «ni individual ni
            colectiva». Un recorte de prensa da el título mucho antes de decir si
            el artista expuso solo. */}
        <Chips
          id="exhibition-type"
          label="Carácter"
          columns={3}
          value={draft.exhibitionType}
          onChange={(value: ExhibitionTypeValue) => set('exhibitionType', value)}
          options={[
            { value: 'INDIVIDUAL', text: EXHIBITION_TYPE_LABEL.INDIVIDUAL },
            { value: 'COLLECTIVE', text: EXHIBITION_TYPE_LABEL.COLLECTIVE },
            { value: 'UNREVIEWED', text: EXHIBITION_TYPE_LABEL.UNREVIEWED },
          ]}
        />

        <div>
          <label className="label" htmlFor="exhibition-note">
            Nota de la muestra
          </label>
          <textarea
            id="exhibition-note"
            className="field"
            rows={3}
            value={draft.note}
            disabled={disabled}
            onChange={(event) => set('note', event.target.value)}
            placeholder="Comisariada por…; itineró después a…"
          />
          <p className="mt-1 text-xs text-stone-500">
            De la exposición entera: comisariado, contexto, circunstancias. Lo que le pasó a UNA
            obra dentro de esta muestra va en la nota de su participación, desde su ficha.
          </p>
        </div>
      </FieldGroup>

      <FieldGroup title="Cuándo" hint="hace falta al menos el año">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="label" htmlFor="exhibition-start">
              Apertura
            </label>
            <input
              id="exhibition-start"
              type="date"
              className="field"
              value={draft.startDate}
              disabled={disabled}
              onChange={(event) => set('startDate', event.target.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor="exhibition-end">
              Cierre
            </label>
            <input
              id="exhibition-end"
              type="date"
              className="field"
              value={draft.endDate}
              disabled={disabled}
              onChange={(event) => set('endDate', event.target.value)}
            />
          </div>
        </div>

        {hasStartDate ? (
          <p className="text-xs text-stone-500">
            El año lo pone el catálogo a partir de la fecha de apertura: {draft.startDate.slice(0, 4)}.
            No se escribe aparte, para que no puedan contradecirse.
          </p>
        ) : (
          <div>
            <label className="label" htmlFor="exhibition-year">
              Año
            </label>
            <input
              id="exhibition-year"
              className="field"
              inputMode="numeric"
              value={draft.year}
              disabled={disabled}
              onChange={(event) => set('year', event.target.value)}
              placeholder="1985"
              autoComplete="off"
            />
            <p className="mt-1 text-xs text-stone-500">
              Entre {MIN_EXHIBITION_YEAR} y {MAX_EXHIBITION_YEAR}. Con el año solo basta: de un año
              no se inventa un 1 de enero, así que la ficha dirá «1985» y no una apertura que nadie
              ha documentado.
            </p>
          </div>
        )}

        <div>
          <label className="label" htmlFor="exhibition-date-note">
            Nota de las fechas
          </label>
          <input
            id="exhibition-date-note"
            className="field"
            value={draft.dateNote}
            disabled={disabled}
            onChange={(event) => set('dateNote', event.target.value)}
            placeholder="prorrogada hasta junio · solo un fin de semana"
            autoComplete="off"
          />
          <p className="mt-1 text-xs text-stone-500">
            Lo que las dos fechas no pueden decir. Se imprime detrás de ellas.
          </p>
        </div>
      </FieldGroup>

      <FieldGroup title="Dónde">
        <VenuePicker
          value={draft.venueId}
          embedded={embeddedVenue}
          disabled={disabled}
          onChange={(venueId) => set('venueId', venueId)}
        />

        <div>
          <label className="label" htmlFor="exhibition-venue-note">
            La sede consta así
          </label>
          <input
            id="exhibition-venue-note"
            className="field"
            value={draft.venueNote}
            disabled={disabled}
            onChange={(event) => set('venueNote', event.target.value)}
            placeholder="una galería de Madrid · en la sala baja"
            autoComplete="off"
          />
          {/* Los dos campos a la vez, y no uno o el otro: si la sede está
              identificada, esto sigue guardando la transcripción literal de la
              fuente, que es un dato y no ruido. */}
          <p className="mt-1 text-xs text-stone-500">
            Lo que dice la fuente, literal. Si no se sabe qué sede fue, esto es la sede: «una
            galería de Madrid» es un dato, y no hace falta inventar una ficha para poder guardarlo.
            Con sede elegida, aquí cabe el matiz: «en la sala baja».
          </p>
        </div>
      </FieldGroup>

      <FieldGroup title="Catálogo de la exposición">
        {/* Tri-estado y no una casilla: que no conste catálogo no es que no lo
            hubiera, y la diferencia es una mañana de biblioteca (RF-503). */}
        <TriStateIcons
          id="exhibition-catalogue"
          label="¿Hubo catálogo?"
          value={draft.cataloguePublished}
          onChange={(value: TriState) => set('cataloguePublished', value)}
        />
        <p className="text-xs text-stone-500">
          {draft.hasCatalogueRecord
            ? 'El catálogo de esta muestra ya está dado de alta en la bibliografía, así que aquí ' +
              'tiene que constar que sí lo hubo. Ese enlace se quita desde la bibliografía, no ' +
              'desde aquí.'
            : 'El catálogo de una exposición no tiene ficha propia: es una publicación y se da de ' +
              'alta en la bibliografía. Enlazarlo con esta muestra es otra pantalla; marcar aquí ' +
              'que lo hubo no se pierde mientras tanto.'}
        </p>
      </FieldGroup>
    </div>
  )
}
