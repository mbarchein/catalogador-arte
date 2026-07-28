import type { Artwork, AttributedTitleValue } from './types'

/**
 * RF-209. The distinction is subtle and the field schema devoted a whole
 * revision to it:
 *
 *  - Artwork with no title at all      → empty `title`, shown as
 *    "[Sin título]" in brackets. The text is a visual reference, not a datum:
 *    it is never stored in the database.
 *  - Artwork the artist literally titled *Sin título* → `title` contains
 *    "Sin título" and is shown as is, without brackets.
 *
 * The brackets are therefore the only thing separating the two situations on
 * screen, which is why they cannot be typed by hand into the field.
 */
export function displayTitle(title: string): string {
  return title.trim() === '' ? '[Sin título]' : title
}

/** True when the displayed title is a placeholder and not a real title. */
export function isPlaceholderTitle(title: string): boolean {
  return title.trim() === ''
}

/**
 * RF-307: an attributed title must stand out in the record header. Otherwise
 * the difference between a title by Rotili and a name the family gave the
 * piece only exists inside the database, which is where nobody sees it.
 */
export function attributedTitleNotice(value: AttributedTitleValue): string | null {
  switch (value) {
    case 'YES':
      return 'Nombre atribuido, no del artista'
    case 'UNCONFIRMED':
      return 'Autoría del título sin confirmar'
    case 'NO':
    case 'NOT_APPLICABLE':
    // UNREVIEWED means the title is blank and pending investigation: the
    // header already shows the [Sin título] placeholder, a notice on top
    // would say the same thing twice.
    case 'UNREVIEWED':
      return null
  }
}

/**
 * RF-306: an existence status other than "Conservada" rises to the header.
 * That an artwork is destroyed or missing is the first thing to see when
 * opening its record, not a datum buried among twenty others.
 */
export function existenceNotice(artwork: Pick<Artwork, 'existence_status'>): string | null {
  switch (artwork.existence_status) {
    case 'DESTROYED':
      return 'Obra destruida'
    case 'LOST':
      return 'Paradero desconocido'
    case 'UNKNOWN':
      return 'Estado desconocido'
    case 'PRESERVED':
    case 'UNREVIEWED':
      return null
  }
}

/**
 * Readable dimensions: "73 × 60 cm", with depth only when it applies.
 * Decimals with a comma: the catalog is written in Spanish.
 */
export function displayMeasurements(
  artwork: Pick<Artwork, 'height_cm' | 'width_cm' | 'depth_cm'>,
): string {
  const { height_cm, width_cm, depth_cm } = artwork
  if (height_cm == null && width_cm == null) return 'Sin medir'

  const num = (v: number | null) =>
    v == null ? '?' : String(v).replace(/\.00?$/, '').replace('.', ',')
  const base = `${num(height_cm)} × ${num(width_cm)}`
  return depth_cm == null ? `${base} cm` : `${base} × ${num(depth_cm)} cm`
}
