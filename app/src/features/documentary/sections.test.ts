import { describe, expect, it } from 'vitest'
import { canWriteBlock } from './sections'

describe('escribir exige el modo Y el permiso (RF-308, RF-109)', () => {
  // Los dos fallos que esta regla existe para impedir, y los dos han ocurrido:
  // un botón que escribe en la ficha que se está leyendo, y un botón que escribe
  // ofrecido a quien solo consulta.
  it('no escribe en la vista, ni siquiera quien tiene permiso', () => {
    expect(canWriteBlock(false, true)).toBe(false)
  })

  it('no escribe quien solo consulta, ni siquiera en la zona de edición', () => {
    expect(canWriteBlock(true, false)).toBe(false)
  })

  it('escribe solo con las dos cosas a la vez', () => {
    expect(canWriteBlock(true, true)).toBe(true)
  })

  it('sin modo y sin permiso, tampoco', () => {
    expect(canWriteBlock(false, false)).toBe(false)
  })

  it('ninguna de las dos condiciones basta por sí sola', () => {
    // Escrito como propiedad y no como tres casos sueltos: si alguien cambia la
    // regla por una disyunción, esto cae aunque los casos de arriba se reescriban.
    for (const writable of [true, false]) {
      for (const canEdit of [true, false]) {
        expect(canWriteBlock(writable, canEdit)).toBe(writable && canEdit)
      }
    }
  })
})
