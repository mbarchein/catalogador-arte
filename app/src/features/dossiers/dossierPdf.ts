/**
 * The dossier's PDF, drawn in the browser (RF-1607, RF-1609, ADR-011).
 *
 * There is no server to generate it on and there is not going to be one
 * (ADR-001), so this runs on the device — the same decision as the printable
 * record and as the derivatives themselves. It is imported **dynamically** from
 * the screen so that `pdf-lib` does not weigh on the initial bundle of an
 * application that is opened in a storeroom.
 *
 * ── QUÉ HAY AQUÍ Y QUÉ NO ───────────────────────────────────
 *
 * Here: ink. Rectangles, text at coordinates, the embedded photograph. Every
 * decision —how many pages, what each one carries, what the caption of an artwork
 * says— lives in `dossierPdfPlan.ts`, which is pure and has tests, because the
 * battery runs in node and cannot open a canvas.
 *
 * ── LA IMAGEN ES LA DERIVADA, NO LA COPIA CORREGIDA ─────────
 *
 * RF-1609, y es la corrección que este proyecto ya se hizo por escrito: la
 * derivada de consulta de 2000 px **ya lleva cocidas** el giro, el recorte, la
 * perspectiva y el color, así que es la imagen buena. La copia corregida a
 * resolución completa es para entregar un fichero a una imprenta; doce de ellas
 * son cientos de megabytes y no salen de ningún correo.
 *
 * Y se recodifica a JPEG porque `pdf-lib` solo empotra JPEG y PNG, y las derivadas
 * son WebP. Es lo mismo que hace la ficha imprimible, con su misma razón.
 *
 * ── LO QUE FALLA Y NO PARA LA GENERACIÓN ────────────────────
 *
 * Una fotografía que no se puede leer —sin cobertura, un navegador sin canvas, unos
 * bytes que no son un JPEG— deja su hueco DICHO y el PDF sale. La alternativa es
 * dejar a quien cataloga sin documento por una foto, y es la disciplina que la
 * ficha imprimible ya fijó. Lo que no se hace nunca es imprimir un rectángulo
 * vacío sin explicación.
 */

import {
  PDFDocument,
  PageSizes,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFImage,
  type PDFPage,
} from 'pdf-lib'
import { computeTarget, signedUrl } from '../../lib/images'
import type { MarkupBlock, MarkupRun } from '../../lib/markup'
import { supabase } from '../../lib/supabase'
import { printableText } from '../../lib/recordPdf'
import type { PlannedPage, TextBlock } from './dossierPdfPlan'
import { INDEX_ENTRIES_PER_PAGE, footerText } from './dossierPdfPlan'

/**
 * Long edge, in pixels, of an embedded photograph.
 *
 * The photograph prints at about 330 pt of width — some 11,6 cm on A4 — and 1600 px
 * over that is around 350 ppi, which is what a printer resolves. The derivative is
 * 2000 px, so this almost never scales down and never scales up: `computeTarget`
 * returns the original size when it is already smaller.
 */
const PHOTO_PIXELS = 1600
const PHOTO_QUALITY = 0.86

const INK = rgb(0.1, 0.11, 0.12)
const GRAY = rgb(0.42, 0.44, 0.47)
const RULE = rgb(0.79, 0.78, 0.74)

/** A4 vertical, which is the decision of ADR-011: mixing orientations reads badly on screen. */
const MARGIN = 56

export interface DossierPhoto {
  /** JPEG bytes: `pdf-lib` only embeds JPEG and PNG, and the derivatives are WebP. */
  jpeg: Uint8Array
  width: number
  height: number
}

/** Which photograph each artwork prints, resolved by the caller for the whole dossier. */
export type PhotoLoader = (page: {
  catalogId: string
  imageId: string | null
}) => Promise<DossierPhoto | null>

/**
 * Recodes a derivative to JPEG at the size the page prints.
 *
 * White underneath because JPEG has no transparency: without it an image with an
 * alpha channel comes out on black once printed.
 */
