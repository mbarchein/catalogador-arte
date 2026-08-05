/**
 * El índice de la bibliografía: en qué orden se lee, qué busca la búsqueda y qué
 * dice cada fila (RF-506, RF-606, RF-609).
 *
 * Puro y sin React, como todo lo que decide en este proyecto: la batería corre en
 * node sin DOM, así que el orden de una lista y las palabras de una fila se
 * verifican aquí o no se verifican.
 *
 * **Casi nada de cómo se lee una referencia está escrito aquí, y eso es lo suyo.**
 * La ficha de una obra ya tenía que nombrar a los autores, poner «s.f.» cuando no
 * hay año y componer el pie de imprenta, y lo hace en `documentary/bibliography/`.
 * Este índice reutiliza esas funciones tal cual: una referencia tiene que leerse
 * IGUAL en su listado que dentro de la ficha que la cita, o la catalogadora está
 * leyendo dos dialectos del mismo catálogo. Lo nuevo es solo lo que necesita una
 * lista y una ficha no: el orden de la tabla entera, la búsqueda y el recuento.
 *
 * ── POR QUÉ EXISTE ESTA PANTALLA ────────────────────────────
 *
 * Una referencia se creaba y se corregía **solo desde una obra que la citara**, así
 * que una referencia a la que no le quedaba ninguna cita no se podía encontrar
 * desde ningún sitio: seguía en el catálogo, contando para el índice único de la
 * clave BibTeX, y era invisible. La ficha de obra lo declaraba en voz alta en su
 * tarjeta de «lo que aún no se puede hacer aquí». Esto es la mitad barata de
 * arreglarlo — el listado y su búsqueda—; la ficha propia con su bloque de «obras
 * citadas» (RF-506) es la otra.
 */

import { fuzzyRankBy } from '../../lib/vocabulary'
import type { ReferenceRow } from '../documentary/documentaryRows'
import {
  referenceAuthorText,
  referenceYearText,
} from '../documentary/bibliography/citationFormat'
import {
  REFERENCE_COLUMNS,
  referenceOptionHint,
  referenceSearchText,
} from '../documentary/bibliography/referenceChoice'
import { referenceTitleText } from '../documentary/bibliography/referenceEdit'

/**
 * Las columnas del índice, que son las que ya pide el selector de la ficha.
 *
 * Importadas y no reescritas, a propósito: las dos listas muestran las mismas filas
 * con las mismas palabras, así que una columna que una necesite la necesita la otra.
 * Una segunda copia sería el fallo que las esquinas de una fotografía ya costaron
 * una vez — un campo que la consulta olvidó llegando como `undefined` con el tipo
 * prometiendo un valor.
 */
export { REFERENCE_COLUMNS }

/** Lo que la búsqueda mira, que es también lo que la fila enseña. */
export { referenceSearchText as bibliographySearchText }

/**
 * Con qué se ordena una referencia: **por autor, y las anónimas por su título**.
 *
 * Y no por año descendente como el índice de exposiciones, que es la comparación
 * que merece la pena hacer porque las dos listas parecen la misma clase de cosa y
 * no lo son. Un listado de exposiciones se lee para encontrar la muestra cuyo
 * catálogo está encima de la mesa, y esa es muy probablemente de esta década. Una
 * bibliografía se lee como se lee la bibliografía impresa de un catálogo razonado:
 * buscando «Rotili» o «Zafra» entre los apellidos, que es donde el ojo va. Ordenarla
 * por año dejaría a los dos artículos del mismo autor a veinte filas de distancia.
 *
 * La clave es el autor y, cuando no hay ninguno —un recorte de prensa sin firma, que
 * es la mitad de un archivo real—, el título. **La referencia sin firma NO va al
 * final**: se coloca por su título entre las demás, porque «anónimo» no es un autor
 * que empiece por z. Es la misma decisión que la fecha vacía de un documento, al
 * revés: allí «sin fecha» no es el año cero y va al final; aquí «sin autor» sí tiene
 * un sitio natural en el alfabeto, el de su título.
 */
export function bibliographyOrderKey(reference: ReferenceRow): string {
  return (referenceAuthorText(reference) ?? referenceTitleText(reference)).trim()
}

/**
 * El orden del índice, con el año ASCENDENTE dentro de cada autor.
 *
 * Ascendente y no descendente: dentro de un autor lo que se lee es su recorrido, y
 * es el mismo criterio que el historial expositivo de una obra (RF-502). Las
 * comparaciones van en es-ES con `sensitivity: 'base'`, así que «Álvarez» se sienta
 * con las a y no después de la z, que es lo que pasaría con el orden del octeto.
 *
 * El identificador rompe los empates finales, para que dos referencias no se cambien
 * el sitio entre dos cargas de la misma pantalla.
 */
