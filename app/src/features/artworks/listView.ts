import { canonicalPlaces, locationLevels, locationWithin } from '../../lib/location'
import { ARTIST_FUNDS, type ArtistFund, type Artwork, type SeriesEntry } from '../../lib/types'
import { normalizeForSearch } from '../../lib/vocabulary'

/**
 * Filters and ordering of the artworks list (RF-602, RF-608).
 *
 * Pure logic, apart from the two localStorage helpers at the end: mapping the
 * URL parameters to a view, the view to the Supabase query, and validating
 * what was remembered. The list page stays thin and this part gets tests.
 *
 * The view lives in the URL (shareable, survives reloads, and going back to
 * the list restores it — RF-608) and the last combination the user chose is
 * also remembered per device, applied when entering the list with no
 * parameters.
 */

export type StatusFilter =
  | 'ALL'
  | 'PHASE1_IN_PROGRESS'
  | 'PHASE1_DONE'
  | 'PHASE2_IN_PROGRESS'
  | 'RECORD_COMPLETE'
  | 'UNPHOTOGRAPHED'

export type ListOrder = 'RECENT' | 'CATALOG_ID' | 'CHRONOLOGICAL' | 'TITLE'

export interface ListView {
  /** Empty selects every fund; otherwise the artwork must be of one of them. */
  funds: ArtistFund[]
  /** Empty selects every type; entries are `artwork_types` names, matched exactly. */
  types: string[]
  /**
   * Empty selects every series. Entries are series NAMES, matched exactly.
   *
   * The vocabulary is per fund — the same name may exist in two funds as two
   * different series — but the FILTER is by name, so selecting «Retratos del
   * taller» brings the artworks of every fund that has a series so called. It
   * is the honest reading of a filter whose entries are names, and the fund
   * filter sits right next to it to disambiguate. The chooser labels each
   * option with its fund, so what will be mixed is visible before choosing.
   *
   * `NO_SERIES` is a legitimate entry: «no series yet» is a question one asks
   * constantly while cataloging — every artwork is born without one — and
   * without it those pieces were the only ones this filter could not reach.
   */
  series: string[]
  /**
   * Empty selects every location. Entries are places, matched HIERARCHICALLY:
   * «edificio a» also brings everything inside it (see locationWithin).
   */
  locations: string[]
  status: StatusFilter
  order: ListOrder
  /**
   * Free text over identifier and title (RF-602). It is part of the view
   * because it is part of what the list is showing: RF-610 puts it in the URL
   * so a searched list is shareable and comes back with the back button, and
   * RF-311 makes the record's previous/next walk that same searched sequence.
   *
   * It is NOT part of the remembered view: see saveStoredView.
   */
  search: string
}

/** Recent first by default: covers both creation and modification. */
export const DEFAULT_VIEW: ListView = {
  funds: [],
  types: [],
  series: [],
  locations: [],
  status: 'ALL',
  order: 'RECENT',
  search: '',
}

/**
 * Value of the «Sin serie» entry of the series filter: the empty string, which
 * is exactly what an artwork with no series has stored. So the predicate needs
 * no special case — the absence of a series is compared like any name — and no
 * real series can ever collide with it, because the vocabulary refuses an empty
 * name. In the URL it travels as `series=`.
 */
export const NO_SERIES = ''

const STATUS_FILTERS: readonly StatusFilter[] = [
  'ALL',
  'PHASE1_IN_PROGRESS',
  'PHASE1_DONE',
  'PHASE2_IN_PROGRESS',
  'RECORD_COMPLETE',
  'UNPHOTOGRAPHED',
]

const LIST_ORDERS: readonly ListOrder[] = ['RECENT', 'CATALOG_ID', 'CHRONOLOGICAL', 'TITLE']

// ── Interface labels ─────────────────────────────────────────

export const FUND_LABEL: Record<ArtistFund, string> = {
  ROTILI: 'Rotili',
  RUIZ_CAMPINS: 'Ruiz Campins',
  TEST: 'Fondo de pruebas',
}

