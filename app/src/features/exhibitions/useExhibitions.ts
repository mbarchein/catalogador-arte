/**
 * The exhibitions, loaded whole, plus the one write the index owns: creating one
 * (RF-501, RF-606).
 *
 * **Loaded whole and searched in the client.** A catalogue raisonné of two artists
 * has dozens of exhibitions, not thousands; one small query answers every
 * keystroke without a round trip, which is what makes the search usable over a bad
 * connection in a storeroom. The day this table passes a few hundred rows the
 * search moves to the server and the pure ranking stays exactly where it is. It is
 * the same decision `useExhibitionOptions` already took for the chooser, and for
 * the same reason.
 *
 * **Retired exhibitions are loaded, and hidden by the screen.** RLS decides what
 * arrives — a Lector only ever sees the live ones — so for a Cataloger the list
 * holds the trash too, which is the only place a retired show can be recovered
 * from. Filtering them out here would hide the only way back; the filtering is a
 * decision of the index (`rankExhibitions`), where it is pure and tested.
 *
 * Every decision lives in the pure modules next door. What is left here is the
 * wire: the request, the reload, and handing the answer to
 * `exhibitionWriteResult`. The convention of the project: an action resolves to
 * null when it worked and to the sentence to show when it did not.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { ExhibitionRow } from '../documentary/documentaryRows'
import { planExhibitionCreate, type ExhibitionDraft } from './exhibitionDraft'
import { EXHIBITION_COLUMNS } from './exhibitionIndex'
import { exhibitionFailureText, exhibitionWriteResult } from './exhibitionMessages'

export interface ExhibitionsQuery {
  exhibitions: ExhibitionRow[]
  loading: boolean
  error: string | null
  reload: () => Promise<void>
  /**
   * Creates one. Resolves to `{ id }` when it worked and `{ message }` when it did
   * not — the identifier, and not just null, because the screen navigates to the
   * new record and cannot look it up by title: titles are deliberately not unique.
   */
  addExhibition: (draft: ExhibitionDraft) => Promise<{ id: string } | { message: string }>
}

/**
 * @param enabled False asks for NOTHING. The record of an archive document loads the
 *   whole catalogue of exhibitions only when it is about to offer them for linking
 *   (RF-516): that screen is opened many times just to read a document, and whoever
 *   only reads has no reason to pay for the exhibition list. True by default, which is
 *   what the index and the creation screen need.
 */
export function useExhibitions(enabled = true): ExhibitionsQuery {
  const [exhibitions, setExhibitions] = useState<ExhibitionRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  // The screen can be left while a reload is in the air, and setting state on a
  // gone component is a warning nobody can act on.
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  const reload = useCallback(async () => {
    if (!enabled) {
      setLoading(false)
      return
    }
    // Asked again on the way from disabled to enabled, and the wait has to be visible:
    // otherwise the chooser would read «there are no exhibitions yet» for as long as the
    // first query is in the air. Costless for the index, which only shows the wait when
    // no row is painted.
    setLoading(true)
    const { data, error: failure } = await supabase.from('exhibitions').select(EXHIBITION_COLUMNS)
    if (!alive.current) return
    setLoading(false)
    if (failure) {
      setError(exhibitionFailureText(failure, 'load'))
      // The list is NOT cleared: the rows already painted keep the screen
      // readable, and nothing is written from a stale list — every write sends an
      // identifier the database checks.
      return
    }
    setError(null)
    // Not ordered in the query: the order of the index is
    // `coalesce(start_date, year-01-01)` descending with the title as tiebreaker,
    // and the database's own collation can sort «Álvarez» past the z. It is
    // decided in `sortExhibitions`, where it is pure and tested.
    setExhibitions((data ?? []) as unknown as ExhibitionRow[])
  }, [enabled])

  useEffect(() => {
    void reload()
  }, [reload])

  /**
   * Creates an exhibition (RF-501).
   *
   * **No duplicate check and no restore-instead-of-fail**, which is the difference
   * from every master table of this project: `exhibitions` has no unique index at
   * all, on purpose and written down in the migration — two touring shows of
   * different years share a title. So there is nothing to collide with and nothing
   * to restore, and a second row with the same title is a legitimate row. The
   * screen warns about the coincidence before the button (`similarTitleNotice`) and
   * the cataloger decides.
   *
   * `select('id')` is not decoration: the caller navigates to the record it just
   * created, and without asking for the identifier there is no way to name it.
   */
  const addExhibition = useCallback(
    async (draft: ExhibitionDraft): Promise<{ id: string } | { message: string }> => {
      const plan = planExhibitionCreate(draft)
      if (plan.action === 'blank') return { message: plan.message }

      const { data, error: failure } = await supabase
        .from('exhibitions')
        .insert(plan.payload)
        .select('id')
      const rows = (data ?? []) as { id: string }[]
      const message = exhibitionWriteResult('create', { failure, rows: rows.length })
      await reload()
      if (message !== null) return { message }
      const created = rows[0]
      if (created === undefined) {
        // Belt and braces: `exhibitionWriteResult` already turns zero rows into a
        // sentence, so this is unreachable. It exists because the alternative is a
        // non-null assertion on data that came off the network.
        return {
          message:
            'La exposición se ha creado pero el catálogo no ha devuelto su ficha. Búscala en el ' +
            'listado.',
        }
      }
      return { id: created.id }
    },
    [reload],
  )

  return { exhibitions, loading, error, reload, addExhibition }
}
