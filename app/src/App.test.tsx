// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from './App'
import { AuthProvider } from './auth/AuthContext'
import { rememberRole } from './auth/rememberedRole'

/**
 * Las puertas de la aplicación: sin sesión, sin contraseña elegida y **sin acceso**
 * (RF-101, RF-112, RF-1107).
 *
 * La tercera es la mitad honesta del candado que retira el acceso a alguien. La base deja
 * de devolverle una sola fila del catálogo —eso está probado en `user_management.test.sql`,
 * autenticándose de verdad—, y sin esta pantalla lo que esa persona vería sería la
 * aplicación entera **vacía**: listados sin filas, fichas que no cargan, ni un motivo.
 * Aquí se comprueba que en su lugar lee una frase que lo dice, y que quien sí entra no la
 * ve nunca.
 *
 * Se monta la aplicación entera y no un trozo, porque lo que se prueba es justamente el
 * orden de esas puertas.
 */

/** El perfil que contesta la base. Lo que cambia entre un caso y otro. */
let perfil: { id: string; email: string; name: string; role: string; active: boolean } | null = null

vi.mock('./lib/supabase', () => {
  const builder = (single: unknown): Record<string, unknown> => {
    const constructor: Record<string, unknown> = {}
    for (const metodo of ['select', 'eq', 'order', 'limit', 'in', 'update']) {
      constructor[metodo] = () => constructor
    }
    constructor.then = (resolve: (v: unknown) => unknown) => resolve({ data: [], error: null })
    constructor.single = async () => ({ data: single, error: null })
    constructor.maybeSingle = async () => ({ data: single, error: null })
    return constructor
  }
  return {
    supabase: {
      auth: {
        getSession: async () => ({ data: { session: { user: { id: 'u-1' } } } }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
        signOut: async () => ({ error: null }),
      },
      from: (tabla: string) => builder(tabla === 'profiles' ? perfil : null),
      rpc: async () => ({ data: null, error: null }),
      channel: () => ({ on: () => ({ subscribe: () => ({}) }) }),
      removeChannel: () => {},
      functions: { invoke: async () => ({ data: null, error: null }) },
    },
  }
})

vi.mock('./features/artworks/photoQueue', () => ({
  saveQueue: async () => {},
  readQueue: async () => [],
  rehydrate: async () => [],
  clearQueue: async () => {},
}))

function pintar() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  window.localStorage.clear()
  window.sessionStorage.clear()
  perfil = { id: 'u-1', email: 'rita@local', name: 'Rita', role: 'CATALOGER', active: true }
})

afterEach(() => {
  window.localStorage.clear()
  window.sessionStorage.clear()
})

describe('a quien se le ha retirado el acceso', () => {
  it('lee que su cuenta no entra, en vez de un catálogo vacío', async () => {
    perfil = { ...perfil!, active: false }

    pintar()

    await waitFor(() =>
      expect(screen.getByText('Tu cuenta no entra al catálogo')).not.toBeNull(),
    )
    // Y no se le pinta el catálogo detrás: ni el menú de abajo.
    expect(screen.queryByRole('navigation', { name: 'Navegación principal' })).toBeNull()
  })

  it('con la salida de cerrar sesión, que es lo siguiente que va a hacer', async () => {
    // En un teléfono compartido, lo que sigue es dejar entrar a otra persona.
    perfil = { ...perfil!, active: false }

    pintar()

    await waitFor(() => expect(screen.getByRole('button', { name: /sesión/i })).not.toBeNull())
  })
})

describe('y a quien sí entra', () => {
  it('no se le enseña esa pantalla ni un fotograma', async () => {
    // Mientras el perfil viaja no se sabe si entra, y acusar de no entrar a quien sí lo
    // hace sería peor que esperar: por eso «tiene acceso» es lo que se supone hasta que la
    // base diga otra cosa. Con el papel recordado, además, el menú está desde el principio.
    rememberRole('u-1', 'CATALOGER')

    pintar()

    expect(screen.queryByText('Tu cuenta no entra al catálogo')).toBeNull()
    await waitFor(() =>
      expect(screen.getByRole('navigation', { name: 'Navegación principal' })).not.toBeNull(),
    )
    expect(screen.queryByText('Tu cuenta no entra al catálogo')).toBeNull()
  })
})
