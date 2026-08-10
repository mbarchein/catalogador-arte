// @vitest-environment jsdom
import { StrictMode, useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { useCloseOnBack } from './useCloseOnBack'

/**
 * The phone's «back» closes the modal on top and not the screen (RNF-106).
 *
 * These tests are the *hook*'s reason to exist and not an ornament: what it does is
 * manipulate the browser's history —global state, shared with the
 * router—, and the four mistakes that can be made here are not visible reading the
 * code. One, that a «back» closes TWO nested modals at once because both
 * listen to the same event. Two, that closing with the ✕ leaves the history entry
 * in place and the next «back» looks broken. Three, that opening a modal
 * consumes its own entry and it closes by itself. And four, that a modal refusing
 * to close leaves the next «back» abandoning the screen. All four are
 * reproduced below.
 *
 * `history.back()` in jsdom is not synchronous —history traversal is
 * queued—, so everything awaiting a `popstate` goes inside a `waitFor`.
 *
 * Note: `@vitest-environment jsdom` on the first line is compulsory. Without it
 * the file runs in node and fails with «window is not defined», which does not say what
 * is happening.
 */

/**
 * Any modal. What matters is that it behaves like the real ones: on
 * closing it stops being open. `cierra: false` is the one that REFUSES —the sheet that
 * uploads a document while the file is in flight—, whose close is
 * deliberately a no-op.
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
    // The sheet that uploads a document: while the file is in flight its close
    // does nothing. Without giving the entry back, the first «back» would do nothing and
    // the second would abandon the screen with the upload half-done.
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
     * The incident, reproduced. **Every sheet in the application is born open**
     * —the screen mounts them when needed and passes them a bare `open`—, so in
     * development React mounted the effect, destroyed it and mounted it again; the
     * destroyed one consumed the history entry on the way, the application
     * stayed on the screen's entry and the arbiter read «there is no modal
     * open». Result: the sheet closed by itself the very instant it opened.
     *
     * It was discovered in Chromium and not here, because this file's first test mounts
     * with `open` changing state and that path does not trigger the double mount. That is why
     * this test mounts inside `StrictMode`, which is what triggers it.
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
    // If the second mount pushed its own entry, two «back»es would be needed to
    // leave a sheet: one to consume the orphan entry and another for the real
    // one. It is the other side of the same failure.
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
     * Reloading with a sheet open leaves in the history an entry marked as belonging to
     * a modal, and on reloading the module's counter starts over. Without a stamp
     * per load, the next sheet was marked with the SAME key: the «back» landed
     * on the old entry, the arbiter recognised it as the open sheet's and closed
     * «whatever was on top», which was nothing. The sheet stayed open and the button
     * looked broken. Measured in Chromium before fixing it.
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
