// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DossierItem } from '../../lib/types'
import { DossierItems } from './DossierItems'
import type { DossierItemRow } from './dossierItems'

/**
 * RF-1620: que las flechas de una sección se puedan pulsar.
 *
 * Este fichero existe por una incidencia, y la incidencia no estaba en el cálculo del
 * orden sino **en la condición que apaga el botón**: la banda contaba secciones y se
 * apagaba en la primera y en la última, así que la única sección de un dossier —se
 * añade un rótulo, se le meten dos obras— salía con las dos flechas grises y no había
 * ninguna forma de moverla. Un aserto sobre `movedSectionOrder` no lo habría visto:
 * la función devolvía bien lo que se le pedía, y quien decidía mal era la pantalla.
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
  item({ id: 'a', sort_order: 4 }),
]

function paint(onMoveSection = vi.fn(async () => null)) {
  render(
    <MemoryRouter>
      <DossierItems
        items={rows}
        thumbnails={{}}
        loading={false}
        error={null}
        canEdit
        showPrices={false}
        onMove={vi.fn(async () => null)}
        onMoveSection={onMoveSection}
        onEdit={vi.fn(async () => null)}
        onRemove={vi.fn(async () => null)}
      />
    </MemoryRouter>,
  )
  return onMoveSection
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

  it('subir avisa de las obras que quedarán dentro, y mueve la sección entera', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const onMoveSection = paint()
    arrow('Subir la sección entera').click()
    expect(confirm.mock.calls[0]?.[0]).toContain('2 obras')
    expect(onMoveSection).toHaveBeenCalledWith('s1', 'up')
  })

  it('y si se dice que no, no se escribe nada', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    const onMoveSection = paint()
    arrow('Subir la sección entera').click()
    expect(onMoveSection).not.toHaveBeenCalled()
  })
})
