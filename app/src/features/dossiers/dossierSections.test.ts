import { describe, expect, it } from 'vitest'
import type { DossierItem } from '../../lib/types'
import type { DossierItemRow } from './dossierItems'
import {
  NO_SERIES_SECTION,
  currentOrder,
  currentSections,
  dossierGroups,
  groupCountText,
  groupedNotice,
  groupedOrder,
  itemSectionPlan,
  movedItemOrder,
  movedSectionOrder,
  orphanNotice,
  seriesGroupPlan,
  seriesNames,
} from './dossierSections'

/**
 * RF-1619, RF-1620, RF-1623: las secciones de un dossier.
 *
 * Lo que este fichero protege es **la pertenencia**, que es una columna y antes era
 * la posición. El cambio salió de una incidencia y no de una idea: con la posición,
 * una sección no se podía mover entre obras sueltas —al ponerla delante se las
 * quedaba— y «suelta detrás de una sección» no era un estado que se pudiera escribir.
 *
 * Así que aquí se comprueban las dos mitades: que mover no cambia de sección a nadie,
 * y que cambiar de sección coloca la fila donde su bloque, porque la base exige que
 * los bloques vayan seguidos y rechaza la lista entera si no.
 */

let next = 1
function item(over: Partial<DossierItemRow> = {}): DossierItemRow {
  const base: DossierItem = {
    id: `i${next++}`,
    dossier_id: 'd1',
    kind: 'ARTWORK',
    sort_order: next,
    catalog_id: `AR-000${next}`,
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
      catalog_id: base.catalog_id ?? 'AR-0001',
      title: 'Obra',
      artist: 'ROTILI',
      execution_date: '1965',
      series: 'Óleos',
      technique: 'óleo',
      height_cm: 92,
      width_cm: 73,
      active: true,
    },
    ...over,
  }
}

/** Una obra: su serie del catálogo, su sitio, y la sección a la que pertenece. */
const artwork = (
  id: string,
  series: string,
  order: number,
  sectionId: string | null = null,
): DossierItemRow => {
  const row = item({ id, catalog_id: `AR-${id}`, sort_order: order, section_item_id: sectionId })
  return { ...row, artwork: { ...row.artwork!, catalog_id: `AR-${id}`, series } }
}

const section = (id: string, heading: string, order: number, divider = false): DossierItemRow =>
  item({
    id,
    kind: 'SECTION',
    catalog_id: null,
    artwork: null,
    heading,
    divider_page: divider,
    sort_order: order,
  })

/**
 * Las filas después de que la base aplique un orden y una pertenencia:
 * `reorder_dossier_items` reescribe `sort_order` 1..n sobre los activos y, si se le
 * pasan las secciones, también la columna. Sirve para comprobar en qué se convierte
 * la lista, y no solo qué se le manda.
 */
const applied = (
  rows: readonly DossierItemRow[],
  plan: { order: readonly string[]; sections?: readonly (string | null)[] },
): DossierItemRow[] =>
  rows.map((row) => {
    const place = plan.order.indexOf(row.id)
    if (place === -1) return row
    const next = { ...row, sort_order: place + 1 }
    if (plan.sections === undefined || row.kind === 'SECTION') return next
    return { ...next, section_item_id: plan.sections[place] ?? null }
  })

/** Lo que hay dentro de cada grupo, para leer una lista de un vistazo. */
const shape = (rows: readonly DossierItemRow[]): string[] =>
  dossierGroups(rows).map(
    (group) => `${group.heading ?? '·'}: ${group.items.map((row) => row.id).join(' ')}`,
  )

