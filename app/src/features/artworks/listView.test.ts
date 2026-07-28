import { describe, expect, it } from 'vitest'
import {
  DEFAULT_VIEW,
  compareByTitle,
  hasNoFilters,
  isDefaultView,
  matchesSearch,
  matchesView,
  normalizeStoredView,
  parseView,
  serializeView,
  sortArtworks,
  type ListView,
} from './listView'

describe('URL ↔ view (RF-608: the list view survives in the URL)', () => {
  it('no parameters means the default view', () => {
    expect(parseView(new URLSearchParams())).toEqual(DEFAULT_VIEW)
  })

  it('round-trips every non-default field, multiselects included', () => {
    const view: ListView = {
      funds: ['RUIZ_CAMPINS', 'TEST'],
      types: ['Dibujo', 'Técnica mixta'],
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
      'fund=PICASSO&fund=ROTILI&type=Dibujo&status=whatever&order=title',
    )
    expect(parseView(params)).toEqual({
      funds: ['ROTILI'],
      types: ['Dibujo'],
      status: 'ALL',
      order: 'TITLE',
    })
  })

  it('deduplicates repeated parameters', () => {
    const params = new URLSearchParams('type=Dibujo&type=Dibujo')
    expect(parseView(params).types).toEqual(['Dibujo'])
  })
})

describe('remembered view (applied when entering with no parameters)', () => {
  it('normalizes a foreign shape to the default, field by field', () => {
    expect(normalizeStoredView(null)).toEqual(DEFAULT_VIEW)
    expect(normalizeStoredView('garbage')).toEqual(DEFAULT_VIEW)
    expect(normalizeStoredView({ funds: ['ROTILI', 'GOYA'], status: 12, order: 'CATALOG_ID' })).toEqual({
      funds: ['ROTILI'],
      types: [],
      status: 'ALL',
      order: 'CATALOG_ID',
    })
  })

  it('accepts the single-value shape stored before the multiselect', () => {
    expect(normalizeStoredView({ fund: 'ROTILI', type: 'Pintura' })).toEqual({
      funds: ['ROTILI'],
      types: ['Pintura'],
      status: 'ALL',
      order: 'RECENT',
    })
  })
})

/** Minimal listed artwork; each test overrides only what it exercises. */
const stub = (over: Partial<Parameters<typeof matchesView>[0]> = {}) => ({
  catalog_id: 'AR-0001',
  title: '',
  artist: 'ROTILI' as const,
  artwork_type: '',
  inventory_phase_completed: false,
  documentation_phase_completed: false,
  catalog_record_complete: false,
  photographed: false,
  start_year: null,
  updated_at: '2026-07-28T10:00:00+00:00',
  ...over,
})