async function toEmbeddableJpeg(source: Blob): Promise<DossierPhoto> {
  const bitmap = await createImageBitmap(source)
  try {
    const target = computeTarget(bitmap.width, bitmap.height, PHOTO_PIXELS)
    const canvas = document.createElement('canvas')
    canvas.width = target.width
    canvas.height = target.height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('El navegador no ha dado un contexto de dibujo')
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
    return {
      jpeg: new Uint8Array(await encoded.arrayBuffer()),
      width: target.width,
      height: target.height,
    }
  } finally {
    bitmap.close()
  }
}

/**
 * The photograph of one page: the fixed shot when the item fixes one, and the
 * artwork's representative one when it does not (RF-1605).
 *
 * The representative one comes from the `representative_image` view, as everywhere
 * else that needs it: recomputing the rule here would let the PDF disagree with the
 * list, the record and the printable sheet.
 *
 * The signature is short-lived because it is used right here and never stored
 * (RF-110: the bucket is private).
 */
export async function loadDossierPhoto(page: {
  catalogId: string
  imageId: string | null
}): Promise<DossierPhoto | null> {
  const query =
    page.imageId === null
      ? supabase
          .from('representative_image')
          .select('derivative_path')
          .eq('catalog_id', page.catalogId)
          .maybeSingle()
      : supabase
          .from('images')
          .select('derivative_path')
          .eq('image_id', page.imageId)
          .maybeSingle()

  const { data, error } = await query
  if (error || !data) return null
  const row = data as unknown as { derivative_path: string | null }
  if (row.derivative_path === null) return null

  const url = await signedUrl(row.derivative_path, 300)
  if (!url) return null
  const response = await fetch(url)
  if (!response.ok) return null
  return toEmbeddableJpeg(await response.blob())
}

/**
 * A cursor down the page, so no block has to know where the previous one ended.
 *
 * `next` es lo que convierte el cursor en un flujo: cuando un bloque no cabe, pide
 * hoja nueva y sigue. **Sin eso, un texto largo se dibujaba por debajo del margen y
 * desaparecía**, y con una biografía pegada de una web eso deja de ser hipotético.
 * Null en las páginas que son de una sola hoja por definición —la portada, la
 * portadilla, el índice—, donde quedarse sin sitio es un aviso y no un salto.
 */
interface Cursor {
  page: PDFPage
  y: number
  next?: () => PDFPage
}

/** Donde acaba el texto de una hoja: por debajo está el pie. */
const TEXT_BOTTOM = MARGIN + 18

/** Pide hoja nueva si lo que viene —`height` puntos— no cabe en lo que queda. */
function room(cursor: Cursor, height: number): void {
  if (cursor.y - height >= TEXT_BOTTOM) return
  if (cursor.next === undefined) return
  cursor.page = cursor.next()
  cursor.y = cursor.page.getSize().height - MARGIN
}

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = printableText(text).split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth || !current) current = candidate
    else {
      lines.push(current)
      current = word
    }
  }
  if (current) lines.push(current)
  return lines
}

function drawParagraph(
  cursor: Cursor,
  text: string,
  font: PDFFont,
  size: number,
  width: number,
  options: { color?: ReturnType<typeof rgb>; leading?: number } = {},
): void {
  const leading = options.leading ?? size * 1.45
  for (const line of wrap(text, font, size, width)) {
    room(cursor, leading)
    cursor.y -= leading
    cursor.page.drawText(line, {
      x: MARGIN,
      y: cursor.y,
      size,
      font,
      color: options.color ?? INK,
    })
  }
}

// ── Los bloques con marcas (RF-1614, RF-1616) ────────────────

/** Las cuatro caras que hacen falta para dibujar negritas y cursivas. */
interface Faces {
  serif: PDFFont
  sans: PDFFont
  sansBold: PDFFont
  sansItalic: PDFFont
  sansBoldItalic: PDFFont
}

