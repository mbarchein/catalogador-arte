import { describe, expect, it } from 'vitest'
import {
  DEFAULT_VIEW,
  NO_FILTERS,
  NO_SERIES,
  activeFilterCount,
  compareByTitle,
  hasNoFilters,
  isDefaultView,
  locationFilterOptions,
  matchesSearch,
  matchesView,
  normalizeStoredView,
  parseView,
  readStoredView,
  saveStoredView,
  serializeView,
  seriesFilterOptions,
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
      series: ['Retratos del taller', 'Serie de ensayo A'],
      locations: ['edificio a', 'edificio b, habitacion 4'],
      status: 'PHASE2_IN_PROGRESS',
      order: 'TITLE',
      search: 'árbol seco',
    }
    expect(parseView(serializeView(view))).toEqual(view)
  })

  it('serializes nothing for the default view: a clean URL', () => {
    expect(serializeView(DEFAULT_VIEW).toString()).toBe('')
  })

  it('ignores unknown values field by field, like a stale bookmark', () => {
    const params = new URLSearchParams(
      'fund=PICASSO&fund=ROTILI&type=Dibujo&series=&location=edificio a&status=whatever&order=title',
    )
    expect(parseView(params)).toEqual({
      funds: ['ROTILI'],
      types: ['Dibujo'],
      // A series name the vocabulary does not know is NOT ignored: it is a
      // plausible entry, and an unknown one simply finds nothing. And the empty
      // value is not dropped either — `series=` is the «Sin serie» entry.
      series: [NO_SERIES],
      locations: ['edificio a'],
      status: 'ALL',
      order: 'TITLE',
      search: '',
    })
  })

  it('deduplicates repeated parameters, the new filters included', () => {
    const params = new URLSearchParams(
      'type=Dibujo&type=Dibujo&series=Paisajes&series=Paisajes&location=edificio a&location=edificio a',
    )
    const view = parseView(params)
    expect(view.types).toEqual(['Dibujo'])
    expect(view.series).toEqual(['Paisajes'])
    expect(view.locations).toEqual(['edificio a'])
  })

  it('RF-610: the searched text travels as `q`, and only when it says something', () => {
    expect(serializeView({ ...DEFAULT_VIEW, search: 'ar-0042' }).toString()).toBe('q=ar-0042')
    expect(parseView(new URLSearchParams('q=ar-0042')).search).toBe('ar-0042')
    // Only spaces finds everything, so it is not a search worth putting in a URL.
    expect(serializeView({ ...DEFAULT_VIEW, search: '   ' }).toString()).toBe('')
  })
})

describe('remembered view (applied when entering with no parameters)', () => {
  it('normalizes a foreign shape to the default, field by field', () => {
    expect(normalizeStoredView(null)).toEqual(DEFAULT_VIEW)
    expect(normalizeStoredView('garbage')).toEqual(DEFAULT_VIEW)
    expect(normalizeStoredView({ funds: ['ROTILI', 'GOYA'], status: 12, order: 'CATALOG_ID' })).toEqual({
      funds: ['ROTILI'],
      types: [],
      series: [],
      locations: [],
      status: 'ALL',
      order: 'CATALOG_ID',
      search: '',
    })
  })

  it('accepts the single-value shape stored before the multiselect', () => {
    expect(normalizeStoredView({ fund: 'ROTILI', type: 'Pintura' })).toEqual({
      funds: ['ROTILI'],
      types: ['Pintura'],
      series: [],
      locations: [],
      status: 'ALL',
      order: 'RECENT',
      search: '',
    })
  })

  it('a view stored before the series and location filters existed still works', () => {
    // The shape saved by yesterday's version has neither field: each one falls
    // back to "no selection" instead of taking the list down.
    expect(
      normalizeStoredView({ funds: ['TEST'], types: [], status: 'PHASE1_DONE', order: 'TITLE' }),
    ).toEqual({
      funds: ['TEST'],
      types: [],
      series: [],
      locations: [],
      status: 'PHASE1_DONE',
      order: 'TITLE',
      search: '',
    })
  })

  it('discards garbage inside the new arrays, entry by entry', () => {
    // The empty entry of `series` survives: it is the «Sin serie» selection
    // (NO_SERIES), not a leftover. What is not a string does not.
    expect(normalizeStoredView({ series: ['Paisajes', '', 7], locations: 'edificio a' })).toEqual({
      funds: [],
      types: [],
      series: ['Paisajes', NO_SERIES],
      locations: [],
      status: 'ALL',
      order: 'RECENT',
      search: '',
    })
  })

  it('RF-610: the device remembers the filters and the order, never the search', () => {
    // Coming back tomorrow to yesterday's search term would be reducing the
    // catalog by something nobody asked for again.
    const storage = memoryStorage()
    saveStoredView({ ...DEFAULT_VIEW, order: 'TITLE', search: 'ar-0042' }, storage)
    expect(storage.getItem('catalogador.artworks-view')).not.toContain('ar-0042')
    expect(readStoredView(storage)).toEqual({ ...DEFAULT_VIEW, order: 'TITLE' })
  })
})

