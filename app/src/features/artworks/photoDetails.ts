import {
  editFromColumns,
  editToColumns,
  isNoEdit,
  sameEdit,
  restrictColorToShotType,
  colorAvailability,
  type EditColumns,
  type NormalizedPhotoEdit,
  type PhotoEdit,
} from '../../lib/imageEdits'
import { isNoColor, type ColorColumns, type ColorEdit, type ColorInput } from '../../lib/imageColor'
import {
  PHOTO_PROVENANCE_LABEL,
  type PhotoProvenance,
  type ShotTypeValue,
} from '../../lib/types'

/**
 * The three provenances, in the order the chips show them, taken from the labels
 * instead of written again.
 *
 * A second list would be a second place to forget a value: derived from the label
 * table, a provenance without a label is impossible and a label without a chip is
 * impossible too. `Object.keys` of a `Record<PhotoProvenance, string>` is exactly the
 * enum, and the cast says so.
 */
export const PHOTO_PROVENANCES = Object.keys(PHOTO_PROVENANCE_LABEL) as readonly PhotoProvenance[]

/**
 * What the two screens around the editor need to read from a photograph's row and
 * cannot ask `artworkImages.ts` for.
 *
 * The colour, the date the file carries, the size of the original, the provenance and
 * the state of the full-resolution copy arrived with two migrations
 * (`20260803120000_image_color` and `20260803140000_image_corrected_copy`) and none of
 * them is in the query that feeds the gallery. They are read here, in one extra
 * `select` over the same rows, and not by widening that one: this module is not its
 * owner, and a second query for an artwork with three photographs costs less than the
 * three thumbnail signatures the gallery already asks for one by one.
 *
 * The arithmetic is somebody else's: everything about colour comes from
 * `imageColor.ts` and `imageEdits.ts`, and what lives here is which columns to ask
 * for and what sentence to put on the screen with the answer.
 */
export interface PhotoDetailRow extends ColorColumns {
  image_id: string
  /** The date the file says it was taken (RF-416), next to the record's, never instead. */
  file_photo_date: string | null
  /** Whether that date is the shutter's or the file's, approximate (RF-416). */
  file_photo_date_exact: boolean | null
  original_width: number | null
  original_height: number | null
  /**
   * The size of the archive original, so the button that offers it can say what it
   * costs before it is tapped (RF-411): up to 19 MB over mobile data, in a warehouse.
   * Nullable because it was born without a check — a row can carry a path and no size.
   */
  master_bytes: number | null
  provenance: PhotoProvenance
  /** Who took the photograph, when it is our own and it is recorded (RF-417). */
  photo_credit: string
  /** Where it came from, when it is not (RF-417). See `photoSource.ts`. */
  provenance_source: string
  /** The full-resolution corrected copy (RF-420): a path, or nothing and why. */
  corrected_path: string | null
  corrected_bytes: number | null
  corrected_pending: boolean
}

/**
 * The columns of `PhotoDetailRow`, as PostgREST wants them.
 *
 * Written out and not derived from the interface, because a type does not exist at
 * runtime — the same reason `artworkImages.ts` keeps its own list. Whatever this
 * interface declares, this string has to select: the corners already cost that bug
 * once (see the comment there), and a colour column missing here reads as the
 * identity, which is indistinguishable from a photograph nobody has adjusted.
 */
export const PHOTO_DETAIL_COLUMNS =
  'image_id, file_photo_date, file_photo_date_exact, original_width, original_height, ' +
  'master_bytes, provenance, photo_credit, provenance_source, ' +
  'corrected_path, corrected_bytes, corrected_pending, ' +
  'color_temperature, color_tint, color_exposure, color_black, color_white, color_gamma, ' +
  'color_shoulder, color_gray, color_neutral_x, color_neutral_y, ' +
  'color_source, color_reference, color_light, color_inherited'

/**
 * The provenance of a row, refusing anything the enum does not name.
 *
 * The column is `not null default 'OWN'`, so in practice it always arrives; what this
 * guards is the direction that matters, because the value gates the colour panel
 * (RF-417). Anything unrecognizable is read as own work — the column's own default —
 * and never as «not our own»: locking the adjustment on a value nobody can explain
 * would take away a function with no way to get it back.
 */
export function provenanceOf(value: unknown): PhotoProvenance {
  return PHOTO_PROVENANCES.includes(value as PhotoProvenance) ? (value as PhotoProvenance) : 'OWN'
}

/**
 * The whole edit of a photograph: the framing from the gallery's row and the colour
 * from the detail one.
 *
 * They are read together and never apart. `editFromColumns` takes both halves at
 * once, and calling it with only the framing —which is what the gallery's row has—
 * answers «neutral colour, nobody looked», which is exactly the reading that would
 * lose a `REVIEWED_UNCHANGED` on the next save.
 */
export function photoEdit(
  row: Partial<EditColumns> | null | undefined,
  detail: Partial<ColorColumns> | null | undefined,
): NormalizedPhotoEdit {
  return editFromColumns({ ...(row ?? {}), ...(detail ?? {}) })
}

/**
 * True when two edits would write the same row, column by column.
 *
 * `sameEdit` answers about the PIXELS and deliberately ignores where the numbers came
 * from, which is right for deciding whether to rewrite the derivatives and wrong for
 * deciding whether to write the row. `imageEdits.ts` says so and exports
 * `editToColumns` for exactly this comparison.
 */
export function sameEditColumns(a: PhotoEdit, b: PhotoEdit): boolean {
  const x = editToColumns(a)
  const y = editToColumns(b)
  return (Object.keys(x) as (keyof EditColumns)[]).every((key) => x[key] === y[key])
}