export const STATUS_FILTER_LABEL: Record<StatusFilter, string> = {
  ALL: 'Todos',
  PHASE1_IN_PROGRESS: 'Fase 1 en curso',
  PHASE1_DONE: 'Fase 1 completa',
  PHASE2_IN_PROGRESS: 'Fase 2 en curso',
  RECORD_COMPLETE: 'Ficha completa',
  UNPHOTOGRAPHED: 'Sin fotografías',
}

export const ORDER_LABEL: Record<ListOrder, string> = {
  RECENT: 'Recientes primero',
  CATALOG_ID: 'Código de catalogación',
  CHRONOLOGICAL: 'Cronológico de ejecución',
  TITLE: 'Título A–Z',
}

// ── URL parameters ───────────────────────────────────────────
// Short stable values; the absence of a parameter means its default. An
// unknown value is ignored field by field (like batch.ts with a foreign
// shape): a stale bookmark must never break the list.

const STATUS_PARAM: Record<Exclude<StatusFilter, 'ALL'>, string> = {
  PHASE1_IN_PROGRESS: 'phase1-in-progress',
  PHASE1_DONE: 'phase1-done',
  PHASE2_IN_PROGRESS: 'phase2-in-progress',
  RECORD_COMPLETE: 'complete',
  UNPHOTOGRAPHED: 'unphotographed',
}

const ORDER_PARAM: Record<Exclude<ListOrder, 'RECENT'>, string> = {
  CATALOG_ID: 'catalog-id',
  CHRONOLOGICAL: 'chronological',
  TITLE: 'title',
}

function keyOf<K extends string>(map: Record<K, string>, param: string | null): K | undefined {
  if (param === null) return undefined
  return (Object.keys(map) as K[]).find((k) => map[k] === param)
}

export function parseView(params: URLSearchParams): ListView {
  return {
    // Fund and type are multiselect and travel as REPEATED parameters
    // (?fund=A&fund=B): nothing to escape inside a value, and a legacy
    // single-value URL parses identically.
    funds: [...new Set(params.getAll('fund'))].filter((f): f is ArtistFund =>
      ARTIST_FUNDS.includes(f as ArtistFund),
    ),
    // Any string is a plausible vocabulary entry; whether it exists is the
    // filter's business (an unknown one simply finds nothing, with the
    // explicit no-results message). Same for series and locations.
    types: [...new Set(params.getAll('type'))].filter((t) => t !== ''),
    // Series keeps the empty value, unlike the others: `series=` is the
    // «Sin serie» entry (NO_SERIES), not a leftover.
    series: [...new Set(params.getAll('series'))],
    // Locations are canonicalized on the way in, so a place typed by hand in
    // the URL is the same string as the option offered in the chooser — or the
    // checkbox of what is filtering could not be unmarked.
    locations: canonicalPlaces(params.getAll('location')),
    status: keyOf(STATUS_PARAM, params.get('status')) ?? 'ALL',
    order: keyOf(ORDER_PARAM, params.get('order')) ?? 'RECENT',
    // Kept as typed, not normalized: it is what the search box shows. The
    // accent- and case-insensitive comparison happens in matchesSearch.
    search: params.get('q') ?? '',
  }
}

/** Only the non-default fields travel: no parameters means the default view. */
export function serializeView(view: ListView): URLSearchParams {
  const params = new URLSearchParams()
  for (const f of view.funds) params.append('fund', f)
  for (const t of view.types) params.append('type', t)
  for (const s of view.series) params.append('series', s)
  for (const l of view.locations) params.append('location', l)
  if (view.status !== 'ALL') params.set('status', STATUS_PARAM[view.status])
  if (view.order !== 'RECENT') params.set('order', ORDER_PARAM[view.order])
  // A search of only spaces finds everything, so it is not a search: leaving it
  // out keeps the URL clean and the round trip exact.
  if (view.search.trim() !== '') params.set('q', view.search)
  return params
}

/** The filters cleared, keeping the order: what "Quitar todo" resets to. */
export const NO_FILTERS: Pick<ListView, 'funds' | 'types' | 'series' | 'locations' | 'status'> = {
  funds: [],
  types: [],
  series: [],
  locations: [],
  status: 'ALL',
}

