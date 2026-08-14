// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider, useEditingAccess } from '../auth/AuthContext'
import { rememberRole } from '../auth/rememberedRole'
import { FooterMenu } from './FooterMenu'

/**
 * El menú de abajo no se rehace después de abrir (RNF-106).
 *
 * La incidencia: **abría con tres pestañas y se convertía en cinco un momento después.**
 * «Añadir» y «Tablas» solo existen para quien puede editar, y el papel llega en una
 * consulta aparte que va DETRÁS de la sesión, así que las etiquetas se movían bajo el
 * pulgar que ya estaba bajando — en la navegación principal, que es el único sitio de la
 * aplicación donde una pestaña no puede moverse de su hueco.
 *
 * La consulta del perfil se deja **colgada a propósito**: es el fotograma que estaba mal,
 * y si contestara al instante el test pasaría con memoria y sin ella.
 */

/** La consulta del perfil, colgada hasta que el test la suelta. */
let responder: (role: string) => void
let perfil: Promise<{ data: unknown; error: null }>

const session = { user: { id: 'u-1' } }

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: async () => ({ data: { session } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      signOut: async () => ({ error: null }),
    },
    from: () => ({
      select: () => ({
        eq: () => ({ single: () => perfil }),
      }),
    }),
  },
}))

function Menu() {
  return (
    <MemoryRouter>
      <AuthProvider>
        <FooterMenu />
      </AuthProvider>
    </MemoryRouter>
  )
}

function Acceso() {
  return (
    <MemoryRouter>
      <AuthProvider>
        <Puerta />
      </AuthProvider>
    </MemoryRouter>
  )
}

function Puerta() {
  return <p data-testid="acceso">{useEditingAccess()}</p>
}

/** Las etiquetas de las pestañas, en su orden. */
const pestanas = () =>
  screen.getAllByRole('link').map((link) => link.textContent?.replace(/\s+/g, ' ').trim())

beforeEach(() => {
  window.localStorage.clear()
  perfil = new Promise((resolve) => {
    responder = (role) => resolve({ data: { id: 'u-1', email: 'a@b.c', name: 'A', role }, error: null })
  })
})

afterEach(() => {
  window.localStorage.clear()
})

describe('las cinco pestañas de quien cataloga están desde el principio', () => {
  it('con el papel recordado, sin esperar a la consulta del perfil', async () => {
    rememberRole('u-1', 'CATALOGER')

    render(<Menu />)

    // En cuanto hay sesión —y antes de que el perfil conteste— las cinco están puestas.
    await waitFor(() => expect(pestanas()).toHaveLength(5))
    expect(pestanas()).toEqual(['Obras', 'Exposiciones', 'Añadir', 'Tablas', 'Mi perfil'])

    // Y lo que contesta la base no las mueve.
    responder('CATALOGER')
    await waitFor(() => expect(pestanas()).toHaveLength(5))
  })

  it('sin nada recordado son tres hasta que contesta, que es lo que se veía', async () => {
    render(<Menu />)

    await waitFor(() => expect(pestanas()).toHaveLength(3))
    expect(pestanas()).toEqual(['Obras', 'Exposiciones', 'Mi perfil'])

    responder('CATALOGER')
    await waitFor(() => expect(pestanas()).toHaveLength(5))
  })

  it('el papel de otro usuario no abre este menú', async () => {
    // Dos personas comparten el teléfono: lo recordado es de quien salió.
    rememberRole('u-9', 'CATALOGER')

    render(<Menu />)

    await waitFor(() => expect(pestanas()).toHaveLength(3))
  })

  it('y un papel que la base retira desaparece en cuanto contesta', async () => {
    // La memoria ofrece, la base manda: sin esto, quien deja de catalogar seguiría con
    // las pestañas puestas hasta recargar.
    rememberRole('u-1', 'CATALOGER')

    render(<Menu />)
    await waitFor(() => expect(pestanas()).toHaveLength(5))

    responder('READER')
    await waitFor(() => expect(pestanas()).toEqual(['Obras', 'Exposiciones', 'Mi perfil']))
  })
})

describe('lo recordado ofrece y nunca niega', () => {
  it('«Tablas» se abre sin su espera cuando el papel está recordado', async () => {
    rememberRole('u-1', 'CATALOGER')

    render(<Acceso />)

    await waitFor(() => expect(screen.getByTestId('acceso').textContent).toBe('allowed'))
  })

  it('pero un lector recordado espera la respuesta en vez de que se le eche', async () => {
    // Negar de memoria echaría de la pantalla a quien acaban de nombrar Catalogador, y
    // una expulsión es peor que una espera. Negar es siempre respuesta de la base.
    rememberRole('u-1', 'READER')

    render(<Acceso />)

    expect(screen.getByTestId('acceso').textContent).toBe('loading')
    responder('CATALOGER')
    await waitFor(() => expect(screen.getByTestId('acceso').textContent).toBe('allowed'))
  })

  it('y con la respuesta puesta, un lector es un no', async () => {
    render(<Acceso />)
    responder('READER')
    await waitFor(() => expect(screen.getByTestId('acceso').textContent).toBe('denied'))
  })
})
