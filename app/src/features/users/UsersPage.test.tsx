// @vitest-environment jsdom
import { render, screen, waitFor, within } from '@testing-library/react'
import { fireEvent } from '@testing-library/dom'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '../../auth/AuthContext'
import { rememberRole } from '../../auth/rememberedRole'
import { UsersPage } from './UsersPage'

/**
 * La pantalla del equipo (RF-1107, RF-104, RF-108).
 *
 * Lo que se comprueba aquí es el cable, no las decisiones: que solo entra quien administra,
 * que lo que se pulsa llega a la base **como un cambio de esa fila y no de otra**, y que
 * cuando la base contesta «cero filas» —lo que de verdad recibe quien no administra— la
 * pantalla NO dice que se haya cambiado nada. Esa última es la que importa: en esta
 * pantalla, un aviso de éxito falso significa creer que alguien tiene permisos que no
 * tiene.
 *
 * Las decisiones —el orden, lo que se ofrece de cada fila, las frases— están en
 * `team.test.ts` y en `userMessages.test.ts`. Y quién puede de verdad, en
 * `user_management.test.sql`, autenticándose como usuario de cada rol.
 */

/** Lo que la base ha recibido, para poder mirarlo. */
const escrito: { id?: string; patch?: Record<string, unknown> }[] = []
/** Cuántas filas contesta el update. Cero es el caso que engaña. */
let filasTocadas = 1
let rolDelPerfil = 'SUPERUSER'

const equipo = () => [
  { id: 'u-1', email: 'super@local', name: 'Berta', role: 'SUPERUSER', active: true },
  { id: 'u-2', email: 'catal@local', name: 'Rita', role: 'CATALOGER', active: true },
  { id: 'u-3', email: 'fuera@local', name: 'Zoe', role: 'READER', active: false },
]

vi.mock('../../lib/supabase', () => {
  const perfil = () => ({
    id: 'u-1',
    email: 'super@local',
    name: 'Berta',
    role: rolDelPerfil,
    active: true,
  })
  return {
    supabase: {
      auth: {
        getSession: async () => ({ data: { session: { user: { id: 'u-1' } } } }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      },
      from: () => {
        const constructor: Record<string, unknown> = {}
        let pendiente: { id?: string; patch?: Record<string, unknown> } | null = null
        constructor.select = () => constructor
        constructor.update = (patch: Record<string, unknown>) => {
          pendiente = { patch }
          escrito.push(pendiente)
          return constructor
        }
        constructor.eq = (_col: string, value: string) => {
          if (pendiente) pendiente.id = value
          return constructor
        }
        constructor.single = async () => ({ data: perfil(), error: null })
        constructor.then = (resolve: (v: unknown) => unknown) =>
          resolve(
            pendiente === null
              ? { data: equipo(), error: null }
              : { data: Array.from({ length: filasTocadas }, () => ({ id: pendiente?.id })), error: null },
          )
        return constructor
      },
    },
  }
})

function pintar() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <UsersPage />
      </AuthProvider>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  // jsdom no tiene `scrollIntoView`, y el aviso de fallo se desplaza hasta el error para
  // que no quede fuera de pantalla. Se repone aquí y no en el código: el que falta es el
  // navegador de mentira, no la aplicación.
  Element.prototype.scrollIntoView = () => {}
  window.localStorage.clear()
  escrito.length = 0
  filasTocadas = 1
  rolDelPerfil = 'SUPERUSER'
  rememberRole('u-1', 'SUPERUSER')
})

afterEach(() => {
  window.localStorage.clear()
})

