/**
 * The record of an archive document, with the artworks AND the exhibitions that have it
 * linked (RF-309, RF-515, RF-516, RF-609).
 *
 * Pure and without React: the suite runs in node, so the blocks' order, what
 * each line says and what is read where there are no rows are verified here.
 *
 * ── TWO BLOCKS, AND NOT ONE ─────────────────────────────────
 *
 * It is the difference from a bibliographic reference's record, which only looks at the
 * artworks. **A document's relationship is many-to-many with the artworks and with the
 * exhibitions** (RF-516): a press clipping speaks of three pieces, and a leaflet or
 * a press release hang from the show and from no piece in particular. Merging the
 * two blocks into one list would mix cataloguing codes with exhibition titles
 * in the same column, and the document that only hangs from a show —which is the case
 * that made this screen necessary— would come out under a heading that says «obras».
 *
 * And they are two real bridge tables, each with its own note: what a poster says
 * about the exhibition is not what it says about one of its artworks.
 */

import type { ArtworkDocument, ExhibitionDocument } from '../../lib/types'
import { displayExhibitionDates } from '../documentary/documentaryFormat'
import type { ArtworkRef } from '../documentary/documentaryRows'

/**
 * The record's columns: the whole document with its two master tables embedded.
 *
 * They are the same ones the artwork record's block already asks for —the document embedded in
 * `DOCUMENT_LINK_COLUMNS`— written here because there they go inside a `document:(…)` and
 * this query asks for them at table level. It is the same list of names and the same
 * criterion: the record needs the twelve columns the correction form writes.
 */
export const DOCUMENT_RECORD_COLUMNS =
  'id, archive_code, artist_fund, document_type_id, title, archive_series_id, ' +
  'start_year, end_year, approximate_date, unconfirmed_date, date_note, date_text, ' +
  'physical_place_id, file_path, file_size_bytes, mime_type, uploaded_at, note, active, ' +
  'document_type:document_types(id, name, active), ' +
  'archive_series:archive_series(id, parent_id, name, active)'

/** The artwork that has the document linked: the bridge row plus the artwork. */
export interface LinkedArtworkRow extends ArtworkDocument {
  /** Null when the artwork cannot be read. The row stays and says so. */
  artwork: ArtworkRef | null
}

export const LINKED_ARTWORK_COLUMNS =
  'id, catalog_id, document_id, note, active, ' +
  'artwork:artworks(catalog_id, title, artist, execution_date, active)'

/** The least of an exhibition needed to name it in a list: the title and when it was. */
export interface ExhibitionBrief {
  id: string
  title: string
  year: number | null
  start_date: string | null
  end_date: string | null
  date_note: string
  active: boolean
}

/** The exhibition that has the document linked: the bridge row plus the exhibition. */
export interface LinkedExhibitionRow extends ExhibitionDocument {
  exhibition: ExhibitionBrief | null
}

export const LINKED_EXHIBITION_COLUMNS =
  'id, exhibition_id, document_id, note, active, ' +
  'exhibition:exhibitions(id, title, year, start_date, end_date, date_note, active)'

function written(text: string | null | undefined): string | null {
  const clean = (text ?? '').trim()
  return clean === '' ? null : clean
}

// ── The artworks that have it linked ─────────────────────────

export interface LinkedArtworkView {
  /** The bridge row. */
  id: string
  catalogId: string
  title: string
  /** What this document says about THAT artwork. */
  note: string | null
  retired: boolean
  unavailable: boolean
  linked: boolean
}

/**
 * The order: by cataloguing identifier, like a reference's block of cited artworks and
 * for the same reason — the document has no order of its own to impose on the
 * artworks, and what is being looked for is «is AR-0042 there?».
 */
