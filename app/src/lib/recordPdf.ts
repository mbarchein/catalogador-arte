/**
 * Printable A5 PDF record with a QR code (RF-202: the identifier is a physical
 * label; the QR turns it into a doorway to the living record).
 *
 * Generated entirely in the browser: there is no server to do it on, and this
 * way it also works from the storage room. This module is imported dynamically
 * from the record page so pdf-lib does not bloat the initial bundle.
 */
import { PDFDocument, PageSizes, StandardFonts, rgb, type PDFFont } from 'pdf-lib'
import QRCode from 'qrcode'
import { displayDate } from './dates'
import { displayMeasurements, displayTitle } from './title'
import {
  ARTIST_LABEL,
  CONSERVATION_LABEL,
  EXISTENCE_LABEL,
  TRI_STATE_LABEL,
  type Artwork,
} from './types'

export interface RecordLine {
  label: string
  value: string
}

/** URL the QR encodes: the artwork's living record. The /obra/ route stays —
 * QR codes already printed on physical labels point at it. */
export function recordUrl(catalogId: string, origin?: string): string {
  const base =
    origin ?? (import.meta.env.VITE_APP_URL as string | undefined) ?? window.location.origin
  return `${base.replace(/\/+$/, '')}/obra/${catalogId}`
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
    { label: 'Fecha', value: displayDate(artwork.execution_date) },
    { label: 'Técnica', value: datum(artwork.technique) },
    { label: 'Soporte', value: datum(artwork.support) },
    { label: 'Medidas', value: displayMeasurements(artwork) },
    {
      label: 'Firmada',
      value:
        artwork.signed === 'SI' && artwork.signature_description
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

const GRAY = rgb(0.45, 0.42, 0.4)
const INK = rgb(0.11, 0.1, 0.09)

export async function generateRecordPdf(artwork: Artwork, origin?: string): Promise<Blob> {
  const doc = await PDFDocument.create()
  const page = doc.addPage(PageSizes.A5) // 419.53 × 595.28 pt, portrait
  const { width, height } = page.getSize()
  const margin = 36

  const normal = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const italic = await doc.embedFont(StandardFonts.HelveticaOblique)

  let y = height - margin

  // ── Header ──────────────────────────────────────────────────
  page.drawText('INVENTARIO Y CATÁLOGO RAZONADO — ROTILI / RUIZ CAMPINS', {
    x: margin, y, size: 7, font: normal, color: GRAY,
  })
  y -= 24
  page.drawText(printableText(artwork.catalog_id), {
    x: margin, y, size: 24, font: bold, color: INK,
  })
  y -= 15
  const subtitle = `${ARTIST_LABEL[artwork.artist]} · ${displayDate(artwork.execution_date)}`
  page.drawText(printableText(subtitle), { x: margin, y, size: 10, font: normal, color: INK })
  y -= 18
  for (const line of wrapLines(
    printableText(displayTitle(artwork.title)), italic, 13, width - margin * 2,
  )) {
    page.drawText(line, { x: margin, y, size: 13, font: italic, color: INK })
    y -= 16
  }
  y -= 4
  page.drawLine({
    start: { x: margin, y }, end: { x: width - margin, y },
    thickness: 0.8, color: GRAY,
  })
  y -= 16

  // ── Data ────────────────────────────────────────────────────
  const valueX = margin + 92
  const valueWidth = width - margin - valueX
  for (const { label, value } of recordLines(artwork)) {
    const lines = wrapLines(printableText(value), normal, 10, valueWidth)
    page.drawText(label, { x: margin, y, size: 8, font: normal, color: GRAY })
    for (const line of lines) {
      page.drawText(line, { x: valueX, y, size: 10, font: normal, color: INK })
      y -= 13
    }
    y -= 4
  }

  // ── QR and footer ───────────────────────────────────────────
  const url = recordUrl(artwork.catalog_id, origin)
  const qrSide = 108
  const qrPng = await QRCode.toDataURL(url, { margin: 0, width: qrSide * 3 })
  const qrImage = await doc.embedPng(qrPng)
  const qrX = width - margin - qrSide
  page.drawImage(qrImage, { x: qrX, y: margin + 12, width: qrSide, height: qrSide })
  page.drawText(printableText(url), {
    x: margin, y: margin, size: 6.5, font: normal, color: GRAY,
  })

  const qrNote = 'El código abre esta misma ficha en la aplicación, con sus fotografías y su historial al día.'
  let noteY = margin + 12 + qrSide - 8
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
