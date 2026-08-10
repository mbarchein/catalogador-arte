import { describe, expect, it } from 'vitest'
import {
  EXIF_SLICE_BYTES,
  exifDateOnly,
  formatAperture,
  formatCamera,
  formatExifDateTime,
  formatExposureTime,
  formatFileSize,
  formatFlash,
  formatFocalLength,
  formatIso,
  formatPixelSize,
  photoExifRows,
  readPhotoExif,
} from './exif'

/**
 * The fixtures are built in bytes, here, and that is not a stylistic choice: the
 * repository is public and the masters that motivate this reader are outside it, so
 * there is no file to commit. Each case below assembles a real JPEG — SOI, an APP1
 * segment with `Exif\0\0`, a TIFF header and one or two image file directories —
 * around exactly the tags it is about.
 *
 * Building them also documents the format better than a hex dump would: the traps
 * the reader has to survive (a value of four bytes or fewer living inside its own
 * entry, offsets relative to the TIFF header and not to the file, either byte order)
 * are all visible in the builder.
 */

const TYPE = {
  BYTE: 1,
  ASCII: 2,
  SHORT: 3,
  LONG: 4,
  RATIONAL: 5,
  UNDEFINED: 7,
  SLONG: 9,
  SRATIONAL: 10,
} as const

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

interface Tag {
  tag: number
  type: number
  /** ASCII text with its padding written out, or the numeric components. */
  value?: string | number[]
  /** Raw payload, for building an entry of a type the reader does not know. */
  raw?: number[]
  /** Component count, when the raw payload does not imply it. */
  count?: number
}

/** The payload of one entry and how many components it claims. */
function encode(entry: Tag, littleEndian: boolean): { count: number; bytes: Uint8Array } {
  if (entry.raw) {
    return { count: entry.count ?? entry.raw.length, bytes: new Uint8Array(entry.raw) }
  }
  if (typeof entry.value === 'string') {
    const bytes = new Uint8Array(entry.value.length)
    for (let i = 0; i < entry.value.length; i += 1) bytes[i] = entry.value.charCodeAt(i) & 0xff
    return { count: entry.value.length, bytes }
  }
  const values = entry.value ?? []
  const rational = entry.type === TYPE.RATIONAL || entry.type === TYPE.SRATIONAL
  const width = entry.type === TYPE.SHORT ? 2 : entry.type === TYPE.BYTE || entry.type === TYPE.UNDEFINED ? 1 : 4
  const bytes = new Uint8Array(values.length * width)
  const view = new DataView(bytes.buffer)
  values.forEach((value, i) => {
    if (width === 1) view.setUint8(i, value)
    else if (width === 2) view.setUint16(i * 2, value, littleEndian)
    else if (entry.type === TYPE.SLONG || entry.type === TYPE.SRATIONAL) {
      view.setInt32(i * 4, value, littleEndian)
    } else view.setUint32(i * 4, value, littleEndian)
  })
  return { count: rational ? values.length / 2 : values.length, bytes }
}

const evenUp = (length: number) => length + (length % 2)

/** Size of a whole directory: the table, its terminator and the values that overflow. */
function blockSize(tags: Tag[], littleEndian: boolean): number {
  return (
    2 +
    12 * tags.length +
    4 +
    tags.reduce((total, entry) => {
      const { bytes } = encode(entry, littleEndian)
      return total + (bytes.length > 4 ? evenUp(bytes.length) : 0)
    }, 0)
  )
}

/**
 * One directory serialized, ready to be placed at `ifdStart` of the TIFF block.
 *
 * The rule that matters: up to four bytes the value lives in the entry, and beyond
 * that the entry holds an offset relative to the start of the TIFF block.
 */
