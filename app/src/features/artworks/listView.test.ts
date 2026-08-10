import { describe, expect, it } from 'vitest'
import type { ArtistFund } from '../../lib/types'
import {
  DEFAULT_VIEW,
  NO_FILTERS,
  NO_PLACE,
  NO_SERIES,
  activeFilterCount,
  compareByTitle,
  hasNoFilters,
  isDefaultView,
  legacyPlaceParams,
  matchesSearch,
  matchesView,
  normalizeStoredView,
  parseView,
  placeFilterOptions,
  readStoredView,
  saveStoredView,
  serializeView,
  seriesFilterOptions,
  sortArtworks,
  type ListView,
} from './listView'
import { buildPlaceTree, placesInside } from '../../lib/places'
import type { PhysicalPlace } from '../../lib/types'

/**
 * The tree these tests filter over. Two branches and a retired shelf, which is
 * the shape the real catalog has: mostly one level, one branch two deep.
 */
function node(
  id: string,
  name: string,
  parent_id: string | null = null,
  active = true,
): PhysicalPlace {
  return { id, parent_id, name, active }
}

const TREE = buildPlaceTree([
  node('a', 'Edificio A'),
  node('a1', 'Habitación amarilla', 'a'),
  node('a2', 'Bloque 3', 'a1'),
  node('b', 'Edificio B'),
  node('b1', 'Habitación 4', 'b'),
  node('c', 'Almacén exterior'),
  node('c1', 'Jaula 2', 'c'),
  node('z', 'Balda vaciada', 'a', false),
])

/** The reach of a filter that marks `ids`: what the list page computes. */
const scopeOf = (ids: readonly string[]) => placesInside(TREE, ids)

describe('los fondos apartados (ADR-007, segunda entrega)', () => {
  const of = (artist: string, id: string) =>
    ({ catalog_id: id, artist, artwork_type: '', series: '', physical_place_id: null }) as never

  it('sus obras no salen por omisión', () => {
    // The switch of the funds table, made effective. It is not a delete: the row
    // still exists and opens through its link.
    const hidden: ReadonlySet<ArtistFund> = new Set(['TEST'])
    expect(matchesView(of('TEST', 'TS-0001'), DEFAULT_VIEW, null, hidden)).toBe(false)
    expect(matchesView(of('ROTILI', 'AR-0001'), DEFAULT_VIEW, null, hidden)).toBe(true)
  })

  it('y VUELVEN al filtrar por ese fondo, que es lo que lo hace reversible', () => {
    // Without this, setting a fund aside would hide it with no way to reach it from the
    // listing, which is a wastebasket under another name.
    const hidden: ReadonlySet<ArtistFund> = new Set(['TEST'])
    const view = { ...DEFAULT_VIEW, funds: ['TEST' as ArtistFund] }
    expect(matchesView(of('TEST', 'TS-0001'), view, null, hidden)).toBe(true)
  })

  it('sin nada apartado, el catálogo entero', () => {
    expect(matchesView(of('TEST', 'TS-0001'), DEFAULT_VIEW)).toBe(true)
  })
})