/** Un trozo ya medido: su texto, su cara y su ancho. */
interface Segment {
  text: string
  font: PDFFont
}

function faceOf(run: MarkupRun, faces: Faces): PDFFont {
  if (run.bold && run.italic) return faces.sansBoldItalic
  if (run.bold) return faces.sansBold
  if (run.italic) return faces.sansItalic
  return faces.sans
}

/**
 * Junta los trozos seguidos que comparten tipografía en uno solo.
 *
 * No es una optimización de bytes: el corte se hace palabra por palabra, y dibujar cada
 * palabra por separado deja en el PDF una operación de texto por palabra. Eso **rompe
 * el buscar y el copiar** de cualquier lector —una frase deja de estar escrita como
 * frase—, que en un dossier que va a una galería es la diferencia entre poder buscar el
 * título de una obra y no poder. Medido: los tests que leen el PDF de vuelta dejaron de
 * encontrar las frases en cuanto se dibujó por palabras.
 */
function coalesce(segments: readonly Segment[]): Segment[] {
  const joined: Segment[] = []
  for (const segment of segments) {
    const last = joined[joined.length - 1]
    if (last !== undefined && last.font === segment.font) {
      joined[joined.length - 1] = { text: last.text + segment.text, font: last.font }
      continue
    }
    joined.push({ ...segment })
  }
  return joined
}

/**
 * Los renglones de una fila de trozos, cortando por palabras.
 *
 * Es `wrap` con la complicación de que dentro de un renglón cambia la tipografía: una
 * palabra en negrita mide más que la misma en redonda, así que el ancho se acumula
 * trozo a trozo y no se puede medir la línea de una vez.
 */
function wrapRuns(
  runs: readonly MarkupRun[],
  faces: Faces,
  size: number,
  maxWidth: number,
): Segment[][] {
  const lines: Segment[][] = []
  let line: Segment[] = []
  let width = 0

  const push = () => {
    if (line.length > 0) lines.push(coalesce(line))
    line = []
    width = 0
  }

  for (const run of runs) {
    const font = faceOf(run, faces)
    // El espacio que separaba dos palabras se conserva como parte de la palabra
    // siguiente: partir por `\s+` y volver a unir con un espacio perdería el que va
    // pegado a una negrita —«en **Badajoz**y»— y juntaría dos palabras.
    const words = printableText(run.text).split(/(\s+)/).filter((part) => part !== '')
    for (const word of words) {
      const isSpace = word.trim() === ''
      const measured = font.widthOfTextAtSize(word, size)
      if (!isSpace && width + measured > maxWidth && line.length > 0) push()
      // Un espacio al principio de un renglón no se dibuja: es el que sobra al cortar.
      if (isSpace && line.length === 0) continue
      line.push({ text: word, font })
      width += measured
    }
  }
  push()
  return lines
}

/** Dibuja una fila de trozos con su tipografía, y devuelve lo que ha bajado. */
function drawRuns(
  cursor: Cursor,
  runs: readonly MarkupRun[],
  faces: Faces,
  options: {
    size: number
    width: number
    leading?: number
    color?: ReturnType<typeof rgb>
    indent?: number
    firstPrefix?: string
  },
): void {
  const leading = options.leading ?? options.size * 1.45
  const indent = options.indent ?? 0
  const lines = wrapRuns(runs, faces, options.size, options.width - indent)
  for (const [index, line] of lines.entries()) {
    room(cursor, leading)
    cursor.y -= leading
    let x = MARGIN + indent
    // El guion o el número de una lista va delante del primer renglón, y los
    // siguientes quedan sangrados debajo: es lo que hace que una lista se lea como una
    // lista y no como un párrafo con un guion perdido.
    if (index === 0 && options.firstPrefix !== undefined) {
      cursor.page.drawText(printableText(options.firstPrefix), {
        x: MARGIN,
        y: cursor.y,
        size: options.size,
        font: faces.sans,
        color: options.color ?? INK,
      })
    }
    for (const segment of line) {
      cursor.page.drawText(segment.text, {
        x,
        y: cursor.y,
        size: options.size,
        font: segment.font,
        color: options.color ?? INK,
      })
      x += segment.font.widthOfTextAtSize(segment.text, options.size)
    }
  }
}

