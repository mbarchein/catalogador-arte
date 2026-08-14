import { describe, expect, it } from 'vitest'
import {
  clearRememberedRole,
  readRememberedRole,
  rememberRole,
  remembersEditing,
} from './rememberedRole'

/**
 * El papel que el dispositivo recuerda (RNF-106).
 *
 * Existe por lo que se veía: **el menú de abajo abría con tres pestañas y se convertía en
 * cinco un momento después**, porque «Añadir» y «Tablas» dependen del papel y el papel
 * llega en una consulta aparte. Lo que se fija aquí es lo que separa esto de un agujero:
 * que lo guardado no sirva para OTRO usuario del mismo teléfono, que lo que no se reconozca
 * se tire, y que cerrar sesión no lo deje puesto.
 *
 * Lo que manda sigue siendo `profiles`, y lo que protege los datos son las políticas RLS:
 * la clave anónima viaja en el cliente, así que un booleano de aquí no podría ser un
 * permiso ni queriendo.
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

describe('guardar y leer el papel', () => {
  it('lo que se guarda es lo que se lee, con su dueño', () => {
    const storage = fakeStorage()
    rememberRole('u-1', 'CATALOGER', storage)
    expect(readRememberedRole(storage)).toEqual({ userId: 'u-1', role: 'CATALOGER' })
  })

  it('sin nada guardado, null: el menú espera la respuesta como antes', () => {
    expect(readRememberedRole(fakeStorage())).toBeNull()
  })

  it('se recuerda uno solo, el del último que entró', () => {
    const storage = fakeStorage()
    rememberRole('u-1', 'CATALOGER', storage)
    rememberRole('u-2', 'READER', storage)
    expect(readRememberedRole(storage)).toEqual({ userId: 'u-2', role: 'READER' })
  })

  it('sin almacenamiento no se rompe: las pestañas vuelven a aparecer un momento tarde', () => {
    expect(() => rememberRole('u-1', 'CATALOGER', undefined)).not.toThrow()
    expect(readRememberedRole(undefined)).toBeNull()
    expect(() => clearRememberedRole(undefined)).not.toThrow()
  })

  it('y si el almacenamiento se niega —cuota, navegación privada— tampoco', () => {
    expect(() => rememberRole('u-1', 'CATALOGER', fakeStorage(true))).not.toThrow()
  })
})

describe('lo que no se reconoce se tira', () => {
  const guardar = (value: unknown) => {
    const storage = fakeStorage()
    storage.setItem('catalogador.remembered-role', JSON.stringify(value))
    return storage
  }

  it('una versión anterior', () => {
    expect(readRememberedRole(guardar({ v: 0, userId: 'u-1', role: 'CATALOGER' }))).toBeNull()
  })

  it('un papel que no existe: nadie es «ADMIN» en este esquema', () => {
    expect(readRememberedRole(guardar({ v: 1, userId: 'u-1', role: 'ADMIN' }))).toBeNull()
  })

  it('un papel sin dueño, que no se podría comprobar contra nadie', () => {
    expect(readRememberedRole(guardar({ v: 1, role: 'CATALOGER' }))).toBeNull()
    expect(readRememberedRole(guardar({ v: 1, userId: '', role: 'CATALOGER' }))).toBeNull()
  })

  it('y un contenido que no es ni JSON', () => {
    const storage = fakeStorage()
    storage.setItem('catalogador.remembered-role', 'esto no es json')
    expect(readRememberedRole(storage)).toBeNull()
  })
})

describe('solo vale para la sesión de su dueño', () => {
  it('el mismo usuario que catalogaba, sí', () => {
    expect(remembersEditing({ userId: 'u-1', role: 'CATALOGER' }, 'u-1')).toBe(true)
    expect(remembersEditing({ userId: 'u-1', role: 'SUPERUSER' }, 'u-1')).toBe(true)
  })

  it('otro usuario del mismo teléfono, no', () => {
    // Es el caso que importa: dos personas comparten el teléfono, y a quien solo
    // consulta no se le puede abrir el menú de quien cataloga — le llevaría a pantallas
    // que la base rechaza, y eso se lee como una aplicación rota y no como un permiso
    // que no tiene.
    expect(remembersEditing({ userId: 'u-1', role: 'CATALOGER' }, 'u-2')).toBe(false)
  })

  it('sin sesión abierta, tampoco', () => {
    expect(remembersEditing({ userId: 'u-1', role: 'CATALOGER' }, null)).toBe(false)
  })

  it('y quien solo consultaba no gana nada por recordarse', () => {
    expect(remembersEditing({ userId: 'u-1', role: 'READER' }, 'u-1')).toBe(false)
    expect(remembersEditing(null, 'u-1')).toBe(false)
  })
})

describe('cerrar sesión no lo deja puesto', () => {
  it('lo borra', () => {
    const storage = fakeStorage()
    rememberRole('u-1', 'CATALOGER', storage)
    clearRememberedRole(storage)
    expect(readRememberedRole(storage)).toBeNull()
  })
})