/**
 * True when no filter is active (the order is presentation, not a filter).
 *
 * The search term is not counted either, on purpose: the search box is on
 * screen showing its own state, and "Quitar los filtros" does not clear it —
 * counting it here would offer a button that leaves the list still reduced.
 */
export function hasNoFilters(view: ListView): boolean {
  return (
    view.funds.length === 0 &&
    view.types.length === 0 &&
    view.series.length === 0 &&
    view.locations.length === 0 &&
    view.status === 'ALL'
  )
}

/**
 * How many parts of the view differ from the default. The funnel button shows
 * it with the sheet closed: a filtered list that looks complete is how records
 * get "lost".
 */
export function activeFilterCount(view: ListView): number {
  return [
    view.funds.length > 0,
    view.types.length > 0,
    view.series.length > 0,
    view.locations.length > 0,
    view.status !== 'ALL',
    view.order !== 'RECENT',
  ].filter(Boolean).length
}

export function isDefaultView(view: ListView): boolean {
  return hasNoFilters(view) && view.order === 'RECENT' && view.search.trim() === ''
}

// ── Options of the two vocabulary filters ────────────────────

export interface FilterOption {
  value: string
  text: string
  /** Second line of the row, for an option that needs explaining. */
  hint?: string
}

/**
 * The options of the series filter, from the vocabulary.
 *
 * Every option carries its fund («Rotili · Paisajes de la sierra»): the
 * vocabulary is per fund, and an unlabeled name would hide which artist it
 * belongs to. When the fund filter has a selection, only the series of those
 * funds are offered — asking for Rotili and then being offered Ruiz Campins
 * series would be offering options that cannot match.
 *
 * Two funds with the same series name collapse into ONE option, labeled with
 * both, because the filter matches by name and would select them together
 * anyway. Saying so in the label beats a duplicated row that behaves as one.
 *
 * «Sin serie» heads the list, always offered and regardless of the funds
 * marked: an artwork with no series has none in any fund, and asking for what is
 * still unassigned is part of the daily work — it is how the pieces waiting to
 * be grouped get found. It is not sorted among the names because it is not one.
 *
 * `selected` values the vocabulary does not know are kept as options: the
 * checkboxes must reflect what is filtering, even when it comes from a stale
 * link.
 */
export function seriesFilterOptions(
  entries: readonly SeriesEntry[],
  funds: readonly ArtistFund[],
  selected: readonly string[] = [],
): FilterOption[] {
  const offered = funds.length === 0 ? entries : entries.filter((e) => funds.includes(e.artist))
  const byName = new Map<string, ArtistFund[]>()
  for (const entry of offered) {
    const already = byName.get(entry.name)
    if (already) {
      if (!already.includes(entry.artist)) already.push(entry.artist)
    } else {
      byName.set(entry.name, [entry.artist])
    }
  }
  const options = [...byName.entries()]
    .sort((a, b) => a[0].localeCompare(b[0], 'es', { sensitivity: 'base' }))
    .map(([name, artists]) => ({
      value: name,
      text: `${artists.map((a) => FUND_LABEL[a]).join(', ')} · ${name}`,
    }))
  // NO_SERIES is offered above, so it is never an "unknown" name down here.
  const unknown = selected
    .filter((s) => s !== NO_SERIES && !byName.has(s))
    .map((s) => ({ value: s, text: s }))
  return [
    { value: NO_SERIES, text: 'Sin serie', hint: 'Obras todavía sin serie asignada' },
    ...options,
    ...unknown,
  ]
}

/**
 * The options of the location filter: every place worth asking for, which is
 * each location in use PLUS all of its ancestors. Without the ancestors,
 * «edificio a» would never be offered when no artwork sits at the building
 * level, and the hierarchical match would have nothing to match with.
 *
 * Sorted as text, which groups each branch under its parent because a parent
 * is a prefix of its children.
 */
