import { describe, expect, it } from 'vitest'
import { anioParaBuscar, mostrarFecha } from './fechas'

describe('anioParaBuscar (rescate del año de una fecha_nota, ADR-004)', () => {
  it('toma el año de una fecha exacta', () => {
    expect(anioParaBuscar('1978')).toBe(1978)
  })

  it('toma el año de inicio de un rango', () => {
    expect(anioParaBuscar('1975-1978')).toBe(1975)
  })

  it('toma el año de una fecha aproximada', () => {
    expect(anioParaBuscar('c. 1980')).toBe(1980)
  })

  it('toma el año de inicio de un rango aproximado', () => {
    expect(anioParaBuscar('c. 1975-1978')).toBe(1975)
  })

  it('devuelve null cuando no hay fecha', () => {
    expect(anioParaBuscar('')).toBeNull()
    expect(anioParaBuscar('sin fechar')).toBeNull()
  })

  it('ignora un año implausible en vez de ordenar mal en silencio', () => {
    // Cuatro dígitos que no son un año: una medida, un número de inventario
    // antiguo o un dedazo. Ordenar por 197 o por 9999 sería peor que no ordenar.
    expect(anioParaBuscar('0197')).toBeNull()
    expect(anioParaBuscar('9999')).toBeNull()
  })

  it('acepta el año en curso', () => {
    const esteAnio = new Date().getFullYear()
    expect(anioParaBuscar(String(esteAnio))).toBe(esteAnio)
  })

  it('rescata el año de una redacción libre', () => {
    // El caso real de fecha_nota: la estructura no representa el matiz, pero el
    // año debe seguir sirviendo para las búsquedas por época.
    expect(anioParaBuscar('hacia 1972, quizá')).toBe(1972)
    expect(anioParaBuscar('anterior a 1965 según la familia')).toBe(1965)
    expect(anioParaBuscar('finales de los setenta')).toBeNull()
  })
})

describe('mostrarFecha', () => {
  it('dice que no hay fecha en vez de dejar un hueco', () => {
    expect(mostrarFecha('')).toBe('Sin fecha')
    expect(mostrarFecha('   ')).toBe('Sin fecha')
  })

  it('respeta el texto tal como se documentó', () => {
    expect(mostrarFecha('c. 1975-1978')).toBe('c. 1975-1978')
  })
})
