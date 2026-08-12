import { describe, expect, it } from 'vitest'
import type { Exhibition } from '../../lib/types'
import {
  POSTER_CLEARED,
  POSTER_PREFIX,
  hasPoster,
  posterAlt,
  posterButtonLabel,
  posterFileRefusal,
  posterPatch,
  posterPaths,
  postersToSign,
  removePosterConfirmText,
} from './exhibitionPoster'

/**
 * RF-518: el cartel de una exposición.
 *
 * Lo que este fichero protege, en el orden en el que duele:
 *
 *   1. **que las tres columnas viajen juntas**. La base lo exige con un `check`, y una
 *      escritura a medias se rechaza entera: si el plan de la pantalla mandara dos, lo
 *      que la usuaria leería es un fallo de la base con el nombre de una restricción;
 *   2. **que una ruta no se reutilice nunca**. Las miniaturas se firman por una semana y
 *      el navegador las cachea, así que reescribir una ruta deja al teléfono enseñando
 *      el cartel viejo hasta que caduque;
 *   3. las frases, que son las que se leen antes de tocar algo que no se deshace.
 */

const exhibition = (over: Partial<Exhibition> = {}): Exhibition => ({
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
  ...over,
})

describe('dónde va el fichero', () => {
  it('una carpeta por exposición, bajo el prefijo de los carteles', () => {
    const paths = posterPaths('ex-1', 'abc123')
    expect(paths.thumbnail).toBe(`${POSTER_PREFIX}/ex-1/cartel_abc123_min.webp`)
    expect(paths.derivative).toBe(`${POSTER_PREFIX}/ex-1/cartel_abc123_der.webp`)
  })

  it('la miniatura y la copia de consulta nunca son el mismo fichero', () => {
    // La base también lo comprueba: dos columnas con la misma ruta significan que una
    // escritura se hizo a medias, y lo que se vería es la miniatura estirada.
    const paths = posterPaths('ex-1')
    expect(paths.thumbnail).not.toBe(paths.derivative)
  })

  it('dos subidas de la misma exposición no comparten ruta', () => {
    // Sin esto, la segunda imagen se serviría desde la caché de la primera durante una
    // semana. Es la misma razón por la que las derivadas de una obra llevan sufijo.
    expect(posterPaths('ex-1').thumbnail).not.toBe(posterPaths('ex-1').thumbnail)
  })

  it('en un navegador que no comprime WebP, la extensión dice lo que el fichero es', () => {
    expect(posterPaths('ex-1', 'abc123', 'png').thumbnail).toContain('.png')
  })
})

describe('lo que se escribe en la fila', () => {
  it('las tres columnas juntas, con la fecha del cliente', () => {
    const patch = posterPatch(
      { thumbnail: 'carteles/a_min.webp', derivative: 'carteles/a_der.webp' },
      new Date('2026-08-12T10:00:00.000Z'),
    )
    expect(patch).toEqual({
      poster_thumbnail_path: 'carteles/a_min.webp',
      poster_derivative_path: 'carteles/a_der.webp',
      poster_uploaded_at: '2026-08-12T10:00:00.000Z',
    })
  })

  it('y quitarlo son las tres a nulo, que es lo que la base admite', () => {
    expect(POSTER_CLEARED).toEqual({
      poster_thumbnail_path: null,
      poster_derivative_path: null,
      poster_uploaded_at: null,
    })
  })
})

describe('si hay cartel o no lo hay', () => {
  it('lo dice la fila y no una bandera aparte', () => {
    expect(hasPoster(exhibition())).toBe(false)
    expect(hasPoster(exhibition({ poster_thumbnail_path: 'carteles/a_min.webp' }))).toBe(true)
  })

  it('una ruta en blanco no es un cartel', () => {
    expect(hasPoster(exhibition({ poster_thumbnail_path: '   ' }))).toBe(false)
  })

  it('y el botón no dice lo mismo con cartel y sin él', () => {
    expect(posterButtonLabel(exhibition())).toBe('Subir el cartel')
    expect(posterButtonLabel(exhibition({ poster_thumbnail_path: 'x' }))).toBe('Cambiar el cartel')
  })
})

describe('lo que se rechaza antes de gastar datos móviles', () => {
  const file = (name: string, type: string, size: number): File => {
    const made = new File(['x'], name, { type })
    Object.defineProperty(made, 'size', { value: size })
    return made
  }

  it('lo que no es una imagen', () => {
    expect(posterFileRefusal(file('cartel.pdf', 'application/pdf', 1000))).toContain('no es una imagen')
  })

  it('y lo que no cabe en el almacén, dicho en megabytes', () => {
    const refusal = posterFileRefusal(file('cartel.jpg', 'image/jpeg', 70 * 1_048_576))
    expect(refusal).toContain('70.0 MB')
    expect(refusal).toContain('60 MB')
  })

  it('una foto normal de un cartel pasa', () => {
    expect(posterFileRefusal(file('cartel.jpg', 'image/jpeg', 4 * 1_048_576))).toBeNull()
  })
})

describe('qué se firma para pintar un listado', () => {
  it('solo las exposiciones que tienen cartel', () => {
    // Firmar una ruta nula es una petición que el almacén rechaza, y en un listado de
    // doscientas con tres carteles serían ciento noventa y siete rechazos por pantalla.
    const rows = [
      exhibition({ id: 'a', poster_thumbnail_path: 'carteles/a_min.webp' }),
      exhibition({ id: 'b' }),
      exhibition({ id: 'c', poster_thumbnail_path: '  ' }),
    ]
    expect(postersToSign(rows)).toEqual([{ id: 'a', path: 'carteles/a_min.webp' }])
  })
})

describe('lo que se lee', () => {
  it('el texto alternativo nombra la exposición', () => {
    expect(posterAlt('Rotili. Obra reciente')).toBe('Cartel de Rotili. Obra reciente')
    expect(posterAlt('   ')).toBe('Cartel de la exposición')
  })

  it('quitar el cartel dice que el fichero no se borra', () => {
    // Es lo que quita el miedo a probar otra imagen: aquí no se borra nada (RF-901).
    const text = removePosterConfirmText('Rotili. Obra reciente')
    expect(text).toContain('«Rotili. Obra reciente»')
    expect(text).toContain('no se borra')
  })
})
