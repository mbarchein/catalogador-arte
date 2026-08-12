// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readClipboard } from './clipboard'

/**
 * RF-1624: leer el portapapeles del sistema, que es la única vía al HTML en un móvil.
 *
 * Los tres finales tienen que estar cubiertos porque los tres pasan en un teléfono de
 * verdad: lo lee con las dos mitades, solo deja el texto plano, o no deja nada — un
 * permiso negado o un navegador que no implementa `read()`. Ninguno es una avería, y
 * ninguno puede dejar a la usuaria sin pegar.
 */

/** Un portapapeles del navegador, con lo que se le ponga. */
function withClipboard(clipboard: unknown) {
  Object.defineProperty(navigator, 'clipboard', { value: clipboard, configurable: true })
}

const item = (types: Record<string, string>) => ({
  types: Object.keys(types),
  getType: async (type: string) => new Blob([types[type] ?? ''], { type }),
})

afterEach(() => {
  withClipboard(undefined)
})

describe('leer el portapapeles', () => {
  it('trae las dos mitades cuando el sistema las tiene', () => {
    withClipboard({
      read: async () => [item({ 'text/html': '<h2>Biografía</h2>', 'text/plain': 'Biografía' })],
    })
    return expect(readClipboard()).resolves.toEqual({
      html: '<h2>Biografía</h2>',
      text: 'Biografía',
    })
  })

  it('con solo texto plano, devuelve el texto y ningún HTML', () => {
    withClipboard({ read: async () => [item({ 'text/plain': 'Nació en Badajoz.' })] })
    return expect(readClipboard()).resolves.toEqual({ html: '', text: 'Nació en Badajoz.' })
  })

  it('si el permiso se niega, se cae al texto plano en vez de quedarse sin pegar', () => {
    const readText = vi.fn(async () => 'Nació en Badajoz.')
    withClipboard({
      read: async () => {
        throw new Error('NotAllowedError')
      },
      readText,
    })
    return expect(readClipboard()).resolves.toEqual({ html: '', text: 'Nació en Badajoz.' })
  })

  it('en un navegador sin `read`, el texto plano', () => {
    withClipboard({ readText: async () => 'Nació en Badajoz.' })
    return expect(readClipboard()).resolves.toEqual({ html: '', text: 'Nació en Badajoz.' })
  })

  it('sin portapapeles que leer, null: no es una avería y quien llama tiene otra salida', () => {
    withClipboard(undefined)
    return expect(readClipboard()).resolves.toBeNull()
  })

  it('y si tampoco deja el texto plano, tampoco revienta', () => {
    withClipboard({
      readText: async () => {
        throw new Error('NotAllowedError')
      },
    })
    return expect(readClipboard()).resolves.toBeNull()
  })
})
