import type { PhotoProvenance } from '../../lib/types'

/**
 * Whose the photograph is, and where it came from if it is not our own (RF-417).
 *
 * The provenance was already chosen —our own, taken from another catalogue, received from a
 * third party—, but there was nowhere to note down what makes that answer useful, and **it is not
 * the same datum on both sides**:
 *
 *   · on one of our own, **who took it**. It is a credit, and it is what one has to be able to
 *     answer if somebody asks whose that photograph is;
 *   · on one that comes from outside, **where it came from**: the catalogue, the address, or
 *     who sent it and when. It is the traceability of an image that cannot be
 *     taken again.
 *
 * Both are optional. In 35 of the 39 shots it was taken by whoever catalogues, and forcing
 * them to type it thirty-five times would turn a credit into a toll.
 *
 * ── THE DORMANT VALUE ───────────────────────────────────────
 *
 * They are two columns, so a photograph can have both written: it is enough to
 * note the authorship down and then mark it as taken from another catalogue. The base does not
 * prevent it on purpose —a cross constraint would make the provenance change fail
 * over a datum that is not in the way—, and that is why **deciding what is shown is this
 * module's job**: `photoSourceOf` returns only the one matching today's
 * provenance. It is what prevents an old credit from being read next to somebody else's reproduction,
 * which would be attributing the photo to whoever did not take it.
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
 * What is written for TODAY's provenance, or null.
 *
 * It is the only thing whoever paints or prints should read: the other value may exist and
 * it means nothing while the provenance is what it is.
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
