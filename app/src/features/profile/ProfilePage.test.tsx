// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react'
import { fireEvent } from '@testing-library/dom'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '../../auth/AuthContext'
import { ProfilePage } from './ProfilePage'

/**
 * La tarjeta de la cuenta: el nombre y la contraseña (RF-109, RF-112).
 *
 * Lo que se fija aquí es lo que un icono sin rótulo se lleva por delante si nadie lo
 * vigila: **su nombre accesible**. Un lápiz solo dice qué hace a quien lo ve, y esta
 * pantalla la abre también quien usa lector de pantalla o quien navega con teclado. Y
 * cuál de los tres datos corrige lo dice su sitio —pegado al nombre—, no el dibujo.
 */

let escrito: Record<string, unknown> | null = null
const perfil = { id: 'u-1', email: 'rita@local', name: 'Rita', role: 'READER', active: true }

vi.mock('../../lib/supabase', () => {
  const builder = (): Record<string, unknown> => {
    const constructor: Record<string, unknown> = {}
    constructor.select = () => constructor
    constructor.eq = () => constructor
    constructor.update = (patch: Record<string, unknown>) => {
      escrito = patch
      return constructor
    }
    constructor.single = async () => ({
      data: escrito === null ? perfil : { ...perfil, ...escrito },
      error: null,
    })
    constructor.then = (resolve: (v: unknown) => unknown) =>
      resolve({ data: [{ id: 'u-1' }], error: null })
    return constructor
  }
  return {
    supabase: {
      auth: {
        getSession: async () => ({ data: { session: { user: { id: 'u-1' } } } }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      },
      from: () => builder(),
    },
  }
})

function pintar() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <ProfilePage />
      </AuthProvider>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  // jsdom no trae `matchMedia`, y el bloque de instalación pregunta por él para saber si
  // la aplicación corre ya instalada. Se repone aquí: el que falta es el navegador de
  // mentira, no la aplicación.
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia
  escrito = null
  window.localStorage.clear()
})

afterEach(() => {
  window.localStorage.clear()
})

describe('el nombre se corrige desde su propia fila', () => {
  it('el botón es solo el icono, y aun así tiene nombre', async () => {
    pintar()

    const boton = await screen.findByRole('button', { name: 'Cambiar el nombre' })
    // Sin texto a la vista y con dibujo: eso es «solo icono». El rótulo va en
    // `aria-label`, que es lo que lo mantiene pulsable para quien no ve el lápiz.
    expect(boton.textContent?.trim()).toBe('')
    expect(boton.querySelector('svg')).not.toBeNull()
  })

  it('y está pegado al nombre, que es lo que dice cuál de los tres datos corrige', async () => {
    pintar()

    // Se espera al perfil: hasta que contesta, la fila dice «Sin indicar», que es lo
    // correcto —nunca un hueco— pero no es lo que este aserto mira.
    await screen.findByText('Rita')
    const fila = screen.getByRole('button', { name: 'Cambiar el nombre' }).closest('div')
    expect(fila?.textContent).toContain('Nombre')
    expect(fila?.textContent).toContain('Rita')
  })

  it('abre el campo y lo que se guarda llega a la base', async () => {
    pintar()

    fireEvent.click(await screen.findByRole('button', { name: 'Cambiar el nombre' }))
    const campo = await screen.findByLabelText('Nombre completo')
    fireEvent.change(campo, { target: { value: 'Rita Pérez' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))

    await waitFor(() => expect(escrito).toEqual({ name: 'Rita Pérez' }))
  })
})

describe('la contraseña', () => {
  it('es un botón con su rótulo, y lleva a su pantalla', async () => {
    // Con rótulo y no solo icono: nada en la fila dice de qué contraseña se habla, y un
    // candado a secas se lee como un aviso de bloqueo.
    pintar()

    const enlace = await screen.findByRole('link', { name: /Cambiar la contraseña/ })
    expect(enlace.getAttribute('href')).toBe('/reset-password')
  })
})