describe('URL ↔ view (RF-608: the list view survives in the URL)', () => {
  it('no parameters means the default view', () => {
    expect(parseView(new URLSearchParams())).toEqual(DEFAULT_VIEW)
  })

  it('round-trips every non-default field, multiselects included', () => {
    const view: ListView = {
      funds: ['RUIZ_CAMPINS', 'TEST'],
      types: ['Dibujo', 'Técnica mixta'],
      series: ['Retratos del taller', 'Serie de ensayo A'],
      places: ['a', 'b1'],
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
      'fund=PICASSO&fund=ROTILI&type=Dibujo&series=&place=a&status=whatever&order=title',
    )
    expect(parseView(params)).toEqual({
      funds: ['ROTILI'],
      types: ['Dibujo'],
      // A series name the vocabulary does not know is NOT ignored: it is a
      // plausible entry, and an unknown one simply finds nothing. And the empty
      // value is not dropped either — `series=` is the «Sin serie» entry.
      series: [NO_SERIES],
      places: ['a'],
      status: 'ALL',
      order: 'TITLE',
      search: '',
    })
  })

  it('deduplicates repeated parameters, the new filters included', () => {
    const params = new URLSearchParams(
      'type=Dibujo&type=Dibujo&series=Paisajes&series=Paisajes&place=a&place=a',
    )
    const view = parseView(params)
    expect(view.types).toEqual(['Dibujo'])
    expect(view.series).toEqual(['Paisajes'])
    expect(view.places).toEqual(['a'])
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
      places: [],
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
      places: [],
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
      places: [],
      status: 'PHASE1_DONE',
      order: 'TITLE',
      search: '',
    })
  })

  it('discards garbage inside the new arrays, entry by entry', () => {
    // The empty entry of `series` survives: it is the «Sin serie» selection
    // (NO_SERIES), not a leftover. What is not a string does not.
    expect(normalizeStoredView({ series: ['Paisajes', '', 7], places: 'a' })).toEqual({
      funds: [],
      types: [],
      series: ['Paisajes', NO_SERIES],
      places: [],
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
  physical_place_id: null as string | null,
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

describe('matchesView (RF-602, RF-215: the location filter is hierarchical)', () => {
  /** An artwork at `where`, against a filter that marks `marked`. */
  const at = (where: string | null, marked: readonly string[]) =>
    matchesView(stub({ physical_place_id: where }), { ...DEFAULT_VIEW, places: [...marked] }, scopeOf(marked))

  it('a marked place brings everything inside it', () => {
    // The question one asks in a storage room: "everything in building A".
    expect(at('a2', ['a'])).toBe(true)
    expect(at('a2', ['a1'])).toBe(true)
    expect(at('a', ['a'])).toBe(true)
  })

  it('what is outside stays outside, and it does not reach upwards', () => {
    expect(at('b1', ['a'])).toBe(false)
    // The building is not inside the room: containment has one direction.
    expect(at('a', ['a1'])).toBe(false)
  })

  // Where the tree earns its keep: the old text filter compared strings level by
  // level, so «edificio a» reaching «edificio ab» was a real hazard that needed
  // its own rule. With identifiers the question cannot even be asked wrong.
  it('two places with similar names are simply two places', () => {
    expect(at('b', ['a'])).toBe(false)
  })

  it('an artwork with no place is out of any place filter', () => {
    expect(at(null, ['a'])).toBe(false)
  })

  // RF-215: an artwork with no location is legitimate, so it has to be findable.
  it('«Sin ubicación» finds exactly the artworks with no place', () => {
    expect(at(null, [NO_PLACE])).toBe(true)
    expect(at('a', [NO_PLACE])).toBe(false)
    // And it combines with real places as one more "or".
    expect(at(null, [NO_PLACE, 'a'])).toBe(true)
    expect(at('a2', [NO_PLACE, 'a'])).toBe(true)
    expect(at('b', [NO_PLACE, 'a'])).toBe(false)
  })

  it('several marked places are an "or": any of them is enough', () => {
    expect(at('c1', ['a', 'c'])).toBe(true)
    expect(at('b', ['a', 'c'])).toBe(false)
  })

  // A link naming a place somebody retired, or one from another catalog: it
  // filters by nothing rather than by everything.
  it('an identifier that is not in the tree finds nothing', () => {
    expect(at('a', ['no-existe'])).toBe(false)
    expect(at(null, ['no-existe'])).toBe(false)
  })

  // The asymmetry documented on matchesView: with the tree still in flight,
  // filtering against an empty scope would empty the list, and the record's
  // frozen sequence could freeze that emptiness. Showing more for a moment is
  // recoverable.
  it('while the tree has not arrived the location filter is skipped, not applied empty', () => {
    const view: ListView = { ...DEFAULT_VIEW, places: ['a'] }
    expect(matchesView(stub({ physical_place_id: 'a2' }), view, null)).toBe(true)
    expect(matchesView(stub({ physical_place_id: 'b' }), view, null)).toBe(true)
    // With the tree, the second one drops out.
    expect(matchesView(stub({ physical_place_id: 'b' }), view, scopeOf(['a']))).toBe(false)
  })
})

describe('placeFilterOptions (RF-602, RF-215: the chooser of the location filter)', () => {
  const values = placeFilterOptions(TREE).map((o) => o.value)

  it('offers «Sin ubicación» first, and then the whole tree branch by branch', () => {
    expect(values).toEqual([NO_PLACE, 'c', 'c1', 'a', 'a1', 'a2', 'b', 'b1'])
  })

  // Every node is offered even when no artwork sits exactly on it: asking for a
  // building has to be possible when every piece is on a shelf inside it.
  it('says where each place hangs from, which is what tells two homonyms apart', () => {
    const options = placeFilterOptions(TREE)
    expect(options.find((o) => o.value === 'a')?.hint).toBeUndefined()
    expect(options.find((o) => o.value === 'a2')?.hint).toBe('En Edificio A, Habitación amarilla')
  })

  it('leaves the retired places out', () => {
    expect(values).not.toContain('z')
  })

  // Hiding what is filtering paints a checkbox nobody can untick.
  it('a retired place that is selected stays visible, and says so', () => {
    const options = placeFilterOptions(TREE, ['z'])
    expect(options.map((o) => o.value)).toContain('z')
    expect(options.find((o) => o.value === 'z')?.hint).toBe('En Edificio A · lugar retirado')
  })

  it('an identifier that is not in the tree at all is still offered, to be undone', () => {
    const options = placeFilterOptions(TREE, ['fantasma'])
    expect(options.find((o) => o.value === 'fantasma')?.text).toBe('Lugar que ya no existe')
  })
})

describe('legacyPlaceParams (RF-215: links shared before the tree existed)', () => {
  it('turns the old comma text into identifiers', () => {
    const params = new URLSearchParams('location=edificio a, habitacion amarilla')
    expect(legacyPlaceParams(params, TREE)).toEqual(['a1'])
  })

  // The stored text was lowercase and without accents, by the old convention.
  it('ignores capitals and accents, which is how the old text was stored', () => {
    expect(legacyPlaceParams(new URLSearchParams('location=habitacion 4'), TREE)).toEqual([])
    expect(legacyPlaceParams(new URLSearchParams('location=edificio b'), TREE)).toEqual(['b'])
  })

  it('drops what no longer exists instead of failing', () => {
    const params = new URLSearchParams('location=edificio a&location=edificio que ya no hay')
    expect(legacyPlaceParams(params, TREE)).toEqual(['a'])
  })

  it('answers null when there is nothing to convert, which is the normal case', () => {
    expect(legacyPlaceParams(new URLSearchParams('place=a'), TREE)).toBeNull()
    expect(legacyPlaceParams(new URLSearchParams(''), TREE)).toBeNull()
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
    expect(hasNoFilters({ ...DEFAULT_VIEW, places: ['a'] })).toBe(false)
    expect(isDefaultView({ ...DEFAULT_VIEW, places: ['a'] })).toBe(false)
  })

  it('NO_FILTERS clears every filter and nothing else', () => {
    const filtered: ListView = {
      funds: ['TEST'],
      types: ['Pintura'],
      series: ['Paisajes'],
      places: ['a'],
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
        places: ['a'],
        status: 'PHASE1_DONE',
        order: 'TITLE',
      }),
    ).toBe(6)
  })
})