function ifdBlock(tags: Tag[], ifdStart: number, littleEndian: boolean): Uint8Array {
  const tableSize = 2 + 12 * tags.length + 4
  const block = new Uint8Array(blockSize(tags, littleEndian))
  const view = new DataView(block.buffer)
  view.setUint16(0, tags.length, littleEndian)

  let dataAt = tableSize
  tags.forEach((entry, i) => {
    const at = 2 + i * 12
    const { count, bytes } = encode(entry, littleEndian)
    view.setUint16(at, entry.tag, littleEndian)
    view.setUint16(at + 2, entry.type, littleEndian)
    view.setUint32(at + 4, count, littleEndian)
    if (bytes.length <= 4) {
      block.set(bytes, at + 8)
    } else {
      view.setUint32(at + 8, ifdStart + dataAt, littleEndian)
      block.set(bytes, dataAt)
      dataAt += evenUp(bytes.length)
    }
  })
  // The four bytes after the table are the offset of the next directory: zero here,
  // since the thumbnail IFD1 is not part of the whitelist.
  return block
}

/** The TIFF block: header, IFD0 and, when there are Exif tags, the Exif IFD after it. */
function tiffBlock(ifd0: Tag[], exif: Tag[] | null, littleEndian = true): Uint8Array {
  const tags = [...ifd0]
  if (exif) {
    // The pointer's own value depends on how long IFD0 turns out to be, so the size
    // is computed first with the pointer in place and then filled in.
    tags.push({ tag: TAG.EXIF_IFD, type: TYPE.LONG, value: [0] })
    const exifStart = 8 + blockSize(tags, littleEndian)
    tags[tags.length - 1] = { tag: TAG.EXIF_IFD, type: TYPE.LONG, value: [exifStart] }
  }
  const block0 = ifdBlock(tags, 8, littleEndian)
  const blockExif = exif ? ifdBlock(exif, 8 + block0.length, littleEndian) : new Uint8Array(0)

  const tiff = new Uint8Array(8 + block0.length + blockExif.length)
  const view = new DataView(tiff.buffer)
  view.setUint16(0, littleEndian ? 0x4949 : 0x4d4d)
  view.setUint16(2, 42, littleEndian)
  view.setUint32(4, 8, littleEndian)
  tiff.set(block0, 8)
  tiff.set(blockExif, 8 + block0.length)
  return tiff
}

/** A segment with its marker and its length, the way a JPEG carries one. */
function segment(marker: number, payload: Uint8Array): Uint8Array {
  const bytes = new Uint8Array(payload.length + 4)
  const view = new DataView(bytes.buffer)
  view.setUint16(0, 0xff00 | marker)
  view.setUint16(2, payload.length + 2)
  bytes.set(payload, 4)
  return bytes
}

const ascii = (text: string): Uint8Array => {
  const bytes = new Uint8Array(text.length)
  for (let i = 0; i < text.length; i += 1) bytes[i] = text.charCodeAt(i) & 0xff
  return bytes
}

const concat = (parts: Uint8Array[]): Uint8Array => {
  const total = parts.reduce((sum, part) => sum + part.length, 0)
  const out = new Uint8Array(total)
  let at = 0
  for (const part of parts) {
    out.set(part, at)
    at += part.length
  }
  return out
}

/** APP1 carrying EXIF: the signature, its two NULs, and the TIFF block. */
const exifSegment = (tiff: Uint8Array) =>
  segment(0xe1, concat([ascii('Exif'), new Uint8Array([0, 0]), tiff]))

/** The other APP1 a modern phone writes, which has to be skipped and not parsed. */
const xmpSegment = () =>
  segment(
    0xe1,
    concat([ascii('http://ns.adobe.com/xap/1.0/'), new Uint8Array([0]), ascii('<x:xmpmeta/>')]),
  )

/**
 * The buffer of a `Uint8Array` is typed as possibly shared, and the reader takes an
 * `ArrayBuffer` because that is what `Blob.arrayBuffer()` hands over. The cast lives
 * here once instead of at every fixture.
 */
const bufferOf = (bytes: Uint8Array): ArrayBuffer => bytes.buffer as ArrayBuffer

/** SOI, the segments given, and EOI. */
function jpeg(segments: Uint8Array[]): ArrayBuffer {
  return bufferOf(concat([new Uint8Array([0xff, 0xd8]), ...segments, new Uint8Array([0xff, 0xd9])]))
}

/** The usual case: a JPEG whose only metadata is the EXIF of these tags. */
const jpegWithExif = (ifd0: Tag[], exif: Tag[] | null = null, littleEndian = true) =>
  jpeg([exifSegment(tiffBlock(ifd0, exif, littleEndian))])

