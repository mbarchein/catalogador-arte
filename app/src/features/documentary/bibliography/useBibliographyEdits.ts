/**
 * Writing the bibliography of an artwork: the catalogue of references it can be
 * cited in, and the four operations the block offers over them.
 *
 * Reading is not here — that is `useArtworkBibliography` in the foundations, one
 * query per block. This is the other half, and it is a separate hook because the
 * whole master list of references is only needed by whoever is ADDING a citation:
 * a Reader opening the record never pays for it.
 *
 * Every mutation ends in the caller's `reload()`. These rows are not live
 * (`useLiveChanges` knows `artworks` and `images` only), and they do not need to
 * be: they are written from a desk, one at a time, by the person reading them.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import type { MasterRef, ReferenceRow } from '../documentaryRows'
import {
  REFERENCE_COLUMNS,
  newReferencePayload,
  type ReferenceDraft,
} from './referenceChoice'

const PUBLICATION_TYPE_COLUMNS = 'id, name, active'

export interface BibliographyEdits {
  /** Every reference of the catalogue, retired ones included (see REFERENCE_COLUMNS). */
  references: ReferenceRow[]
  /** The publication-type vocabulary (RF-514), retired entries included. */
  publicationTypes: MasterRef[]
  loading: boolean
  /** The database's own message. The Spanish frame around it is the panel's job. */
  error: string | null
  reload: () => Promise<void>
  /**
   * Cites this artwork in a reference (RF-504). Answers null when it worked and
   * the database's message when it did not.
   *
   * It goes through the `cite_artwork` RPC and NOT through a plain insert, and
   * that is not a style choice: the unique constraint covers retired rows too, so
   * a plain insert of a citation that is in the trash fails with a duplicate-key
   * error instead of bringing it back. The function restores it, keeping the page
   * that was already researched when the new one comes in blank (RF-517).
   */
  cite: (referenceId: string, pages: string, note: string) => Promise<string | null>
  /**
   * Writes a new reference into the catalogue and answers its identifier, or the
   * database's message. It does NOT cite anything: the caller decides, because a
   * reference that gets created and then fails to be cited must still exist.
   */
  createReference: (draft: ReferenceDraft) => Promise<{ id: string } | { error: string }>
  /** Corrects the page or the note of a citation already recorded. */
  updateCitation: (id: string, pages: string, note: string) => Promise<string | null>
  /**
   * Takes a citation out of the record, or brings it back. Logical deletion
   * (RF-901): the row stays, with who did it and when, and the reference is never
   * touched — it is shared with every other artwork that cites it.
   */
  setCitationActive: (id: string, active: boolean) => Promise<string | null>
}

/**
 * The catalogue of references, the publication types, and the four writes.
 *
 * The two lists load together on mount, and only when `enabled` — the caller
 * passes `canEdit`, because a Reader never opens either panel and these are two
 * requests per record over mobile data. They are small (a catalogue raisonné of
 * this size ends with a few hundred references) and they are what the «Añadir»
 * panel needs the instant it opens: fetching them when the sheet opens would put
 * a spinner between the cataloger's thumb and the search field.
 */
export function useBibliographyEdits(catalogId: string, enabled: boolean): BibliographyEdits {
  const [references, setReferences] = useState<ReferenceRow[]>([])
  const [publicationTypes, setPublicationTypes] = useState<MasterRef[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  // Answers arriving after the record has moved on are dropped: swiping through
  // the catalogue leaves a query in flight per record.
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  const reload = useCallback(async () => {
    // Whoever only reads never pays for the catalogue of references: it is two
    // requests per record, over mobile data, for two panels they will not open.
    if (!enabled) {
      setLoading(false)
      return
    }
    setLoading(true)
    const [refs, types] = await Promise.all([
      supabase.from('bibliography').select(REFERENCE_COLUMNS),
      supabase.from('publication_types').select(PUBLICATION_TYPE_COLUMNS),
    ])
    if (!alive.current) return
    setLoading(false)
    const failure = refs.error ?? types.error
    if (failure) {
      setError(failure.message)
      setReferences([])
      setPublicationTypes([])
      return
    }
    setError(null)
    setReferences((refs.data ?? []) as unknown as ReferenceRow[])
    setPublicationTypes(
      ((types.data ?? []) as MasterRef[])
        .slice()
        // es-ES here and not in the query: the database's collation can sort
        // «Álbum» past the z.
        .sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' })),
    )
  }, [enabled])

  useEffect(() => {
    void reload()
  }, [reload])

  const cite = useCallback(
    async (referenceId: string, pages: string, note: string): Promise<string | null> => {
      const { error: failure } = await supabase.rpc('cite_artwork', {
        p_catalog_id: catalogId,
        p_bibliography_id: referenceId,
        p_pages: pages.trim(),
        p_note: note.trim(),
      })
      return failure ? failure.message : null
    },
    [catalogId],
  )

  const createReference = useCallback(
    async (draft: ReferenceDraft): Promise<{ id: string } | { error: string }> => {
      const { data, error: failure } = await supabase
        .from('bibliography')
        .insert(newReferencePayload(draft))
        .select('id')
        .single()
      if (failure) return { error: failure.message }
      await reload()
      return { id: (data as { id: string }).id }
    },
    [reload],
  )

  const updateCitation = useCallback(
    async (id: string, pages: string, note: string): Promise<string | null> => {
      const { error: failure } = await supabase
        .from('artwork_bibliography')
        .update({ pages: pages.trim(), note: note.trim() })
        .eq('id', id)
      return failure ? failure.message : null
    },
    [],
  )

  const setCitationActive = useCallback(
    async (id: string, active: boolean): Promise<string | null> => {
      const { error: failure } = await supabase
        .from('artwork_bibliography')
        .update({ active })
        .eq('id', id)
      return failure ? failure.message : null
    },
    [],
  )

  return {
    references,
    publicationTypes,
    loading,
    error,
    reload,
    cite,
    createReference,
    updateCitation,
    setCitationActive,
  }
}
