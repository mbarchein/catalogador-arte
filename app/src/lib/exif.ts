/**
 * What a photograph says about itself: the EXIF block of a JPEG.
 *
 * The reason this exists is a date. Of the 44 master photographs in the catalog
 * 35 carry EXIF, and the 14 that matter — the 2022 batch, whose records all show
 * the upload day as the shooting day — carry only `DateTime` of the IFD0, not
 * `DateTimeOriginal`. So the approximate date is not a nicety here: without it
 * fourteen photographs stay wrong, which is why the IFD0 fallback is mandatory
 * and why the difference between the two travels in the type instead of being
 * flattened into one date the caller cannot judge (RF-416).
 *
 * **Own parser, no dependency.** `exifr` has not been published since 2022-05-01,
 * and `exif-reader` wants a `Buffer` polyfill from Node and does not even locate
 * the APP1 segment inside the JPEG — the caller has to do the marker walk anyway,
 * which is most of the work. What is left is a TIFF directory reader for a
 * whitelist of fourteen tags, and it fits here.
 *
 * **Pure over an `ArrayBuffer`.** No DOM, no `File`, no fetch, for the same reason
 * imageEdits.ts and perspective.ts are arithmetic only: this is the part that can
 * be tested, and its fixtures are built byte by byte in the test. It also means the
 * caller decides how much of the file to read — see `EXIF_SLICE_BYTES`.
 *
 * **JPEG only.** PNG and HEIC return null rather than a partial answer: the masters
 * are JPEG by decision of the owner, and a HEIC parser is a different container
 * (ISO-BMFF boxes) for a format the application never writes.
 *
 * Two things this deliberately does NOT do, both because they produce a plausible
 * wrong answer:
 *
 * - **`PixelXDimension` is never the real size of the image.** It is exposed as
 *   `reportedPixelSize`, apart and named so, and never as the dimensions — see the
 *   comment on that field for the 70 % of false positives it produces.
 * - **`File.lastModified` is never a shooting date.** Besides being the date the
 *   file was written, `photoQueue.ts` rebuilds the `File` without that argument, so
 *   by the time a queued shot is uploaded the value is the moment of the rebuild.
 */

/**
 * How much of the file is worth reading: the first 128 KB.
 *
 * Measured over the 44 masters of the dump: parsing this prefix gives the same
 * result as parsing the whole file in 44 of 44. EXIF lives in the APP1 segment,
 * which comes before the pixels, and a segment is capped at 64 KB — so two of them
 * is already generous. It matters because the alternative is `await file
 * .arrayBuffer()` on an 8 MB photograph in the same effect that builds the object
 * URL, on a phone.
 *
 * The cut is also what makes the truncation guards below load-bearing rather than
 * theoretical: a marker header can and does land in the last bytes of the slice.
 */
export const EXIF_SLICE_BYTES = 131072

/** Which tag the date came from. The names are code; the interface never shows them. */
export type ExifDateSource = 'DATE_TIME_ORIGINAL' | 'IFD0_DATE_TIME'

/**
 * A date and time as EXIF writes them: a wall clock with no time zone.
 *
 * Kept as separate fields and not as a `Date` on purpose. EXIF has no offset —
 * `2022:10:09 17:10:33` means «the camera's clock said 17:10» — so turning it into
 * an instant would apply whatever zone the machine running the code happens to be
 * in, and the number shown to the cataloger would depend on the reader's laptop.
 * What we want is the clock as written.
 */
