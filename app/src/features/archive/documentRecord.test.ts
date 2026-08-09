import { describe, expect, it } from 'vitest'
import {
  documentReachSegments,
  documentReachSummary,
  linkedArtworkViews,
  linkedBlockNotice,
  linkedExhibitionViews,
  NO_LINKED_ARTWORKS,
  type LinkedArtworkRow,
  type LinkedExhibitionRow,
} from './documentRecord'

/**
 * La ficha de un documento del archivo (RF-309, RF-516, RF-609).
 *
 * Lo que fija esta batería, y que es la diferencia con la ficha de una referencia: **dos
 * bloques y no uno**. La relación de un documento es de muchos a muchos con las obras y
 * con las exposiciones, así que un recorte habla de tres piezas y un díptico cuelga de
 * la muestra y de ninguna pieza. Fundirlos mezclaría códigos de catalogación con títulos
 * de exposición en la misma columna, y el documento que solo cuelga de una muestra
 * —justo el caso que hizo falta esta pantalla— saldría bajo un encabezado que dice
 * «obras».
 *
 * Y fija la frase que convierte a un documento en «suelto»: cero obras y cero
 * exposiciones es exactamente la fila a la que no se llegaba desde ningún sitio.
 */

function linkedArtwork(over: Partial<LinkedArtworkRow> = {}): LinkedArtworkRow {
  const catalogId = over.catalog_id ?? 'AR-0042'
  return {
    id: 'v-1',
    catalog_id: catalogId,
    document_id: 'doc-1',
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

function linkedExhibition(over: Partial<LinkedExhibitionRow> = {}): LinkedExhibitionRow {
  return {
    id: 'x-1',
    exhibition_id: 'exp-1',
    document_id: 'doc-1',
    note: '',
    active: true,
    exhibition: {
      id: 'exp-1',
      title: 'Muestra de Zafra',
      year: 1985,
      start_date: null,
      end_date: null,
      date_note: '',
      active: true,
    },
    ...over,
  }
}

describe('linkedArtworkViews, las obras que lo tienen enlazado (RF-516)', () => {
  it('por identificador de catalogación', () => {
    const rows = [
      linkedArtwork({ id: 'b', catalog_id: 'AR-0100' }),
      linkedArtwork({ id: 'a', catalog_id: 'AR-0007' }),
    ]
    expect(linkedArtworkViews(rows).map((v) => v.catalogId)).toEqual(['AR-0007', 'AR-0100'])
  })

  it('los vínculos retirados no salen', () => {
    // Uno retirado salió de la ficha de su obra (RF-517): contarlo aquí haría que las
    // dos pantallas dijeran cosas distintas del mismo hecho.
    const rows = [linkedArtwork({ id: 'vivo' }), linkedArtwork({ id: 'ido', active: false })]
    expect(linkedArtworkViews(rows).map((v) => v.id)).toEqual(['vivo'])
  })

  it('la nota del vínculo se lee, porque es lo que el documento dice de ESA obra', () => {
    const [view] = linkedArtworkViews([linkedArtwork({ note: 'reproducida en la página 3' })])
    expect(view?.note).toBe('reproducida en la página 3')
  })

  it('en blanco no deja una línea vacía', () => {
    expect(linkedArtworkViews([linkedArtwork({ note: '   ' })])[0]?.note).toBeNull()
  })

  it('una obra en la papelera se marca, no se esconde (RF-901)', () => {
    const rows = [
      linkedArtwork({ artwork: { ...linkedArtwork().artwork!, active: false } }),
    ]
    const [view] = linkedArtworkViews(rows)
    expect(view?.retired).toBe(true)
    expect(view?.linked).toBe(true)
  })

  it('una obra que no se puede leer deja la fila y no se enlaza', () => {
    const [view] = linkedArtworkViews([linkedArtwork({ artwork: null })])
    expect(view?.unavailable).toBe(true)
    expect(view?.linked).toBe(false)
    expect(view?.title).toContain('no se puede leer')
    // El código sí, que está en la fila puente y es real.
    expect(view?.catalogId).toBe('AR-0042')
  })
})

describe('linkedExhibitionViews, las exposiciones que lo tienen enlazado (RF-516)', () => {
  it('de lo más reciente a lo más antiguo, como el listado de exposiciones', () => {
    const rows = [
      linkedExhibition({ id: 'vieja', exhibition: { ...linkedExhibition().exhibition!, id: 'e1', year: 1978 } }),
      linkedExhibition({ id: 'nueva', exhibition: { ...linkedExhibition().exhibition!, id: 'e2', year: 1991 } }),
    ]
    expect(linkedExhibitionViews(rows).map((v) => v.id)).toEqual(['nueva', 'vieja'])
  })

  it('la que no se puede leer va al final: no hay fecha con la que colocarla', () => {
    const rows = [
      linkedExhibition({ id: 'ilegible', exhibition: null }),
      linkedExhibition({ id: 'legible' }),
    ]
    expect(linkedExhibitionViews(rows).map((v) => v.id)).toEqual(['legible', 'ilegible'])
  })

  it('los vínculos retirados no salen', () => {
    const rows = [linkedExhibition({ id: 'vivo' }), linkedExhibition({ id: 'ido', active: false })]
    expect(linkedExhibitionViews(rows).map((v) => v.id)).toEqual(['vivo'])
  })

  it('la fecha se compone como en el resto del catálogo, y sin fechar se dice', () => {
    expect(linkedExhibitionViews([linkedExhibition()])[0]?.dates).toBe('1985')
    const sinFecha = linkedExhibition({
      exhibition: { ...linkedExhibition().exhibition!, year: null, date_note: '' },
    })
    expect(linkedExhibitionViews([sinFecha])[0]?.dates).toBe('Sin fechar')
  })

  it('la nota del vínculo es la de la MUESTRA, no la de una obra suya', () => {
    const [view] = linkedExhibitionViews([linkedExhibition({ note: 'cartel de la muestra' })])
    expect(view?.note).toBe('cartel de la muestra')
  })

  it('una exposición en la papelera se marca y se sigue enlazando', () => {
    const rows = [
      linkedExhibition({ exhibition: { ...linkedExhibition().exhibition!, active: false } }),
    ]
    const [view] = linkedExhibitionViews(rows)
    expect(view?.retired).toBe(true)
    expect(view?.linked).toBe(true)
  })
})

describe('documentReachSummary, de qué está colgando (RF-516)', () => {
  it('cuenta las dos mitades aparte', () => {
    expect(documentReachSummary({ artworks: 3, exhibitions: 1 })).toBe(
      'Enlazado con 3 obras y una exposición.',
    )
    expect(documentReachSummary({ artworks: 1, exhibitions: 0 })).toBe('Enlazado con una obra.')
    expect(documentReachSummary({ artworks: 0, exhibitions: 2 })).toBe(
      'Enlazado con 2 exposiciones.',
    )
  })

  it('y con cero y cero dice dónde está el documento suelto', () => {
    // La frase que justifica la pantalla entera: es la fila a la que no se llegaba
    // desde ningún sitio. Dice qué pasa y dónde se encuentra, sin defenderse de
    // una acusación que nadie ha hecho.
    const text = documentReachSummary({ artworks: 0, exhibitions: 0 })
    expect(text).toContain('No lo tiene enlazado nada')
    expect(text).toContain('Solo se llega a él desde aquí')
    expect(text).not.toContain('No es un error')
  })
})

describe('documentReachSegments, y además se puede ir (RF-516)', () => {
  const obra = (catalogId: string, linked = true) => ({ catalogId, linked })
  const muestra = (exhibitionId: string, title: string, linked = true) => ({
    exhibitionId,
    title,
    linked,
  })
  const plain = (segments: ReturnType<typeof documentReachSegments>) =>
    segments.map((s) => s.text).join('')
  const links = (segments: ReturnType<typeof documentReachSegments>) =>
    segments.filter((s) => s.kind === 'link')

  it('nombra la obra en vez de contarla, y lleva a su ficha', () => {
    // «Enlazado con una obra» obliga a bajar hasta el bloque de abajo para saber
    // cuál es, y a bajar otra vez para llegar.
    const segments = documentReachSegments({ artworks: [obra('RC-0005')], exhibitions: [] })
    expect(plain(segments)).toBe('Enlazado con la obra RC-0005.')
    expect(links(segments)).toEqual([{ kind: 'link', text: 'RC-0005', to: '/artwork/RC-0005' }])
  })

  it('varias van enumeradas, con «y» al final', () => {
    const segments = documentReachSegments({
      artworks: [obra('AR-0001'), obra('AR-0002'), obra('RC-0005')],
      exhibitions: [],
    })
    expect(plain(segments)).toBe('Enlazado con las obras AR-0001, AR-0002 y RC-0005.')
    expect(links(segments)).toHaveLength(3)
  })

  it('y las dos mitades se dicen juntas', () => {
    const segments = documentReachSegments({
      artworks: [obra('RC-0005')],
      exhibitions: [muestra('e1', 'Saliente en el espacio')],
    })
    expect(plain(segments)).toBe(
      'Enlazado con la obra RC-0005, y con la exposición «Saliente en el espacio».',
    )
    expect(links(segments).map((s) => s.to)).toEqual(['/artwork/RC-0005', '/exhibitions/e1'])
  })

  it('lo que no se puede leer desde aquí se nombra, pero SIN enlace', () => {
    // Un enlace que lleva a una pantalla que dirá que esa ficha no existe es peor
    // que decirlo aquí: promete algo que no hay al otro lado.
    const segments = documentReachSegments({ artworks: [obra('RC-0005', false)], exhibitions: [] })
    expect(plain(segments)).toBe('Enlazado con la obra RC-0005.')
    expect(links(segments)).toEqual([])
  })

  it('sin nada enlazado dice lo mismo de siempre, y sin enlaces', () => {
    const segments = documentReachSegments({ artworks: [], exhibitions: [] })
    expect(plain(segments)).toBe(documentReachSummary({ artworks: 0, exhibitions: 0 }))
    expect(links(segments)).toEqual([])
  })
})

describe('linkedBlockNotice, nunca un hueco (RF-304)', () => {
  it('con filas no dice nada', () => {
    expect(
      linkedBlockNotice({ loading: false, error: null, count: 2, empty: NO_LINKED_ARTWORKS }),
    ).toBeNull()
  })

  it('mientras carga lo dice, y el error manda', () => {
    expect(
      linkedBlockNotice({ loading: true, error: null, count: 0, empty: NO_LINKED_ARTWORKS }),
    ).toBe('Cargando…')
    expect(
      linkedBlockNotice({ loading: true, error: 'Sin red', count: 0, empty: NO_LINKED_ARTWORKS }),
    ).toBe('Sin red')
  })

  it('el bloque de obras vacío dice desde dónde se enlaza', () => {
    expect(
      linkedBlockNotice({ loading: false, error: null, count: 0, empty: NO_LINKED_ARTWORKS }),
    ).toContain('desde la documentación de una obra')
  })

  it('la frase del bloque vacío pasa tal cual, que es lo que deja decir dos cosas distintas', () => {
    // El bloque de exposiciones dice una cosa a quien puede escribir y otra a quien solo
    // consulta, y las dos las decide la pantalla. Aquí se fija que el aviso no las
    // reescribe: viven en `exhibitionLink.ts`, con sus propios tests.
    expect(
      linkedBlockNotice({ loading: false, error: null, count: 0, empty: 'Lo que sea' }),
    ).toBe('Lo que sea')
  })
})
