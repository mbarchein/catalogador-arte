/**
 * A bibliographic citation as the record reads it (RF-504).
 *
 * A reference is read at a glance or it is useless. Five things answer the
 * question the cataloger actually has in front of the artwork — «¿dónde está
 * publicada esta obra?»: who wrote it, what it is called, where it came out,
 * when, and THE PAGE where this artwork appears. The first four belong to the
 * reference; the fifth belongs to the bridge row, because it is a fact about
 * this artwork in that publication and not about the publication (RF-504).
 *
 * Everything here is pure and takes plain rows: the battery runs in node, so the
 * sentence itself gets verified and not a component that happens to contain it.
 */

import type { CitationRow, ReferenceRow } from '../documentaryRows'

/** The plausible-year window of the database (`bibliography_plausible_year`). */
export const MIN_REFERENCE_YEAR = 1000
export const MAX_REFERENCE_YEAR = 2100

/**
 * Who is responsible for the text: the authors, or the editors when there are no
 * authors, or nobody.
 *
 * Null and not «Sin autor» when neither is written: an unsigned press cutting is
 * cited by its title, which is ordinary bibliographic practice and not a hole in
 * the record. The line still says the title and the year, so nothing is left
 * blank on screen.
 *
 * `(ed.)` is never pluralized. The field is free text and «Pérez, Juan» is one
 * editor with a comma in the middle, so any rule that counts separators would
 * turn single editors into plural ones — a wrong abbreviation printed with
 * confidence is worse than one that is always singular.
 */
export function referenceAuthorText(reference: Pick<ReferenceRow, 'authors' | 'editors'>): string | null {
  const authors = reference.authors.trim()
  if (authors !== '') return authors
  const editors = reference.editors.trim()
  return editors === '' ? null : `${editors} (ed.)`
}

/**
 * The year, or `s.f.` — *sine anno*, the abbreviation a bibliography uses for an
 * undated publication.
 *
 * A null year is a DATUM here and not an absence to be hidden: half a
 * researcher's press cuttings carry no date, and the reference is still citable.
 * That is also why undated references sort last instead of first (see
 * `sortCitations`): «s.f.» is a legitimate value that is not a point in time.
 */
export function referenceYearText(reference: Pick<ReferenceRow, 'year'>): string {
  return reference.year == null ? 's.f.' : String(reference.year)
}

/**
 * Where it came out: the journal or volume, and the imprint.
 *
 * `Badajoz: Diputación de Badajoz` is the classical form of an imprint and it is
 * kept — place, colon, publisher — with whichever half is missing dropped, so no
 * stray colon or comma is ever printed. Null when the reference says none of the
 * three, which happens with a bare press cutting.
 */
export function referenceSourceText(
  reference: Pick<ReferenceRow, 'container_title' | 'publisher' | 'place'>,
): string | null {
  const container = reference.container_title.trim()
  const imprint = [reference.place.trim(), reference.publisher.trim()].filter((p) => p).join(': ')
  const text = [container, imprint].filter((p) => p).join(' · ')
  return text === '' ? null : text
}

/** Anything that already announces what kind of locator it is: printed verbatim. */
const PAGES_SELF_LABELLED = /^(p{1,2}\b|p{1,2}\.|p[áa]gs?\b|p[áa]gs?\.|l[áa]ms?\b|l[áa]ms?\.|figs?\b|figs?\.|nº|n\.º|s\/[pf]|s\.\s?[pf]\.?|ils?\.|cat\.)/i

/**
 * The page where this artwork appears, with the abbreviation it needs and not
 * one more.
 *
 * `pages` is TEXT and not a number on purpose (RF-504): «34-36», «s/p» — a
 * publication with no pagination — and «lám. XII» are all legitimate answers to
 * «¿en qué página?», and a numeric column would have lost the last two. So the
 * prefix is decided from what is written:
 *
 *   · one bare number → `pág. 34`;
 *   · several numbers or a range → `págs. 34-36`;
 *   · anything that already says what it is («s/p», «lám. XII», «pp. 12-14») →
 *     verbatim, because prefixing it would read «pág. lám. XII».
 *
 * Null when nothing is written, which is NOT «s/p»: «s/p» is somebody stating
 * that the publication has no page numbers, and an empty field is nobody having
 * written the page down. The same distinction the whole catalogue is built on.
 */
export function citationPagesText(pages: string): string | null {
  const written = pages.trim()
  if (written === '') return null
  if (PAGES_SELF_LABELLED.test(written)) return written
  if (/^\d+$/.test(written)) return `pág. ${written}`
  // Two or more numbers, whatever joins them: a range («34-36»), a list
  // («34, 51») or both.
  if (/^\d[\d\s,.;+/–—-]*\d$/.test(written) && /\d[\s,.;+/–—-]+\d/.test(written)) {
    return `págs. ${written}`
  }
  return written
}