const bytesOf = (buffer: ArrayBuffer) => new Uint8Array(buffer)

// Every ASCII fixture below is written the way a camera writes it, with the NUL
// terminator and sometimes the NUL padding, so the reader is always exercised on the
// real shape and never on a bare JavaScript string.

describe('RF-416, RF-419: leer los datos técnicos de una fotografía', () => {
  it('lee la fecha de la toma de DateTimeOriginal y la marca como fiable', () => {
    const exif = readPhotoExif(
      jpegWithExif(
        [{ tag: TAG.MAKE, type: TYPE.ASCII, value: 'Xiaomi\u0000' }],
        [{ tag: TAG.DATE_TIME_ORIGINAL, type: TYPE.ASCII, value: '2022:10:09 17:10:33\u0000' }],
      ),
    )
    expect(exif?.taken).toEqual({
      when: { year: 2022, month: 10, day: 9, hour: 17, minute: 10, second: 33 },
      source: 'DATE_TIME_ORIGINAL',
      exact: true,
      date: '2022-10-09',
    })
  })

  // The case of the 14 masters from 2022: without this fallback none gets corrected.
  it('usa el DateTime del IFD0 cuando falta el otro, y lo marca como aproximado', () => {
    const exif = readPhotoExif(
      jpegWithExif([{ tag: TAG.DATE_TIME, type: TYPE.ASCII, value: '2022:10:09 17:10:33\u0000' }]),
    )
    expect(exif?.taken?.source).toBe('IFD0_DATE_TIME')
    expect(exif?.taken?.exact).toBe(false)
    expect(exif?.taken?.date).toBe('2022-10-09')
  })

  it('prefiere DateTimeOriginal cuando vienen los dos', () => {
    const exif = readPhotoExif(
      jpegWithExif(
        [{ tag: TAG.DATE_TIME, type: TYPE.ASCII, value: '2023:01:02 08:00:00\u0000' }],
        [{ tag: TAG.DATE_TIME_ORIGINAL, type: TYPE.ASCII, value: '2022:10:09 17:10:33\u0000' }],
      ),
    )
    expect(exif?.taken?.exact).toBe(true)
    expect(exif?.taken?.date).toBe('2022-10-09')
  })

  it('descarta el reloj sin poner en hora y las fechas imposibles', () => {
    for (const written of ['0000:00:00 00:00:00', '2022:02:30 10:00:00', '2022:13:01 10:00:00', 'ayer']) {
      const exif = readPhotoExif(
        jpegWithExif([
          { tag: TAG.MAKE, type: TYPE.ASCII, value: 'Xiaomi\u0000' },
          { tag: TAG.DATE_TIME, type: TYPE.ASCII, value: `${written}\u0000` },
        ]),
      )
      expect(exif?.taken, written).toBeNull()
    }
  })

  it('acepta la variante con guiones que escriben algunos editores', () => {
    const exif = readPhotoExif(
      jpegWithExif([{ tag: TAG.DATE_TIME, type: TYPE.ASCII, value: '2022-10-09 17:10:33\u0000' }]),
    )
    expect(exif?.taken?.date).toBe('2022-10-09')
  })

  it('lee la cámara, la aplicación y los ajustes de la toma', () => {
    const exif = readPhotoExif(
      jpegWithExif(
        [
          { tag: TAG.MAKE, type: TYPE.ASCII, value: 'Xiaomi\u0000' },
          { tag: TAG.MODEL, type: TYPE.ASCII, value: 'Redmi Note 8 Pro\u0000' },
          { tag: TAG.SOFTWARE, type: TYPE.ASCII, value: 'MediaTek Camera Application\u0000' },
        ],
        [
          { tag: TAG.EXPOSURE_TIME, type: TYPE.RATIONAL, value: [1, 125] },
          { tag: TAG.F_NUMBER, type: TYPE.RATIONAL, value: [18, 10] },
          { tag: TAG.FOCAL_LENGTH, type: TYPE.RATIONAL, value: [543, 100] },
          // Three components: it does not fit in the entry and travels by offset.
          { tag: TAG.ISO, type: TYPE.SHORT, value: [100, 0, 0] },
        ],
      ),
    )
    expect(exif?.make).toBe('Xiaomi')
    expect(exif?.model).toBe('Redmi Note 8 Pro')
    expect(exif?.software).toBe('MediaTek Camera Application')
    expect(exif?.exposureTime).toBeCloseTo(1 / 125, 10)
    expect(exif?.fNumber).toBeCloseTo(1.8, 10)
    expect(exif?.focalLength).toBeCloseTo(5.43, 10)
    expect(exif?.iso).toBe(100)
  })

  it('recorta el relleno de NUL de las cadenas', () => {
    const exif = readPhotoExif(
      jpegWithExif([{ tag: TAG.MAKE, type: TYPE.ASCII, value: 'Xiaomi\u0000\u0000\u0000\u0000' }]),
    )
    expect(exif?.make).toBe('Xiaomi')
  })

  // The string ends at the first NUL, not at the end of the entry: there are files that
  // pack several values in a row, and dragging in the second would give «Xiaomi 8 Pro».
  it('corta en el primer NUL y no en el final de la entrada', () => {
    const exif = readPhotoExif(
      jpegWithExif([{ tag: TAG.MAKE, type: TYPE.ASCII, value: 'Xiaomi\u0000Redmi\u0000' }]),
    )
    expect(exif?.make).toBe('Xiaomi')
  })

  // There are 2 masters with a string of 32 NULs: a tag present and empty.
  it('devuelve null, no cadena vacía, cuando la cadena es solo relleno', () => {
    const exif = readPhotoExif(
      jpegWithExif([
        { tag: TAG.MAKE, type: TYPE.ASCII, value: 'Xiaomi\u0000' },
        { tag: TAG.SOFTWARE, type: TYPE.ASCII, value: '\u0000'.repeat(32) },
      ]),
    )
    expect(exif?.software).toBeNull()
  })

  it('lee igual los dos órdenes de byte', () => {
    const tags: Tag[] = [
      { tag: TAG.MAKE, type: TYPE.ASCII, value: 'Xiaomi\u0000' },
      { tag: TAG.DATE_TIME, type: TYPE.ASCII, value: '2022:10:09 17:10:33\u0000' },
      { tag: TAG.ORIENTATION, type: TYPE.SHORT, value: [6] },
    ]
    const exifTags: Tag[] = [{ tag: TAG.F_NUMBER, type: TYPE.RATIONAL, value: [18, 10] }]
    const little = readPhotoExif(jpegWithExif(tags, exifTags, true))
    const big = readPhotoExif(jpegWithExif(tags, exifTags, false))
    expect(big).toEqual(little)
    expect(big?.orientation).toBe(6)
  })

  // 2 of the 44 masters carry Orientation = 0, which is not a legal value.
  it('trata una Orientation fuera de 1..8 como ausente', () => {
    for (const written of [0, 9, 255]) {
      const exif = readPhotoExif(
        jpegWithExif([
          { tag: TAG.MAKE, type: TYPE.ASCII, value: 'Xiaomi\u0000' },
          { tag: TAG.ORIENTATION, type: TYPE.SHORT, value: [written] },
        ]),
      )
      expect(exif?.orientation, `Orientation = ${written}`).toBeNull()
    }
  })

  it('interpreta el bit del flash y calla cuando la cámara no tiene flash', () => {
    const flash = (value: number) =>
      readPhotoExif(
        jpegWithExif([{ tag: TAG.MAKE, type: TYPE.ASCII, value: 'Xiaomi\u0000' }], [
          { tag: TAG.FLASH, type: TYPE.SHORT, value: [value] },
        ]),
      )
    expect(flash(0x00)?.flashFired).toBe(false)
    expect(flash(0x01)?.flashFired).toBe(true)
    expect(flash(0x19)?.flashFired).toBe(true)
    // 0x20: «this camera has no flash». Saying «it did not fire» would be a decision
    // nobody took.
    expect(flash(0x20)?.flashFired).toBeNull()
  })

  it('salta las entradas de un tipo TIFF que no conoce, sin lanzar', () => {
    // Type 11 (FLOAT), one of the four the size table does not have.
    const exif = readPhotoExif(
      jpegWithExif(
        [{ tag: TAG.MAKE, type: TYPE.ASCII, value: 'Xiaomi\u0000' }],
        [
          { tag: TAG.FOCAL_LENGTH, type: 11, raw: [0, 0, 0x2c, 0x41], count: 1 },
          { tag: TAG.F_NUMBER, type: TYPE.RATIONAL, value: [18, 10] },
        ],
      ),
    )
    expect(exif?.focalLength).toBeNull()
    expect(exif?.fNumber).toBeCloseTo(1.8, 10)
  })

  it('descarta un racional con denominador cero en vez de devolver infinito', () => {
    const exif = readPhotoExif(
      jpegWithExif([{ tag: TAG.MAKE, type: TYPE.ASCII, value: 'Xiaomi\u0000' }], [
        { tag: TAG.EXPOSURE_TIME, type: TYPE.RATIONAL, value: [0, 0] },
      ]),
    )
    expect(exif?.exposureTime).toBeNull()
  })

  it('salta el APP1 de XMP y encuentra el de EXIF que va detrás', () => {
    const exif = readPhotoExif(
      jpeg([
        xmpSegment(),
        exifSegment(tiffBlock([{ tag: TAG.MAKE, type: TYPE.ASCII, value: 'Xiaomi\u0000' }], null)),
      ]),
    )
    expect(exif?.make).toBe('Xiaomi')
  })
})

