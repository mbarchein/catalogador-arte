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
 * La ficha de una referencia y su bloque «Obras citadas» (RF-506, RF-504, RF-609).
 *
 * Lo que estos tests fijan es lo que la ficha añade y que no existía en ningún sitio:
 * leer la referencia POR EL OTRO LADO, es decir qué obras la citan y en qué página de
 * ella sale cada una. Y las tres cosas que un bloque así hace mal sin que se note:
 * enseñar una cita que su propia obra ya no cuenta, tirar la fila de una obra que no
 * se puede leer —lo que acortaría la lista en silencio—, y dejar un hueco donde
 * debería decir que a esta referencia no la cita nadie, que es precisamente la fila
 * que el listado se construyó para poder encontrar.
 */

/**
 * Una cita, con el código de la obra incrustada SIGUIENDO al de la fila puente salvo
 * que se diga otra cosa: la clave ajena obliga a que coincidan, y un fixture en el
 * que no coinciden prueba un caso que la base no permite. Lo aprendí escribiéndolo
 * mal: el test del orden pasaba filas con dos códigos distintos y leía siempre el de
 * la obra.
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

/** La obra incrustada de una cita cualquiera, para retocarle un campo. */
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
    // `pages` es texto libre a propósito (RF-504): ordenar por eso pondría «lám. XII»
    // antes que «p. 9». El orden es el del código, y las páginas se leen dentro.
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
    // «s/p» es alguien afirmando que la publicación no tiene paginación; el campo
    // vacío es que nadie la ha anotado. La distinción sobre la que va todo el
    // catálogo.
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
    // Tirarla acortaría en silencio la lista de obras que citan la referencia.
    const view = citedArtworkView(cited({ artwork: null }))
    expect(view.unavailable).toBe(true)
    expect(view.title).toContain('no se puede leer')
    // El código sí se enseña: está en la fila puente y es real.
    expect(view.catalogId).toBe('AR-0042')
    // Y no se enlaza a una ficha que no se va a poder abrir.
    expect(view.linked).toBe(false)
    // La página sí, porque también es de la fila puente.
    expect(view.pages).toBe('pág. 34')
  })

  it('una obra sin título dice que no lo tiene, en vez de dejar el hueco', () => {
    const view = citedArtworkView(cited({ artwork: { ...artworkOf(cited()), title: '  ' } }))
    expect(view.title).toBe('Obra sin título')
  })
})

describe('citedArtworkViews, el bloque entero', () => {
  it('las citas retiradas no salen', () => {
    // Una cita retirada salió del historial de su obra (RF-901): enseñarla aquí
    // contaría una cita que la ficha de la obra ya no cuenta, y las dos pantallas
    // dirían cosas distintas del mismo hecho.
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
    // Una referencia sin citas es exactamente la fila que el listado se construyó
    // para poder encontrar. Se dice qué pasa y qué se puede hacer; que no sea un
    // dato pendiente ya no se argumenta, porque a quien cataloga no le hacía falta
    // esa distinción para nada.
    const text = citedArtworksNotice({ loading: false, error: null, count: 0 })
    expect(text).toContain('Ninguna obra la cita')
    expect(text).toContain('bibliografía de cualquier obra')
  })
})
