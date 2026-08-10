/**
 * Choosing the reference an artwork gets cited in (RF-504), and writing down a
 * new one when it is not in the catalogue yet.
 *
 * Two different acts that the same panel has to serve, because in front of the
 * artwork they are one gesture: «esta obra sale en el catálogo de la exposición
 * de Zafra». Sometimes that catalogue is already a row of `bibliography` — it was
 * entered while cataloguing another artwork — and sometimes it is not, and
 * sending the cataloger away to a different screen to create it is how a citation
 * ends up never recorded.
 *
 * The rules that decide anything live here, pure: which references are on offer,
 * which of them the typed text reaches, whether a new one is really new, and
 * whether the minimum has been written. The panel only paints them.
 */

import { fuzzyRankBy, normalizeForSearch, type RankedItem } from '../../../lib/vocabulary'
import type { CitationRow, ReferenceRow } from '../documentaryRows'
import {
  MAX_REFERENCE_YEAR,
  MIN_REFERENCE_YEAR,
  referenceAuthorText,
  referenceSourceText,
  referenceYearText,
} from './citationFormat'

/**
 * The columns of `bibliography` the picker needs, with its publication type.
 *
 * The same shape the record already reads (`ReferenceRow`), so a reference just
 * created is painted by the very same code that paints one loaded with the
 * citations, and written out by hand for the reason `documentaryRows.ts` gives: a
 * TypeScript type does not exist at run time, and a column the query forgets
 * arrives as `undefined` with the type promising a value. There is a test that
 * walks a complete row and demands that this list ask for every field of it.
 *
 * Retired references ARE selected (no `active` filter): the list of what can be
 * cited excludes them — see `referenceOptions` — but a citation already made
 * points at one, and hiding it there would leave a blank where a title used to
 * be.
 */
export const REFERENCE_COLUMNS =
  'id, bibtex_key, authors, editors, title, container_title, publication_type_id, year, ' +
  'publisher, place, note, active, publication_type:publication_types(id, name, active)'

/** One reference as the picker offers it. */
export interface ReferenceOption {
  id: string
  /** The title: what is read first and what the typing is matched against. */
  text: string
  /** `Rotili, A. · 1985 · Revista de Estudios Extremeños` — enough to tell two editions apart. */
  hint: string
  /** Already cited in THIS artwork: shown, and not offered twice. */
  alreadyCited: boolean
}

/**
 * Everything of a reference that the typing may reach.
 *
 * The title alone is not enough: a cataloger looks for «Zafra», which is the
 * place, or for «rotili85», which is the BibTeX handle they gave it, or for the
 * journal. All of it goes into one string and the subsequence matching of
 * `fuzzyRank` does the rest — the same matching the location suggestions already
 * use, so the searching behaves the same way across the application.
 */
export function referenceSearchText(reference: ReferenceRow): string {
  return [
    reference.title,
    reference.authors,
    reference.editors,
    reference.container_title,
    reference.publisher,
    reference.place,
    reference.bibtex_key ?? '',
    reference.year == null ? '' : String(reference.year),
    reference.publication_type?.name ?? '',
  ]
    // Trimmed BEFORE joining, and the title first: the emphasis of the matched
    // letters is painted over the option's title, so the first characters of
    // this string have to be that same title, character for character.
    .map((part) => part.trim())
    .filter((part) => part !== '')
    .join(' ')
}

/** The second line of an option: who, when, and where it came out. */
export function referenceOptionHint(reference: ReferenceRow): string {
  return [
    referenceAuthorText(reference),
    referenceYearText(reference),
    referenceSourceText(reference),
    reference.publication_type?.name.trim() || null,
  ]
    .filter((part): part is string => part !== null && part !== '')
    .join(' · ')
}

/** The identifiers of the references this artwork already cites, out of its rows. */
export function citedReferenceIds(rows: readonly CitationRow[]): Set<string> {
  return new Set(rows.map((row) => row.bibliography_id))
}

