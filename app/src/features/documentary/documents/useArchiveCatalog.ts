/**
 * What the two panels of this block need to read before they can write: the
 * archive, and the three master tables a document points at.
 *
 * **Nothing is asked for until a panel opens.** `enabled` false makes this hook
 * silent, and that is not an optimisation: `DocumentsSection` is mounted inside
 * every record of the catalogue, and four queries per record — for a chooser that
 * opens on a tap and only in the edit zone — would be four requests on every
 * artwork the cataloger swipes through. `useParties` already settled this shape.
 *
 * **Four queries and not one join.** They are four independent master tables of a
 * handful of rows each; joined, the chooser would wait for the slowest and a
 * failure in the places would blank the list of documents. Separate, each one
 * fails on its own and the form says what it could not load instead of hiding a
 * field (RF-304).
 *
 * **Retired rows come back.** A document points at a type, a series or a place that
 * may have been withdrawn, and the form has to be able to SHOW it — hiding it would
 * leave a blank where a name used to be, which is the one thing this application
 * does not do. Who refuses to OFFER a retired row is whoever paints the list, not
 * this hook: the pickers filter on `active` and the chooser drops retired
 * documents (`rankDocumentOptions`).
 *
 * The shaping is not here: the trees are built by `buildPlaceTree` and
 * `buildSeriesTree`, which are pure and already tested where they live.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { buildPlaceTree, type PlaceTree } from '../../../lib/places'
import { supabase } from '../../../lib/supabase'
import type { ArchiveSeries, DocumentTypeEntry, PhysicalPlace } from '../../../lib/types'
import { buildSeriesTree, type SeriesTree } from '../../tables/archiveSeries'
import { describeDocumentRefusal } from './documentDraft'
import { DOCUMENT_OPTION_COLUMNS, type DocumentOption } from './documentLink'

export interface ArchiveCatalogQuery {
  /** Every document of the archive, retired included. The chooser drops the retired. */
  documents: DocumentOption[]
  documentTypes: DocumentTypeEntry[]
  seriesTree: SeriesTree
  placeTree: PlaceTree
  loading: boolean
  /**
   * Why the ARCHIVE could not be read, already written in Spanish. It is the only
   * failure that stops the chooser: without the list there is no way to tell
   * whether the document is already there, and uploading it again would put a
   * second copy of the same PDF in the store.
   */
  error: string | null
  /**
   * Why a master table could not be read, already written in Spanish, or null.
   * It does NOT stop anything: a document with no type is «Tipo sin clasificar»,
   * which is a legitimate value of the column.
   */
  mastersError: string | null
  reload: () => Promise<void>
}

const DOCUMENT_TYPE_COLUMNS = 'id, name, active'
const SERIES_COLUMNS = 'id, parent_id, name, active'
const PLACE_COLUMNS = 'id, parent_id, name, active'

export function useArchiveCatalog(enabled: boolean): ArchiveCatalogQuery {
  const [documents, setDocuments] = useState<DocumentOption[]>([])
  const [documentTypes, setDocumentTypes] = useState<DocumentTypeEntry[]>([])
  const [series, setSeries] = useState<ArchiveSeries[]>([])
  const [places, setPlaces] = useState<PhysicalPlace[]>([])
  const [error, setError] = useState<string | null>(null)
  const [mastersError, setMastersError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  // Answers that arrive after the record has moved on are dropped: swiping
  // through the catalogue with a sheet open leaves queries in flight.
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  const reload = useCallback(async () => {
    setLoading(true)
    const [archive, types, tree, placeRows] = await Promise.all([
      supabase.from('archive_documents').select(DOCUMENT_OPTION_COLUMNS),
      supabase.from('document_types').select(DOCUMENT_TYPE_COLUMNS),
      supabase.from('archive_series').select(SERIES_COLUMNS),
      supabase.from('physical_places').select(PLACE_COLUMNS),
    ])
    if (!alive.current) return
    setLoading(false)

    if (archive.error) {
      // The list is cleared: a stale archive under a search field is how the same
      // document gets uploaded twice.
      setError(describeDocumentRefusal('load', archive.error))
      setDocuments([])
    } else {
      setError(null)
      setDocuments((archive.data ?? []) as unknown as DocumentOption[])
    }

    // The three masters share one sentence, and the first failure wins: three
    // stacked warnings about three lists nobody was going to fill in anyway would
    // bury the one thing that matters, which is that the document can still be
    // registered without them.
    const failure = types.error ?? tree.error ?? placeRows.error ?? null
    setMastersError(failure === null ? null : describeDocumentRefusal('load', failure))
    // Whatever DID arrive is kept: a form with the types and without the places is
    // a form that can still classify.
    if (!types.error) setDocumentTypes((types.data ?? []) as DocumentTypeEntry[])
    if (!tree.error) setSeries((tree.data ?? []) as ArchiveSeries[])
    if (!placeRows.error) setPlaces((placeRows.data ?? []) as PhysicalPlace[])
  }, [])

  useEffect(() => {
    if (!enabled) {
      // Not «still loading»: nothing was asked for, and a chooser that never opens
      // must not sit on «Cargando…» for ever.
      setLoading(false)
      return
    }
    void reload()
  }, [enabled, reload])

  const seriesTree = useMemo(() => buildSeriesTree(series), [series])
  const placeTree = useMemo(() => buildPlaceTree(places), [places])

  return {
    documents,
    documentTypes,
    seriesTree,
    placeTree,
    loading,
    error,
    mastersError,
    reload,
  }
}
