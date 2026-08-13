import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { useAuth } from '../../auth/AuthContext'
import { Layout } from '../../components/Layout'
import { ImageIcon, Toggle } from '../../components/ui'
import { rankExhibitions, retiredCount } from './exhibitionIndex'
import { exhibitionCountText, exhibitionListNotice } from './exhibitionMessages'
import { useExhibitionPosters } from './useExhibitionPosters'
import { useExhibitions } from './useExhibitions'

/**
 * The index of exhibitions, with its own search (RF-606, RF-502, RF-609).
 *
 * It is the half of the exhibition history that was missing. The record of an
 * artwork could already say that a piece was in a show and could LINK it to one,
 * and the code told the cataloger so in as many words — «dar de alta una
 * exposición nueva es otra pantalla» — but that screen did not exist: you could
 * assert a show and not create it. This is that screen's front door.
 *
 * **Readable by anybody who can read, unlike the master tables.** An exhibition is
 * a record of the catalogue and not a maintenance list: a Lector consults it the
 * same way it consults an artwork, and RLS already hands it only the live ones.
 * Creating and correcting are the Cataloger's, and they live behind their own
 * routes — the button is not painted for a Lector and the routes check again,
 * because a hidden button is not a protection.
 *
 * **Search in the client over the whole table.** Dozens of exhibitions, not
 * thousands: one query answers every keystroke without a round trip, which is what
 * makes it usable over a bad connection in a storeroom. The decision, and the day
 * it stops holding, is written down in `useExhibitions`.
 */
export function ExhibitionsPage() {
  const { canEdit } = useAuth()
  const { exhibitions, loading, error } = useExhibitions()
  const [query, setQuery] = useState('')
  const [includingRetired, setIncludingRetired] = useState(false)

  const entries = useMemo(
    () => rankExhibitions(exhibitions, query, { includeRetired: includingRetired }),
    [exhibitions, query, includingRetired],
  )
  const retired = retiredCount(exhibitions)
  // Se firman las de las filas que se pintan, no las de la tabla entera: con el
  // buscador escrito son tres y no doscientas.
  const posters = useExhibitionPosters(useMemo(() => entries.map((entry) => entry.row), [entries]))

  const notice = exhibitionListNotice({
    loading,
    error,
    total: includingRetired ? exhibitions.length : exhibitions.length - retired,
    shown: entries.length,
    query,
    includingRetired,
  })

  return (
    <Layout
      title="Exposiciones"
      back="/"
      headerContent={
        <input
          className="field min-h-[2.5rem] py-1"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Título, año o sede"
          aria-label="Buscar exposiciones"
          autoComplete="off"
          autoCapitalize="none"
        />
      }
      action={
        canEdit ? (
          <Link
            to="/exhibitions/new"
            className="flex min-h-[2.5rem] items-center rounded-lg bg-stone-800 px-2.5 text-sm font-medium text-white"
          >
            + Nueva
          </Link>
        ) : undefined
      }
    >
      {error && (
        <p role="alert" className="card mb-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {/* El contador va arriba y siempre: un listado filtrado que parece completo
          es cómo se pierde una ficha. Cuando hay búsqueda dice las dos cifras. */}
      {entries.length > 0 && (
        <p className="mb-2 text-sm text-stone-600">
          {query.trim() === ''
            ? exhibitionCountText(entries.length)
            : `${exhibitionCountText(entries.length)} de ${exhibitions.length}`}
        </p>
      )}

      {/* La papelera solo para quien puede editar, y solo cuando hay algo dentro:
          es el único sitio desde el que se recupera una exposición retirada, y un
          interruptor que no cambia nada parece roto. El Lector no las recibe. */}
      {canEdit && retired > 0 && (
        <div className="mb-3">
          <Toggle
            active={includingRetired}
            onChange={setIncludingRetired}
            label="Ver también las retiradas"
            help={`${retired === 1 ? '1 exposición retirada' : `${retired} exposiciones retiradas`}. Es el único sitio desde el que se recuperan.`}
          />
        </div>
      )}

      {/* Nunca una página en blanco: sin resultados se explica por qué, y con el
          catálogo vacío se dice qué es esta pantalla y qué se hace después. */}
      {notice && <p className="card text-sm text-stone-600">{notice}</p>}

      <ul className="space-y-2">
        {entries.map((entry) => (
          <li key={entry.row.id}>
            {/* La fila entera es el enlace: en un móvil, un código de cuatro
                caracteres como única zona pulsable es un objetivo que se falla. */}
            <Link
              to={`/exhibitions/${entry.row.id}`}
              className={`card flex gap-3 active:bg-stone-50 ${entry.retired ? 'opacity-60' : ''}`}
            >
              {/* La miniatura del cartel (RF-518), **con la forma de un cartel** y no
                  cuadrada: 1:√2, que es la de la serie A —un A2 o un A1— y casi la de
                  un 50×70, así que un cartel vertical entra entero y el recorte es de
                  unos milímetros. Cuadrada le cortaba la cabecera y el pie, que es
                  justo donde están el título y las fechas.

                  Y siempre el mismo hueco, con cartel o sin él: es lo que hace el
                  listado recorrible: si las filas sin cartel no lo tuvieran, cada una
                  desplazaría el texto de las demás y las fechas dejarían de leerse en
                  columna. Sin cartel, un icono — nunca un hueco vacío (RF-304). */}
              {/* `self-start` no es adorno: en un contenedor flexible, un hijo se
                  estira a lo alto de la fila por omisión, y una altura estirada gana a
                  la proporción — el cuadro saldría tan alto como el texto de al lado y
                  el cartel, deformado. */}
              <span className="mt-0.5 aspect-[707/1000] w-14 shrink-0 self-start overflow-hidden rounded border border-stone-200 bg-stone-100">
                {posters[entry.row.id] !== undefined ? (
                  <img
                    src={posters[entry.row.id]}
                    alt=""
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <span className="flex h-full w-full items-center justify-center text-stone-400">
                    <ImageIcon className="h-5 w-5" />
                  </span>
                )}
              </span>
              <span className="block min-w-0 flex-1">
              {/* El orden de RF-502: cuándo, qué y dónde. La cronología encabeza
                  porque este listado se recorre por años. */}
              <span className="block text-xs text-stone-500">{entry.dates}</span>
              {/* Sin resaltar las letras que ha encontrado la búsqueda, a
                  diferencia del selector de la ficha de obra, y es una decisión:
                  los índices que devuelve `fuzzyRankBy` son posiciones dentro de
                  la línea ENTERA («título · año · sede»), y esta fila la parte en
                  tres para poder dar el orden de RF-502. Repartir esas posiciones
                  entre los tres trozos es fácil de hacer mal, y un resaltado
                  desplazado una letra es peor que ninguno. */}
              <span className="mt-0.5 block break-words font-medium italic">{entry.title}</span>
              <span className="mt-0.5 block break-words text-xs text-stone-600">{entry.venue}</span>
              <span className="mt-1 flex flex-wrap items-center gap-1.5">
                <span
                  className={`rounded px-1.5 py-0.5 text-xs ${
                    entry.kindPending ? 'bg-amber-50 text-amber-900' : 'bg-stone-100 text-stone-700'
                  }`}
                >
                  {entry.kind}
                </span>
                {entry.retired && (
                  <span className="rounded bg-stone-200 px-1.5 py-0.5 text-xs text-stone-700">
                    Retirada
                  </span>
                )}
              </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Layout>
  )
}