/**
 * The references on offer, in the order the panel lists them when nothing has
 * been typed.
 *
 * Retired ones are left OUT — they are in the trash (RF-901) and offering them
 * for a new citation would quietly bring them back — while the ones this artwork
 * already cites stay IN, marked: the alternative is a reference that vanishes
 * from the search with no explanation, and the cataloger typing its title again
 * and again wondering where it went.
 *
 * Alphabetical by title, with es-ES collation so «Álbum» sits with the a's
 * instead of past the z. Not by year and not by how recently it was added: the
 * list is scanned with a thumb, and a fixed place for each title is what makes
 * the second visit faster than the first.
 */
export function referenceOptions(
  references: readonly ReferenceRow[],
  citedIds: ReadonlySet<string>,
): ReferenceOption[] {
  return references
    .filter((reference) => reference.active)
    .map((reference) => ({
      id: reference.id,
      text: reference.title.trim() === '' ? 'Referencia sin título' : reference.title.trim(),
      hint: referenceOptionHint(reference),
      alreadyCited: citedIds.has(reference.id),
    }))
    .sort((a, b) => a.text.localeCompare(b.text, 'es', { sensitivity: 'base' }) || a.id.localeCompare(b.id))
}

/**
 * The options the typing reaches, best first and capped.
 *
 * Capped because this list sits inside a bottom sheet on a phone: past half a
 * dozen rows the cataloger scrolls a panel instead of reading an answer, and
 * typing one more letter is faster than scrolling. The empty query keeps the
 * caller's order, which is why `referenceOptions` sorts.
 */
export function searchReferenceOptions(
  references: readonly ReferenceRow[],
  citedIds: ReadonlySet<string>,
  query: string,
  limit = 6,
): RankedItem<ReferenceOption>[] {
  const offered = referenceOptions(references, citedIds)
  // Ranking runs over the WHOLE searchable text of the reference, while the
  // emphasis lands on the option's title, so a match on the journal or on the
  // year has to leave the title unmarked instead of marking arbitrary letters
  // of it.
  const byId = new Map(references.map((reference) => [reference.id, reference]))
  return fuzzyRankBy(offered, (option) => {
    const reference = byId.get(option.id)
    return reference === undefined ? option.text : referenceSearchText(reference)
  }, query)
    .slice(0, limit)
    .map(({ item, indices }) => ({
      item,
      indices: indices.filter((index) => index < item.text.length),
    }))
}

/**
 * The minimum a new reference needs. Deliberately short: this panel exists so a
 * citation gets recorded with the artwork in front of you, not so a bibliographic
 * record gets finished — the editors, the BibTeX handle and the rest are fields
 * of the reference's own screen (RF-309).
 */
export interface ReferenceDraft {
  title: string
  authors: string
  /** Journal or volume containing the text. Without it the journal ends up inside the title. */
  containerTitle: string
  year: number | null
  publicationTypeId: string | null
  publisher: string
  place: string
}

export const EMPTY_REFERENCE_DRAFT: ReferenceDraft = {
  title: '',
  authors: '',
  containerTitle: '',
  year: null,
  publicationTypeId: null,
  publisher: '',
  place: '',
}

/**
 * What is missing before the reference can be written, in Spanish, or null when
 * nothing is.
 *
 * Only what the DATABASE will refuse is checked, and with the same limits: a
 * blank title (`bibliography_title_not_blank`) and a year outside the plausible
 * window (`bibliography_plausible_year`). Checking more would invent
 * requirements the catalogue does not have — an unsigned, undated press cutting
 * with nothing but a title is a perfectly good reference — and checking less
 * would send the cataloger a message written for a programmer.
 */
export function newReferenceProblem(draft: ReferenceDraft): string | null {
  if (draft.title.trim() === '') return 'Escribe el título de la referencia'
  if (draft.year != null && (draft.year < MIN_REFERENCE_YEAR || draft.year > MAX_REFERENCE_YEAR)) {
    return `El año de publicación tiene que estar entre ${MIN_REFERENCE_YEAR} y ${MAX_REFERENCE_YEAR}`
  }
  return null
}

/**
 * The row to insert into `bibliography`, trimmed.
 *
 * The optional columns go as null and never as an empty string: `bibtex_key` is
 * unique and a second empty one would collide, and a null
 * `publication_type_id` is «nobody has classified it», which is not the same as
 * the «Otro» entry of the vocabulary.
 */
