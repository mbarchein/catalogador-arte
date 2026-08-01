import { inflateSync } from 'node:zlib'
import { PDFDocument, PDFRawStream } from 'pdf-lib'
import { describe, expect, it } from 'vitest'
import {
  generateRecordPdf,
  photoBoxSide,
  printableText,
  recordLines,
  recordUrl,
  type RecordPhoto,
} from './recordPdf'
import type { Artwork } from './types'

/**
 * The branch of the place, as the record page resolves it off the tree (ADR-006).
 * It travels as an argument because the artwork row only holds the identifier.
 */
const PLACE_PATH = 'Castelar 4, mesa de Mario'

const ARTWORK: Artwork = {
  catalog_id: 'TS-0001',
  artist: 'TEST',
  title: 'Bodegón de ensayo',
  attributed_title: 'YES',
  artwork_type: 'Pintura',
  series: 'Paisajes de la sierra',
  execution_date: 'c. 1980',
  start_year: 1980,
  end_year: null,
  approximate_date: true,
  unconfirmed_date: false,
  date_note: '',
  technique: 'Óleo',
  support: '',
  height_cm: 50,
  width_cm: 40,
  depth_cm: null,
  signed: 'YES',
  signature_description: 'ángulo inferior derecho',
  dated_on_artwork: 'NO',
  conservation_status: 'GOOD',
  physical_place_id: 'p1',
  existence_status: 'PRESERVED',
  photographed: false,
  measurements_verified: false,
  inventory_phase_completed: false,
  documentation_phase_completed: false,
  catalog_record_complete: false,
  inventory_process_notes: '',
  updated_at: '2026-07-27T00:00:00Z',
  basic_updated_at: null,
  updated_by: null,
  active: true,
}

// RF-202: the identifier is the physical label glued to the artwork; the
// printable record carries it large and the QR opens the living record.
describe('recordUrl', () => {
  it('composes the record URL from the given origin', () => {
    expect(recordUrl('TS-0001', 'https://catalogo.example')).toBe(
      'https://catalogo.example/artwork/TS-0001',
    )
  })

  it('tolerates the trailing slash of the origin without duplicating it', () => {
    expect(recordUrl('AR-0002', 'https://catalogo.example/')).toBe(
      'https://catalogo.example/artwork/AR-0002',
    )
  })
})

describe('printableText', () => {
  it('keeps Spanish and WinAnsi typographic punctuation', () => {
    const text = 'Ñandú — «óleo», 50 × 40 cm… ¿seguro?'
    expect(printableText(text)).toBe(text)
  })

  it('replaces with "?" what Helvetica cannot print', () => {
    expect(printableText('flecha → y emoji 🎨')).toBe('flecha ? y emoji ??')
  })
})

describe('recordLines', () => {
  const lines = recordLines(ARTWORK, PLACE_PATH)
  const valueOf = (label: string) => lines.find((l) => l.label === label)?.value

  it('translates the codes to the interface labels', () => {
    expect(valueOf('Fondo')).toBe('Pruebas')
    expect(valueOf('Conservación')).toBe('Bueno')
  })

  it('describes the signature when there is a description', () => {
    expect(valueOf('Firmada')).toBe('Sí, ángulo inferior derecho')
  })

  it('never leaves a gap: the empty datum is declared', () => {
    expect(valueOf('Soporte')).toBe('Sin indicar')
  })

  // ADR-006: the row only carries the identifier of the node, so the branch
  // arrives already resolved by whoever holds the tree. It still reads with
  // commas on paper, which is what the decision promised.
  it('prints the branch of the place it receives', () => {
    expect(valueOf('Ubicación')).toBe('Castelar 4, mesa de Mario')
  })

  // RF-1002 and the rule of never an unexplained gap: an artwork with no place
  // is legitimate, and on paper it has to say so.
  it('declares the artwork with no place instead of leaving it blank', () => {
    const withoutPlace = recordLines({ ...ARTWORK, physical_place_id: null })
    expect(withoutPlace.find((l) => l.label === 'Ubicación')?.value).toBe('Sin indicar')
  })
})

// A5 portrait, in points, and the margin of the record.
const A5_WIDTH = 419.53
const A5_HEIGHT = 595.28
const MARGIN = 36

// RF-1002: the data is the record and the photograph accompanies it. On a sheet
// meant to be attached to the artwork nothing may fall on top of the QR
// (RF-1003), so what gives way is the photo.
describe('photoBoxSide', () => {
  it('gives the photo its full size when the data is short', () => {
    expect(photoBoxSide(140, A5_HEIGHT, MARGIN)).toBe(170)
  })

  it('shrinks the photo when the data needs the room', () => {
    const shortData = photoBoxSide(180, A5_HEIGHT, MARGIN)
    const longData = photoBoxSide(240, A5_HEIGHT, MARGIN)
    expect(longData).toBeLessThan(shortData)
    expect(longData).toBeGreaterThanOrEqual(96)
  })

  it('never goes below the minimum, however long the data is', () => {
    expect(photoBoxSide(400, A5_HEIGHT, MARGIN)).toBe(96)
    // Not even with data that on its own does not fit on the page: a negative
    // box would draw the photo upside down.
    expect(photoBoxSide(2000, A5_HEIGHT, MARGIN)).toBe(96)
  })
})

