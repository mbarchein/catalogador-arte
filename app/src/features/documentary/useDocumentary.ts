/**
 * The reads of the documentary catalogue: one query per area, plus the small one
 * that brings the four research statuses of the artwork.
 *
 * **One query per block and not one big join.** The record already pays for its
 * own load, its gallery and its sequence, and these five blocks are secondary to
 * all of that: joining them into a single request would make every one of them
 * wait for the slowest, and a failure in any of them would blank the other four.
 * Separate, each block loads, fails and reloads on its own — which is also how
 * the five sections get built by five different hands without touching each
 * other.
 *
 * **They do load on mount, not on opening the block.** It is tempting to defer
 * the query until the cataloger expands the section, and it would be wrong: the
 * heading of a COLLAPSED block has to say how many rows it holds, because that
 * count is the only thing she reads before deciding whether to open it. The
 * count is the data. What keeps this cheap is that these are five small,
 * independent, parallel requests over a handful of rows each.
 *
 * **No Realtime.** `useLiveChanges` only knows `artworks` and `images`, and
 * widening it belongs to whoever owns `lib/live.ts`. Nothing here changes under
 * the cataloger's hands the way a photograph uploaded from another phone does:
 * these rows are written from a desk, one at a time, by the person reading them.
 * Every mutation the sections make ends in `reload()`.
 *
 * The shaping and the sorting are NOT here: they are pure and they live in
 * `documentaryRows.ts`, where the battery can reach them.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { ResearchStatus } from '../../lib/types'
import type { ResearchStatusField } from './sections'
import {
  ARTWORK_DOCUMENTARY_COLUMNS,
  CITATION_COLUMNS,
  DOCUMENT_LINK_COLUMNS,
  EXHIBITION_DOCUMENT_LINK_COLUMNS,
  PARTICIPATION_COLUMNS,
  PROVENANCE_COLUMNS,
  RELATIONSHIP_COLUMNS,
  sortCitations,
  sortDocumentLinks,
  sortParticipations,
  sortProvenance,
  type ArtworkDocumentaryRow,
  type CitationRow,
  type DocumentLinkRow,
  type ExhibitionDocumentLinkRow,
  type ParticipationRow,
  type ProvenanceEventRow,
  type RelationshipRow,
} from './documentaryRows'

/**
 * What every block gets back. Identical across the five so the sections can be
 * written against one shape, and so a sixth block later is a copy of any of them.
 *
 * `error` carries the database's own message, untranslated: the sentence the
 * cataloger reads is built by the component around it (see `DocumentarySection`),
 * which is the only place that knows this is a block of a record and not a
 * background task.
 */
export interface DocumentaryQuery<R> {
  rows: R[]
  loading: boolean
  error: string | null
  reload: () => Promise<void>
}

/** What a PostgREST call answers, reduced to what this file uses. */
type QueryAnswer = { data: unknown; error: { message: string } | null }
type Loader = (catalogId: string) => PromiseLike<QueryAnswer>

/**
 * The body the five hooks share.
 *
 * `load` and `shape` must be stable references — they are declared at module
 * scope below — because they are dependencies of `reload`, and rebuilding them
 * on every render would turn the effect into an infinite loop of queries.
 *
 * On failure the rows are CLEARED, not kept. Keeping them looks kinder and is
 * dangerous: the previous artwork's citations under this artwork's heading is
 * exactly the kind of mistake a catalogue raisonné cannot afford, and the record
 * has no way to tell the cataloger which rows are stale. An error says so and
 * shows nothing.
 */
