/**
 * Printable A5 PDF record with a QR code (RF-202: the identifier is a physical
 * label; the QR turns it into a doorway to the living record).
 *
 * Generated entirely in the browser: there is no server to do it on, and this
 * way it also works from the storage room. This module is imported dynamically
 * from the record page so pdf-lib does not bloat the initial bundle.
 */
import { PDFDocument, PageSizes, StandardFonts, rgb, type PDFFont, type PDFImage } from 'pdf-lib'
import QRCode from 'qrcode'
import { displayDate } from './dates'
import { computeTarget, signedUrl } from './images'
import { supabase } from './supabase'
import { displayMeasurements, displayTitle } from './title'
import {
  ARTIST_LABEL,
  CONSERVATION_LABEL,
  EXISTENCE_LABEL,
  SHOT_TYPE_LABEL,
  TRI_STATE_LABEL,
  type Artwork,
  type ShotTypeValue,
} from './types'

export interface RecordLine {
  label: string
  value: string
}

/** URL the QR encodes: the artwork's living record. New QR codes emit the
 * English route; the printed ones point at /obra/:id, which App.tsx keeps as
 * a legacy redirect. */
export function recordUrl(catalogId: string, origin?: string): string {
  const base =
    origin ?? (import.meta.env.VITE_APP_URL as string | undefined) ?? window.location.origin
  return `${base.replace(/\/+$/, '')}/artwork/${catalogId}`
}

/**
 * The relevant data of the record, in printing order. The interface rule also
 * holds on paper: never an unexplained gap.
 */
export function recordLines(artwork: Artwork): RecordLine[] {
  const datum = (v: string) => v.trim() || 'Sin indicar'
  return [
    { label: 'Fondo', value: ARTIST_LABEL[artwork.artist] },
    { label: 'Tipo de obra', value: datum(artwork.artwork_type) },
    { label: 'Serie', value: datum(artwork.series) },
    { label: 'Fecha', value: displayDate(artwork.execution_date) },
    { label: 'Técnica', value: datum(artwork.technique) },
    { label: 'Soporte', value: datum(artwork.support) },
    { label: 'Medidas', value: displayMeasurements(artwork) },
    {
      label: 'Firmada',
      value:
        artwork.signed === 'YES' && artwork.signature_description
          ? `Sí, ${artwork.signature_description}`
          : TRI_STATE_LABEL[artwork.signed],
    },
    { label: 'Conservación', value: CONSERVATION_LABEL[artwork.conservation_status] },
    { label: 'Existencia', value: EXISTENCE_LABEL[artwork.existence_status] },
    { label: 'Ubicación', value: datum(artwork.physical_location) },
  ]
}

/**
 * The PDF's Helvetica only knows WinAnsi (Latin-1 and little more). A
 * character outside that repertoire would break the whole generation, so it is
 * replaced by "?": a visible question mark beats a record that does not print.
 */
export function printableText(text: string): string {
  return text.replace(/[^\u0020-\u007e\u00a0-\u00ff\u2018\u2019\u201c\u201d\u2013\u2014\u2026\u2022\u20ac]/g, '?')
}

/** Splits a text into lines that fit within `maxWidth` points. */
function wrapLines(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth || !current) {
      current = candidate
    } else {
      lines.push(current)
      current = word
    }
  }
  if (current) lines.push(current)
  return lines.length > 0 ? lines : ['']
}

/**
 * Long edge, in pixels, of the photograph embedded in the PDF.
 *
 * The derivative is 2000 px (`LEVELS.derivative`) and it is not needed whole:
 * the photo is printed at 170 pt at most — some 6 cm — and 1200 px over 6 cm is
 * above 500 ppi, more than a printer resolves. Every pixel beyond that only
 * makes a heavier PDF to generate and send from a phone. As everywhere else in
 * the project, it **never upscales**: `computeTarget` returns the original size
 * when the derivative is smaller.
 */
const PHOTO_PIXELS = 1200
const PHOTO_QUALITY = 0.85

export interface RecordPhoto {
  /** JPEG bytes: pdf-lib only embeds JPEG and PNG, and derivatives are WebP. */
  jpeg: Uint8Array
  shotType: ShotTypeValue
}

/**
 * Recodes the derivative to JPEG, which is what pdf-lib can embed.
 *
 * Done in the browser because there is no server to do it on — the same reason
 * the derivatives themselves are generated on the device (ADR-002).
 */
async function toEmbeddableJpeg(source: Blob): Promise<Uint8Array> {
  const bitmap = await createImageBitmap(source)
  try {
    const target = computeTarget(bitmap.width, bitmap.height, PHOTO_PIXELS)
    const canvas = document.createElement('canvas')
    canvas.width = target.width
    canvas.height = target.height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('El navegador no ha dado un contexto de dibujo')
    // JPEG has no transparency: without a white base underneath, an image with
    // an alpha channel would come out on a black background once printed.
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, target.width, target.height)
    ctx.drawImage(bitmap, 0, 0, target.width, target.height)
    const encoded = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('No se pudo codificar la fotografía'))),
        'image/jpeg',
        PHOTO_QUALITY,
      )
    })
    return new Uint8Array(await encoded.arrayBuffer())
  } finally {
    bitmap.close()
  }
}