/**
 * A real 12×8 JPEG, the smallest fixture that is still a valid image.
 *
 * The conversion of the derivative — fetch of the signed URL,
 * `createImageBitmap`, canvas, recoding to JPEG — is **not** exercised by these
 * tests: the environment has neither `createImageBitmap` nor a canvas. What is
 * verified is the part that decides whether the record prints: that a
 * photograph reaches the PDF, and that the record comes out all the same when
 * it does not. Hence the injected loader.
 */
const SMALL_JPEG = Uint8Array.from(
  atob(
    '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDACAWGBwYFCAcGhwkIiAmMFA0MCwsMGJGSjpQdGZ6eHJmcG6AkLicgIiu' +
      'im5woNqirr7EztDOfJri8uDI8LjKzsb/wAALCAAIAAwBAREA/8QAFQABAQAAAAAAAAAAAAAAAAAAAwT/xAAgEAAB' +
      'AQgDAAAAAAAAAAAAAAABAgADBAUREhMxIUFR/9oACAEBAAA/ABl0PrhrIuaJgX2BLjKUgFRutoT1ryjf/9k=',
  ),
  (c) => c.charCodeAt(0),
)

const latin1 = (bytes: Uint8Array) => new TextDecoder('latin1').decode(bytes)

/**
 * What the page says, read back from the document.
 *
 * pdf-lib compresses the content streams, so to check that the record prints a
 * literal they have to be inflated. The text can travel plain — `(Reverso) Tj`
 * — or in hexadecimal, and which of the two is pdf-lib's business, not the
 * record's: both forms are looked for.
 */
async function printedText(bytes: Uint8Array): Promise<string> {
  const doc = await PDFDocument.load(bytes)
  let content = ''
  for (const [, object] of doc.context.enumerateIndirectObjects()) {
    if (!(object instanceof PDFRawStream)) continue
    try {
      content += latin1(new Uint8Array(inflateSync(object.contents)))
    } catch {
      // Not a Flate stream: the JPEG of the photo or the PNG of the QR.
    }
  }
  return content
}

const asHex = (text: string) =>
  Array.from(text, (c) => c.charCodeAt(0).toString(16).padStart(2, '0')).join('')

/**
 * Where each image is drawn, read back from the content stream.
 *
 * pdf-lib paints an image by transforming the unit square: inside its `q`/`Q`
 * block it translates to the lower-left corner and scales to the size, with the
 * identity matrices of the rotation and the skew in between. All of them are of
 * the form `a 0 0 d e f cm`, so the placement is their composition: the sides
 * multiply and the only displacement is the one that positions the image.
 */
async function imagePlacements(bytes: Uint8Array) {
  const content = await printedText(bytes)
  const drawing = /\/\S+ Do/
  return content
    .split(/\bq\b/)
    .filter((block) => drawing.test(block))
    .map((block) => {
      const matrices = Array.from(
        block.slice(0, block.search(drawing)).matchAll(/(-?[\d.]+) 0 0 (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) cm/g),
        (m) => ({ a: Number(m[1]), d: Number(m[2]), e: Number(m[3]), f: Number(m[4]) }),
      )
      const move = matrices.find(({ e, f }) => e !== 0 || f !== 0) ?? { e: 0, f: 0 }
      return {
        x: move.e,
        y: move.f,
        width: matrices.reduce((side, { a }) => side * a, 1),
        height: matrices.reduce((side, { d }) => side * d, 1),
      }
    })
}

/** Side of the QR on the sheet: it never shrinks (RF-1003). */
const QR_SIDE = 108

const withPhoto = async () => ({ jpeg: SMALL_JPEG, shotType: 'GENERAL' }) as RecordPhoto

/**
 * Which of the two images is which: only the QR is a 108 pt square, and the
 * photograph is scaled to fit its box without ever being deformed.
 */
const splitImages = (images: Awaited<ReturnType<typeof imagePlacements>>) => {
  const qr = images.find((i) => i.width === QR_SIDE && i.height === QR_SIDE)
  return { qr, photo: images.find((i) => i !== qr) }
}

async function pdfOf(loadPhoto: (catalogId: string) => Promise<RecordPhoto | null>) {
  const blob = await generateRecordPdf(
    ARTWORK,
    PLACE_PATH,
    'https://catalogo.example',
    loadPhoto,
  )
  expect(blob.type).toBe('application/pdf')
  const bytes = new Uint8Array(await blob.arrayBuffer())
  const raw = latin1(bytes)
  expect(raw.slice(0, 5)).toBe('%PDF-')
  const content = (await printedText(bytes)).toLowerCase()
  return {
    bytes,
    raw,
    /** Whether the record prints that literal. */
    prints: (text: string) =>
      content.includes(text.toLowerCase()) || content.includes(asHex(text)),
  }
}

