import { useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import type { ArtworkRelationshipType } from '../../lib/types'
import { useRelationshipTypes } from '../documentary/relationships/useRelationshipTypes'
import {
  planRelationshipTypeAddition,
  planRelationshipTypeEdit,
  relationshipTypeFailure,
  relationshipTypeLoadFailure,
  relationshipTypeMissingRow,
  type RelationshipTypeAction,
  type RelationshipTypeColumns,
  type RelationshipTypeDraft,
} from './relationshipTypes'

const COLUMNS = 'id, name, inverse_name, is_symmetric, active'

/**
 * The relationship-kind vocabulary WITH its three writes (RF-217, RF-901,
 * RF-1106): the half the record deliberately does not have.
 *
 * The reading half is not written again here. `useRelationshipTypes` — the record's
 * hook — already loads the five columns, retired kinds included, and sorts them
 * with es-ES collation; its own comment says that creating a kind «is a
 * maintenance screen's decision (RF-1106)», and this is that screen. Copying the
 * query to add three functions to it would leave two definitions of the same list
 * to keep in step.
 *
 * Every write answers the way the whole «Tablas» section agreed: null when it
 * worked, and a sentence in Spanish when it did not. The decisions behind those
 * sentences live in relationshipTypes.ts, where they are pure and tested; what is
 * here is the plumbing.
 *
 * **The three columns always travel together.** `name`, `inverse_name` and
 * `is_symmetric` are one decision — a directed kind without its inverse label is a
 * row the table refuses, and a kind whose two labels disagree with its symmetry
 * publishes the relationship backwards on the far side. Sending them in separate
 * requests would leave a moment in between with no valid value to hold.
 */
export function useRelationshipTypesAdmin() {
  const { entries, loading, error, reload } = useRelationshipTypes()

  /**
   * One update of one row, and whether it took.
   *
   * `select('id')` is not decoration: an update whose row the RLS `using` clause
   * does not show comes back as a success that touched nothing — verified against
   * the local database with a Reader's session, which gets 200 and an empty list,
   * no error at all. Without counting the rows, the screen would report «saved»
   * and go on showing the old value.
   */
  const write = useCallback(
    async (
      id: string,
      // The columns of the table and nothing else, so a typo in a key is a
      // compile error instead of a request the database ignores.
      patch: Partial<RelationshipTypeColumns> & { active?: boolean },
      action: RelationshipTypeAction,
    ): Promise<string | null> => {
      const { data, error: failure } = await supabase
        .from('artwork_relationship_types')
        .update(patch)
        .eq('id', id)
        .select('id')
      if (failure) return relationshipTypeFailure(failure, action)
      if ((data ?? []).length === 0) return relationshipTypeMissingRow(action)
      await reload()
      return null
    },
    [reload],
  )

  /**
   * Retires a kind, or brings it back (RF-901: nothing is ever really deleted).
   *
   * The database refuses to retire one that related artworks still use, in Spanish
   * and with a hint about what to do first, and that pair of sentences is what
   * gets shown. No count is kept here: it would be a second copy of the rule, out
   * of step with the next relationship registered from a phone.
   */
  const setRelationshipTypeActive = useCallback(
    (id: string, active: boolean) => write(id, { active }, active ? 'restore' : 'retire'),
    [write],
  )

  /**
   * Adds a kind, with its two readings and its direction.
   *
   * A name already on the list is answered and not silently accepted, and one in
   * the trash comes back carrying the direction just typed — see
   * planRelationshipTypeAddition for why those two are not the same case, and why
   * neither can be told from the other by the unique violation alone.
   */
  const addRelationshipType = useCallback(
    async (draft: RelationshipTypeDraft): Promise<string | null> => {
      const plan = planRelationshipTypeAddition(entries, draft)
      if (plan.action === 'problem') return plan.problem
      if (plan.action === 'restore') {
        return write(plan.entry.id, { active: true, ...plan.columns }, 'restore')
      }

      const { error: failure } = await supabase
        .from('artwork_relationship_types')
        .insert(plan.columns)
      if (failure) {
        // 23505 with the plan saying «insert» means the loaded list was stale:
        // either somebody wrote the name a second ago, or it is there retired.
        // Re-read and decide again — the same decision with fresh data.
        if (failure.code !== '23505') return relationshipTypeFailure(failure, 'add')
        const { data } = await supabase.from('artwork_relationship_types').select(COLUMNS)
        const again = planRelationshipTypeAddition(
          (data ?? []) as unknown as ArtworkRelationshipType[],
          draft,
        )
        if (again.action === 'restore') {
          return write(again.entry.id, { active: true, ...again.columns }, 'restore')
        }
        // The fresh list explains it («ya está en la lista», or with another
        // reading), or it still does not show the name — which for a cataloger,
        // who sees retired kinds too, should not happen; the translated unique
        // violation is then the honest answer.
        await reload()
        return again.action === 'problem' ? again.problem : relationshipTypeFailure(failure, 'add')
      }
      await reload()
      return null
    },
    [entries, reload, write],
  )

  /**
   * Saves the two readings and the direction of an existing kind.
   *
   * ONE request, unlike renaming an artwork type: `artwork_relationships` keeps no
   * copy of the labels as text, only `relationship_type_id`, so there is nothing
   * to carry along and nothing that can be left half done. Both records of every
   * related pair read the new labels straight away.
   *
   * Changing the direction of a kind ALREADY USED is refused by the database
   * (RF-217: «ninguna clase en uso cambia de simetría»), because the rows of a
   * symmetric kind are stored in one canonical order and those of a directed one
   * are not; its sentence, with the hint about creating a new kind instead, is
   * what shows up. Renaming, on the other hand, is always allowed — verified
   * against the database on a kind in use.
   */
  const editRelationshipType = useCallback(
    async (id: string, draft: RelationshipTypeDraft): Promise<string | null> => {
      const entry = entries.find((row) => row.id === id)
      if (entry === undefined) return relationshipTypeMissingRow('rename')

      const plan = planRelationshipTypeEdit(entry, draft)
      if (plan.action === 'problem') return plan.problem
      // Nothing typed, nothing written: the field just closes. On a kind in use
      // this also matters, because an update that re-sends the same symmetry is
      // accepted and one that moves it is not.
      if (plan.action === 'unchanged') return null
      return write(id, plan.columns, 'rename')
    },
    [entries, write],
  )

  return {
    entries,
    loading,
    // Told in Spanish here and not handed over raw. The reading hook belongs to the
    // record's feature and reports `failure.message`, which on a phone with no
    // coverage is «TypeError: Failed to fetch»: English, about fetch, and pasted
    // after a Spanish lead-in by whoever shows it.
    error: error === null ? null : relationshipTypeLoadFailure(error),
    reload,
    addRelationshipType,
    editRelationshipType,
    setRelationshipTypeActive,
  }
}
