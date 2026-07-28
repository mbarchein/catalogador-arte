import { ARTIST_FUNDS, type ArtistFund, type Artwork } from '../../lib/types'
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
  status: StatusFilter
  order: ListOrder
}

/** Recent first by default: covers both creation and modification. */
export const DEFAULT_VIEW: ListView = { funds: [], types: [], status: 'ALL', order: 'RECENT' }

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
    // explicit no-results message).
    types: [...new Set(params.getAll('type'))].filter((t) => t !== ''),
    status: keyOf(STATUS_PARAM, params.get('status')) ?? 'ALL',
    order: keyOf(ORDER_PARAM, params.get('order')) ?? 'RECENT',
  }
}

/** Only the non-default fields travel: no parameters means the default view. */
export function serializeView(view: ListView): URLSearchParams {
  const params = new URLSearchParams()
  for (const f of view.funds) params.append('fund', f)
  for (const t of view.types) params.append('type', t)
  if (view.status !== 'ALL') params.set('status', STATUS_PARAM[view.status])
  if (view.order !== 'RECENT') params.set('order', ORDER_PARAM[view.order])
  return params
}

/** True when no filter is active (the order is presentation, not a filter). */
export function hasNoFilters(view: ListView): boolean {
  return view.funds.length === 0 && view.types.length === 0 && view.status === 'ALL'
}

export function isDefaultView(view: ListView): boolean {
  return hasNoFilters(view) && view.order === 'RECENT'
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

type ListedArtwork = Pick<
  Artwork,
  | 'catalog_id'
  | 'title'
  | 'artist'
  | 'artwork_type'
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
  const isType = (x: unknown): x is string => typeof x === 'string' && x !== ''
  const types = Array.isArray(v.types) ? v.types.filter(isType) : isType(v.type) ? [v.type] : []

  return {
    funds,
    types,
    status: STATUS_FILTERS.includes(v.status as StatusFilter) ? (v.status as StatusFilter) : 'ALL',
    order: LIST_ORDERS.includes(v.order as ListOrder) ? (v.order as ListOrder) : 'RECENT',
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
    storage?.setItem(KEY, JSON.stringify(view))
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
