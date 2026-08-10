import { describe, expect, it } from 'vitest'
import {
  cleanFullName,
  nameChanged,
  nameSavedNotice,
  validateFullName,
  NAME_HINT,
  NAME_MAX_LENGTH,
} from './accountName'

/**
 * One's own name, corrected from the profile (RF-109, RF-804).
 *
 * What is pinned down is that **it cannot be left blank**, which is the only thing this
 * field can break and it is not noticed while doing it: the name is what is read in
 * every artwork's «actualizado por» and in the trace of what was withdrawn, so emptying it
 * turns that trace into «Sin indicar» in records that are already written.
 */

describe('un nombre que se pueda guardar', () => {
  it('en blanco, no, y se dice por qué', () => {
    const said = validateFullName('   ') ?? ''
    expect(said).toContain('no puede quedarse en blanco')
    // The reason, not just the prohibition: it is what keeps it from reading as a
    // quibble of the form.
    expect(said).toContain('cada obra que corriges')
  })

  it('uno normal entra', () => {
    expect(validateFullName('Mario J. Barchéin Molina')).toBeNull()
  })

  it('y hay un tope, porque la ficha lo enseña en una línea', () => {
    expect(validateFullName('x'.repeat(NAME_MAX_LENGTH))).toBeNull()
    expect(validateFullName('x'.repeat(NAME_MAX_LENGTH + 1))).toContain(String(NAME_MAX_LENGTH))
  })
})

describe('lo que se guarda de verdad', () => {
  it('va recortado', () => {
    // A leading space sorts differently in any list and is not visible on looking at it.
    expect(cleanFullName('  Mario  ')).toBe('Mario')
  })

  it('y los espacios de más no cuentan como cambio', () => {
    // Without this, opening the field and closing it would send a save that saves nothing
    // and would move the row's trace for nothing.
    expect(nameChanged(' Mario ', 'Mario')).toBe(false)
    expect(nameChanged('Mario B.', 'Mario')).toBe(true)
  })
})

describe('lo que se dice al terminar', () => {
  it('nombra el alcance del cambio, que es todo el catálogo', () => {
    expect(nameSavedNotice('  Mario  ')).toBe('Ahora apareces como «Mario» en todo el catálogo.')
  })

  it('y la explicación del campo dice para qué sirve', () => {
    expect(NAME_HINT).toContain('actualizado por')
  })
})
