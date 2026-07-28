import { ARTIST_FUNDS, type ArtistFund, type Artwork } from '../../lib/types'

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

export type FundFilter = 'ALL' | ArtistFund

export type StatusFilter =
  | 'ALL'
  | 'PHASE1_IN_PROGRESS'
  | 'PHASE1_DONE'
  | 'PHASE2_IN_PROGRESS'
  | 'RECORD_COMPLETE'
  | 'UNPHOTOGRAPHED'

export type ListOrder = 'RECENT' | 'CATALOG_ID' | 'CHRONOLOGICAL' | 'TITLE'

export interface ListView {
  fund: FundFilter
  /** '' filters nothing; otherwise an `artwork_types` entry, matched exactly. */
  type: string
  status: StatusFilter
  order: ListOrder
}

/** Recent first by default: covers both creation and modification. */
export const DEFAULT_VIEW: ListView = { fund: 'ALL', type: '', status: 'ALL', order: 'RECENT' }

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

export const FUND_FILTER_LABEL: Record<FundFilter, string> = {
  ALL: 'Todos',
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
  const fund = params.get('fund')
  return {
    fund: ARTIST_FUNDS.includes(fund as ArtistFund) ? (fund as ArtistFund) : 'ALL',
    // Any string is a plausible vocabulary entry; whether it exists is the
    // query's business (an unknown one simply finds nothing, with the
    // explicit no-results message).
    type: params.get('type') ?? '',
    status: keyOf(STATUS_PARAM, params.get('status')) ?? 'ALL',
    order: keyOf(ORDER_PARAM, params.get('order')) ?? 'RECENT',
  }
}

/** Only the non-default fields travel: no parameters means the default view. */
export function serializeView(view: ListView): URLSearchParams {
  const params = new URLSearchParams()
  if (view.fund !== 'ALL') params.set('fund', view.fund)
  if (view.type !== '') params.set('type', view.type)
  if (view.status !== 'ALL') params.set('status', STATUS_PARAM[view.status])
  if (view.order !== 'RECENT') params.set('order', ORDER_PARAM[view.order])
  return params
}

/** True when no filter is active (the order is presentation, not a filter). */
export function hasNoFilters(view: ListView): boolean {
  return view.fund === 'ALL' && view.type === '' && view.status === 'ALL'
}

export function isDefaultView(view: ListView): boolean {
  return hasNoFilters(view) && view.order === 'RECENT'
}

// ── From view to query ───────────────────────────────────────

export interface QueryPlan {
  /** Equality filters, applied in the Supabase query — not in the client. */
  filters: { column: string; value: string | boolean }[]
  /** Order clauses for the query, in priority order. */
  orders: { column: string; ascending: boolean; nullsFirst?: boolean }[]
  /** TITLE sorts in the client afterwards; see compareByTitle for why. */
  sortInClient: boolean
}

/**
 * "Fase 2 en curso" means phase 1 done and phase 2 not yet: a record still in
 * phase 1 has not entered phase 2. The header badges show both phases at
 * once, so no combination is hidden — this filter answers "what is being
 * documented right now".
 */
export function queryPlan(view: ListView): QueryPlan {
  const filters: QueryPlan['filters'] = []

  if (view.fund !== 'ALL') filters.push({ column: 'artist', value: view.fund })
  if (view.type !== '') filters.push({ column: 'artwork_type', value: view.type })

  switch (view.status) {
    case 'ALL':
      break
    case 'PHASE1_IN_PROGRESS':
      filters.push({ column: 'inventory_phase_completed', value: false })
      break
    case 'PHASE1_DONE':
      filters.push({ column: 'inventory_phase_completed', value: true })
      break
    case 'PHASE2_IN_PROGRESS':
      filters.push({ column: 'inventory_phase_completed', value: true })
      filters.push({ column: 'documentation_phase_completed', value: false })
      break
    case 'RECORD_COMPLETE':
      filters.push({ column: 'catalog_record_complete', value: true })
      break
    case 'UNPHOTOGRAPHED':
      filters.push({ column: 'photographed', value: false })
      break
  }

  switch (view.order) {
    case 'RECENT':
      // updated_at moves on creation and on every edit: one criterion covers
      // "what did we touch last", which is what one comes back to.
      return { filters, orders: [{ column: 'updated_at', ascending: false }], sortInClient: false }
    case 'CATALOG_ID':
      return { filters, orders: [{ column: 'catalog_id', ascending: true }], sortInClient: false }
    case 'CHRONOLOGICAL':
      // By the structured year; undated artworks go last (they are pending
      // research, not "older than everything").
      return {
        filters,
        orders: [
          { column: 'start_year', ascending: true, nullsFirst: false },
          { column: 'catalog_id', ascending: true },
        ],
        sortInClient: false,
      }
    case 'TITLE':
      // The query only provides a stable base order; the alphabetical sort
      // happens in the client (the list is already fetched whole), with
      // es-ES collation — the database's would misplace accented titles —
      // and with the untitled at the end: RF-209 shows them as [Sin título],
      // which is a placeholder, not a title to alphabetize under "S".
      return { filters, orders: [{ column: 'catalog_id', ascending: true }], sortInClient: true }
  }
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
  return {
    fund: ARTIST_FUNDS.includes(v.fund as ArtistFund) ? (v.fund as ArtistFund) : 'ALL',
    type: typeof v.type === 'string' ? v.type : '',
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
