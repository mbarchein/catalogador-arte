/**
 * The whole archive, and one record of it with what hangs from it (RF-515, RF-516).
 *
 * **Loaded whole and searched in the client**, for the same reason as the bibliography and the
 * exhibitions: they are tens or hundreds of documents, not hundreds of thousands, and a small
 * query answers every keystroke with no round trip — which is what makes the
 * search usable with poor coverage. The day the table grows, the search goes to the
 * server and the pure ranking stays where it is.
 *
 * **The withdrawn ones are loaded and the screen hides them**: the RLS decides what arrives, so
 * for a Cataloguer the list brings the wastebasket, which is the only place from which
 * a withdrawn document can come back. The filter is the index's decision, where it is pure.
 *
 * No writes: uploading a document and linking it belongs to an artwork's record —that way it
 * ends up uploaded and linked in one go—, and correcting it too. These screens are for
 * finding it and reading it, which was what could not be done.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { describeDocumentRefusal } from '../documentary/documents/documentDraft'
import type { DocumentOption } from '../documentary/documents/documentLink'
import type { DocumentRow } from '../documentary/documentaryRows'
import { DOCUMENT_INDEX_COLUMNS } from './documentIndex'
import {
  DOCUMENT_RECORD_COLUMNS,
  LINKED_ARTWORK_COLUMNS,
  LINKED_EXHIBITION_COLUMNS,
  type LinkedArtworkRow,
  type LinkedExhibitionRow,
} from './documentRecord'

export interface ArchiveIndexQuery {
  documents: DocumentOption[]
  loading: boolean
  error: string | null
  reload: () => Promise<void>
}

/** A `ref` saying whether the component is still mounted. The same pattern as the rest. */
function useAlive() {
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])
  return alive
}

/**
 * @param enabled False asks for NOTHING. An exhibition's record loads the archive's whole
 *   catalogue only when it is going to offer it for linking (RF-516): that screen is opened
 *   many times just to read the show, and whoever only reads has no reason to pay
 *   for the document list. True by default, which is what the archive's index
 *   and an artwork's documentation need. Same parameter and same reason as in
 *   `useExhibitions` and `useReferences`.
 */
export function useArchiveIndex(enabled = true): ArchiveIndexQuery {
  const [documents, setDocuments] = useState<DocumentOption[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const alive = useAlive()

  const reload = useCallback(async () => {
    if (!enabled) {
      setLoading(false)
      return
    }
    // It is asked for again on going from off to on, and the wait has to be visible: without
    // this the selector would read «there is no document yet» while the first
    // query is in the air.
    setLoading(true)
    const { data, error: failure } = await supabase
      .from('archive_documents')
      .select(DOCUMENT_INDEX_COLUMNS)
    if (!alive.current) return
    setLoading(false)
    if (failure) {
      setError(describeDocumentRefusal('load', failure))
      return
    }
    setError(null)
    // No `order`: the index's order is the shelf's —the normalized reference as the unique
    // index compares it— and is decided in `sortArchiveDocuments`.
    setDocuments((data ?? []) as unknown as DocumentOption[])
  }, [alive, enabled])

  useEffect(() => {
    void reload()
  }, [reload])

  return { documents, loading, error, reload }
}

export interface DocumentRecordQuery {
  /** The document, or null while loading and when that address is not one. */
  document: DocumentRow | null
  artworks: LinkedArtworkRow[]
  exhibitions: LinkedExhibitionRow[]
  loading: boolean
  /** A failure while reading the document. */
  error: string | null
  /** A failure reading what hangs off it: the record reads the same, and the block says so. */
  linksError: string | null
  reload: () => Promise<void>
}

/**
 * An archive record with its two lists of links.
 *
 * Three queries in parallel and not one with two embeddings: PostgREST would bring them in
 * a single trip, but a failure in either of the two bridges would leave you with no record. This way
 * the document is read even if a block does not load, and the block says what is wrong with it.
 */
export function useDocumentRecord(id: string): DocumentRecordQuery {
  const [document, setDocument] = useState<DocumentRow | null>(null)
  const [artworks, setArtworks] = useState<LinkedArtworkRow[]>([])
  const [exhibitions, setExhibitions] = useState<LinkedExhibitionRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [linksError, setLinksError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const alive = useAlive()

  const reload = useCallback(async () => {
    if (id === '') {
      setLoading(false)
      return
    }
    const [row, links, shows] = await Promise.all([
      supabase.from('archive_documents').select(DOCUMENT_RECORD_COLUMNS).eq('id', id).maybeSingle(),
      supabase.from('artwork_documents').select(LINKED_ARTWORK_COLUMNS).eq('document_id', id),
      supabase.from('exhibition_documents').select(LINKED_EXHIBITION_COLUMNS).eq('document_id', id),
    ])
    if (!alive.current) return
    setLoading(false)

    if (row.error) setError(describeDocumentRefusal('load', row.error))
    else {
      setError(null)
      setDocument((row.data ?? null) as unknown as DocumentRow | null)
    }

    const linkFailure = links.error ?? shows.error
    setLinksError(linkFailure ? describeDocumentRefusal('load', linkFailure) : null)
    if (!links.error) setArtworks((links.data ?? []) as unknown as LinkedArtworkRow[])
    if (!shows.error) setExhibitions((shows.data ?? []) as unknown as LinkedExhibitionRow[])
  }, [id, alive])

  useEffect(() => {
    void reload()
  }, [reload])

  return { document, artworks, exhibitions, loading, error, linksError, reload }
}
