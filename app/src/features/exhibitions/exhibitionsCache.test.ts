import { describe, expect, it } from 'vitest'
import type { ExhibitionRow } from '../documentary/documentaryRows'
import {
  clearExhibitionsCache,
  readExhibitionsSnapshot,
  saveExhibitionsSnapshot,
} from './exhibitionsCache'

/**
 * El espejo del listado de exposiciones (RNF-106).
 *
 * Existe por lo que se veía: al cambiar a la pestaña salía «Cargando las exposiciones…»
 * cada vez. Lo que se fija aquí son las formas en las que un espejo puede ser PEOR que no
 * tenerlo: romper la pantalla con lo que haya guardado, pintar filas de una versión que ya
 * no cuadra con el código, o quedarse en el navegador después de cerrar sesión.
 */

/** Un almacenamiento de mentira, que además puede negarse a escribir. */
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

const row = (over: Partial<ExhibitionRow> = {}): ExhibitionRow =>
  ({
    id: 'ex-1',
    title: 'Rotili. Obra reciente',
    exhibition_type: 'INDIVIDUAL',
    venue_id: null,
    venue_note: '',
    year: 1985,
    start_date: null,
    end_date: null,
    date_note: '',
    catalogue_published: 'UNREVIEWED',
    catalogue_reference_id: null,
    note: '',
    poster_thumbnail_path: null,
    poster_derivative_path: null,
    poster_uploaded_at: null,
    active: true,
    venue: null,
    ...over,
  }) as ExhibitionRow

describe('guardar y leer el listado', () => {
  it('lo que se guarda es lo que se lee', () => {
    const storage = fakeStorage()
    saveExhibitionsSnapshot([row(), row({ id: 'ex-2', title: 'Colectiva' })], storage)
    const read = readExhibitionsSnapshot(storage)
    expect(read?.map((each) => each.id)).toEqual(['ex-1', 'ex-2'])
    // Y con las columnas del cartel dentro: son las que pinta la miniatura de la fila.
    expect(read?.[0]).toHaveProperty('poster_thumbnail_path', null)
  })

  it('sin nada guardado, null: se consulta como siempre', () => {
    expect(readExhibitionsSnapshot(fakeStorage())).toBeNull()
  })

  it('sin almacenamiento tampoco se rompe: solo se pierde el pintado instantáneo', () => {
    expect(() => saveExhibitionsSnapshot([row()], undefined)).not.toThrow()
    expect(readExhibitionsSnapshot(undefined)).toBeNull()
  })

  it('y si el almacenamiento se niega —cuota, navegación privada— tampoco', () => {
    expect(() => saveExhibitionsSnapshot([row()], fakeStorage(true))).not.toThrow()
  })
})

describe('lo que no se reconoce se tira, en vez de romper la pantalla', () => {
  it('una versión anterior se descarta entera: el espejo es una copia y se rehace', () => {
    const storage = fakeStorage()
    storage.setItem('catalogador.exhibitions-mirror', JSON.stringify({ v: 0, rows: [row()] }))
    expect(readExhibitionsSnapshot(storage)).toBeNull()
  })

  it('lo que no es una lista, también', () => {
    const storage = fakeStorage()
    storage.setItem('catalogador.exhibitions-mirror', JSON.stringify({ v: 1, rows: { id: 'x' } }))
    expect(readExhibitionsSnapshot(storage)).toBeNull()
  })

  it('una fila sin identificador o sin título invalida el espejo', () => {
    // Son las dos cosas con las que se pinta y se enlaza una fila: sin ellas la lista
    // sería una fila que no lleva a ninguna parte.
    const storage = fakeStorage()
    storage.setItem(
      'catalogador.exhibitions-mirror',
      JSON.stringify({ v: 1, rows: [row(), { id: 'ex-3' }] }),
    )
    expect(readExhibitionsSnapshot(storage)).toBeNull()
  })

  it('y un contenido que no es ni JSON', () => {
    const storage = fakeStorage()
    storage.setItem('catalogador.exhibitions-mirror', 'esto no es json')
    expect(readExhibitionsSnapshot(storage)).toBeNull()
  })
})

describe('cerrar sesión no deja el catálogo en el navegador', () => {
  it('borra el espejo', () => {
    // Son datos del catálogo en un dispositivo que puede ser compartido, no una
    // preferencia.
    const storage = fakeStorage()
    saveExhibitionsSnapshot([row()], storage)
    clearExhibitionsCache(storage)
    expect(readExhibitionsSnapshot(storage)).toBeNull()
  })

  it('y sin almacenamiento no revienta', () => {
    expect(() => clearExhibitionsCache(undefined)).not.toThrow()
  })
})
