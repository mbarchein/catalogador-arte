/**
 * The dossiers, loaded whole, plus the one write the index owns: creating one
 * (RF-1601, RF-1610).
 *
 * Every decision lives in the pure modules next door. What is left here is the
 * wire: the request, the reload, and handing the answer to `dossierWriteResult`.
 * The convention of the project: an action resolves to null when it worked and to
 * the sentence to show when it did not.
 *
 * **Retired dossiers are loaded and hidden by the screen.** RLS decides what
 * arrives — a Lector only ever sees the live ones — so for a Cataloguer the list
 * holds the trash too, which is the only place a retired dossier is recovered
 * from. Filtering them out here would hide the only way back; the filtering is a
 * decision of `rankDossiers`, where it is pure and tested.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { planDossierCreate, type DossierDraft } from './dossierDraft'
import { DOSSIER_INDEX_COLUMNS, type DossierRow } from './dossierIndex'
import { dossierFailureText, dossierWriteResult } from './dossierMessages'

export interface DossiersQuery {
  dossiers: DossierRow[]
  loading: boolean
  error: string | null
  reload: () => Promise<void>
  /**
   * Creates one. Resolves to `{ id }` when it worked and `{ message }` when it did
   * not — the identifier and not just null, because the screen goes straight to the
   * new dossier to start arming it, and cannot look it up by title: titles are
   * deliberately not unique.
   */
  addDossier: (draft: DossierDraft) => Promise<{ id: string } | { message: string }>
}

export function useDossiers(): DossiersQuery {
  const [dossiers, setDossiers] = useState<DossierRow[]>([])
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
    setLoading(true)
    const { data, error: failure } = await supabase.from('dossiers').select(DOSSIER_INDEX_COLUMNS)
    if (!alive.current) return
    setLoading(false)
    if (failure) {
      setError(dossierFailureText(failure, 'load'))
      // The list is NOT cleared: the rows already painted keep the screen readable,
      // and nothing is written from a stale list — every write sends an identifier
      // the database checks.
      return
    }
    setError(null)
    // Not ordered in the query: the order is decided in `sortDossiers`, where it is
    // pure and tested, and where the database's own collation cannot sort «Álvarez»
    // past the z.
    setDossiers((data ?? []) as unknown as DossierRow[])
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  const addDossier = useCallback(
    async (draft: DossierDraft): Promise<{ id: string } | { message: string }> => {
      const plan = planDossierCreate(draft)
      if (plan.action === 'blank') return { message: plan.message }

      const { data, error: failure } = await supabase
        .from('dossiers')
        .insert(plan.payload)
        .select('id')
      const rows = (data ?? []) as { id: string }[]
      const message = dossierWriteResult('create', { failure, rows: rows.length })
      await reload()
      if (message !== null) return { message }
      const created = rows[0]
      if (created === undefined) {
        // Belt and braces: `dossierWriteResult` already turns zero rows into a
        // sentence, so this is unreachable. It exists because the alternative is a
        // non-null assertion on data that came off the network.
        return {
          message:
            'El dossier se ha creado pero el catálogo no ha devuelto su ficha. Búscalo en el listado.',
        }
      }
      return { id: created.id }
    },
    [reload],
  )

  return { dossiers, loading, error, reload, addDossier }
}
