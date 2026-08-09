import { PDFDocument, StandardFonts, grayscale, type PDFFont } from 'pdf-lib'
import { MIN_PATCH_SIDE } from './grayTarget'

/**
 * The printable grey target of RF-418, §4: the sheet this application generates so
 * that a cataloger without a bought card still has a staircase to lay beside the
 * artwork.
 *
 * **The layout is dictated by the detector, not by taste.** `grayTarget.ts` exports
 * `MIN_PATCHES`, `MIN_STEP`, `MIN_PATCH_SIDE` and `MAX_PATCH_SIZE_RATIO` on purpose,
 * and every number here is chosen against them: a wedge printed with steps below
 * `MIN_STEP`, or with unequal cells, would not be recognized by the very code that
 * asked for it — the application would hand the cataloger a sheet, she would
 * photograph it, and nothing would be found. That is the failure this module and its
 * tests exist to prevent, which is why the test paints a synthetic photograph of this
 * sheet and runs the detector over it instead of only checking numbers.
 *
 * **Five patches, equal, edge to edge, and a dark rule around them.** Equal because a
 * graded scale is drawn with equal cells and that is what tells a target from an
 * accidental sequence of objects (`MAX_PATCH_SIZE_RATIO`). Edge to edge because the
 * detector chains *contiguous* runs: a white gutter between patches would break the
 * chain, and the intermediate tone of a seam would read as an extra patch. And the
 * rule because the paper is the problem — see `KEYLINE_SHARE`.
 *
 * **The sheet is a `TARGET_PRINT` and it says so on its face.** Household ink is not
 * neutral, so its grey is perfectly good as a *pattern* — for the staircase to be
 * recognized — and for the black and white points, which only need uniform patches,
 * but it may not be believed as a measurement of the cast (`referenceTrustsGray`).
 * That sentence is printed on the sheet, because whoever holds the paper is the person
 * who has to know it, and it is the whole difference between `TARGET_PRINT` and
 * `TARGET_CARD`.
 *
 * Generated in the browser with pdf-lib, like the printed record (`recordPdf.ts`): it
 * has to work from the storage room and there is no server to do it on. Imported
 * dynamically for the same reason as the record — pdf-lib must not weigh on the
 * initial bundle.
 */

/* ---------------------------------------------------------------- the design */

/**
 * The grey of each patch, in codes 0…255, lightest first — which is also left to
 * right on the sheet, because a staircase has to run in one direction.
 *
 * Five and not three: three is the detector's minimum and leaves the sheet with no
 * slack at all if the printer crushes one step, while five keeps a staircase even
 * when the two darkest ones merge. Evenly spaced by 45 codes, which is more than
 * twice `MIN_STEP` (20), so a printer that compresses the dark end by half still
 * prints steps the detector counts.
 *
 * The extremes stay away from both ends of the scale: 225 leaves 25 codes of headroom
 * before the clipping threshold of §3.5, so a slightly generous exposure does not
 * burn the light patch, and 45 keeps the dark one out of the noise floor. A target is
 * exposed for the artwork, not for itself.
 */
export const SHEET_PATCH_CODES = [225, 180, 135, 90, 45] as const

/**
 * The grey of the rule that surrounds the patches.
 *
 * Fifteen codes below the darkest patch, and that gap is the point: it is **wide
 * enough not to be swallowed into it** by the segmentation tolerance, and **narrower
 * than `MIN_STEP`**, so the rule can never be counted as a sixth patch of the
 * staircase. Whatever a domestic printer does with two dark greys, the outcome is one
 * of two harmless ones — the rule merges into the black patch, or it stays a separate
 * run that is not a step.
 */
export const SHEET_RULE_CODE = 30

/**
 * Thickness of that rule, as a fraction of a patch's width.
 *
 * **The rule exists because of the paper, not for decoration.** The detector joins two
 * runs into one patch when their codes sit within a few units of each other, and
 * chains two patches when they are contiguous: with the light patch touching the white
 * margin of the sheet, an underexposed photograph — where the whole scale compresses —
 * would merge the paper into the light patch and measure the white point of the paper
 * instead of the one that was printed. A dark run between them makes that impossible
 * at any exposure.
 *
 * A fifth of the patch, and not a hairline, because the rule has to survive as its own
 * run in the photograph: the widest seam the detector tolerates between two patches is
 * 15 % of the smallest patch it accepts, so a fifth is always wider than the seam
 * whenever the patches are big enough to be measured at all. Thinner than that and the
 * rule would be read as a seam and the paper would touch the light patch again.
 */
export const KEYLINE_SHARE = 0.2

/**
 * Height of a patch, as a fraction of its width.
 *
 * Shorter than a square only to leave the notes their room on an A5: the detector
 * measures the thickness of the band against the same `MIN_PATCH_SIDE`, so what
 * matters is that the strip stays a band and not a line.
 */
const PATCH_ASPECT = 0.7