describe('RF-419: lo que no trae datos devuelve null y nunca lanza', () => {
  it('un JPEG sin APP1', () => {
    expect(readPhotoExif(jpeg([segment(0xfe, ascii('un comentario'))]))).toBeNull()
  })

  it('un PNG, aunque traiga EXIF: solo se lee JPEG', () => {
    const png = concat([
      new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      exifSegment(tiffBlock([{ tag: TAG.MAKE, type: TYPE.ASCII, value: 'Xiaomi\u0000' }], null)),
    ])
    expect(readPhotoExif(bufferOf(png))).toBeNull()
  })

  it('un HEIC, que no es un JPEG por mucho que sea una foto del móvil', () => {
    const heic = concat([
      new Uint8Array([0, 0, 0, 24]),
      ascii('ftypheic'),
      new Uint8Array(32),
    ])
    expect(readPhotoExif(bufferOf(heic))).toBeNull()
  })

  it('un IFD sin ninguna entrada', () => {
    expect(readPhotoExif(jpegWithExif([]))).toBeNull()
  })

  it('un IFD con entradas, ninguna de la lista blanca', () => {
    // 0x011a is XResolution: it exists, and it is not shown.
    expect(readPhotoExif(jpegWithExif([{ tag: 0x011a, type: TYPE.RATIONAL, value: [72, 1] }]))).toBeNull()
  })

  it('una cabecera TIFF con el orden de byte o el 42 equivocados', () => {
    const broken = (patch: (view: DataView) => void) => {
      const tiff = tiffBlock([{ tag: TAG.MAKE, type: TYPE.ASCII, value: 'Xiaomi\u0000' }], null)
      patch(new DataView(tiff.buffer))
      return readPhotoExif(jpeg([exifSegment(tiff)]))
    }
    expect(broken((view) => view.setUint16(0, 0x4a4a))).toBeNull()
    expect(broken((view) => view.setUint16(2, 43, true))).toBeNull()
  })

  it('un IFD0 cuyo offset apunta fuera del fichero', () => {
    const tiff = tiffBlock([{ tag: TAG.MAKE, type: TYPE.ASCII, value: 'Xiaomi\u0000' }], null)
    new DataView(tiff.buffer).setUint32(4, 999_999, true)
    expect(readPhotoExif(jpeg([exifSegment(tiff)]))).toBeNull()
  })

  // An IFD declaring 500 entries and bringing one is the file cut to 128 KB seen
  // from inside: what fitted is read, it stops at the first entry that does not fit, and
  // nothing is invented with the bytes behind it.
  it('un IFD que declara más entradas de las que hay: lo que cupo, y para', () => {
    const tiff = tiffBlock([{ tag: TAG.MAKE, type: TYPE.ASCII, value: 'Xiaomi\u0000' }], null)
    new DataView(tiff.buffer).setUint16(8, 500, true)
    const exif = readPhotoExif(jpeg([exifSegment(tiff)]))
    expect(exif?.make).toBe('Xiaomi')
    expect(exif?.model).toBeNull()
  })

  /**
   * The 128 KB boundary, which is where the design cuts the file: a
   * marker header in the last 4-7 bytes. With the guard at `p + 4` instead
   * of `p + 8`, reading the «Exif» signature throws RangeError right here, and the editor
   * would refuse to open the photograph.
   */
  it('un marcador truncado en el límite del recorte, en cualquiera de sus longitudes', () => {
    const truncatable = bytesOf(
      jpegWithExif([{ tag: TAG.MAKE, type: TYPE.ASCII, value: 'Xiaomi\u0000' }]),
    )
    for (let length = 0; length <= 12; length += 1) {
      const cut = bufferOf(truncatable.slice(0, length))
      expect(() => readPhotoExif(cut), `cortado a ${length} bytes`).not.toThrow()
      expect(readPhotoExif(cut), `cortado a ${length} bytes`).toBeNull()
    }
  })

  /**
   * The exact case that forces `p + 8`, and it has to be built carefully so that
   * the file is long enough to reach the marker walk: a
   * complete comment in front, and behind an APP1 header ending in the
   * last 2 to 7 bytes. Confirming the APP1 reads the four bytes of the «Exif» signature,
   * so with the guard at `p + 4` these lengths throw RangeError.
   */
  it('una cabecera de APP1 que se queda en los últimos bytes del recorte', () => {
    const head = concat([
      new Uint8Array([0xff, 0xd8]),
      segment(0xfe, new Uint8Array(6)), // un comentario, para adelantar el puntero
      new Uint8Array([0xff, 0xe1, 0x00, 0x10, 0x45, 0x78]),
    ])
    // The marker starts at byte 12; the cuts go through its whole header.
    for (let length = 14; length <= head.length; length += 1) {
      const cut = bufferOf(head.slice(0, length))
      expect(() => readPhotoExif(cut), `cortado a ${length} bytes`).not.toThrow()
      expect(readPhotoExif(cut), `cortado a ${length} bytes`).toBeNull()
    }
  })

  it('un APP1 cortado por la mitad del bloque TIFF', () => {
    const full = bytesOf(
      jpegWithExif(
        [{ tag: TAG.MAKE, type: TYPE.ASCII, value: 'Xiaomi\u0000' }],
        [{ tag: TAG.DATE_TIME_ORIGINAL, type: TYPE.ASCII, value: '2022:10:09 17:10:33\u0000' }],
      ),
    )
    for (let length = 12; length < full.length; length += 1) {
      expect(() => readPhotoExif(bufferOf(full.slice(0, length))), `cortado a ${length}`).not.toThrow()
    }
    // Cut before the external values, what did fit is still read and what
    // did not is missing: never an invented value.
    const early = readPhotoExif(bufferOf(full.slice(0, 24)))
    expect(early).toBeNull()
  })

  it('un buffer vacío', () => {
    expect(readPhotoExif(new ArrayBuffer(0))).toBeNull()
  })

  it('y el recorte que se pide es de 128 KB, medido sobre los 44 másteres', () => {
    expect(EXIF_SLICE_BYTES).toBe(131072)
  })
})

