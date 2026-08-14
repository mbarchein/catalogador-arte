import { describe, expect, it } from 'vitest'
import {
  clearNextIds,
  nextCatalogIdAfter,
  readNextIds,
  rememberedNextId,
  saveNextIds,
} from './nextCatalogId'

/**
 * El siguiente número de catalogación, sin esperar a la consulta (DP-01, RNF-106).
 *
 * Existe por lo que se veía en la captura en lote: la cabecera dice «· siguiente AR-0043»
 * —que es el número que se escribe en la etiqueta pegada a la obra— y venía de un viaje de
 * ida y vuelta, así que aparecía un momento después de la pantalla y, tras guardar cada
 * obra, **seguía enseñando el número que se acababa de usar** hasta que llegaba la
 * respuesta siguiente.
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

describe('el identificador que sigue a otro', () => {
  it('suma uno y conserva las cuatro cifras', () => {
    // La misma regla de la base: `max(numero) + 1` con `lpad` a cuatro.
    expect(nextCatalogIdAfter('AR-0042')).toBe('AR-0043')
    expect(nextCatalogIdAfter('TS-0001')).toBe('TS-0002')
  })

  it('el acarreo no rompe el ancho', () => {
    expect(nextCatalogIdAfter('AR-0099')).toBe('AR-0100')
    expect(nextCatalogIdAfter('RC-0999')).toBe('RC-1000')
  })

  it('pasado el 9999 crece, como hace `lpad`', () => {
    expect(nextCatalogIdAfter('AR-9999')).toBe('AR-10000')
  })

  it('lo que no tiene forma de identificador no se inventa', () => {
    // Antes que adivinar, la cabecera se queda con el número que ya tenía y la consulta
    // lo corrige: un número inventado se copiaría en una etiqueta física.
    expect(nextCatalogIdAfter('')).toBeNull()
    expect(nextCatalogIdAfter('AR-12')).toBeNull()
    expect(nextCatalogIdAfter('ARTE-0001')).toBeNull()
    expect(nextCatalogIdAfter('ar-0001')).toBeNull()
  })
})

describe('lo que el dispositivo recuerda de cada fondo', () => {
  it('lo que se guarda es lo que se lee', () => {
    const storage = fakeStorage()
    saveNextIds({ ROTILI: 'AR-0043', TEST: 'TS-0007' }, storage)
    expect(readNextIds(storage)).toEqual({ ROTILI: 'AR-0043', TEST: 'TS-0007' })
  })

  it('cada fondo el suyo, que es lo que evita el número de otro sobre este lote', () => {
    const ids = { ROTILI: 'AR-0043', TEST: 'TS-0007' }
    expect(rememberedNextId(ids, 'TEST')).toBe('TS-0007')
    // Un fondo del que no se sabe nada no hereda el número del anterior: se calla.
    expect(rememberedNextId(ids, 'RUIZ_CAMPINS')).toBeNull()
  })

  it('sin nada guardado, nada', () => {
    expect(readNextIds(fakeStorage())).toEqual({})
  })

  it('sin almacenamiento no se rompe: el número vuelve a aparecer un momento tarde', () => {
    expect(() => saveNextIds({ ROTILI: 'AR-0043' }, undefined)).not.toThrow()
    expect(readNextIds(undefined)).toEqual({})
    expect(() => clearNextIds(undefined)).not.toThrow()
  })

  it('y si el almacenamiento se niega —cuota, navegación privada— tampoco', () => {
    expect(() => saveNextIds({ ROTILI: 'AR-0043' }, fakeStorage(true))).not.toThrow()
  })
})

describe('lo que no se reconoce se tira', () => {
  const guardar = (value: unknown) => {
    const storage = fakeStorage()
    storage.setItem('catalogador.next-catalog-id', JSON.stringify(value))
    return storage
  }

  it('una versión anterior', () => {
    expect(readNextIds(guardar({ v: 0, ids: { ROTILI: 'AR-0043' } }))).toEqual({})
  })

  it('un valor que no tiene forma de identificador', () => {
    // Pintarlo sería enseñar basura en el sitio donde se lee el número de la etiqueta.
    expect(readNextIds(guardar({ v: 1, ids: { ROTILI: 'AR-43' } }))).toEqual({})
    expect(readNextIds(guardar({ v: 1, ids: { ROTILI: 42 } }))).toEqual({})
  })

  it('un fondo que el esquema no conoce se cae, y el resto se queda', () => {
    expect(
      readNextIds(guardar({ v: 1, ids: { ROTILI: 'AR-0043', INVENTADO: 'XX-0001' } })),
    ).toEqual({ ROTILI: 'AR-0043' })
  })

  it('y un contenido que no es ni JSON', () => {
    const storage = fakeStorage()
    storage.setItem('catalogador.next-catalog-id', 'esto no es json')
    expect(readNextIds(storage)).toEqual({})
  })
})

describe('cerrar sesión no lo deja puesto', () => {
  it('lo borra: dice cuántas obras tiene el catálogo', () => {
    const storage = fakeStorage()
    saveNextIds({ ROTILI: 'AR-0043' }, storage)
    clearNextIds(storage)
    expect(readNextIds(storage)).toEqual({})
  })
})
