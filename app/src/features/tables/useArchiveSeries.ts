import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { ArchiveSeries } from '../../lib/types'
import {
  buildSeriesTree,
  describeArchiveSeriesFailure,
  planSeriesAddition,
  planSeriesMove,
  planSeriesRename,
  retireRefusalText,
  seriesAdditionProblem,
  seriesMoveProblem,
  seriesRenameProblem,
  type DatabaseRefusal,
  type SeriesAction,
  type SeriesContents,
  type SeriesTree,
} from './archiveSeries'

const COLUMNS = 'id, parent_id, name, active'

/** How many subseries and documents get named in the refusal, at most. */
const NAMED_AT_MOST = 3

/**
 * The archive classification tree (RF-515), loaded whole from `archive_series`.
 *
 * Whole for the same reason as the places (ADR-006): a classification has as many
 * nodes as a person can hold in their head, the path of a node is arithmetic
 * instead of a recursive query per row, and one query serves the list, the parent
 * picker and the move sheet. **Retired series come too**, because this is the only
 * screen one can be brought back from and hiding them would hide the only way out.
 *
 * Sorting is not asked of the query: `buildSeriesTree` orders siblings with es-ES
 * collation, so «Álbumes» sits with the a's and not after the z's whatever
 * collation the database was created with.
 *
 * **Every action answers a sentence in Spanish or null**, which is the convention
 * `useTableAction` runs on. The sentences are built by the pure module next door,
 * with tests, because «which message for which refusal» is the part that has
 * decisions in it and a hook that talks to the network cannot be tested here.
 */
