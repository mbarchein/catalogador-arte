import { describe, expect, it } from 'vitest'
import { clearHiddenFunds, readHiddenFunds, saveHiddenFunds } from './artistFundsCache'

/**
 * Los fondos apartados, recordados en el dispositivo (RNF-106).
 *
 * Existe por lo que se veía: **al cambiar a «Obras» salía el catálogo entero y un momento
 * después desaparecían las obras del fondo de pruebas**. El listado pinta al instante de su
 * espejo, pero qué fondos están apartados venía de una consulta aparte.
 */

function fakeStorage(negarse = false): Storage {
  const data = new Map<string, string>()
  return {
    get length() {
      return data.size
    },
    clear: () => data.clear(),
    getItem: (k: string) => data.get(k) ?? null,
    key: (i: number) => [...data.keys()][i] ?? null,
    removeItem: (k: string) => data.delete(k),
    setItem: (k: string, v: string) => {
      if (negarse) throw new Error('QuotaExceededError')
      data.set(k, v)
    },
  } as Storage
}

describe('guardar y leer los fondos apartados', () => {
  it('lo que se guarda es lo que se lee', () => {
    const storage = fakeStorage()
    saveHiddenFunds(['TEST'], storage)
    expect(readHiddenFunds(storage)).toEqual(new Set(['TEST']))
  })

  it('«ninguno apartado» es una respuesta y se guarda como tal', () => {
    // Sin esto, quitar el interruptor de un fondo lo dejaría apartado en este teléfono
    // hasta que se borrara el espejo: el conjunto vacío tiene que poder guardarse.
    const storage = fakeStorage()
    saveHiddenFunds(['TEST'], storage)
    saveHiddenFunds([], storage)
    expect(readHiddenFunds(storage)).toEqual(new Set())
  })

  it('sin nada guardado, null: no es lo mismo que «ninguno»', () => {
    // La distinción es el sentido entero de este módulo: «no hay ninguno apartado» es una
    // respuesta, y «nunca lo he preguntado» no lo es.
    expect(readHiddenFunds(fakeStorage())).toBeNull()
  })

  it('sin almacenamiento no se rompe: el listado vuelve a parpadear una vez', () => {
    expect(() => saveHiddenFunds(['TEST'], undefined)).not.toThrow()
    expect(readHiddenFunds(undefined)).toBeNull()
    expect(() => clearHiddenFunds(undefined)).not.toThrow()
  })

  it('y si el almacenamiento se niega —cuota, navegación privada— tampoco', () => {
    expect(() => saveHiddenFunds(['TEST'], fakeStorage(true))).not.toThrow()
  })
})

describe('lo que no se reconoce se tira', () => {
  const guardar = (value: unknown) => {
    const storage = fakeStorage()
    storage.setItem('catalogador.hidden-funds', JSON.stringify(value))
    return storage
  }

  it('una versión anterior', () => {
    expect(readHiddenFunds(guardar({ v: 0, hidden: ['TEST'] }))).toBeNull()
  })

  it('lo que no es una lista', () => {
    expect(readHiddenFunds(guardar({ v: 1, hidden: 'TEST' }))).toBeNull()
  })

  it('un fondo que el esquema no conoce se cae, y el resto se queda', () => {
    // Un código inventado no podría coincidir con el fondo de ninguna obra, pero dejarlo
    // fuera evita que lo que lee esto lleve un valor que los tipos prometen.
    expect(readHiddenFunds(guardar({ v: 1, hidden: ['TEST', 'INVENTADO'] }))).toEqual(
      new Set(['TEST']),
    )
  })

  it('y un contenido que no es ni JSON', () => {
    const storage = fakeStorage()
    storage.setItem('catalogador.hidden-funds', 'esto no es json')
    expect(readHiddenFunds(storage)).toBeNull()
  })
})

describe('cerrar sesión no lo deja puesto', () => {
  it('lo borra', () => {
    const storage = fakeStorage()
    saveHiddenFunds(['TEST'], storage)
    clearHiddenFunds(storage)
    expect(readHiddenFunds(storage)).toBeNull()
  })
})