/**
 * Smallest share of the photograph's width the strip has to occupy, which is what the
 * sheet asks of the cataloger in plain words.
 *
 * Derived, never written by hand: the detector refuses a patch narrower than
 * `MIN_PATCH_SIDE` of the frame, and the strip carries that many patches side by side,
 * so the whole strip has to be at least the product. Printed on the sheet as a
 * percentage, so the instruction can never drift from the rule it comes from.
 */
export const MIN_FRAME_SHARE = SHEET_PATCH_CODES.length * MIN_PATCH_SIDE

/** A5 landscape, in points. The strip wants the long edge of the sheet. */
export const A5_LANDSCAPE = { width: 595.28, height: 419.53 } as const

/** Same margin as the printed record: one paper convention in the project. */
export const SHEET_MARGIN = 36

/** Room reserved above the strip for the title and the opening line. */
const HEADER_BAND = 52

/** Drop from the bottom of the rule to the baseline of each patch's value. */
const LABEL_DROP = 13
const LABEL_SIZE = 9

/* -------------------------------------------------------------------- layout */

export interface SheetRect {
  x: number
  y: number
  width: number
  height: number
}

/** The value printed **outside** its patch: see `grayTargetSheetLayout`. */
export interface SheetLabel {
  code: number
  text: string
  /** Centre of the patch it belongs to, so the drawing can centre the text. */
  centerX: number
  baseline: number
  size: number
}

export interface SheetLayout {
  page: { width: number; height: number }
  margin: number
  /** The dark rule and everything inside it. */
  frame: SheetRect
  /** Thickness of the rule, in points. */
  keyline: number
  /** Lightest first, left to right, equal and edge to edge. */
  patches: SheetRect[]
  labels: SheetLabel[]
  /** Top of the band the notes are written in. */
  notesTop: number
}

/**
 * Where everything goes, in PDF points with the origin at the bottom left.
 *
 * Pure and separate from the drawing so the test can measure the sheet against the
 * detector's rules without parsing a PDF: the arrangement is the part that can be
 * wrong in a way nobody notices until a photograph comes back with no target found.
 *
 * The values of the patches go **below the rule and never inside a patch**: the
 * detector demands that nine tenths of a patch's pixels sit within a few codes of its
 * median, and a printed number inside one would be exactly the fold or the shadow that
 * rule refuses.
 */
export function grayTargetSheetLayout(
  page: { width: number; height: number } = A5_LANDSCAPE,
  margin: number = SHEET_MARGIN,
): SheetLayout {
  const count = SHEET_PATCH_CODES.length
  const width = page.width - 2 * margin
  // The rule eats into the same width on both sides, so the patch is what is left
  // over once the two keylines have taken their share of it.
  const patchWidth = width / (count + 2 * KEYLINE_SHARE)
  const keyline = patchWidth * KEYLINE_SHARE
  const patchHeight = patchWidth * PATCH_ASPECT
  const frame: SheetRect = {
    x: margin,
    y: page.height - margin - HEADER_BAND - (patchHeight + 2 * keyline),
    width,
    height: patchHeight + 2 * keyline,
  }

  const patches = SHEET_PATCH_CODES.map((_, i) => ({
    x: frame.x + keyline + i * patchWidth,
    y: frame.y + keyline,
    width: patchWidth,
    height: patchHeight,
  }))

  const labels = SHEET_PATCH_CODES.map((code, i) => ({
    code,
    text: String(code),
    centerX: patches[i]!.x + patchWidth / 2,
    baseline: frame.y - LABEL_DROP,
    size: LABEL_SIZE,
  }))

  return {
    page: { width: page.width, height: page.height },
    margin,
    frame,
    keyline,
    patches,
    labels,
    notesTop: frame.y - LABEL_DROP - 16,
  }
}

/* --------------------------------------------------------------------- words */

const framePercent = Math.round(MIN_FRAME_SHARE * 100)

/**
 * Everything the sheet says, apart from the drawing.
 *
 * Kept as data and not scattered through the drawing code for two reasons: the test
 * can check that every literal is printable with the PDF's Helvetica — a pasted arrow
 * or emoji would throw at generation time and leave the cataloger without a sheet, the
 * same trap `printableText` guards in the printed record — and the sentence about the
 * ink, which is the one thing this sheet must not be used without, is where it can be
 * read instead of buried in a `drawText` call.
 */
export const GRAY_TARGET_SHEET_TEXT = {
  title: 'Testigo de gris',
  intro:
    'Imprime esta hoja y fotografíala junto a la obra: la aplicación corrige la luz de la sala.',
  values: 'Los números son el gris de cada parche, de 0 (negro) a 255 (blanco).',
  notes: [
    'El gris de una impresora no es neutro: vale de patrón y para los puntos negro y blanco.',
    // En su propia línea, y no al final de la anterior: el PDF parte por líneas y
    // una frase a caballo de dos no se lee de un vistazo en papel.
    'Para la dominante hace falta una carta de gris comprada.',
    'Al lado de la obra, nunca encima, en el mismo plano y con la misma luz.',
    `Que salga entera en la fotografía y ocupando al menos el ${framePercent} % del ancho: por debajo de eso los parches traen muy pocos píxeles para medirse.`,
    'Si la obra es grande, amplíala a A4 (141 %).',
    'Sin corrección de color ni ahorro de tinta, y no recortes por dentro del marco oscuro.',
    'Inclínala si coge un brillo: un reflejo sobre un parche no es su color.',
  ] as readonly string[],
  footer: 'Inventario y catálogo razonado — Rotili / Ruiz Campins · testigo de gris',
} as const

