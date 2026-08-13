import { useEffect, useState } from 'react'
import { cachedSignedPaths, signPaths } from '../../lib/signedPaths'
import type { ExhibitionRow } from '../documentary/documentaryRows'
import { postersToSign } from './exhibitionPoster'

/**
 * Las miniaturas de los carteles del listado, por identificador de exposición.
 *
 * **Por el espejo de firmas de `signedPaths`, y ésta es la corrección**: la primera
 * versión firmaba con `signedUrls` en cada montaje y no guardaba nada, así que cambiar de
 * pestaña volvía a pedir por red las mismas veinte firmas y el listado parpadeaba —los
 * carteles desaparecían y volvían—. Los bytes ya estaban en el teléfono; lo que faltaba
 * era la firma, y sin firma no hay `src` que buscar en el caché.
 *
 * Ahora es el mismo camino que las miniaturas de las obras y las fotografías de una
 * ficha: se pinta con lo que ya hay guardado —de forma síncrona, en el primer
 * fotograma— y solo se firma lo que falte o esté a punto de caducar. En una visita
 * repetida no hay ni una petición.
 *
 * Las rutas vienen ya en la fila —el listado las pide con el resto de columnas—, así que
 * aquí no se consulta la base. Y si una firma falla no se dice nada: la fila ya lleva el
 * título, el año y la sede, y un cartel que no se ve no es un dato que falte.
 */
export function useExhibitionPosters(rows: readonly ExhibitionRow[]): Record<string, string> {
  // La clave es la lista de rutas, no el array: sin esto, cada repintado del listado
  // —una letra en el buscador— volvería a mirar las mismas veinte imágenes.
  const wanted = postersToSign(rows)
  const key = wanted.map((poster) => `${poster.id} ${poster.path}`).join('\n')

  const [urls, setUrls] = useState<Record<string, string>>(() => seeded(wanted))

  useEffect(() => {
    const pairs = key === '' ? [] : key.split('\n').map(split)
    // La semilla se vuelve a aplicar al cambiar la lista: sin esto, pasar de un listado
    // filtrado a otro dejaría en pantalla los carteles del anterior hasta que contestara.
    setUrls(seeded(pairs))
    if (pairs.length === 0) return

    let alive = true
    void signPaths(pairs.map((pair) => pair.path)).then((signed) => {
      if (!alive) return
      setUrls(byExhibition(pairs, signed))
    })
    return () => {
      alive = false
    }
  }, [key])

  return urls
}

const split = (line: string): { id: string; path: string } => {
  const space = line.indexOf(' ')
  return { id: line.slice(0, space), path: line.slice(space + 1) }
}

/** Lo que ya está firmado, sin esperar: es lo que evita el fotograma sin imágenes. */
const seeded = (pairs: readonly { id: string; path: string }[]): Record<string, string> =>
  byExhibition(pairs, cachedSignedPaths(pairs.map((pair) => pair.path)))

/** De rutas firmadas a exposiciones, que es como lo pide quien pinta la fila. */
function byExhibition(
  pairs: readonly { id: string; path: string }[],
  signed: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const pair of pairs) {
    const url = signed[pair.path]
    if (url !== undefined) out[pair.id] = url
  }
  return out
}
