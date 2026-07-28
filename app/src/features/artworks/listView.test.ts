import { describe, expect, it } from 'vitest'
import {
  DEFAULT_VIEW,
  compareByTitle,
  hasNoFilters,
  isDefaultView,
  normalizeStoredView,
  parseView,
  queryPlan,
  serializeView,
  type ListView,
} from './listView'

describe('URL ↔ view (RF-608: the list view survives in the URL)', () => {
  it('no parameters means the default view', () => {
    expect(parseView(new URLSearchParams())).toEqual(DEFAULT_VIEW)
  })

  it('round-trips every non-default field', () => {
    const view: ListView = {
      fund: 'RUIZ_CAMPINS',
      type: 'Dibujo',
      status: 'PHASE2_IN_PROGRESS',
      order: 'TITLE',
    }
    expect(parseView(serializeView(view))).toEqual(view)
  })

  it('serializes nothing for the default view: a clean URL', () => {
    expect(serializeView(DEFAULT_VIEW).toString()).toBe('')
  })

  it('ignores unknown values field by field, like a stale bookmark', () => {
    const params = new URLSearchParams(
      'fund=PICASSO&type=Dibujo&status=whatever&order=title',
    )
    expect(parseView(params)).toEqual({
      fund: 'ALL',
      type: 'Dibujo',
      status: 'ALL',
      order: 'TITLE',
    })
  })
})

describe('remembered view (applied when entering with no parameters)', () => {
  it('normalizes a foreign shape to the default, field by field', () => {
    expect(normalizeStoredView(null)).toEqual(DEFAULT_VIEW)
    expect(normalizeStoredView('garbage')).toEqual(DEFAULT_VIEW)
    expect(normalizeStoredView({ fund: 'ROTILI', status: 12, order: 'CATALOG_ID' })).toEqual({
      fund: 'ROTILI',
      type: '',
      status: 'ALL',
      order: 'CATALOG_ID',
    })
  })
})

describe('queryPlan (RF-602: the filters run in the query, not in the client)', () => {
  it('the default view filters nothing and orders by recency', () => {
    expect(queryPlan(DEFAULT_VIEW)).toEqual({
      filters: [],
      orders: [{ column: 'updated_at', ascending: false }],
      sortInClient: false,
    })
  })

  it('fund and type become equality filters', () => {
    const plan = queryPlan({ ...DEFAULT_VIEW, fund: 'TEST', type: 'Pintura' })
    expect(plan.filters).toEqual([
      { column: 'artist', value: 'TEST' },
      { column: 'artwork_type', value: 'Pintura' },
    ])
  })

  it('each process status maps to its flags', () => {
    expect(queryPlan({ ...DEFAULT_VIEW, status: 'PHASE1_IN_PROGRESS' }).filters).toEqual([
      { column: 'inventory_phase_completed', value: false },
    ])
    expect(queryPlan({ ...DEFAULT_VIEW, status: 'PHASE1_DONE' }).filters).toEqual([
      { column: 'inventory_phase_completed', value: true },
    ])
    // Phase 2 in progress: phase 1 done AND phase 2 pending — a record still
    // in phase 1 has not entered phase 2.
    expect(queryPlan({ ...DEFAULT_VIEW, status: 'PHASE2_IN_PROGRESS' }).filters).toEqual([
      { column: 'inventory_phase_completed', value: true },
      { column: 'documentation_phase_completed', value: false },
    ])
    expect(queryPlan({ ...DEFAULT_VIEW, status: 'RECORD_COMPLETE' }).filters).toEqual([
      { column: 'catalog_record_complete', value: true },
    ])
    expect(queryPlan({ ...DEFAULT_VIEW, status: 'UNPHOTOGRAPHED' }).filters).toEqual([
      { column: 'photographed', value: false },
    ])
  })

  it('two filters combine: both conditions travel in the same query (RF-602)', () => {
    const plan = queryPlan({ ...DEFAULT_VIEW, fund: 'ROTILI', status: 'UNPHOTOGRAPHED' })
    expect(plan.filters).toHaveLength(2)
  })

  it('chronological order puts the undated last, like the record view', () => {
    expect(queryPlan({ ...DEFAULT_VIEW, order: 'CHRONOLOGICAL' }).orders).toEqual([
      { column: 'start_year', ascending: true, nullsFirst: false },
      { column: 'catalog_id', ascending: true },
    ])
  })

  it('title order defers to the client', () => {
    expect(queryPlan({ ...DEFAULT_VIEW, order: 'TITLE' }).sortInClient).toBe(true)
  })
})

describe('compareByTitle (RF-209: empty shows as [Sin título] and sorts last)', () => {
  const row = (catalog_id: string, title: string) => ({ catalog_id, title })

  it('sorts alphabetically with es-ES collation, accents in place', () => {
    const rows = [row('AR-0003', 'Buey'), row('AR-0001', 'Árbol'), row('AR-0002', 'ánfora')]
    expect(rows.sort(compareByTitle).map((r) => r.title)).toEqual(['ánfora', 'Árbol', 'Buey'])
  })

  it('the untitled go last: the placeholder is not a title', () => {
    const rows = [row('AR-0002', ''), row('AR-0001', 'Zambra'), row('AR-0003', '  ')]
    expect(rows.sort(compareByTitle).map((r) => r.catalog_id)).toEqual([
      'AR-0001',
      'AR-0002',
      'AR-0003',
    ])
  })

  it('ties break by catalog code, so the order is stable', () => {
    const rows = [row('AR-0007', 'Sin título'), row('AR-0002', 'Sin título')]
    expect(rows.sort(compareByTitle).map((r) => r.catalog_id)).toEqual(['AR-0002', 'AR-0007'])
  })
})

describe('view predicates', () => {
  it('an order is presentation, not a filter', () => {
    expect(hasNoFilters({ ...DEFAULT_VIEW, order: 'TITLE' })).toBe(true)
    expect(isDefaultView({ ...DEFAULT_VIEW, order: 'TITLE' })).toBe(false)
    expect(hasNoFilters({ ...DEFAULT_VIEW, type: 'Pintura' })).toBe(false)
  })
})
