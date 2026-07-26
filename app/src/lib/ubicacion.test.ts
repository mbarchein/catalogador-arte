import { describe, expect, it } from 'vitest'
import { normalizarUbicacion, ubicacionParaGuardar } from './ubicacion'

describe('normalizarUbicacion (convención del esquema v11)', () => {
  it('pasa a minúsculas', () => {
    expect(normalizarUbicacion('Edificio A')).toBe('edificio a')
  })

  it('quita los acentos', () => {
    expect(normalizarUbicacion('Habitación Amarilla')).toBe('habitacion amarilla')
    expect(normalizarUbicacion('estantería')).toBe('estanteria')
  })

  it('conserva la ñ, que es una letra y no un acento', () => {
    // Convertir «muñeca» en «muneca» no sería normalizar, sería una falta.
    expect(normalizarUbicacion('Sala de la Muñeca')).toBe('sala de la muñeca')
    expect(normalizarUbicacion('PEÑA')).toBe('peña')
  })

  it('ordena los espacios alrededor de las comas', () => {
    expect(normalizarUbicacion('edificio a,habitacion 4')).toBe('edificio a, habitacion 4')
    expect(normalizarUbicacion('edificio a  ,   habitacion 4')).toBe('edificio a, habitacion 4')
  })

  it('colapsa los espacios repetidos', () => {
    expect(normalizarUbicacion('edificio    a')).toBe('edificio a')
  })

  it('deja el espacio final mientras se escribe', () => {
    // Sin esto no se puede teclear «edificio a, habitacion»: el espacio tras la
    // coma desaparecería en cuanto se escribe.
    expect(normalizarUbicacion('edificio a, ')).toBe('edificio a, ')
  })

  it('convierte dos escrituras distintas del mismo sitio en la misma cadena', () => {
    // Es la razón de ser de la convención: agrupar por ubicación para generar
    // listados de trabajo.
    const a = normalizarUbicacion('Edificio B, Habitación 4, Estantería 3')
    const b = normalizarUbicacion('edificio b,habitacion 4,   estanteria 3')
    expect(a).toBe(b)
    expect(a).toBe('edificio b, habitacion 4, estanteria 3')
  })
})

describe('ubicacionParaGuardar', () => {
  it('recorta la coma o el espacio que quedaron al final', () => {
    expect(ubicacionParaGuardar('edificio a, habitacion 4, ')).toBe('edificio a, habitacion 4')
    expect(ubicacionParaGuardar('edificio a,')).toBe('edificio a')
  })

  it('deja vacío lo que solo tenía separadores', () => {
    expect(ubicacionParaGuardar('  ,  ')).toBe('')
  })
})
