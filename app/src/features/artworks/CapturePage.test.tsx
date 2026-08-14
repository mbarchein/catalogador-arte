// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '../../auth/AuthContext'
import { rememberRole } from '../../auth/rememberedRole'
import { CapturePage } from './CapturePage'
import { EMPTY_DATE } from '../../lib/structuredDate'
import { saveBatch } from './batch'

/**
 * El botón de cambiar lo fijo del lote.
 *
 * La cabecera es lo que se lee de un vistazo con la obra delante —el fondo, el tipo, la
 * serie y el siguiente número—, y una palabra a su derecha se lleva el ancho que necesita
 * la línea del medio, que es la que se trunca.
 */

/** La consulta del siguiente identificador, que esta pantalla lanza al abrirse. */
const siguiente = Promise.resolve({ data: 'AR-0043', error: null })

vi.mock('../../lib/supabase', () => {
  /** El constructor de consultas de PostgREST: todo devuelve lo mismo y contesta vacío. */
  const builder = (single: unknown) => {
    const constructor: Record<string, unknown> = {}
    for (const metodo of ['select', 'eq', 'order', 'limit', 'in']) {
      constructor[metodo] = () => constructor
    }
    constructor.then = (resolve: (v: unknown) => unknown) => resolve({ data: [], error: null })
    constructor.single = async () => ({ data: single, error: null })
    return constructor
  }
  // El perfil sí contesta, y contesta que cataloga: sin eso la pantalla enseña «no tienes
  // permiso», que es lo correcto y no es lo que este fichero mira.
  const perfil = { id: 'u-1', email: 'a@b.c', name: 'A', role: 'CATALOGER' }
  return {
    supabase: {
      auth: {
        getSession: async () => ({ data: { session: { user: { id: 'u-1' } } } }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      },
      from: (tabla: string) => builder(tabla === 'profiles' ? perfil : null),
      rpc: () => siguiente,
      channel: () => ({ on: () => ({ subscribe: () => ({}) }) }),
      removeChannel: () => {},
    },
  }
})

// La cola de fotografías vive en IndexedDB, que no está aquí y que esta pantalla no
// necesita para decir su cabecera.
vi.mock('./photoQueue', () => ({
  saveQueue: async () => {},
  readQueue: async () => [],
  rehydrate: async () => [],
  clearQueue: async () => {},
}))

function pintar() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <CapturePage />
      </AuthProvider>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  window.localStorage.clear()
  // Con el papel recordado la pantalla se pinta en el primer fotograma, sin su espera.
  rememberRole('u-1', 'CATALOGER')
  // Un lote ya abierto, que es donde vive la cabecera.
  saveBatch({
    fixed: { artist: 'ROTILI', artworkType: 'Óleo', series: '' },
    carried: { date: EMPTY_DATE, technique: '', placeId: null },
  })
})

afterEach(() => {
  window.localStorage.clear()
})

describe('cambiar lo fijo del lote', () => {
  it('es un icono con su rótulo, y no la palabra «Cambiar»', async () => {
    pintar()

    const boton = await screen.findByRole('button', { name: 'Cambiar lo fijo del lote' })
    // El rótulo lo lleva `aria-label`: en pantalla es el lápiz, que es el mismo gesto de
    // corregir del resto de la aplicación.
    expect(boton.textContent?.trim()).toBe('')
    expect(boton.querySelector('svg')).not.toBeNull()
    expect(screen.queryByRole('button', { name: 'Cambiar' })).toBeNull()
  })
})
