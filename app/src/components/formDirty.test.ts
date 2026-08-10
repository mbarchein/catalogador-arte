import { describe, expect, it } from 'vitest'
import { anyWritten, draftDirty } from './formDirty'

/**
 * The condition that lights up the «you have half-entered data» question.
 *
 * The two possible mistakes are paid for in opposite directions: falling short loses data
 * —the incident all this comes from— and overshooting turns the question into a sign
 * dismissed unread, and then on the day it matters it is not read either. Every rule
 * below is on one side or the other of that line.
 */

interface Campos {
  title: string
  year: number | null
  approximate: boolean
  note: string
}

const VACIO: Campos = { title: '', year: null, approximate: false, note: '' }

describe('draftDirty, ¿se ha escrito algo?', () => {
  it('el borrador intacto no está sucio', () => {
    expect(draftDirty({ ...VACIO }, VACIO)).toBe(false)
  })

  it('un campo escrito sí', () => {
    expect(draftDirty({ ...VACIO, title: 'Carta' }, VACIO)).toBe(true)
    expect(draftDirty({ ...VACIO, year: 1985 }, VACIO)).toBe(true)
    expect(draftDirty({ ...VACIO, approximate: true }, VACIO)).toBe(true)
  })

  it('un espacio NO es trabajo', () => {
    // Closing on a brush after touching the space bar does not deserve a dialog, and that
    // space does not reach the database either: everything is trimmed before writing.
    expect(draftDirty({ ...VACIO, title: '   ' }, VACIO)).toBe(false)
    expect(draftDirty({ ...VACIO, title: ' Carta ' }, { ...VACIO, title: 'Carta' })).toBe(false)
  })

  it('null y «sin poner» son el mismo «sin dato»', () => {
    expect(
      draftDirty({ title: '', year: undefined }, { title: '', year: null } as { title: string; year: number | null | undefined }),
    ).toBe(false)
  })

  it('y sirve igual para «¿hay una corrección sin guardar?»', () => {
    // The same question from the other side: the starting point is the stored row. A sheet
    // for creating and one for correcting cannot protect different things.
    const guardado = { title: 'Carta de la galería', year: 1985, approximate: false, note: '' }
    expect(draftDirty({ ...guardado }, guardado)).toBe(false)
    expect(draftDirty({ ...guardado, year: 1986 }, guardado)).toBe(true)
    // Emptying a field that held a datum is a correction too, and one of the most painful
    // to lose: it is the one that takes some deciding.
    expect(draftDirty({ ...guardado, title: '' }, guardado)).toBe(true)
  })

  it('solo mira los campos del punto de partida, no lo que la hoja lleve encima', () => {
    const current = { ...VACIO, saving: true } as unknown as typeof VACIO
    expect(draftDirty(current, VACIO)).toBe(false)
  })
})

describe('anyWritten, para las hojas de dos campos libres', () => {
  it('contesta a «¿hay algo escrito?» recortando', () => {
    expect(anyWritten('', null, undefined)).toBe(false)
    expect(anyWritten('   ', '')).toBe(false)
    expect(anyWritten('', 'cartel de la muestra')).toBe(true)
    expect(anyWritten('págs. 34-36')).toBe(true)
  })

  it('sin nada que mirar, no está sucio', () => {
    expect(anyWritten()).toBe(false)
  })
})