/** Minimal in-memory Storage, like the one artworksCache.test.ts uses. */
function memoryStorage(initial: Record<string, string> = {}): Storage {
  const data = new Map(Object.entries(initial))
  return {
    get length() {
      return data.size
    },
    clear: () => data.clear(),
    getItem: (k: string) => data.get(k) ?? null,
    key: (i: number) => [...data.keys()][i] ?? null,
    removeItem: (k: string) => void data.delete(k),
    setItem: (k: string, v: string) => void data.set(k, v),
  }
}

/** Minimal listed artwork; each test overrides only what it exercises. */
const stub = (over: Partial<Parameters<typeof matchesView>[0]> = {}) => ({
  catalog_id: 'AR-0001',
  title: '',
  artist: 'ROTILI' as const,
  artwork_type: '',
  series: '',
  physical_location: '',
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

  it('the series filter matches by name, and an artwork without series is out', () => {
    const view: ListView = { ...DEFAULT_VIEW, series: ['Paisajes de la sierra'] }
    expect(matchesView(stub({ series: 'Paisajes de la sierra' }), view)).toBe(true)
    expect(matchesView(stub({ series: 'Retratos del taller' }), view)).toBe(false)
    expect(matchesView(stub({ series: '' }), view)).toBe(false)
  })

  it('a series name shared by two funds mixes them: the fund filter separates', () => {
    // Documented on ListView.series: the vocabulary is per fund but the filter
    // is by name, and the fund filter sits next to it to disambiguate.
    const view: ListView = { ...DEFAULT_VIEW, series: ['Homónima'] }
    expect(matchesView(stub({ artist: 'ROTILI', series: 'Homónima' }), view)).toBe(true)
    expect(matchesView(stub({ artist: 'RUIZ_CAMPINS', series: 'Homónima' }), view)).toBe(true)
    const onlyRotili: ListView = { ...view, funds: ['ROTILI'] }
    expect(matchesView(stub({ artist: 'RUIZ_CAMPINS', series: 'Homónima' }), onlyRotili)).toBe(false)
  })
})

describe('matchesView (RF-602: the location filter is hierarchical)', () => {
  const inside = (location: string, place: string) =>
    matchesView(stub({ physical_location: location }), { ...DEFAULT_VIEW, locations: [place] })

  it('a marked place brings everything inside it', () => {
    // The question one asks in a storage room: "everything in building a".
    expect(inside('edificio a, habitacion amarilla, bloque 3', 'edificio a')).toBe(true)
    expect(
      inside('edificio a, habitacion amarilla, bloque 3', 'edificio a, habitacion amarilla'),
    ).toBe(true)
    expect(inside('edificio a', 'edificio a')).toBe(true)
  })

  it('what is outside stays outside, and a partial level does NOT count', () => {
    expect(inside('edificio b, habitacion 4', 'edificio a')).toBe(false)
    // «edificio a» must not reach «edificio ab»: another building, not a child.
    expect(inside('edificio ab, habitacion 1', 'edificio a')).toBe(false)
    // And it does not reach upwards either: the building is not in the room.
    expect(inside('edificio a', 'edificio a, habitacion amarilla')).toBe(false)
  })

  it('an artwork with no location answers no place', () => {
    expect(inside('', 'edificio a')).toBe(false)
  })

  it('several marked places are an "or": any of them is enough', () => {
    const view: ListView = { ...DEFAULT_VIEW, locations: ['edificio a', 'almacen exterior'] }
    expect(matchesView(stub({ physical_location: 'almacen exterior, jaula 2' }), view)).toBe(true)
    expect(matchesView(stub({ physical_location: 'edificio c' }), view)).toBe(false)
  })
})

