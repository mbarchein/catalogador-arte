import { describe, expect, it } from 'vitest'
import {
  ANIO_MINIMO,
  ajustarAnio,
  anioMaximo,
  componerFecha,
  descomponerFecha,
} from './fechaEstructurada'
import { derivarFechaOrden } from './fechas'

describe('componerFecha (RF-207)', () => {
  it('compone los cuatro formatos del esquema', () => {
    expect(componerFecha({ anio: 1978, aproximada: false, anioFin: null })).toBe('1978')
    expect(componerFecha({ anio: 1975, aproximada: false, anioFin: 1978 })).toBe('1975-1978')
    expect(componerFecha({ anio: 1980, aproximada: true, anioFin: null })).toBe('c. 1980')
    expect(componerFecha({ anio: 1975, aproximada: true, anioFin: 1978 })).toBe('c. 1975-1978')
  })

  it('devuelve vacío si no hay año, que es «obra sin fechar»', () => {
    expect(componerFecha({ anio: null, aproximada: true, anioFin: 1980 })).toBe('')
  })

  it('no escribe un rango cuando el año final no es posterior', () => {
    // Pulsar «rango» y no mover el segundo año no debe producir «1978-1978».
    expect(componerFecha({ anio: 1978, aproximada: false, anioFin: 1978 })).toBe('1978')
    expect(componerFecha({ anio: 1978, aproximada: false, anioFin: 1970 })).toBe('1978')
  })
})

describe('descomponerFecha', () => {
  it('reconoce los cuatro formatos', () => {
    expect(descomponerFecha('1978')).toEqual({ anio: 1978, aproximada: false, anioFin: null })
    expect(descomponerFecha('1975-1978')).toEqual({ anio: 1975, aproximada: false, anioFin: 1978 })
    expect(descomponerFecha('c. 1980')).toEqual({ anio: 1980, aproximada: true, anioFin: null })
    expect(descomponerFecha('c. 1975-1978')).toEqual({
      anio: 1975,
      aproximada: true,
      anioFin: 1978,
    })
  })

  it('tolera las variantes que aparecen en catálogos reales', () => {
    // «ca.», sin espacio, con guion largo: se leen igual, aunque al componer se
    // emita siempre la forma canónica.
    expect(descomponerFecha('ca. 1980')?.anio).toBe(1980)
    expect(descomponerFecha('c.1980')?.aproximada).toBe(true)
    expect(descomponerFecha('1975 – 1978')?.anioFin).toBe(1978)
  })

  it('trata el vacío como obra sin fechar, no como texto irrepresentable', () => {
    expect(descomponerFecha('')).toEqual({ anio: null, aproximada: false, anioFin: null })
    expect(descomponerFecha('   ')).toEqual({ anio: null, aproximada: false, anioFin: null })
  })

  it('devuelve null ante un texto que los controles no representan', () => {
    // Esto es lo que protege el dato escrito a mano: la interfaz mostrará un
    // campo de texto en vez de reescribir el matiz.
    expect(descomponerFecha('finales de los setenta')).toBeNull()
    expect(descomponerFecha('1978 [?]')).toBeNull()
    expect(descomponerFecha('c. 1975-1978 o posterior')).toBeNull()
    expect(descomponerFecha('siglo XX')).toBeNull()
  })

  it('devuelve null ante un rango invertido, en vez de normalizarlo en silencio', () => {
    expect(descomponerFecha('1978-1975')).toBeNull()
  })

  it('es la inversa de componerFecha para todo formato representable', () => {
    const casos = [
      { anio: 1978, aproximada: false, anioFin: null },
      { anio: 1975, aproximada: false, anioFin: 1978 },
      { anio: 1980, aproximada: true, anioFin: null },
      { anio: 1975, aproximada: true, anioFin: 1978 },
    ]
    for (const caso of casos) {
      expect(descomponerFecha(componerFecha(caso))).toEqual(caso)
    }
  })

  it('produce siempre un texto del que fecha_orden sabe extraer el año', () => {
    // La cadena completa importa: los controles alimentan fecha_ejecucion, y de
    // ahí sale fecha_orden, que es por lo que se ordena el catálogo.
    expect(derivarFechaOrden(componerFecha({ anio: 1975, aproximada: true, anioFin: 1978 }))).toBe(
      1975,
    )
    expect(derivarFechaOrden(componerFecha({ anio: 1980, aproximada: true, anioFin: null }))).toBe(
      1980,
    )
  })
})

describe('ajustarAnio', () => {
  it('sube y baja de uno en uno', () => {
    expect(ajustarAnio(1978, 1)).toBe(1979)
    expect(ajustarAnio(1978, -1)).toBe(1977)
  })

  it('salta de diez en diez', () => {
    expect(ajustarAnio(1978, 10)).toBe(1988)
    expect(ajustarAnio(1978, -10)).toBe(1968)
  })

  it('no se sale de los límites plausibles', () => {
    expect(ajustarAnio(ANIO_MINIMO, -1)).toBe(ANIO_MINIMO)
    expect(ajustarAnio(anioMaximo(), 1)).toBe(anioMaximo())
    expect(ajustarAnio(1905, -10)).toBe(ANIO_MINIMO)
  })

  it('parte del año en curso si no había fecha', () => {
    expect(ajustarAnio(null, 0)).toBe(anioMaximo())
    expect(ajustarAnio(null, -1)).toBe(anioMaximo() - 1)
  })
})
