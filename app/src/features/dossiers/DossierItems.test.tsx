// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DossierItem } from '../../lib/types'
import { DossierItems } from './DossierItems'
import type { DossierItemRow } from './dossierItems'

/**
 * RF-1619, RF-1620: que las flechas de una sección se puedan pulsar, y que muevan la
 * sección sin llevarse nada.
 *
 * Este fichero existe por una incidencia que tuvo dos mitades. La primera fue **la
 * condición que apaga el botón**: la banda contaba secciones y se apagaba en la
 * primera y en la última, así que la única sección de un dossier salía con las dos
 * flechas grises. La segunda apareció al arreglar eso: subirla se apropiaba de todas
 * las obras que tenía delante, porque la pertenencia era la posición.
 *
 * Un aserto sobre `movedSectionOrder` no habría visto ni la una ni la otra: la función
 * devolvía bien lo que se le pedía, y quien decidía mal era la pantalla.
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
      title: 'Figura sentada',
      artist: 'ROTILI',
      execution_date: '1965',
      series: 'Óleos',
      technique: 'óleo sobre lienzo',
      height_cm: 92,
      width_cm: 73,
      active: true,
    },
    ...over,
  }
}

/** Lo que la usuaria tenía delante: dos obras sueltas, un rótulo y una obra dentro. */
const rows: DossierItemRow[] = [
  item({ id: 'h', sort_order: 1 }),
  item({ id: 'i', sort_order: 2 }),
  item({
    id: 's1',
    kind: 'SECTION',
    catalog_id: null,
    artwork: null,
    heading: 'Óleos',
    divider_page: false,
    sort_order: 3,
  }),
  item({ id: 'a', sort_order: 4, section_item_id: 's1' }),
]

const handlers = () => ({
  onMove: vi.fn(async () => null),
  onMoveSection: vi.fn(async () => null),
  onSetSection: vi.fn(async () => null),
})

function paint(spies = handlers()) {
  render(
    <MemoryRouter>
      <DossierItems
        items={rows}
        thumbnails={{}}
        loading={false}
        error={null}
        canEdit
        showPrices={false}
        onMove={spies.onMove}
        onMoveSection={spies.onMoveSection}
        onSetSection={spies.onSetSection}
        onEdit={vi.fn(async () => null)}
        onRemove={vi.fn(async () => null)}
      />
    </MemoryRouter>,
  )
  return spies
}

/** La flecha por su rótulo de accesibilidad, que es el mismo por el que se pulsa. */
const arrow = (label: string): HTMLButtonElement =>
  screen.getByLabelText(label) as HTMLButtonElement

afterEach(() => {
  vi.restoreAllMocks()
})

describe('las flechas de una sección (RF-1620)', () => {
  it('la única sección de un dossier se puede subir por encima de lo que va suelto', () => {
    paint()
    expect(arrow('Subir la sección entera').disabled).toBe(false)
    // Abajo no hay nada: la sección llega al final del dossier.
    expect(arrow('Bajar la sección entera').disabled).toBe(true)
  })

  it('subir mueve la sección y no pregunta nada, porque no se lleva ninguna obra', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const spies = paint()
    arrow('Subir la sección entera').click()
    expect(spies.onMoveSection).toHaveBeenCalledWith('s1', 'up')
    expect(confirm).not.toHaveBeenCalled()
  })
})

describe('la sección de un elemento se elige, no se deduce (RF-1619)', () => {
  it('cada fila dice en qué sección está, y «Suelta» es una opción', () => {
    paint()
    const selects = screen.getAllByLabelText('Sección de este elemento') as HTMLSelectElement[]
    // Tres elementos: dos obras sueltas y la que está dentro de «Óleos».
    expect(selects).toHaveLength(3)
    expect(selects.map((select) => select.value)).toEqual(['', '', 's1'])
    expect([...(selects[0]?.options ?? [])].map((option) => option.text)).toEqual([
      'Suelta',
      'Óleos',
    ])
  })

  it('elegir una sección la escribe, que es la forma de meter una obra en un bloque', () => {
    const spies = paint()
    const select = screen.getAllByLabelText('Sección de este elemento')[0] as HTMLSelectElement
    select.value = 's1'
    select.dispatchEvent(new Event('change', { bubbles: true }))
    expect(spies.onSetSection).toHaveBeenCalledWith('h', 's1')
  })

  it('y «Suelta» la saca', () => {
    const spies = paint()
    const select = screen.getAllByLabelText('Sección de este elemento')[2] as HTMLSelectElement
    select.value = ''
    select.dispatchEvent(new Event('change', { bubbles: true }))
    expect(spies.onSetSection).toHaveBeenCalledWith('a', null)
  })

  it('una obra dentro de una sección no se sale con las flechas', () => {
    // Es una sección de una sola obra: dentro no hay a dónde ir, y salir de ella es
    // el selector.
    paint()
    const ups = screen.getAllByLabelText('Subir un puesto') as HTMLButtonElement[]
    expect(ups[ups.length - 1]?.disabled).toBe(true)
  })
})
