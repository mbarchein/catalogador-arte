import { beforeEach, describe, expect, it } from 'vitest'
import { LOTE_INICIAL, guardarLote, leerLote, loteConfigurado, olvidarLote, type Lote } from './lote'

/** Almacén de mentira, para no depender de que el entorno de test tenga uno. */
function almacenFalso(inicial: Record<string, string> = {}): Storage {
  const datos = new Map(Object.entries(inicial))
  return {
    get length() {
      return datos.size
    },
    clear: () => datos.clear(),
    getItem: (k) => datos.get(k) ?? null,
    key: (i) => [...datos.keys()][i] ?? null,
    removeItem: (k) => void datos.delete(k),
    setItem: (k, v) => void datos.set(k, v),
  }
}

/** Almacén que falla siempre, como en navegación privada o con la cuota agotada. */
const almacenRoto: Storage = {
  length: 0,
  clear: () => {
    throw new Error('sin acceso')
  },
  getItem: () => {
    throw new Error('sin acceso')
  },
  key: () => {
    throw new Error('sin acceso')
  },
  removeItem: () => {
    throw new Error('sin acceso')
  },
  setItem: () => {
    throw new Error('sin acceso')
  },
}

let almacen: Storage

beforeEach(() => {
  almacen = almacenFalso()
})

describe('persistencia del lote', () => {
  it('devuelve el lote inicial cuando no hay nada guardado', () => {
    expect(leerLote(almacen)).toEqual(LOTE_INICIAL)
  })

  it('conserva la configuración entre recargas', () => {
    // El caso real: se bloquea la pantalla del móvil en el almacén y se vuelve.
    const lote: Lote = {
      fijos: { artista: 'RUIZ_CAMPINS', tipoObra: 'Dibujo' },
      arrastrados: {
        fecha: { anio: 1968, aproximada: true, anioFin: null, sinConfirmar: true },
        tecnica: 'Carboncillo sobre papel',
        ubicacion: 'edificio b, habitacion 4',
      },
    }
    guardarLote(lote, almacen)
    expect(leerLote(almacen)).toEqual(lote)
  })

  it('olvida el lote al cerrarlo', () => {
    guardarLote(LOTE_INICIAL, almacen)
    olvidarLote(almacen)
    expect(leerLote(almacen)).toEqual(LOTE_INICIAL)
  })
})

describe('resistencia a datos ajenos', () => {
  it('no se rompe con un valor corrupto', () => {
    expect(leerLote(almacenFalso({ 'catalogador.lote': 'no es json{' }))).toEqual(LOTE_INICIAL)
  })

  it('no se rompe con una forma de otra versión', () => {
    // Un lote guardado por una versión anterior de la aplicación no puede
    // impedir catalogar hoy.
    const antiguo = JSON.stringify({ artista: 'ROTILI', tipo: 'Pintura' })
    expect(leerLote(almacenFalso({ 'catalogador.lote': antiguo }))).toEqual(LOTE_INICIAL)
  })

  it('descarta un fondo que no existe en vez de confiarse', () => {
    const raro = JSON.stringify({ fijos: { artista: 'PICASSO', tipoObra: 'Pintura' } })
    expect(leerLote(almacenFalso({ 'catalogador.lote': raro })).fijos.artista).toBe('ROTILI')
  })

  it('descarta tipos equivocados dentro de la fecha', () => {
    const raro = JSON.stringify({
      arrastrados: { fecha: { anio: '1978', aproximada: 'sí', anioFin: [] } },
    })
    expect(leerLote(almacenFalso({ 'catalogador.lote': raro })).arrastrados.fecha).toEqual({
      anio: null,
      aproximada: false,
      anioFin: null,
      sinConfirmar: false,
    })
  })

  it('sigue funcionando sin almacén disponible', () => {
    // Navegación privada: se cataloga igual, solo se pierde la persistencia.
    expect(() => guardarLote(LOTE_INICIAL, almacenRoto)).not.toThrow()
    expect(() => olvidarLote(almacenRoto)).not.toThrow()
    expect(leerLote(almacenRoto)).toEqual(LOTE_INICIAL)
  })
})

describe('loteConfigurado', () => {
  it('exige tipo de obra antes de empezar a capturar', () => {
    expect(loteConfigurado(LOTE_INICIAL)).toBe(false)
    expect(
      loteConfigurado({
        ...LOTE_INICIAL,
        fijos: { artista: 'ROTILI', tipoObra: 'Pintura' },
      }),
    ).toBe(true)
  })

  it('no acepta un tipo que solo tiene espacios', () => {
    expect(
      loteConfigurado({ ...LOTE_INICIAL, fijos: { artista: 'ROTILI', tipoObra: '   ' } }),
    ).toBe(false)
  })
})
