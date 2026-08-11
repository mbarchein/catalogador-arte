import { describe, expect, it } from 'vitest'
import type { DossierItem } from '../../lib/types'
import {
  DOSSIER_ITEM_COLUMNS,
  itemCountText,
  itemEntries,
  itemEntry,
  itemsNotice,
  measurementsText,
  priceText,
  sortItems,
  type DossierItemRow,
} from './dossierItems'

/**
 * RF-1602, RF-1603, RF-1604, RF-1613, RF-1614, RF-1616: what a dossier holds, in
 * order, and what each item says.
 *
 * The single list is the decision this file protects: three kinds share one order,
 * and the way that breaks is a kind that paints as an empty row or a position that
 * counts the withdrawn items.
 */

let next = 1
function item(over: Partial<DossierItemRow> = {}): DossierItemRow {
  const base: DossierItem = {
    id: `i${next++}`,
    dossier_id: 'd1',
    kind: 'ARTWORK',
    sort_order: 1,
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

describe('las columnas que se piden (RF-1602)', () => {
  it('están todas las que el tipo promete', () => {
    // Un campo que la consulta olvida llega como `undefined` con el tipo
    // prometiendo un valor, que es el fallo que ya costó las esquinas de una
    // fotografía en este proyecto.
    for (const column of [
      'kind',
      'sort_order',
      'catalog_id',
      'image_id',
      'price',
      'currency',
      'note',
      'heading',
      'body',
      'artist_fund',
      'with_cv',
      'divider_page',
      'active',
    ]) {
      expect(DOSSIER_ITEM_COLUMNS).toContain(column)
    }
    expect(DOSSIER_ITEM_COLUMNS).toContain('artwork:artworks(')
  })

  it('trae las medidas, porque la fila las pinta', () => {
    expect(DOSSIER_ITEM_COLUMNS).toContain('height_cm')
    expect(DOSSIER_ITEM_COLUMNS).toContain('width_cm')
  })
})

describe('el orden es el del PDF (RF-1603)', () => {
  it('se ordena por sort_order y no por el orden de llegada', () => {
    const rows = [
      item({ id: 'c', sort_order: 3 }),
      item({ id: 'a', sort_order: 1 }),
      item({ id: 'b', sort_order: 2 }),
    ]
    expect(sortItems(rows).map((row) => row.id)).toEqual(['a', 'b', 'c'])
  })

  it('dos retirados con el mismo número no se cruzan entre dos cargas', () => {
    // Un elemento retirado conserva el número muerto que tenía, así que empatar es
    // posible; el identificador rompe el empate siempre igual.
    const rows = [
      item({ id: 'z', sort_order: 2, active: false }),
      item({ id: 'y', sort_order: 2, active: false }),
    ]
    expect(sortItems(rows).map((row) => row.id)).toEqual(['y', 'z'])
  })

  it('la posición cuenta solo los activos, y un retirado no tiene ninguna', () => {
    const entries = itemEntries([
      item({ id: 'a', sort_order: 1 }),
      item({ id: 'b', sort_order: 2, active: false }),
      item({ id: 'c', sort_order: 3 }),
    ])
    expect(entries.map((entry) => entry.position)).toEqual([1, null, 2])
  })

})

// El orden que se manda a la base y el movimiento de un elemento se comprueban en
// `dossierSections.test.ts`: los dos dependen de la sección de cada fila, y una
// permuta ciega de identificadores no dice nada sobre ninguno de los dos.

describe('el precio es del dossier (RF-1604)', () => {
  it('se lee en euros y a la española: coma decimal y el símbolo detrás', () => {
    // `4500` sale SIN punto de millar y no es un fallo: el español agrupa a partir
    // de cinco cifras (`minimumGroupingDigits: 2` en CLDR), así que 4500 se escribe
    // «4500,00 €» y 45000 se escribe «45.000,00 €». Medido, y comprobado en los dos
    // lados para que nadie lo «arregle» metiendo el punto a mano.
    expect(priceText(4500, 'EUR')).toContain('4500,00')
    expect(priceText(45000, 'EUR')).toContain('45.000,00')
    expect(priceText(4500, 'EUR')).toContain('€')
  })

  it('sin precio es null y nunca cero', () => {
    // Cero sería un precio que nadie ha pedido.
    expect(priceText(null, 'EUR')).toBeNull()
  })

  it('una moneda que no existe no tira la lista abajo', () => {
    expect(priceText(100, 'XXXXX')).toContain('100')
  })
})

describe('lo que dice cada elemento', () => {
  it('una obra: título, artista, fecha, técnica y medidas', () => {
    const entry = itemEntry(item({ price: 4500 }), { position: 1 })
    expect(entry.title).toBe('Figura sentada')
    expect(entry.subtitle).toBe('Alberto Rotili · 1965 · óleo sobre lienzo · 92 × 73 cm')
    expect(entry.price).toContain('4500')
    expect(entry.catalogId).toBe('AR-0001')
  })

  it('una obra cuya ficha no se puede leer se dice, no se pinta en blanco', () => {
    const entry = itemEntry(item({ artwork: null }), { position: 1 })
    expect(entry.title).toBe('Obra no disponible')
    expect(entry.subtitle).toContain('no se puede leer')
  })

  it('un texto con rótulo NO es una sección: eso es otro tipo desde que existe', () => {
    const conRotulo = itemEntry(
      item({ kind: 'TEXT', catalog_id: null, artwork: null, heading: 'Óleos', body: 'Tres.' }),
      { position: 1 },
    )
    expect(conRotulo.title).toBe('Óleos')
    // Llamarlo «rótulo de sección» prometería que agrupa lo que viene detrás, y no
    // agrupa: eso lo hace una sección de verdad.
    expect(conRotulo.subtitle).toBe('Texto con rótulo')
    expect(conRotulo.body).toBe('Tres.')

    const suelto = itemEntry(
      item({ kind: 'TEXT', catalog_id: null, artwork: null, body: 'Un párrafo.' }),
      { position: 2 },
    )
    expect(suelto.title).toBe('Párrafo')
    expect(suelto.subtitle).toBe('Texto libre')
  })

  it('una biografía dice de quién es y si lleva currículum', () => {
    const conCv = itemEntry(
      item({
        kind: 'BIOGRAPHY',
        catalog_id: null,
        artwork: null,
        artist_fund: 'ROTILI',
        with_cv: true,
      }),
      { position: 1 },
    )
    expect(conCv.title).toBe('Alberto Rotili')
    expect(conCv.subtitle).toBe('Biografía y currículum')

    const sinCv = itemEntry(
      item({
        kind: 'BIOGRAPHY',
        catalog_id: null,
        artwork: null,
        artist_fund: 'ROTILI',
        with_cv: false,
        heading: 'Alberto Rotili, 1928-2009',
      }),
      { position: 1 },
    )
    expect(sinCv.title).toBe('Alberto Rotili, 1928-2009')
    expect(sinCv.subtitle).toBe('Biografía, sin el currículum')
  })

  it('ningún tipo se queda sin título ni sin segunda línea', () => {
    // Es el fallo del que protege el `switch` exhaustivo: un tipo nuevo que se
    // pinta como una fila vacía.
    const rows = [
      item({ id: 'a' }),
      item({ id: 'b', kind: 'TEXT', catalog_id: null, artwork: null, body: 'x' }),
      item({
        id: 'c',
        kind: 'BIOGRAPHY',
        catalog_id: null,
        artwork: null,
        artist_fund: 'RUIZ_CAMPINS',
        with_cv: true,
      }),
      item({
        id: 'd',
        kind: 'SECTION',
        catalog_id: null,
        artwork: null,
        heading: 'Óleos',
        divider_page: false,
      }),
    ]
    for (const entry of itemEntries(rows)) {
      expect(entry.title.length).toBeGreaterThan(0)
      expect(entry.subtitle.length).toBeGreaterThan(0)
    }
  })
})

describe('lo retirado se dice, no se esconde (RF-1613)', () => {
  it('el elemento quitado explica que vuelve con su nota y su precio', () => {
    const entry = itemEntry(item({ active: false }), { position: null })
    expect(entry.retired).toBe(true)
    expect(entry.retirementNotice).toContain('vuelve con su nota')
  })

  it('una obra retirada del catálogo sigue en la lista y avisa de que no sale en el PDF', () => {
    const artwork = { ...item().artwork!, active: false }
    const entry = itemEntry(item({ artwork }), { position: 1 })
    expect(entry.retired).toBe(false)
    expect(entry.retirementNotice).toContain('no saldrá en el PDF')
  })

  it('cuando las dos cosas están retiradas gana la del elemento, que es de lo que habla la fila', () => {
    const artwork = { ...item().artwork!, active: false }
    const entry = itemEntry(item({ active: false, artwork }), { position: null })
    expect(entry.retirementNotice).toContain('Quitada de este dossier')
  })
})

describe('las medidas', () => {
  it('alto por ancho, que es la convención del catálogo', () => {
    expect(measurementsText({ height_cm: 92, width_cm: 73 })).toBe('92 × 73 cm')
  })

  it('con una sola medida se dice cuál es', () => {
    expect(measurementsText({ height_cm: 92, width_cm: null })).toBe('92 cm de alto')
    expect(measurementsText({ height_cm: null, width_cm: 73 })).toBe('73 cm de ancho')
  })

  it('sin medidas no inventa un hueco', () => {
    expect(measurementsText({ height_cm: null, width_cm: null })).toBe('')
  })

  it('los decimales que no se leen no se escriben', () => {
    expect(measurementsText({ height_cm: 54, width_cm: 45.5 })).toBe('54 × 45,5 cm')
  })
})

describe('cuántas páginas va a tener esto', () => {
  it('cuenta por tipos y solo los activos', () => {
    const rows = [
      item({ id: 'a' }),
      item({ id: 'b' }),
      item({ id: 'c', active: false }),
      item({ id: 'd', kind: 'TEXT', catalog_id: null, artwork: null, body: 'x' }),
      item({
        id: 'e',
        kind: 'BIOGRAPHY',
        catalog_id: null,
        artwork: null,
        artist_fund: 'ROTILI',
        with_cv: true,
      }),
    ]
    expect(itemCountText(rows)).toBe('2 obras · 1 texto · 1 biografía')
  })

  it('el singular es singular', () => {
    expect(itemCountText([item()])).toBe('1 obra')
  })

  it('un tipo sin nada no se escribe como cero', () => {
    expect(itemCountText([item()])).not.toContain('0')
  })

  it('vacío es una palabra y no un cero', () => {
    expect(itemCountText([])).toBe('Vacío')
  })
})

describe('nunca una lista en blanco (RF-304)', () => {
  it('el dossier vacío dice qué hacer', () => {
    const notice = itemsNotice({ loading: false, error: null, count: 0 })
    expect(notice).toContain('vacío')
    expect(notice).toContain('Añade')
  })

  it('mientras carga lo dice', () => {
    expect(itemsNotice({ loading: true, error: null, count: 0 })).toContain('Cargando')
  })

  it('tras un fallo no afirma nada: el error tiene su propia línea', () => {
    expect(itemsNotice({ loading: false, error: 'algo', count: 0 })).toBeNull()
  })

  it('con filas no dice nada', () => {
    expect(itemsNotice({ loading: false, error: null, count: 3 })).toBeNull()
  })
})