describe('seriesFilterOptions (RF-602, RF-213: the chooser of the series filter)', () => {
  /** The vocabulary rows, without the «Sin serie» entry, which has its own block. */
  const named = (options: readonly { value: string }[]) =>
    options.filter((o) => o.value !== NO_SERIES)

  const ENTRIES = [
    { artist: 'ROTILI' as const, name: 'Paisajes de la sierra' },
    { artist: 'RUIZ_CAMPINS' as const, name: 'Retratos del taller' },
    { artist: 'TEST' as const, name: 'Serie de ensayo A' },
  ]

  it('labels every option with its fund', () => {
    expect(named(seriesFilterOptions(ENTRIES, []))).toEqual([
      { value: 'Paisajes de la sierra', text: 'Rotili · Paisajes de la sierra' },
      { value: 'Retratos del taller', text: 'Ruiz Campins · Retratos del taller' },
      { value: 'Serie de ensayo A', text: 'Fondo de pruebas · Serie de ensayo A' },
    ])
  })

  it('offers only the series of the marked funds', () => {
    // Offering Ruiz Campins series while filtering by Rotili would be offering
    // options that cannot match.
    expect(named(seriesFilterOptions(ENTRIES, ['ROTILI'])).map((o) => o.value)).toEqual([
      'Paisajes de la sierra',
    ])
  })

  it('a name shared by two funds is one option labeled with both', () => {
    const shared = [
      { artist: 'ROTILI' as const, name: 'Homónima' },
      { artist: 'RUIZ_CAMPINS' as const, name: 'Homónima' },
    ]
    expect(named(seriesFilterOptions(shared, []))).toEqual([
      { value: 'Homónima', text: 'Rotili, Ruiz Campins · Homónima' },
    ])
  })

  it('a marked series the vocabulary does not know stays visible', () => {
    const options = seriesFilterOptions(ENTRIES, ['ROTILI'], ['Retirada'])
    expect(named(options).map((o) => o.value)).toEqual(['Paisajes de la sierra', 'Retirada'])
  })
})

describe('RF-602: «Sin serie» is an entry of the series filter', () => {
  const ENTRIES = [
    { artist: 'ROTILI' as const, name: 'Paisajes de la sierra' },
    { artist: 'RUIZ_CAMPINS' as const, name: 'Retratos del taller' },
  ]

  it('heads the list, before the names, and is not sorted among them', () => {
    const options = seriesFilterOptions(ENTRIES, [])
    expect(options[0]?.value).toBe(NO_SERIES)
    expect(options[0]?.text).toBe('Sin serie')
    expect(options.map((o) => o.value)).toEqual([
      NO_SERIES,
      'Paisajes de la sierra',
      'Retratos del taller',
    ])
  })

  it('is offered whatever the funds marked: an unassigned artwork has no fund vocabulary', () => {
    expect(seriesFilterOptions(ENTRIES, ['ROTILI']).map((o) => o.value)).toEqual([
      NO_SERIES,
      'Paisajes de la sierra',
    ])
    // And with an empty vocabulary it is the only thing to offer, which is
    // exactly the state of a catalog where nothing has been grouped yet.
    expect(seriesFilterOptions([], []).map((o) => o.value)).toEqual([NO_SERIES])
  })

  it('is not duplicated as an unknown name when it is the one selected', () => {
    const options = seriesFilterOptions(ENTRIES, [], [NO_SERIES])
    expect(options.filter((o) => o.value === NO_SERIES)).toHaveLength(1)
    expect(options.every((o) => o.text !== '')).toBe(true)
  })

  it('selects the artworks with no series, and only those', () => {
    const view: ListView = { ...DEFAULT_VIEW, series: [NO_SERIES] }
    expect(matchesView(stub({ series: '' }), view)).toBe(true)
    expect(matchesView(stub({ series: 'Paisajes de la sierra' }), view)).toBe(false)
    // Whatever the fund: what is unassigned is unassigned in both.
    expect(matchesView(stub({ artist: 'RUIZ_CAMPINS', series: '' }), view)).toBe(true)
  })

  it('combines with a name as an "or", like any two entries of the filter', () => {
    const view: ListView = { ...DEFAULT_VIEW, series: [NO_SERIES, 'Paisajes de la sierra'] }
    expect(matchesView(stub({ series: '' }), view)).toBe(true)
    expect(matchesView(stub({ series: 'Paisajes de la sierra' }), view)).toBe(true)
    expect(matchesView(stub({ series: 'Retratos del taller' }), view)).toBe(false)
  })

  it('travels in the URL as `series=` and comes back, alone or with names', () => {
    expect(serializeView({ ...DEFAULT_VIEW, series: [NO_SERIES] }).toString()).toBe('series=')
    expect(parseView(new URLSearchParams('series=')).series).toEqual([NO_SERIES])
    const both: ListView = { ...DEFAULT_VIEW, series: [NO_SERIES, 'Paisajes'] }
    expect(parseView(serializeView(both))).toEqual(both)
  })

  it('counts as filtering: it reduces the list, so the way out has to show', () => {
    const view: ListView = { ...DEFAULT_VIEW, series: [NO_SERIES] }
    expect(hasNoFilters(view)).toBe(false)
    expect(activeFilterCount(view)).toBe(1)
    expect(isDefaultView(view)).toBe(false)
  })

  it('is remembered on this device like any other selection', () => {
    const storage = memoryStorage()
    saveStoredView({ ...DEFAULT_VIEW, series: [NO_SERIES] }, storage)
    expect(readStoredView(storage).series).toEqual([NO_SERIES])
  })
})

