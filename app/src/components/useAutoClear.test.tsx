// @vitest-environment jsdom
import { render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AUTO_CLEAR_MS, useAutoClear } from './useAutoClear'

/**
 * The notice that dismisses itself (RNF-106).
 *
 * In jsdom because what has to be checked is the wiring of the timer, and that is where
 * this hook's three defects live when it is written in a hurry: that it does not restart
 * when the notice changes —and then the second inherits whatever seconds were left of the
 * first—, that it fires on an unmounted screen, and that it clears a notice that is not
 * there.
 */

function Auto({ value, clear }: { value: string | null; clear: () => void }) {
  useAutoClear(value, clear)
  return <p>{value}</p>
}

describe('useAutoClear', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('borra el aviso pasados sus segundos', () => {
    const clear = vi.fn()
    render(<Auto value="Imagen principal actualizada." clear={clear} />)
    expect(clear).not.toHaveBeenCalled()
    vi.advanceTimersByTime(AUTO_CLEAR_MS - 1)
    expect(clear).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(clear).toHaveBeenCalledTimes(1)
  })

  it('sin aviso no programa nada', () => {
    const clear = vi.fn()
    render(<Auto value={null} clear={clear} />)
    vi.advanceTimersByTime(AUTO_CLEAR_MS * 3)
    expect(clear).not.toHaveBeenCalled()
  })

  it('un aviso nuevo empieza a contar de cero', () => {
    // Without this, two confirmations in a row share the first one's seconds: the second
    // would be readable for half a second and then vanish.
    const clear = vi.fn()
    const { rerender } = render(<Auto value="Primero" clear={clear} />)
    vi.advanceTimersByTime(AUTO_CLEAR_MS - 500)
    rerender(<Auto value="Segundo" clear={clear} />)
    vi.advanceTimersByTime(600)
    expect(clear).not.toHaveBeenCalled()
    vi.advanceTimersByTime(AUTO_CLEAR_MS)
    expect(clear).toHaveBeenCalledTimes(1)
  })

  it('al desmontar no queda temporizador vivo', () => {
    // A `setState` on a screen that is gone is a console warning and one leak for every
    // time it was opened.
    const clear = vi.fn()
    const { unmount } = render(<Auto value="Algo" clear={clear} />)
    unmount()
    vi.advanceTimersByTime(AUTO_CLEAR_MS * 2)
    expect(clear).not.toHaveBeenCalled()
  })

  it('cuatro segundos, ni tres ni diez', () => {
    // Below three it is not read if the eyes were on the photograph; above five it stops
    // reading as «this just happened» and covers the record.
    expect(AUTO_CLEAR_MS).toBe(4000)
  })
})
