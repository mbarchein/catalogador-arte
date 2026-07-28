import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext'
import { Layout } from '../../components/Layout'
import { BottomSheet, PlusIcon, RadioList } from '../../components/ui'
import { displayDate } from '../../lib/dates'
import { existenceNotice, displayMeasurements, displayTitle } from '../../lib/title'
import { ARTIST_LABEL, ARTIST_FUNDS } from '../../lib/types'
import { useLiveChanges } from '../../lib/live'
import {
  FUND_FILTER_LABEL,
  ORDER_LABEL,
  STATUS_FILTER_LABEL,
  hasNoFilters,
  isDefaultView,
  parseView,
  readStoredView,
  saveStoredView,
  serializeView,
  type FundFilter,
  type ListOrder,
  type ListView,
  type StatusFilter,
} from './listView'
import { useArtworks } from './useArtworks'
import { useArtworkTypes } from './useArtworkTypes'

/** Which chip's options are open in the bottom sheet. */
type SheetKind = 'fund' | 'type' | 'status' | 'order'

const FUND_OPTIONS: { value: FundFilter; text: string }[] = (
  ['ALL', ...ARTIST_FUNDS] as FundFilter[]
).map((v) => ({ value: v, text: FUND_FILTER_LABEL[v] }))

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
  const [search, setSearch] = useState('')
  // The view lives in the URL (RF-608): it survives a reload, comes back with
  // the back button, and a filtered list can be shared as a link.
  const [searchParams, setSearchParams] = useSearchParams()
  const view = useMemo(() => parseView(searchParams), [searchParams])
  const [sheet, setSheet] = useState<SheetKind | null>(null)
  const { types } = useArtworkTypes()

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

  // `replace` on purpose: each chip change must not pile a history entry, or
  // the phone's back button would walk every filter ever touched before
  // leaving the list.
  function updateView(change: Partial<ListView>) {
    const next = { ...view, ...change }
    setSearchParams(serializeView(next), { replace: true })
    // What gets remembered is what the user chose here, not any URL they
    // happened to open: a link someone shared must not overwrite the
    // preference of this device.
    saveStoredView(next)
    setSheet(null)
  }

  const { artworks, thumbnails, loading, error, reload } = useArtworks(search, view)
  const { canEdit } = useAuth()

  // The list updates live: if another cataloger creates or edits an artwork,
  // it appears without reloading. It is the view where two people working at
  // once step on each other unknowingly.
  useLiveChanges('artworks', reload)

  // A type arriving in the URL that the vocabulary does not know is still
  // shown as the active option: the radio must reflect what is filtering.
  const typeOptions = useMemo(() => {
    const names = view.type !== '' && !types.includes(view.type) ? [...types, view.type] : types
    return [{ value: '', text: 'Todos' }, ...names.map((t) => ({ value: t, text: t }))]
  }, [types, view.type])

  // Summary chips: the whole view readable at a glance, one tap from its
  // options. A non-default chip is highlighted so an active filter cannot go
  // unnoticed — a filtered list that looks complete is how records get
  // "lost".
  const chips: { kind: SheetKind; label: string; value: string; active: boolean }[] = [
    {
      kind: 'fund',
      label: 'Fondo',
      value: view.fund === 'ALL' ? 'todos' : FUND_FILTER_LABEL[view.fund],
      active: view.fund !== 'ALL',
    },
    {
      kind: 'type',
      label: 'Tipo',
      value: view.type === '' ? 'todos' : view.type,
      active: view.type !== '',
    },
    {
      kind: 'status',
      label: 'Estado',
      value: view.status === 'ALL' ? 'todos' : STATUS_FILTER_LABEL[view.status],
      active: view.status !== 'ALL',
    },
    {
      kind: 'order',
      label: 'Orden',
      value: view.order === 'RECENT' ? 'recientes' : ORDER_LABEL[view.order],
      active: view.order !== 'RECENT',
    },
  ]

  const noCriteria = search.trim() === '' && hasNoFilters(view)

  return (
    <Layout
      title="Obras"
      // RF-1104: the create button only for whoever can edit. In the fixed
      // header it stays available with the list scrolled — with hundreds of
      // artworks, "capture the next one" must not require scrolling back up.
      action={
        canEdit ? (
          <Link to="/capture" className="btn-primary min-h-[2.5rem] px-3 text-sm">
            <PlusIcon className="h-4 w-4" />
            Nueva
          </Link>
        ) : undefined
      }
    >
      <div className="mb-3">
        <input
          className="field"
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por código o título"
          aria-label="Buscar obras"
        />
      </div>

      <div className="mb-4 flex gap-1.5 overflow-x-auto pb-1">
        {chips.map((c) => (
          <button
            key={c.kind}
            type="button"
            aria-haspopup="dialog"
            onClick={() => setSheet(c.kind)}
            className={`min-h-touch shrink-0 whitespace-nowrap rounded-full border px-3 text-sm transition ${
              c.active
                ? 'border-stone-800 bg-stone-800 text-white'
                : 'border-stone-300 bg-white text-stone-700'
            }`}
          >
            <span className={c.active ? 'text-stone-300' : 'text-stone-500'}>{c.label}:</span>{' '}
            {c.value}
          </button>
        ))}
      </div>

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
                  onClick={() => updateView({ fund: 'ALL', type: '', status: 'ALL' })}
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
                      twelve-character text with a thumb is not reasonable. */}
                  <Link
                    to={`/artwork/${artwork.catalog_id}`}
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

      <BottomSheet open={sheet === 'fund'} onClose={() => setSheet(null)} title="Fondo">
        <RadioList
          options={FUND_OPTIONS}
          value={view.fund}
          onChange={(fund) => updateView({ fund })}
        />
      </BottomSheet>

      <BottomSheet open={sheet === 'type'} onClose={() => setSheet(null)} title="Tipo de obra">
        {/* The vocabulary itself (RF-213): the same list the forms offer. */}
        <RadioList
          options={typeOptions}
          value={view.type}
          onChange={(type) => updateView({ type })}
        />
      </BottomSheet>

      <BottomSheet
        open={sheet === 'status'}
        onClose={() => setSheet(null)}
        title="Estado del proceso"
      >
        <RadioList
          options={STATUS_OPTIONS}
          value={view.status}
          onChange={(status) => updateView({ status })}
        />
      </BottomSheet>

      <BottomSheet open={sheet === 'order'} onClose={() => setSheet(null)} title="Ordenar por">
        <RadioList
          options={ORDER_OPTIONS}
          value={view.order}
          onChange={(order) => updateView({ order })}
        />
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
      className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg border border-dashed border-stone-300 bg-stone-50 p-1 text-center text-[10px] leading-tight text-stone-400"
      aria-hidden={photographed}
    >
      {photographed ? '' : 'Sin foto'}
    </div>
  )
}