describe('locationFilterOptions (RF-602: every place worth asking for)', () => {
  it('offers each used location and all of its ancestors', () => {
    // Without the ancestors, «edificio a» would never be offered and the
    // hierarchical match would be unreachable.
    expect(
      locationFilterOptions(['edificio a, habitacion amarilla, bloque 3']).map((o) => o.value),
    ).toEqual([
      'edificio a',
      'edificio a, habitacion amarilla',
      'edificio a, habitacion amarilla, bloque 3',
    ])
  })

  it('deduplicates shared ancestors and sorts so each branch sits under its parent', () => {
    expect(
      locationFilterOptions([
        'edificio a, habitacion 2',
        'edificio a, habitacion 1',
        'edificio a, habitacion 1, balda 5',
      ]).map((o) => o.value),
    ).toEqual([
      'edificio a',
      'edificio a, habitacion 1',
      'edificio a, habitacion 1, balda 5',
      'edificio a, habitacion 2',
    ])
  })

  it('ignores the artworks with no location', () => {
    expect(locationFilterOptions(['', ' , '])).toEqual([])
  })

  it('a marked place nobody uses anymore stays visible, normalized', () => {
    expect(locationFilterOptions([], ['Edificio C']).map((o) => o.value)).toEqual(['edificio c'])
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

  it('a search is not a filter for the funnel, but it is not the default view', () => {
    // «Quitar los filtros» does not empty the search box, so counting it would
    // offer a way out that leaves the list still reduced. It does mean the view
    // is no longer the default one.
    expect(hasNoFilters({ ...DEFAULT_VIEW, search: 'ar-0042' })).toBe(true)
    expect(activeFilterCount({ ...DEFAULT_VIEW, search: 'ar-0042' })).toBe(0)
    expect(isDefaultView({ ...DEFAULT_VIEW, search: 'ar-0042' })).toBe(false)
  })

  it('the two new filters also count as filtering', () => {
    // Otherwise the no-results message would offer no way out and the funnel
    // would look clean while the list is filtered.
    expect(hasNoFilters({ ...DEFAULT_VIEW, series: ['Paisajes'] })).toBe(false)
    expect(hasNoFilters({ ...DEFAULT_VIEW, locations: ['edificio a'] })).toBe(false)
    expect(isDefaultView({ ...DEFAULT_VIEW, locations: ['edificio a'] })).toBe(false)
  })

  it('NO_FILTERS clears every filter and nothing else', () => {
    const filtered: ListView = {
      funds: ['TEST'],
      types: ['Pintura'],
      series: ['Paisajes'],
      locations: ['edificio a'],
      status: 'PHASE1_DONE',
      order: 'TITLE',
      search: '',
    }
    const cleared = { ...filtered, ...NO_FILTERS }
    expect(hasNoFilters(cleared)).toBe(true)
    expect(cleared.order).toBe('TITLE')
  })

  it('the funnel counts each filter and the order, one by one', () => {
    expect(activeFilterCount(DEFAULT_VIEW)).toBe(0)
    expect(activeFilterCount({ ...DEFAULT_VIEW, order: 'TITLE' })).toBe(1)
    expect(
      activeFilterCount({
        ...DEFAULT_VIEW,
        funds: ['TEST'],
        types: ['Pintura'],
        series: ['Paisajes'],
        locations: ['edificio a'],
        status: 'PHASE1_DONE',
        order: 'TITLE',
      }),
    ).toBe(6)
  })
})
