/**
 * The catalogue's bibliography, loaded whole (RF-506, RF-606).
 *
 * **Whole and searched in the client**, for the same reason as the exhibitions: a catalogue
 * raisonné of two artists has tens or hundreds of references, not hundreds of
 * thousands; a small query answers every keystroke with no round trip,
 * which is what makes the search usable with poor coverage in a storeroom. The day
 * this table goes beyond a few thousand rows, the search goes to the server and the pure ranking
 * stays where it is.
 *
 * **The withdrawn ones are loaded, and the screen hides them.** The RLS decides what arrives —a
 * Reader only receives the live ones— so for a Cataloguer the list also brings
 * the wastebasket, which is the only place from which a withdrawn reference
 * can come back. Filtering them here would hide the only way out; the filter is the
 * index's decision (`rankReferences`), where it is pure and tested.
 *
 * **A single write, and none for creation**: correcting. A reference is CREATED
 * by citing it from an artwork —it exists because something cites it— and that stays the same; what its
 * own record adds is being able to correct it from there, with the same panel and the same
 * planner the artwork record uses. And the correction needs precisely the whole
 * list this hook already loads: the BibTeX key clash is checked against the
 * other references, and without them it could not be checked.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { ReferenceRow } from '../documentary/documentaryRows'
import {
  planReferenceEdit,
  referenceFailureText,
  referenceWriteResult,
  type ReferenceEdit,
} from '../documentary/bibliography/referenceEdit'
import { REFERENCE_COLUMNS } from './bibliographyIndex'

export interface ReferencesQuery {
  references: ReferenceRow[]
  loading: boolean
  error: string | null
  reload: () => Promise<void>
  /**
   * Corrects a reference of the catalogue. Answers null when it went in —also when there
   * was nothing to change— and the sentence to show when it did not.
   *
   * It is the SAME operation as an artwork's record, with the same `planReferenceEdit`:
   * what corrects the shared catalogue cannot depend on which screen it was
   * entered by. Nothing to type means no request and, above all, no audit
   * trace over a correction nobody has made in a row the whole catalogue
   * reads.
   */
  updateReference: (id: string, draft: ReferenceEdit) => Promise<string | null>
}

/**
 * @param enabled False asks for NOTHING. An exhibition's record loads the whole bibliography
 *   only when it is going to name or choose its catalogue (RF-503): that screen is opened many
 *   times to read a show, and whoever only reads has no reason to pay for the reference
 *   catalogue. True by default, which is what the listing and the record need.
 */
export function useReferences(enabled = true): ReferencesQuery {
  const [references, setReferences] = useState<ReferenceRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  // The screen can be left with the query in the air, and writing state on a component
  // that is gone is a warning nobody can act upon.
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
    // It is asked for again on going from off to on, and that wait has to be visible:
    // otherwise, the selector would read «there is no reference yet» while the first
    // query is in the air. It costs the listing nothing, since it only shows the wait
    // when there is no row painted.
    setLoading(true)
    const { data, error: failure } = await supabase.from('bibliography').select(REFERENCE_COLUMNS)
    if (!alive.current) return
    setLoading(false)
    if (failure) {
      setError(referenceFailureText(failure))
      // The list is NOT emptied: the rows already painted keep the screen readable, and
      // nothing is written from an old list — nothing at all is written from
      // here.
      return
    }
    setError(null)
    // No `order` in the query: the index's order is by author with the
    // es-ES collation, and the base's would order «Álvarez» after the z. It is decided
    // in `sortReferences`, where it is pure and tested.
    setReferences((data ?? []) as unknown as ReferenceRow[])
  }, [enabled])

  useEffect(() => {
    void reload()
  }, [reload])

  const updateReference = useCallback(
    async (id: string, draft: ReferenceEdit): Promise<string | null> => {
      const plan = planReferenceEdit(references, id, draft)
      if (plan.action === 'blank' || plan.action === 'duplicate') return plan.message
      if (plan.action === 'unchanged') return null

      const { data, error: failure } = await supabase
        .from('bibliography')
        .update(plan.payload)
        .eq('id', id)
        .select('id')
      const message = referenceWriteResult({ failure, rows: (data ?? []).length })
      await reload()
      return message
    },
    [references, reload],
  )

  return { references, loading, error, reload, updateReference }
}
