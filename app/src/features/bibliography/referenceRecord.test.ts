import { describe, expect, it } from 'vitest'
import {
  citedArtworkView,
  citedArtworkViews,
  citedArtworksNotice,
  citedArtworksSummary,
  sortCitedArtworks,
  type CitedArtworkRow,
} from './referenceRecord'

/**
 * A reference's record and its «Obras citadas» block (RF-506, RF-504, RF-609).
 *
 * What these tests pin down is what the record adds and did not exist anywhere:
 * reading the reference FROM THE OTHER SIDE, that is, which artworks cite it and on which of its
 * pages each one appears. And the three things a block like this does wrong unnoticed:
 * showing a citation its own artwork no longer counts, throwing away the row of an artwork that
 * cannot be read —which would shorten the list in silence—, and leaving a gap where
 * it should say that nobody cites this reference, which is precisely the row
 * the listing was built to be able to find.
 */

/**
 * A citation, with the embedded artwork's code FOLLOWING the bridge row's unless
 * stated otherwise: the foreign key forces them to coincide, and a fixture in
 * which they do not coincide tests a case the base does not allow. I learnt it by writing it
 * wrong: the order test passed rows with two different codes and always read the
 * artwork's.
 */
function cited(over: Partial<CitedArtworkRow> = {}): CitedArtworkRow {
  const catalogId = over.catalog_id ?? 'AR-0042'
  return {
    id: 'cita-1',
    catalog_id: catalogId,
    bibliography_id: 'ref-1',
    pages: '34',
    note: '',
    active: true,
    artwork: {
      catalog_id: catalogId,
      title: 'Paisaje de Zafra',
      artist: 'ROTILI',
      execution_date: '1985',
      active: true,
    },
    ...over,
  }
}

/** The embedded artwork of any citation, to tweak one of its fields. */
function artworkOf(row: CitedArtworkRow) {
  const artwork = row.artwork
  if (artwork === null) throw new Error('el fixture trae la obra incrustada')
  return artwork
}

describe('sortCitedArtworks, el orden del bloque (RF-506)', () => {
  it('por identificador de catalogación, que es el orden del catálogo razonado', () => {
    const rows = [
      cited({ id: 'c', catalog_id: 'AR-0100' }),
      cited({ id: 'a', catalog_id: 'AR-0007' }),
      cited({ id: 'b', catalog_id: 'AR-0042' }),
    ]
    expect(sortCitedArtworks(rows).map((r) => r.catalog_id)).toEqual([
      'AR-0007',
      'AR-0042',
      'AR-0100',
    ])
  })

  it('las páginas NO ordenan, aunque en una bibliografía lo parezca', () => {
    // `pages` is free text on purpose (RF-504): ordering by that would put «lám. XII»
    // before «p. 9». The order is the code's, and the pages are read inside.
    const rows = [
      cited({ catalog_id: 'AR-0007', pages: 'lám. XII' }),
      cited({ catalog_id: 'AR-0002', pages: '9' }),
    ]
    expect(sortCitedArtworks(rows).map((r) => r.catalog_id)).toEqual(['AR-0002', 'AR-0007'])
  })

  it('no toca el array que recibe', () => {
    const rows = [cited({ catalog_id: 'AR-0100' }), cited({ catalog_id: 'AR-0007' })]
    sortCitedArtworks(rows)
    expect(rows.map((r) => r.catalog_id)).toEqual(['AR-0100', 'AR-0007'])
  })
})