export function linkedArtworkViews(rows: readonly LinkedArtworkRow[]): LinkedArtworkView[] {
  return rows
    // Live links only: a retired one left its artwork's record (RF-517), so counting it here
    // would make the two screens say different things.
    .filter((row) => row.active)
    .slice()
    .sort((a, b) => a.catalog_id.localeCompare(b.catalog_id))
    .map((row) => {
      const artwork = row.artwork
      if (!artwork) {
        return {
          id: row.id,
          catalogId: row.catalog_id,
          title: 'Esta obra no se puede leer desde aquí',
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
        note: written(row.note),
        retired: !artwork.active,
        unavailable: false,
        linked: true,
      }
    })
}

// ── The exhibitions that have it linked ──────────────────────

export interface LinkedExhibitionView {
  id: string
  exhibitionId: string
  title: string
  /** `12 de marzo – 4 de mayo de 1985`, or «Sin fechar». Never a gap. */
  dates: string
  /** What this document says about THAT show, which is not what it says about one of its artworks. */
  note: string | null
  retired: boolean
  unavailable: boolean
  linked: boolean
}

/**
 * The order: **from the most recent to the oldest**, the same as the exhibition
 * listing and for the same reason — a show is looked for by its year, and the one
 * in mind is more likely from this decade. The ones that cannot be read go
 * last, because there is no date to place them with.
 */
export function linkedExhibitionViews(
  rows: readonly LinkedExhibitionRow[],
): LinkedExhibitionView[] {
  return rows
    .filter((row) => row.active)
    .slice()
    .sort((a, b) => {
      const ya = a.exhibition?.year ?? null
      const yb = b.exhibition?.year ?? null
      if (ya !== yb) {
        if (ya == null) return 1
        if (yb == null) return -1
        return yb - ya
      }
      return (a.exhibition?.title ?? '').localeCompare(b.exhibition?.title ?? '', 'es', {
        sensitivity: 'base',
      }) || a.id.localeCompare(b.id)
    })
    .map((row) => {
      const exhibition = row.exhibition
      if (!exhibition) {
        return {
          id: row.id,
          exhibitionId: row.exhibition_id,
          title: 'Esta exposición no se puede leer desde aquí',
          dates: 'Sin fechar',
          note: written(row.note),
          retired: false,
          unavailable: true,
          linked: false,
        }
      }
      return {
        id: row.id,
        exhibitionId: exhibition.id,
        title: written(exhibition.title) ?? 'Exposición sin título',
        dates: displayExhibitionDates(exhibition),
        note: written(row.note),
        retired: !exhibition.active,
        unavailable: false,
        linked: true,
      }
    })
}

// ── What is read above and instead of the rows ───────────────

/**
 * What the document is hanging from, in one sentence and counting both halves.
 *
 * It is the datum this record adds and that cannot be read anywhere else: from the
 * record of an artwork only the document's hanging from THAT ONE is visible. And it is the one that turns
 * a document into a «standalone» one: zero and zero is exactly the row this listing
 * was built to be able to find.
 */
export function documentReachSummary(input: {
  artworks: number
  exhibitions: number
}): string {
  const { artworks, exhibitions } = input
  const parts: string[] = []
  if (artworks === 1) parts.push('una obra')
  else if (artworks > 1) parts.push(`${artworks} obras`)
  if (exhibitions === 1) parts.push('una exposición')
  else if (exhibitions > 1) parts.push(`${exhibitions} exposiciones`)

  if (parts.length === 0) return DOCUMENT_UNLINKED_TEXT
  return `Enlazado con ${parts.join(' y ')}.`
}

/** What is read when it hangs off nothing. */
export const DOCUMENT_UNLINKED_TEXT =
  'No lo tiene enlazado nada: ni una obra ni una exposición. Solo se llega a él desde aquí.'

/** A piece of the notice: text, or a reference to the record it hangs off. */
export type ReachSegment =
  | { kind: 'text'; text: string }
  | { kind: 'link'; text: string; to: string }

/**
 * The same warning, but **naming what is at the other end and being able to go there**.
 *
 * «Enlazado con una obra» forces one to go down to the block below to find out which
 * it is, and to go down again to get there. Naming them is what makes the sentence useful: the
 * cataloguing identifier is what is looked for —«is AR-0042 there?»— and the show's
 * title is what it is called.
 *
 * A record that cannot be read from here is named the same but **with no link**:
 * a link leading to a screen that will say it does not exist is worse than saying it
 * here. `linked` is the one that decides, and it already arrives computed in the view.
 */
export function documentReachSegments(input: {
  artworks: readonly Pick<LinkedArtworkView, 'catalogId' | 'linked'>[]
  exhibitions: readonly Pick<LinkedExhibitionView, 'exhibitionId' | 'title' | 'linked'>[]
}): ReachSegment[] {
  const { artworks, exhibitions } = input
  if (artworks.length === 0 && exhibitions.length === 0) {
    return [{ kind: 'text', text: DOCUMENT_UNLINKED_TEXT }]
  }

  const segments: ReachSegment[] = [{ kind: 'text', text: 'Enlazado con ' }]

  if (artworks.length > 0) {
    segments.push({ kind: 'text', text: artworks.length === 1 ? 'la obra ' : 'las obras ' })
    artworks.forEach((view, at) => {
      if (at > 0) segments.push({ kind: 'text', text: at === artworks.length - 1 ? ' y ' : ', ' })
      segments.push(
        view.linked
          ? { kind: 'link', text: view.catalogId, to: `/artwork/${view.catalogId}` }
          : { kind: 'text', text: view.catalogId },
      )
    })
  }

  if (artworks.length > 0 && exhibitions.length > 0) {
    segments.push({ kind: 'text', text: ', y con ' })
  }

  if (exhibitions.length > 0) {
    segments.push({
      kind: 'text',
      text: exhibitions.length === 1 ? 'la exposición ' : 'las exposiciones ',
    })
    exhibitions.forEach((view, at) => {
      if (at > 0) {
        segments.push({ kind: 'text', text: at === exhibitions.length - 1 ? ' y ' : ', ' })
      }
      const named = `«${view.title}»`
      segments.push(
        view.linked
          ? { kind: 'link', text: named, to: `/exhibitions/${view.exhibitionId}` }
          : { kind: 'text', text: named },
      )
    })
  }

  segments.push({ kind: 'text', text: '.' })
  return segments
}

/** What goes where a block's rows would go, or null when there are rows (RF-304). */
export function linkedBlockNotice(input: {
  loading: boolean
  error: string | null
  count: number
  empty: string
}): string | null {
  const { loading, error, count, empty } = input
  if (error !== null) return error
  if (loading) return 'Cargando…'
  return count > 0 ? null : empty
}

export const NO_LINKED_ARTWORKS =
  'Ninguna obra lo tiene enlazado. Se enlaza desde la documentación de una obra.'

/*
 * The exhibitions' empty block says something different from the artworks' one, and lives in
 * `exhibitionLink.ts` because they are already two sentences and not one: linking to an exhibition is
 * done on this very screen, so whoever can write reads that it is done down here and
 * whoever only consults does not read an instruction they cannot follow. They are in
 * `NO_LINKED_EXHIBITIONS_WRITABLE` and `NO_LINKED_EXHIBITIONS_READONLY`.
 */

/** What is read when the address matches no document. */
export const DOCUMENT_MISSING_TEXT =
  'Ese documento no está en el archivo. Búscalo en el listado, por si está retirado.'
