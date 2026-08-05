import { describe, expect, it } from 'vitest'
import {
  confirmingExitAction,
  discardText,
  DISCARD_KEEP_LABEL,
  DISCARD_LEAVE_LABEL,
  sheetExitAction,
  type SheetExit,
} from './sheetExit'

/**
 * Salir de una hoja sin perder lo escrito.
 *
 * Esta batería existe por una incidencia real y contada dos veces: un roce en el fondo
 * oscuro —que con la hoja a tres cuartos de pantalla cae justo donde se apoya el pulgar al
 * desplazarse— cerraba el formulario y se perdían diez minutos de tecleo, sin preguntar.
 *
 * Lo que fija, y que es donde una confirmación se convierte en decorado: **que no se
 * pregunte sobre un formulario en blanco** —una pregunta que sale siempre se despacha sin
 * leerla— y **que con la pregunta delante no haya ningún camino que salga sin decirlo**.
 */

const EXITS: SheetExit[] = ['backdrop', 'close', 'escape', 'back']

describe('sheetExitAction, qué hacer con un intento de salir', () => {
  it('en una hoja de elegir, los cuatro caminos cierran', () => {
    // Elegir un sitio o una sede no acumula nada que perder, y quitarle el fondo sería
    // quitar comodidad sin ganar nada.
    for (const exit of EXITS) {
      expect(sheetExitAction({ dirty: false, exit, backdropCloses: true })).toBe('close')
    }
  })

  it('en un formulario, el fondo deja de ser una salida — también en blanco', () => {
    // No solo cuando hay algo escrito: una superficie que unas veces cierra y otras
    // pregunta es peor que una que no cierra nunca. La salida está siempre en la ✕.
    expect(sheetExitAction({ dirty: false, exit: 'backdrop', backdropCloses: false })).toBe('ignore')
    expect(sheetExitAction({ dirty: true, exit: 'backdrop', backdropCloses: false })).toBe('ignore')
  })

  it('y en blanco, los otros tres cierran sin preguntar', () => {
    // Preguntar sobre un formulario vacío es lo que hace que la pregunta se aprenda a
    // despachar sin leerla, y entonces el día que importa tampoco se lee.
    for (const exit of ['close', 'escape', 'back'] as const) {
      expect(sheetExitAction({ dirty: false, exit, backdropCloses: false })).toBe('close')
    }
  })

  it('con algo escrito, los tres preguntan', () => {
    for (const exit of ['close', 'escape', 'back'] as const) {
      expect(sheetExitAction({ dirty: true, exit, backdropCloses: false })).toBe('confirm')
    }
  })

  it('y una hoja de elegir con algo escrito también pregunta por esos tres', () => {
    // El selector que además deja escribir una nota del vínculo es un formulario a
    // medias: el fondo le sigue cerrando, pero lo escrito no se tira sin preguntar.
    expect(sheetExitAction({ dirty: true, exit: 'back', backdropCloses: true })).toBe('confirm')
    expect(sheetExitAction({ dirty: true, exit: 'backdrop', backdropCloses: true })).toBe('confirm')
  })
})

describe('confirmingExitAction, con la pregunta ya en pantalla', () => {
  it('el atrás y Escape retiran la pregunta: NUNCA salen', () => {
    // Un atrás de más, con un cartel delante que dice que se van a perder los datos, no
    // puede ser justo la pulsación que los pierde.
    expect(confirmingExitAction('back')).toBe('dismiss')
    expect(confirmingExitAction('escape')).toBe('dismiss')
    expect(confirmingExitAction('close')).toBe('dismiss')
  })

  it('y el fondo no hace nada', () => {
    expect(confirmingExitAction('backdrop')).toBe('ignore')
  })
})

describe('lo que dice la pregunta', () => {
  it('dice lo que NO pasa, que es lo que hace falta para decidir', () => {
    const text = discardText()
    expect(text).toContain('no se guarda')
    expect(text).toContain('Del catálogo no se cambia nada')
  })

  it('y una hoja puede añadir lo que la frase general no puede saber', () => {
    const text = discardText('El fichero elegido habría que volver a elegirlo.')
    expect(text).toContain('Del catálogo no se cambia nada')
    expect(text).toContain('volver a elegirlo')
  })

  it('sin nada que añadir no deja un espacio colgando', () => {
    expect(discardText('   ')).toBe(discardText())
    expect(discardText(null)).toBe(discardText())
  })

  it('el botón que no destruye se lee primero, y el que destruye dice qué destruye', () => {
    expect(DISCARD_KEEP_LABEL).toBe('Seguir rellenando')
    expect(DISCARD_LEAVE_LABEL).toContain('perderlo')
  })
})