function useDocumentaryRows<R>(
  catalogId: string,
  load: Loader,
  shape: (rows: readonly unknown[]) => R[],
): DocumentaryQuery<R> {
  const [rows, setRows] = useState<R[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  // Answers that arrive after the record has moved on are dropped: swiping
  // through the catalogue leaves a query in flight per block per record.
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  const reload = useCallback(async () => {
    setLoading(true)
    const { data, error: failure } = await load(catalogId)
    if (!alive.current) return
    setLoading(false)
    if (failure) {
      setError(failure.message)
      setRows([])
      return
    }
    setError(null)
    setRows(shape((data ?? []) as readonly unknown[]))
  }, [catalogId, load, shape])

  useEffect(() => {
    void reload()
  }, [reload])

  return { rows, loading, error, reload }
}

// ── The five areas ───────────────────────────────────────────

const loadProvenance: Loader = (catalogId) =>
  supabase
    .from('provenance_events')
    .select(PROVENANCE_COLUMNS)
    .eq('catalog_id', catalogId)
    // The bridge row's own `active`: a retired link is in the trash (RF-901) and
    // the record does not show it. The PARTY behind an active link is loaded
    // whatever its state — see documentaryRows.ts.
    .eq('active', true)
    .order('position', { ascending: true })

const shapeProvenance = (rows: readonly unknown[]) =>
  sortProvenance(rows as readonly ProvenanceEventRow[])

/** The chain of provenance of an artwork (RF-509), in the order the cataloger arranged. */
export function useProvenanceEvents(catalogId: string): DocumentaryQuery<ProvenanceEventRow> {
  return useDocumentaryRows(catalogId, loadProvenance, shapeProvenance)
}

const loadCitations: Loader = (catalogId) =>
  supabase
    .from('artwork_bibliography')
    .select(CITATION_COLUMNS)
    .eq('catalog_id', catalogId)
    .eq('active', true)

const shapeCitations = (rows: readonly unknown[]) => sortCitations(rows as readonly CitationRow[])

/** Where this artwork is published (RF-504), oldest first and the undated last. */
export function useArtworkBibliography(catalogId: string): DocumentaryQuery<CitationRow> {
  return useDocumentaryRows(catalogId, loadCitations, shapeCitations)
}

const loadParticipations: Loader = (catalogId) =>
  supabase
    .from('artwork_exhibitions')
    .select(PARTICIPATION_COLUMNS)
    .eq('catalog_id', catalogId)
    .eq('active', true)

const shapeParticipations = (rows: readonly unknown[]) =>
  sortParticipations(rows as readonly ParticipationRow[])

/** Where this artwork has been shown (RF-501), in ascending chronological order (RF-502). */
export function useArtworkExhibitions(catalogId: string): DocumentaryQuery<ParticipationRow> {
  return useDocumentaryRows(catalogId, loadParticipations, shapeParticipations)
}

const loadDocumentLinks: Loader = (catalogId) =>
  supabase
    .from('artwork_documents')
    .select(DOCUMENT_LINK_COLUMNS)
    .eq('catalog_id', catalogId)
    .eq('active', true)

const shapeDocumentLinks = (rows: readonly unknown[]) =>
  sortDocumentLinks(rows as readonly DocumentLinkRow[])

/** The archive documents about this artwork (RF-516), oldest first. */
export function useArtworkDocuments(catalogId: string): DocumentaryQuery<DocumentLinkRow> {
  return useDocumentaryRows(catalogId, loadDocumentLinks, shapeDocumentLinks)
}

const loadExhibitionDocuments: Loader = (exhibitionId) =>
  supabase
    .from('exhibition_documents')
    .select(EXHIBITION_DOCUMENT_LINK_COLUMNS)
    .eq('exhibition_id', exhibitionId)
    .eq('active', true)

const shapeExhibitionDocuments = (rows: readonly unknown[]) =>
  sortDocumentLinks(rows as readonly ExhibitionDocumentLinkRow[])

/**
 * The archive documents about this exhibition (RF-516), oldest first.
 *
 * The other end of the same bridge as `useArtworkDocuments`, and the same ordering: a
 * press cutting speaks about the show and about the artwork that appeared in it, and it
 * is one document with two links, not two copies of a scan.
 */
export function useExhibitionDocuments(
  exhibitionId: string,
): DocumentaryQuery<ExhibitionDocumentLinkRow> {
  return useDocumentaryRows(exhibitionId, loadExhibitionDocuments, shapeExhibitionDocuments)
}

/**
 * BOTH ends in one query, and it has to be both: a symmetric relationship is
 * stored once, canonicalised with the smaller code first, so half the pairs name
 * this artwork in `to_catalog_id`. Querying one column would show the record half
 * of its own relationships and give no hint that the other half exists.
 *
 * The interpolation is safe by shape — a `catalog_id` is `AR-0042`, letters,
 * digits and a hyphen, checked by the database — and it is the only filter of
 * this feature that cannot go through `.eq()`.
 */
const loadRelationships: Loader = (catalogId) =>
  supabase
    .from('artwork_relationships')
    .select(RELATIONSHIP_COLUMNS)
    .or(`from_catalog_id.eq.${catalogId},to_catalog_id.eq.${catalogId}`)
    .eq('active', true)

// Ordering needs to know WHICH artwork is reading the row, so it is not done
// here: the section calls `relationshipViews(rows, catalogId)`.
const shapeRelationships = (rows: readonly unknown[]) => rows as RelationshipRow[]

/** The artworks related to this one (RF-217), read from both ends of each pair. */
export function useArtworkRelationships(catalogId: string): DocumentaryQuery<RelationshipRow> {
  return useDocumentaryRows(catalogId, loadRelationships, shapeRelationships)
}

// ── The documentary columns of the artwork ───────────────────

export interface ArtworkDocumentaryQuery {
  /** Null while loading, and when the row could not be read. */
  documentary: ArtworkDocumentaryRow | null
  loading: boolean
  error: string | null
  reload: () => Promise<void>
  /**
   * Declares how far the research on one block has got (RF-218). Answers null
   * when it worked, and the database's own message when it did not.
   *
   * That message is worth showing verbatim: the database refuses to declare
   * «Investigado, sin resultados» over a block that has rows, and it says why in
   * Spanish. Rewriting the refusal here would be a second copy of a rule that
   * lives next to the data.
   */
  setResearchStatus: (field: ResearchStatusField, value: ResearchStatus) => Promise<string | null>
}

/**
 * The eight documentary columns of the artwork: the publishable provenance
 * narrative (RF-510), the rights holder (RF-511) and the four research statuses
 * (RF-218).
 *
 * One query for the five blocks, because it is one row: five requests for the
 * same row would be four too many, and the statuses are read by every heading.
 */
export function useArtworkDocumentary(catalogId: string): ArtworkDocumentaryQuery {
  const [documentary, setDocumentary] = useState<ArtworkDocumentaryRow | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  const reload = useCallback(async () => {
    setLoading(true)
    const { data, error: failure } = await supabase
      .from('artworks')
      .select(ARTWORK_DOCUMENTARY_COLUMNS)
      .eq('catalog_id', catalogId)
      .maybeSingle()
    if (!alive.current) return
    setLoading(false)
    if (failure) {
      setError(failure.message)
      setDocumentary(null)
      return
    }
    setError(null)
    setDocumentary((data as ArtworkDocumentaryRow | null) ?? null)
  }, [catalogId])

  useEffect(() => {
    void reload()
  }, [reload])

  const setResearchStatus = useCallback(
    async (field: ResearchStatusField, value: ResearchStatus): Promise<string | null> => {
      const { error: failure } = await supabase
        .from('artworks')
        .update({ [field]: value })
        .eq('catalog_id', catalogId)
      if (failure) return failure.message
      await reload()
      return null
    },
    [catalogId, reload],
  )

  return { documentary, loading, error, reload, setResearchStatus }
}