export function newReferencePayload(draft: ReferenceDraft) {
  return {
    title: draft.title.trim(),
    authors: draft.authors.trim(),
    container_title: draft.containerTitle.trim(),
    publisher: draft.publisher.trim(),
    place: draft.place.trim(),
    year: draft.year,
    publication_type_id: draft.publicationTypeId,
  }
}

/**
 * The reference already in the catalogue that this draft would duplicate, if
 * there is one.
 *
 * Title and year, compared without capitals or accents. Two rows for the same
 * book are the worst thing that can happen to a bibliography: the citations of
 * one artwork end up under one of them and those of the next under the other,
 * and the block «Obras citadas» of each (RF-506) shows half the truth for ever.
 *
 * The year is part of the comparison and not ignored, because two editions of the
 * same title ARE two references — a 1985 catalogue and its 2003 reissue paginate
 * differently, and the page is the point of the citation.
 *
 * RETIRED references count as duplicates too, and that is the uncomfortable half
 * of the rule: the reference is in the trash (RF-901), it is not offered in the
 * search, and writing the same title again is exactly how the twin nobody wants
 * gets created. So the retired one is reused — the citation is real and the record
 * says out loud that its reference is withdrawn (see `citationView`) — and it is
 * NOT quietly restored from here: putting a withdrawn row back into use is a
 * decision of the reference's own screen (RF-309), not a side effect of citing.
 * `equivalentReferenceNotice` is what says so before it happens.
 */
export function equivalentReference(
  references: readonly ReferenceRow[],
  draft: ReferenceDraft,
): ReferenceRow | undefined {
  const title = normalizeForSearch(draft.title)
  if (title === '') return undefined
  return references.find(
    (reference) =>
      normalizeForSearch(reference.title) === title && (reference.year ?? null) === draft.year,
  )
}

/**
 * What the panel says when the reference being written already exists.
 *
 * Two sentences and not one, because the two cases are not the same act: reusing
 * a live reference is the ordinary, invisible good outcome, while reusing a
 * RETIRED one hands the cataloger a citation that will show a warning she did not
 * ask for. Saying it beforehand is the difference between a screen that helps and
 * one that surprises.
 */
export function equivalentReferenceNotice(twin: ReferenceRow): string {
  const title = twin.title.trim() === '' ? 'Referencia sin título' : twin.title.trim()
  if (twin.active) {
    return (
      `Ya hay una referencia con ese título y ese año: «${title}». Se usará esa en vez de crear ` +
      'una segunda: dos filas para el mismo libro parten en dos las citas del catálogo.'
    )
  }
  return (
    `Ya hay una referencia con ese título y ese año, «${title}», y está retirada del catálogo. ` +
    'Se citará esa igualmente, y la cita avisará de que está en la papelera. Recupérala desde su propia ficha.'
  )
}

/**
 * What the chooser says instead of an empty list, which it never is (RF-304).
 *
 * Three situations that look identical — a panel with no rows in it — and mean
 * different things, and telling the cataloger the wrong one costs her the
 * afternoon: the catalogue holds no references at all, or it holds them and every
 * one is withdrawn, or it holds usable ones and none matches what she typed. The
 * third is the only one where typing something else helps, so it is the only one
 * that says so.
 *
 * References this artwork already cites are NOT part of this count: they stay in
 * the list, marked (see `referenceOptions`), so they are never the reason it is
 * empty.
 */
export function noReferenceOptionsText(offered: number, total: number, query: string): string {
  if (total === 0) {
    return (
      'El catálogo todavía no tiene ninguna referencia bibliográfica. La primera se añade aquí ' +
      'mismo.'
    )
  }
  if (offered === 0) {
    return (
      'Todas las referencias están retiradas. Escribe la que necesites, o recupérala desde su ficha.'
    )
  }
  const typed = query.trim()
  return typed === ''
    ? 'Ninguna referencia del catálogo se puede ofrecer ahora mismo.'
    : `Ninguna referencia coincide con «${typed}».`
}
