import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { activeNames, planAddition, sortByName } from '../../lib/masterTables'
import type { ArtworkTypeEntry } from '../../lib/types'

const COLUMNS = 'id, name, active'

/**
 * The artwork-type vocabulary (RF-213), loaded from `artwork_types`.
 *
 * ONE query serves the four consumers — the record, the capture flow, the list
 * filter and the types screen (RF-1106) — which is why what comes back is the
 * whole table and each consumer picks what it needs:
 *  - the forms and the filter use `types`, the plain list of names STILL ON
 *    OFFER, which is what a ComboBox wants;
 *  - the maintenance screen uses `entries`, retired ones included, because it is
 *    the only place a retired type can be brought back from and hiding them there
 *    would hide the only way out.
 *
 * Sorting happens here with es-ES collation, not in the query: the database
 * default collation may order accented names after 'z', and «Óleo» belongs with
 * the o's.
 */
export function useArtworkTypes() {
  const [entries, setEntries] = useState<ArtworkTypeEntry[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    const { data, error } = await supabase.from('artwork_types').select(COLUMNS)
    setLoading(false)
    if (error) {
      setError(error.message)
      return
    }
    setError(null)
    setEntries(sortByName((data ?? []) as ArtworkTypeEntry[]))
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  /**
   * The names on offer. Retired types are left out here and not in the query:
   * a record pointing at one still has to be able to read its name.
   */
  const types = useMemo(() => activeNames(entries), [entries])

  /**
   * Retires a type, or brings it back (RF-901: nothing is ever really deleted).
   *
   * The database refuses to retire one that artworks still use, in Spanish and
   * with a hint about what to do first, and that sentence is what gets shown.
   * There is no second copy of the count here: this screen would have to keep it
   * in step with every artwork saved from a phone, and a rule with two copies is
   * a rule that drifts.
   */
  const setTypeActive = useCallback(
    async (id: string, active: boolean): Promise<string | null> => {
      const { error } = await supabase.from('artwork_types').update({ active }).eq('id', id)
      if (error) return error.message
      await reload()
      return null
    },
    [reload],
  )

  /**
   * Adds an entry to the vocabulary. Resolves to an error message in Spanish
   * (what the ComboBox and the screen show), or null when it worked.
   *
   * A name that is already there is a success and not an error, in the three ways
   * it can already be there: identical, equivalent but for capitals or accents,
   * and RETIRED — the last one is brought back, because that is what typing it
   * means (see planAddition). Only the retired case needs the extra request; the
   * insert used to swallow its unique violation and call it done, which after
   * RF-1106 would have answered «added» while the entry stayed hidden.
   */
  const addType = useCallback(
    async (name: string): Promise<string | null> => {
      const plan = planAddition(entries, name)
      if (plan.action === 'blank') return 'Escribe el nombre del tipo de obra'
      if (plan.action === 'reuse') return null
      if (plan.action === 'restore') return setTypeActive(plan.entry.id, true)

      const { error } = await supabase.from('artwork_types').insert({ name: plan.name })
      if (error) {
        // 23505: unique violation. Either someone else inserted the same name a
        // second ago — a race that is a success — or the loaded copy of the
        // vocabulary was stale and the name is there, possibly retired. Re-read
        // and decide again: it is the same decision with fresh data.
        if (error.code !== '23505') return `No se ha podido añadir el tipo: ${error.message}`
        const { data } = await supabase.from('artwork_types').select(COLUMNS)
        const again = planAddition((data ?? []) as ArtworkTypeEntry[], plan.name)
        if (again.action === 'restore') return setTypeActive(again.entry.id, true)
      }
      await reload()
      return null
    },
    [entries, reload, setTypeActive],
  )

  /**
   * Renames a type. ADR-007 made this one row, and the artworks see it because
   * they point at the identifier.
   *
   * **The second request is the transition showing.** `artworks.artwork_type`
   * still holds a COPY of the name as text, with a trigger demanding that the
   * copy be in the vocabulary, and the record form sends that text on every save:
   * renaming without syncing it leaves those artworks unsaveable — «El tipo de
   * obra “Técnica mixta” no está en el catálogo de tipos» — and leaves the list
   * filter offering a name that matches nothing. So the copy is brought along, by
   * identifier and not by old text, which also reaches a row whose text was
   * stored with stray spaces.
   *
   * The order is forced: the vocabulary first, or the trigger rejects the text.
   * It costs the `updated_at` of those artworks, which is a lie of a few seconds
   * about who touched them and the price of the text column still being there;
   * `basic_updated_at` does NOT move (RF-802), because the tuple watches
   * `artwork_type_id`. It is not atomic either: if the second request fails, the
   * message says so instead of pretending the rename is finished. Both problems
   * disappear with the text column, and the atomic version meanwhile would be a
   * function in the database — a new migration, deliberately not written here.
   */
  const renameType = useCallback(
    async (id: string, name: string): Promise<string | null> => {
      const clean = name.trim()
      if (clean === '') return 'El nombre no puede quedar vacío'

      const { error } = await supabase.from('artwork_types').update({ name: clean }).eq('id', id)
      if (error) {
        if (error.code === '23505') return 'Ya hay un tipo de obra con ese nombre'
        return `No se ha podido renombrar: ${error.message}`
      }

      const { error: copyError } = await supabase
        .from('artworks')
        .update({ artwork_type: clean })
        .eq('artwork_type_id', id)
      await reload()
      if (copyError) {
        return `El tipo se ha renombrado, pero las obras que lo usan siguen con el nombre anterior: ${copyError.message}`
      }
      return null
    },
    [reload],
  )

  return { entries, types, loading, error, reload, addType, renameType, setTypeActive }
}
