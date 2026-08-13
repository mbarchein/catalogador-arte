import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  cachedSignedPaths,
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
 * The stored signatures (RF-110, RNF-106).
 *
 * The bucket is private, so every image is painted with a signed URL. The bytes no longer
 * travelled twice —the service worker keeps them, by path— but the signature did: the
 * record signed every thumbnail separately and for one hour, without keeping it. And what
 * was felt was not the traffic: **with no coverage, a record already visited showed none
 * of its photographs**, because with no signature there is no `src` to look up in the
 * cache.
 *
 * What is pinned here are the ways this could be WORSE than not having it: signing again
 * what was still valid —which produces a different URL, and a different URL is a different
 * image to every cache, losing exactly what it set out to gain—, handing out a signature
 * that expires mid-visit, and growing without a cap in a 5 MB `localStorage`.
 */

/** A pretend storage that can also refuse to write. */
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
    // Signing again produces a different URL, and a different URL is a different image to
    // the byte cache: a file already on the phone would be downloaded once more.
    const cached: SignedPathMap = { a: firma(AHORA + SIGNED_TTL_SECONDS * 1000) }
    expect(pathsToSign(['a'], cached, AHORA)).toEqual([])
  })

  it('lo que caduca dentro del margen se renueva antes de que estorbe', () => {
    // A signature that expires mid-visit leaves broken images on screen, and the
    // application can be open all morning.
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
    // With a fixed validity, «expires soonest» is «signed longest ago»: the records
    // visited longest ago. What was just signed is never thrown away.
    const cached: SignedPathMap = {}
    for (let i = 0; i < MAX_SIGNED_PATHS + 5; i += 1) {
      cached[`p${i}`] = firma(AHORA + 1000 + i)
    }
    const merged = mergeSigned(cached, { recien: 'https://x/r' }, AHORA + 999_999, AHORA)
    expect(Object.keys(merged)).toHaveLength(MAX_SIGNED_PATHS)
    expect(merged.recien).toBeDefined()
    // Six were over the cap —605 stored plus the new one, and the cap is 600— so the six
    // oldest are gone and no more than those.
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
    // This runs while painting a record: an exception here would leave it with no photos.
    for (const raw of ['', '{', 'null', '[]', '"texto"', '{"v":99,"paths":{}}', '{"v":1}']) {
      const storage = fakeStorage()
      storage.setItem('catalogador.signed-paths', raw)
      expect(readSignedPaths(storage, AHORA)).toEqual({})
    }
    // And an entry of an unexpected shape is dropped without taking the good ones with it.
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
    // One per thumbnail was four requests from a phone just to open a record.
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
    // Whoever paints shows the explained gap; a broken image would be worse.
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

describe('las firmas que ya están, sin esperar (el parpadeo)', () => {
  it('devuelve lo guardado en el momento, sin firmar nada', async () => {
    // Es lo que quita el parpadeo: `signPaths` es una promesa, así que la pantalla pinta
    // un fotograma antes de resolverla y en ése la imagen no tiene `src`. Al cambiar de
    // pestaña eso se ve como un hueco que aparece y desaparece.
    const sign = vi.fn(async (paths: string[]) =>
      Object.fromEntries(paths.map((p) => [p, `https://x/${p}`])),
    )
    await signPaths(['a', 'b'], sign, AHORA)
    expect(cachedSignedPaths(['a', 'b'], AHORA + 60_000)).toEqual({
      a: 'https://x/a',
      b: 'https://x/b',
    })
    expect(sign).toHaveBeenCalledTimes(1)
  })

  it('lo que no está guardado no sale, en vez de salir con una URL inservible', () => {
    forgetSignedPaths()
    expect(cachedSignedPaths(['a'], AHORA)).toEqual({})
  })

  it('y una firma caducada tampoco: pintarla sería una imagen rota', async () => {
    const sign = async (paths: string[]) =>
      Object.fromEntries(paths.map((p) => [p, `https://x/${p}`]))
    await signPaths(['a'], sign, AHORA)
    const despues = AHORA + SIGNED_TTL_SECONDS * 1000 + 1
    expect(cachedSignedPaths(['a'], despues)).toEqual({})
  })

  it('sin rutas, nada', () => {
    expect(cachedSignedPaths([], AHORA)).toEqual({})
  })
})