describe('quién entra a la pantalla', () => {
  it('el superusuario ve el equipo entero, con y sin acceso', async () => {
    pintar()

    await waitFor(() => expect(screen.getByText('Rita')).not.toBeNull())
    expect(screen.getByText('Berta')).not.toBeNull()
    // Quien no entra sigue en la lista: es de donde se le devuelve el acceso.
    expect(screen.getByText('Zoe')).not.toBeNull()
    expect(screen.getByText('Sin acceso')).not.toBeNull()
  })

  it('y a quien no administra no se le pinta', async () => {
    // Un catalogador que teclea la dirección. La pantalla lo comprueba además de la fila
    // que lleva hasta aquí: un botón escondido no es una protección.
    rolDelPerfil = 'CATALOGER'
    rememberRole('u-1', 'CATALOGER')

    pintar()

    await waitFor(() => expect(screen.queryByText('Rita')).toBeNull())
    expect(screen.queryByText('Usuarios')).toBeNull()
  })
})

describe('cambiar el rol', () => {
  it('llega a la base como un cambio de ESA fila', async () => {
    pintar()
    await waitFor(() => expect(screen.getByText('Rita')).not.toBeNull())

    // La hoja de Rita, y dentro el rol de solo consulta. Acotado a la hoja: «Lector ·
    // solo consulta» es también la insignia de la fila de quien ya lo es.
    fireEvent.click(screen.getAllByRole('button', { name: 'Cambiar' })[1] as HTMLElement)
    fireEvent.click(within(await screen.findByRole('dialog')).getByText('Lector · solo consulta'))

    await waitFor(() => expect(escrito).toHaveLength(1))
    expect(escrito[0]).toEqual({ id: 'u-2', patch: { role: 'READER' } })
    expect(await screen.findByText(/Rita pasa a Lector/)).not.toBeNull()
  })

  it('y si la base no toca nada, la pantalla NO dice que se cambió', async () => {
    // Es el caso medido: la política filtra la fila de otro y la escritura contesta cero
    // filas sin ningún error. Un aviso de éxito aquí sería creer que alguien tiene
    // permisos que no tiene.
    filasTocadas = 0

    pintar()
    await waitFor(() => expect(screen.getByText('Rita')).not.toBeNull())

    fireEvent.click(screen.getAllByRole('button', { name: 'Cambiar' })[1] as HTMLElement)
    fireEvent.click(within(await screen.findByRole('dialog')).getByText('Lector · solo consulta'))

    await waitFor(() => expect(screen.getByRole('alert')).not.toBeNull())
    expect(screen.getByRole('alert').textContent).toContain('No se ha cambiado nada')
    expect(screen.queryByText(/Rita pasa a/)).toBeNull()
  })
})

describe('quitar el acceso', () => {
  it('pregunta antes, y solo entonces escribe', async () => {
    pintar()
    await waitFor(() => expect(screen.getByText('Rita')).not.toBeNull())

    fireEvent.click(screen.getAllByRole('button', { name: 'Cambiar' })[1] as HTMLElement)
    fireEvent.click(await screen.findByRole('button', { name: 'Quitar el acceso' }))

    // La pregunta nombra a quién, y dice lo que NO pasa: no es un borrado.
    expect(await screen.findByText('¿Quitar el acceso a Rita?')).not.toBeNull()
    expect(escrito).toHaveLength(0)

    fireEvent.click(screen.getByRole('button', { name: 'Sí, quitar' }))
    await waitFor(() => expect(escrito).toHaveLength(1))
    expect(escrito[0]).toEqual({ id: 'u-2', patch: { active: false } })
  })

  it('al último superusuario no se le ofrece, y se dice por qué', async () => {
    pintar()
    await waitFor(() => expect(screen.getByText('Berta')).not.toBeNull())

    // En su fila, la razón; en su hoja, solo su propio rol y el botón desactivado.
    expect(screen.getByText(/único superusuario con acceso/)).not.toBeNull()

    fireEvent.click(screen.getAllByRole('button', { name: 'Cambiar' })[0] as HTMLElement)
    const hoja = within(await screen.findByRole('dialog'))
    expect(hoja.queryByText('Catalogador')).toBeNull()
    expect(hoja.getByRole('button', { name: 'Quitar el acceso' }).hasAttribute('disabled')).toBe(
      true,
    )
  })
})
