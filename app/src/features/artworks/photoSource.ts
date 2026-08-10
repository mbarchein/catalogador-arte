import type { PhotoProvenance } from '../../lib/types'

/**
 * De quién es la fotografía, y de dónde salió si no es propia (RF-417).
 *
 * La procedencia ya se elegía —propia, tomada de otro catálogo, recibida de un
 * tercero—, pero no había dónde apuntar lo que hace útil esa respuesta, y **no es
 * el mismo dato en los dos lados**:
 *
 *   · en una propia, **quién la hizo**. Es un crédito, y es lo que hay que poder
 *     contestar si alguien pregunta de quién es esa fotografía;
 *   · en una que viene de fuera, **de dónde salió**: el catálogo, la dirección, o
 *     quién la mandó y cuándo. Es la trazabilidad de una imagen que no se puede
 *     volver a hacer.
 *
 * Los dos son opcionales. En 35 de las 39 tomas la hizo quien cataloga, y obligar
 * a teclearlo treinta y cinco veces convertiría un crédito en un peaje.
 *
 * ── EL VALOR DORMIDO ────────────────────────────────────────
 *
 * Son dos columnas, así que una fotografía puede tener las dos escritas: basta con
 * anotar la autoría y después marcarla como tomada de otro catálogo. La base no lo
 * impide a propósito —una restricción cruzada haría fallar el cambio de procedencia
 * por un dato que no estorba—, y por eso **de decidir qué se enseña responde este
 * módulo**: `photoSourceOf` devuelve solo el que corresponde a la procedencia de
 * hoy. Es lo que impide que un crédito viejo se lea junto a una reproducción ajena,
 * que sería atribuir la foto a quien no la hizo.
 */

/** Which of the two fields makes sense with this provenance. */
export type PhotoSourceField = 'credit' | 'source'

export function photoSourceField(provenance: PhotoProvenance): PhotoSourceField {
  return provenance === 'OWN' ? 'credit' : 'source'
}

/** The two columns, as they arrive from the row. */
export interface PhotoSourceColumns {
  photo_credit: string
  provenance_source: string
}

/** How the offered field is labelled. */
export function photoSourceLabel(provenance: PhotoProvenance): string {
  return photoSourceField(provenance) === 'credit'
    ? 'Autoría de la fotografía'
    : 'De dónde salió'
}

/** What is explained underneath: what is expected there, with an example. */
export function photoSourceHint(provenance: PhotoProvenance): string {
  return photoSourceField(provenance) === 'credit'
    ? 'Quién la hizo, si no fuiste tú. Opcional: en blanco no se atribuye a nadie.'
    : 'El catálogo, la dirección de la página, o quién la envió y cuándo. Opcional, y admite ' +
        'cualquier texto: «me la pasó la familia en 2019» también es una procedencia.'
}

/** The column to write with this provenance. */
export function photoSourceColumn(provenance: PhotoProvenance): keyof PhotoSourceColumns {
  return photoSourceField(provenance) === 'credit' ? 'photo_credit' : 'provenance_source'
}

/**
 * Lo que hay escrito para la procedencia de HOY, o null.
 *
 * Es lo único que debe leer quien pinte o imprima: el otro valor puede existir y
 * no significa nada mientras la procedencia sea la que es.
 */
export function photoSourceOf(
  row: PhotoSourceColumns,
  provenance: PhotoProvenance,
): string | null {
  const written = (
    photoSourceField(provenance) === 'credit' ? row.photo_credit : row.provenance_source
  ).trim()
  return written === '' ? null : written
}

/** What gets stored: trimmed, like the rest of the catalogue. */
export function cleanPhotoSource(value: string): string {
  return value.trim()
}