/**
 * The case that would silently lose work: the same pixels, a different row.
 *
 * It happens on every «Aplicar» in which the cataloger opened the colour panel, looked
 * at the photograph with the artwork in front of her and left it as it was — which
 * stamps `REVIEWED_UNCHANGED`, the one thing that distinguishes «revisado» from
 * «pendiente» («sin revisar» no es «no») — and on every «Aplicar» that only moved
 * where the grey was sampled. Both change nothing anybody can see, so rewriting the
 * copies for them would be waste; not writing the row at all is losing the trace.
 */
export function traceOnlyChange(next: PhotoEdit, stored: PhotoEdit): boolean {
  return sameEdit(next, stored) && !sameEditColumns(next, stored)
}

/**
 * The colour of the artwork's general shot, which is what the other shots inherit
 * (§7: «la toma general manda»).
 *
 * The first general shot in the arranged order, and not the most recent nor the
 * representative one: the order is the cataloger's own (RF-401), it is stable between
 * loads, and it does not move when a photograph is added. Undefined when there is no
 * general shot or when its colour does nothing — there is nothing to inherit then, and
 * offering «heredar» to copy a neutral adjustment would be a control that appears to
 * do nothing.
 *
 * `exceptId` leaves out the photograph being edited: the general shot inherits from
 * nobody, and the editor already ignores this for a `GENERAL` shot. Passing it as well
 * means two independent reasons instead of one.
 */
export function generalColorOf(
  rows: readonly { image_id: string; shot_type: ShotTypeValue }[],
  details: Readonly<Record<string, PhotoDetailRow | undefined>>,
  exceptId?: string | null,
): ColorEdit | undefined {
  for (const row of rows) {
    if (row.shot_type !== 'GENERAL' || row.image_id === exceptId) continue
    const detail = details[row.image_id]
    if (!detail) continue
    const color = photoEdit(null, detail).color
    if (!isNoColor(color)) return color
  }
  return undefined
}

/**
 * What the screen says about the full-resolution corrected copy (RF-420), in every
 * case and never as a gap.
 *
 * Four states and not three, because the database has a fourth one this feature did
 * not create: the 39 rows that were framed before the copy existed carry corrections,
 * no path and `corrected_pending = false`, and reading them as «no hace falta ninguna»
 * would be the one reading that is wrong. Nothing is repaired backwards (ADR-010), so
 * what is owed is saying it.
 *
 * The row does NOT store the reason a copy is pending — only the flag — so the
 * sentence here is the general one. Whoever has just saved has the specific reason in
 * hand, straight from the generator, and should show that one instead.
 */
export function correctedStateText(
  detail: PhotoDetailRow | null | undefined,
  edit: PhotoEdit,
): string {
  if (!detail) {
    return 'No se ha podido leer el estado de la copia a resolución completa.'
  }
  if (detail.corrected_pending) {
    return (
      'La copia a resolución completa queda pendiente: se genera después desde un ordenador. El máster, intacto.'
    )
  }
  if (detail.corrected_path) {
    // Decimal comma, like every other number the cataloger reads (es-ES): the same
    // `replace` that `colorSummary` uses for the midtones.
    const mb = ((detail.corrected_bytes ?? 0) / 1_048_576).toFixed(1).replace('.', ',')
    return (
      `Hay una copia a resolución completa con el giro, el recorte, la perspectiva y el color ya ` +
      `aplicados (${mb} MB). Es la que se manda a una imprenta.`
    )
  }
  if (!isNoEdit(edit)) {
    return (
      'Esta corrección es anterior a las copias a resolución completa. Se generará en la próxima.'
    )
  }
  return (
    'Sin correcciones: para una imprenta, el máster de archivo ya es el original.'
  )
}

/** The offer of «el mismo color que la anterior», or the reason there is none. */
export interface CarriedColorOffer {
  /** The adjustment to apply, already restricted to what this shot type offers. */
  color: ColorEdit | null
  /** Spanish, ready for the help line. Null only when the offer is on. */
  reason: string | null
}

/**
 * «El mismo color que la anterior» (RF-414): the adjustment of the last photograph
 * corrected in this batch, ready for the next one.
 *
 * The whole batch is photographed under the same light —same room, same window, same
 * afternoon— so the second photograph's adjustment is the first one's, and repeating
 * three taps per shot for a number that does not change is what makes a correct tool
 * go unused. What it does NOT do is decide anything by itself: it fills the controls
 * with a starting point that is then adjusted, exactly as a light preset does, and
 * nothing is applied until «Aplicar».
 *
 * Two gates and they are somebody else's rules, not repeated here: `colorAvailability`
 * says whether this photograph can be adjusted at all (RF-417: not a reproduction from
 * another catalog), and `restrictColorToShotType` drops what this kind of shot does not
 * offer, so carrying a general shot's midtones onto a detail of damage cannot happen
 * through the back door.
 */
export function carriedColorOffer(
  remembered: ColorInput,
  shotType?: ShotTypeValue | null,
  provenance?: PhotoProvenance | null,
): CarriedColorOffer {
  const availability = colorAvailability(true, provenance)
  if (!availability.available) return { color: null, reason: availability.reason }
  if (!remembered || isNoColor(remembered)) {
    return {
      color: null,
      reason:
        'Todavía no se ha corregido el color de ninguna fotografía en esta tanda. En cuanto ' +
        'corrijas una, podrás repetir su ajuste en las siguientes con un toque.',
    }
  }
  const color = restrictColorToShotType(remembered, shotType)
  if (isNoColor(color)) {
    return {
      color: null,
      reason:
        'El ajuste de la fotografía anterior no se puede repetir en este tipo de toma: los ' +
        'mandos que movía no se ofrecen aquí, porque en un detalle el color es el dato.',
    }
  }
  return { color, reason: null }
}