/**
 * What the record says about the page, never a gap (RF-304).
 *
 * It is said out loud instead of being left empty because the page is the part
 * of a citation that gets used: a reference without it sends the reader to
 * search a whole book, and the record has to make it obvious that the datum is
 * missing rather than look like a complete citation.
 */
export function displayCitationPages(pages: string): string {
  return citationPagesText(pages) ?? 'Página sin registrar'
}

/** One citation of this artwork, ready to paint. Nothing is decided in the JSX. */
export interface CitationView {
  /** The BRIDGE row's identifier: what a retirement or an edit of the page acts on. */
  id: string
  /** The reference's identifier, for the link to its own record (RF-305, RF-506). */
  referenceId: string
  /** The reference could not be read. The citation is still shown — it exists. */
  unavailable: boolean
  /** Why nothing of the reference is shown. Null when it could be read. */
  unavailableText: string | null
  /** Title of the reference. Never empty: the database refuses a blank one. */
  title: string
  /** `Rotili, A. · 1985`, or just the year when nobody signed it. Never empty. */
  byline: string
  /** `Revista de Estudios Extremeños · Badajoz`. Null when the reference gives none. */
  sourceText: string | null
  /** «Catálogo de exposición» (RF-514). Null when the reference is unclassified. */
  typeName: string | null
  /** `págs. 34-36` / `Página sin registrar`. Always something (RF-304). */
  pagesText: string
  /** The page is not registered: the screen shows it dimmed, not absent. */
  pagesMissing: boolean
  /** The short handle a researcher names the reference by. Null when it has none. */
  bibtexKey: string | null
  /** The reference is in the trash (RF-901). Only an editor ever sees this. */
  retiredText: string | null
  /** What this citation says about itself: «citada de pasada», «reproducida». */
  note: string
}

/**
 * A row of `artwork_bibliography` as the block paints it.
 *
 * The reference arrives null when the bridge row points at one the reader cannot
 * see — a retired reference is invisible to the Reader by policy, and the bridge
 * row is not. The citation is shown anyway, with the page and the note, which
 * are ours and are readable: dropping the row would hide from the reader that
 * this artwork is published somewhere, which is the exact opposite of what a
 * bibliography is for.
 */
export function citationView(row: CitationRow): CitationView {
  const reference = row.reference
  const pages = citationPagesText(row.pages)
  const common = {
    id: row.id,
    referenceId: row.bibliography_id,
    pagesText: pages ?? 'Página sin registrar',
    pagesMissing: pages === null,
    note: row.note,
  }

  if (reference === null) {
    return {
      ...common,
      unavailable: true,
      unavailableText:
        'Esta obra está citada en una referencia que no se puede leer: está retirada del ' +
        'catálogo. La cita sigue registrada, y la página también.',
      title: 'Referencia no disponible',
      byline: '',
      sourceText: null,
      typeName: null,
      bibtexKey: null,
      retiredText: null,
    }
  }

  const author = referenceAuthorText(reference)
  const year = referenceYearText(reference)
  const title = reference.title.trim()
  return {
    ...common,
    unavailable: false,
    unavailableText: null,
    // The database checks that the title is not blank; the fallback covers the
    // row that arrived anyway, because a citation with no visible text is a row
    // that looks like a bug in the screen.
    title: title === '' ? 'Referencia sin título' : title,
    byline: author === null ? year : `${author} · ${year}`,
    sourceText: referenceSourceText(reference),
    typeName: reference.publication_type?.name.trim() || null,
    bibtexKey: reference.bibtex_key?.trim() || null,
    retiredText: reference.active
      ? null
      : 'Referencia retirada del catálogo: sigue citada, pero ya no se ofrece para citar.',
  }
}

/**
 * What the correction panel needs of a citation already recorded.
 *
 * `pages` RAW and not formatted, which is the whole reason this is not the view:
 * the field holds what somebody typed («34-36»), and reopening it with the
 * decoration the record adds («págs. 34-36») would save the decoration back into
 * the column and grow a prefix on every edit.
 *
 * The title comes along so the panel can name what is being corrected without
 * going back to the database, and it is the same fallback the view uses.
 */
export interface CitationEdit {
  id: string
  title: string
  pages: string
  note: string
}

export function citationEdit(row: CitationRow): CitationEdit {
  const title = row.reference?.title.trim() ?? ''
  return {
    id: row.id,
    title: title === '' ? 'Referencia no disponible' : title,
    pages: row.pages,
    note: row.note,
  }
}