describe('los grupos salen de la pertenencia, y ya no de la posición (RF-1619)', () => {
  it('una sección son su rótulo y los elementos que la señalan', () => {
    const rows = [
      section('s1', 'Óleos', 1),
      artwork('a', 'Óleos', 2, 's1'),
      artwork('b', 'Óleos', 3, 's1'),
      section('s2', 'Papel', 4),
      artwork('c', 'Papel', 5, 's2'),
    ]
    const groups = dossierGroups(rows)
    expect(groups.map((group) => group.heading)).toEqual(['Óleos', 'Papel'])
    expect(groups[0]?.items.map((row) => row.id)).toEqual(['a', 'b'])
    expect(groups[1]?.items.map((row) => row.id)).toEqual(['c'])
  })

  it('una obra SUELTA detrás de una sección es un grupo sin rótulo, no parte de ella', () => {
    // Es el estado que el modelo anterior no podía escribir, y por el que una sección
    // no se podía mover sin apropiarse de lo que tenía delante.
    const rows = [
      section('s1', 'Óleos', 1),
      artwork('a', 'Óleos', 2, 's1'),
      artwork('b', '', 3),
    ]
    expect(shape(rows)).toEqual(['Óleos: a', '·: b'])
  })

  it('sin secciones hay un solo grupo, y no tiene rótulo', () => {
    const groups = dossierGroups([artwork('a', '', 1), artwork('b', '', 2)])
    expect(groups).toHaveLength(1)
    expect(groups[0]?.sectionId).toBeNull()
    expect(groups[0]?.heading).toBeNull()
  })

  it('una sección retirada deja de agrupar, aunque sus filas todavía la señalen', () => {
    // La base las suelta al retirarla; esto es el cinturón para las filas que ya
    // estuvieran cargadas en pantalla. Y es lo que se ve en el PDF: el rótulo no se
    // imprime, así que no agrupa.
    const rows = [
      section('s1', 'Óleos', 1),
      artwork('a', 'Óleos', 2, 's1'),
      { ...section('s2', 'Papel', 3), active: false },
      artwork('b', 'Papel', 4, 's2'),
    ]
    const groups = dossierGroups(rows)
    expect(groups.map((group) => group.heading)).toEqual(['Óleos', null])
    // Sus obras salen del bloque: quedan sueltas, que es como se imprimen.
    expect(groups[1]?.items.map((row) => row.id)).toEqual(['b'])
    // Y el rótulo retirado se queda en el grupo en curso, en gris: forzar un grupo
    // nuevo partiría en dos la banda de la sección donde cayera su número muerto.
    expect(groups[0]?.items.map((row) => row.id)).toEqual(['a', 's2'])
  })

  it('cuenta las obras activas, y solo las obras', () => {
    const rows = [
      section('s1', 'Óleos', 1),
      artwork('a', 'Óleos', 2, 's1'),
      { ...artwork('b', 'Óleos', 3, 's1'), active: false },
      item({
        id: 't',
        kind: 'TEXT',
        catalog_id: null,
        artwork: null,
        body: 'x',
        sort_order: 4,
        section_item_id: 's1',
      }),
    ]
    expect(dossierGroups(rows)[0]?.artworkCount).toBe(1)
    expect(groupCountText(dossierGroups(rows)[0]!)).toBe('1 obra')
  })

  it('una sección sin obras lo dice, en vez de llevar un cero', () => {
    expect(groupCountText(dossierGroups([section('s1', 'Óleos', 1)])[0]!)).toBe('sin obras')
  })
})

describe('las obras sueltas se avisan (RF-1619)', () => {
  it('cuando hay secciones y alguna obra se ha quedado fuera', () => {
    const groups = dossierGroups([artwork('a', '', 1), section('s1', 'Óleos', 2)])
    expect(orphanNotice(groups)).toContain('suelta')
  })

  it('las cuenta estén donde estén, delante o detrás de las secciones', () => {
    const groups = dossierGroups([
      artwork('a', '', 1),
      section('s1', 'Óleos', 2),
      artwork('b', 'Óleos', 3, 's1'),
      artwork('c', '', 4),
    ])
    expect(orphanNotice(groups)).toContain('2 obras')
  })

  it('sin secciones no hay nada que avisar: el dossier entero va suelto', () => {
    expect(orphanNotice(dossierGroups([artwork('a', '', 1)]))).toBeNull()
  })

  it('con todas dentro de una sección tampoco', () => {
    const groups = dossierGroups([section('s1', 'Óleos', 1), artwork('a', '', 2, 's1')])
    expect(orphanNotice(groups)).toBeNull()
  })
})