describe('matchesView (RF-602: the filters run over the local mirror)', () => {
  it('the default view matches everything', () => {
    expect(matchesView(stub(), DEFAULT_VIEW)).toBe(true)
  })

  it('fund and type filter by membership: any marked value matches', () => {
    const view: ListView = {
      ...DEFAULT_VIEW,
      funds: ['TEST', 'RUIZ_CAMPINS'],
      types: ['Pintura'],
    }
    expect(matchesView(stub({ artist: 'TEST', artwork_type: 'Pintura' }), view)).toBe(true)
    expect(matchesView(stub({ artist: 'RUIZ_CAMPINS', artwork_type: 'Pintura' }), view)).toBe(true)
    expect(matchesView(stub({ artist: 'ROTILI', artwork_type: 'Pintura' }), view)).toBe(false)
    expect(matchesView(stub({ artist: 'TEST', artwork_type: 'Dibujo' }), view)).toBe(false)
  })

  it('each process status answers by its flags', () => {
    expect(matchesView(stub(), { ...DEFAULT_VIEW, status: 'PHASE1_IN_PROGRESS' })).toBe(true)
    expect(
      matchesView(stub({ inventory_phase_completed: true }), {
        ...DEFAULT_VIEW,
        status: 'PHASE1_DONE',
      }),
    ).toBe(true)
    // Phase 2 in progress: phase 1 done AND phase 2 pending — a record still
    // in phase 1 has not entered phase 2.
    expect(matchesView(stub(), { ...DEFAULT_VIEW, status: 'PHASE2_IN_PROGRESS' })).toBe(false)
    expect(
      matchesView(stub({ inventory_phase_completed: true }), {
        ...DEFAULT_VIEW,
        status: 'PHASE2_IN_PROGRESS',
      }),
    ).toBe(true)
    expect(
      matchesView(stub({ catalog_record_complete: true }), {
        ...DEFAULT_VIEW,
        status: 'RECORD_COMPLETE',
      }),
    ).toBe(true)
    expect(matchesView(stub(), { ...DEFAULT_VIEW, status: 'UNPHOTOGRAPHED' })).toBe(true)
    expect(
      matchesView(stub({ photographed: true }), { ...DEFAULT_VIEW, status: 'UNPHOTOGRAPHED' }),
    ).toBe(false)
  })

  it('two filters combine: both conditions must hold (RF-602)', () => {
    const view: ListView = { ...DEFAULT_VIEW, funds: ['ROTILI'], status: 'UNPHOTOGRAPHED' }
    expect(matchesView(stub(), view)).toBe(true)
    expect(matchesView(stub({ photographed: true }), view)).toBe(false)
  })
})

describe('matchesSearch (RF-602: identifier and title, accent-insensitive)', () => {
  it('finds by code and by title, ignoring case and accents', () => {
    const a = stub({ catalog_id: 'AR-0042', title: 'Árbol seco' })
    expect(matchesSearch(a, 'ar-004')).toBe(true)
    expect(matchesSearch(a, 'arbol')).toBe(true)
    expect(matchesSearch(a, 'humedo')).toBe(false)
  })

  it('the empty search matches everything', () => {
    expect(matchesSearch(stub(), '  ')).toBe(true)
  })
})

describe('sortArtworks (the orders of the list, over the local mirror)', () => {
  it('recent first by updated_at', () => {
    const rows = [
      stub({ catalog_id: 'AR-0001', updated_at: '2026-07-27T10:00:00+00:00' }),
      stub({ catalog_id: 'AR-0002', updated_at: '2026-07-28T10:00:00+00:00' }),
    ]
    expect(sortArtworks(rows, 'RECENT').map((r) => r.catalog_id)).toEqual(['AR-0002', 'AR-0001'])
  })

  it('chronological puts the undated last, like the record view', () => {
    const rows = [
      stub({ catalog_id: 'AR-0001', start_year: null }),
      stub({ catalog_id: 'AR-0002', start_year: 1980 }),
      stub({ catalog_id: 'AR-0003', start_year: 1975 }),
    ]
    expect(sortArtworks(rows, 'CHRONOLOGICAL').map((r) => r.catalog_id)).toEqual([
      'AR-0003',
      'AR-0002',
      'AR-0001',
    ])
  })

  it('title order uses the es-ES comparison with the untitled last', () => {
    const rows = [
      stub({ catalog_id: 'AR-0001', title: '' }),
      stub({ catalog_id: 'AR-0002', title: 'Zambra' }),
      stub({ catalog_id: 'AR-0003', title: 'Ánfora' }),
    ]
    expect(sortArtworks(rows, 'TITLE').map((r) => r.catalog_id)).toEqual([
      'AR-0003',
      'AR-0002',
      'AR-0001',
    ])
  })

  it('does not mutate what it receives', () => {
    const rows = [stub({ catalog_id: 'AR-0002' }), stub({ catalog_id: 'AR-0001' })]
    sortArtworks(rows, 'CATALOG_ID')
    expect(rows[0]?.catalog_id).toBe('AR-0002')
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
    expect(hasNoFilters({ ...DEFAULT_VIEW, types: ['Pintura'] })).toBe(false)
  })
})
