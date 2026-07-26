import { describe, expect, it } from 'vitest'
import { derivarFechaOrden, mostrarFecha } from './fechas'

describe('derivarFechaOrden (RF-207)', () => {
  it('toma el año de una fecha exacta', () => {
    expect(derivarFechaOrden('1978')).toBe(1978)
  })

  it('toma el año de inicio de un rango', () => {
    expect(derivarFechaOrden('1975-1978')).toBe(1975)
  })

  it('toma el año de una fecha aproximada', () => {
    expect(derivarFechaOrden('c. 1980')).toBe(1980)
  })

  it('toma el año de inicio de un rango aproximado', () => {
    expect(derivarFechaOrden('c. 1975-1978')).toBe(1975)
  })

  it('devuelve null cuando no hay fecha', () => {
    expect(derivarFechaOrden('')).toBeNull()
    expect(derivarFechaOrden('sin fechar')).toBeNull()
  })

  it('ignora un año implausible en vez de ordenar mal en silencio', () => {
    // Cuatro dígitos que no son un año: una medida, un número de inventario
    // antiguo o un dedazo. Ordenar por 197 o por 9999 sería peor que no ordenar.
    expect(derivarFechaOrden('0197')).toBeNull()
    expect(derivarFechaOrden('9999')).toBeNull()
  })

  it('acepta el año en curso', () => {
    const esteAnio = new Date().getFullYear()
    expect(derivarFechaOrden(String(esteAnio))).toBe(esteAnio)
  })

  it('ordena correctamente un conjunto con los cuatro formatos mezclados', () => {
    const fechas = ['c. 1975-1978', '1968', '1978', 'c. 1980', '']
    const ordenadas = [...fechas].sort(
      (a, b) => (derivarFechaOrden(a) ?? Infinity) - (derivarFechaOrden(b) ?? Infinity),
    )
    // Las obras sin fecha van al final: no se sabe dónde colocarlas, y ponerlas
    // primero fingiría una cronología que no existe.
    expect(ordenadas).toEqual(['1968', 'c. 1975-1978', '1978', 'c. 1980', ''])
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
