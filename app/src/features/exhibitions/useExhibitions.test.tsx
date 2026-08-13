// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ExhibitionRow } from '../documentary/documentaryRows'
import { saveExhibitionsSnapshot } from './exhibitionsCache'
import { useExhibitions } from './useExhibitions'

/**
 * RNF-106: cambiar a la pestaña de Exposiciones es instantáneo.
 *
 * Este fichero existe por lo que se veía: **«Cargando las exposiciones…» cada vez**. La
 * consulta es pequeña, pero pequeña no es instantánea desde un almacén, y una pestaña que
 * se abre veinte veces al día no puede esperar veinte veces por lo mismo.
 *
 * Lo que se comprueba es justo lo que un test del espejo no alcanza: que el gancho **pinta
 * antes de preguntar** y que la respuesta corrige por detrás. La consulta se deja colgada a
 * propósito —se resuelve cuando el test quiere— porque si contestara al instante los dos
 * estados serían indistinguibles y el test pasaría con y sin espejo.
 */

/** La consulta, colgada hasta que el test la suelta. */
let answer: (rows: ExhibitionRow[]) => void
let pending: Promise<{ data: ExhibitionRow[]; error: null }>

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => pending,
    }),
  },
}))

const row = (id: string, title: string): ExhibitionRow =>
  ({
    id,
    title,
    exhibition_type: 'INDIVIDUAL',
    venue_id: null,
    venue_note: '',
    year: 1985,
    start_date: null,
    end_date: null,
    date_note: '',
    catalogue_published: 'UNREVIEWED',
    catalogue_reference_id: null,
    note: '',
    poster_thumbnail_path: null,
    poster_derivative_path: null,
    poster_uploaded_at: null,
    active: true,
    venue: null,
  }) as ExhibitionRow

function Caso() {
  const { exhibitions, loading } = useExhibitions()
  return (
    <>
      <p data-testid="estado">{loading ? 'esperando' : 'pintado'}</p>
      <ul>
        {exhibitions.map((each) => (
          <li key={each.id}>{each.title}</li>
        ))}
      </ul>
    </>
  )
}

beforeEach(() => {
  window.localStorage.clear()
  pending = new Promise((resolve) => {
    answer = (rows) => resolve({ data: rows, error: null })
  })
})

afterEach(() => {
  window.localStorage.clear()
})

describe('el listado de exposiciones se pinta del espejo', () => {
  it('con espejo no espera: pinta en el primer fotograma y refresca por detrás', async () => {
    saveExhibitionsSnapshot([row('ex-1', 'Rotili. Obra reciente')], window.localStorage)

    render(<Caso />)

    // Antes de que la consulta conteste: la lista está en pantalla y no hay espera.
    expect(screen.getByTestId('estado').textContent).toBe('pintado')
    expect(screen.getByText('Rotili. Obra reciente')).not.toBeNull()

    // Y lo que contesta la base sustituye a lo pintado.
    answer([row('ex-1', 'Rotili. Obra reciente'), row('ex-2', 'Colectiva de primavera')])
    await waitFor(() => expect(screen.getByText('Colectiva de primavera')).not.toBeNull())
  })

  it('sin espejo sí espera, que es lo que el aviso está para decir', async () => {
    render(<Caso />)
    expect(screen.getByTestId('estado').textContent).toBe('esperando')

    answer([row('ex-1', 'Rotili. Obra reciente')])
    await waitFor(() => expect(screen.getByTestId('estado').textContent).toBe('pintado'))
  })

  it('y lo que contesta la base queda en el espejo para la vez siguiente', async () => {
    render(<Caso />)
    answer([row('ex-9', 'Muestra de un día')])
    await waitFor(() => expect(screen.getByText('Muestra de un día')).not.toBeNull())

    const stored = window.localStorage.getItem('catalogador.exhibitions-mirror')
    expect(stored).toContain('Muestra de un día')
  })
})
