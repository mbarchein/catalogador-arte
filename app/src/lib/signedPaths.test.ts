import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  clearSignedPaths,
  forgetSignedPaths,
  mergeSigned,
  pathsToSign,
  readSignedPaths,
  saveSignedPaths,
  signPaths,
  MAX_SIGNED_PATHS,
  SIGNED_TTL_SECONDS,
  SIGN_MARGIN_MS,
  type SignedPathMap,
} from './signedPaths'

/**
 * Las firmas guardadas (RF-110, RNF-106).
 *
 * El *bucket* es privado, así que cada imagen se pinta con una URL firmada. Los bytes
 * ya no viajaban dos veces —los guarda el *service worker*, por ruta— pero la firma sí:
 * la ficha firmaba cada miniatura por separado y con una hora de validez, sin
 * guardarla. Y lo que se notaba no era el tráfico: **sin cobertura, una ficha ya vista
 * no enseñaba sus fotos**, porque sin firma no hay `src` que buscar en el caché.
 *
 * Lo que se fija aquí son las formas de que esto sea PEOR que no tenerlo: volver a
 * firmar lo que ya valía —que produce otra URL, y otra URL es otra imagen para
 * cualquier caché, con lo que se pierde justo lo que se quería ganar—, entregar una
 * firma que caduca a media visita, y crecer sin tope en un `localStorage` de 5 MB.
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
    removeItem: (k: string) => void data.delete(k),
    setItem: (k: string, v: string) => {
      if (negarse) throw new Error('cuota')
      data.set(k, v)
    },
  } as Storage
}

const AHORA = 1_800_000_000_000
const firma = (expiresAt: number) => ({ url: 'https://x/a?token=1', expiresAt })

afterEach(() => forgetSignedPaths())

describe('qué hay que volver a firmar', () => {
  it('lo que no está', () => {
    expect(pathsToSign(['a', 'b'], {}, AHORA)).toEqual(['a', 'b'])
  })

  it('y NO lo que sigue valiendo, que es de lo que va todo esto', () => {
    // Volver a firmar produce otra URL, y otra URL es otra imagen para el caché de
    // bytes: se descargaría de nuevo un fichero que ya está en el teléfono.
    const cached: SignedPathMap = { a: firma(AHORA + SIGNED_TTL_SECONDS * 1000) }
    expect(pathsToSign(['a'], cached, AHORA)).toEqual([])
  })

  it('lo que caduca dentro del margen se renueva antes de que estorbe', () => {
    // Una firma que expira a media visita deja imágenes roas en pantalla, y la
    // aplicación puede estar abierta toda la mañana.
    const justo = { a: firma(AHORA + SIGN_MARGIN_MS + 1000) }
    const apurado = { a: firma(AHORA + SIGN_MARGIN_MS - 1000) }
    expect(pathsToSign(['a'], justo, AHORA)).toEqual([])
    expect(pathsToSign(['a'], apurado, AHORA)).toEqual(['a'])
  })

  it('lo caducado, claro', () => {
    expect(pathsToSign(['a'], { a: firma(AHORA - 1) }, AHORA)).toEqual(['a'])
  })

  it('y una ruta pedida dos veces se firma una', () => {
    expect(pathsToSign(['a', 'a', 'b'], {}, AHORA)).toEqual(['a', 'b'])
  })
})

describe('lo que se guarda', () => {
  it('las nuevas entran y las caducadas se van', () => {
    const merged = mergeSigned(
      { viejo: firma(AHORA - 1), vale: firma(AHORA + 10_000) },
      { nuevo: 'https://x/n?token=2' },
      AHORA + 99_000,
      AHORA,
    )
    expect(Object.keys(merged).sort()).toEqual(['nuevo', 'vale'])
  })

  it('con tope, y lo que se tira es lo que caduca antes', () => {
    // Con una validez fija, «caduca antes» es «se firmó hace más»: las fichas que se
    // visitaron hace más tiempo. Lo que se acaba de firmar nunca se tira.
    const cached: SignedPathMap = {}
    for (let i = 0; i < MAX_SIGNED_PATHS + 5; i += 1) {
      cached[`p${i}`] = firma(AHORA + 1000 + i)
    }
    const merged = mergeSigned(cached, { recien: 'https://x/r' }, AHORA + 999_999, AHORA)
    expect(Object.keys(merged)).toHaveLength(MAX_SIGNED_PATHS)
    expect(merged.recien).toBeDefined()
    // Sobraban seis —605 guardadas más la nueva, y el tope es 600—, así que se han
    // ido las seis más antiguas y ninguna más.
    expect(merged.p0).toBeUndefined()
    expect(merged.p5).toBeUndefined()
    expect(merged.p6).toBeDefined()
  })
})

describe('leer y escribir', () => {
  it('lo escrito se vuelve a leer', () => {
    const storage = fakeStorage()
    saveSignedPaths({ a: firma(AHORA + 10_000) }, storage)
    expect(readSignedPaths(storage, AHORA).a?.url).toBe('https://x/a?token=1')
  })

  it('lo caducado no se devuelve: una URL vencida pinta una imagen roa', () => {
    const storage = fakeStorage()
    saveSignedPaths({ a: firma(AHORA - 1), b: firma(AHORA + 10_000) }, storage)
    expect(Object.keys(readSignedPaths(storage, AHORA))).toEqual(['b'])
  })

  it('la basura es «no hay nada», nunca una excepción', () => {
    // Esto corre al pintar una ficha: una excepción aquí la dejaría sin fotos.
    for (const raw of ['', '{', 'null', '[]', '"texto"', '{"v":99,"paths":{}}', '{"v":1}']) {
      const storage = fakeStorage()
      storage.setItem('catalogador.signed-paths', raw)
      expect(readSignedPaths(storage, AHORA)).toEqual({})
    }
    // Y una entrada con la forma cambiada se descarta sin llevarse las buenas.
    const storage = fakeStorage()
    storage.setItem(
      'catalogador.signed-paths',
      JSON.stringify({ v: 1, paths: { mala: { url: 7 }, buena: firma(AHORA + 10) } }),
    )
    expect(Object.keys(readSignedPaths(storage, AHORA))).toEqual(['buena'])
  })

  it('sin almacenamiento no se rompe nada: solo se vuelve a firmar', () => {
    expect(() => saveSignedPaths({ a: firma(AHORA) }, fakeStorage(true))).not.toThrow()
    expect(() => saveSignedPaths({ a: firma(AHORA) }, undefined)).not.toThrow()
    expect(readSignedPaths(undefined, AHORA)).toEqual({})
  })

  it('cerrar sesión lo borra: es catálogo en un dispositivo que puede ser compartido', () => {
    const storage = fakeStorage()
    saveSignedPaths({ a: firma(AHORA + 10_000) }, storage)
    clearSignedPaths(storage)
    expect(readSignedPaths(storage, AHORA)).toEqual({})
  })
})

describe('signPaths', () => {
  it('sin rutas no pregunta nada', async () => {
    const sign = vi.fn()
    expect(await signPaths([], sign, AHORA)).toEqual({})
    expect(sign).not.toHaveBeenCalled()
  })

  it('firma en UNA petición y devuelve una URL por ruta', async () => {
    // Una por miniatura eran cuatro peticiones desde un móvil por abrir una ficha.
    const sign = vi.fn(async (paths: string[]) =>
      Object.fromEntries(paths.map((p) => [p, `https://x/${p}?token=1`])),
    )
    const urls = await signPaths(['a', 'b', 'c'], sign, AHORA)
    expect(sign).toHaveBeenCalledTimes(1)
    expect(sign).toHaveBeenCalledWith(['a', 'b', 'c'], SIGNED_TTL_SECONDS)
    expect(urls).toEqual({
      a: 'https://x/a?token=1',
      b: 'https://x/b?token=1',
      c: 'https://x/c?token=1',
    })
  })

  it('y a la segunda vez no pregunta: es el motivo del módulo', async () => {
    const sign = vi.fn(async (paths: string[]) =>
      Object.fromEntries(paths.map((p) => [p, `https://x/${p}`])),
    )
    await signPaths(['a', 'b'], sign, AHORA)
    const otra = await signPaths(['a', 'b'], sign, AHORA + 60_000)
    expect(sign).toHaveBeenCalledTimes(1)
    expect(otra).toEqual({ a: 'https://x/a', b: 'https://x/b' })
  })

  it('solo pide las que faltan, no la lista entera', async () => {
    const sign = vi.fn(async (paths: string[]) =>
      Object.fromEntries(paths.map((p) => [p, `https://x/${p}`])),
    )
    await signPaths(['a'], sign, AHORA)
    await signPaths(['a', 'b'], sign, AHORA)
    expect(sign).toHaveBeenLastCalledWith(['b'], SIGNED_TTL_SECONDS)
  })

  it('una ruta que no se pueda firmar sale fuera, no con una URL inservible', async () => {
    // Quien pinta enseña el hueco explicado; una imagen roa sería peor.
    const sign = async () => ({ a: 'https://x/a' })
    expect(await signPaths(['a', 'b'], sign, AHORA)).toEqual({ a: 'https://x/a' })
  })

  it('si la firma falla del todo, devuelve lo que ya tenía y no se rompe', async () => {
    const sign = vi.fn(async (paths: string[]) =>
      Object.fromEntries(paths.map((p) => [p, `https://x/${p}`])),
    )
    await signPaths(['a'], sign, AHORA)
    expect(await signPaths(['a', 'b'], async () => ({}), AHORA)).toEqual({ a: 'https://x/a' })
  })
})
