/**
 * What the dossier's PDF is going to say, page by page, before anything is drawn
 * (RF-1607, RF-1609, ADR-011).
 *
 * **Pure and separated from the drawing on purpose.** The battery runs in node
 * with no canvas and no `pdf-lib`, so «cuántas páginas salen», «qué lleva cada
 * una» and «qué dice el pie de una obra» are verified here or they are not
 * verified at all. What is left in `dossierPdf.ts` is ink: rectangles, text at
 * coordinates and the embedded photograph.
 *
 * ── LA MAQUETA: UNA OBRA POR PÁGINA ─────────────────────────
 *
 * Decidida por el propietario (ADR-011): la fotografía manda —más de media hoja—
 * y el pie va debajo. Doce obras son doce páginas, y ése es el coste que se acepta
 * a cambio de que la obra se vea.
 *
 * ── DÓNDE CAEN LOS TEXTOS, QUE ES LA ÚNICA DECISIÓN DE VERDAD ─
 *
 * Un rótulo de sección no quiere una página para él: quiere encabezar la primera
 * obra de su sección, que es como se lee un dossier de galería y como está
 * dibujado en la maqueta. Así que un texto **se pega a la página de la obra que
 * viene detrás**, y solo se queda con página propia cuando no hay ninguna obra
 * detrás — un párrafo de cierre, por ejemplo. Eso hace que mover un rótulo por
 * encima de una obra en la pantalla cambie de sección exactamente esa obra, sin
 * ningún campo que lo diga.
 */

import { displayDate } from '../../lib/dates'
import { displayTitle } from '../../lib/title'
import type { ArtistFund } from '../../lib/types'
import { measurementsText, priceText, sortItems, type DossierItemRow } from './dossierItems'

/** The biography and CV of a fund, as the PDF reads them (RF-1617). */
export interface FundTexts {
  code: ArtistFund
  name: string
  biography: string
  cv: string
}

/** A free text as it is printed: a heading, a paragraph, or both. */
export interface TextBlock {
  heading: string
  body: string
}

/** The caption under a photograph, in printing order. Never a gap (RF-304). */
export interface ArtworkCaption {
  /** The cataloguing code, which is how the artwork is asked for by telephone. */
  code: string
  /** The title, or «Sin título» — never empty. */
  title: string
  /** `1965 · óleo sobre lienzo · 92 × 73 cm`. Whatever is missing is silent, not «N/D». */
  facts: string
  /** `4.500 €`, or null: null when there is no price and when the dossier does not print them. */
  price: string | null
}

export type DossierPage =
  | { kind: 'COVER'; title: string; recipient: string; date: string; blurb: string }
  | { kind: 'BIOGRAPHY'; heading: string; paragraphs: string[]; cv: string[] }
  | { kind: 'TEXTS'; texts: TextBlock[] }
  | { kind: 'ARTWORK'; texts: TextBlock[]; caption: ArtworkCaption; imageId: string | null; catalogId: string }

/**
 * The caption of one artwork.
 *
 * **What is missing is silent.** The catalogue distinguishes the unreviewed datum
 * from the researched-and-not-found (`N/D`) and from the doubtful (`[?]`), and only
 * the last one is printed: «[1966?]» is honest and a gallery reads it, whereas
 * «Sin revisar» on a sheet that goes outside is internal working noise. So a
 * missing technique or a missing measurement simply does not appear, and the line
 * closes up.
 *
 * The price is null when the dossier does not print prices, and that is decided
 * here rather than by whoever draws: a caption that carries a price the dossier
 * hides is a caption one bug away from printing it.
 */
export function artworkCaption(
  row: DossierItemRow,
  options: { showPrices: boolean },
): ArtworkCaption {
  const artwork = row.artwork
  const facts =
    artwork === null
      ? []
      : [displayDate(artwork.execution_date), artwork.technique.trim(), measurementsText(artwork)]
  return {
    code: row.catalog_id ?? '',
    title: artwork === null ? 'Obra no disponible' : displayTitle(artwork.title),
    facts: facts.filter((part) => part !== '' && part !== 'Sin fecha').join(' · '),
    price: options.showPrices ? priceText(row.price, row.currency) : null,
  }
}

/** The paragraphs of a prose text, keeping the blank lines the author typed. */
export function paragraphsOf(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.replace(/\s*\n\s*/g, ' ').trim())
    .filter((paragraph) => paragraph !== '')
}

/** The lines of a CV, one entry per line and the blank ones dropped. */
export function cvLines(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
}

/**
 * The pages of the PDF, in order.
 *
 * **An artwork withdrawn from the catalogue does not print** (RF-1613): its item
 * stays in the dossier and the screen says so, but a withdrawn record has no place
 * in a document that goes outside. Same for an artwork whose record could not be
 * read: printing a page with a code and no data would be worse than not printing
 * it. Both cases keep whatever texts were attached to them, which then move on to
 * the next artwork — a section heading must not disappear with the artwork that
 * happened to follow it.
 */
