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
 * Leaving a sheet without losing what was written.
 *
 * This suite exists because of a real incident reported twice: a brush on the dark
 * backdrop —which with the sheet at three quarters of the screen falls exactly where the thumb rests when
 * scrolling— closed the form and ten minutes of typing were lost, with no question asked.
 *
 * What it pins down, and it is where a confirmation turns into scenery: **that no question
 * is asked about a blank form** —a question that always comes up is dismissed
 * unread— and **that with the question in front there is no path that leaves without saying so**.
 */

const EXITS: SheetExit[] = ['backdrop', 'close', 'escape', 'back']

describe('sheetExitAction, qué hacer con un intento de salir', () => {
  it('en una hoja de elegir, los cuatro caminos cierran', () => {
    // Choosing a place or a venue accumulates nothing to lose, and taking its backdrop
    // away would remove convenience for no gain.
    for (const exit of EXITS) {
      expect(sheetExitAction({ dirty: false, exit, backdropCloses: true })).toBe('close')
    }
  })

  it('en un formulario, el fondo deja de ser una salida — también en blanco', () => {
    // Not only when something has been typed: a surface that sometimes closes and
    // sometimes asks is worse than one that never closes. The exit is always the ✕.
    expect(sheetExitAction({ dirty: false, exit: 'backdrop', backdropCloses: false })).toBe('ignore')
    expect(sheetExitAction({ dirty: true, exit: 'backdrop', backdropCloses: false })).toBe('ignore')
  })

  it('y en blanco, los otros tres cierran sin preguntar', () => {
    // Asking over an empty form is what teaches the question to be dismissed unread, and
    // then on the day it matters it goes unread too.
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
    // The chooser that also lets a link note be typed is half a form: the backdrop still
    // closes it, but what was typed is not thrown away without asking.
    expect(sheetExitAction({ dirty: true, exit: 'back', backdropCloses: true })).toBe('confirm')
    expect(sheetExitAction({ dirty: true, exit: 'backdrop', backdropCloses: true })).toBe('confirm')
  })
})

describe('confirmingExitAction, con la pregunta ya en pantalla', () => {
  it('el atrás y Escape retiran la pregunta: NUNCA salen', () => {
    // One back too many, with a dialog in front saying the data is about to be lost,
    // cannot be the very press that loses it.
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

  it('el que se queda dice que se queda, y el que sale no promete una pérdida que no hay', () => {
    // «Salir sin guardar» and not «Salir y perderlo»: with the draft noted down the typing is not
    // lost, and a button saying «perderlo» about something that is not lost teaches people not to
    // believe the warnings. What is true either way is that it is not stored.
    expect(DISCARD_KEEP_LABEL).toBe('Seguir rellenando')
    expect(DISCARD_LEAVE_LABEL).toBe('Salir sin guardar')
    expect(DISCARD_LEAVE_LABEL).not.toContain('perder')
  })

  it('y con el borrador apuntado la frase promete lo que la hoja hace de verdad', () => {
    const kept = discardText(null, true)
    expect(kept).toContain('se queda apuntado')
    expect(kept).toContain('se ofrece al volver a abrirla')
    // Not recorded, not promised: the usual sentence.
    expect(discardText()).toContain('no se guarda')
    expect(discardText()).not.toContain('se queda apuntado')
    // And whatever the sheet adds goes into both.
    expect(discardText('El fichero habría que volver a elegirlo.', true)).toContain('fichero')
  })
})
