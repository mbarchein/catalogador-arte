import { describe, expect, it } from 'vitest'
import type { DossierItem } from '../../lib/types'
import type { DossierItemRow } from './dossierItems'
import {
  NO_SERIES_SECTION,
  currentOrder,
  dossierGroups,
  groupCountText,
  groupedNotice,
  groupedOrder,
  movedSectionOrder,
  orphanNotice,
  seriesGroupPlan,
  seriesNames,
} from './dossierSections'

/**
 * RF-1619, RF-1620, RF-1623: las secciones de un dossier.
 *
 * Lo que este fichero protege es **la pertenencia implícita**: una sección son su
 * rótulo y todo lo que viene detrás. Si eso se interpretara de otra forma en algún
 * sitio, el dossier seguiría generándose con los bloques en otro lado y nadie lo
 * vería hasta abrir el PDF.
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

const artwork = (id: string, series: string, order: number): DossierItemRow => {
  const row = item({ id, catalog_id: `AR-${id}`, sort_order: order })
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

describe('los grupos salen de la posición y de nada más (RF-1619)', () => {
  it('una sección son su rótulo y lo que viene detrás hasta el siguiente', () => {
    const rows = [
      section('s1', 'Óleos', 1),
      artwork('a', 'Óleos', 2),
      artwork('b', 'Óleos', 3),
      section('s2', 'Papel', 4),
      artwork('c', 'Papel', 5),
    ]
    const groups = dossierGroups(rows)
    expect(groups.map((group) => group.heading)).toEqual(['Óleos', 'Papel'])
    expect(groups[0]?.items.map((row) => row.id)).toEqual(['a', 'b'])
    expect(groups[1]?.items.map((row) => row.id)).toEqual(['c'])
  })

  it('sin secciones hay un solo grupo, y no tiene rótulo', () => {
    const groups = dossierGroups([artwork('a', '', 1), artwork('b', '', 2)])
    expect(groups).toHaveLength(1)
    expect(groups[0]?.sectionId).toBeNull()
    expect(groups[0]?.heading).toBeNull()
  })

  it('lo que va antes de la primera sección es un grupo huérfano', () => {
    const groups = dossierGroups([artwork('a', '', 1), section('s1', 'Óleos', 2), artwork('b', '', 3)])
    expect(groups.map((group) => group.heading)).toEqual([null, 'Óleos'])
  })

  it('una sección retirada deja de agrupar: sus obras pasan a la anterior', () => {
    // Es lo que se ve en el PDF —el rótulo no se imprime—, así que es lo que la
    // pantalla tiene que enseñar.
    const rows = [
      section('s1', 'Óleos', 1),
      artwork('a', 'Óleos', 2),
      section('s2', 'Papel', 3, false),
      artwork('b', 'Papel', 4),
    ]
    const retirada = rows.map((row) => (row.id === 's2' ? { ...row, active: false } : row))
    const groups = dossierGroups(retirada)
    expect(groups).toHaveLength(1)
    expect(groups[0]?.heading).toBe('Óleos')
    // La fila retirada sigue en la lista, para que la pantalla la pinte en gris.
    expect(groups[0]?.items.map((row) => row.id)).toEqual(['a', 's2', 'b'])
  })

  it('cuenta las obras activas, y solo las obras', () => {
    const rows = [
      section('s1', 'Óleos', 1),
      artwork('a', 'Óleos', 2),
      { ...artwork('b', 'Óleos', 3), active: false },
      item({ id: 't', kind: 'TEXT', catalog_id: null, artwork: null, body: 'x', sort_order: 4 }),
    ]
    expect(dossierGroups(rows)[0]?.artworkCount).toBe(1)
    expect(groupCountText(dossierGroups(rows)[0]!)).toBe('1 obra')
  })

  it('una sección sin obras lo dice, en vez de llevar un cero', () => {
    expect(groupCountText(dossierGroups([section('s1', 'Óleos', 1)])[0]!)).toBe('sin obras')
  })
})

describe('las obras huérfanas se avisan (RF-1619)', () => {
  it('cuando ya hay secciones y algo se ha quedado delante', () => {
    const groups = dossierGroups([artwork('a', '', 1), section('s1', 'Óleos', 2)])
    expect(orphanNotice(groups)).toContain('antes de la primera sección')
  })

  it('sin secciones no hay nada que avisar: el dossier entero va antes de nada', () => {
    expect(orphanNotice(dossierGroups([artwork('a', '', 1)]))).toBeNull()
  })

  it('con la primera sección al principio tampoco', () => {
    const groups = dossierGroups([section('s1', 'Óleos', 1), artwork('a', '', 2)])
    expect(orphanNotice(groups)).toBeNull()
  })
})

describe('mover una sección entera (RF-1620)', () => {
  const rows = [
    section('s1', 'Óleos', 1),
    artwork('a', 'Óleos', 2),
    artwork('b', 'Óleos', 3),
    section('s2', 'Papel', 4),
    artwork('c', 'Papel', 5),
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

  it('el grupo de las huérfanas no se mueve, porque no es una sección', () => {
    // «Subir lo que va antes de todo» no significa nada, y la primera sección real
    // no tiene con quién cambiarse.
    const conHuerfanas = [artwork('h', '', 0), ...rows]
    expect(movedSectionOrder(conHuerfanas, 's1', 'up')).toBeNull()
    // Bajar sí, y las huérfanas se quedan delante.
    expect(movedSectionOrder(conHuerfanas, 's1', 'down')).toEqual([
      'h',
      's2',
      'c',
      's1',
      'a',
      'b',
    ])
  })

  it('los retirados no entran en el orden que se manda a la base', () => {
    const conRetirada = rows.map((row) => (row.id === 'b' ? { ...row, active: false } : row))
    expect(movedSectionOrder(conRetirada, 's2', 'up')).toEqual(['s2', 'c', 's1', 'a'])
    expect(currentOrder(conRetirada)).toEqual(['s1', 'a', 's2', 'c'])
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

  it('el orden final pone cada obra bajo su sección, respetando el orden que ya tenían', () => {
    const order = groupedOrder(rows, { Óleos: 's1', Papel: 's2' })
    expect(order).toEqual(['s1', 'a', 'c', 's2', 'b'])
  })

  it('los textos y las biografías se quedan al principio y no se meten en ninguna serie', () => {
    // No pertenecen a ninguna, y moverlos a una sería inventar una pertenencia que
    // nadie ha decidido.
    const conTexto = [
      item({ id: 't', kind: 'TEXT', catalog_id: null, artwork: null, body: 'Presentación.', sort_order: 0 }),
      ...rows,
    ]
    expect(groupedOrder(conTexto, { Óleos: 's1', Papel: 's2' })).toEqual([
      't',
      's1',
      'a',
      'c',
      's2',
      'b',
    ])
  })

  it('un rótulo escrito a mano que no es ninguna serie se conserva al final', () => {
    // Perderlo sería borrar un rótulo que alguien escribió, y reordenar exige la
    // lista completa de todas formas.
    const conAjena = [...rows, section('sx', 'Notas', 9)]
    const order = groupedOrder(conAjena, { Óleos: 's1', Papel: 's2' })
    expect(order).toContain('sx')
    expect(order[order.length - 1]).toBe('sx')
  })

  it('las obras retiradas no entran en el orden', () => {
    const conRetirada = rows.map((row) => (row.id === 'c' ? { ...row, active: false } : row))
    expect(groupedOrder(conRetirada, { Óleos: 's1', Papel: 's2' })).toEqual(['s1', 'a', 's2', 'b'])
  })

  it('lo que se dice después nombra las secciones y recuerda que se corrigen a mano', () => {
    expect(groupedNotice([])).toContain('ya estaban agrupadas')
    expect(groupedNotice(['Óleos'])).toContain('Óleos')
    expect(groupedNotice(['Óleos', 'Papel'])).toContain('2 secciones')
  })
})
