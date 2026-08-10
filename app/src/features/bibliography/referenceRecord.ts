/**
 * La ficha de una referencia bibliográfica y su bloque «Obras citadas»
 * (RF-506, RF-309, RF-504, RF-609).
 *
 * Puro y sin React: la batería corre en node, así que el orden del bloque, lo que
 * dice cada línea y lo que se lee donde no hay filas se verifican aquí o no se
 * verifican.
 *
 * ── LO QUE ESTA FICHA AÑADE, Y LO QUE NO ────────────────────
 *
 * Una referencia ya se podía crear, corregir y encontrar. Lo que no se podía era
 * **leerla por el otro lado**: qué obras del catálogo la citan y en qué página de
 * ella aparece cada una. Ese es el bloque que pide RF-506, con el `catalog_id`
 * enlazado y las páginas y las notas de cada cita, y **sin miniatura** — lo dice el
 * requisito y tiene su motivo: aquí la fila responde «¿en qué página sale?», que es
 * una pregunta de texto, mientras que en la ficha de una exposición sí hay
 * miniatura porque allí lo que se reconoce es la pared.
 *
 * Corregir los datos sigue siendo el mismo panel que abre la ficha de una obra
 * (`ReferenceSheet`), tal cual y sin una segunda copia: una referencia se corrige
 * igual desde donde se la cita que desde su propia ficha, o son dos formularios que
 * tienen que ponerse de acuerdo.
 */

import type { ArtworkBibliography } from '../../lib/types'
import { citationPagesText } from '../documentary/bibliography/citationFormat'
import type { ArtworkRef } from '../documentary/documentaryRows'

/**
 * Una cita leída DESDE la referencia: la fila puente más la obra.
 *
 * Es la simétrica de `CitationRow`, que la lee desde la obra y trae la referencia
 * incrustada. Dos tipos y no uno porque son dos consultas con dos extremos
 * incrustados distintos, y fundirlos daría un tipo con dos mitades opcionales en el
 * que ninguna pantalla sabe cuál tiene.
 */
export interface CitedArtworkRow extends ArtworkBibliography {
  /**
   * Nula cuando la obra no se puede leer: está en la papelera y quien mira solo
   * consulta, o una política la esconde. La fila NO se tira — acortaría en silencio
   * la lista de obras que citan la referencia — y dice lo que le pasa.
   */
  artwork: ArtworkRef | null
}

export const CITED_ARTWORK_COLUMNS =
  'id, catalog_id, bibliography_id, pages, note, active, ' +
  'artwork:artworks(catalog_id, title, artist, execution_date, active)'

/**
 * El orden del bloque: **por el identificador de catalogación**, ascendente.
 *
 * Que es el orden del catálogo razonado, y aquí sí es el bueno — al contrario que en
 * el bloque de obras participantes de una exposición, donde manda el número que la
 * pieza llevaba en la muestra porque ese es el orden de las paredes. Una referencia
 * no tiene un orden propio que imponerle a las obras que la citan: si el libro cita
 * ocho piezas, lo que se busca es «¿está AR-0042?», y para eso el orden es el del
 * código.
 *
 * Las páginas NO ordenan, aunque parezca lo natural en una bibliografía: `pages` es
 * texto libre a propósito (RF-504) —«34-36», «s/p», «lám. XII»— y ordenar por eso
 * pondría «lám. XII» antes que «p. 9».
 */
export function sortCitedArtworks(rows: readonly CitedArtworkRow[]): CitedArtworkRow[] {
  return rows.slice().sort((a, b) => a.catalog_id.localeCompare(b.catalog_id))
}

/** One row of the block, ready to paint. */
export interface CitedArtworkView {
  /** The bridge row: what withdrawing the citation would act upon. */
  id: string
  catalogId: string
  /** The artwork's title, or what is said when it cannot be read. Never a gap. */
  title: string
  /** `pág. 34`, `págs. 34-36`, `lám. XII`… or null when nobody has noted it. */
  pages: string | null
  /** What the citation says about this artwork in particular. */
  note: string | null
  /** The artwork is in the wastebasket, behind a citation that is not (RF-901). */
  retired: boolean
  /** The artwork cannot be read: the row stays and says so. */
  unavailable: boolean
  /** Whether the row leads anywhere. An artwork that cannot be read is not linked. */
  linked: boolean
}

function written(text: string | null | undefined): string | null {
  const clean = (text ?? '').trim()
  return clean === '' ? null : clean
}

export function citedArtworkView(row: CitedArtworkRow): CitedArtworkView {
  const artwork = row.artwork
  if (!artwork) {
    return {
      id: row.id,
      catalogId: row.catalog_id,
      // The code IS shown, because it is on the bridge row and it is real: what is not
      // shown is anything of the artwork, so as not to invent what cannot be read.
      title: 'Esta obra no se puede leer desde aquí',
      pages: citationPagesText(row.pages),
      note: written(row.note),
      retired: false,
      unavailable: true,
      linked: false,
    }
  }
  return {
    id: row.id,
    catalogId: artwork.catalog_id,
    title: written(artwork.title) ?? 'Obra sin título',
    pages: citationPagesText(row.pages),
    note: written(row.note),
    retired: !artwork.active,
    unavailable: false,
    linked: true,
  }
}

/**
 * Las filas del bloque. **Solo las citas vivas**: una cita retirada salió del
 * historial de su obra (RF-901), así que enseñarla aquí contaría una cita que la
 * ficha de la obra ya no cuenta, y las dos pantallas dirían cosas distintas del
 * mismo hecho.
 */
export function citedArtworkViews(rows: readonly CitedArtworkRow[]): CitedArtworkView[] {
  return sortCitedArtworks(rows.filter((row) => row.active)).map(citedArtworkView)
}

/**
 * Lo que se lee encima del bloque, o null cuando no hace falta.
 *
 * Dice cuántas obras la citan, que es el dato que convierte esta ficha en algo más
 * que una copia de la fila: una referencia que cita nueve piezas es el catálogo de
 * una muestra, y una que no cita ninguna es candidata a haberse quedado suelta.
 */
export function citedArtworksSummary(views: readonly CitedArtworkView[]): string | null {
  if (views.length === 0) return null
  return views.length === 1 ? 'La cita una obra del catálogo.' : `La citan ${views.length} obras del catálogo.`
}

/**
 * Lo que va donde irían las filas cuando no hay ninguna (RF-304).
 *
 * **Y la frase que importa es la del bloque vacío**: una referencia sin ninguna cita
 * no es un error ni un dato pendiente de investigar, es exactamente la fila que este
 * listado se construyó para poder encontrar. Así que se dice lo que es y qué hacer
 * con ella, en vez de dejar el hueco que se lee como «falta algo aquí».
 */
export function citedArtworksNotice(input: {
  loading: boolean
  error: string | null
  count: number
}): string | null {
  const { loading, error, count } = input
  if (error !== null) return error
  if (loading) return 'Cargando las obras que la citan…'
  if (count > 0) return null
  return (
    'Ninguna obra la cita ahora mismo. Se cita desde la bibliografía de cualquier obra.'
  )
}

/** What is read when the address matches no reference. */
export const REFERENCE_MISSING_TEXT =
  'Esa referencia no está en el catálogo. Búscala en el listado, por si está retirada.'
