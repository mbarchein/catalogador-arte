import { useCallback, useEffect, useState } from 'react'
import { sortByName, type MasterEntry } from '../../lib/masterTables'
import { supabase } from '../../lib/supabase'
import {
  describePublicationTypeFailure,
  duplicateNameMessage,
  planPublicationTypeAddition,
  planPublicationTypeRename,
} from './publicationTypes'
import { VOCABULARY_MISSING_ROW } from './vocabularies'

const COLUMNS = 'id, name, active'

/**
 * The publication-type vocabulary for the screen that maintains it (RF-514,
 * RF-1106, ADR-007).
 *
 * It is NOT the one the record uses: the bibliography panel loads its own copy
 * along with the whole catalogue of references (see useBibliographyEdits), and it
 * loads it only for whoever is adding a citation. Two consumers with opposite
 * needs — one wants the types beside the references, the other wants them alone
 * and with the retired ones showing — and one hook serving both would fetch the
 * references for a screen that does not list them.
 *
 * Retired types are loaded on purpose: this is the only screen a retired type can
 * be brought back from, and hiding them here would hide the way out.
 *
 * Every write answers the way the section agreed: null when it worked, and a
 * sentence in Spanish when it did not (see publicationTypes.ts, where the
 * decisions live and are tested).
 */
export function usePublicationTypes() {
  const [entries, setEntries] = useState<MasterEntry[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    const { data, error: failure } = await supabase.from('publication_types').select(COLUMNS)
    setLoading(false)
    if (failure) {
      setError(describePublicationTypeFailure('load', failure))
      return
    }
    setError(null)
    // Sorted here and not in the query: the database collation can order
    // «Artículo» past the z, and it belongs with the a's.
    setEntries(sortByName((data ?? []) as MasterEntry[]))
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  /**
   * Retires a type, or brings it back (RF-901: nothing is ever really deleted).
   *
   * The database refuses to retire one that still classifies references, in
   * Spanish and with a hint about what to do first, and that is the sentence that
   * gets shown. No count is kept here: it would be a second copy of the rule, out
   * of step with the next reference written from the desk.
   */
  const setTypeActive = useCallback(
    async (id: string, active: boolean): Promise<string | null> => {
      const { data, error: failure } = await supabase
        .from('publication_types')
        .update({ active })
        .eq('id', id)
        .select('id')
      if (failure) return describePublicationTypeFailure(active ? 'restore' : 'retire', failure)
      // `select('id')` is not decoration: an update the policies refuse comes
      // back with NO error and zero rows, so without counting them this screen
      // would report a retirement that never happened — the one mistake a
      // maintenance screen cannot make.
      if ((data ?? []).length === 0) return VOCABULARY_MISSING_ROW
      await reload()
      return null
    },
    [reload],
  )

  /**
   * Adds a type to the vocabulary. Answers null when the list ends up containing
   * the name, which includes the three ways it could already be there: identical,
   * the same but for capitals and accents, and retired — the last one comes back,
   * because that is what typing its name means.
   */
  const addType = useCallback(
    async (text: string): Promise<string | null> => {
      const plan = planPublicationTypeAddition(entries, text)
      if (plan.action === 'blank') return 'Escribe el nombre del tipo de publicación.'
      if (plan.action === 'reuse') return null
      if (plan.action === 'restore') return setTypeActive(plan.entry.id, true)

      const { error: failure } = await supabase
        .from('publication_types')
        .insert({ name: plan.name })
      if (failure) {
        if (failure.code !== '23505') return describePublicationTypeFailure('add', failure)
        // 23505 with the plan saying «insert» means the loaded list was stale:
        // either somebody wrote the name a second ago, or it is there retired.
        // Re-read and decide again — the same decision with fresh data.
        const { data } = await supabase.from('publication_types').select(COLUMNS)
        const again = planPublicationTypeAddition((data ?? []) as MasterEntry[], plan.name)
        if (again.action === 'restore') return setTypeActive(again.entry.id, true)
        // And if the fresh list still does not show it, the honest answer is that
        // the name is taken by something not on screen: claiming success would
        // leave her looking for a type that is not in the list.
        if (again.action !== 'reuse') return duplicateNameMessage(null)
      }
      await reload()
      return null
    },
    [entries, reload, setTypeActive],
  )

  /**
   * Renames a type. ADR-007 made this ONE row, and the whole bibliography reads
   * it because every reference points at the identifier.
   *
   * One request and not two, unlike the artwork types: `bibliography` keeps no
   * copy of the name as text, only `publication_type_id`, so there is nothing to
   * carry along and nothing that can be left half done.
   */
  const renameType = useCallback(
    async (id: string, text: string): Promise<string | null> => {
      const plan = planPublicationTypeRename(entries, id, text)
      if (plan.action === 'blank') return 'El nombre no puede quedar en blanco.'
      // Nothing typed, nothing written: the field just closes.
      if (plan.action === 'unchanged') return null
      if (plan.action === 'taken') return duplicateNameMessage(plan.entry.active)

      const { data, error: failure } = await supabase
        .from('publication_types')
        .update({ name: plan.name })
        .eq('id', id)
        .select('id')
      if (failure) return describePublicationTypeFailure('rename', failure)
      // Same reason as in setTypeActive: zero rows and no error is not success.
      if ((data ?? []).length === 0) return VOCABULARY_MISSING_ROW
      await reload()
      return null
    },
    [entries, reload],
  )

  return { entries, loading, error, reload, addType, renameType, setTypeActive }
}
