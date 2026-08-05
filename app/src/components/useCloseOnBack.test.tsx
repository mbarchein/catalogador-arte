// @vitest-environment jsdom
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { useCloseOnBack } from './useCloseOnBack'

/**
 * El «atrás» del móvil cierra el modal de encima y no la pantalla (RNF-106).
 *
 * Estos tests son la razón de existir del *hook* y no un adorno: lo que hace es
 * manipular el historial del navegador —estado global, compartido con el
 * enrutador—, y los cuatro fallos que se pueden cometer aquí no se ven leyendo el
 * código. Uno, que un «atrás» cierre DOS modales anidados de golpe porque los dos
 * escuchan el mismo evento. Dos, que cerrar con la ✕ deje la entrada de historia
 * puesta y el «atrás» siguiente parezca averiado. Tres, que abrir un modal
 * consuma su propia entrada y se cierre solo. Y cuatro, que un modal que se niega
 * a cerrarse deje el «atrás» siguiente abandonando la pantalla. Los cuatro se
 * reproducen abajo.
 *
 * `history.back()` en jsdom no es sincrónico —el recorrido del historial se
 * encola—, así que todo lo que espera un `popstate` va dentro de un `waitFor`.
 *
 * Nota: `@vitest-environment jsdom` en la primera línea es obligatorio. Sin ella
 * el fichero corre en node y falla con «window is not defined», que no dice lo
 * que pasa.
 */

/**
 * Un modal cualquiera. Lo que importa es que se comporte como los de verdad: al
 * cerrarse deja de estar abierto. `cierra: false` es el que se NIEGA —la hoja que
 * sube un documento mientras el fichero está en vuelo—, cuyo cierre es
 * deliberadamente un no-op.
 */
function Modal({
  onClose,
  cierra = true,
  abierto = true,
}: {
  onClose: () => void
  cierra?: boolean
  abierto?: boolean
}) {
  const [open, setOpen] = useState(abierto)
  useCloseOnBack(() => {
    onClose()
    if (cierra) setOpen(false)
  }, open)
  return null
}

/** Deja el historial en una entrada conocida, como la pantalla que hay debajo. */
function onScreen(name: string) {
  window.history.pushState({ screen: name }, '')
}

describe('useCloseOnBack, el «atrás» del móvil sobre un modal (RNF-106)', () => {
  it('abrir empuja una entrada de historia sin cambiar de dirección', () => {
    onScreen('ficha')
    const url = window.location.href
    const largo = window.history.length
    render(<Modal onClose={() => {}} />)

    expect(window.history.length).toBe(largo + 1)
    // La dirección no cambia: el enrutador no ve ninguna navegación, así que la
    // pantalla de debajo no se vuelve a pintar ni pierde su desplazamiento.
    expect(window.location.href).toBe(url)
  })

  it('el «atrás» cierra el modal en vez de salir de la pantalla', async () => {
    onScreen('ficha')
    const onClose = vi.fn()
    render(<Modal onClose={onClose} />)

    window.history.back()

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    // Se ha consumido la entrada del modal y se ha quedado en la ficha.
    expect(window.history.state).toEqual({ screen: 'ficha' })
  })

  it('cerrado por la ✕, la entrada queda consumida y el «atrás» sí sale', async () => {
    onScreen('listado')
    onScreen('ficha')
    const onClose = vi.fn()
    const { unmount } = render(<Modal onClose={onClose} />)

    unmount()
    // Sin consumir aquí la entrada que se empujó al abrir, el «atrás» siguiente no
    // haría nada visible y la usuaria lo daría por averiado.
    await waitFor(() => expect(window.history.state).toEqual({ screen: 'ficha' }))

    // Y con la hoja ya cerrada, el «atrás» hace lo que hace siempre: salir.
    window.history.back()
    await waitFor(() => expect(window.history.state).toEqual({ screen: 'listado' }))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('un modal que aún no está abierto no empuja nada', () => {
    onScreen('ficha')
    const largo = window.history.length
    render(<Modal onClose={() => {}} abierto={false} />)
    expect(window.history.length).toBe(largo)
  })

  it('el «atrás» cierra solo el modal de encima, no los dos anidados', async () => {
    // La hoja de procedencia con el selector de personas dentro: el caso real, y
    // el fallo que sale si cada modal montado atiende a cada «atrás» por su cuenta.
    onScreen('ficha')
    const cerrarHoja = vi.fn()
    const cerrarSelector = vi.fn()
    render(<Modal onClose={cerrarHoja} />)
    render(<Modal onClose={cerrarSelector} />)

    window.history.back()

    await waitFor(() => expect(cerrarSelector).toHaveBeenCalledTimes(1))
    expect(cerrarHoja).not.toHaveBeenCalled()
  })

  it('el segundo «atrás» cierra el de debajo, y el tercero ya sale de la pantalla', async () => {
    onScreen('listado')
    onScreen('ficha')
    const cerrarHoja = vi.fn()
    const cerrarSelector = vi.fn()
    render(<Modal onClose={cerrarHoja} />)
    render(<Modal onClose={cerrarSelector} />)

    window.history.back()
    await waitFor(() => expect(cerrarSelector).toHaveBeenCalledTimes(1))

    window.history.back()
    await waitFor(() => expect(cerrarHoja).toHaveBeenCalledTimes(1))
    expect(window.history.state).toEqual({ screen: 'ficha' })

    window.history.back()
    await waitFor(() => expect(window.history.state).toEqual({ screen: 'listado' }))
  })

  it('un modal que se niega a cerrarse recupera su entrada y el «atrás» no saca de la pantalla', async () => {
    // La hoja que sube un documento: mientras el fichero está en vuelo su cierre
    // no hace nada. Sin devolverle la entrada, el primer «atrás» no haría nada y
    // el segundo abandonaría la pantalla con la subida a medias.
    onScreen('ficha')
    const ocupada = vi.fn()
    render(<Modal onClose={ocupada} cierra={false} />)

    window.history.back()
    await waitFor(() => expect(ocupada).toHaveBeenCalledTimes(1))
    await waitFor(() =>
      expect(window.history.state).toMatchObject({ modalKey: expect.any(String) }),
    )

    window.history.back()
    await waitFor(() => expect(ocupada).toHaveBeenCalledTimes(2))
    // Se sigue en la ficha, con la hoja abierta: es lo que la negativa pide.
    expect(window.history.state).toMatchObject({ screen: 'ficha' })
  })

  it('si desde el modal se navega a otra pantalla, cerrarlo no la abandona', async () => {
    onScreen('ficha')
    const { unmount } = render(<Modal onClose={() => {}} />)

    // Un enlace dentro del modal: el enrutador empuja su entrada y la del modal
    // queda enterrada. Consumirla a ciegas sacaría de la pantalla recién abierta.
    onScreen('otra')
    unmount()

    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(window.history.state).toEqual({ screen: 'otra' })
  })
})
