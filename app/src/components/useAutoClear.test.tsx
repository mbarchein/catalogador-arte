// @vitest-environment jsdom
import { render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AUTO_CLEAR_MS, useAutoClear } from './useAutoClear'

/**
 * El aviso que se va solo (RNF-106).
 *
 * En jsdom porque lo que hay que comprobar es el cableado del temporizador, y ahí
 * están los tres defectos que tiene este gancho cuando se escribe deprisa: que no
 * se reinicie al cambiar el aviso —y entonces el segundo hereda los segundos que
 * le quedaban al primero—, que se dispare sobre una pantalla desmontada, y que
 * borre un aviso que no existe.
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
    // Sin esto, dos confirmaciones seguidas comparten los segundos de la primera:
    // la segunda se leería medio segundo y desaparecería.
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
    // Un `setState` sobre una pantalla que ya no está es un aviso en la consola y
    // una fuga por cada vez que se abrió.
    const clear = vi.fn()
    const { unmount } = render(<Auto value="Algo" clear={clear} />)
    unmount()
    vi.advanceTimersByTime(AUTO_CLEAR_MS * 2)
    expect(clear).not.toHaveBeenCalled()
  })

  it('cuatro segundos, ni tres ni diez', () => {
    // Por debajo de tres no se lee si la vista estaba en la fotografía; por encima
    // de cinco deja de leerse como «acaba de pasar» y tapa la ficha.
    expect(AUTO_CLEAR_MS).toBe(4000)
  })
})