const noPhoto = async () => null

describe('generateRecordPdf', () => {
  // The series groups the catalog, so the printed record has to carry it: a
  // record on a table without its series cannot be filed back.
  it('prints the series of the artwork', async () => {
    const { prints } = await pdfOf(noPhoto)
    expect(prints('Serie')).toBe(true)
    expect(prints('Paisajes de la sierra')).toBe(true)
  })

  it('produces a real A5 PDF, with the QR embedded', async () => {
    const { bytes } = await pdfOf(noPhoto)
    // With the QR (PNG) embedded, the record weighs quite a bit more than an
    // empty PDF.
    expect(bytes.length).toBeGreaterThan(4000)
  })

  // RF-1002 and RF-403: the record carries the image the database says
  // represents the artwork, recoded to JPEG because pdf-lib does not embed the
  // WebP of the derivative.
  it('embeds the photograph as a JPEG when there is a representative image', async () => {
    const { raw, prints } = await pdfOf(async () => ({
      jpeg: SMALL_JPEG,
      shotType: 'GENERAL',
    }))
    expect(raw).toContain('DCTDecode')
    expect(prints('Imagen no disponible')).toBe(false)
  })

  // A signature detail or a back side does not portray the artwork: saying so
  // on paper avoids taking the photo for the general view of the work.
  it('captions the shot type when it is not a general view', async () => {
    const { prints } = await pdfOf(async () => ({ jpeg: SMALL_JPEG, shotType: 'BACK' }))
    expect(prints('Reverso')).toBe(true)
  })

  it('does not caption the general view, which needs no explanation', async () => {
    const { prints } = await pdfOf(async () => ({ jpeg: SMALL_JPEG, shotType: 'GENERAL' }))
    expect(prints('General')).toBe(false)
  })

  // RF-1002: without an image, the marker. Never a page half done.
  it('generates the record all the same when the artwork has no photograph', async () => {
    const { bytes, raw, prints } = await pdfOf(noPhoto)
    expect(prints('Imagen no disponible')).toBe(true)
    expect(raw).not.toContain('DCTDecode')
    expect(bytes.length).toBeGreaterThan(4000)
  })

  // The record is printed in a storage room, where the network fails. A failure
  // downloading the photo must not leave the cataloger without paper.
  it('generates the record all the same when the download of the photograph fails', async () => {
    const { raw, prints } = await pdfOf(async () => {
      throw new Error('Fallo de red')
    })
    expect(prints('Imagen no disponible')).toBe(true)
    expect(raw).not.toContain('DCTDecode')
  })

  it('generates the record all the same when the bytes are not a valid JPEG', async () => {
    const { prints } = await pdfOf(async () => ({
      jpeg: new Uint8Array([1, 2, 3, 4]),
      shotType: 'GENERAL',
    }))
    expect(prints('Imagen no disponible')).toBe(true)
  })
})

/**
 * Which of the two images goes on top is not a matter of taste: the QR travels
 * with the identifier at the head of the sheet, because it is what is aimed at
 * with the phone and the artwork in front (RF-1003), and the photograph closes
 * the page (RF-1002). The record is printed and glued to the artwork, so the
 * arrangement is fixed here and not left to whoever next touches the layout.
 */
describe('the arrangement of the sheet', () => {
  it('draws exactly two images: the QR and the photograph', async () => {
    const images = await imagePlacements((await pdfOf(withPhoto)).bytes)
    expect(images).toHaveLength(2)
    const { qr, photo } = splitImages(images)
    expect(qr).toBeDefined()
    expect(photo).toBeDefined()
  })

  it('puts the QR in the header, right under the running head', async () => {
    const { qr } = splitImages(await imagePlacements((await pdfOf(withPhoto)).bytes))
    // The running head takes the first 12 pt of the printable area.
    expect(qr!.y + qr!.height).toBeCloseTo(A5_HEIGHT - MARGIN - 12, 5)
  })

  it('puts the photograph in the footer band, resting on the bottom air', async () => {
    const { photo } = splitImages(await imagePlacements((await pdfOf(withPhoto)).bytes))
    // The 12 pt below are for the printed URL, along the bottom edge.
    expect(photo!.y).toBeCloseTo(MARGIN + 12, 5)
  })

  it('never lets the photograph rise above the QR', async () => {
    const { qr, photo } = splitImages(await imagePlacements((await pdfOf(withPhoto)).bytes))
    expect(qr!.y).toBeGreaterThan(photo!.y + photo!.height)
  })

  // Both hang from the right edge: a single column, the data at their left.
  it('aligns both to the right margin', async () => {
    const images = await imagePlacements((await pdfOf(withPhoto)).bytes)
    const { qr, photo } = splitImages(images)
    expect(qr!.x + qr!.width).toBeCloseTo(A5_WIDTH - MARGIN, 5)
    expect(photo!.x + photo!.width).toBeCloseTo(A5_WIDTH - MARGIN, 5)
  })
})
