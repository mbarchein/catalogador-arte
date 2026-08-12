import { useEffect, useState } from 'react'
import { signedUrls } from '../../lib/images'
import type { ExhibitionRow } from '../documentary/documentaryRows'
import { postersToSign } from './exhibitionPoster'

/**
 * Cuánto dura la firma de una miniatura de cartel.
 *
 * Una semana, como las miniaturas del listado de obras y por lo mismo (RF-110): la URL
 * firmada es la clave de caché de una imagen que el navegador ya se ha bajado, así que
 * volver a firmarla en cada visita tira toda la caché. El bucket sigue siendo privado y
 * lo que se expone es una imagen de 400 px.
 */
const POSTER_URL_TTL_SECONDS = 7 * 24 * 60 * 60

/**
 * Las miniaturas de los carteles del listado, por identificador de exposición.
 *
 * **Una sola petición para toda la página**, con `createSignedUrls`: firmar de una en
 * una son veinte viajes para pintar veinte filas, y eso desde un almacén se nota más que
 * el propio peso de las imágenes.
 *
 * Las rutas vienen ya en la fila —el listado las pide con el resto de columnas—, así que
 * aquí no se consulta la base: solo se firma. Y si la firma falla no se dice nada: la
 * fila ya lleva el título, el año y la sede, y un cartel que no se ve no es un dato que
 * falte.
 */
export function useExhibitionPosters(rows: readonly ExhibitionRow[]): Record<string, string> {
  // La clave es la lista de rutas, no el array: sin esto, cada repintado del listado
  // —una letra en el buscador— volvería a firmar las mismas veinte imágenes.
  const key = postersToSign(rows)
    .map((poster) => `${poster.id} ${poster.path}`)
    .join('\n')
  const [urls, setUrls] = useState<Record<string, string>>({})

  useEffect(() => {
    if (key === '') {
      setUrls({})
      return
    }
    const pairs = key.split('\n').map((line) => {
      const space = line.indexOf(' ')
      return { id: line.slice(0, space), path: line.slice(space + 1) }
    })

    let alive = true
    void (async () => {
      const signed = await signedUrls(
        pairs.map((pair) => pair.path),
        POSTER_URL_TTL_SECONDS,
      )
      if (!alive) return
      const next: Record<string, string> = {}
      for (const pair of pairs) {
        const url = signed[pair.path]
        if (url !== undefined) next[pair.id] = url
      }
      setUrls(next)
    })()
    return () => {
      alive = false
    }
  }, [key])

  return urls
}
