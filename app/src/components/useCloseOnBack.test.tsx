// @vitest-environment jsdom
import { StrictMode, useState } from 'react'
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

/** Leaves history on a known entry, like the screen underneath. */
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
    // The address does not change: the router sees no navigation, so the screen underneath
    // is not repainted and does not lose its scroll.
    expect(window.location.href).toBe(url)
  })

  it('el «atrás» cierra el modal en vez de salir de la pantalla', async () => {
    onScreen('ficha')
    const onClose = vi.fn()
    render(<Modal onClose={onClose} />)

    window.history.back()

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    // The modal's entry has been consumed and it stayed on the record.
    expect(window.history.state).toEqual({ screen: 'ficha' })
  })

  it('cerrado por la ✕, la entrada queda consumida y el «atrás» sí sale', async () => {
    onScreen('listado')
    onScreen('ficha')
    const onClose = vi.fn()
    const { unmount } = render(<Modal onClose={onClose} />)

    unmount()
    // Without consuming here the entry pushed on opening, the next «back» would do nothing
    // visible and would be taken for broken.
    await waitFor(() => expect(window.history.state).toEqual({ screen: 'ficha' }))

    // And with the sheet already closed, «back» does what it always does: leave.
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
    // The provenance sheet with the party chooser inside: the real case, and the failure
    // that shows up if every mounted modal answers every «back» on its own.
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
    // Still on the record, with the sheet open: which is what the refusal asks for.
    expect(window.history.state).toMatchObject({ screen: 'ficha' })
  })

  it('un modal que nace ya abierto sobrevive al doble montaje de desarrollo', async () => {
    /**
     * La incidencia, reproducida. **Todas las hojas de la aplicación nacen abiertas**
     * —la pantalla las monta cuando hace falta y les pasa `open` a secas—, así que en
     * desarrollo React montaba el efecto, lo destruía y lo volvía a montar; el
     * destruido consumía la entrada de historia por el camino, la aplicación se
     * quedaba en la entrada de la pantalla y el árbitro leía «no hay ningún modal
     * abierto». Resultado: la hoja se cerraba sola en el mismo instante de abrirse.
     *
     * Se descubrió en Chromium y no aquí, porque el primer test de este fichero monta
     * con `open` cambiando de estado y ese camino no dispara el doble montaje. Por eso
     * este test monta dentro de `StrictMode`, que es lo que lo dispara.
     */
    onScreen('ficha')
    const onClose = vi.fn()
    render(
      <StrictMode>
        <Modal onClose={onClose} />
      </StrictMode>,
    )

    // One turn so the double-mount timers can run.
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(onClose).not.toHaveBeenCalled()
    // And the entry is still there: it is the one «back» has to consume.
    expect(window.history.state).toMatchObject({ modalKey: expect.any(String) })

    window.history.back()
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    expect(window.history.state).toEqual({ screen: 'ficha' })
  })

  it('y en el doble montaje no se apila una entrada de más', async () => {
    // Si el segundo montaje empujara su propia entrada, harían falta dos «atrás» para
    // salir de una hoja: uno para consumir la entrada huérfana y otro para la de
    // verdad. Es el otro lado del mismo fallo.
    onScreen('listado')
    onScreen('ficha')
    const onClose = vi.fn()
    render(
      <StrictMode>
        <Modal onClose={onClose} />
      </StrictMode>,
    )
    await new Promise((resolve) => setTimeout(resolve, 20))

    window.history.back()
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    // A single «back» returned to the record, not to an intermediate entry.
    expect(window.history.state).toEqual({ screen: 'ficha' })
  })

  it('una entrada de modal de otra carga de la página no confunde al «atrás»', async () => {
    /**
     * Recargar con una hoja abierta deja en el historial una entrada marcada como de
     * un modal, y al recargar el contador del módulo vuelve a empezar. Sin un sello
     * por carga, la hoja siguiente se marcaba con la MISMA clave: el «atrás» aterrizaba
     * en la entrada vieja, el árbitro la reconocía como la de la hoja abierta y cerraba
     * «lo que hubiera por encima», que era nada. La hoja se quedaba abierta y el botón
     * parecía roto. Medido en Chromium antes de arreglarlo.
     */
    onScreen('ficha')
    // The entry the previous load left behind, with the shape it would have.
    window.history.pushState({ screen: 'ficha', modalKey: 'modal-1' }, '')
    const onClose = vi.fn()
    render(<Modal onClose={onClose} />)

    window.history.back()

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
  })

  it('si desde el modal se navega a otra pantalla, cerrarlo no la abandona', async () => {
    onScreen('ficha')
    const { unmount } = render(<Modal onClose={() => {}} />)

    // A link inside the modal: the router pushes its entry and the modal's is buried.
    // Consuming it blindly would leave the screen that just opened.
    onScreen('otra')
    unmount()

    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(window.history.state).toEqual({ screen: 'otra' })
  })
})