/**
 * Dibuja los bloques de un texto: párrafos, títulos y listas.
 *
 * Los tamaños son los del papel y no los de la pantalla: un título de bloque dentro de
 * una biografía es un poco más grande que el texto y va en negrita, no una portada.
 */
function drawBlocks(
  cursor: Cursor,
  blocks: readonly MarkupBlock[],
  faces: Faces,
  options: { size: number; width: number; color?: ReturnType<typeof rgb> },
): void {
  for (const block of blocks) {
    if (block.kind === 'HEADING') {
      const size = block.level === 2 ? options.size + 2.5 : options.size + 1
      cursor.y -= 6
      room(cursor, size * 1.4)
      drawRuns(cursor, block.runs.map((run) => ({ ...run, bold: true })), faces, {
        size,
        width: options.width,
        color: options.color,
      })
      cursor.y -= 2
      continue
    }

    if (block.kind === 'LIST') {
      for (const [index, item] of block.items.entries()) {
        drawRuns(cursor, item, faces, {
          size: options.size,
          width: options.width,
          leading: options.size * 1.4,
          color: options.color,
          indent: 14,
          firstPrefix: block.ordered ? `${index + 1}.` : '·',
        })
      }
      cursor.y -= 4
      continue
    }

    drawRuns(cursor, block.runs, faces, {
      size: options.size,
      width: options.width,
      color: options.color,
    })
    cursor.y -= 8
  }
}

/** A heading with its rule under it: what opens a section (RF-1614). */
function drawHeading(cursor: Cursor, text: string, serif: PDFFont, width: number): void {
  // El rótulo y su raya no se separan: si no caben los dos, hoja nueva.
  room(cursor, 30)
  drawParagraph(cursor, text, serif, 15, width, { leading: 18 })
  cursor.y -= 6
  cursor.page.drawLine({
    start: { x: MARGIN, y: cursor.y },
    end: { x: MARGIN + width, y: cursor.y },
    thickness: 1,
    color: INK,
  })
  cursor.y -= 4
}

function drawTexts(
  cursor: Cursor,
  texts: readonly TextBlock[],
  faces: Faces,
  width: number,
): void {
  for (const block of texts) {
    if (block.heading !== '') drawHeading(cursor, block.heading, faces.serif, width)
    if (block.body.length > 0) {
      drawBlocks(cursor, block.body, faces, { size: 10, width })
      cursor.y -= 8
    }
  }
}

/**
 * Draws the whole document.
 *
 * @param loadPhoto Injectable on purpose, exactly as in the printable record: the
 *   conversion needs `createImageBitmap` and a canvas, which the test environment
 *   does not have, and injecting it is what lets the composition be exercised
 *   without either.
 */