export function locationFilterOptions(
  locations: readonly string[],
  selected: readonly string[] = [],
): FilterOption[] {
  const places = new Set<string>()
  for (const location of locations) {
    const levels = locationLevels(location)
    for (let depth = 1; depth <= levels.length; depth += 1) {
      places.add(levels.slice(0, depth).join(', '))
    }
  }
  for (const place of selected) {
    const levels = locationLevels(place)
    if (levels.length > 0) places.add(levels.join(', '))
  }
  return [...places]
    .sort((a, b) => a.localeCompare(b, 'es'))
    .map((place) => ({ value: place, text: place }))
}

// ── From view to query ───────────────────────────────────────

// ── Filtering and ordering, over the local mirror ────────────
// The list works over a local copy of the catalog (see useArtworks): these
// predicates ARE the filter semantics, and their tests hold them.
//
// "Fase 2 en curso" means phase 1 done and phase 2 not yet: a record still in
// phase 1 has not entered phase 2. The header badges show both phases at
// once, so no combination is hidden — that filter answers "what is being
// documented right now".

/**
 * What the list and the record's previous/next need of an artwork. Exported so
 * sequence.ts builds the sequence over exactly the same fields these
 * predicates read (RF-311): a second, wider type there would let the two drift.
 */
export type ListedArtwork = Pick<
  Artwork,
  | 'catalog_id'
  | 'title'
  | 'artist'
  | 'artwork_type'
  | 'series'
  | 'physical_location'
  | 'inventory_phase_completed'
  | 'documentation_phase_completed'
  | 'catalog_record_complete'
  | 'photographed'
  | 'start_year'
  | 'updated_at'
>

export function matchesView(a: ListedArtwork, view: ListView): boolean {
  if (view.funds.length > 0 && !view.funds.includes(a.artist)) return false
  if (view.types.length > 0 && !view.types.includes(a.artwork_type)) return false
  // By name, across funds: see the note on ListView.series.
  if (view.series.length > 0 && !view.series.includes(a.series)) return false
  // Hierarchical: a selected place also answers for everything inside it.
  if (
    view.locations.length > 0 &&
    !view.locations.some((place) => locationWithin(a.physical_location, place))
  ) {
    return false
  }
  switch (view.status) {
    case 'ALL':
      return true
    case 'PHASE1_IN_PROGRESS':
      return !a.inventory_phase_completed
    case 'PHASE1_DONE':
      return a.inventory_phase_completed
    case 'PHASE2_IN_PROGRESS':
      return a.inventory_phase_completed && !a.documentation_phase_completed
    case 'RECORD_COMPLETE':
      return a.catalog_record_complete
    case 'UNPHOTOGRAPHED':
      return !a.photographed
  }
}

/**
 * Free-text search over identifier and title (RF-602). Accent- and
 * case-insensitive — an improvement over the ilike the server ran, which
 * ignored case but not accents: "oleo" must find "Óleo".
 */
export function matchesSearch(a: Pick<Artwork, 'catalog_id' | 'title'>, term: string): boolean {
  const q = normalizeForSearch(term)
  if (q === '') return true
  return (
    normalizeForSearch(a.catalog_id).includes(q) || normalizeForSearch(a.title).includes(q)
  )
}

/** The list's orders, over the local mirror. */
export function sortArtworks<T extends ListedArtwork>(rows: readonly T[], order: ListOrder): T[] {
  const sorted = [...rows]
  switch (order) {
    case 'RECENT':
      // updated_at moves on creation and on every edit: one criterion covers
      // "what did we touch last", which is what one comes back to. ISO
      // timestamps compare correctly as strings.
      sorted.sort((a, b) =>
        a.updated_at === b.updated_at
          ? a.catalog_id.localeCompare(b.catalog_id)
          : a.updated_at < b.updated_at
            ? 1
            : -1,
      )
      break
    case 'CATALOG_ID':
      sorted.sort((a, b) => a.catalog_id.localeCompare(b.catalog_id))
      break
    case 'CHRONOLOGICAL':
      // Undated artworks go last: they are pending research, not "older than
      // everything".
      sorted.sort((a, b) => {
        if (a.start_year == null !== (b.start_year == null)) return a.start_year == null ? 1 : -1
        if (a.start_year != null && b.start_year != null && a.start_year !== b.start_year) {
          return a.start_year - b.start_year
        }
        return a.catalog_id.localeCompare(b.catalog_id)
      })
      break
    case 'TITLE':
      sorted.sort(compareByTitle)
      break
  }
  return sorted
}

