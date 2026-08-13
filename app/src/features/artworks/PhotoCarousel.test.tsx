// @vitest-environment jsdom
import { useLayoutEffect } from 'react'
import { render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SIGNED_TTL_SECONDS, forgetSignedPaths, saveSignedPaths } from '../../lib/signedPaths'
import type { ImageRow } from './artworkImages'
import { PhotoCarousel } from './PhotoCarousel'

/**
 * El carrusel pinta la fotografía **en el primer fotograma** (RNF-106).
 *
 * Existe por lo que se veía al reabrir una ficha: la diapositiva enseñaba la miniatura
 * borrosa y un instante después cambiaba a la fotografía, aunque no viajara nada. La causa
 * no era la red: `signPaths` es una promesa, así que con el estado inicial vacío la
 * pantalla pinta una vez antes de que se resuelva, y ese fotograma es el parpadeo.
 *
 * ── POR QUÉ HAY UNA SONDA Y NO UN `expect` NORMAL ───────────
 *
 * Porque un aserto normal aquí **pasa con el arreglo y sin él**: `render` vacía los efectos
 * antes de devolver el control, así que lo que se mira ya lleva aplicado lo que el efecto
 * haya hecho. Lo que distingue las dos versiones es *cuándo*, y eso se mira desde un
 * `useLayoutEffect` hermano: los efectos de disposición corren en el commit —antes de que el
 * navegador pueda pintar— y los efectos normales del carrusel, después. Lo que la sonda ve
 * es literalmente el primer fotograma.
 */

/** Las rutas que se han mandado a firmar de verdad. */
const firmadas: string[] = []
/** El `src` de cada diapositiva en el primer fotograma, antes de los efectos. */
const primerFotograma: (string | null)[] = []

vi.mock('../../lib/images', () => ({
  signedUrls: async (paths: string[]) => {
    firmadas.push(...paths)
    return Object.fromEntries(paths.map((p) => [p, `https://firmado/${p}?tarde`]))
  },
}))

const row = (n: number): ImageRow =>
  ({
    image_id: `AR-0001_v${n}`,
    thumbnail_path: `t/${n}`,
    derivative_path: `d/${n}`,
    shot_type: 'GENERAL',
  }) as ImageRow

const images = [row(1), row(2)]
const thumbUrls = { 'AR-0001_v1': 'https://miniatura/1', 'AR-0001_v2': 'https://miniatura/2' }

function Sonda() {
  useLayoutEffect(() => {
    primerFotograma.push(
      ...[...document.querySelectorAll('img')].map((img) => img.getAttribute('src')),
    )
  }, [])
  return null
}

function pintar() {
  return render(
    <>
      <PhotoCarousel
        images={images}
        thumbUrls={thumbUrls}
        viewId="AR-0001_v1"
        onView={() => {}}
        catalogId="AR-0001"
      />
      <Sonda />
    </>,
  )
}

function firmasGuardadas(expiresAt: number) {
  saveSignedPaths(
    {
      'd/1': { url: 'https://firmado/d/1', expiresAt },
      'd/2': { url: 'https://firmado/d/2', expiresAt },
    },
    window.localStorage,
  )
}

beforeEach(() => {
  firmadas.length = 0
  primerFotograma.length = 0
  window.localStorage.clear()
  forgetSignedPaths()
})

describe('la diapositiva y la firma que ya estaba guardada', () => {
  it('con la firma guardada, el primer fotograma ya es la fotografía', () => {
    firmasGuardadas(Date.now() + SIGNED_TTL_SECONDS * 1000)

    pintar()

    // Ni la miniatura borrosa ni el hueco: la copia de consulta, desde el principio.
    expect(primerFotograma).toEqual(['https://firmado/d/1', 'https://firmado/d/2'])
    // Y sin pedir nada: la firma estaba, y volver a firmar daría otra URL, que para
    // cualquier caché es otra imagen.
    expect(firmadas).toEqual([])
  })

  it('sin firma, la miniatura tapa el hueco y la fotografía la sustituye al llegar', async () => {
    const { container } = pintar()

    // Es la primera visita a la ficha: aquí sí hay que pedir, y mientras se pide se enseña
    // lo que hay. Esta mitad es la que no puede perderse arreglando la otra.
    expect(primerFotograma).toEqual(['https://miniatura/1', 'https://miniatura/2'])

    await waitFor(() =>
      expect(container.querySelector('img')?.getAttribute('src')).toBe('https://firmado/d/1?tarde'),
    )
    // Las dos en una sola petición, que es lo que `signPaths` está para hacer.
    expect(firmadas).toEqual(['d/1', 'd/2'])
  })

  it('y una firma caducada no se pinta: sería una imagen rota', async () => {
    firmasGuardadas(Date.now() - 1_000)

    pintar()

    expect(primerFotograma).toEqual(['https://miniatura/1', 'https://miniatura/2'])
    await waitFor(() => expect(firmadas).toEqual(['d/1', 'd/2']))
  })
})