/**
 * The photograph that represents the artwork, ready to embed.
 *
 * Which image it is comes from the `representative_image` view (RF-403), as in
 * every other place that needs it: recomputing the rule here would let the
 * printed record disagree with the list and the record page.
 *
 * It uses the **derivative**, not the master: the master is only downloaded on
 * demand (RF-411), and at a long edge of 2000 px the derivative is already more
 * than an A5 can print. The signature is short-lived because it is used right
 * here and never stored (RF-110: the bucket is private).
 */
export async function loadRecordPhoto(catalogId: string): Promise<RecordPhoto | null> {
  const { data, error } = await supabase
    .from('representative_image')
    .select('derivative_path, shot_type')
    .eq('catalog_id', catalogId)
    .maybeSingle()
  if (error || !data) return null

  const row = data as unknown as { derivative_path: string; shot_type: ShotTypeValue }
  const url = await signedUrl(row.derivative_path, 120)
  if (!url) return null

  const response = await fetch(url)
  if (!response.ok) return null
  return { jpeg: await toEmbeddableJpeg(await response.blob()), shotType: row.shot_type }
}

const GRAY = rgb(0.45, 0.42, 0.4)
const INK = rgb(0.11, 0.1, 0.09)
const PAPER_GRAY = rgb(0.95, 0.945, 0.94)

/**
 * Side, in points, of the box the photograph fits into: at most about 6 cm
 * printed, enough to recognize the artwork at a glance while the data block
 * keeps the full width of the page.
 *
 * It is a box and not a fixed size, and it shrinks: the photo is scaled to fit
 * inside it — never deformed — and the box is only as tall as the data leaves
 * room for. **The data owns the page**; the photograph is an aid to identify it
 * and gives way, because a record whose location does not fit is worse than one
 * with a smaller photo.
 */
const PHOTO_BOX = 170
const MIN_PHOTO_BOX = 96
/** Gap between the photo column and the header text. */
const PHOTO_GAP = 14
/** Side of the QR in the footer: at 108 pt any phone reads it at arm's length. */
const QR_SIDE = 108
/** Height of a printed data line, and the air between two rows. */
const LINE = 13
const ROW_GAP = 4

/** Top of the footer band — the QR and its note. Nothing goes below it. */
const footerTopAt = (margin: number) => margin + 12 + QR_SIDE + 14

/**
 * Side of the photo box for a data block of that height: what is left between
 * the running head and the footer, bounded by `MIN_PHOTO_BOX` and `PHOTO_BOX`.
 * The 20 pt are the rule that closes the header band and its air.
 */
export function photoBoxSide(dataHeight: number, pageHeight: number, margin: number): number {
  const room = pageHeight - margin - 12 - (footerTopAt(margin) + dataHeight + 20)
  return Math.max(MIN_PHOTO_BOX, Math.min(PHOTO_BOX, room))
}

/**
 * @param loadPhoto Injectable on purpose. The record resolves its own
 * photograph — see `loadRecordPhoto` — and the conversion needs
 * `createImageBitmap` and a canvas, which the test environment does not have.
 */
