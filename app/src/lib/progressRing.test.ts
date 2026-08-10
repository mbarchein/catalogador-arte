import { describe, expect, it } from 'vitest'
import { ringLabel, ringOffset, RING_CIRCUMFERENCE } from './progressRing'

/**
 * El anillo de progreso (RNF-106).
 *
 * **Un progreso que miente es peor que no tener ninguno**: quien lo mira decide
 * por él si espera o desiste, con la obra delante y en un almacén. Lo que se fija
 * aquí es que el arco no pueda dibujarse al revés ni llenarse antes de tiempo.
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
    // Pasarse del 100 % daría un desplazamiento negativo, y el navegador pinta
    // entonces el arco hacia el otro lado: el anillo parecería vaciarse mientras
    // la subida avanza.
    expect(ringOffset(140)).toBe(0)
    expect(ringOffset(-20)).toBeCloseTo(RING_CIRCUMFERENCE)
  })

  it('y un número que no es número deja el anillo vacío, no a medias', () => {
    // Sin esto, un NaN pinta un arco de longitud indefinida: un progreso
    // inventado, que es justo lo que no puede haber.
    expect(ringOffset(Number.NaN)).toBeCloseTo(RING_CIRCUMFERENCE)
  })
})

describe('lo que se anuncia a quien no lo ve', () => {
  it('con porcentaje, lo dice', () => {
    expect(ringLabel('Descargando el original', 42)).toBe('Descargando el original: 42%')
  })

  it('y sin él, dice al menos que está en marcha', () => {
    // Un dibujo que solo informa por su forma no informa a nadie con lector de
    // pantalla, y aquí el dibujo ES el dato.
    expect(ringLabel('Subiendo la copia', null)).toBe('Subiendo la copia…')
  })
})