export interface ExifDateTime {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

/**
 * The shooting date and how much it can be trusted.
 *
 * The distinction is the point of the type: `DateTimeOriginal` is when the shutter
 * fired, `DateTime` of the IFD0 is when the file was last written by the camera or
 * by whatever edited it afterwards. In practice the second is the same day often
 * enough to be worth keeping — the whole 2022 batch depends on it — and wrong often
 * enough that it has to be labelled. It reaches the interface as «Fecha del fichero
 * (aproximada)» and the database as `file_photo_date_exact = false`.
 */
export interface PhotoTakenDate {
  when: ExifDateTime
  source: ExifDateSource
  /**
   * True only for `DateTimeOriginal`. Mirrors the `file_photo_date_exact` column,
   * which is why it is here as well as `source`: the column is a boolean and the
   * mapping should not be re-derived at every call site.
   */
  exact: boolean
  /** `YYYY-MM-DD`, the shape the `file_photo_date` column takes. */
  date: string
}

/** The whitelist of §7.1, read. Every field is null when the file does not carry it. */
export interface PhotoExif {
  /** Null when neither date tag is present or both are unreadable. */
  taken: PhotoTakenDate | null
  make: string | null
  model: string | null
  software: string | null
  /** Sensitivity, `ISOSpeedRatings`. */
  iso: number | null
  /** Seconds. `0.008`, not `1/125`: the formatting is `formatExposureTime`'s job. */
  exposureTime: number | null
  /** The f-number itself, `1.8`. */
  fNumber: number | null
  /** Millimetres, as the lens reports them — never converted to an equivalent. */
  focalLength: number | null
  /** The raw `Flash` bitmask, kept because only its bit 0 is interpreted. */
  flash: number | null
  /**
   * Whether the flash fired. Null when the camera reports having no flash at all
   * (bit 5 set, bit 0 clear): «no disparó» would be true and misleading, since
   * there was nothing to fire.
   */
  flashFired: boolean | null
  /**
   * 1..8, or null. Anything outside that range is treated as absent: two of the 44
   * masters write `Orientation = 0`, which is not a value.
   *
   * Exposed but not displayed, and not applied either: the browser already bakes
   * the orientation into what it decodes, so using this to turn anything would turn
   * it twice.
   */
  orientation: number | null
  /**
   * `PixelXDimension` / `PixelYDimension`. **Not the size of the image.**
   *
   * It is what the camera's encoder wrote when it produced the file, before the
   * orientation flag is taken into account, and it is stale as soon as anything
   * touches the pixels. The tempting use — compare it with `naturalWidth` to warn
   * that a photograph was cropped by another application — was measured and
   * rejected: it flags 23 of the 31 files when only 7 are actually cropped, a 70 %
   * false positive rate, because 16 masters combine `Orientation = 6` with
   * unrotated dimensions, so the comparison is between a portrait and its own
   * landscape. Either compare against the pre-orientation dimensions or say
   * nothing; `photoExifRows` says nothing.
   */
  reportedPixelSize: { width: number; height: number } | null
}

/** IFD0 tag numbers of the whitelist. */
const TAG = {
  MAKE: 0x010f,
  MODEL: 0x0110,
  ORIENTATION: 0x0112,
  SOFTWARE: 0x0131,
  DATE_TIME: 0x0132,
  EXIF_IFD: 0x8769,
  EXPOSURE_TIME: 0x829a,
  F_NUMBER: 0x829d,
  ISO: 0x8827,
  DATE_TIME_ORIGINAL: 0x9003,
  FLASH: 0x9209,
  FOCAL_LENGTH: 0x920a,
  PIXEL_X_DIMENSION: 0xa002,
  PIXEL_Y_DIMENSION: 0xa003,
} as const

const IFD0_TAGS: ReadonlySet<number> = new Set([
  TAG.MAKE,
  TAG.MODEL,
  TAG.ORIENTATION,
  TAG.SOFTWARE,
  TAG.DATE_TIME,
  TAG.EXIF_IFD,
])

const EXIF_TAGS: ReadonlySet<number> = new Set([
  TAG.EXPOSURE_TIME,
  TAG.F_NUMBER,
  TAG.ISO,
  TAG.DATE_TIME_ORIGINAL,
  TAG.FLASH,
  TAG.FOCAL_LENGTH,
  TAG.PIXEL_X_DIMENSION,
  TAG.PIXEL_Y_DIMENSION,
])

/**
 * Bytes per component, by TIFF type.
 *
 * **Eight of the twelve types are here. Missing: 6 (SBYTE), 8 (SSHORT), 11 (FLOAT)
 * and 12 (DOUBLE).** That is stated rather than papered over, because the gap is
 * only harmless for a specific reason: nothing in the whitelist is ever written
 * with one of those four types, and an entry whose type is not in this table is
 * skipped instead of measured wrong. Adding a tag to the whitelist that a camera
 * writes as FLOAT — `FocalPlaneXResolution` would be the candidate, and 0 of 44
 * masters carry it — means adding its size here first.
 */
const TYPE_BYTES: Readonly<Record<number, number>> = {
  1: 1, // BYTE
  2: 1, // ASCII
  3: 2, // SHORT
  4: 4, // LONG
  5: 8, // RATIONAL, two LONGs
  7: 1, // UNDEFINED
  9: 4, // SLONG
  10: 8, // SRATIONAL
}

/** Where a value lives, resolved: absolute offset into the buffer. */
interface RawEntry {
  type: number
  count: number
  start: number
}

/**
 * Offset of the TIFF header inside the JPEG, or null.
 *
 * Walks the marker chain instead of searching for the `Exif` string, because the
 * string can also appear inside a thumbnail, an XMP packet or the pixel data, and
 * a search would find whichever comes first.
 *
 * **The loop condition is `p + 8`, not `p + 4`, and that is the fix that matters.**
 * Confirming an APP1 reads the four bytes at `p + 4` (the `Exif` signature), so a
 * marker header that falls in the last 4-7 bytes of the buffer throws a
 * `RangeError` with the looser guard — precisely at the 128 KB cut, which is the
 * one place the buffer is guaranteed to end mid-file. A reader whose failure mode
 * is an exception at the boundary its own design creates is worse than no reader:
 * the editor would refuse to open the photograph.
 */
function findApp1(view: DataView): number | null {
  // SOI. This is also the whole «JPEG only» check: a PNG starts with 0x8950 and
  // leaves here, as does anything else.
  if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return null

  let p = 2
  while (p + 8 <= view.byteLength) {
    if (view.getUint8(p) !== 0xff) return null
    const marker = view.getUint8(p + 1)

    // 0xFF padding before a marker is legal, and so is running into another SOI or
    // a standalone marker (RST0-7, EOI, TEM), none of which carry a length.
    if (marker === 0xff) {
      p += 1
      continue
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) {
      p += 2
      continue
    }
    // Start of scan: from here on it is compressed pixels, and there is no metadata
    // left to find. Stopping matters — walking into the entropy-coded data would
    // read 0xFF bytes that are not markers.
    if (marker === 0xda) return null

    const size = view.getUint16(p + 2)
    if (size < 2) return null

    if (marker === 0xe1) {
      // «Exif\0\0». The second APP1 of a modern phone is XMP, with a URI here
      // instead, and it has to be skipped rather than mistaken for a TIFF header.
      //
      // The signature is ten bytes, so the guard is stricter than the loop's — and
      // the loop's stays as it is, at `p + 8`, because it is the one that answers
      // for the four bytes read on the next line if this check ever moves.
      if (p + 10 > view.byteLength) return null
      if (view.getUint32(p + 4) === 0x45786966 && view.getUint16(p + 8) === 0) {
        return p + 10
      }
    }

    p += 2 + size
  }
  return null
}

/**
 * The entries of one image file directory whose tags are wanted, into `out`.
 *
 * Offsets inside a TIFF block are relative to the start of that block — `base`
 * here, the byte after `Exif\0\0` — and not to the start of the file. Getting that
 * wrong reads plausible garbage rather than failing.
 *
 * Every read is guarded against the end of the buffer and a failed guard skips the
 * entry, because the expected input is a file cut at 128 KB: a directory whose
 * external values sit past the cut is normal, not corrupt, and the fields that did
 * fit are still worth having.
 */
function readIfd(
  view: DataView,
  base: number,
  ifdOffset: number,
  le: boolean,
  wanted: ReadonlySet<number>,
  out: Map<number, RawEntry>,
): void {
  // 8 is the size of the TIFF header, so no directory can start before it. This
  // also rejects the zero a missing or unreadable pointer collapses to.
  const start = base + ifdOffset
  if (ifdOffset < 8 || start + 2 > view.byteLength) return

  const entries = view.getUint16(start, le)
  for (let i = 0; i < entries; i += 1) {
    const entry = start + 2 + i * 12
    // The count is read from the file, so it can claim more entries than exist.
    if (entry + 12 > view.byteLength) return

    const tag = view.getUint16(entry, le)
    if (!wanted.has(tag)) continue

    const type = view.getUint16(entry + 2, le)
    const size = TYPE_BYTES[type]
    if (size === undefined) continue // see TYPE_BYTES: four types are not there

    const count = view.getUint32(entry + 4, le)
    const total = size * count
    if (total <= 0) continue

    // Up to four bytes live in the entry itself; more than that and the entry
    // holds an offset. This is the classic TIFF trap: the same four bytes are a
    // value or a pointer depending on the size of the type.
    const valueStart = total <= 4 ? entry + 8 : base + view.getUint32(entry + 8, le)
    if (valueStart < base || valueStart + total > view.byteLength) continue

    out.set(tag, { type, count, start: valueStart })
  }
}

/**
 * An ASCII value, trimmed, or null.
 *
 * Cut at the first NUL and not merely right-trimmed: `Make` arrives NUL-terminated
 * and often NUL-padded to a round length, and a string carrying invisible bytes
 * would break both the display and any comparison. **A value that is only padding
 * returns null, not the empty string** — two masters carry 32 NULs — because the
 * panel decides what to show from the absence of the field, and an empty string
 * would print a label with nothing after it.
 *
 * Decoded byte by byte as Latin-1 instead of through `TextDecoder`: the tags in the
 * whitelist are manufacturer and model names, ASCII in all 35 masters that have
 * them, and this keeps the module free of any global beyond `DataView`.
 */
function readText(view: DataView, entry: RawEntry): string | null {
  if (entry.type !== 2 && entry.type !== 7) return null
  let text = ''
  for (let i = 0; i < entry.count; i += 1) {
    const byte = view.getUint8(entry.start + i)
    if (byte === 0) break
    text += String.fromCharCode(byte)
  }
  const trimmed = text.trim()
  return trimmed === '' ? null : trimmed
}

/** The first component of a numeric value, whatever integer type it uses. */
function readNumber(view: DataView, entry: RawEntry, le: boolean): number | null {
  switch (entry.type) {
    case 1:
    case 7:
      return view.getUint8(entry.start)
    case 3:
      return view.getUint16(entry.start, le)
    case 4:
      return view.getUint32(entry.start, le)
    case 9:
      return view.getInt32(entry.start, le)
    case 5:
    case 10:
      return readRational(view, entry, le)
    default:
      return null
  }
}

/**
 * A rational as a number, or null when its denominator is zero.
 *
 * Zero over zero is what a camera writes for «unknown» in a field it has to fill,
 * and letting it through would produce `Infinity` or `NaN` — an exposure of `1/0 s`
 * on screen.
 */
function readRational(view: DataView, entry: RawEntry, le: boolean): number | null {
  if (entry.type !== 5 && entry.type !== 10) return null
  const numerator =
    entry.type === 5 ? view.getUint32(entry.start, le) : view.getInt32(entry.start, le)
  const denominator =
    entry.type === 5 ? view.getUint32(entry.start + 4, le) : view.getInt32(entry.start + 4, le)
  if (denominator === 0) return null
  const value = numerator / denominator
  return Number.isFinite(value) ? value : null
}

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

/**
 * `2022:10:09 17:10:33` as its parts, or null when it is not a date.
 *
 * The validation is not decoration: a camera that has never had its clock set
 * writes `0000:00:00 00:00:00`, and a date of year zero reaching `file_photo_date`
 * is worse than no date, because it looks like a datum. Day-of-month included, so
 * February 30th is refused too. The lower bound is 1826, the oldest surviving
 * photograph — the target is the unset clock, and past that the camera's word is
 * taken as it comes.
 *
 * Hyphens are accepted alongside the colons the standard prescribes: some editors
 * rewrite the field as `2022-10-09 17:10:33`, and refusing it would drop a date
 * that is there.
 */
function parseExifDateTime(text: string | null): ExifDateTime | null {
  if (!text) return null
  const found = /^(\d{4})[:-](\d{2})[:-](\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(text.trim())
  if (!found) return null
  const [year, month, day, hour, minute, second] = found.slice(1).map(Number) as [
    number, number, number, number, number, number,
  ]
  if (year < 1826 || month < 1 || month > 12 || day < 1) return null
  const leap = month === 2 && year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  if (day > DAYS_IN_MONTH[month - 1]! + (leap ? 1 : 0)) return null
  if (hour > 23 || minute > 59 || second > 59) return null
  return { year, month, day, hour, minute, second }
}

const pad = (value: number) => String(value).padStart(2, '0')

/** `YYYY-MM-DD` from the parts, for the date column. */
export function exifDateOnly(when: ExifDateTime): string {
  return `${String(when.year).padStart(4, '0')}-${pad(when.month)}-${pad(when.day)}`
}

/**
 * The technical data of a JPEG, or null when there is none to be had.
 *
 * Null covers every way of having nothing — not a JPEG, no APP1, an APP1 that is
 * not EXIF, a broken TIFF header, a directory with no entry of the whitelist — and
 * it never throws, whatever the bytes are. The caller shows one of the two empty
 * messages of §7.1 in that case, and the difference between them is not about the
 * bytes: it is whether the master could be downloaded at all.
 */
export function readPhotoExif(buffer: ArrayBuffer): PhotoExif | null {
  if (!buffer || buffer.byteLength < 12) return null
  const view = new DataView(buffer)

  const base = findApp1(view)
  if (base === null || base + 8 > view.byteLength) return null

  // The TIFF header: byte order, the number 42 as a check that the order was read
  // correctly, and the offset of the first directory.
  const order = view.getUint16(base)
  if (order !== 0x4949 && order !== 0x4d4d) return null
  const le = order === 0x4949
  if (view.getUint16(base + 2, le) !== 42) return null

  const found = new Map<number, RawEntry>()
  readIfd(view, base, view.getUint32(base + 4, le), le, IFD0_TAGS, found)

  // One level down, and only one: the Exif directory is where the shooting date
  // and the camera settings live. Not following pointers found inside it is also
  // what makes a cycle impossible — a file whose Exif IFD points back at the IFD0
  // is a valid file to write and would otherwise loop forever.
  const pointer = found.get(TAG.EXIF_IFD)
  if (pointer) {
    const offset = readNumber(view, pointer, le)
    if (offset !== null) readIfd(view, base, offset, le, EXIF_TAGS, found)
  }

  const text = (tag: number) => {
    const entry = found.get(tag)
    return entry ? readText(view, entry) : null
  }
  const number = (tag: number) => {
    const entry = found.get(tag)
    return entry ? readNumber(view, entry, le) : null
  }

  const original = parseExifDateTime(text(TAG.DATE_TIME_ORIGINAL))
  const fileDate = parseExifDateTime(text(TAG.DATE_TIME))
  const when = original ?? fileDate
  const taken: PhotoTakenDate | null = when
    ? {
        when,
        source: original ? 'DATE_TIME_ORIGINAL' : 'IFD0_DATE_TIME',
        exact: original !== null,
        date: exifDateOnly(when),
      }
    : null

  const orientation = number(TAG.ORIENTATION)
  const flash = number(TAG.FLASH)
  const reportedWidth = number(TAG.PIXEL_X_DIMENSION)
  const reportedHeight = number(TAG.PIXEL_Y_DIMENSION)

  const exif: PhotoExif = {
    taken,
    make: text(TAG.MAKE),
    model: text(TAG.MODEL),
    software: text(TAG.SOFTWARE),
    iso: positive(number(TAG.ISO)),
    exposureTime: positive(number(TAG.EXPOSURE_TIME)),
    fNumber: positive(number(TAG.F_NUMBER)),
    focalLength: positive(number(TAG.FOCAL_LENGTH)),
    flash,
    flashFired: flashFiredFrom(flash),
    // Outside 1..8 there is no orientation, there is a camera writing a zero.
    orientation: orientation !== null && orientation >= 1 && orientation <= 8 ? orientation : null,
    reportedPixelSize:
      reportedWidth !== null && reportedHeight !== null && reportedWidth > 0 && reportedHeight > 0
        ? { width: reportedWidth, height: reportedHeight }
        : null,
  }

  // A directory with no whitelisted tag is the same situation as no EXIF at all,
  // and the panel should say «esta fotografía no trae datos de cámara» rather than
  // draw a heading over nine absent fields.
  return hasAnyDatum(exif) ? exif : null
}

/** Zero and negative are «unknown» in these fields, not measurements. */
function positive(value: number | null): number | null {
  return value !== null && Number.isFinite(value) && value > 0 ? value : null
}

function flashFiredFrom(flash: number | null): boolean | null {
  if (flash === null) return null
  const fired = (flash & 0x01) !== 0
  // Bit 5 means «this camera has no flash unit». Answering «no disparó» there is
  // technically true and reads as a decision the photographer made.
  if (!fired && (flash & 0x20) !== 0) return null
  return fired
}

function hasAnyDatum(exif: PhotoExif): boolean {
  return (
    exif.taken !== null ||
    exif.make !== null ||
    exif.model !== null ||
    exif.software !== null ||
    exif.iso !== null ||
    exif.exposureTime !== null ||
    exif.fNumber !== null ||
    exif.focalLength !== null ||
    exif.flash !== null ||
    exif.orientation !== null ||
    exif.reportedPixelSize !== null
  )
}

// ---------------------------------------------------------------------------
// Formatting for the panel. Spanish, and the decimal separator is the comma.
// ---------------------------------------------------------------------------

const MONTHS = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
]

/**
 * A number with the Spanish decimal comma and no trailing zeros.
 *
 * Written out instead of using `toLocaleString('es-ES')` because the values are
 * short and fixed in shape and the two are not equivalent: the locale formatter
 * also groups thousands, which turns a focal length of `1050` into `1.050` — a
 * decimal point to anyone reading it as a number.
 */
function decimal(value: number, digits: number): string {
  const fixed = value.toFixed(digits)
  // Only the zeros after the separator go: stripping them from an integer would
  // turn 100 into 1.
  const trimmed = digits > 0 ? fixed.replace(/\.?0+$/, '') : fixed
  return trimmed.replace('.', ',')
}

/** `9 de octubre de 2022, 17:10`. Seconds are dropped: nobody catalogs by them. */
export function formatExifDateTime(when: ExifDateTime): string {
  const month = MONTHS[when.month - 1] ?? String(when.month)
  return `${when.day} de ${month} de ${when.year}, ${when.hour}:${pad(when.minute)}`
}

/**
 * `Xiaomi Redmi Note 8 Pro` from a make and a model.
 *
 * The repetition check is there because half the phones in the dump write the make
 * inside the model as well, and joining blindly gives «Xiaomi Xiaomi Redmi Note 8
 * Pro». Null when neither field is present.
 */
export function formatCamera(make: string | null, model: string | null): string | null {
  if (!model) return make ?? null
  if (!make) return model
  return model.toLowerCase().startsWith(make.toLowerCase()) ? model : `${make} ${model}`
}

/**
 * `1/125 s` under a second, `2 s` over it.
 *
 * The fraction and not the decimal below one second because that is how a shutter
 * speed is read, on the camera and in every catalog: `0,008 s` is the same number
 * and nobody recognises it.
 */
export function formatExposureTime(seconds: number | null): string | null {
  if (seconds === null || !Number.isFinite(seconds) || seconds <= 0) return null
  if (seconds >= 1) return `${decimal(seconds, 1)} s`
  return `1/${Math.round(1 / seconds)} s`
}

/** `f/1,8`. */
export function formatAperture(fNumber: number | null): string | null {
  if (fNumber === null || !Number.isFinite(fNumber) || fNumber <= 0) return null
  return `f/${decimal(fNumber, 1)}`
}

/** `ISO 100`. A number, never a judgement about noise. */
export function formatIso(iso: number | null): string | null {
  if (iso === null || !Number.isFinite(iso) || iso <= 0) return null
  return `ISO ${Math.round(iso)}`
}

/**
 * `5,4 mm`, the lens as it reports itself.
 *
 * Not converted to a 35 mm equivalent: that needs the sensor size, which comes from
 * `FocalPlaneXResolution`, which 0 of the 44 masters carry.
 */
export function formatFocalLength(millimetres: number | null): string | null {
  if (millimetres === null || !Number.isFinite(millimetres) || millimetres <= 0) return null
  return `${decimal(millimetres, 1)} mm`
}

/** `Disparó` / `No disparó`. */
export function formatFlash(fired: boolean | null): string | null {
  if (fired === null) return null
  return fired ? 'Disparó' : 'No disparó'
}

/** `4000 × 2252 px`, ungrouped: a catalog reader compares these digit by digit. */
export function formatPixelSize(size: { width: number; height: number } | null): string | null {
  if (!size) return null
  const { width, height } = size
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null
  return `${Math.round(width)} × ${Math.round(height)} px`
}

/**
 * `3,1 MB`, with the Spanish comma, and kB below the megabyte.
 *
 * Binary multiples, matching `images.ts`, so the same file never reads as two
 * different sizes in two screens of the application.
 */
export function formatFileSize(bytes: number | null): string | null {
  if (bytes === null || !Number.isFinite(bytes) || bytes <= 0) return null
  if (bytes < 1_048_576) return `${Math.max(1, Math.round(bytes / 1024))} kB`
  return `${decimal(bytes / 1_048_576, 1)} MB`
}

/** One line of the panel: a Spanish label and a value already formatted. */
export interface ExifRow {
  /** Code, for the React key and for the tests. */
  key: string
  label: string
  value: string
}

/**
 * The panel of §7.1: only the fields that are present, in reading order.
 *
 * Reading order, and it starts with the date, because that is what the cataloger
 * came for — the rest is context that says whether to believe it.
 *
 * `original` is the one datum that does not come from EXIF: the size in pixels
 * comes from the decoder, which is the only source that has been through the
 * orientation, and the weight from the stored `master_bytes`. It is assembled here
 * anyway so the row lands in its place in the list and shares the formatters.
 *
 * **No orientation row and no crop warning.** Orientation is already baked into the
 * pixels on screen, and the crop warning is the 70 % false positive documented on
 * `reportedPixelSize`. No GPS row either: 0 of the 44 masters carry one.
 *
 * An empty array is a legitimate answer and the caller has two different sentences
 * for it (§7.1): never a blank space.
 */
export function photoExifRows(
  exif: PhotoExif | null,
  original?: {
    width?: number | null
    height?: number | null
    bytes?: number | null
  },
): ExifRow[] {
  const rows: ExifRow[] = []
  const add = (key: string, label: string, value: string | null) => {
    if (value !== null && value !== '') rows.push({ key, label, value })
  }

  if (exif?.taken) {
    add(
      'taken',
      exif.taken.exact ? 'Fecha de la toma' : 'Fecha del fichero (aproximada)',
      formatExifDateTime(exif.taken.when),
    )
  }
  add('camera', 'Cámara', formatCamera(exif?.make ?? null, exif?.model ?? null))
  add('software', 'Aplicación de cámara', exif?.software ?? null)

  const size = formatPixelSize(
    original && original.width && original.height
      ? { width: original.width, height: original.height }
      : null,
  )
  const weight = formatFileSize(original?.bytes ?? null)
  add('originalSize', 'Tamaño del original', [size, weight].filter(Boolean).join(' · '))

  add('iso', 'Sensibilidad', formatIso(exif?.iso ?? null))
  add('exposure', 'Exposición', formatExposureTime(exif?.exposureTime ?? null))
  add('aperture', 'Diafragma', formatAperture(exif?.fNumber ?? null))
  add('focalLength', 'Objetivo', formatFocalLength(exif?.focalLength ?? null))
  add('flash', 'Flash', formatFlash(exif?.flashFired ?? null))

  return rows
}
