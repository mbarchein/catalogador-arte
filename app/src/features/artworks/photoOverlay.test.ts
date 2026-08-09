import { describe, expect, it } from 'vitest'
import {
  canMove,
  mainButtonState,
  photoStatusText,
  MAIN_AUTO_NOTE,
  MAIN_IS_LABEL,
  MAIN_PIN_LABEL,
  MAIN_SET_LABEL,
  REMOVE_CONSEQUENCE,
} from './photoOverlay'

/**
 * Los mandos sobre la fotografía (RF-405, RF-901, RNF-106).
 *
 * Un icono no lleva palabra al lado, así que su rótulo **es** lo único que dice qué
 * hace. Lo que se fija aquí es que los tres estados de la estrella no se confundan
 * entre sí y que el orden no ofrezca un movimiento imposible.
 */

describe('la estrella de la portada', () => {
  it('sin ser la principal, invita a ponerla', () => {
    expect(mainButtonState(false, false)).toEqual({
      filled: false,
      disabled: false,
      label: MAIN_SET_LABEL,
    })
  })

  it('elegida a mano, se ve encendida y no queda nada que pulsar', () => {
    expect(mainButtonState(true, true)).toEqual({
      filled: true,
      disabled: true,
      label: MAIN_IS_LABEL,
    })
  })

  it('principal SIN fijar es un tercer estado, ni apagada ni terminada', () => {
    // Es la diferencia que importa: sin fijar, subir otra general cambia la
    // portada sola. Encendida y pulsable a la vez, que es lo que hay.
    const state = mainButtonState(true, false)
    expect(state.filled).toBe(true)
    expect(state.disabled).toBe(false)
    expect(state.label).toBe(MAIN_PIN_LABEL)
  })

  it('y los tres rótulos son distintos entre sí', () => {
    const rotulos = new Set([MAIN_SET_LABEL, MAIN_PIN_LABEL, MAIN_IS_LABEL])
    expect(rotulos.size).toBe(3)
  })

  it('el porqué de «sin fijar» dice qué la cambiaría', () => {
    expect(MAIN_AUTO_NOTE).toContain('otra general')
  })
})

describe('lo que se lee bajo la fotografía', () => {
  it('la principal fijada lo dice, con su sitio en el orden', () => {
    expect(photoStatusText({ isMain: true, manuallyChosen: true, position: 2, total: 4 })).toBe(
      'Principal · 2 de 4',
    )
  })

  it('la principal sin fijar se distingue de la fijada', () => {
    expect(photoStatusText({ isMain: true, manuallyChosen: false, position: 1, total: 4 })).toBe(
      'Principal, sin fijar · 1 de 4',
    )
  })

  it('una que no es la principal solo dice por dónde va', () => {
    expect(photoStatusText({ isMain: false, manuallyChosen: true, position: 3, total: 4 })).toBe(
      '3 de 4',
    )
  })

  it('con una sola fotografía no hay orden que contar', () => {
    // «1 de 1» es ruido, y con una sola tampoco hay portada que elegir.
    expect(photoStatusText({ isMain: true, manuallyChosen: true, position: 1, total: 1 })).toBe(
      'Principal',
    )
    expect(photoStatusText({ isMain: false, manuallyChosen: false, position: 1, total: 1 })).toBe('')
  })
})

describe('mover una posición', () => {
  it('la primera no va más hacia el principio, ni la última hacia el final', () => {
    expect(canMove(1, 4, -1)).toBe(false)
    expect(canMove(1, 4, 1)).toBe(true)
    expect(canMove(4, 4, 1)).toBe(false)
    expect(canMove(4, 4, -1)).toBe(true)
  })

  it('con una sola fotografía no hay a dónde moverla', () => {
    expect(canMove(1, 1, -1)).toBe(false)
    expect(canMove(1, 1, 1)).toBe(false)
  })
})

describe('quitar', () => {
  it('dice lo que NO pasa, que es la mitad que evita el susto (RF-901)', () => {
    expect(REMOVE_CONSEQUENCE).toContain('se conserva')
  })
})
