/**
 * The record of a bibliographic reference and its «Obras citadas» block
 * (RF-506, RF-309, RF-504, RF-609).
 *
 * Pure and without React: the suite runs in node, so the block's order, what
 * each line says and what is read where there are no rows are verified here or they are not
 * verified.
 *
 * ── WHAT THIS RECORD ADDS, AND WHAT IT DOES NOT ─────────────
 *
 * A reference could already be created, corrected and found. What could not be done was
 * **reading it from the other side**: which artworks of the catalogue cite it and on which of its
 * pages each one appears. That is the block RF-506 asks for, with the `catalog_id`
 * linked and each citation's pages and notes, and **with no thumbnail** — the
 * requirement says so and it has its reason: here the row answers «on which page does it appear?», which is
 * a question of text, whereas in an exhibition's record there IS a
 * thumbnail because there what is recognised is the wall.
 *
 * Correcting the data is still the same panel an artwork's record opens
 * (`ReferenceSheet`), exactly and with no second copy: a reference is corrected
 * the same from where it is cited as from its own record, or they are two forms that
 * have to agree with each other.
 */

import type { ArtworkBibliography } from '../../lib/types'
import { citationPagesText } from '../documentary/bibliography/citationFormat'
import type { ArtworkRef } from '../documentary/documentaryRows'

/**
 * A citation read FROM the reference: the bridge row plus the artwork.
 *
 * It is `CitationRow`'s mirror image, which reads it from the artwork and brings the reference
 * embedded. Two types and not one because they are two queries with two different embedded
 * ends, and merging them would give a type with two optional halves in
 * which no screen knows which one it has.
 */
export interface CitedArtworkRow extends ArtworkBibliography {
  /**
   * Null when the artwork cannot be read: it is in the wastebasket and whoever is looking only
   * consults, or a policy hides it. The row is NOT thrown away — it would silently shorten
   * the list of artworks citing the reference — and it says what is wrong with it.
   */
  artwork: ArtworkRef | null
}

export const CITED_ARTWORK_COLUMNS =
  'id, catalog_id, bibliography_id, pages, note, active, ' +
  'artwork:artworks(catalog_id, title, artist, execution_date, active)'

/**
 * The block's order: **by the cataloguing identifier**, ascending.
 *
 * Which is the catalogue raisonné's order, and here it is the right one — unlike in
 * an exhibition's block of participating artworks, where the number the piece
 * carried in the show rules because that is the walls' order. A reference
 * has no order of its own to impose on the artworks that cite it: if the book cites
 * eight pieces, what is being looked for is «is AR-0042 there?», and for that the order is the
 * code's.
 *
 * The pages do NOT order, even though it seems the natural thing in a bibliography: `pages` is
 * free text on purpose (RF-504) —«34-36», «s/p», «lám. XII»— and ordering by that
 * would put «lám. XII» before «p. 9».
 */
export function sortCitedArtworks(rows: readonly CitedArtworkRow[]): CitedArtworkRow[] {
  return rows.slice().sort((a, b) => a.catalog_id.localeCompare(b.catalog_id))
}

/** One row of the block, ready to paint. */
export interface CitedArtworkView {
  /** The bridge row: what withdrawing the citation would act upon. */
  id: string
  catalogId: string
  /** The artwork's title, or what is said when it cannot be read. Never a gap. */
  title: string
  /** `pág. 34`, `págs. 34-36`, `lám. XII`… or null when nobody has noted it. */
  pages: string | null
  /** What the citation says about this artwork in particular. */
  note: string | null
  /** The artwork is in the wastebasket, behind a citation that is not (RF-901). */
  retired: boolean
  /** The artwork cannot be read: the row stays and says so. */
  unavailable: boolean
  /** Whether the row leads anywhere. An artwork that cannot be read is not linked. */
  linked: boolean
}

function written(text: string | null | undefined): string | null {
  const clean = (text ?? '').trim()
  return clean === '' ? null : clean
}

export function citedArtworkView(row: CitedArtworkRow): CitedArtworkView {
  const artwork = row.artwork
  if (!artwork) {
    return {
      id: row.id,
      catalogId: row.catalog_id,
      // The code IS shown, because it is on the bridge row and it is real: what is not
      // shown is anything of the artwork, so as not to invent what cannot be read.
      title: 'Esta obra no se puede leer desde aquí',
      pages: citationPagesText(row.pages),
      note: written(row.note),
      retired: false,
      unavailable: true,
      linked: false,
    }
  }
  return {
    id: row.id,
    catalogId: artwork.catalog_id,
    title: written(artwork.title) ?? 'Obra sin título',
    pages: citationPagesText(row.pages),
    note: written(row.note),
    retired: !artwork.active,
    unavailable: false,
    linked: true,
  }
}

/**
 * The block's rows. **Only the live citations**: a withdrawn citation left its
 * artwork's history (RF-901), so showing it here would count a citation the
 * artwork's record no longer counts, and the two screens would say different things about the
 * same fact.
 */
export function citedArtworkViews(rows: readonly CitedArtworkRow[]): CitedArtworkView[] {
  return sortCitedArtworks(rows.filter((row) => row.active)).map(citedArtworkView)
}

/**
 * What is read above the block, or null when it is not needed.
 *
 * It says how many artworks cite it, which is the datum that turns this record into something more
 * than a copy of the row: a reference citing nine pieces is the catalogue of
 * a show, and one citing none is a candidate for having been left standing alone.
 */
export function citedArtworksSummary(views: readonly CitedArtworkView[]): string | null {
  if (views.length === 0) return null
  return views.length === 1 ? 'La cita una obra del catálogo.' : `La citan ${views.length} obras del catálogo.`
}

/**
 * What goes where the rows would go when there are none (RF-304).
 *
 * **And the sentence that matters is the empty block's**: a reference with no citation at all
 * is neither an error nor a datum pending research, it is exactly the row this
 * listing was built to be able to find. So what it is and what to do
 * with it is said, instead of leaving the gap that reads as «something is missing here».
 */
export function citedArtworksNotice(input: {
  loading: boolean
  error: string | null
  count: number
}): string | null {
  const { loading, error, count } = input
  if (error !== null) return error
  if (loading) return 'Cargando las obras que la citan…'
  if (count > 0) return null
  return (
    'Ninguna obra la cita ahora mismo. Se cita desde la bibliografía de cualquier obra.'
  )
}

/** What is read when the address matches no reference. */
export const REFERENCE_MISSING_TEXT =
  'Esa referencia no está en el catálogo. Búscala en el listado, por si está retirada.'
