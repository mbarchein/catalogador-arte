/**
 * What is happening to a photograph, said at two lengths (RNF-106).
 *
 * The same work is told in two places and the same text does not fit both:
 *
 *   · **the badge over the image** is a one-line pill on top of the photo, and what is
 *     really looked at in it is the percentage;
 *   · **the line below** has the width of the screen and can explain itself.
 *
 * With a single text for both, the long one was truncated with an ellipsis right at the
 * end — which is where the percentage went — so the badge ended up saying «Aplicando la
 * corrección y subiendo las c…» and told nothing of the one thing worth knowing. Hence
 * each state carrying both forms, and the percentage painted apart, in an element that
 * is never truncated.
 */

export interface PhotoWork {
  /** For the badge over the image. Genuinely short: see `WORK_SHORT_MAX`. */
  short: string
  /** For the line below, where there is room to say which file it is. */
  long: string
}

/**
 * How much the badge can measure, in characters.
 *
 * At 390 px and with the percentage beside it, about twenty fit; the cap is here and a
 * test watches it, because the long label came back by carelessness once and the symptom
 * —a percentage that cannot be seen— looks nothing like its cause.
 */
export const WORK_SHORT_MAX = 20

/** Downloading the archive original so it can be edited. */
export const WORK_DOWNLOADING_MASTER: PhotoWork = {
  short: 'Descargando',
  long: 'Descargando el máster…',
}

/** No master: the consultation copy is opened, which is already in Supabase. */
export const WORK_OPENING_COPY: PhotoWork = {
  short: 'Abriendo',
  long: 'Abriendo la copia de consulta…',
}

/** Publishing the crop: the two small copies and the full-resolution one. */
export const WORK_UPLOADING: PhotoWork = {
  short: 'Subiendo copias',
  long: 'Aplicando la corrección y subiendo las copias…',
}

/** Recording a colour review that changes no pixel. */
export const WORK_SAVING_TRACE: PhotoWork = {
  short: 'Guardando',
  long: 'Anotando la revisión del color…',
}

/**
 * The final stretch, when there is nothing left to count.
 *
 * The percentage measures **the bytes that have gone out**, and going out is not having
 * arrived: the browser calls 100 % as soon as it drops the last chunk down the wire, and
 * after that the store is still saving it and answering, and the row still recording
 * where it ended up. With a 19 MB copy from a storeroom with poor coverage that stretch
 * lasts, and what was shown was «100 %» with the ring whole and still for a long while
 * —the very picture of a hung screen—. So on reaching 100 % it stops giving the number
 * and the ring spins again: less is known, and that is said.
 */
export const WORK_FINISHING: PhotoWork = {
  short: 'Terminando',
  long: 'Terminando de guardar…',
}

/**
 * What has to be painted: what is being done and how far along, with the ending already
 * resolved.
 *
 * `percent` is the measured one, and comes out null when no number should be shown
 * —because it is unknown or because it no longer informs—, which is what makes the ring
 * spin.
 */
export function photoStage(
  work: PhotoWork | null,
  percent: number | null,
): { work: PhotoWork | null; percent: number | null } {
  if (work === null) return { work: null, percent: null }
  if (percent !== null && percent >= 100) return { work: WORK_FINISHING, percent: null }
  return { work, percent }
}