export function dossierPages(input: {
  dossier: {
    title: string
    cover_text: string
    show_prices: boolean
  }
  recipientName: string
  /** When the PDF is issued, already written for a person: «11 de agosto de 2026». */
  date: string
  items: readonly DossierItemRow[]
  funds: readonly FundTexts[]
}): DossierPage[] {
  const pages: DossierPage[] = [
    {
      kind: 'COVER',
      title: input.dossier.title.trim(),
      recipient: input.recipientName.trim(),
      date: input.date,
      blurb: input.dossier.cover_text.trim(),
    },
  ]

  let pending: TextBlock[] = []

  for (const row of sortItems(input.items)) {
    if (!row.active) continue

    if (row.kind === 'TEXT') {
      pending.push({ heading: row.heading.trim(), body: row.body.trim() })
      continue
    }

    if (row.kind === 'BIOGRAPHY') {
      const fund = input.funds.find((candidate) => candidate.code === row.artist_fund)
      if (fund === undefined) continue
      const paragraphs = paragraphsOf(fund.biography)
      const cv = row.with_cv === true ? cvLines(fund.cv) : []
      // Nothing written yet: a page with a heading and no prose is a blank page
      // with a title on it, and the screen already says the fund has no biography.
      if (paragraphs.length === 0 && cv.length === 0) continue
      // The texts waiting go on top of the biography's page, which is where they
      // were put: whoever moved a paragraph above it meant it to be read first.
      pages.push({
        kind: 'BIOGRAPHY',
        heading: row.heading.trim() !== '' ? row.heading.trim() : fund.name,
        paragraphs,
        cv,
      })
      if (pending.length > 0) {
        pages.splice(pages.length - 1, 0, { kind: 'TEXTS', texts: pending })
        pending = []
      }
      continue
    }

    // ARTWORK. What cannot be printed is skipped, and its texts survive.
    if (row.artwork === null || !row.artwork.active) continue
    pages.push({
      kind: 'ARTWORK',
      texts: pending,
      caption: artworkCaption(row, { showPrices: input.dossier.show_prices }),
      imageId: row.image_id,
      catalogId: row.catalog_id ?? '',
    })
    pending = []
  }

  // Texts with no artwork behind them: a closing paragraph gets its own page.
  if (pending.length > 0) pages.push({ kind: 'TEXTS', texts: pending })

  return pages
}

/**
 * The running foot of every page: the dossier and where you are in it.
 *
 * The title is on it because a printed sheet that gets separated from the rest has
 * to say what it belongs to, and the count —«3 de 14»— because a PDF that arrives
 * truncated by an email gateway is otherwise indistinguishable from a short one.
 */
export function footerText(title: string, page: number, total: number): { left: string; right: string } {
  return {
    left: title.trim(),
    right: `${page} de ${total}`,
  }
}

/**
 * The path of the file in the private bucket (RF-1607, RF-110).
 *
 * **The version is NOT in the name**, and that is the whole point: the version is
 * assigned by the database when the row is written, so a name computed here would
 * be a guess — and two people issuing at the same time would guess the same. The
 * random suffix is the same idiom the photographs use, and it makes the path
 * unique without asking anybody.
 *
 * The prefix is `dossiers/` because the check constraint demands it, and that
 * constraint is part of the perimeter: a row pointing at `AR-0001/x_master.jpg`
 * would turn a dossier into a way of getting a signature for a master.
 */
export function issuePath(dossierId: string, suffix: string): string {
  return `dossiers/${dossierId}_${suffix}.pdf`
}

/**
 * The name the file gets when it is downloaded, which is what the recipient sees
 * in their inbox.
 *
 * Not the path: `dossiers/8f3a…_k3m9p2qz.pdf` is a storage key and reads like a
 * mistake attached to an email. This is the title, made safe for a file system,
 * with the version so that two of them do not overwrite each other in a downloads
 * folder.
 */
export function issueFileName(title: string, version: number): string {
  const clean = title
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
  const stem = clean === '' ? 'dossier' : clean
  return `${stem}-v${version}.pdf`
}

/**
 * Why the PDF cannot be issued yet, or null when it can.
 *
 * An empty dossier is the case that matters: pdf-lib would happily produce a
 * one-page cover, and a cover with nothing behind it is a document somebody sends
 * by accident. The other one is subtler and is the reason this counts PAGES and not
 * items: a dossier whose only artworks are withdrawn from the catalogue has items
 * on screen and nothing printable, so the sentence has to name that instead of
 * saying «vacío», which the cataloguer can see is false.
 */
export function issueBlockedReason(pages: readonly DossierPage[]): string | null {
  const printable = pages.filter((page) => page.kind !== 'COVER')
  if (printable.length > 0) return null
  return (
    'Este dossier no tiene nada que imprimir todavía. Añade alguna obra: las que están retiradas ' +
    'del catálogo no salen en el PDF.'
  )
}