export function sortReferences(rows: readonly ReferenceRow[]): ReferenceRow[] {
  return rows.slice().sort((a, b) => {
    const byKey = bibliographyOrderKey(a).localeCompare(bibliographyOrderKey(b), 'es', {
      sensitivity: 'base',
    })
    if (byKey !== 0) return byKey
    // Sin año va DESPUÉS de los años del mismo autor: «s.f.» es un dato legítimo
    // que no es un punto en el tiempo, así que no encabeza su obra.
    const ya = a.year ?? null
    const yb = b.year ?? null
    if (ya !== yb) {
      if (ya == null) return 1
      if (yb == null) return -1
      return ya - yb
    }
    return (
      referenceTitleText(a).localeCompare(referenceTitleText(b), 'es', { sensitivity: 'base' }) ||
      a.id.localeCompare(b.id)
    )
  })
}

/** Una fila del índice, lista para pintar. */
export interface BibliographyIndexEntry {
  row: ReferenceRow
  /** El título. Nunca vacío: la base lo exige, y si llegara vacío se dice. */
  title: string
  /** `Rotili, A. · 1985 · Revista de Estudios Extremeños · Artículo`. Nunca un hueco (RF-304). */
  hint: string
  /** El año o «s.f.», aparte, para la columna que se lee en vertical. */
  year: string
  /** La clave BibTeX, cuando la tiene: es como se cita en el ensayo. */
  bibtexKey: string | null
  /** En la papelera. Se pinta apagada — y SE DICE, porque el gris a secas es decoración. */
  retired: boolean
  /** Lo que la búsqueda ha mirado, y lo que la fila enseña como una línea. */
  text: string
  /** Dónde han caído las letras tecleadas dentro de `text`, para el énfasis. */
  indices: number[]
}

/**
 * Las filas del índice, la mejor coincidencia primero.
 *
 * **Las referencias retiradas se esconden salvo que se pidan** (RF-609: los índices
 * excluyen lo retirado), y pedirlas es la única forma de que una vuelva — esconderlas
 * siempre esconde la única salida, que es el razonamiento que ya escribió la pantalla
 * de sedes. No se mezclan en silencio: la fila dice `retired` y la pantalla dice la
 * palabra.
 */
export function rankReferences(
  rows: readonly ReferenceRow[],
  query: string,
  options: { includeRetired?: boolean } = {},
): BibliographyIndexEntry[] {
  const visible = options.includeRetired === true ? rows : rows.filter((row) => row.active)
  // Ordenadas ANTES de puntuar, no después: `fuzzyRankBy` es estable y conserva el
  // orden de quien llama entre coincidencias igual de buenas, así que el alfabeto
  // sobrevive dentro de cada nivel del ranking. Con la búsqueda vacía todo empata, y
  // entonces el índice es puramente alfabético, que es lo que parece ser.
  const ordered = sortReferences(visible)
  return fuzzyRankBy(ordered, referenceSearchText, query).map(({ item, indices }) => ({
    row: item,
    title: referenceTitleText(item),
    hint: referenceOptionHint(item),
    year: referenceYearText(item),
    bibtexKey: item.bibtex_key?.trim() || null,
    retired: !item.active,
    text: referenceSearchText(item),
    indices,
  }))
}

/** Cuántas están en la papelera, para ofrecer el interruptor solo cuando hay algo dentro. */
export function retiredReferenceCount(rows: readonly ReferenceRow[]): number {
  return rows.filter((row) => !row.active).length
}

/**
 * Lo que se lee encima de la lista: cuántas hay, y cuántas se están enseñando
 * cuando la búsqueda ha recortado.
 *
 * Se dice el número porque es la información que decide si merece la pena seguir
 * teclando o si lo que se busca no está en el catálogo.
 */
export function referenceCountText(input: {
  total: number
  shown: number
  searching: boolean
}): string {
  const { total, shown, searching } = input
  const all = total === 1 ? '1 referencia' : `${total} referencias`
  if (!searching || shown === total) return all
  return `${shown} de ${all}`
}

/**
 * Lo que va donde irían las filas cuando no hay ninguna, o null cuando sí hay.
 *
 * **Nunca una página en blanco**, que es criterio del proyecto y no de esta
 * pantalla: una búsqueda sin resultados devuelve la misma página con el motivo, y no
 * una lista vacía que se lee como un catálogo vacío.
 */
export function bibliographyListNotice(input: {
  loading: boolean
  error: string | null
  total: number
  shown: number
  query: string
  includingRetired: boolean
}): string | null {
  const { loading, error, total, shown, query, includingRetired } = input
  if (error !== null) return error
  if (loading) return 'Cargando la bibliografía…'
  if (shown > 0) return null

  const searching = query.trim() !== ''
  if (searching) {
    return includingRetired
      ? 'No se ha encontrado ninguna referencia con estos criterios, ni entre las retiradas.'
      : 'No se ha encontrado ninguna referencia con estos criterios. Puede estar retirada: prueba a incluir la papelera.'
  }
  if (total === 0) {
    return (
      'Todavía no hay ninguna referencia en el catálogo. Se crean desde la bibliografía de una obra, ' +
      'al citarla: una referencia existe porque algo la cita.'
    )
  }
  // Total > 0 y ninguna enseñada sin buscar: están todas en la papelera.
  return 'Todas las referencias del catálogo están retiradas. Inclúyelas para verlas y recuperarlas.'
}