describe('citedArtworkView, una fila del bloque', () => {
  it('el código, el título y la página con su abreviatura', () => {
    const view = citedArtworkView(cited())
    expect(view.catalogId).toBe('AR-0042')
    expect(view.title).toBe('Paisaje de Zafra')
    expect(view.pages).toBe('pág. 34')
    expect(view.linked).toBe(true)
  })

  it('un rango se abrevia en plural, y lo que ya se nombra va tal cual', () => {
    expect(citedArtworkView(cited({ pages: '34-36' })).pages).toBe('págs. 34-36')
    expect(citedArtworkView(cited({ pages: 'lám. XII' })).pages).toBe('lám. XII')
    expect(citedArtworkView(cited({ pages: 's/p' })).pages).toBe('s/p')
  })

  it('la página sin anotar es null, que NO es «s/p»', () => {
    // «s/p» is somebody stating that the publication has no pagination; the empty
    // field is that nobody has noted it. The distinction the whole
    // catalogue rests on.
    expect(citedArtworkView(cited({ pages: '' })).pages).toBeNull()
    expect(citedArtworkView(cited({ pages: '   ' })).pages).toBeNull()
  })

  it('la nota de la cita se lee, y en blanco no deja una línea vacía', () => {
    expect(citedArtworkView(cited({ note: 'reproducida en color' })).note).toBe(
      'reproducida en color',
    )
    expect(citedArtworkView(cited({ note: '  ' })).note).toBeNull()
  })

  it('una obra en la papelera se marca, no se esconde (RF-901)', () => {
    const view = citedArtworkView(
      cited({ artwork: { ...artworkOf(cited()), active: false } }),
    )
    expect(view.retired).toBe(true)
    expect(view.unavailable).toBe(false)
    expect(view.title).toBe('Paisaje de Zafra')
  })

  it('una obra que no se puede leer deja la fila puesta y lo dice', () => {
    // Dropping it would silently shorten the list of artworks citing the reference.
    const view = citedArtworkView(cited({ artwork: null }))
    expect(view.unavailable).toBe(true)
    expect(view.title).toContain('no se puede leer')
    // The code is shown: it is on the bridge row and it is real.
    expect(view.catalogId).toBe('AR-0042')
    // And it does not link to a record that will not open.
    expect(view.linked).toBe(false)
    // The page does, because it also belongs to the bridge row.
    expect(view.pages).toBe('pág. 34')
  })

  it('una obra sin título dice que no lo tiene, en vez de dejar el hueco', () => {
    const view = citedArtworkView(cited({ artwork: { ...artworkOf(cited()), title: '  ' } }))
    expect(view.title).toBe('Obra sin título')
  })
})

describe('citedArtworkViews, el bloque entero', () => {
  it('las citas retiradas no salen', () => {
    // A withdrawn citation left its artwork's history (RF-901): showing it here
    // would count a citation the artwork's record no longer counts, and the two screens
    // would say different things about the same fact.
    const rows = [cited({ id: 'viva' }), cited({ id: 'retirada', active: false })]
    expect(citedArtworkViews(rows).map((v) => v.id)).toEqual(['viva'])
  })

  it('y lo que sale sale ordenado', () => {
    const rows = [
      cited({ id: 'b', catalog_id: 'AR-0100' }),
      cited({ id: 'a', catalog_id: 'AR-0007' }),
    ]
    expect(citedArtworkViews(rows).map((v) => v.catalogId)).toEqual(['AR-0007', 'AR-0100'])
  })
})

describe('citedArtworksSummary, cuántas la citan', () => {
  it('en singular y en plural', () => {
    expect(citedArtworksSummary([citedArtworkView(cited())])).toBe(
      'La cita una obra del catálogo.',
    )
    expect(
      citedArtworksSummary([citedArtworkView(cited()), citedArtworkView(cited({ id: 'b' }))]),
    ).toBe('La citan 2 obras del catálogo.')
  })

  it('sin filas no dice nada: lo explica el aviso del bloque vacío', () => {
    expect(citedArtworksSummary([])).toBeNull()
  })
})

describe('citedArtworksNotice, nunca un hueco (RF-304)', () => {
  it('con filas no dice nada', () => {
    expect(citedArtworksNotice({ loading: false, error: null, count: 3 })).toBeNull()
  })

  it('mientras carga lo dice', () => {
    expect(citedArtworksNotice({ loading: true, error: null, count: 0 })).toContain('Cargando')
  })

  it('el error manda sobre «cargando»', () => {
    expect(citedArtworksNotice({ loading: true, error: 'Sin conexión', count: 0 })).toBe(
      'Sin conexión',
    )
  })

  it('sin ninguna cita se cuenta, y se dice desde dónde se cita', () => {
    // A reference with no citations is exactly the row the listing was built
    // to be able to find. What happens and what can be done is said; that it is not a
    // pending datum is no longer argued, because whoever catalogues did not need
    // that distinction for anything.
    const text = citedArtworksNotice({ loading: false, error: null, count: 0 })
    expect(text).toContain('Ninguna obra la cita')
    expect(text).toContain('bibliografía de cualquier obra')
  })
})
