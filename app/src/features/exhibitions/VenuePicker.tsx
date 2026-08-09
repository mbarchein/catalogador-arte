import { useMemo, useState } from 'react'
import { BottomSheet } from '../../components/ui'
import type { ExhibitionVenue } from '../../lib/types'
import { useExhibitionVenues } from '../tables/useExhibitionVenues'
import { Marked } from './Marked'
import { chosenVenueText, keptVenue, noVenuesText, rankVenues } from './venueChoice'

/**
 * Choosing the venue of an exhibition out of the master table (RF-512).
 *
 * A sheet with a search field and not a `<select>`, and not because a select is
 * ugly: (name, locality) is the identity of a venue, so an option is two lines and
 * not one, and the same «Casa de Cultura» appears as many times as there are towns
 * that have one. A native select with forty of those and no search is a wheel
 * spun blind.
 *
 * **The empty value is a first-class option and it is at the top.** A venue on
 * record only as free text — «una galería de Madrid» — is a legitimate datum and
 * not a missing record: it is what the press cutting said, and inventing a venue
 * to be able to save is how a catalogue ends up with two Casas de Cultura. So the
 * sheet opens with «Sin identificar», and the field for the source's own words is
 * right below the chooser in the form.
 *
 * The venues are read with the maintenance screen's own hook, not a second query:
 * one list of venues, loaded one way, and a column added there arrives here.
 */
export function VenuePicker({
  value,
  onChange,
  /** The venue the exhibition row already embeds. See the comment on `chosen`. */
  embedded = null,
  disabled = false,
}: {
  /** The chosen venue's identifier, or '' for «sin identificar». */
  value: string
  onChange: (venueId: string) => void
  embedded?: ExhibitionVenue | null
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const { venues, loading, error } = useExhibitionVenues()

  const choices = useMemo(() => rankVenues(venues, query), [venues, query])

  /**
   * What the closed button shows.
   *
   * The loaded list first, and the row's own embedded venue as the fallback: while
   * the venues are still in the air — or if their query failed — the record already
   * knows which museum it names, and showing «Sin identificar» meanwhile would read
   * as if the venue had been lost.
   */
  const chosen = keptVenue(venues, value) ?? (embedded !== null && embedded.id === value ? embedded : null)

  function close() {
    setOpen(false)
    setQuery('')
  }

  return (
    <div>
      <span className="label" id="venue-picker-label">
        Sede
      </span>
      <button
        type="button"
        disabled={disabled}
        aria-labelledby="venue-picker-label"
        onClick={() => setOpen(true)}
        className="field flex items-center justify-between gap-2 text-left"
      >
        <span className="min-w-0 break-words">{chosenVenueText(chosen)}</span>
        <span aria-hidden className="shrink-0 text-stone-400">
          Cambiar
        </span>
      </button>
      {/* Una sede retirada detrás de una exposición viva se muestra —nunca un
          hueco donde había un nombre— y se dice que lo está: el gris a secas es
          decoración. */}
      {chosen !== null && !chosen.active && (
        <p className="mt-1 text-xs text-amber-800">
          Esta sede está retirada del catálogo. La exposición la conserva; si la cambias, no vuelve
          a ofrecerse.
        </p>
      )}

      <BottomSheet open={open} onClose={close} title="Sede de la exposición">
        <input
          type="search"
          className="field"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Nombre o localidad"
          aria-label="Buscar entre las sedes registradas"
          autoComplete="off"
          autoCapitalize="none"
        />

        {/* «Sin identificar» encabeza la lista y no la cierra: es la respuesta
            correcta cuando la fuente no dice cuál fue la sede, y buscarla al
            final de cuarenta museos es lo que hace que se invente una ficha. */}
        <button
          type="button"
          onClick={() => {
            onChange('')
            close()
          }}
          className={`mt-2 flex min-h-touch w-full flex-col items-start rounded-lg px-3 py-2 text-left
                      active:bg-stone-100 ${value === '' ? 'bg-stone-100' : ''}`}
        >
          <span className="text-sm font-medium">Sin identificar</span>
          <span className="text-xs text-stone-500">
            La fuente no dice cuál fue, o dice algo que no está en la lista: escríbelo abajo tal
            cual
          </span>
        </button>

        {error !== null ? (
          <p role="alert" className="mt-2 rounded-lg bg-red-50 p-3 text-sm text-red-800">
            {error}
          </p>
        ) : loading ? (
          <p className="mt-2 p-2 text-sm text-stone-600">Cargando las sedes…</p>
        ) : choices.length === 0 ? (
          /* Nunca una lista vacía sin explicación, y esta además dice dónde se
             crea una sede que no está. */
          <p className="mt-2 p-2 text-sm text-stone-600">{noVenuesText(venues.length, query)}</p>
        ) : (
          <ul className="mt-2 max-h-[45vh] space-y-1 overflow-y-auto">
            {choices.map((choice) => (
              <li key={choice.venue.id}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(choice.venue.id)
                    close()
                  }}
                  className={`min-h-touch w-full rounded-lg px-3 py-2 text-left text-sm active:bg-stone-100 ${
                    choice.venue.id === value ? 'bg-stone-100 font-medium' : ''
                  }`}
                >
                  <Marked text={choice.text} indices={choice.indices} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </BottomSheet>
    </div>
  )
}
