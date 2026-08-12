import { describe, expect, it } from 'vitest'
import type { DossierItem } from '../../lib/types'
import type { DossierItemRow } from './dossierItems'
import {
  artworkCaption,
  dossierPages,
  footerText,
  issueBlockedReason,
  issueFileName,
  issuePath,
  textBlocks,
} from './dossierPdfPlan'
import { runsText } from '../../lib/markup'

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
    section_item_id: null,
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
    expect(cover?.kind).toBe('COVER')
    if (cover?.kind === 'COVER') {
      expect(cover.title).toBe('Selección para galería')
      expect(cover.recipient).toBe('Galería Serrano')
      expect(cover.date).toBe('11 de agosto de 2026')
      // La presentación llega ya interpretada, como cualquier texto largo del dossier.
      expect(cover.blurb.map((block) => (block.kind === 'LIST' ? '' : runsText(block.runs)))).toEqual([
        'Las medidas son sin marco.',
      ])
    }
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
    if (page?.kind === 'ARTWORK') expect(page.texts).toEqual([{ heading: 'Óleos', body: [] }])
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
      expect(page.texts).toEqual([{ heading: 'Óleos', body: [] }])
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
    const result = pages([
      section('s', 'Óleos', 1, false),
      item({ id: 'a', sort_order: 2, section_item_id: 's' }),
    ])
    // Dos páginas: la sección no gasta una hoja.
    expect(result.map((page) => page.kind)).toEqual(['COVER', 'ARTWORK'])
    const page = result[1]
    if (page?.kind === 'ARTWORK') expect(page.texts[0]?.heading).toBe('Óleos')
  })

  it('con portadilla, el rótulo se lleva una hoja para él', () => {
    const result = pages([
      section('s', 'Óleos', 1, true),
      item({ id: 'a', sort_order: 2, section_item_id: 's' }),
    ])
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
      item({ id: 'a', sort_order: 2, section_item_id: 's1' }),
      item({ id: 'b', sort_order: 3, section_item_id: 's1' }),
      section('s2', 'Papel', 4, true),
      item({ id: 'c', sort_order: 5, section_item_id: 's2' }),
    ])
    expect(result.map((entry) => entry.section)).toEqual([
      null, // la portada no es de ninguna sección
      'Óleos',
      'Óleos',
      'Papel', // la portadilla
      'Papel',
    ])
  })

  it('y una obra SUELTA detrás de una sección imprime sin rótulo en el pie', () => {
    // La sección de una página sale de la fila y no de recorrer las anteriores, que es
    // lo que hace que «suelta detrás de una sección» exista.
    const result = planned([
      section('s1', 'Óleos', 1, false),
      item({ id: 'a', sort_order: 2, section_item_id: 's1' }),
      item({ id: 'b', sort_order: 3 }),
    ])
    expect(result.map((entry) => entry.section)).toEqual([null, 'Óleos', null])
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
    item({ id: 'a', sort_order: 2, section_item_id: 's1' }),
    item({ id: 'b', sort_order: 3, section_item_id: 's1' }),
    section('s2', 'Papel', 4),
    item({ id: 'c', sort_order: 5, section_item_id: 's2' }),
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

  it('cada entrada dice cuántas obras lleva, y el número de página lo pone quien mide', () => {
    // El plan no numera: una biografía larga ocupa dos hojas y corre todo lo que viene
    // detrás, así que el número solo lo sabe quien dibuja. Lo que sí decide el plan es
    // qué secciones hay, en qué orden y cuántas obras lleva cada una.
    const result = pages(rows, { show_index: true })
    const index = result[1]
    expect(index?.kind).toBe('INDEX')
    if (index?.kind === 'INDEX') {
      expect(index.entries).toEqual([
        { heading: 'Óleos', artworkCount: 2 },
        { heading: 'Papel', artworkCount: 1 },
      ])
    }
  })

  it('y marca qué página abre cada sección, que es de donde el número va a colgar', () => {
    const result = pages(rows, { show_index: true })
    // Con el índice delante: portada, índice, y la primera obra de «Óleos» abre.
    expect(result.map((page) => page.kind)).toEqual(['COVER', 'INDEX', 'ARTWORK', 'ARTWORK', 'ARTWORK'])
    expect(planned(rows, { show_index: true }).filter((entry) => entry.sectionStart === true)).toHaveLength(2)
  })

  it('cuenta las obras de CADA sección, y no las que hay hasta la siguiente', () => {
    // Con obras sueltas por medio, contar en «la última entrada creada» sumaría al
    // bloque páginas que no son suyas.
    const conSueltas = [
      section('s1', 'Óleos', 1),
      item({ id: 'a', sort_order: 2, section_item_id: 's1' }),
      item({ id: 'x', sort_order: 3 }),
      item({ id: 'b', sort_order: 4, section_item_id: 's1' }),
    ]
    const index = pages(conSueltas, { show_index: true })[1]
    if (index?.kind === 'INDEX') {
      expect(index.entries).toEqual([{ heading: 'Óleos', artworkCount: 2 }])
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

  it('tiene su propia página, con la prosa y el currículum ya interpretados', () => {
    const result = pages([bio()])
    expect(result).toHaveLength(2)
    const page = result[1]
    expect(page?.kind).toBe('BIOGRAPHY')
    if (page?.kind === 'BIOGRAPHY') {
      expect(page.heading).toBe('Alberto Rotili')
      expect(page.blocks.map((block) => block.kind)).toEqual(['PARAGRAPH', 'PARAGRAPH'])
      expect(page.blocks.flatMap((block) => (block.kind === 'LIST' ? [] : [runsText(block.runs)]))).toEqual([
        'Nació en Badajoz.',
        'Pintó del natural.',
      ])
      expect(page.cv).toHaveLength(2)
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

describe('los textos largos se interpretan aquí, y solo aquí', () => {
  it('un salto de línea suelto no parte un párrafo; dos sí', () => {
    expect(textBlocks('uno\ndos\n\ntres').map((block) => block.kind)).toEqual([
      'PARAGRAPH',
      'PARAGRAPH',
    ])
  })

  it('y las marcas llegan al plan como bloques: un título, una lista, una negrita', () => {
    // Es lo que permite pegar una biografía de una web y que el PDF la imprima con su
    // forma. El intérprete está en `lib/markup` y tiene su propia batería.
    const blocks = textBlocks('## Exposiciones\n- 1985 · Badajoz\n- 1979 · Cáceres')
    expect(blocks.map((block) => block.kind)).toEqual(['HEADING', 'LIST'])
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