/** es-ES alphabetical order with the untitled last; ties break by code. */
export function compareByTitle(
  a: Pick<Artwork, 'title' | 'catalog_id'>,
  b: Pick<Artwork, 'title' | 'catalog_id'>,
): number {
  const aBlank = a.title.trim() === ''
  const bBlank = b.title.trim() === ''
  if (aBlank !== bBlank) return aBlank ? 1 : -1
  const byTitle = a.title.localeCompare(b.title, 'es', { sensitivity: 'base' })
  return byTitle !== 0 ? byTitle : a.catalog_id.localeCompare(b.catalog_id)
}

// ── Remembered view ──────────────────────────────────────────
// Same conventions as batch.ts: the 'catalogador.' namespace, and a stored
// value with an unexpected shape normalizes instead of breaking the page.

const KEY = 'catalogador.artworks-view'

/**
 * Checks field by field what comes from storage. A value saved by a previous
 * version of the application must never take the list down; each unknown
 * field simply falls back to its default.
 */
export function normalizeStoredView(value: unknown): ListView {
  if (typeof value !== 'object' || value === null) return DEFAULT_VIEW
  const v = value as Record<string, unknown>

  const isFund = (x: unknown): x is ArtistFund => ARTIST_FUNDS.includes(x as ArtistFund)
  // A view stored before fund and type became multiselect carried a single
  // value ('fund'/'type'): it still counts, as a one-element selection.
  const funds = Array.isArray(v.funds) ? v.funds.filter(isFund) : isFund(v.fund) ? [v.fund] : []
  const isName = (x: unknown): x is string => typeof x === 'string' && x !== ''
  const types = Array.isArray(v.types) ? v.types.filter(isName) : isName(v.type) ? [v.type] : []
  // A view stored before these two filters existed simply has neither: the
  // absent field falls back to "no selection", like any unknown one.
  //
  // Series accepts the empty string, unlike the rest: it is the «Sin serie»
  // entry (NO_SERIES), so here it is a selection, not garbage.
  const series = Array.isArray(v.series) ? v.series.filter((s) => typeof s === 'string') : []
  const locations = Array.isArray(v.locations) ? v.locations.filter(isName) : []

  return {
    funds,
    types,
    series,
    locations,
    status: STATUS_FILTERS.includes(v.status as StatusFilter) ? (v.status as StatusFilter) : 'ALL',
    order: LIST_ORDERS.includes(v.order as ListOrder) ? (v.order as ListOrder) : 'RECENT',
    // Never restored, whatever a previous version may have stored: RF-610. What
    // was searched belongs to that visit.
    search: '',
  }
}

export function readStoredView(storage: Storage | undefined = getStorage()): ListView {
  if (!storage) return DEFAULT_VIEW
  try {
    const raw = storage.getItem(KEY)
    return raw ? normalizeStoredView(JSON.parse(raw)) : DEFAULT_VIEW
  } catch {
    return DEFAULT_VIEW
  }
}

export function saveStoredView(view: ListView, storage: Storage | undefined = getStorage()): void {
  try {
    // Field by field, and without the search term (RF-610): what gets
    // remembered is how this device likes to look at the catalog, not what
    // somebody was looking for last Tuesday.
    const remembered: Omit<ListView, 'search'> = {
      funds: view.funds,
      types: view.types,
      series: view.series,
      locations: view.locations,
      status: view.status,
      order: view.order,
    }
    storage?.setItem(KEY, JSON.stringify(remembered))
  } catch {
    // Private browsing or exhausted quota: filtering works, memory does not.
  }
}

function getStorage(): Storage | undefined {
  try {
    return window.localStorage
  } catch {
    return undefined
  }
}
