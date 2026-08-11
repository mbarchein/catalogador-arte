import { describe, expect, it } from 'vitest'
import type { DossierItem } from '../../lib/types'
import type { DossierItemRow } from './dossierItems'
import {
  artworkCaption,
  cvLines,
  dossierPages,
  footerText,
  issueBlockedReason,
  issueFileName,
  issuePath,
  paragraphsOf,
} from './dossierPdfPlan'

/**
 * RF-1607, RF-1609, RF-1613, RF-1614: qué páginas salen y qué lleva cada una.
 *
 * La decisión que más protege este fichero es dónde caen los textos: un rótulo se
 * pega a la obra que viene detrás, así que moverlo por encima de otra obra cambia
 * de sección exactamente esa obra. Si eso se rompiera, el dossier seguiría
 * generándose —con las secciones en otro sitio—, y nadie lo vería hasta abrir el
 * PDF.
 */

let next = 1
function item(over: Partial<DossierItemRow> = {}): DossierItemRow {
  const base: DossierItem = {
    id: `i${next++}`,
    dossier_id: 'd1',
    kind: 'ARTWORK',
    sort_order: next,
    catalog_id: 'AR-0001',
    image_id: null,
    price: null,
    currency: 'EUR',
    note: '',
    heading: '',
    body: '',
    artist_fund: null,
    with_cv: null,
    divider_page: null,
    active: true,
  }
  return {
    ...base,
    artwork: {
      catalog_id: 'AR-0001',
      title: 'Figura sentada',
      artist: 'ROTILI',
      execution_date: '1965',
      series: 'Figuras',
      technique: 'óleo sobre lienzo',
      height_cm: 92,
      width_cm: 73,
      active: true,
    },
    ...over,
  }
}

const DOSSIER = {
  title: 'Selección para galería',
  cover_text: 'Las medidas son sin marco.',
  show_prices: false,
  show_index: false,
}
const FUNDS = [
  { code: 'ROTILI' as const, name: 'Alberto Rotili', biography: 'Nació en Badajoz.\n\nPintó del natural.', cv: '1985 · Badajoz\n\n1979 · Cáceres' },
]

/** Las páginas planificadas: la página y la sección a la que pertenece. */
function planned(items: readonly DossierItemRow[], over: Partial<typeof DOSSIER> = {}) {
  return dossierPages({
    dossier: { ...DOSSIER, ...over },
    recipientName: 'Galería Serrano',
    date: '11 de agosto de 2026',
    items,
    funds: FUNDS,
  })
}

/** Solo las páginas, que es lo que mira casi todo este fichero. */
function pages(items: readonly DossierItemRow[], over: Partial<typeof DOSSIER> = {}) {
  return planned(items, over).map((entry) => entry.page)
}

describe('la portada y el recuento de páginas', () => {
  it('la primera página es siempre la portada, con lo que se le escribió', () => {
    const [cover] = pages([])
    expect(cover).toEqual({
      kind: 'COVER',
      title: 'Selección para galería',
      recipient: 'Galería Serrano',
      date: '11 de agosto de 2026',
      blurb: 'Las medidas son sin marco.',
    })
  })

  it('una obra por página, que es la maqueta elegida', () => {
    const result = pages([item({ id: 'a' }), item({ id: 'b' }), item({ id: 'c' })])
    expect(result).toHaveLength(4)
    expect(result.slice(1).every((page) => page.kind === 'ARTWORK')).toBe(true)
  })

  it('el orden del PDF es el orden de la pantalla', () => {
    const result = pages([
      item({ id: 'b', catalog_id: 'AR-0002', sort_order: 2 }),
      item({ id: 'a', catalog_id: 'AR-0001', sort_order: 1 }),
    ])
    expect(result.slice(1).map((page) => (page.kind === 'ARTWORK' ? page.catalogId : ''))).toEqual([
      'AR-0001',
      'AR-0002',
    ])
  })
})