describe('RF-419: PixelXDimension no son las dimensiones de la fotografía', () => {
  /**
   * 16 masters carry `Orientation = 6` with the dimensions unrotated. Comparing
   * `PixelXDimension` with the decoded width would mark 23 of 31 files as
   * cropped when only 7 are: 70 % false positives.
   */
  const exif = readPhotoExif(
    jpegWithExif(
      [
        { tag: TAG.MAKE, type: TYPE.ASCII, value: 'Xiaomi\u0000' },
        { tag: TAG.ORIENTATION, type: TYPE.SHORT, value: [6] },
      ],
      [
        { tag: TAG.PIXEL_X_DIMENSION, type: TYPE.LONG, value: [4000] },
        { tag: TAG.PIXEL_Y_DIMENSION, type: TYPE.LONG, value: [2252] },
      ],
    ),
  )

  it('se expone aparte, con su nombre, y no como tamaño', () => {
    expect(exif?.reportedPixelSize).toEqual({ width: 4000, height: 2252 })
  })

  it('y no produce ningún aviso de recorte previo en el panel', () => {
    const rows = photoExifRows(exif, { width: 2252, height: 4000, bytes: 3_250_585 })
    for (const row of rows) {
      expect(`${row.label} ${row.value}`).not.toMatch(/recort/i)
    }
    // The size shown is the decoder's, already rotated, not the EXIF's.
    expect(rows.find((row) => row.key === 'originalSize')?.value).toBe('2252 × 4000 px · 3,1 MB')
    expect(rows.some((row) => row.value.includes('4000 × 2252'))).toBe(false)
  })
})

