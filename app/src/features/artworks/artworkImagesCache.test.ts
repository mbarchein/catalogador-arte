import { describe, expect, it } from 'vitest'
import type { ImageRow } from './artworkImages'
import {
  MAX_MIRRORED_ARTWORKS,
  clearArtworkImagesCache,
  readArtworkImagesSnapshot,
  saveArtworkImagesSnapshot,
} from './artworkImagesCache'

/**
 * El espejo de las fotografías de una ficha (RNF-106).
 *
 * Existe por lo que se veía: **al reabrir una ficha las fotos parpadeaban**. Lo que se fija
 * aquí son las formas en las que un espejo puede ser PEOR que no tenerlo: romper la
 * galería con lo que haya guardado, pintar una miniatura que no lleva a ninguna parte,
 * crecer sin freno en un almacenamiento de 5 MB, o quedarse en el navegador después de
 * cerrar sesión.
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

const row = (over: Partial<ImageRow> = {}): ImageRow =>
  ({
    image_id: 'AR-0001_v1',
    thumbnail_path: 'obras/AR-0001/v1_thumb.jpg',
    derivative_path: 'obras/AR-0001/v1_web.jpg',
    master_path: 'obras/AR-0001/v1.jpg',
    shot_type: 'GENERAL',
    index_image: true,
    photo_date: null,
    sort_order: 1,
    rotation: 0,
    crop_x: null,
    crop_y: null,
    crop_width: null,
    crop_height: null,
    corner_nw_x: null,
    corner_nw_y: null,
    corner_ne_x: null,
    corner_ne_y: null,
    corner_se_x: null,
    corner_se_y: null,
    corner_sw_x: null,
    corner_sw_y: null,
    ...over,
  }) as ImageRow

const snapshot = (rows: ImageRow[] = [row()]) => ({
  rows,
  mainId: rows[0]?.image_id ?? null,
  manuallyChosen: false,
})

/** Lo que guardaría una versión con otra forma, o un navegador con basura dentro. */
function guardarACrudo(storage: Storage, value: unknown): void {
  storage.setItem('catalogador.artwork-images-mirror', JSON.stringify(value))
}

describe('guardar y leer las fotografías de una ficha', () => {
  it('lo que se guarda es lo que se lee, portada incluida', () => {
    const storage = fakeStorage()
    saveArtworkImagesSnapshot('AR-0001', snapshot(), storage)
    const read = readArtworkImagesSnapshot('AR-0001', storage)
    expect(read?.rows.map((each) => each.image_id)).toEqual(['AR-0001_v1'])
    // La portada es lo que decide la vista `representative_image`, y el cliente no la
    // recalcula: si el espejo la perdiera, la ficha abriría por otra fotografía.
    expect(read?.mainId).toBe('AR-0001_v1')
    // Y las rutas de los dos ficheros, que son con lo que se pinta la tira y el carrusel.
    expect(read?.rows[0]?.derivative_path).toBe('obras/AR-0001/v1_web.jpg')
  })

  it('cada ficha tiene el suyo: preguntar por otra no devuelve las fotos de la primera', () => {
    const storage = fakeStorage()
    saveArtworkImagesSnapshot('AR-0001', snapshot(), storage)
    expect(readArtworkImagesSnapshot('AR-0002', storage)).toBeNull()
  })

  it('una ficha sin fotografías se recuerda: es «Imagen no disponible», no «no lo sé»', () => {
    const storage = fakeStorage()
    saveArtworkImagesSnapshot('AR-0009', { rows: [], mainId: null, manuallyChosen: false }, storage)
    expect(readArtworkImagesSnapshot('AR-0009', storage)).toEqual({
      rows: [],
      mainId: null,
      manuallyChosen: false,
    })
  })

  it('sin almacenamiento no se rompe: solo se pierde el pintado instantáneo', () => {
    expect(() => saveArtworkImagesSnapshot('AR-0001', snapshot(), undefined)).not.toThrow()
    expect(readArtworkImagesSnapshot('AR-0001', undefined)).toBeNull()
  })

  it('y si el almacenamiento se niega —cuota, navegación privada— tampoco', () => {
    expect(() => saveArtworkImagesSnapshot('AR-0001', snapshot(), fakeStorage(true))).not.toThrow()
  })
})

