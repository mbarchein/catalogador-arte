import { describe, expect, it } from 'vitest'
import { canWriteBlock } from './sections'

describe('escribir exige el modo Y el permiso (RF-308, RF-109)', () => {
  // The two failures this rule exists to prevent, and both have happened:
  // a button that writes in the record being read, and a button that writes
  // offered to whoever only consults.
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
    // Written as a property and not as three loose cases: if somebody swaps the
    // rule for a disjunction, this falls even if the cases above are rewritten.
    for (const writable of [true, false]) {
      for (const canEdit of [true, false]) {
        expect(canWriteBlock(writable, canEdit)).toBe(writable && canEdit)
      }
    }
  })
})
