/**
 * La ficha de un documento del archivo, con las obras Y las exposiciones que lo tienen
 * enlazado (RF-309, RF-515, RF-516, RF-609).
 *
 * Puro y sin React: la batería corre en node, así que el orden de los bloques, lo que
 * dice cada línea y lo que se lee donde no hay filas se verifican aquí.
 *
 * ── DOS BLOQUES, Y NO UNO ───────────────────────────────────
 *
 * Es la diferencia con la ficha de una referencia bibliográfica, que solo mira a las
 * obras. **La relación de un documento es de muchos a muchos con las obras y con las
 * exposiciones** (RF-516): un recorte de prensa habla de tres piezas, y un díptico o
 * una nota de prensa cuelgan de la muestra y de ninguna pieza en particular. Fundir los
 * dos bloques en una lista mezclaría códigos de catalogación con títulos de exposición
 * en la misma columna, y el documento que solo cuelga de una muestra —que es el caso
 * que hizo falta esta pantalla— saldría bajo un encabezado que dice «obras».
 *
 * Y son dos tablas puente de verdad, con su propia nota cada una: lo que un cartel dice
 * de la exposición no es lo que dice de una obra suya.
 */

import type { ArtworkDocument, ExhibitionDocument } from '../../lib/types'
import { displayExhibitionDates } from '../documentary/documentaryFormat'
import type { ArtworkRef } from '../documentary/documentaryRows'

/**
 * Las columnas de la ficha: el documento entero con sus dos maestras incrustadas.
 *
 * Son las mismas que ya pide el bloque de la ficha de obra —el documento incrustado de
 * `DOCUMENT_LINK_COLUMNS`— escritas aquí porque allí van dentro de un `document:(…)` y
 * esta consulta las pide a nivel de la tabla. Es la misma lista de nombres y el mismo
 * criterio: la ficha necesita las doce columnas que el formulario de corrección escribe.
 */
export const DOCUMENT_RECORD_COLUMNS =
  'id, archive_code, artist_fund, document_type_id, title, archive_series_id, ' +
  'start_year, end_year, approximate_date, unconfirmed_date, date_note, date_text, ' +
  'physical_place_id, file_path, file_size_bytes, mime_type, uploaded_at, note, active, ' +
  'document_type:document_types(id, name, active), ' +
  'archive_series:archive_series(id, parent_id, name, active)'

/** La obra que tiene el documento enlazado: la fila puente más la obra. */
export interface LinkedArtworkRow extends ArtworkDocument {
  /** Nula cuando la obra no se puede leer. La fila se queda y lo dice. */
  artwork: ArtworkRef | null
}

export const LINKED_ARTWORK_COLUMNS =
  'id, catalog_id, document_id, note, active, ' +
  'artwork:artworks(catalog_id, title, artist, execution_date, active)'

/** Lo mínimo de una exposición para nombrarla en una lista: el título y cuándo fue. */
export interface ExhibitionBrief {
  id: string
  title: string
  year: number | null
  start_date: string | null
  end_date: string | null
  date_note: string
  active: boolean
}

/** La exposición que tiene el documento enlazado: la fila puente más la exposición. */
export interface LinkedExhibitionRow extends ExhibitionDocument {
  exhibition: ExhibitionBrief | null
}

export const LINKED_EXHIBITION_COLUMNS =
  'id, exhibition_id, document_id, note, active, ' +
  'exhibition:exhibitions(id, title, year, start_date, end_date, date_note, active)'

function written(text: string | null | undefined): string | null {
  const clean = (text ?? '').trim()
  return clean === '' ? null : clean
}

// ── Las obras que lo tienen enlazado ─────────────────────────

export interface LinkedArtworkView {
  /** La fila puente. */
  id: string
  catalogId: string
  title: string
  /** Lo que este documento dice de ESA obra. */
  note: string | null
  retired: boolean
  unavailable: boolean
  linked: boolean
}

/**
 * El orden: por identificador de catalogación, como el bloque de obras citadas de una
 * referencia y por lo mismo — el documento no tiene un orden propio que imponerle a las
 * obras, y lo que se busca es «¿está AR-0042?».
 */
