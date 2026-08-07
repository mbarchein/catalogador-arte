// @vitest-environment jsdom
import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useUnloadGuard } from './useUnloadGuard'

/**
 * RNF-106: no perder trabajo por una recarga sin querer.
 *
 * En jsdom porque lo que hay que comprobar es el cableado y no una decisión: que el
 * navegador reciba la cancelación cuando hay algo que perder, que NO la reciba cuando no
 * lo hay, y que el oyente se quite. Un gancho que se deja el oyente puesto produce el
 * diálogo para siempre, y un diálogo que sale siempre se despacha sin leerlo, que es
 * justo el reflejo que lo inutiliza el día que importa.
 */

function Guarded({ active }: { active: boolean }) {
  useUnloadGuard(active)
  return null
}

/** Dispara un `beforeunload` cancelable y dice si alguien lo paró. */
function tryToLeave(): boolean {
  const event = new Event('beforeunload', { cancelable: true })
  window.dispatchEvent(event)
  return event.defaultPrevented
}

describe('useUnloadGuard', () => {
  it('pregunta cuando hay algo que perder', () => {
    render(<Guarded active />)
    expect(tryToLeave()).toBe(true)
  })

  it('no pregunta cuando no lo hay', () => {
    // Es la mitad que hace que la otra sirva: un aviso permanente se despacha por
    // reflejo, y a partir de ahí ya no avisa de nada.
    render(<Guarded active={false} />)
    expect(tryToLeave()).toBe(false)
  })

  it('se desarma en cuanto el trabajo está a salvo', () => {
    // La subida termina y las fotos dejan de estar preparadas: salir tiene que volver a
    // ser salir, sin un diálogo por medio.
    const { rerender } = render(<Guarded active />)
    expect(tryToLeave()).toBe(true)
    rerender(<Guarded active={false} />)
    expect(tryToLeave()).toBe(false)
  })

  it('se rearma si vuelve a haber algo pendiente', () => {
    const { rerender } = render(<Guarded active={false} />)
    rerender(<Guarded active />)
    expect(tryToLeave()).toBe(true)
  })

  it('quita el oyente al desmontarse', () => {
    // Sin esto, salir de la pantalla dejaría el diálogo puesto en toda la aplicación.
    const { unmount } = render(<Guarded active />)
    unmount()
    expect(tryToLeave()).toBe(false)
  })

  it('rellena también `returnValue`, que es lo que leen varios navegadores', () => {
    // Invocando el manejador y no despachando un evento: en jsdom `Event.returnValue` es
    // la propiedad heredada que refleja `!defaultPrevented`, así que después de
    // `preventDefault` vale `false` y no lo que se le haya escrito. Un `BeforeUnloadEvent`
    // de verdad sí lleva su propio campo de texto, y es ese el que hay que fijar.
    const handlers: EventListener[] = []
    const add = vi.spyOn(window, 'addEventListener').mockImplementation((type, listener) => {
      if (type === 'beforeunload') handlers.push(listener as EventListener)
    })
    render(<Guarded active />)
    add.mockRestore()

    const event = { preventDefault: vi.fn(), returnValue: undefined as unknown }
    handlers[0]?.(event as unknown as Event)
    expect(event.preventDefault).toHaveBeenCalled()
    expect(event.returnValue).toBe('')
  })
})
