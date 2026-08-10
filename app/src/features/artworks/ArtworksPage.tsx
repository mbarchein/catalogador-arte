import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useAuth } from '../../auth/AuthContext'
import { Layout } from '../../components/Layout'
import {
  BottomSheet,
  CheckList,
  FunnelIcon,
  RadioList,
  SearchableCheckList,
} from '../../components/ui'
import { displayDate } from '../../lib/dates'
import { existenceNotice, displayMeasurements, displayTitle } from '../../lib/title'
import { ARTIST_LABEL, ARTIST_FUNDS } from '../../lib/types'
import { useArtistFunds } from '../tables/useArtistFunds'
import { fundFilterOptions } from '../tables/artistFunds'
import { useLiveChanges } from '../../lib/live'
import { placesInside } from '../../lib/places'
import {
  FUND_LABEL,
  NO_FILTERS,
  NO_SERIES,
  ORDER_LABEL,
  STATUS_FILTER_LABEL,
  activeFilterCount,
  hasNoFilters,
  isDefaultView,
  legacyPlaceParams,
  parseView,
  placeFilterOptions,
  readStoredView,
  saveStoredView,
  serializeView,
  seriesFilterOptions,
  type ListOrder,
  type ListView,
  type StatusFilter,
} from './listView'
import { useArtworks } from './useArtworks'
import { useArtworkTypes } from './useArtworkTypes'
import { usePhysicalPlaces } from './usePhysicalPlaces'
import { useSeries } from './useSeries'

/** The usual ones, while the funds table arrives. */
const FALLBACK_FUND_OPTIONS = ARTIST_FUNDS.map((v) => ({ value: v, text: FUND_LABEL[v] }))

const STATUS_OPTIONS = (Object.keys(STATUS_FILTER_LABEL) as StatusFilter[]).map((v) => ({
  value: v,
  text: STATUS_FILTER_LABEL[v],
}))

const ORDER_OPTIONS: { value: ListOrder; text: string; hint?: string }[] = [
  { value: 'RECENT', text: ORDER_LABEL.RECENT, hint: 'Últimas creadas o modificadas' },
  { value: 'CATALOG_ID', text: ORDER_LABEL.CATALOG_ID, hint: 'AR-0001, AR-0002…' },
  {
    value: 'CHRONOLOGICAL',
    text: ORDER_LABEL.CHRONOLOGICAL,
    hint: 'Por año de ejecución; las obras sin fecha, al final',
  },
  { value: 'TITLE', text: ORDER_LABEL.TITLE, hint: 'Alfabético; [Sin título] al final' },
]

