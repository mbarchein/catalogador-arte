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
import { parseMarkup, type MarkupBlock } from '../../lib/markup'
import { measurementsText, priceText, sortItems, type DossierItemRow } from './dossierItems'
import { activeSections, sectionOf } from './dossierSections'

/** The biography and CV of a fund, as the PDF reads them (RF-1617). */
export interface FundTexts {
  code: ArtistFund
  name: string
  biography: string
  cv: string
}

/**
 * A free text as it is printed: a heading, a body, or both.
 *
 * The body arrives PARSED: the marks —headings, lists, bold— are interpreted here,
 * where there are no fonts and everything is verifiable in node, and whoever draws
 * only draws. It is the same division as everywhere else in the dossier.
 */
export interface TextBlock {
  heading: string
  body: MarkupBlock[]
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

/**
 * Una entrada del índice: la sección y cuántas obras lleva.
 *
 * **Sin número de página, y eso es una decisión.** El número solo se sabe midiendo —una
 * biografía larga ocupa dos hojas y corre todo lo que viene detrás—, y medir necesita
 * las tipografías, que están en el generador. Así que el plan dice qué secciones hay y
 * en qué orden, y el número lo resuelve quien dibuja, contando las hojas que de verdad
 * ha escrito. Un índice con números estimados es la única forma de que un índice
 * mienta.
 */
export interface IndexEntry {
  heading: string
  artworkCount: number
}

export type DossierPage =
  | { kind: 'COVER'; title: string; recipient: string; date: string; blurb: MarkupBlock[] }
  | { kind: 'INDEX'; entries: IndexEntry[] }
  | { kind: 'DIVIDER'; heading: string; body: MarkupBlock[] }
  | { kind: 'BIOGRAPHY'; heading: string; blocks: MarkupBlock[]; cv: MarkupBlock[] }
  | { kind: 'TEXTS'; texts: TextBlock[] }
  | {
      kind: 'ARTWORK'
      texts: TextBlock[]
      caption: ArtworkCaption
      imageId: string | null
      catalogId: string
    }

/**
 * Una página del PDF con la sección a la que pertenece.
 *
 * La sección viaja **en cada página** y no dentro del bloque que la abre, porque lo
 * que la necesita es el pie: «Óleos, 1962-1968 · 7 de 14» en todas las hojas del
 * bloque es lo que hace que una hoja suelta, impresa y separada del resto, siga
 * diciendo de dónde viene.
 */
export interface PlannedPage {
  page: DossierPage
  /** El rótulo de la sección en curso, o null antes de la primera. */
  section: string | null
  /**
   * Si esta es la PRIMERA página impresa de su sección, que es lo que el índice
   * necesita saber para poner un número.
   *
   * Lo dice el plan y no lo adivina quien dibuja: con portadilla es la portadilla, y
   * sin ella es la página de la primera obra del bloque — dos casos que solo se
   * distinguen aquí.
   */
  sectionStart?: boolean
}

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

/**
 * Los bloques de un texto largo: párrafos, títulos y listas (RF-1614, RF-1616).
 *
 * Es `parseMarkup` y nada más, y está aquí con nombre propio para decir dónde se
 * interpretan las marcas de un dossier: **una sola vez, en el plan**. Antes eran dos
 * funciones —una que partía la prosa en párrafos y otra que partía el currículum en
 * líneas—, y la del currículum era justo lo que hacía que una lista pegada de una web
 * saliera como una lista: ahora eso lo dice la marca y no el sitio donde está el texto.
 */
export function textBlocks(text: string): MarkupBlock[] {
  return parseMarkup(text)
}

/**
 * Cuántas entradas del índice caben en una página, para saber cuántas páginas
 * ocupa antes de saber los números que va a imprimir.
 *
 * Es la pescadilla de todo índice: las páginas de las secciones dependen de cuánto
 * mida el índice, y el índice depende de cuántas secciones haya. Se rompe contando
 * primero: con las entradas ya sabidas, el número de páginas del índice es
 * aritmética, y solo entonces se numeran las secciones.
 */
export const INDEX_ENTRIES_PER_PAGE = 24

/**
 * The pages of the PDF, in order, each one with the section it belongs to.
 *
 * **An artwork withdrawn from the catalogue does not print** (RF-1613): its item
 * stays in the dossier and the screen says so, but a withdrawn record has no place
 * in a document that goes outside. Same for an artwork whose record could not be
 * read: printing a page with a code and no data would be worse than not printing
 * it. Both cases keep whatever texts were attached to them, which then move on to
 * the next artwork — a section heading must not disappear with the artwork that
 * happened to follow it.
 *
 * ── LAS SECCIONES, Y POR QUÉ SON DOS COSAS DISTINTAS ────────
 *
 * Una sección **sin portadilla** se comporta exactamente como un texto con rótulo:
 * su título encabeza la página de su primera obra. Una sección **con portadilla**
 * se lleva una hoja para anunciarse. Es el mismo dato con dos maquetas, y por eso
 * el interruptor está en la fila y no en el generador.
 *
 * En las dos, el rótulo pasa a ser la sección en curso, y eso viaja al pie de todas
 * las páginas de la sección (RF-1620).
 *
 * **La sección de una página sale de la fila y no de recorrer las anteriores**: cada
 * elemento dice a qué sección pertenece (`section_item_id`), así que una obra suelta
 * detrás de una sección imprime sin rótulo, que es exactamente lo que la pantalla
 * enseña. Cuando la pertenencia se deducía de la posición eso no se podía escribir.
 */
export function dossierPages(input: {
  dossier: {
    title: string
    cover_text: string
    show_prices: boolean
    show_index?: boolean
  }
  recipientName: string
  /** When the PDF is issued, already written for a person: «11 de agosto de 2026». */
  date: string
  items: readonly DossierItemRow[]
  funds: readonly FundTexts[]
}): PlannedPage[] {
  const planned: PlannedPage[] = [
    {
      page: {
        kind: 'COVER',
        title: input.dossier.title.trim(),
        recipient: input.recipientName.trim(),
        date: input.date,
        blurb: textBlocks(input.dossier.cover_text),
      },
      section: null,
    },
  ]

  let pending: TextBlock[] = []
  let section: string | null = null
  // Las entradas del índice se recogen en la misma pasada. El número de página no: lo
  // pone quien dibuja, que es quien sabe cuántas hojas ha ocupado cada cosa.
  const index: IndexEntry[] = []
  const indexBySection = new Map<string, IndexEntry>()
  // La página que abre la sección en curso todavía no existe: se marca la siguiente que
  // se cree, que es de lo que el índice cuelga su número.
  let startsSection = false

  const push = (page: DossierPage) => {
    planned.push(startsSection ? { page, section, sectionStart: true } : { page, section })
    startsSection = false
  }
  const flushTexts = () => {
    if (pending.length === 0) return
    push({ kind: 'TEXTS', texts: pending })
    pending = []
  }

  const ordered = sortItems(input.items)
  const sections = activeSections(ordered)

  for (const row of ordered) {
    if (!row.active) continue

    if (row.kind === 'SECTION') {
      const heading = row.heading.trim()
      const entry: IndexEntry = { heading, artworkCount: 0 }
      if (row.divider_page === true) {
        // Los textos que esperaban van ANTES de la portadilla: se pusieron delante
        // del rótulo, y quien los movió ahí quería leerlos primero. Y antes de que
        // `section` cambie, que es lo que decide su pie.
        flushTexts()
        section = heading
        index.push(entry)
        indexBySection.set(row.id, entry)
        startsSection = true
        push({ kind: 'DIVIDER', heading, body: textBlocks(row.body) })
      } else {
        section = heading
        // Sin portadilla, el rótulo encabeza la página de la primera obra: la que abre
        // la sección es la siguiente que se cree.
        index.push(entry)
        indexBySection.set(row.id, entry)
        startsSection = true
        pending.push({ heading, body: textBlocks(row.body) })
      }
      continue
    }

    // La sección de esta página es la de ESTA fila: una obra suelta detrás de una
    // sección imprime sin rótulo.
    const belongs = sectionOf(row, sections)
    section = belongs === null ? null : sections.get(belongs)?.heading.trim() ?? null

    if (row.kind === 'TEXT') {
      pending.push({ heading: row.heading.trim(), body: textBlocks(row.body) })
      continue
    }

    if (row.kind === 'BIOGRAPHY') {
      const fund = input.funds.find((candidate) => candidate.code === row.artist_fund)
      if (fund === undefined) continue
      const blocks = textBlocks(fund.biography)
      const cv = row.with_cv === true ? textBlocks(fund.cv) : []
      // Nothing written yet: a page with a heading and no prose is a blank page
      // with a title on it, and the screen already says the fund has no biography.
      if (blocks.length === 0 && cv.length === 0) continue
      flushTexts()
      push({
        kind: 'BIOGRAPHY',
        heading: row.heading.trim() !== '' ? row.heading.trim() : fund.name,
        blocks,
        cv,
      })
      continue
    }

    // ARTWORK. What cannot be printed is skipped, and its texts survive.
    if (row.artwork === null || !row.artwork.active) continue
    push({
      kind: 'ARTWORK',
      texts: pending,
      caption: artworkCaption(row, { showPrices: input.dossier.show_prices }),
      imageId: row.image_id,
      catalogId: row.catalog_id ?? '',
    })
    pending = []
    // Se cuenta en la entrada de SU sección y no en la última creada: con obras
    // sueltas por medio, «la última» sumaría páginas que no son de ese bloque.
    if (belongs !== null) {
      const entry = indexBySection.get(belongs)
      if (entry !== undefined) entry.artworkCount += 1
    }
  }

  // Texts with no artwork behind them: a closing paragraph gets its own page.
  flushTexts()

  // ── El índice, si el dossier lo lleva y hay secciones ──────
  //
  // Detrás de la portada, que es donde se busca. Sin secciones no se pinta aunque
  // esté encendido: un índice de una sola entrada sin nombre es una hoja gastada.
  if (input.dossier.show_index === true && index.length > 0) {
    const indexPages = Math.ceil(index.length / INDEX_ENTRIES_PER_PAGE)
    const pages: PlannedPage[] = []
    for (let i = 0; i < indexPages; i += 1) {
      pages.push({
        page: {
          kind: 'INDEX',
          entries: index.slice(i * INDEX_ENTRIES_PER_PAGE, (i + 1) * INDEX_ENTRIES_PER_PAGE),
        },
        section: null,
      })
    }
    planned.splice(1, 0, ...pages)
  }

  return planned
}

/**
 * The running foot of every page: the dossier, la sección, and where you are in it.
 *
 * El título está porque una hoja impresa que se separa del resto tiene que decir a
 * qué pertenece, y el recuento —«3 de 14»— porque un PDF que llega truncado por una
 * pasarela de correo es indistinguible de uno corto.
 *
 * Y la sección va delante del título cuando hay una (RF-1620): en un dossier largo
 * es lo que contesta «¿esto de qué bloque era?» sin volver atrás, y es lo que hace
 * que una hoja suelta encima de una mesa siga significando algo.
 */
export function footerText(
  title: string,
  page: number,
  total: number,
  section?: string | null,
): { left: string; right: string } {
  const named = (section ?? '').trim()
  return {
    left: named === '' ? title.trim() : `${named} · ${title.trim()}`,
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
export function issueBlockedReason(pages: readonly PlannedPage[]): string | null {
  // Lo que CUENTA como algo que decir: una obra, una biografía o un texto. Una
  // portada y una portadilla de sección vacía son dos hojas con títulos y nada
  // dentro, y un documento así se manda sin querer.
  const printable = pages.filter(
    ({ page }) => page.kind === 'ARTWORK' || page.kind === 'BIOGRAPHY' || page.kind === 'TEXTS',
  )
  if (printable.length > 0) return null
  return (
    'Este dossier no tiene nada que imprimir todavía. Añade alguna obra: las que están retiradas ' +
    'del catálogo no salen en el PDF.'
  )
}