describe('dónde caen los textos (RF-1614)', () => {
  it('un rótulo encabeza la página de la obra que viene detrás', () => {
    const result = pages([
      item({ id: 't', kind: 'TEXT', catalog_id: null, artwork: null, heading: 'Óleos', sort_order: 1 }),
      item({ id: 'a', sort_order: 2 }),
    ])
    // Dos páginas y no tres: el texto no se queda con una para él.
    expect(result).toHaveLength(2)
    const page = result[1]
    expect(page?.kind).toBe('ARTWORK')
    if (page?.kind === 'ARTWORK') expect(page.texts).toEqual([{ heading: 'Óleos', body: '' }])
  })

  it('dos textos seguidos se pegan los dos a la misma obra', () => {
    const result = pages([
      item({ id: 't1', kind: 'TEXT', catalog_id: null, artwork: null, heading: 'Óleos', sort_order: 1 }),
      item({ id: 't2', kind: 'TEXT', catalog_id: null, artwork: null, body: 'Tres sin enmarcar.', sort_order: 2 }),
      item({ id: 'a', sort_order: 3 }),
    ])
    expect(result).toHaveLength(2)
    const page = result[1]
    if (page?.kind === 'ARTWORK') expect(page.texts).toHaveLength(2)
  })

  it('un texto sin obra detrás se queda con su propia página', () => {
    const result = pages([
      item({ id: 'a', sort_order: 1 }),
      item({ id: 't', kind: 'TEXT', catalog_id: null, artwork: null, body: 'Disponibilidad hasta octubre.', sort_order: 2 }),
    ])
    expect(result.map((page) => page.kind)).toEqual(['COVER', 'ARTWORK', 'TEXTS'])
  })

  it('el rótulo de una sección sobrevive a la obra que no se puede imprimir', () => {
    // Si el texto se perdiera con ella, la sección siguiente saldría sin título y
    // nadie lo notaría hasta abrir el PDF.
    const retirada = { ...item().artwork!, active: false }
    const result = pages([
      item({ id: 't', kind: 'TEXT', catalog_id: null, artwork: null, heading: 'Óleos', sort_order: 1 }),
      item({ id: 'mala', artwork: retirada, sort_order: 2 }),
      item({ id: 'buena', sort_order: 3 }),
    ])
    expect(result).toHaveLength(2)
    const page = result[1]
    if (page?.kind === 'ARTWORK') {
      expect(page.texts).toEqual([{ heading: 'Óleos', body: '' }])
      expect(page.catalogId).toBe('AR-0001')
    }
  })
})

describe('las secciones en el PDF (RF-1619, RF-1620, RF-1621)', () => {
  const section = (id: string, heading: string, order: number, divider: boolean) =>
    item({
      id,
      kind: 'SECTION',
      catalog_id: null,
      artwork: null,
      heading,
      divider_page: divider,
      sort_order: order,
    })

  it('sin portadilla, el rótulo encabeza la página de su primera obra', () => {
    const result = pages([section('s', 'Óleos', 1, false), item({ id: 'a', sort_order: 2 })])
    // Dos páginas: la sección no gasta una hoja.
    expect(result.map((page) => page.kind)).toEqual(['COVER', 'ARTWORK'])
    const page = result[1]
    if (page?.kind === 'ARTWORK') expect(page.texts[0]?.heading).toBe('Óleos')
  })

  it('con portadilla, el rótulo se lleva una hoja para él', () => {
    const result = pages([section('s', 'Óleos', 1, true), item({ id: 'a', sort_order: 2 })])
    expect(result.map((page) => page.kind)).toEqual(['COVER', 'DIVIDER', 'ARTWORK'])
    const divider = result[1]
    if (divider?.kind === 'DIVIDER') expect(divider.heading).toBe('Óleos')
    // Y la obra ya no lleva el rótulo encima: se ha impreso en su portadilla.
    const page = result[2]
    if (page?.kind === 'ARTWORK') expect(page.texts).toEqual([])
  })

  it('la sección viaja en todas sus páginas, que es lo que necesita el pie (RF-1620)', () => {
    const result = planned([
      section('s1', 'Óleos', 1, false),
      item({ id: 'a', sort_order: 2 }),
      item({ id: 'b', sort_order: 3 }),
      section('s2', 'Papel', 4, true),
      item({ id: 'c', sort_order: 5 }),
    ])
    expect(result.map((entry) => entry.section)).toEqual([
      null, // la portada no es de ninguna sección
      'Óleos',
      'Óleos',
      'Papel', // la portadilla
      'Papel',
    ])
  })

  it('los textos que esperaban salen ANTES de la portadilla', () => {
    // Se pusieron delante del rótulo, y quien los movió ahí quería leerlos primero.
    const result = pages([
      item({ id: 't', kind: 'TEXT', catalog_id: null, artwork: null, body: 'Presentación.', sort_order: 1 }),
      section('s', 'Óleos', 2, true),
      item({ id: 'a', sort_order: 3 }),
    ])
    expect(result.map((page) => page.kind)).toEqual(['COVER', 'TEXTS', 'DIVIDER', 'ARTWORK'])
  })

  it('un dossier que solo lleva secciones no se puede emitir', () => {
    // Una portada y una portadilla son dos hojas con títulos y nada dentro.
    expect(issueBlockedReason(planned([section('s', 'Óleos', 1, true)]))).not.toBeNull()
  })
})

