import { photoExifRows, type PhotoExif } from '../../lib/exif'

/**
 * The «Datos de la fotografía» panel of the editor (RF-419, §7.1).
 *
 * What the file itself says about how it was taken, read out of the first 128 KB of the
 * master in the same effect that builds the object URL — measured over the 44 masters of
 * the dump, that prefix gives the same answer as the whole file in 44 of 44, and the
 * alternative is `await file.arrayBuffer()` on an 8 MB photograph on a phone.
 *
 * Three rules, and all three are the requirement and not taste:
 *
 *  - **Only the fields that are there.** The list comes from `photoExifRows`, which drops
 *    whatever the file does not carry; an empty row with a dash reads as a measurement of
 *    nothing.
 *  - **Numbers and never judgements.** The application does not have an opinion about
 *    whether a shot is well exposed. It says `1/60 s` and `ISO 800` and stops there.
 *  - **Never a hole.** With nothing to show there are two different sentences and the
 *    difference matters: a photograph that carries no camera data is not the same thing
 *    as one whose data is in a master that did not download, and telling her the first
 *    when it is the second sends her to fix what is not broken.
 *
 * What is deliberately NOT here: `Orientation`, already baked into the pixels on screen,
 * so a row saying «6» would describe a turn nobody can see; GPS, which 0 of the 44
 * masters carry; and the tempting warning that the photograph was cropped by another
 * application, which was measured and rejected — comparing `PixelXDimension` with
 * `naturalWidth` flags 23 of 31 files when only 7 are cropped, because 16 combine
 * `Orientation = 6` with unrotated dimensions.
 */

/** Long month names, for a date that has no time to go with it. */
function spanishDate(iso: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!match) return null
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])]
  if (!(month >= 1 && month <= 12) || !(day >= 1 && day <= 31)) return null
  // Built and formatted in UTC on purpose: an EXIF date is a wall clock with no zone, so
  // letting the machine's own zone touch it would print the day before for anybody east
  // or west of the cataloger. `es-ES` gives «9 de octubre de 2022», which is the form the
  // rest of the application prints.
  return new Intl.DateTimeFormat('es-ES', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, day)))
}

/**
 * The aside that names the date the photograph carries when it disagrees with the date on
 * the record, or null when there is nothing to say (§7.1).
 *
 * **In a low voice and with no alarm**: today all 39 photographs of the base disagree,
 * because their stored date is the date they were uploaded. They are two different data
 * and either of them can be right, so the panel states the discrepancy and does not name
 * a culprit — the day it becomes a warning it will fire on every row and be ignored.
 */
export function photoDateWhisper(
  taken: string | null | undefined,
  record: string | null | undefined,
): string | null {
  if (!taken || !record || taken === record) return null
  const said = spanishDate(taken)
  if (!said) return null
  return `La ficha guarda otra fecha; la foto dice ${said}.`
}

/**
 * Which of the two sentences of §7.1 an empty panel shows.
 *
 * The switch is `canRestoreOriginal`, which is the editor's own way of saying «the source
 * IS the archive master»: over the consultation copy the camera data was never in the
 * file, because the derivative is a WebP this application wrote.
 */
export function emptyDataMessage(canRestoreOriginal: boolean): string {
  return canRestoreOriginal
    ? 'Esta fotografía no trae datos de cámara.'
    : 'Los datos de cámara están en el máster de archivo, que no se ha podido descargar.'
}

export function DataIcon({ className = 'h-6 w-6' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className={className}
      aria-hidden
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6" strokeLinecap="round" />
      <circle cx="12" cy="7.8" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function PhotoDataPanel({
  exif,
  loading,
  canRestoreOriginal,
  original,
  recordPhotoDate,
  onClose,
}: {
  /** What the file says, or null when it says nothing. */
  exif: PhotoExif | null
  /** True while the first 128 KB are still being read. */
  loading: boolean
  canRestoreOriginal: boolean
  /**
   * The size the decoder reports —the only source that has already been through the
   * orientation— and the weight of the file in hand.
   */
  original: { width?: number | null; height?: number | null; bytes?: number | null }
  /** `photo_date` of the record, to be compared in a low voice. */
  recordPhotoDate?: string | null
  onClose: () => void
}) {
  const rows = photoExifRows(exif, original)
  const whisper = photoDateWhisper(exif?.taken?.date ?? null, recordPhotoDate ?? null)

  return (
    <div className="space-y-2">
      <div className="max-h-48 overflow-y-auto rounded-lg bg-white/10 p-2" style={{ touchAction: 'pan-y' }}>
        {loading ? (
          <p role="status" className="text-center text-xs text-stone-400">
            Leyendo los datos de la fotografía…
          </p>
        ) : rows.length === 0 ? (
          <p className="text-center text-xs text-stone-300">{emptyDataMessage(canRestoreOriginal)}</p>
        ) : (
          <dl className="space-y-1 text-xs">
            {rows.map((row) => (
              // A row of two and not a two-column grid: the labels of §7.1 run from
              // «Flash» to «Aplicación de cámara», and a column wide enough for the
              // longest would leave the short ones adrift from their value on a phone.
              <div key={row.key} className="flex items-baseline justify-between gap-3">
                <dt className="shrink-0 text-stone-400">{row.label}</dt>
                <dd className="min-w-0 text-right tabular-nums text-stone-100">{row.value}</dd>
              </div>
            ))}
          </dl>
        )}
        {whisper && (
          // In a low voice: smaller, greyer and with no icon. It is a discrepancy between
          // two legitimate data and not an error.
          <p className="mt-2 border-t border-white/10 pt-1 text-[0.6875rem] leading-snug text-stone-400">
            {whisper}
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={onClose}
        className="btn min-h-touch w-full border border-stone-600 text-sm text-white"
      >
        Volver a las herramientas
      </button>
    </div>
  )
}
