import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  INTERVALO_COMPROBACION_MS,
  programarComprobaciones,
  type FuenteVisibilidad,
} from './actualizaciones'

/** Un `document` fingido del que controlamos la visibilidad. */
function documentoFalso() {
  const manejadores: Array<() => void> = []
  const doc: FuenteVisibilidad = {
    visibilityState: 'hidden',
    addEventListener: (_tipo, manejador) => manejadores.push(manejador),
  }
  return {
    doc,
    ponerEn(estado: DocumentVisibilityState) {
      doc.visibilityState = estado
      manejadores.forEach((m) => m())
    },
  }
}

// Complemento de RF-1202: el armazón cacheado arranca al instante, pero la
// aplicación abierta debe enterarse de que se publicó una versión nueva.
describe('comprobación de versión nueva', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('comprueba periódicamente mientras la aplicación sigue abierta', () => {
    const comprobar = vi.fn()
    programarComprobaciones(comprobar, documentoFalso().doc)

    expect(comprobar).not.toHaveBeenCalled()
    vi.advanceTimersByTime(INTERVALO_COMPROBACION_MS)
    expect(comprobar).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(INTERVALO_COMPROBACION_MS * 2)
    expect(comprobar).toHaveBeenCalledTimes(3)
  })

  it('comprueba al volver la aplicación a primer plano', () => {
    const comprobar = vi.fn()
    const { doc, ponerEn } = documentoFalso()
    programarComprobaciones(comprobar, doc)

    ponerEn('visible')
    expect(comprobar).toHaveBeenCalledTimes(1)
  })

  it('no comprueba al pasar a segundo plano', () => {
    const comprobar = vi.fn()
    const { doc, ponerEn } = documentoFalso()
    programarComprobaciones(comprobar, doc)

    ponerEn('hidden')
    expect(comprobar).not.toHaveBeenCalled()
  })
})
