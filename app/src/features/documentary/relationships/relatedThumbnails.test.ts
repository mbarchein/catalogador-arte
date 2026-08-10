import { describe, expect, it } from 'vitest'
import { relatedThumbnailUrls, seededThumbnails, thumbnailKey } from './relatedThumbnails'
import type { CachedThumbnail } from '../../artworks/artworksCache'

/**
 * La miniatura de cada obra relacionada (RF-403, RF-110).
 *
 * Dos fuentes —el espejo local, ya firmado para una semana, y la consulta que lo
 * corrige— y el orden entre ellas es lo que se verifica: reutilizar una firma
 * válida es lo que hace que la imagen ya descargada no se vuelva a descargar, y
 * conservar una que apunta a OTRO fichero sería enseñar la fotografía equivocada
 * de la obra correcta.
 */

function cached(path: string, url: string): CachedThumbnail {
  return { path, url, expiresAt: Date.now() + 60_000 }
}

describe('lo que el espejo puede pintar sin pedir nada', () => {
  it('devuelve las miniaturas que ya tiene de las obras que hacen falta', () => {
    const store = { 'AR-0013': cached('a/mini.webp', 'https://firma/a') }
    expect(seededThumbnails(store, ['AR-0013'])).toEqual({ 'AR-0013': 'https://firma/a' })
  })

  it('una obra sin fotografía simplemente no está: el hueco lo rellena el marcador', () => {
    expect(seededThumbnails({}, ['AR-0013'])).toEqual({})
  })

  it('no arrastra las miniaturas de obras que este bloque no muestra', () => {
    const store = {
      'AR-0013': cached('a/mini.webp', 'https://firma/a'),
      'AR-0500': cached('b/mini.webp', 'https://firma/b'),
    }
    expect(Object.keys(seededThumbnails(store, ['AR-0013']))).toEqual(['AR-0013'])
  })
})

describe('la miniatura definitiva de cada obra relacionada', () => {
  const paths = { 'AR-0013': 'a/mini.webp' }

  it('la firma recién pedida manda', () => {
    const urls = relatedThumbnailUrls(paths, {}, { 'a/mini.webp': 'https://nueva' })
    expect(urls['AR-0013']).toBe('https://nueva')
  })

  it('sin firma nueva, la del espejo sirve si apunta al MISMO fichero', () => {
    const store = { 'AR-0013': cached('a/mini.webp', 'https://vieja') }
    expect(relatedThumbnailUrls(paths, store, {})['AR-0013']).toBe('https://vieja')
  })

  it('una fotografía principal distinta es otro fichero, y la del espejo se descarta', () => {
    // Otherwise the record would show the previous shot of the right artwork: false without
    // looking it, which is the worst way of being wrong in a catalogue.
    const store = { 'AR-0013': cached('vieja/mini.webp', 'https://vieja') }
    expect(relatedThumbnailUrls(paths, store, {})['AR-0013']).toBeUndefined()
  })

  it('una obra sin fotografía no aparece: no hay URL rota que pintar', () => {
    expect(relatedThumbnailUrls({}, {}, {})).toEqual({})
  })
})

describe('la identidad del conjunto de obras', () => {
  it('las mismas obras en otro orden son la misma consulta', () => {
    expect(thumbnailKey(['AR-0013', 'AR-0002'])).toBe(thumbnailKey(['AR-0002', 'AR-0013']))
  })

  it('sin obras relacionadas no hay clave, y por tanto no hay consulta', () => {
    expect(thumbnailKey([])).toBe('')
  })
})
