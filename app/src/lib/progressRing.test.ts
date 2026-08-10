import { describe, expect, it } from 'vitest'
import { ringLabel, ringOffset, RING_CIRCUMFERENCE } from './progressRing'

/**
 * The progress ring (RNF-106).
 *
 * **A progress that lies is worse than having none**: whoever looks at it decides
 * by it whether to wait or give up, with the artwork in front and in a storeroom. What is pinned down
 * here is that the arc cannot be drawn backwards or fill up ahead of time.
 */

describe('cuánto del anillo queda por pintar', () => {
  it('a cero está vacío y a cien está entero', () => {
    expect(ringOffset(0)).toBeCloseTo(RING_CIRCUMFERENCE)
    expect(ringOffset(100)).toBeCloseTo(0)
  })

  it('a la mitad, la mitad', () => {
    expect(ringOffset(50)).toBeCloseTo(RING_CIRCUMFERENCE / 2)
  })

  it('un total mal medido no lo dibuja al revés', () => {
    // Going over 100 % would give a negative offset, and the browser then paints
    // the arc the other way: the ring would seem to empty while
    // the upload advances.
    expect(ringOffset(140)).toBe(0)
    expect(ringOffset(-20)).toBeCloseTo(RING_CIRCUMFERENCE)
  })

  it('y un número que no es número deja el anillo vacío, no a medias', () => {
    // Without this, a NaN paints an arc of undefined length: an invented
    // progress, which is exactly what there cannot be.
    expect(ringOffset(Number.NaN)).toBeCloseTo(RING_CIRCUMFERENCE)
  })
})

describe('lo que se anuncia a quien no lo ve', () => {
  it('con porcentaje, lo dice', () => {
    expect(ringLabel('Descargando el original', 42)).toBe('Descargando el original: 42%')
  })

  it('y sin él, dice al menos que está en marcha', () => {
    // A drawing that informs only through its shape informs nobody with a screen
    // reader, and here the drawing IS the datum.
    expect(ringLabel('Subiendo la copia', null)).toBe('Subiendo la copia…')
  })
})
