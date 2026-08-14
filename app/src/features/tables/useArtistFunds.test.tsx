// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { saveHiddenFunds, readHiddenFunds } from './artistFundsCache'
import { useArtistFunds } from './useArtistFunds'

/**
 * RNF-106: el listado de obras no se recompone después de pintarse.
 *
 * La incidencia: **al cambiar a «Obras» salía el catálogo entero y un momento después
 * desaparecían las obras del fondo de pruebas**, cambiando la cuenta y las filas bajo la
 * vista. El listado pinta al instante de su espejo; qué fondos están apartados venía de
 * esta consulta, y hasta que contestaba no había ninguno apartado.
 *
 * La consulta se deja **colgada a propósito**: es el fotograma que estaba mal, y si
 * contestara al instante el test pasaría con memoria y sin ella.
 */

/** La consulta de los fondos, colgada hasta que el test la suelta. */
let responder: (rows: unknown[]) => void
let pendiente: Promise<{ data: unknown; error: null }>

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => pendiente,
    }),
  },
}))

const fund = (code: string, hide: boolean) => ({
  id: `f-${code}`,
  code,
  prefix: code.slice(0, 2),
  name: code,
  active: true,
  hide_artworks: hide,
  biography: '',
  cv: '',
})

function Caso() {
  const { hiddenFunds, entries } = useArtistFunds()
  return (
    <p>
      <span data-testid="apartados">{[...hiddenFunds].sort().join(',') || 'ninguno'}</span>·
      <span data-testid="filas">{entries.length}</span>
    </p>
  )
}

beforeEach(() => {
  window.localStorage.clear()
  pendiente = new Promise((resolve) => {
    responder = (rows) => resolve({ data: rows, error: null })
  })
})

afterEach(() => {
  window.localStorage.clear()
})

describe('qué fondos están apartados, antes de preguntar', () => {
  it('con memoria, desde el primer fotograma', () => {
    saveHiddenFunds(['TEST'])

    render(<Caso />)

    // Y sin filas todavía: lo que se recuerda es solo esto, no la tabla.
    expect(screen.getByTestId('apartados').textContent).toBe('TEST')
    expect(screen.getByTestId('filas').textContent).toBe('0')
  })

  it('sin memoria, ninguno hasta que contesta: es lo que se veía', async () => {
    render(<Caso />)
    expect(screen.getByTestId('apartados').textContent).toBe('ninguno')

    responder([fund('ROTILI', false), fund('TEST', true)])
    await waitFor(() => expect(screen.getByTestId('apartados').textContent).toBe('TEST'))
  })

  it('y lo que contesta la base queda guardado para la vez siguiente', async () => {
    render(<Caso />)
    responder([fund('ROTILI', false), fund('TEST', true)])

    await waitFor(() => expect(readHiddenFunds()).toEqual(new Set(['TEST'])))
  })

  it('un fondo que deja de estar apartado vuelve al listado en cuanto contesta', async () => {
    // La otra mitad: sin ella, quitar el interruptor no se vería hasta borrar el espejo,
    // y las obras seguirían fuera del listado sin motivo visible.
    saveHiddenFunds(['TEST'])

    render(<Caso />)
    expect(screen.getByTestId('apartados').textContent).toBe('TEST')

    responder([fund('ROTILI', false), fund('TEST', false)])
    await waitFor(() => expect(screen.getByTestId('apartados').textContent).toBe('ninguno'))
    expect(readHiddenFunds()).toEqual(new Set())
  })
})