export async function generateDossierPdf(
  pages: readonly PlannedPage[],
  options: { title: string; loadPhoto?: PhotoLoader },
): Promise<Blob> {
  const doc = await PDFDocument.create()
  const sans = await doc.embedFont(StandardFonts.Helvetica)
  const sansBold = await doc.embedFont(StandardFonts.HelveticaBold)
  const sansItalic = await doc.embedFont(StandardFonts.HelveticaOblique)
  const sansBoldItalic = await doc.embedFont(StandardFonts.HelveticaBoldOblique)
  // Times for the titles and Helvetica for the data: what the printable record
  // already uses, and the two faces `pdf-lib` carries without packaging anything.
  const serif = await doc.embedFont(StandardFonts.TimesRoman)
  const faces: Faces = { serif, sans, sansBold, sansItalic, sansBoldItalic }

  const loadPhoto = options.loadPhoto ?? loadDossierPhoto

  // ── Lo que se sabe solo dibujando ────────────────────────────
  //
  // Un texto largo ocupa las hojas que ocupa, así que ni el total ni la página en la
  // que empieza cada sección se pueden saber antes. Se apunta mientras se dibuja: la
  // sección de cada hoja —para su pie— y en qué hoja abre cada sección —para el
  // índice—. El índice y los pies se escriben al final, cuando los números son hechos y
  // no estimaciones.
  const sheets: (string | null)[] = []
  const sectionStarts: number[] = []
  const indexPlan = pages.filter((entry) => entry.page.kind === 'INDEX')

  for (const entry of pages) {
    const plan = entry.page
    // El índice se salta aquí y se compone al final, con los números medidos.
    if (plan.kind === 'INDEX') continue

    const page = doc.addPage(PageSizes.A4) // 595.28 × 841.89 pt
    sheets.push(entry.section)
    if (entry.sectionStart === true) sectionStarts.push(sheets.length - 1)
    const { width, height } = page.getSize()
    const inner = width - MARGIN * 2
    // Una hoja más de lo mismo: hereda la sección, para que su pie diga lo mismo que
    // la que viene continuando.
    const cursor: Cursor = {
      page,
      y: height - MARGIN,
      next: () => {
        const added = doc.addPage(PageSizes.A4)
        sheets.push(entry.section)
        return added
      },
    }

    if (plan.kind === 'COVER') {
      // La portada es de una hoja por definición: aquí el cursor no pide hoja nueva.
      cursor.next = undefined
      // The cover breathes: it is the only page whose content does not start at the
      // top margin, because a title halfway down a sheet reads as a cover and one
      // at the top reads as a chapter.
      cursor.y = height * 0.66
      page.drawText(printableText('ROTILI · RUIZ CAMPINS'), {
        x: MARGIN,
        y: cursor.y + 26,
        size: 8,
        font: sans,
        color: GRAY,
      })
      drawParagraph(cursor, plan.title, serif, 26, inner, { leading: 30 })
      cursor.y -= 14
      page.drawLine({
        start: { x: MARGIN, y: cursor.y },
        end: { x: MARGIN + inner * 0.26, y: cursor.y },
        thickness: 1.6,
        color: INK,
      })
      cursor.y -= 10
      const who = [plan.recipient, plan.date].filter((part) => part !== '').join(' · ')
      if (who !== '') drawParagraph(cursor, who, sans, 11, inner, { color: GRAY })
      if (plan.blurb.length > 0) {
        cursor.y -= 14
        drawBlocks(cursor, plan.blurb, faces, { size: 10.5, width: inner * 0.8 })
      }
    }

    if (plan.kind === 'TEXTS') {
      drawTexts(cursor, plan.texts, faces, inner)
    }

    if (plan.kind === 'DIVIDER') {
      // La portadilla anuncia un bloque y no lo cuenta: una hoja, y lo que no quepa
      // sobra de una entradilla.
      cursor.next = undefined
      // La portadilla: el rótulo a media hoja, como la portada y por lo mismo — un
      // título arriba se lee como un capítulo y a media altura se lee como un
      // anuncio de lo que viene.
      cursor.y = height * 0.6
      drawParagraph(cursor, plan.heading, serif, 22, inner, { leading: 26 })
      cursor.y -= 12
      page.drawLine({
        start: { x: MARGIN, y: cursor.y },
        end: { x: MARGIN + inner * 0.22, y: cursor.y },
        thickness: 1.4,
        color: INK,
      })
      if (plan.body.length > 0) {
        cursor.y -= 12
        drawBlocks(cursor, plan.body, faces, { size: 10.5, width: inner * 0.8 })
      }
    }

    if (plan.kind === 'BIOGRAPHY') {
      drawHeading(cursor, plan.heading, serif, inner)
      cursor.y -= 6
      drawBlocks(cursor, plan.blocks, faces, { size: 10.5, width: inner })
      if (plan.cv.length > 0) {
        cursor.y -= 12
        room(cursor, 40)
        cursor.page.drawText(printableText('EXPOSICIONES Y TRAYECTORIA'), {
          x: MARGIN,
          y: cursor.y,
          size: 8,
          font: sans,
          color: GRAY,
        })
        cursor.y -= 6
        cursor.page.drawLine({
          start: { x: MARGIN, y: cursor.y },
          end: { x: MARGIN + inner, y: cursor.y },
          thickness: 0.5,
          color: RULE,
        })
        drawBlocks(cursor, plan.cv, faces, { size: 9.5, width: inner })
      }
    }

    if (plan.kind === 'ARTWORK') {
      // The texts attached to this artwork go first and take the room they need:
      // the photograph is what gives way, never the section heading.
      drawTexts(cursor, plan.texts, faces, inner)
      // La obra se dibuja en la hoja donde hayan acabado sus textos: si un párrafo
      // largo se ha llevado la primera, la fotografía va en la siguiente y no encima.
      const sheet = cursor.page

      const photo = await loadPhoto({ catalogId: plan.catalogId, imageId: plan.imageId }).catch(
        () => null,
      )
      let embedded: PDFImage | null = null
      if (photo) {
        try {
          embedded = await doc.embedJpg(photo.jpeg)
        } catch {
          embedded = null
        }
      }

      // What is left between the cursor and the caption is the photograph's box.
      const captionHeight = 74
      const boxTop = cursor.y - 8
      const boxBottom = MARGIN + captionHeight
      const boxHeight = Math.max(0, boxTop - boxBottom)

      if (embedded !== null && boxHeight > 40) {
        // Fitted inside the box keeping its proportions, and centred: an artwork
        // wider than it is tall must not be stretched to fill the sheet.
        const scale = Math.min(inner / embedded.width, boxHeight / embedded.height)
        const drawWidth = embedded.width * scale
        const drawHeight = embedded.height * scale
        sheet.drawImage(embedded, {
          x: MARGIN + (inner - drawWidth) / 2,
          y: boxBottom + (boxHeight - drawHeight) / 2,
          width: drawWidth,
          height: drawHeight,
        })
      } else {
        // The gap is SAID and never an empty rectangle: whoever receives the PDF has
        // to be able to tell «no hay fotografía» from «se ha roto la generación».
        sheet.drawText(
          printableText(
            embedded === null && photo === null
              ? 'Sin fotografía disponible'
              : 'La fotografía no se ha podido incluir',
          ),
          { x: MARGIN, y: boxBottom + boxHeight / 2, size: 9, font: sans, color: GRAY },
        )
      }

      // ── Caption, anchored to the foot and not to the photograph ──
      // Anchored so that twelve pages read as twelve equal pages: a caption that
      // follows the bottom edge of each image dances up and down with the shape of
      // each artwork.
      let capY = MARGIN + captionHeight - 12
      sheet.drawText(printableText(plan.caption.code), {
        x: MARGIN,
        y: capY,
        size: 8.5,
        font: sans,
        color: GRAY,
      })
      capY -= 20
      for (const line of wrap(plan.caption.title, serif, 17, inner)) {
        sheet.drawText(line, { x: MARGIN, y: capY, size: 17, font: serif, color: INK })
        capY -= 20
      }
      if (plan.caption.facts !== '') {
        sheet.drawText(printableText(plan.caption.facts), {
          x: MARGIN,
          y: capY,
          size: 10,
          font: sans,
          color: GRAY,
        })
        capY -= 16
      }
      if (plan.caption.price !== null) {
        sheet.drawText(printableText(plan.caption.price), {
          x: MARGIN,
          y: capY,
          size: 11,
          font: sansBold,
          color: INK,
        })
      }
    }

  }

  // ── El índice, con los números medidos y no estimados ───────
  //
  // Se compone al final y se mete detrás de la portada. Sus entradas van en el orden en
  // el que las secciones aparecen, y las hojas de apertura se apuntaron en ese mismo
  // orden mientras se dibujaba, así que la k-ésima entrada es la k-ésima apertura — sin
  // depender del rótulo, que dos secciones pueden compartir.
  //
  // Y el número que se imprime cuenta las hojas del propio índice: si no, todas las
  // referencias apuntarían unas hojas antes, que es la única forma de que un índice sea
  // exactamente inútil.
  const indexSheets = indexPlan.length
  for (const [order, entry] of indexPlan.entries()) {
    const plan = entry.page
    if (plan.kind !== 'INDEX') continue
    const page = doc.insertPage(1 + order, PageSizes.A4)
    sheets.splice(1 + order, 0, null)
    const { width, height } = page.getSize()
    const cursor: Cursor = { page, y: height - MARGIN }
    page.drawText(printableText('ÍNDICE'), {
      x: MARGIN,
      y: cursor.y - 10,
      size: 8,
      font: sans,
      color: GRAY,
    })
    cursor.y -= 30
    // La primera entrada de esta hoja del índice: las anteriores están en las hojas de
    // índice de antes.
    let position = order * INDEX_ENTRIES_PER_PAGE
    for (const line of plan.entries) {
      // Rótulo a la izquierda, página a la derecha, y el recuento de obras entre
      // los dos: es lo que convierte un índice en una respuesta —«los óleos son
      // seis y empiezan en la 4»— y no en una lista de títulos.
      const label = printableText(line.heading)
      const count = line.artworkCount === 1 ? '1 obra' : `${line.artworkCount} obras`
      const start = sectionStarts[position] ?? 0
      const right = printableText(String(start + 1 + indexSheets))
      position += 1
      page.drawText(label, { x: MARGIN, y: cursor.y, size: 11, font: sans, color: INK })
      const countWidth = sans.widthOfTextAtSize(count, 9)
      const rightWidth = sans.widthOfTextAtSize(right, 11)
      page.drawText(count, {
        x: width - MARGIN - rightWidth - 12 - countWidth,
        y: cursor.y,
        size: 9,
        font: sans,
        color: GRAY,
      })
      page.drawText(right, {
        x: width - MARGIN - rightWidth,
        y: cursor.y,
        size: 11,
        font: sans,
        color: INK,
      })
      cursor.y -= 20
    }
  }

  // ── Los pies, cuando ya se sabe cuántas hojas hay ──────────
  //
  // Al final y de una pasada: el total no se puede escribir antes de haberlas escrito
  // todas, y «3 de 14» con un 14 estimado es peor que no llevar recuento — un PDF que
  // llega truncado por una pasarela de correo es indistinguible de uno corto.
  const drawn = doc.getPages()
  for (const [index, page] of drawn.entries()) {
    const { width } = page.getSize()
    const foot = footerText(options.title, index + 1, drawn.length, sheets[index] ?? null)
    page.drawLine({
      start: { x: MARGIN, y: MARGIN - 14 },
      end: { x: width - MARGIN, y: MARGIN - 14 },
      thickness: 0.5,
      color: RULE,
    })
    page.drawText(printableText(foot.left), {
      x: MARGIN,
      y: MARGIN - 26,
      size: 7.5,
      font: sans,
      color: GRAY,
    })
    const rightWidth = sans.widthOfTextAtSize(foot.right, 7.5)
    page.drawText(foot.right, {
      x: width - MARGIN - rightWidth,
      y: MARGIN - 26,
      size: 7.5,
      font: sans,
      color: GRAY,
    })
  }

  // `as unknown as BlobPart` es el mismo puente que usan la ficha imprimible y la
  // hoja del testigo de gris: `doc.save()` devuelve un `Uint8Array` cuyo búfer TS
  // no acepta como parte de un Blob, y la conversión no toca un byte.
  const bytes = await doc.save()
  return new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' })
}
