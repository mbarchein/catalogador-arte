// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ArtworkGallery } from './ArtworkGallery'
import type { ImageRow } from './artworkImages'
import type { PhotoDetailRow } from './photoDetails'

/**
 * De quién es la fotografía, en la ficha (RF-417).
 *
 * Las dos columnas —quién la hizo y de dónde salió— se anotaban desde hace meses y **no se
 * enseñaban en ninguna vista**: ni aquí, ni en el visor, ni en la hoja impresa. Un crédito
 * que solo lee quien lo tecleó no es un crédito, y entregar la reproducción de otro sin
 * decirlo es el fallo que esto cierra.
 *
 * Lo que se fija aquí es que la línea **aparece y desaparece cuando debe**. Qué dice cada
 * caso lo decide `photoCreditLine` y se verifica en su propio módulo: aquí bastan los dos
 * extremos —el silencio de la foto propia sin autoría y el aviso de la ajena—, porque son
 * los que se romperían sin que nadie lo notara.
 */

const IMAGE: ImageRow = {
  image_id: 'img-1',
  thumbnail_path: 'a_min.webp',
  derivative_path: 'a.webp',
  master_path: 'a.jpg',
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
} as unknown as ImageRow

/** Una fila de detalle con lo que este test mira y nada más. */
function detail(over: Partial<PhotoDetailRow>): Record<string, PhotoDetailRow> {
  return {
    'img-1': {
      image_id: 'img-1',
      provenance: 'OWN',
      photo_credit: '',
      provenance_source: '',
      ...over,
    } as unknown as PhotoDetailRow,
  }
}

let details: Record<string, PhotoDetailRow> = {}

// El carrusel firma las copias de consulta al montarse. No es lo que este test mira, pero
// sin responder deja ocho errores sueltos en la salida que tapan el que sí importaría.
vi.mock('../../lib/images', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/images')>()),
  signedUrls: async (paths: string[]) =>
    Object.fromEntries(paths.map((path) => [path, `https://firmado/${path}`])),
}))

vi.mock('./artworkImages', () => ({
  useArtworkImages: () => ({
    images: [IMAGE],
    thumbUrls: { 'img-1': 'blob:miniatura' },
    mainId: 'img-1',
    loading: false,
  }),
}))

vi.mock('./usePhotoDetails', () => ({
  usePhotoDetails: () => ({ details, detailsFailed: false }),
}))

function pintar(rows: Record<string, PhotoDetailRow>) {
  details = rows
  return render(<ArtworkGallery catalogId="AR-0001" />)
}

describe('el crédito de la fotografía en la ficha', () => {
  it('una fotografía propia con autoría la dice', () => {
    pintar(detail({ photo_credit: 'Ana Ruiz' }))
    expect(screen.getByText('Fotografía: Ana Ruiz')).toBeTruthy()
  })

  it('una propia sin autoría no añade ninguna línea', () => {
    pintar(detail({}))
    expect(screen.queryByText(/Fotografía:/)).toBeNull()
  })

  it('y la reproducción de otro se avisa aunque no conste de dónde salió', () => {
    pintar(detail({ provenance: 'OTHER_CATALOG' }))
    expect(screen.getByText('Tomada de otro catálogo')).toBeTruthy()
  })

  it('mientras la consulta no ha contestado no se atribuye a nadie', () => {
    // Una consulta sin responder y un crédito en blanco se ven igual en pantalla, y
    // adelantar una atribución que aún no ha llegado es peor que esperar a la línea.
    pintar({})
    expect(screen.queryByText(/Fotografía:/)).toBeNull()
    expect(screen.queryByText(/Tomada de otro catálogo/)).toBeNull()
  })
})
