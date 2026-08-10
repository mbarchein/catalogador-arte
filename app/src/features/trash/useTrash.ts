import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { TRASH_KINDS, type TrashKindId, type TrashRow } from './trashKinds'
import { toTrashItems, type TrashAuthor, type TrashItem, type TrashKindView } from './trashItems'
import { describeLoadFailure, describeRestoreRefusal, type DatabaseRefusal } from './trashRestore'

/**
 * How many rows are asked for of each class.
 *
 * The wastebasket is small by nature: it is what one person has withdrawn by hand
 * over years, and today in the whole base it is five rows. Fifty per class leaves
 * plenty of room and puts a ceiling, which is what prevents a table somebody empties
 * by mistake from turning this screen into a download of thousands of lines on a phone.
 */
export const TRASH_PAGE = 50

export interface TrashState {
  readonly views: readonly TrashKindView[]
  readonly loading: boolean
  readonly reload: () => void
  /**
   * Recovers a thing. Returns the failure's sentence, or `null` if it came back.
   *
   * It is the convention of this project's maintenance screens: the action
   * answers text in Spanish or nothing, and the caller does not interpret codes.
   */
  readonly restore: (item: TrashItem) => Promise<string | null>
}

/**
 * Everything withdrawn, from the twenty-one tables that carry logical deletion.
 *
 * ── WHY TWENTY-ONE QUERIES IN PARALLEL ───────────────────────────
 *
 * PostgREST does not join tables, so there is no one query that brings the whole
 * wastebasket. The alternatives were asking for twenty-one counts first and then the rows
 * —paying twice for the same thing— or loading each group on opening it, which leaves the
 * user opening four blocks to discover that the wastebasket is empty. All
 * twenty-one are loaded at once, in parallel and with a ceiling per class: they are tiny
 * requests over tiny tables, they are multiplexed over the same connection, and this is
 * a screen opened once in a while and not the most used one.
 *
 * ── ONE FAILING CANNOT SWITCH THE OTHERS OFF ─────────────────────
 *
 * Each class stores its own failure. A table that cannot be read leaves its line
 * explained and the rest stay standing: **never a blank page**, and least of all over
 * one out of twenty-one.
 *
 * ── WHO SEES IT ──────────────────────────────────────────────────
 *
 * This code does not decide it, the policies do: eighteen of the twenty-one
 * tables have `(active and can_read()) or can_edit()`, so whoever only consults
 * receives empty lists. Even so the whole screen is closed to whoever does not catalogue
 * —an empty list is not an explanation—, and that is done in `TrashPage`.
 */
export function useTrash(): TrashState {
  const [views, setViews] = useState<readonly TrashKindView[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)

    // One read per class, all at once. ONE row more than is shown is asked
    // for: it is how having more is known without paying for an exact count.
    const answers = await Promise.all(
      TRASH_KINDS.map(async (spec) => {
        try {
          const { data, error } = await supabase
            .from(spec.table)
            .select(spec.columns)
            .eq('active', false)
            // The last thing withdrawn first, which is what one comes looking for. The rows
            // with no date —the ones a migration moved and nobody withdrew— last:
            // Postgres would put them first in a descending order, and heading the
            // wastebasket with what has no trace is burying what does have one.
            .order('deactivated_at', { ascending: false, nullsFirst: false })
            .limit(TRASH_PAGE + 1)
          if (error) return { spec, rows: [] as TrashRow[], failure: error as DatabaseRefusal }
          return { spec, rows: (data ?? []) as unknown as TrashRow[], failure: null }
        } catch (thrown) {
          // Wrapped because a read that throws instead of answering would leave
          // `loading` true forever, and a screen stuck on
          // «cargando» with no explanation is the blank page this project does not
          // do.
          return { spec, rows: [] as TrashRow[], failure: { message: String(thrown) } }
        }
      }),
    )

    // The names are resolved in ONE query narrowed to the people who really
    // appear, as in the change history: they are a few and not the whole team.
    const ids = [
      ...new Set(
        answers.flatMap((answer) =>
          answer.rows
            .map((row) => row['deactivated_by'])
            .filter((value): value is string => typeof value === 'string' && value !== ''),
        ),
      ),
    ]
    let authors = new Map<string, TrashAuthor>()
    if (ids.length > 0) {
      const { data } = await supabase.from('profiles').select('id, name, email').in('id', ids)
      // If this query fails, the wastebasket is shown all the same without names: losing the
      // names is far less bad than not being able to recover anything.
      authors = new Map(
        ((data ?? []) as { id: string; name: string | null; email: string | null }[]).map((p) => [
          p.id,
          { name: p.name, email: p.email },
        ]),
      )
    }

    setViews(
      answers.map(({ spec, rows, failure }) => ({
        spec,
        items: toTrashItems(spec, rows.slice(0, TRASH_PAGE), authors),
        truncated: rows.length > TRASH_PAGE,
        error: failure === null ? null : describeLoadFailure(spec.id, failure),
      })),
    )
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  /**
   * Brings a thing back to life.
   *
   * Three things that are not ornaments:
   *
   *  1. **The block is checked before writing.** Measured: the base accepts
   *     restoring something whose parent is still withdrawn, and the row comes back invisible. The
   *     reason is already computed in the item; here it is only respected.
   *
   *  2. **`select(...)` is not an ornament.** An `update` the policies reject
   *     answers 200 with an empty list and NO error. Without asking for the rows affected,
   *     this function would say it went well.
   *
   *  3. **It never rejects.** The caller clears its «busy» flag after the
   *     `await`; a rejected promise would skip that line and leave the screen with
   *     every button off until a reload.
   *
   * And on finishing EVERYTHING is reloaded, not only the class touched: recovering an artwork
   * unblocks its photographs and its links, and it is other classes that have to
   * stop saying «not yet». It is the whole read again, which here is a
   * few rows.
   */
  const restore = useCallback(
    async (item: TrashItem): Promise<string | null> => {
      if (item.blocked !== null) return item.blocked
      const spec = TRASH_KINDS.find((kind) => kind.id === item.kind)
      if (spec === undefined) return describeRestoreRefusal(item.kind, null)
      try {
        const { data, error } = await supabase
          .from(spec.table)
          .update({ active: true })
          .eq(spec.key, item.key)
          .select(spec.key)
        if (error) return describeRestoreRefusal(item.kind, error as DatabaseRefusal)
        if ((data ?? []).length === 0) return describeRestoreRefusal(item.kind, null)
      } catch (thrown) {
        return describeRestoreRefusal(item.kind, { message: String(thrown) })
      }
      await load()
      return null
    },
    [load],
  )

  return { views, loading, reload: () => void load(), restore }
}

/** The class identifiers, for the checks that go through them. */
export type { TrashKindId }