export function useArchiveSeries() {
  const [rows, setRows] = useState<ArchiveSeries[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    // Wrapped because a load that throws instead of answering would leave
    // `loading` true for ever, and a screen stuck on «cargando» with no
    // explanation is the blank page this project does not do.
    try {
      const { data, error } = await supabase.from('archive_series').select(COLUMNS)
      setLoading(false)
      if (error) {
        setError(describeArchiveSeriesFailure('load', error))
        return
      }
      setError(null)
      setRows((data ?? []) as ArchiveSeries[])
    } catch (thrown) {
      setLoading(false)
      setError(describeArchiveSeriesFailure('load', { message: String(thrown) }))
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  const tree = useMemo(() => buildSeriesTree(rows), [rows])

  /**
   * One write, and the answer it deserves.
   *
   * **`select('id')` is not decoration.** An update the policies refuse comes back
   * 204 — or 200 with an empty list when the representation is asked for — and NO
   * error, checked against the local base with a Reader's token. Without counting
   * the affected rows the screen would report «guardado» and change nothing, which
   * is the one mistake a maintenance screen cannot make. Zero rows means the write
   * did not happen, whatever the reason, and that is what gets said.
   *
   * **And it never rejects.** `useTableAction` clears its `busy` flag after the
   * await; a promise that rejects would skip that line and leave every button on
   * the screen disabled until the page is reloaded.
   */
  const write = useCallback(
    async (
      action: SeriesAction,
      request: PromiseLike<{ data: unknown[] | null; error: DatabaseRefusal | null }>,
      /** Turns a refusal into its sentence. Retiring adds what is inside. */
      describe: (refusal: DatabaseRefusal) => Promise<string> | string = (refusal) =>
        describeArchiveSeriesFailure(action, refusal),
    ): Promise<string | null> => {
      try {
        const { data, error } = await request
        if (error) return await describe(error)
        if ((data ?? []).length === 0) return describeArchiveSeriesFailure(action, null)
      } catch (thrown) {
        return describeArchiveSeriesFailure(action, { message: String(thrown) })
      }
      await reload()
      return null
    },
    [reload],
  )

  /**
   * How much a series is holding, asked ONLY after the database refused to retire
   * it.
   *
   * The order of the two questions matters and is not alphabetical taste: the
   * documents come out by signature with the ones that have none last, because a
   * signature is what finds a paper in a box.
   *
   * A failure here is not reported: the answer that matters — «no se puede
   * retirar» — is already in hand, and turning the explanation's own network error
   * into the headline would replace a true sentence with a confusing one. It
   * answers null and the refusal stands alone.
   */
  const contentsOf = useCallback(async (id: string): Promise<SeriesContents | null> => {
    try {
      const [subseries, documents] = await Promise.all([
        supabase
          .from('archive_series')
          .select('name', { count: 'exact' })
          .eq('parent_id', id)
          .eq('active', true)
          .order('name')
          .limit(NAMED_AT_MOST),
        supabase
          .from('archive_documents')
          .select('archive_code, title', { count: 'exact' })
          .eq('archive_series_id', id)
          .eq('active', true)
          .order('archive_code', { nullsFirst: false })
          .limit(NAMED_AT_MOST),
      ])
      if (subseries.error || documents.error) return null
      return {
        subseries: (subseries.data ?? []) as { name: string }[],
        subseriesCount: subseries.count ?? 0,
        documents: (documents.data ?? []) as { archive_code: string | null; title: string }[],
        documentCount: documents.count ?? 0,
      }
    } catch {
      return null
    }
  }, [])

  /**
   * Retires a series, or brings it back (RF-901: nothing is ever really deleted).
   *
   * The database refuses to retire one with subseries or with documents inside,
   * in Spanish and with a hint about what to do first, and both halves are shown.
   * **What the screen adds is how many and which**, asked for after the refusal
   * (see `contentsOf`): the trigger says «todavía tiene documentos dentro» and
   * never says whether that is two letters or two hundred, and those are
   * different afternoons.
   */
  const setSeriesActive = useCallback(
    (id: string, active: boolean): Promise<string | null> =>
      write(
        active ? 'restore' : 'retire',
        supabase.from('archive_series').update({ active }).eq('id', id).select('id'),
        active
          ? undefined
          : async (refusal) => retireRefusalText(refusal, await contentsOf(id)),
      ),
    [contentsOf, write],
  )

  /**
   * Creates a series inside `parentId`, or a fondo when it is null.
   *
   * The name travels VERBATIM, commas included: this is not a path. The places
   * screen turns «Castelar 4, mesa de Mario» into two levels because the same
   * control is used while cataloging with the artwork in hand; here the parent is
   * picked from the tree that is already on the screen, so the comma goes back to
   * being a character — and «Cartas, telegramas y postales» is a perfectly normal
   * name for a series.
   *
   * A name that is already there is a success and not a failure, in the three ways
   * it can be there: identical, equivalent but for capitals or accents, and
   * RETIRED — the last one comes back, because that is what typing it means.
   *
   * The `23505` branch is the race: someone created the same name a second ago, or
   * the copy on screen was stale. Re-reading and deciding again with fresh data is
   * the same decision, and it is the only way to tell «ya estaba» from «estaba
   * retirada». If the fresh copy still does not explain the duplicate, the refusal
   * is reported instead of being swallowed as success.
   */
  const addSeries = useCallback(
    async (parentId: string | null, name: string): Promise<string | null> => {
      const plan = planSeriesAddition(tree, parentId, name)
      const problem = seriesAdditionProblem(plan)
      if (problem !== null) return problem
      if (plan.action === 'reuse') return null
      if (plan.action === 'restore') return setSeriesActive(plan.series.id, true)
      if (plan.action !== 'insert') return null

      try {
        const { error } = await supabase
          .from('archive_series')
          .insert({ parent_id: plan.parentId, name: plan.name })
        if (error) {
          if (error.code !== '23505') return describeArchiveSeriesFailure('add', error)
          const { data } = await supabase.from('archive_series').select(COLUMNS)
          const again = planSeriesAddition(
            buildSeriesTree((data ?? []) as ArchiveSeries[]),
            plan.parentId,
            plan.name,
          )
          if (again.action === 'restore') return setSeriesActive(again.series.id, true)
          if (again.action === 'insert') return describeArchiveSeriesFailure('add', error)
        }
      } catch (thrown) {
        return describeArchiveSeriesFailure('add', { message: String(thrown) })
      }
      await reload()
      return null
    },
    [reload, setSeriesActive, tree],
  )

  /**
   * Renames a series. One row, and the whole archive reads it: `archive_documents`
   * points at the identifier and keeps no copy of the text, so there is nothing to
   * drag along and no window in which a document cannot be saved.
   *
   * This is the half of RF-515 that the migration of the v11 texts left waiting:
   * a hierarchy written by hand arrives in lowercase and without accents, and
   * curing it is one edit per node instead of one per document.
   */
  const renameSeries = useCallback(
    (id: string, name: string): Promise<string | null> => {
      const plan = planSeriesRename(tree, id, name)
      const problem = seriesRenameProblem(plan)
      if (problem !== null) return Promise.resolve(problem)
      // Opening the pencil and saving without touching anything is not a write:
      // it would cost a request, a reload and a row of audit trail for nothing.
      if (plan.action !== 'rename') return Promise.resolve(null)
      return write(
        'rename',
        supabase.from('archive_series').update({ name: plan.name }).eq('id', id).select('id'),
      )
    },
    [tree, write],
  )

  /**
   * Hangs a series from another one, or from nothing to make it a fondo.
   *
   * Reorganising is a normal operation and touches no document (that is what
   * `parent_id` being mutable is for), so the only things that can go wrong are
   * the cycle and a name already taken at the destination. Both are predicted from
   * the tree on screen to answer without a round trip, and both are mapped for the
   * database's own refusal too, which is the one that cannot be bypassed.
   */
  const moveSeries = useCallback(
    (id: string, parentId: string | null): Promise<string | null> => {
      const plan = planSeriesMove(tree, id, parentId)
      const problem = seriesMoveProblem(plan)
      if (problem !== null) return Promise.resolve(problem)
      if (plan.action !== 'move') return Promise.resolve(null)
      return write(
        'move',
        supabase
          .from('archive_series')
          .update({ parent_id: plan.parentId })
          .eq('id', id)
          .select('id'),
      )
    },
    [tree, write],
  )

  // No live subscription, as on the other screens of the section: `archive_series`
  // is not in the Realtime publication and adding it would be a production change
  // to serve a screen one person uses to tidy up a classification. Every action
  // here reloads the tree.
  return {
    tree: tree as SeriesTree,
    loading,
    error,
    reload,
    addSeries,
    renameSeries,
    moveSeries,
    setSeriesActive,
  }
}
