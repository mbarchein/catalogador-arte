// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '../../auth/AuthContext'
import { rememberRole } from '../../auth/rememberedRole'
import { CapturePage } from './CapturePage'
import { EMPTY_DATE } from '../../lib/structuredDate'
import { saveBatch } from './batch'
import { saveNextIds } from './nextCatalogId'

/**
 * La cabecera del lote: el siguiente número, y el botón de cambiar lo fijo.
 *
 * **El número se lee y se copia**: es el que se escribe en la etiqueta que se pega a la
 * obra. Venía de un viaje de ida y vuelta, así que aparecía un momento después de la
 * pantalla —la línea creciendo bajo el pulgar— y tras guardar cada obra seguía enseñando
 * el número recién usado hasta que llegaba la respuesta siguiente, que es la peor versión
 * de un parpadeo: no un hueco, un dato equivocado en el sitio del bueno.
 *
 * La consulta se deja **colgada a propósito**: es el fotograma que estaba mal.
 */

/** La consulta del siguiente identificador, colgada hasta que el test la suelta. */
let responder: (id: string) => void
let siguiente: Promise<{ data: unknown; error: null }>

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
  siguiente = new Promise((resolve) => {
    responder = (id) => resolve({ data: id, error: null })
  })
})

afterEach(() => {
  window.localStorage.clear()
})

describe('el siguiente número de la cabecera', () => {
  it('con memoria está desde el primer fotograma, sin esperar a la consulta', async () => {
    saveNextIds({ ROTILI: 'AR-0043' })

    pintar()

    await waitFor(() => expect(screen.getByText(/siguiente AR-0043/)).not.toBeNull())
    // Y sigue ahí cuando la base confirma: lo que contesta es lo mismo.
    responder('AR-0043')
    await waitFor(() => expect(screen.getByText(/siguiente AR-0043/)).not.toBeNull())
  })

  it('y lo que contesta la base manda: corrige el recordado', async () => {
    // Otra persona ha creado una obra desde otro teléfono, que es justo lo que la memoria
    // no puede saber.
    saveNextIds({ ROTILI: 'AR-0043' })

    pintar()
    await waitFor(() => expect(screen.getByText(/siguiente AR-0043/)).not.toBeNull())

    responder('AR-0050')
    await waitFor(() => expect(screen.getByText(/siguiente AR-0050/)).not.toBeNull())
  })

  it('el número de otro fondo no se enseña sobre este lote', async () => {
    // Se recuerda por fondo: un número compartido pondría el de Rotili sobre un lote de
    // pruebas, y ése es el número que se copia en una etiqueta física.
    saveNextIds({ TEST: 'TS-0007' })

    pintar()

    await waitFor(() => expect(screen.getByText(/Fijo en este lote/)).not.toBeNull())
    expect(screen.queryByText(/siguiente TS-0007/)).toBeNull()
  })
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