/** Name the file is downloaded with. In Spanish: it is what the cataloger reads. */
export const GRAY_TARGET_SHEET_FILENAME = 'testigo-de-gris.pdf'

/* -------------------------------------------------------------------- drawing */

/**
 * Splits a text into lines that fit within `maxWidth` points.
 *
 * The twin of the private helper in `recordPdf.ts`, and copied rather than shared on
 * purpose: that module reaches for the Supabase client, the storage signatures and the
 * artwork types, and this sheet carries no data at all — importing it would drag the
 * whole record into a download that only needs pdf-lib. Fifteen lines, and both copies
 * have tests.
 */
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

/** Leading of a block of notes at that size. */
const leadingAt = (size: number) => size * 1.32

/**
 * The largest size at which the notes still fit in the band left below the strip.
 *
 * The valve of the printed record applied to prose instead of to a photograph: the
 * sheet is one page and it stays one page, so what gives way is the size of the text —
 * never the strip, which is the only part of this sheet a camera has to read. It stops
 * at 7 pt because below that the note about the ink stops being read, and that note is
 * the reason the sheet says what it is.
 */
function noteSize(
  notes: readonly string[],
  font: PDFFont,
  maxWidth: number,
  room: number,
): number {
  const sizes = [9, 8.5, 8, 7.5, 7]
  for (const size of sizes) {
    const height = notes.reduce(
      (total, note) => total + wrapLines(note, font, size, maxWidth).length * leadingAt(size) + 4,
      0,
    )
    if (height <= room) return size
  }
  return sizes[sizes.length - 1]!
}

/**
 * The sheet, ready to print.
 *
 * The greys are written as **DeviceGray** and not as RGB: a grey asked for as three
 * equal RGB components goes through the printer's colour conversion and comes back
 * with a tint of coloured ink, which is the one thing a grey target must not have. The
 * value written is the code of the patch divided by 255, so the number printed under
 * each patch and the number the detector reads off the photograph are the same number.
 */
export async function generateGrayTargetSheet(
  page: { width: number; height: number } = A5_LANDSCAPE,
): Promise<Blob> {
  const layout = grayTargetSheetLayout(page)
  const doc = await PDFDocument.create()
  const sheet = doc.addPage([layout.page.width, layout.page.height])
  const normal = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)

  const ink = grayscale(0.11)
  const gray = grayscale(0.42)
  const textWidth = layout.page.width - 2 * layout.margin

  // ── Header ──────────────────────────────────────────────────
  let y = layout.page.height - layout.margin - 12
  sheet.drawText(GRAY_TARGET_SHEET_TEXT.title, {
    x: layout.margin,
    y,
    size: 16,
    font: bold,
    color: ink,
  })
  y -= 15
  for (const line of wrapLines(GRAY_TARGET_SHEET_TEXT.intro, normal, 8.5, textWidth)) {
    sheet.drawText(line, { x: layout.margin, y, size: 8.5, font: normal, color: gray })
    y -= 11
  }

  // ── The staircase ───────────────────────────────────────────
  // The rule first and the patches on top of it: what is left showing around them is
  // the keyline, so its thickness can never disagree with the layout.
  sheet.drawRectangle({ ...layout.frame, color: grayscale(SHEET_RULE_CODE / 255) })
  layout.patches.forEach((patch, i) => {
    sheet.drawRectangle({ ...patch, color: grayscale(SHEET_PATCH_CODES[i]! / 255) })
  })

  // The values, under the rule and centred on their patch. Never inside it.
  for (const label of layout.labels) {
    sheet.drawText(label.text, {
      x: label.centerX - normal.widthOfTextAtSize(label.text, label.size) / 2,
      y: label.baseline,
      size: label.size,
      font: normal,
      color: ink,
    })
  }

  // ── Notes ───────────────────────────────────────────────────
  y = layout.notesTop
  sheet.drawText(GRAY_TARGET_SHEET_TEXT.values, {
    x: layout.margin,
    y,
    size: 8,
    font: normal,
    color: gray,
  })
  y -= 14

  const footerHeight = 12
  const size = noteSize(
    GRAY_TARGET_SHEET_TEXT.notes,
    normal,
    textWidth,
    y - layout.margin - footerHeight,
  )
  for (const note of GRAY_TARGET_SHEET_TEXT.notes) {
    for (const line of wrapLines(note, normal, size, textWidth)) {
      sheet.drawText(line, { x: layout.margin, y, size, font: normal, color: ink })
      y -= leadingAt(size)
    }
    y -= 4
  }

  sheet.drawText(GRAY_TARGET_SHEET_TEXT.footer, {
    x: layout.margin,
    y: layout.margin,
    size: 6.5,
    font: normal,
    color: gray,
  })

  const bytes = await doc.save()
  return new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' })
}
