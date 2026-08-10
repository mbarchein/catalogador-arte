// @vitest-environment jsdom
import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useUnloadGuard } from './useUnloadGuard'

/**
 * RNF-106: not losing work to an accidental reload.
 *
 * In jsdom because what has to be checked is the wiring and not a decision: that the
 * browser receives the cancellation when there is something to lose, that it does NOT receive it when there
 * is not, and that the listener is removed. A hook that leaves the listener in place produces the
 * dialogue forever, and a dialogue that always comes up is dismissed unread, which is
 * exactly the reflex that makes it useless on the day it matters.
 */

function Guarded({ active }: { active: boolean }) {
  useUnloadGuard(active)
  return null
}

/** Fires a cancelable `beforeunload` and says whether anyone stopped it. */
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
    // This is the half that makes the other one useful: a permanent warning gets dismissed
    // by reflex, and from then on it warns about nothing.
    render(<Guarded active={false} />)
    expect(tryToLeave()).toBe(false)
  })

  it('se desarma en cuanto el trabajo está a salvo', () => {
    // The upload finishes and the photos are no longer staged: leaving has to go back to
    // being leaving, with no dialog in the way.
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
    // Without this, leaving the screen would keep the dialog armed across the whole application.
    const { unmount } = render(<Guarded active />)
    unmount()
    expect(tryToLeave()).toBe(false)
  })

  it('rellena también `returnValue`, que es lo que leen varios navegadores', () => {
    // Invoking the handler and not dispatching an event: in jsdom `Event.returnValue` is
    // the inherited property reflecting `!defaultPrevented`, so after
    // `preventDefault` it is `false` and not whatever was written to it. A real `BeforeUnloadEvent`
    // does carry its own text field, and that is the one to set.
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
