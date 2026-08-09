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
 * El propio nombre, corregido desde el perfil (RF-109, RF-804).
 *
 * Lo que se fija es que **no se pueda dejar en blanco**, que es lo único que este
 * campo puede romper y no se nota al hacerlo: el nombre es lo que se lee en
 * «actualizado por» de cada obra y en la traza de lo retirado, así que vaciarlo
 * convierte esa traza en «Sin indicar» en fichas que ya están escritas.
 */

describe('un nombre que se pueda guardar', () => {
  it('en blanco, no, y se dice por qué', () => {
    const said = validateFullName('   ') ?? ''
    expect(said).toContain('no puede quedarse en blanco')
    // El motivo, no solo la prohibición: es lo que hace que no se lea como una
    // pega del formulario.
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
    // Un espacio delante ordena distinto en cualquier lista y no se ve al mirarlo.
    expect(cleanFullName('  Mario  ')).toBe('Mario')
  })

  it('y los espacios de más no cuentan como cambio', () => {
    // Sin esto, abrir el campo y cerrarlo mandaría un guardado que no guarda nada
    // y movería la traza de la fila por nada.
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