export async function generateRecordPdf(
  artwork: Artwork,
  origin?: string,
  loadPhoto: (catalogId: string) => Promise<RecordPhoto | null> = loadRecordPhoto,
): Promise<Blob> {
  const doc = await PDFDocument.create()
  const page = doc.addPage(PageSizes.A5) // 419.53 × 595.28 pt, portrait
  const { width, height } = page.getSize()
  const margin = 36

  const normal = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const italic = await doc.embedFont(StandardFonts.HelveticaOblique)

  // ── Photograph ──────────────────────────────────────────────
  // A failure here never stops the printing: neither the network of a storage
  // room nor a browser without canvas is a reason to leave the cataloger
  // without a record. Without a photo the gap is explained (RF-1002).
  const photo = await loadPhoto(artwork.catalog_id).catch(() => null)
  let embedded: PDFImage | null = null
  if (photo) {
    // Same criterion for bytes that turn out not to be a valid JPEG.
    try {
      embedded = await doc.embedJpg(photo.jpeg)
    } catch {
      embedded = null
    }
  }

  // ── What the data needs, before deciding the photo ───────────
  // The data block goes at full width and its height depends on how much each
  // value wraps, so it is measured first: the footer (QR) is untouchable and
  // the photo box takes what is left over.
  const valueX = margin + 92
  const valueWidth = width - margin - valueX
  const rows = recordLines(artwork).map(({ label, value }) => ({
    label,
    lines: wrapLines(printableText(value), normal, 10, valueWidth),
  }))
  const dataHeight =
    rows.reduce((total, row) => total + row.lines.length, 0) * LINE + rows.length * ROW_GAP
  const footerTop = footerTopAt(margin)
  const photoBox = photoBoxSide(dataHeight, height, margin)

  let y = height - margin

  // ── Header ──────────────────────────────────────────────────
  // Running head across the full width: the photo column starts below it.
  page.drawText('INVENTARIO Y CATÁLOGO RAZONADO — ROTILI / RUIZ CAMPINS', {
    x: margin, y, size: 7, font: normal, color: GRAY,
  })
  y -= 12

  // The photo occupies the right column of the header band, scaled to fit the
  // box: the proportions of the artwork are data too.
  const photoSize = embedded
    ? embedded.scaleToFit(photoBox, photoBox)
    : { width: photoBox, height: photoBox * 0.72 }
  const photoX = width - margin - photoSize.width
  let photoBottom = y - photoSize.height
  if (embedded) {
    page.drawImage(embedded, {
      x: photoX, y: photoBottom, width: photoSize.width, height: photoSize.height,
    })
    // A general shot needs no caption; anything else does, because a signature
    // detail or a back side does not portray the artwork.
    if (photo && photo.shotType !== 'GENERAL') {
      photoBottom -= 9
      page.drawText(printableText(SHOT_TYPE_LABEL[photo.shotType]), {
        x: photoX, y: photoBottom, size: 7, font: normal, color: GRAY,
      })
      photoBottom -= 3
    }
  } else {
    page.drawRectangle({
      x: photoX, y: photoBottom, width: photoSize.width, height: photoSize.height,
      color: PAPER_GRAY, borderColor: GRAY, borderWidth: 0.6,
    })
    const marker = 'Imagen no disponible'
    page.drawText(marker, {
      x: photoX + (photoSize.width - normal.widthOfTextAtSize(marker, 8)) / 2,
      y: photoBottom + photoSize.height / 2 - 3,
      size: 8, font: normal, color: GRAY,
    })
  }

  // Header text keeps clear of the photo column, whose width depends on whether
  // the photograph is portrait or landscape.
  const headerWidth = photoX - PHOTO_GAP - margin

  y -= 12
  page.drawText(printableText(artwork.catalog_id), {
    x: margin, y, size: 24, font: bold, color: INK,
  })
  y -= 15
  const subtitle = `${ARTIST_LABEL[artwork.artist]} · ${displayDate(artwork.execution_date)}`
  // Wrapped, not truncated: a date can be a whole sentence («entre c. 1978 y
  // 1983, según la correspondencia») and unwrapped it would run over the photo.
  for (const line of wrapLines(printableText(subtitle), normal, 10, headerWidth)) {
    page.drawText(line, { x: margin, y, size: 10, font: normal, color: INK })
    y -= 13
  }
  y -= 5
  for (const line of wrapLines(
    printableText(displayTitle(artwork.title)), italic, 13, headerWidth,
  )) {
    page.drawText(line, { x: margin, y, size: 13, font: italic, color: INK })
    y -= 16
  }
  // The rule closes the band below whichever column reaches further down.
  y = Math.min(y, photoBottom) - 4
  page.drawLine({
    start: { x: margin, y }, end: { x: width - margin, y },
    thickness: 0.8, color: GRAY,
  })
  y -= 16

  // ── Data ────────────────────────────────────────────────────
  // Second valve, for the record whose values wrap so much that not even the
  // smallest photo box makes room: the air between rows gives way. Never the QR
  // (RF-1003), and never a second page for a sheet meant to be attached to the
  // artwork.
  const textHeight = rows.reduce((total, row) => total + row.lines.length, 0) * LINE
  const rowGap = Math.max(0, Math.min(ROW_GAP, (y - footerTop - textHeight) / rows.length))
  for (const { label, lines } of rows) {
    page.drawText(label, { x: margin, y, size: 8, font: normal, color: GRAY })
    for (const line of lines) {
      page.drawText(line, { x: valueX, y, size: 10, font: normal, color: INK })
      y -= LINE
    }
    y -= rowGap
  }

  // ── QR and footer ───────────────────────────────────────────
  const url = recordUrl(artwork.catalog_id, origin)
  const qrPng = await QRCode.toDataURL(url, { margin: 0, width: QR_SIDE * 3 })
  const qrImage = await doc.embedPng(qrPng)
  const qrX = width - margin - QR_SIDE
  page.drawImage(qrImage, { x: qrX, y: margin + 12, width: QR_SIDE, height: QR_SIDE })
  page.drawText(printableText(url), {
    x: margin, y: margin, size: 6.5, font: normal, color: GRAY,
  })

  const qrNote = 'El código abre esta misma ficha en la aplicación, con sus fotografías y su historial al día.'
  let noteY = margin + 12 + QR_SIDE - 8
  for (const line of wrapLines(qrNote, normal, 8, qrX - margin - 14)) {
    page.drawText(line, { x: margin, y: noteY, size: 8, font: normal, color: GRAY })
    noteY -= 10.5
  }
  page.drawText(
    `Ficha generada el ${new Date().toLocaleDateString('es-ES')}`,
    { x: margin, y: noteY - 6, size: 8, font: normal, color: GRAY },
  )

  const bytes = await doc.save()
  return new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' })
}
