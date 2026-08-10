import { describe, expect, it } from 'vitest'
import {
  CATALOG_PREFIXES,
  SIGNABLE_KINDS,
  isSignablePath,
  signableKind,
} from '../../../supabase/functions/sign-file/paths'
import { correctedPath, paths } from './images'

/**
 * The signing perimeter of the Edge function, covered from here on purpose.
 *
 * `supabase/functions/sign-file/` is the only place the storage credentials are
 * used, and it had **no tests at all**: there is no Deno in this environment, so
 * `deno test` cannot run. Its allow-list therefore lives in a plain module with
 * no Deno API, which this suite can import — the perimeter gets covered by the
 * runner that actually executes.
 *
 * The regression this file exists for: the pattern only accepted `_master`, so
 * the function answered 400 «ruta no válida» to every corrected copy. RF-420
 * produced no file ever and every corrected photograph stayed
 * `corrected_pending` for good, which also left RF-421 draining a queue nothing
 * could fill. The bug was invisible from the client, which just saw an upload
 * fail.
 */
describe('rutas que la función de firma acepta (RF-411, RF-420)', () => {
  const CATALOG = 'AR-0001'

  it('acepta la ruta del máster que construye el cliente', () => {
    const master = paths(CATALOG, new File([], 'foto.jpg', { type: 'image/jpeg' })).master
    expect(isSignablePath(master)).toBe(true)
    expect(signableKind(master)).toBe('master')
  })

  it('acepta la ruta de la copia corregida que construye el cliente (RF-420)', () => {
    const corrected = correctedPath(CATALOG)
    expect(isSignablePath(corrected)).toBe(true)
    expect(signableKind(corrected)).toBe('corrected')
  })

  it('de las cuatro rutas de una toma solo se firman dos', () => {
    const four = paths(CATALOG, new File([], 'foto.jpg', { type: 'image/jpeg' }))

    // La miniatura y la derivada viven en Supabase Storage y NO se firman aquí:
    // esta función es la puerta de lo que está fuera, y firmarlas ampliaría el
    // perímetro sin motivo.
    expect(isSignablePath(four.thumbnail)).toBe(false)
    expect(isSignablePath(four.derivative)).toBe(false)
    expect(isSignablePath(four.master)).toBe(true)
    expect(isSignablePath(four.corrected)).toBe(true)
  })

  it('la copia corregida nunca es la ruta del máster (RF-420)', () => {
    // Lo mismo que defiende `images_corrected_not_master` en la base, comprobado
    // aquí porque para cuando la base dice no, el fichero ya se ha subido. Las dos
    // salen de la MISMA base en la misma llamada, que es el caso en que una
    // colisión sería posible.
    const four = paths(CATALOG, new File([], 'foto.jpg', { type: 'image/jpeg' }))
    expect(four.corrected).not.toBe(four.master)
  })

  it('rechaza cualquier otra clave del bucket', () => {
    for (const path of [
      'AR-0001/foto.jpg', // sin sufijo: no es ninguno de los dos
      'AR-0001/foto_thumbnail.webp', // un nivel que no vive fuera de Supabase
      'AR-0001/foto_master', // sin extensión
      'ZZ-0001/foto_master.jpg', // prefijo que no es de este catálogo
      'AR-1/foto_master.jpg', // el identificador lleva cuatro cifras
      'AR-0001/../secreto_master.jpg', // travesía de directorio
      'AR-0001/sub/foto_master.jpg', // una carpeta de más
      '/AR-0001/foto_master.jpg', // barra inicial
      'AR-0001/foto_MASTER.jpg', // el sufijo distingue mayúsculas
      '',
    ]) {
      expect(isSignablePath(path), path).toBe(false)
      expect(signableKind(path), path).toBeNull()
    }
  })

  it('rechaza lo que no es una cadena', () => {
    for (const value of [null, undefined, 42, {}, [], true]) {
      expect(isSignablePath(value)).toBe(false)
      expect(signableKind(value)).toBeNull()
    }
  })

  it('los prefijos son los tres fondos y las clases las dos que viven fuera', () => {
    // If a fund is added tomorrow it has to be added here too, or its
    // photographs will not upload: it happened once already with `TS-`. This assertion is the warning.
    expect([...CATALOG_PREFIXES]).toEqual(['AR', 'RC', 'TS'])
    expect([...SIGNABLE_KINDS]).toEqual(['master', 'corrected'])
  })

  it('cada prefijo del catálogo se acepta', () => {
    for (const prefix of CATALOG_PREFIXES) {
      expect(isSignablePath(`${prefix}-0042/abcd1234_master.jpg`), prefix).toBe(true)
      expect(isSignablePath(`${prefix}-0042/abcd1234_corrected.jpg`), prefix).toBe(true)
    }
  })
})
