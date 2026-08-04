/**
 * The register of people and institutions (RF-508), loaded whole.
 *
 * It is a master table with dozens of rows, read by every chain of provenance,
 * every exhibition venue and every rights holder: one query serves the screen,
 * like `usePhysicalPlaces` and `useSeries` already do, and asking per link would
 * be one request per row painted.
 *
 * **`contact` is not selected.** It is third-party personal data that the Reader
 * can see by an explicit decision (RF-105), the chain of provenance never prints
 * it, and the narrowest possible select is the cheapest protection there is
 * against it landing in a screen nobody meant to put it in.
 *
 * **Retired records are loaded.** A link that names one still has to say its
 * name — hiding it would leave a blank where an owner used to be — and who
 * refuses to OFFER it is the chooser (`partyChoices`), not this hook.
 *
 * It lives in this folder and not one above because the folder above has no owner
 * while four documentary blocks are being built at once. It knows nothing about
 * provenance and is written to move up unchanged.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import type { PartyRef } from '../documentaryFormat'
import { newPartyPayload, newPartyProblem, type NewPartyDraft } from './partyChoice'

/** Exactly `PartyRef`, and nothing else. See RF-105 above. */
const PARTY_FIELDS = 'id, party_type, name, locality, country, active'

export interface PartiesQuery {
  parties: PartyRef[]
  loading: boolean
  error: string | null
  reload: () => Promise<void>
  /**
   * Creates a record and answers its identifier, or the sentence to show.
   *
   * Losing the race against somebody else creating the same one is a SUCCESS:
   * the answer is that record's identifier. The table is unique by the
   * normalized name — the same `place_key` the tree of places uses — so a
   * duplicate is not an error to report but a record that already exists, and
   * re-reading is what `usePhysicalPlaces` already decided in this situation.
   */
  addParty: (draft: NewPartyDraft) => Promise<{ id: string } | { error: string }>
}

/**
 * `enabled` false does not ask for anything.
 *
 * The register is only needed to WRITE a link — reading one paints the record
 * embedded in the row itself — so a Reader, and an editor who never opens the
 * form, do not pay a query for a master table they are not going to choose from.
 */
export function useParties(enabled = true): PartiesQuery {
  const [parties, setParties] = useState<PartyRef[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  const reload = useCallback(async () => {
    setLoading(true)
    const { data, error: failure } = await supabase
      .from('parties')
      .select(PARTY_FIELDS)
      .order('name', { ascending: true })
    if (!alive.current) return
    setLoading(false)
    if (failure) {
      setError(failure.message)
      // The list is NOT cleared: the names already painted keep the chain
      // readable, and nothing is written from a stale list — creating a link
      // sends an identifier the database checks.
      return
    }
    setError(null)
    setParties((data ?? []) as PartyRef[])
  }, [])

  useEffect(() => {
    if (!enabled) {
      // Not «still loading»: nothing was asked for, and a chooser that never
      // opens must not sit on «Cargando…» for ever.
      setLoading(false)
      return
    }
    void reload()
  }, [enabled, reload])

  const addParty = useCallback(
    async (draft: NewPartyDraft): Promise<{ id: string } | { error: string }> => {
      const problem = newPartyProblem(draft)
      if (problem !== null) return { error: problem }

      const { data, error: failure } = await supabase
        .from('parties')
        .insert(newPartyPayload(draft))
        .select('id')
        .single()

      if (failure) {
        // 23505: unique violation. Somebody wrote the same name first, which is
        // what was wanted; the existing one is looked up and used.
        if (failure.code === '23505') {
          const { data: rows } = await supabase.from('parties').select(PARTY_FIELDS)
          const known = ((rows ?? []) as PartyRef[]).find(
            (party) =>
              party.name.localeCompare(draft.name.trim(), 'es', { sensitivity: 'base' }) === 0,
          )
          await reload()
          if (known) return { id: known.id }
          return { error: 'Ya hay una ficha con ese nombre, pero no se ha podido localizar.' }
        }
        return { error: `No se ha podido crear la ficha: ${failure.message}` }
      }

      await reload()
      return { id: (data as { id: string }).id }
    },
    [reload],
  )

  return { parties, loading, error, reload, addParty }
}