export function ArtworksPage() {
  // The view lives in the URL (RF-608, RF-610): it survives a reload, comes back
  // with the back button, and a filtered and searched list can be shared as a
  // link — and it is what the record view walks with «anterior» and «siguiente»
  // (RF-311), which is why the searched text has to be in there too.
  const [searchParams, setSearchParams] = useSearchParams()
  const view = useMemo(() => parseView(searchParams), [searchParams])
  const [sheetOpen, setSheetOpen] = useState(false)
  const { types } = useArtworkTypes()
  // No fund is passed: this filter offers the series of several funds at once,
  // each option labeled with the fund it belongs to.
  const { entries: seriesEntries } = useSeries()
  const { tree: placeTree, loading: placesLoading } = usePhysicalPlaces()

  // Entering with a clean URL applies the last combination chosen on this
  // device. Only once: after that, the URL is the single truth of the view.
  const restored = useRef(false)
  useEffect(() => {
    if (restored.current) return
    restored.current = true
    if (searchParams.toString() !== '') return
    const stored = readStoredView()
    if (!isDefaultView(stored)) setSearchParams(serializeView(stored), { replace: true })
  }, [searchParams, setSearchParams])

  // A link shared before the tree existed carries the location as text
  // (`?location=castelar+4`). It is translated into identifiers as soon as the
  // tree is here and the address is rewritten, so the link is upgraded in place
  // instead of half-working forever. Waiting for the tree matters: resolving
  // against an empty one would drop the filter and quietly show the whole
  // catalog.
  const upgraded = useRef(false)
  useEffect(() => {
    if (upgraded.current || placesLoading) return
    const ids = legacyPlaceParams(searchParams, placeTree)
    if (ids === null) return
    upgraded.current = true
    setSearchParams(serializeView({ ...parseView(searchParams), places: ids }), { replace: true })
  }, [placesLoading, placeTree, searchParams, setSearchParams])

  // `replace` on purpose: each change must not pile a history entry, or the
  // phone's back button would walk every filter ever touched before leaving
  // the list. The sheet stays open: adjusting several filters in one visit is
  // the normal case, and it closes with its own button or the backdrop.
  function updateView(change: Partial<ListView>) {
    const next = { ...view, ...change }
    setSearchParams(serializeView(next), { replace: true })
    // What gets remembered is what the user chose here, not any URL they
    // happened to open: a link someone shared must not overwrite the
    // preference of this device.
    saveStoredView(next)
  }

  // Typing does NOT go through updateView: the searched text belongs to this
  // visit and is not remembered for the next one (RF-610).
  function updateSearch(search: string) {
    setSearchParams(serializeView({ ...view, search }), { replace: true })
  }

  // The reach of the location filter, computed once per view: a chosen place
  // answers for everything inside it. Null while the tree is on its way, so a
  // filtered list does not flash empty (see matchesView).
  const placeScope = useMemo(
    () => (placesLoading ? null : placesInside(placeTree, view.places)),
    [placesLoading, placeTree, view.places],
  )

  // The funds and, of them, the ones that set their artworks aside (ADR-007, second delivery).
  // They are read here and not inside the artworks hook because the fund list belongs to
  // the screen: it is also used to say out loud what is being set aside.
  const { entries: funds } = useArtistFunds()
  const hidden = useMemo(() => funds.filter((f) => f.hideArtworks), [funds])
  const hiddenFunds = useMemo(
    () => new Set(hidden.map((f) => f.code)),
    // By the code and not by the object: the list is new on every load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hidden.map((f) => f.code).join(' ')],
  )

  const { artworks, thumbnails, loading, error, reload, refreshThumbnails } = useArtworks(
    view,
    placeScope,
    hiddenFunds,
  )
  const { canEdit } = useAuth()

  // The list updates live: if another cataloger creates or edits an artwork,
  // it appears without reloading. It is the view where two people working at
  // once step on each other unknowingly.
  useLiveChanges('artworks', reload)
  // Photos are their own table: changing the main image, adding a photo or
  // retiring one does not touch the artwork row, so without this the list kept
  // showing the old thumbnail until something else forced a reload.
  useLiveChanges('images', () => void refreshThumbnails())

  // A type arriving in the URL that the vocabulary does not know is still
  // shown as a marked option: the checkboxes must reflect what is filtering.
  const typeOptions = useMemo(() => {
    const unknown = view.types.filter((t) => !types.includes(t))
    return [...types, ...unknown].map((t) => ({ value: t, text: t }))
  }, [types, view.types])

  // Series of the selected funds only, each labeled with its fund. Same rule
  // for what the vocabulary does not know: it stays visible as marked.
  //
  // Retired series are dropped here, as retired types already are by `types`:
  // what is no longer on offer for cataloging is no longer offered for filtering
  // either. One asymmetry left on purpose — a series that is filtering right now
  // survives as a marked option, so a saved link does not quietly widen.
  const seriesOptions = useMemo(
    () => seriesFilterOptions(seriesEntries.filter((e) => e.active), view.funds, view.series),
    [seriesEntries, view.funds, view.series],
  )

  // The whole tree, branch by branch: every node can be asked for, and asking
  // for one brings everything inside it.
  const placeOptions = useMemo(
    () => placeFilterOptions(placeTree, view.places),
    [placeTree, view.places],
  )

  const activeCount = activeFilterCount(view)

  const noCriteria = view.search.trim() === '' && hasNoFilters(view)

  return (
    <Layout
      // Search and filters live in the fixed header: they are the tools of
      // the whole view and this way they never scroll away. Creating is not
      // here anymore — the footer's "Añadir" tab already covers it (RF-1104:
      // that tab only exists for whoever can edit).
      headerContent={
        <input
          className="field min-h-[2.5rem] py-1"
          type="search"
          value={view.search}
          onChange={(e) => updateSearch(e.target.value)}
          placeholder="Buscar por código o título"
          aria-label="Buscar obras"
        />
      }
      action={
        <button
          type="button"
          aria-haspopup="dialog"
          aria-label={`Filtros y orden${activeCount > 0 ? `, ${activeCount} activos` : ''}`}
          onClick={() => setSheetOpen(true)}
          className={`flex min-h-[2.5rem] items-center gap-1 rounded-lg border px-2.5 text-sm transition ${
            activeCount > 0
              ? 'border-stone-800 bg-stone-800 text-white'
              : 'border-stone-300 bg-white text-stone-700'
          }`}
        >
          <FunnelIcon className="h-4 w-4" />
          {activeCount > 0 ? activeCount : ''}
        </button>
      }
    >
      {error && (
        <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">
          No se ha podido cargar el listado: {error}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-stone-600">Cargando…</p>
      ) : artworks.length === 0 ? (
        /* RF-605: never a blank page. Search and filters are kept and what
           happened is explained where the list would go. */
        <div className="card text-sm">
          {noCriteria ? (
            <>
              <p className="font-medium">Todavía no hay obra catalogada.</p>
              {canEdit && (
                <p className="mt-1 text-stone-600">
                  Empieza por la <Link to="/capture" className="underline">captura rápida</Link>.
                </p>
              )}
            </>
          ) : (
            <>
              <p>No se han encontrado obras con estos criterios.</p>
              {!hasNoFilters(view) && (
                <button
                  type="button"
                  className="btn-secondary mt-3 w-full"
                  onClick={() => updateView(NO_FILTERS)}
                >
                  Quitar los filtros
                </button>
              )}
            </>
          )}
        </div>
      ) : (
        <>
          <p className="mb-2 text-xs text-stone-500">
            {artworks.length} {artworks.length === 1 ? 'obra' : 'obras'}
          </p>
          <ul className="space-y-2">
            {artworks.map((artwork) => {
              const notice = existenceNotice(artwork)
              return (
                <li key={artwork.catalog_id}>
                  {/* The code is the only link to the record (RF-604), but on
                      a phone the whole card must be tappable: aiming at a
                      twelve-character text with a thumb is not reasonable.

                      The view travels with the link: it is what tells the record
                      which sequence «anterior» and «siguiente» walk (RF-311). */}
                  <Link
                    to={{ pathname: `/artwork/${artwork.catalog_id}`, search: searchParams.toString() }}
                    className="card flex gap-3 hover:border-stone-400"
                  >
                    {/* RF-604: thumbnail of the representative image. Which
                        one it is is decided by the database view, not this
                        screen. */}
                    <Thumbnail url={thumbnails[artwork.catalog_id]} photographed={artwork.photographed} />

                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="font-mono text-sm font-semibold">
                          {artwork.catalog_id}
                        </span>
                        <span className="shrink-0 text-xs text-stone-500">
                          {displayDate(artwork.execution_date)}
                        </span>
                      </div>
                      <p className="mt-0.5 truncate">{displayTitle(artwork.title)}</p>
                      <p className="mt-0.5 text-xs text-stone-600">
                        {ARTIST_LABEL[artwork.artist]}
                        {artwork.artwork_type && ` · ${artwork.artwork_type}`}
                        {' · '}
                        {displayMeasurements(artwork)}
                      </p>
                      {notice && (
                        <p className="mt-1 inline-block rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-900">
                          {notice}
                        </p>
                      )}
                    </div>
                  </Link>
                </li>
              )
            })}
          </ul>
        </>
      )}

      {/* One sheet with every section: with a single entry button there is
          nothing to choose before opening, and adjusting several filters in
          one visit needs no round trips. */}
      <BottomSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title="Filtros y orden"
        // Removing the filters, at the top and with the count inside. It used to live at the foot of
        // the sheet, below five sections of options: to find it one had to
        // go through exactly what one wanted to undo. And the number is not an ornament — it is what
        // is needed to decide whether to press it, because with the sheet open the
        // sections that have something set are not all visible at once.
        headerAction={
          activeCount > 0 ? (
            <button
              type="button"
              onClick={() => updateView({ ...NO_FILTERS, order: 'RECENT' })}
              aria-label={`Quitar los ${activeCount} filtros aplicados`}
              className="min-h-11 rounded-lg px-3 text-sm font-medium text-stone-700 active:bg-stone-100"
            >
              Quitar filtros
              <span className="ml-1.5 inline-flex min-w-5 justify-center rounded-full bg-stone-700 px-1.5 py-0.5 text-xs font-semibold text-white">
                {activeCount}
              </span>
            </button>
          ) : undefined
        }
      >
        <div className="space-y-4">
          <section>
            <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-stone-500">
              Ordenar por
            </h3>
            <RadioList
              options={ORDER_OPTIONS}
              value={view.order}
              onChange={(order) => updateView({ order })}
            />
          </section>

          <section>
            <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-stone-500">
              Fondo <span className="normal-case text-stone-400">· sin marcar, todos</span>
            </h3>
            {/* Desde la tabla, no desde el enumerado: es donde está el nombre
                corregido y el distintivo del fondo apartado. Con los de siempre
                mientras carga, para no pintar un filtro vacío. */}
            <CheckList
              options={funds.length > 0 ? fundFilterOptions(funds) : FALLBACK_FUND_OPTIONS}
              values={view.funds}
              onChange={(funds) => updateView({ funds })}
            />
          </section>

          <section>
            <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-stone-500">
              Tipo de obra <span className="normal-case text-stone-400">· sin marcar, todos</span>
            </h3>
            {/* The vocabulary itself (RF-213): the same list the forms offer. */}
            <CheckList
              options={typeOptions}
              values={view.types}
              onChange={(types) => updateView({ types })}
            />
          </section>

          <section>
            <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-stone-500">
              Serie <span className="normal-case text-stone-400">· sin marcar, todas</span>
            </h3>
            {/* Each option says its fund: the vocabulary is per fund, and the
                filter matches by name, so a name shared by two funds is one
                option labeled with both (see seriesFilterOptions). «Sin serie»
                heads the list and is always there. */}
            <SearchableCheckList
              options={seriesOptions}
              values={view.series}
              onChange={(series) => updateView({ series })}
              searchLabel="Buscar serie"
              placeholder="Buscar serie"
            />
            {/* With «Sin serie» always present the list is never empty, so it can
                no longer explain by itself that there is nothing else to choose.
                It is said here: a single row with no explanation would read like
                a chooser that failed to load. */}
            {seriesOptions.every((o) => o.value === NO_SERIES) && (
              <p className="px-3 py-2 text-sm text-stone-600">
                {view.funds.length > 0
                  ? 'Los fondos marcados no tienen series en el catálogo.'
                  : 'Todavía no hay series en el catálogo.'}
              </p>
            )}
          </section>

          <section>
            <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-stone-500">
              Ubicación física{' '}
              <span className="normal-case text-stone-400">· incluye lo que hay dentro</span>
            </h3>
            {/* Hierarchical: marking «edificio a» also brings every room,
                shelf and folder under it. That is the question one actually
                asks in a storage room. */}
            <SearchableCheckList
              options={placeOptions}
              values={view.places}
              onChange={(places) => updateView({ places })}
              searchLabel="Buscar ubicación"
              placeholder="Buscar ubicación"
              emptyText="Todavía no hay ubicaciones registradas."
            />
          </section>

          <section>
            <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-stone-500">
              Estado del proceso
            </h3>
            <RadioList
              options={STATUS_OPTIONS}
              value={view.status}
              onChange={(status) => updateView({ status })}
            />
          </section>

          {/* Solo «Hecho», y a todo el ancho. «Quitar todo» estaba aquí y ahora está
              en la cabecera con su cuenta: dejarlo en los dos sitios sería el mismo
              error que el editor de fotografías ya corrigió una vez —dos controles
              para una sola decisión— y además el de arriba dice cuántos filtros
              quita, que es información que este no tenía. */}
          <div className="pb-1">
            <button
              type="button"
              onClick={() => setSheetOpen(false)}
              className="btn min-h-touch w-full bg-stone-900 text-white"
            >
              Hecho
            </button>
          </div>
        </div>
      </BottomSheet>
    </Layout>
  )
}

/**
 * List thumbnail, fixed-size so rows do not dance while images arrive: the
 * list paints before the URL signatures, and without a reserved box the text
 * would jump as each photo appears.
 *
 * Three distinct states, and distinguishing them matters:
 *  - there is a photo and its URL arrived → it is shown;
 *  - the artwork is photographed but the URL has not arrived yet → neutral gap;
 *  - the artwork has no photo at all → it is said, because in an inventory
 *    "unphotographed" is pending work and should be visible at a glance.
 */
function Thumbnail({ url, photographed }: { url?: string; photographed: boolean }) {
  if (url) {
    return (
      <img
        src={url}
        alt=""
        loading="lazy"
        className="h-16 w-16 shrink-0 rounded-lg border border-stone-200 bg-white object-cover"
      />
    )
  }
  return (
    <div
      className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg border border-dashed border-stone-300 bg-stone-50 p-1 text-center text-3xs leading-tight text-stone-400"
      aria-hidden={photographed}
    >
      {photographed ? '' : 'Sin foto'}
    </div>
  )
}