describe('el índice (RF-1622)', () => {
  const section = (id: string, heading: string, order: number, divider = false) =>
    item({
      id,
      kind: 'SECTION',
      catalog_id: null,
      artwork: null,
      heading,
      divider_page: divider,
      sort_order: order,
    })

  const rows = [
    section('s1', 'Óleos', 1),
    item({ id: 'a', sort_order: 2 }),
    item({ id: 'b', sort_order: 3 }),
    section('s2', 'Papel', 4),
    item({ id: 'c', sort_order: 5 }),
  ]

  it('apagado no se pinta', () => {
    expect(pages(rows).some((page) => page.kind === 'INDEX')).toBe(false)
  })

  it('encendido va detrás de la portada, que es donde se busca', () => {
    const result = pages(rows, { show_index: true })
    expect(result.map((page) => page.kind)).toEqual([
      'COVER',
      'INDEX',
      'ARTWORK',
      'ARTWORK',
      'ARTWORK',
    ])
  })

  it('cada entrada dice cuántas obras lleva y en qué página empieza, ya corrida', () => {
    // El número tiene que contar el propio índice: si no, todas las referencias
    // apuntarían una página antes y el índice sería exactamente inútil.
    const result = pages(rows, { show_index: true })
    const index = result[1]
    expect(index?.kind).toBe('INDEX')
    if (index?.kind === 'INDEX') {
      expect(index.entries).toEqual([
        { heading: 'Óleos', artworkCount: 2, page: 3 },
        { heading: 'Papel', artworkCount: 1, page: 5 },
      ])
    }
  })

  it('sin secciones no se pinta aunque esté encendido', () => {
    // Un índice de una sola entrada sin nombre es una hoja gastada.
    expect(
      pages([item({ id: 'a' })], { show_index: true }).some((page) => page.kind === 'INDEX'),
    ).toBe(false)
  })
})

describe('lo que no se imprime (RF-1613)', () => {
  it('una obra retirada del catálogo no sale', () => {
    const retirada = { ...item().artwork!, active: false }
    expect(pages([item({ artwork: retirada })])).toHaveLength(1)
  })

  it('un elemento quitado del dossier tampoco', () => {
    expect(pages([item({ active: false })])).toHaveLength(1)
  })

  it('una obra cuya ficha no se pudo leer no se imprime a medias', () => {
    // Una página con un código y sin datos es peor que no imprimirla.
    expect(pages([item({ artwork: null })])).toHaveLength(1)
  })
})

describe('la biografía (RF-1616, RF-1617)', () => {
  const bio = (over: Partial<DossierItemRow> = {}) =>
    item({
      kind: 'BIOGRAPHY',
      catalog_id: null,
      artwork: null,
      artist_fund: 'ROTILI',
      with_cv: true,
      ...over,
    })

  it('tiene su propia página, con la prosa en párrafos y el currículum en líneas', () => {
    const result = pages([bio()])
    expect(result).toHaveLength(2)
    const page = result[1]
    expect(page?.kind).toBe('BIOGRAPHY')
    if (page?.kind === 'BIOGRAPHY') {
      expect(page.heading).toBe('Alberto Rotili')
      expect(page.paragraphs).toEqual(['Nació en Badajoz.', 'Pintó del natural.'])
      expect(page.cv).toEqual(['1985 · Badajoz', '1979 · Cáceres'])
    }
  })

  it('sin currículum pedido, no lo lleva', () => {
    const result = pages([bio({ with_cv: false })])
    const page = result[1]
    if (page?.kind === 'BIOGRAPHY') expect(page.cv).toEqual([])
  })

  it('el rótulo escrito manda sobre el nombre del fondo', () => {
    const result = pages([bio({ heading: 'Alberto Rotili, 1928-2009' })])
    const page = result[1]
    if (page?.kind === 'BIOGRAPHY') expect(page.heading).toBe('Alberto Rotili, 1928-2009')
  })

  it('un fondo sin biografía escrita no imprime una página en blanco con título', () => {
    const result = dossierPages({
      dossier: DOSSIER,
      recipientName: '',
      date: 'hoy',
      items: [bio()],
      funds: [{ code: 'ROTILI', name: 'Alberto Rotili', biography: '  ', cv: '' }],
    })
    expect(result).toHaveLength(1)
  })
})

