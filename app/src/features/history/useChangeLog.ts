import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { ChangeLogRow } from './changeEntry'

/**
 * How many rows are asked for at a time.
 *
 * They are ROWS and not saves, and the difference matters: a save that touched eight
 * fields is eight rows and a single line on screen. Two hundred rows give of the
 * order of thirty or forty lines, which is more than anybody reads in one go
 * and enough for «ver más» hardly ever to be needed.
 *
 * The `change_log_by_artwork_idx` index is exactly `(catalog_id, changed_at
 * desc, id desc)`, so this query walks it without sorting anything in memory.
 */
export const CHANGE_PAGE = 200

/**
 * The log **has no foreign key to `profiles`**, and it is not an oversight: it is
 * argued in its migration. `profiles.id` cascades from `auth.users`, and
 * deleting an account from the panel is one click; with a foreign key that click either fails
 * —and the log holds hostage a person who left— or somebody resolves it
 * by deleting audit rows, which is precisely what that design exists to prevent.
 *
 * The consequence here is concrete: **PostgREST cannot embed the profile**, there
 * is no relationship to follow. So the names are resolved in a second query
 * narrowed to the authors who really appear in the rows read, which are a
 * few and not the whole team. And an author whose account no longer exists breaks nothing: it is
 * left with no name and the line still tells what happened, which is what was wanted.
 */
const COLUMNS =
  'id, change_id, entity, row_key, operation, column_name, old_value, new_value, ' +
  'changed_at, changed_by'

export interface ChangeLogState {
  readonly rows: readonly ChangeLogRow[]
  readonly loading: boolean
  readonly error: string | null
  /** Whether the base had more rows than fit on one page. */
  readonly hasMore: boolean
  readonly loadMore: () => void
  readonly reload: () => void
}

/**
 * An artwork's history: its changes and those of its photographs, in one query.
 *
 * The log's `catalog_id` column is in both kinds of row —also in
 * a photograph's— precisely so that a record's history is one
 * query and not two with a union afterwards.
 *
 * **Nothing is asked for until `enabled` is true.** The record's block
 * arrives folded and the history is the heaviest part of the page: loading it on
 * opening the record would be paying for a query nobody asked for, on mobile
 * data, in the most opened screen of the whole application.
 *
 * Who can read it is decided by the table's policy, not by this code: it is read with
 * the session of whoever looks, and an artwork that is not seen does not show its history.
 */
export function useChangeLog(catalogId: string | undefined, enabled: boolean): ChangeLogState {
  const [rows, setRows] = useState<readonly ChangeLogRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [limit, setLimit] = useState(CHANGE_PAGE)
  const [hasMore, setHasMore] = useState(false)

  const load = useCallback(
    async (take: number) => {
      if (!catalogId) return
      setLoading(true)
      setError(null)
      // ONE row more than will be shown is asked for: it is how having more is known
      // without paying for an exact `count` over a table that only grows.
      const { data, error: failure } = await supabase
        .from('change_log')
        .select(COLUMNS)
        .eq('catalog_id', catalogId)
        .order('changed_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(take + 1)
      if (failure) {
        setError('No se ha podido leer el historial de esta obra.')
        setLoading(false)
        return
      }
      const all = (data ?? []) as unknown as ChangeLogRow[]
      const page = all.slice(0, take)

      // The authors who really appear on this page, and only those.
      const ids = [...new Set(page.map((r) => r.changed_by).filter((v): v is string => v !== null))]
      let authors = new Map<string, { name: string | null; email: string | null }>()
      if (ids.length > 0) {
        const { data: people } = await supabase
          .from('profiles')
          .select('id, name, email')
          .in('id', ids)
        // Si esta consulta falla, el historial se muestra igual sin nombres: perder
        // los nombres es peor que perder el historial, pero mucho menos malo que no
        // mostrar nada. No se convierte en un error de la pantalla.
        authors = new Map(
          ((people ?? []) as { id: string; name: string | null; email: string | null }[]).map(
            (p) => [p.id, { name: p.name, email: p.email }],
          ),
        )
      }

      setHasMore(all.length > take)
      setRows(page.map((r) => ({ ...r, author: r.changed_by ? (authors.get(r.changed_by) ?? null) : null })))
      setLoading(false)
    },
    [catalogId],
  )

  useEffect(() => {
    if (!enabled) return
    void load(limit)
  }, [enabled, limit, load])

  return {
    rows,
    loading,
    error,
    hasMore,
    loadMore: () => setLimit((n) => n + CHANGE_PAGE),
    reload: () => void load(limit),
  }
}