describe('mover una sección entera (RF-1620)', () => {
  const rows = [
    section('s1', 'Óleos', 1),
    artwork('a', 'Óleos', 2, 's1'),
    artwork('b', 'Óleos', 3, 's1'),
    section('s2', 'Papel', 4),
    artwork('c', 'Papel', 5, 's2'),
  ]

  it('sube con sus obras dentro, en un solo orden', () => {
    // Es el movimiento que ahorra los diez toques: la sección y sus obras cambian de
    // sitio juntas.
    expect(movedSectionOrder(rows, 's2', 'up')).toEqual(['s2', 'c', 's1', 'a', 'b'])
  })

  it('y baja igual', () => {
    expect(movedSectionOrder(rows, 's1', 'down')).toEqual(['s2', 'c', 's1', 'a', 'b'])
  })

  it('en los extremos no hay nada que mover', () => {
    expect(movedSectionOrder(rows, 's1', 'up')).toBeNull()
    expect(movedSectionOrder(rows, 's2', 'down')).toBeNull()
  })

  it('se desliza entre las obras sueltas DE UNA EN UNA, y no se queda con ninguna', () => {
    // La incidencia entera, en un aserto: dos obras sueltas delante, un rótulo con dos
    // obras. Antes solo se podía subir apropiándose de las dos sueltas de golpe.
    const conSueltas = [
      artwork('h', '', 1),
      artwork('i', '', 2),
      section('s1', 'Óleos', 3),
      artwork('a', 'Óleos', 4, 's1'),
    ]
    const first = movedSectionOrder(conSueltas, 's1', 'up')
    expect(first).toEqual(['h', 's1', 'a', 'i'])

    const afterFirst = applied(conSueltas, { order: first! })
    expect(shape(afterFirst)).toEqual(['·: h', 'Óleos: a', '·: i'])

    const second = movedSectionOrder(afterFirst, 's1', 'up')
    expect(second).toEqual(['s1', 'a', 'h', 'i'])
    expect(shape(applied(afterFirst, { order: second! }))).toEqual(['Óleos: a', '·: h i'])
  })

  it('y baja entre ellas igual, sin adoptar la que se queda delante', () => {
    const rows = [
      section('s1', 'Óleos', 1),
      artwork('a', 'Óleos', 2, 's1'),
      artwork('h', '', 3),
    ]
    const order = movedSectionOrder(rows, 's1', 'down')
    expect(order).toEqual(['h', 's1', 'a'])
    expect(shape(applied(rows, { order: order! }))).toEqual(['·: h', 'Óleos: a'])
  })

  it('los retirados no entran en el orden que se manda a la base', () => {
    const conRetirada = rows.map((row) => (row.id === 'b' ? { ...row, active: false } : row))
    expect(movedSectionOrder(conRetirada, 's2', 'up')).toEqual(['s2', 'c', 's1', 'a'])
    expect(currentOrder(conRetirada)).toEqual(['s1', 'a', 's2', 'c'])
  })

  it('la pertenencia que se manda con el orden es la que ya había', () => {
    expect(currentSections(rows)).toEqual([null, 's1', 's1', null, 's2'])
  })
})