describe('RF-419: los valores formateados que ve la usuaria', () => {
  it('la fecha, en español y con el reloj tal como lo escribió la cámara', () => {
    expect(
      formatExifDateTime({ year: 2022, month: 10, day: 9, hour: 17, minute: 10, second: 33 }),
    ).toBe('9 de octubre de 2022, 17:10')
    expect(formatExifDateTime({ year: 2024, month: 1, day: 31, hour: 9, minute: 5, second: 0 })).toBe(
      '31 de enero de 2024, 9:05',
    )
  })

  it('la fecha para la columna, en el orden que entiende la base', () => {
    expect(exifDateOnly({ year: 2022, month: 10, day: 9, hour: 0, minute: 0, second: 0 })).toBe(
      '2022-10-09',
    )
  })

  it('la exposición como fracción por debajo del segundo', () => {
    expect(formatExposureTime(1 / 125)).toBe('1/125 s')
    expect(formatExposureTime(1 / 8000)).toBe('1/8000 s')
    expect(formatExposureTime(0.5)).toBe('1/2 s')
    expect(formatExposureTime(1)).toBe('1 s')
    expect(formatExposureTime(1.3)).toBe('1,3 s')
    expect(formatExposureTime(2)).toBe('2 s')
    expect(formatExposureTime(0)).toBeNull()
    expect(formatExposureTime(null)).toBeNull()
  })

  it('el diafragma con la coma decimal española', () => {
    expect(formatAperture(1.8)).toBe('f/1,8')
    expect(formatAperture(8)).toBe('f/8')
    expect(formatAperture(2.2)).toBe('f/2,2')
    expect(formatAperture(null)).toBeNull()
  })

  it('la sensibilidad y el objetivo como números, sin juicios', () => {
    expect(formatIso(100)).toBe('ISO 100')
    expect(formatIso(3200)).toBe('ISO 3200')
    expect(formatFocalLength(5.43)).toBe('5,4 mm')
    expect(formatFocalLength(26)).toBe('26 mm')
    expect(formatFocalLength(null)).toBeNull()
  })

  it('el flash, en palabras', () => {
    expect(formatFlash(false)).toBe('No disparó')
    expect(formatFlash(true)).toBe('Disparó')
    expect(formatFlash(null)).toBeNull()
  })

  it('el tamaño en píxeles sin agrupar los miles, que se leen dígito a dígito', () => {
    expect(formatPixelSize({ width: 4000, height: 2252 })).toBe('4000 × 2252 px')
    expect(formatPixelSize(null)).toBeNull()
    expect(formatPixelSize({ width: 0, height: 100 })).toBeNull()
  })

  it('el peso del fichero, con coma y en múltiplos binarios como en el resto', () => {
    expect(formatFileSize(3_250_585)).toBe('3,1 MB')
    expect(formatFileSize(12 * 1_048_576)).toBe('12 MB')
    expect(formatFileSize(500 * 1024)).toBe('500 kB')
    expect(formatFileSize(0)).toBeNull()
    expect(formatFileSize(null)).toBeNull()
  })

  it('nunca cuela un punto decimal donde el español lleva coma', () => {
    const values = [
      formatExposureTime(1.5),
      formatAperture(1.8),
      formatFocalLength(5.43),
      formatFileSize(3_250_585),
    ]
    for (const value of values) expect(value).not.toMatch(/\d\.\d/)
  })

  it('la cámara junta marca y modelo sin repetir la marca', () => {
    expect(formatCamera('Xiaomi', 'Redmi Note 8 Pro')).toBe('Xiaomi Redmi Note 8 Pro')
    expect(formatCamera('Xiaomi', 'Xiaomi Redmi Note 8 Pro')).toBe('Xiaomi Redmi Note 8 Pro')
    expect(formatCamera('Xiaomi', null)).toBe('Xiaomi')
    expect(formatCamera(null, 'Redmi Note 8 Pro')).toBe('Redmi Note 8 Pro')
    expect(formatCamera(null, null)).toBeNull()
  })
})