export function linkedArtworkViews(rows: readonly LinkedArtworkRow[]): LinkedArtworkView[] {
  return rows
    // Solo los vínculos vivos: uno retirado salió de la ficha de su obra (RF-517), así
    // que contarlo aquí haría que las dos pantallas dijeran cosas distintas.
    .filter((row) => row.active)
    .slice()
    .sort((a, b) => a.catalog_id.localeCompare(b.catalog_id))
    .map((row) => {
      const artwork = row.artwork
      if (!artwork) {
        return {
          id: row.id,
          catalogId: row.catalog_id,
          title: 'Esta obra no se puede leer desde aquí',
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
        note: written(row.note),
        retired: !artwork.active,
        unavailable: false,
        linked: true,
      }
    })
}

// ── Las exposiciones que lo tienen enlazado ──────────────────

export interface LinkedExhibitionView {
  id: string
  exhibitionId: string
  title: string
  /** `12 de marzo – 4 de mayo de 1985`, o «Sin fechar». Nunca un hueco. */
  dates: string
  /** Lo que este documento dice de ESA muestra, que no es lo que dice de una obra suya. */
  note: string | null
  retired: boolean
  unavailable: boolean
  linked: boolean
}

/**
 * El orden: **de lo más reciente a lo más antiguo**, el mismo que el listado de
 * exposiciones y por el mismo motivo — una muestra se busca por su año, y la que se
 * tiene en la cabeza es más probablemente de esta década. Las que no se pueden leer van
 * al final, porque no hay fecha con la que colocarlas.
 */
export function linkedExhibitionViews(
  rows: readonly LinkedExhibitionRow[],
): LinkedExhibitionView[] {
  return rows
    .filter((row) => row.active)
    .slice()
    .sort((a, b) => {
      const ya = a.exhibition?.year ?? null
      const yb = b.exhibition?.year ?? null
      if (ya !== yb) {
        if (ya == null) return 1
        if (yb == null) return -1
        return yb - ya
      }
      return (a.exhibition?.title ?? '').localeCompare(b.exhibition?.title ?? '', 'es', {
        sensitivity: 'base',
      }) || a.id.localeCompare(b.id)
    })
    .map((row) => {
      const exhibition = row.exhibition
      if (!exhibition) {
        return {
          id: row.id,
          exhibitionId: row.exhibition_id,
          title: 'Esta exposición no se puede leer desde aquí',
          dates: 'Sin fechar',
          note: written(row.note),
          retired: false,
          unavailable: true,
          linked: false,
        }
      }
      return {
        id: row.id,
        exhibitionId: exhibition.id,
        title: written(exhibition.title) ?? 'Exposición sin título',
        dates: displayExhibitionDates(exhibition),
        note: written(row.note),
        retired: !exhibition.active,
        unavailable: false,
        linked: true,
      }
    })
}

// ── Lo que se lee encima y en lugar de las filas ─────────────

/**
 * De qué está colgando el documento, en una frase y contando las dos mitades.
 *
 * Es el dato que esta ficha añade y que no se puede leer en ningún otro sitio: desde la
 * ficha de una obra solo se ve que el documento cuelga de ELLA. Y es el que convierte a
 * un documento en «suelto»: cero y cero es exactamente la fila que este listado se
 * construyó para poder encontrar.
 */
export function documentReachSummary(input: {
  artworks: number
  exhibitions: number
}): string {
  const { artworks, exhibitions } = input
  const parts: string[] = []
  if (artworks === 1) parts.push('una obra')
  else if (artworks > 1) parts.push(`${artworks} obras`)
  if (exhibitions === 1) parts.push('una exposición')
  else if (exhibitions > 1) parts.push(`${exhibitions} exposiciones`)

  if (parts.length === 0) {
    return (
      'No lo tiene enlazado nada: ni una obra ni una exposición. Desde ninguna ficha se llega a él, ' +
      'así que esta pantalla es la única forma de encontrarlo.'
    )
  }
  return `Enlazado con ${parts.join(' y ')}.`
}

/** Lo que va donde irían las filas de un bloque, o null cuando hay filas (RF-304). */
export function linkedBlockNotice(input: {
  loading: boolean
  error: string | null
  count: number
  empty: string
}): string | null {
  const { loading, error, count, empty } = input
  if (error !== null) return error
  if (loading) return 'Cargando…'
  return count > 0 ? null : empty
}

export const NO_LINKED_ARTWORKS =
  'Ninguna obra lo tiene enlazado. Se enlaza desde la documentación de una obra, con «Enlazar un ' +
  'documento del archivo»: el fichero se guarda una sola vez y cuelga de tantas obras como hable.'

/*
 * El bloque vacío de las exposiciones dice algo distinto del de las obras, y vive en
 * `exhibitionLink.ts` porque ya son dos frases y no una: enlazar con una exposición se
 * hace en esta misma pantalla, así que quien puede escribir lee que se hace aquí abajo y
 * quien solo consulta no lee una instrucción que no puede seguir. Están en
 * `NO_LINKED_EXHIBITIONS_WRITABLE` y `NO_LINKED_EXHIBITIONS_READONLY`.
 */

/** Lo que se lee cuando la dirección no corresponde a ningún documento. */
export const DOCUMENT_MISSING_TEXT =
  'Ese documento no está en el archivo. Puede que se haya retirado, o que la dirección esté mal ' +
  'copiada: búscalo en el listado del archivo.'
