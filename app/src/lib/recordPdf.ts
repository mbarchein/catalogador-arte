/**
 * Printable A5 PDF record with a QR code (RF-202: the identifier is a physical
 * label; the QR turns it into a doorway to the living record).
 *
 * Generated entirely in the browser: there is no server to do it on, and this
 * way it also works from the storage room. This module is imported dynamically
 * from the record page so pdf-lib does not bloat the initial bundle.
 */
import {
  PDFDocument,
  PDFName,
  PDFString,
  PageSizes,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFImage,
  type PDFPage,
} from 'pdf-lib'
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
/**
 * `placePath` is where the artwork is, already resolved to text by whoever holds
 * the tree — «Castelar 4, mesa de Mario» (ADR-006). It travels as an argument
 * instead of being read off the artwork because the row only carries the
 * identifier of the node, and this module has no way to walk the tree and no
 * business doing it.
 */
export function recordLines(artwork: Artwork, placePath = ''): RecordLine[] {
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
    { label: 'Ubicación', value: datum(placePath) },
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

/**
 * Convierte un rectángulo de la página en un enlace a `url`.
 *
 * pdf-lib no tiene API para esto, así que se escribe la anotación a mano: es un
 * `/Annot` de subtipo `/Link` con una acción `/URI`, que es lo que cualquier lector
 * entiende desde PDF 1.1. El borde va a cero por las tres vías —`Border`, `BS` y `C`—
 * porque los lectores no se ponen de acuerdo en cuál miran, y el que mire la que falte
 * pintaría un recuadro azul en una hoja pensada para pegarse a un cuadro.
 *
 * Las anotaciones que la página ya tuviera se conservan: escribir `Annots` de nuevas
 * borraría un enlace anterior, y esa es la clase de fallo que no se ve hasta que
 * alguien pulsa lo que ya no lleva a ningún sitio.
 */
function linkTo(
  doc: PDFDocument,
  page: PDFPage,
  url: string,
  box: { x: number; y: number; width: number; height: number },
): void {
  const annotation = doc.context.register(
    doc.context.obj({
      Type: 'Annot',
      Subtype: 'Link',
      Rect: [box.x, box.y, box.x + box.width, box.y + box.height],
      Border: [0, 0, 0],
      C: [],
      BS: { W: 0 },
      A: { Type: 'Action', S: 'URI', URI: PDFString.of(url) },
    }),
  )
  const existing = page.node.Annots()
  if (existing) existing.push(annotation)
  else page.node.set(PDFName.of('Annots'), doc.context.obj([annotation]))
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
/** Gap between the right-hand column — QR above, photograph below — and the text. */
const COLUMN_GAP = 14
/** Side of the QR in the header: at 108 pt any phone reads it at arm's length. */
export const QR_SIDE = 108

/**
 * El pie del código, debajo del propio código (RF-1003).
 *
 * Estaba al pie de la hoja, con el resto de lo que la hoja dice de sí misma, y por eso
 * empezaba nombrando dónde estaba el código: «El código QR de la cabecera abre…». Un
 * pie de foto no tiene que decir de qué foto es, así que al ponerlo donde toca la
 * primera mitad de la frase sobra.
 *
 * Más pequeño que el resto de las notas —6 pt frente a 8— porque no es una nota de la
 * ficha: es la etiqueta de un elemento, y compite con el código, que es lo único de
 * esta hoja que no puede ceder sitio. Con su aire por encima, para que no parezca
 * parte del dibujo del código y no le coma el margen blanco que el lector necesita.
 */
export const QR_CAPTION = 'Abre esta ficha en la aplicación, al día.'
export const QR_CAPTION_SIZE = 6
const QR_CAPTION_LEAD = 7.5
/** El aire entre el código y su pie: el propio código no lleva margen blanco. */
const QR_CAPTION_PAD = 8
/**
 * Alto de la columna del código: el código, su aire y **una** línea de pie.
 *
 * Una y no «las que salgan»: de esta altura sale el sitio que le queda a la
 * fotografía, y eso lo calcula `photoBoxSide`, que es una función pura y no tiene las
 * medidas de la tipografía a mano. Así que el pie cabe en una línea y hay un test que
 * lo mide con la tipografía de verdad — si alguien lo alarga, se pone rojo ahí en vez
 * de salir pisando la raya de la cabecera en una hoja impresa.
 */
const QR_CAPTION_LINES = 1
const QR_BLOCK = QR_SIDE + QR_CAPTION_PAD + QR_CAPTION_LINES * QR_CAPTION_LEAD
/** Height of a printed data line, and the air between two rows. */
const LINE = 13
const ROW_GAP = 4

/** Top of the footer band — the photograph and its note. Nothing goes below it. */
const footerTopAt = (margin: number, photoSide: number) =>
  margin + 12 + photoSide + COLUMN_GAP

/**
 * Side of the photo box for a data block of that height, bounded by
 * `MIN_PHOTO_BOX` and `PHOTO_BOX`: what the page has left once the header band
 * — where the QR sits, and the QR is the one thing that never gives way
 * (RF-1003) — and the data have taken their share. The 20 pt are the rule that
 * closes the header band and its air; the 12 and the `COLUMN_GAP` are the air
 * below and above the photograph in the footer.
 */
export function photoBoxSide(dataHeight: number, pageHeight: number, margin: number): number {
  const room =
    pageHeight - margin - 12 - QR_BLOCK - 20 - dataHeight - (margin + 12 + COLUMN_GAP)
  return Math.max(MIN_PHOTO_BOX, Math.min(PHOTO_BOX, room))
}

/**
 * @param loadPhoto Injectable on purpose. The record resolves its own
 * photograph — see `loadRecordPhoto` — and the conversion needs
 * `createImageBitmap` and a canvas, which the test environment does not have.
 */
export async function generateRecordPdf(
  artwork: Artwork,
  placePath = '',
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
  // Resolved first although it prints last, at the foot of the page: it is the
  // slow part, and the layout needs to know whether there is an image before
  // measuring anything. A failure here never stops the printing: neither the
  // network of a storage room nor a browser without canvas is a reason to leave
  // the cataloger without a record. Without a photo the gap is explained
  // (RF-1002).
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
  // value wraps, so it is measured first: the QR of the header is untouchable
  // and the photo box takes what is left over at the foot of the page.
  const valueX = margin + 92
  const valueWidth = width - margin - valueX
  const rows = recordLines(artwork, placePath).map(({ label, value }) => ({
    label,
    lines: wrapLines(printableText(value), normal, 10, valueWidth),
  }))
  const dataHeight =
    rows.reduce((total, row) => total + row.lines.length, 0) * LINE + rows.length * ROW_GAP
  const photoBox = photoBoxSide(dataHeight, height, margin)
  const footerTop = footerTopAt(margin, photoBox)

  let y = height - margin

  // ── Header ──────────────────────────────────────────────────
  // Running head across the full width: the QR column starts below it.
  page.drawText('INVENTARIO Y CATÁLOGO RAZONADO — ROTILI / RUIZ CAMPINS', {
    x: margin, y, size: 7, font: normal, color: GRAY,
  })
  y -= 12

  // The QR occupies the right column of the header band, next to the identifier
  // (RF-1003): both are what the phone is pointed at with the artwork in front,
  // and the code is the one element of the sheet that never shrinks.
  const url = recordUrl(artwork.catalog_id, origin)
  const qrPng = await QRCode.toDataURL(url, { margin: 0, width: QR_SIDE * 3 })
  const qrImage = await doc.embedPng(qrPng)
  const qrX = width - margin - QR_SIDE
  const qrBottom = y - QR_SIDE
  page.drawImage(qrImage, { x: qrX, y: qrBottom, width: QR_SIDE, height: QR_SIDE })
  // Y el código es además un enlace: en la pantalla de un ordenador no hay cámara con
  // la que apuntarle, y el mismo cuadrado que en el almacén se escanea con el móvil
  // aquí se pulsa. Sin marco: un recuadro azul alrededor de un código de barras es
  // ruido impreso, y lo que se imprime se imprime para siempre.
  linkTo(doc, page, url, { x: qrX, y: qrBottom, width: QR_SIDE, height: QR_SIDE })

  // El pie, debajo del código y centrado bajo él. Recortado a dos líneas porque de
  // dos líneas es la altura que `photoBoxSide` ha reservado: una tercera se metería
  // en la banda de los datos.
  let captionY = qrBottom - QR_CAPTION_PAD - QR_CAPTION_SIZE
  const captionBottom = qrBottom - QR_CAPTION_PAD - QR_CAPTION_LINES * QR_CAPTION_LEAD
  for (const line of wrapLines(QR_CAPTION, normal, QR_CAPTION_SIZE, QR_SIDE).slice(
    0,
    QR_CAPTION_LINES,
  )) {
    const lineWidth = normal.widthOfTextAtSize(line, QR_CAPTION_SIZE)
    page.drawText(line, {
      x: qrX + (QR_SIDE - lineWidth) / 2,
      y: captionY,
      size: QR_CAPTION_SIZE,
      font: normal,
      color: GRAY,
    })
    captionY -= QR_CAPTION_LEAD
  }

  // Header text keeps clear of the QR column, whose width is always the same.
  const headerWidth = qrX - COLUMN_GAP - margin

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
  // The rule closes the band below whichever column reaches further down — y la
  // columna del código llega ahora hasta su pie, no hasta el código.
  y = Math.min(y, captionBottom) - 4
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

  // ── Photograph and footer ───────────────────────────────────
  // The photograph closes the sheet, in the right column of the footer band and
  // scaled to fit the box: the proportions of the artwork are data too. It sits
  // on the bottom air, so the foot of the page is the same however tall the
  // image turns out to be.
  const photoSize = embedded
    ? embedded.scaleToFit(photoBox, photoBox)
    : { width: photoBox, height: photoBox * 0.72 }
  const photoX = width - margin - photoSize.width
  const photoBottom = margin + 12
  if (embedded) {
    page.drawImage(embedded, {
      x: photoX, y: photoBottom, width: photoSize.width, height: photoSize.height,
    })
    // A general shot needs no caption; anything else does, because a signature
    // detail or a back side does not portray the artwork. The caption goes
    // above the image: below it there is only the bottom edge and the printed
    // URL.
    if (photo && photo.shotType !== 'GENERAL') {
      page.drawText(printableText(SHOT_TYPE_LABEL[photo.shotType]), {
        x: photoX, y: photoBottom + photoSize.height + 4, size: 7, font: normal, color: GRAY,
      })
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

  page.drawText(printableText(url), {
    x: margin, y: margin, size: 6.5, font: normal, color: GRAY,
  })

  // La fecha de generación, anclada al alto de la caja reservada y no a la imagen:
  // una fotografía horizontal es más baja que su caja y el texto se iría con ella.
  // Lo que el código hace lo dice su propio pie, arriba, junto al código.
  page.drawText(
    `Ficha generada el ${new Date().toLocaleDateString('es-ES')}`,
    { x: margin, y: margin + 12 + photoBox - 8, size: 8, font: normal, color: GRAY },
  )

  const bytes = await doc.save()
  return new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' })
}