describe('mover un elemento (RF-1603, RF-1619)', () => {
  const rows = [
    artwork('h', '', 1),
    section('s1', 'Óleos', 2),
    artwork('a', 'Óleos', 3, 's1'),
    artwork('b', 'Óleos', 4, 's1'),
    artwork('i', '', 5),
  ]

  it('dentro de su sección se mueve entre los de su sección', () => {
    expect(movedItemOrder(rows, 'b', 'up')).toEqual(['h', 's1', 'b', 'a', 'i'])
  })

  it('y no se sale de ella con una flecha: eso es cambiar de sección, y se dice aparte', () => {
    // Una flecha que cambiara la pertenencia sin decirlo es justo lo que hacía
    // imposible mover una sección sin que se quedara con lo que tenía delante.
    expect(movedItemOrder(rows, 'a', 'up')).toBeNull()
    expect(movedItemOrder(rows, 'b', 'down')).toBeNull()
  })

  it('una obra suelta cambia con el bloque de al lado, así que salta la sección entera', () => {
    expect(movedItemOrder(rows, 'h', 'down')).toEqual(['s1', 'a', 'b', 'h', 'i'])
    expect(movedItemOrder(rows, 'i', 'up')).toEqual(['h', 'i', 's1', 'a', 'b'])
  })

  it('y sigue suelta al otro lado', () => {
    const order = movedItemOrder(rows, 'h', 'down')
    expect(shape(applied(rows, { order: order! }))).toEqual(['Óleos: a b', '·: h i'])
  })

  it('en los extremos no hay nada que mover', () => {
    expect(movedItemOrder(rows, 'h', 'up')).toBeNull()
    expect(movedItemOrder(rows, 'i', 'down')).toBeNull()
  })
})

describe('meter en una sección y sacar de ella (RF-1619)', () => {
  const rows = [
    artwork('h', '', 1),
    section('s1', 'Óleos', 2),
    artwork('a', 'Óleos', 3, 's1'),
    section('s2', 'Papel', 4),
    artwork('c', 'Papel', 5, 's2'),
  ]

  it('meter una obra suelta la coloca al final del bloque, no donde estaba', () => {
    // El orden y la pertenencia van juntos porque la base exige que los bloques vayan
    // seguidos: cambiar la columna sin colocar la fila sería una escritura rechazada.
    const plan = itemSectionPlan(rows, 'h', 's1')
    expect(plan?.order).toEqual(['s1', 'a', 'h', 's2', 'c'])
    expect(plan?.sections).toEqual([null, 's1', 's1', null, 's2'])
    expect(shape(applied(rows, plan!))).toEqual(['Óleos: a h', 'Papel: c'])
  })

  it('sacarla la deja justo detrás del bloque del que sale, y suelta', () => {
    const plan = itemSectionPlan(rows, 'a', null)
    expect(plan?.order).toEqual(['h', 's1', 'a', 's2', 'c'])
    expect(plan?.sections).toEqual([null, null, null, null, 's2'])
    expect(shape(applied(rows, plan!))).toEqual(['·: h', 'Óleos: ', '·: a', 'Papel: c'])
  })

  it('pasarla de una sección a otra la lleva al final de la que la recibe', () => {
    const plan = itemSectionPlan(rows, 'a', 's2')
    expect(plan?.order).toEqual(['h', 's1', 's2', 'c', 'a'])
    expect(plan?.sections).toEqual([null, null, null, 's2', 's2'])
  })

  it('a una sección vacía cae justo detrás de su rótulo', () => {
    const conVacia = [...rows, section('s3', 'Dibujo', 6)]
    const plan = itemSectionPlan(conVacia, 'h', 's3')
    expect(plan?.order).toEqual(['s1', 'a', 's2', 'c', 's3', 'h'])
  })

  it('donde ya está no se escribe: null y sin gastar una escritura', () => {
    expect(itemSectionPlan(rows, 'a', 's1')).toBeNull()
    expect(itemSectionPlan(rows, 'h', null)).toBeNull()
  })

  it('una sección no se mete en otra, ni se manda nada a una que no está', () => {
    expect(itemSectionPlan(rows, 's1', 's2')).toBeNull()
    expect(itemSectionPlan(rows, 'h', 'sx')).toBeNull()
  })
})