describe('el pie de cada obra', () => {
  it('lleva el código, el título, los datos y el precio', () => {
    const caption = artworkCaption(item({ price: 4500 }), { showPrices: true })
    expect(caption.code).toBe('AR-0001')
    expect(caption.title).toBe('Figura sentada')
    expect(caption.facts).toBe('1965 · óleo sobre lienzo · 92 × 73 cm')
    expect(caption.price).toContain('4500')
  })

  it('el precio NO sale si el dossier no imprime precios, y eso se decide aquí', () => {
    // Un pie que lleva un precio que el dossier esconde está a un fallo de
    // imprimirlo.
    expect(artworkCaption(item({ price: 4500 }), { showPrices: false }).price).toBeNull()
  })

  it('lo que falta se calla en vez de decir «sin fecha»', () => {
    const artwork = {
      ...item().artwork!,
      execution_date: '',
      technique: '',
      height_cm: null,
      width_cm: null,
    }
    expect(artworkCaption(item({ artwork }), { showPrices: false }).facts).toBe('')
  })

  it('el dato dudoso sí se imprime, tal como se escribió', () => {
    const artwork = { ...item().artwork!, execution_date: '[1966?]' }
    expect(artworkCaption(item({ artwork }), { showPrices: false }).facts).toContain('[1966?]')
  })
})

describe('los párrafos y las líneas', () => {
  it('un salto de línea suelto no parte un párrafo; dos sí', () => {
    expect(paragraphsOf('uno\ndos\n\ntres')).toEqual(['uno dos', 'tres'])
  })

  it('el currículum es una línea por entrada, y las vacías se caen', () => {
    expect(cvLines('1985 · X\n\n  \n1979 · Y')).toEqual(['1985 · X', '1979 · Y'])
  })
})

describe('el pie de página y el nombre del fichero', () => {
  it('el pie dice de qué dossier es la hoja y dónde estás', () => {
    // Una hoja suelta tiene que decir a qué pertenece, y el recuento delata un PDF
    // que ha llegado truncado.
    expect(footerText('Selección', 3, 14)).toEqual({ left: 'Selección', right: '3 de 14' })
  })

  it('la ruta va bajo dossiers/ y NO lleva la versión', () => {
    // La versión la pone la base: una calculada aquí sería una adivinanza, y dos
    // personas emitiendo a la vez adivinarían la misma.
    const path = issuePath('8f3a', 'k3m9p2qz')
    expect(path).toBe('dossiers/8f3a_k3m9p2qz.pdf')
    expect(path).not.toContain('v1')
  })

  it('el nombre de descarga es legible y lleva la versión', () => {
    expect(issueFileName('Selección para la Galería Serrano', 2)).toBe(
      'seleccion-para-la-galeria-serrano-v2.pdf',
    )
    expect(issueFileName('  ', 1)).toBe('dossier-v1.pdf')
  })
})

describe('cuándo no se puede emitir', () => {
  it('un dossier vacío no se emite: una portada sola es un documento que se manda sin querer', () => {
    expect(issueBlockedReason(planned([]))).toContain('nada que imprimir')
  })

  it('con solo obras retiradas lo dice nombrando ese motivo, no «vacío»', () => {
    const retirada = { ...item().artwork!, active: false }
    const reason = issueBlockedReason(planned([item({ artwork: retirada })]))
    expect(reason).toContain('retiradas')
  })

  it('con una obra imprimible no bloquea', () => {
    expect(issueBlockedReason(planned([item()]))).toBeNull()
  })
})
