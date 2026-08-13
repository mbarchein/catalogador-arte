import type { ExhibitionRow } from '../documentary/documentaryRows'

/**
 * El espejo del listado de exposiciones: se pinta de aquí al instante y se refresca por
 * detrás (RNF-106).
 *
 * Existe por lo que se veía: **al cambiar a la pestaña de Exposiciones salía «Cargando las
 * exposiciones…» cada vez**, aunque no hubiera cambiado nada. La consulta es pequeña —una
 * catalogación razonada de dos artistas tiene decenas de exposiciones, no miles— pero
 * pequeña no es instantánea desde un almacén, y una pestaña que se abre veinte veces al
 * día no puede esperar veinte veces por lo mismo.
 *
 * Es el espejo que el listado de obras ya tenía (`artworksCache`) con otra tabla dentro, y
 * con sus mismas convenciones:
 *
 *   · el mismo espacio de nombres, `catalogador.`;
 *   · **una versión**: un espejo escrito por una versión anterior se descarta entero en vez
 *     de migrarse, porque es una copia del catálogo y se rehace con la primera consulta;
 *   · lo que tenga una forma inesperada se tira, en vez de romper la página. Un espejo es
 *     una comodidad y nunca la fuente de la verdad;
 *   · **se borra al cerrar sesión**: son datos del catálogo en un dispositivo que puede ser
 *     compartido, no una preferencia.
 *
 * Aquí no se guardan las firmas de los carteles: ésas viven en `signedPaths`, que las
 * comparte con las fotografías de las obras y las poda por caducidad. Guardarlas dos veces
 * daría dos verdades sobre la misma URL.
 */

const KEY = 'catalogador.exhibitions-mirror'
const VERSION = 1

function getStorage(): Storage | undefined {
  try {
    return window.localStorage
  } catch {
    return undefined
  }
}

/**
 * Lo guardado, o null si no hay nada utilizable.
 *
 * Se comprueba lo mínimo que hace que la lista se pueda pintar: que sea un array y que
 * cada fila tenga identificador y título. Lo demás lo corrige la consulta que viene
 * detrás; una fila a la que le falte una columna nueva se pinta con ese hueco durante un
 * segundo, y eso es exactamente el trato de un espejo.
 */
export function readExhibitionsSnapshot(
  storage: Storage | undefined = getStorage(),
): ExhibitionRow[] | null {
  try {
    const raw = storage?.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { v?: unknown; rows?: unknown }
    if (parsed.v !== VERSION || !Array.isArray(parsed.rows)) return null
    if (
      !parsed.rows.every(
        (row) =>
          typeof (row as ExhibitionRow)?.id === 'string' &&
          typeof (row as ExhibitionRow)?.title === 'string',
      )
    ) {
      return null
    }
    return parsed.rows as ExhibitionRow[]
  } catch {
    // Lo que no se reconoce es «no hay nada»: se consulta, que es más lento y funciona.
    // Una excepción aquí dejaría la pestaña en blanco.
    return null
  }
}

export function saveExhibitionsSnapshot(
  rows: readonly ExhibitionRow[],
  storage: Storage | undefined = getStorage(),
): void {
  try {
    storage?.setItem(KEY, JSON.stringify({ v: VERSION, rows }))
  } catch {
    // Sin almacenamiento —cuota, navegación privada— todo sigue funcionando: lo único
    // que se pierde es el pintado instantáneo.
  }
}

/** Borra el espejo. Al cerrar sesión, como el del listado de obras y por lo mismo. */
export function clearExhibitionsCache(storage: Storage | undefined = getStorage()): void {
  try {
    storage?.removeItem(KEY)
  } catch {
    /* nada que borrar */
  }
}