describe('agrupar por serie, de una vez (RF-1623)', () => {
  const rows = [
    artwork('a', 'Óleos', 1),
    artwork('b', 'Papel', 2),
    artwork('c', 'Óleos', 3),
  ]

  it('los rótulos que hacen falta salen de las series, en orden alfabético español', () => {
    expect(seriesNames(rows)).toEqual(['Óleos', 'Papel'])
    expect(seriesGroupPlan(rows)).toEqual({ create: ['Óleos', 'Papel'], blocked: null })
  })

  it('las obras sin serie van a una sección nombrada, y al final', () => {
    const conHuerfana = [...rows, artwork('d', '', 4)]
    expect(seriesNames(conHuerfana)).toEqual(['Óleos', 'Papel', NO_SERIES_SECTION])
  })

  it('una sección que ya existe se reutiliza: agrupar dos veces no duplica nada', () => {
    const conSeccion = [section('s1', 'Óleos', 0), ...rows]
    expect(seriesGroupPlan(conSeccion).create).toEqual(['Papel'])
  })

  it('con todo en una sola serie no hay nada que agrupar, y se dice cuál es', () => {
    const plan = seriesGroupPlan([artwork('a', 'Óleos', 1), artwork('b', 'Óleos', 2)])
    expect(plan.create).toEqual([])
    expect(plan.blocked).toContain('Óleos')
  })

  it('sin obras no hay nada que agrupar', () => {
    expect(seriesGroupPlan([]).blocked).toContain('No hay obras')
  })

  it('coloca cada obra bajo su sección Y la mete en ella, en la misma escritura', () => {
    const plan = groupedOrder(rows, { Óleos: 's1', Papel: 's2' })
    expect(plan.order).toEqual(['s1', 'a', 'c', 's2', 'b'])
    expect(plan.sections).toEqual([null, 's1', 's1', null, 's2'])
  })

  it('los textos y las biografías se quedan al principio, sueltos y sin serie', () => {
    // No pertenecen a ninguna, y meterlos en una sería inventar una pertenencia que
    // nadie ha decidido.
    const conTexto = [
      item({
        id: 't',
        kind: 'TEXT',
        catalog_id: null,
        artwork: null,
        body: 'Presentación.',
        sort_order: 0,
      }),
      ...rows,
    ]
    const plan = groupedOrder(conTexto, { Óleos: 's1', Papel: 's2' })
    expect(plan.order).toEqual(['t', 's1', 'a', 'c', 's2', 'b'])
    expect(plan.sections[0]).toBeNull()
  })

  it('un rótulo escrito a mano que no es ninguna serie se conserva al final', () => {
    // Perderlo sería borrar un rótulo que alguien escribió, y reordenar exige la
    // lista completa de todas formas.
    const conAjena = [...rows, section('sx', 'Notas', 9)]
    const plan = groupedOrder(conAjena, { Óleos: 's1', Papel: 's2' })
    expect(plan.order[plan.order.length - 1]).toBe('sx')
  })

  it('las obras retiradas no entran en el orden', () => {
    const conRetirada = rows.map((row) => (row.id === 'c' ? { ...row, active: false } : row))
    expect(groupedOrder(conRetirada, { Óleos: 's1', Papel: 's2' }).order).toEqual([
      's1',
      'a',
      's2',
      'b',
    ])
  })

  it('lo agrupado queda con los bloques seguidos, que es lo que la base exige', () => {
    const plan = groupedOrder(rows, { Óleos: 's1', Papel: 's2' })
    const after = applied([...rows, section('s1', 'Óleos', 8), section('s2', 'Papel', 9)], plan)
    expect(shape(after)).toEqual(['Óleos: a c', 'Papel: b'])
  })

  it('lo que se dice después nombra las secciones y recuerda que se corrigen a mano', () => {
    expect(groupedNotice([])).toContain('ya estaban agrupadas')
    expect(groupedNotice(['Óleos'])).toContain('Óleos')
    expect(groupedNotice(['Óleos', 'Papel'])).toContain('2 secciones')
  })
})