describe('lo que no se reconoce se tira, en vez de romper la galería', () => {
  it('una versión anterior se descarta entera: el espejo es una copia y se rehace', () => {
    const storage = fakeStorage()
    guardarACrudo(storage, { v: 0, records: { 'AR-0001': { ...snapshot(), at: 1 } } })
    expect(readArtworkImagesSnapshot('AR-0001', storage)).toBeNull()
  })

  it('una fila sin ruta de miniatura invalida la ficha entera', () => {
    // Pintar esa fila sería un hueco en la tira que no lleva a ninguna parte, y no se
    // puede distinguir de una fotografía que aún no ha llegado.
    const storage = fakeStorage()
    // El tipo no admite una fila sin ruta; guardado en el navegador puede estar de todo,
    // que es de lo que trata este bloque.
    const sinRuta = { ...row(), thumbnail_path: null } as unknown as ImageRow
    guardarACrudo(storage, {
      v: 1,
      records: { 'AR-0001': { ...snapshot([row(), sinRuta]), at: 1 } },
    })
    expect(readArtworkImagesSnapshot('AR-0001', storage)).toBeNull()
  })

  it('y una sin tipo de toma, porque el tipo es el rótulo de la tira', () => {
    const storage = fakeStorage()
    guardarACrudo(storage, {
      v: 1,
      records: { 'AR-0001': { ...snapshot([row({ shot_type: undefined })]), at: 1 } },
    })
    expect(readArtworkImagesSnapshot('AR-0001', storage)).toBeNull()
  })

  it('lo que no es una lista de filas, también', () => {
    const storage = fakeStorage()
    guardarACrudo(storage, { v: 1, records: { 'AR-0001': { rows: { image_id: 'x' }, at: 1 } } })
    expect(readArtworkImagesSnapshot('AR-0001', storage)).toBeNull()
  })

  it('y un contenido que no es ni JSON', () => {
    const storage = fakeStorage()
    storage.setItem('catalogador.artwork-images-mirror', 'esto no es json')
    expect(readArtworkImagesSnapshot('AR-0001', storage)).toBeNull()
  })
})

describe('el espejo está acotado', () => {
  it('se guardan las últimas fichas visitadas y las más antiguas se van', () => {
    // `localStorage` son 5 MB para todo, y catalogar avanza por la secuencia: el espejo
    // útil es siempre el reciente.
    const storage = fakeStorage()
    const total = MAX_MIRRORED_ARTWORKS + 5
    const nombre = (i: number) => `AR-${String(i).padStart(4, '0')}`
    for (let i = 0; i < total; i += 1) {
      saveArtworkImagesSnapshot(nombre(i), snapshot(), storage, 1_000 + i)
    }
    // La primera ya no está; la última sí.
    expect(readArtworkImagesSnapshot(nombre(0), storage)).toBeNull()
    expect(readArtworkImagesSnapshot(nombre(total - 1), storage)).not.toBeNull()

    const stored = JSON.parse(storage.getItem('catalogador.artwork-images-mirror') ?? '{}') as {
      records: Record<string, unknown>
    }
    expect(Object.keys(stored.records)).toHaveLength(MAX_MIRRORED_ARTWORKS)
  })

  it('volver a una ficha la pone al día: no se va por antigua estando en uso', () => {
    const storage = fakeStorage()
    saveArtworkImagesSnapshot('AR-0001', snapshot(), storage, 1_000)
    saveArtworkImagesSnapshot('AR-0001', snapshot(), storage, 9_000)
    for (let i = 0; i < MAX_MIRRORED_ARTWORKS; i += 1) {
      saveArtworkImagesSnapshot(`AR-1${String(i).padStart(3, '0')}`, snapshot(), storage, 2_000 + i)
    }
    expect(readArtworkImagesSnapshot('AR-0001', storage)).not.toBeNull()
  })
})

describe('cerrar sesión no deja el catálogo en el navegador', () => {
  it('borra el espejo entero', () => {
    const storage = fakeStorage()
    saveArtworkImagesSnapshot('AR-0001', snapshot(), storage)
    saveArtworkImagesSnapshot('AR-0002', snapshot(), storage)
    clearArtworkImagesCache(storage)
    expect(readArtworkImagesSnapshot('AR-0001', storage)).toBeNull()
    expect(readArtworkImagesSnapshot('AR-0002', storage)).toBeNull()
  })

  it('y sin almacenamiento no revienta', () => {
    expect(() => clearArtworkImagesCache(undefined)).not.toThrow()
  })
})