describe('RF-419: el panel solo pinta los campos presentes', () => {
  const complete = readPhotoExif(
    jpegWithExif(
      [
        { tag: TAG.MAKE, type: TYPE.ASCII, value: 'Xiaomi\u0000' },
        { tag: TAG.MODEL, type: TYPE.ASCII, value: 'Redmi Note 8 Pro\u0000' },
        { tag: TAG.SOFTWARE, type: TYPE.ASCII, value: 'MediaTek Camera\u0000' },
      ],
      [
        { tag: TAG.DATE_TIME_ORIGINAL, type: TYPE.ASCII, value: '2022:10:09 17:10:33\u0000' },
        { tag: TAG.ISO, type: TYPE.SHORT, value: [100] },
        { tag: TAG.EXPOSURE_TIME, type: TYPE.RATIONAL, value: [1, 125] },
        { tag: TAG.F_NUMBER, type: TYPE.RATIONAL, value: [18, 10] },
        { tag: TAG.FOCAL_LENGTH, type: TYPE.RATIONAL, value: [543, 100] },
        { tag: TAG.FLASH, type: TYPE.SHORT, value: [0] },
      ],
    ),
  )

  it('en el orden de lectura del apartado 7.1, empezando por la fecha', () => {
    const rows = photoExifRows(complete, { width: 4000, height: 2252, bytes: 3_250_585 })
    expect(rows.map((row) => row.key)).toEqual([
      'taken',
      'camera',
      'software',
      'originalSize',
      'iso',
      'exposure',
      'aperture',
      'focalLength',
      'flash',
    ])
    expect(rows.map((row) => row.label)).toEqual([
      'Fecha de la toma',
      'Cámara',
      'Aplicación de cámara',
      'Tamaño del original',
      'Sensibilidad',
      'Exposición',
      'Diafragma',
      'Objetivo',
      'Flash',
    ])
    expect(rows.map((row) => row.value)).toEqual([
      '9 de octubre de 2022, 17:10',
      'Xiaomi Redmi Note 8 Pro',
      'MediaTek Camera',
      '4000 × 2252 px · 3,1 MB',
      'ISO 100',
      '1/125 s',
      'f/1,8',
      '5,4 mm',
      'No disparó',
    ])
  })

  it('etiqueta la fecha del fichero como aproximada, que es lo que es', () => {
    const approximate = readPhotoExif(
      jpegWithExif([{ tag: TAG.DATE_TIME, type: TYPE.ASCII, value: '2022:10:09 17:10:33\u0000' }]),
    )
    expect(photoExifRows(approximate)[0]).toEqual({
      key: 'taken',
      label: 'Fecha del fichero (aproximada)',
      value: '9 de octubre de 2022, 17:10',
    })
  })

  it('omite la fila que no tiene dato, sin dejar la etiqueta suelta', () => {
    const rows = photoExifRows(
      readPhotoExif(jpegWithExif([{ tag: TAG.MAKE, type: TYPE.ASCII, value: 'Xiaomi\u0000' }])),
    )
    expect(rows.map((row) => row.key)).toEqual(['camera'])
  })

  // With no EXIF but with the file downloaded, the original's size is still
  // a datum: the screen does not go blank for lack of camera data.
  it('da el tamaño del original aunque no haya nada de EXIF', () => {
    expect(photoExifRows(null, { width: 1080, height: 2400, bytes: 245_000 })).toEqual([
      { key: 'originalSize', label: 'Tamaño del original', value: '1080 × 2400 px · 239 kB' },
    ])
  })

  it('y devuelve la lista vacía cuando no hay absolutamente nada que contar', () => {
    expect(photoExifRows(null)).toEqual([])
    expect(photoExifRows(null, { width: null, height: null, bytes: null })).toEqual([])
  })
})
