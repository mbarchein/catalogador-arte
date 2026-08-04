/**
 * The exhibition venues, loaded whole (RF-512, RF-1106).
 *
 * One query for the screen, like `usePhysicalPlaces` and `useSeries`: it is a
 * master table of dozens of rows and asking per row painted would be one request
 * per venue.
 *
 * **Retired venues are loaded.** This is the only screen a retired venue can be
 * brought back from, and hiding them here would hide the only way out — and the
 * unique index covers them, so a name that «does not exist» in a filtered list is
 * a name the database will still refuse.
 *
 * It lives in `features/tables/` and not one level up because the venue chooser of
 * the exhibition history reads its venue embedded in the exhibition row and needs
 * nothing from here. It knows nothing about this screen and is written to move.
 *
 * **Every decision is in `exhibitionVenues.ts`, which is pure and tested.** What
 * is left here is the wire: the request, the reload, and handing the answer to
 * `venueWriteResult`. The convention of the section: an action resolves to null
 * when it worked and to the sentence to show when it did not.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { ExhibitionVenue } from '../../lib/types'
import {
  planVenueAddition,
  planVenueEdit,
  sortVenues,
  venueFailureText,
  venueWriteResult,
  type VenueDraft,
} from './exhibitionVenues'

/**
 * Exactly the columns the screen paints, and no more. The audit and trash trail
 * (`created_by`, `deactivated_at`…) is sealed by the database and belongs to
 * whoever audits the catalogue (RF-906), not to a list of names.
 */
const VENUE_COLUMNS = 'id, name, locality, country, party_id, note, active'

export interface VenuesQuery {
  venues: ExhibitionVenue[]
  loading: boolean
  error: string | null
  reload: () => Promise<void>
  addVenue: (draft: VenueDraft) => Promise<string | null>
  saveVenue: (id: string, draft: VenueDraft) => Promise<string | null>
  setVenueActive: (id: string, active: boolean) => Promise<string | null>
}

export function useExhibitionVenues(): VenuesQuery {
  const [venues, setVenues] = useState<ExhibitionVenue[]>([])
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
    const { data, error: failure } = await supabase.from('exhibition_venues').select(VENUE_COLUMNS)
    if (!alive.current) return
    setLoading(false)
    if (failure) {
      setError(venueFailureText(failure, 'load'))
      // The list is NOT cleared: the rows already painted keep the screen
      // readable, and nothing is written from a stale list — every write sends an
      // identifier the database checks.
      return
    }
    setError(null)
    // Sorted here and not in the query: the database's own collation may order
    // «Ávila» past the z, and a list that hides the A's at the bottom is a list
    // nothing gets found in.
    setVenues(sortVenues((data ?? []) as ExhibitionVenue[]))
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  /**
   * Retires a venue, or brings it back (RF-901: nothing is ever really deleted).
   *
   * The database refuses to retire one that still hosts exhibitions, in Spanish
   * and with a hint about what to do first (`tg_exhibition_venue_deactivation`),
   * and that is the sentence that gets shown. **No count of exhibitions is kept
   * here**, following the artwork-types and series screens: this screen would have
   * to keep it in step with every exhibition saved from a phone, and a rule with
   * two copies is a rule that drifts.
   *
   * `select('id')` is not decoration: without it PostgREST answers 204 and no
   * error to an update that matched nothing, and the screen would report a
   * retirement that never happened. See `venueWriteResult`.
   */
  const setVenueActive = useCallback(
    async (id: string, active: boolean): Promise<string | null> => {
      const { data, error: failure } = await supabase
        .from('exhibition_venues')
        .update({ active })
        .eq('id', id)
        .select('id')
      const message = venueWriteResult(active ? 'restore' : 'retire', {
        failure,
        rows: (data ?? []).length,
      })
      // Reloaded even when it failed: a refusal usually means somebody else's data
      // decided it, and the screen showing that data stale is what made the
      // cataloger try.
      await reload()
      return message
    },
    [reload],
  )

  /**
   * Adds a venue. Resolves to the sentence to show, or null when it worked.
   *
   * A venue that is already there is a success and not an error, in the three ways
   * it can already be there: identical, equivalent but for capitals or accents in
   * the name or the locality, and RETIRED — the last one comes back, because that
   * is what typing it means (see `planVenueAddition`).
   *
   * **Restoring brings back only `active`.** The row already has its own country
   * and note, and re-typing a name is not authority to overwrite them: a retired
   * «Casa de Cultura, Mérida, México» stays Mexican, and correcting it is one tap
   * on «Editar» — where the change is visible and deliberate.
   */
  const addVenue = useCallback(
    async (draft: VenueDraft): Promise<string | null> => {
      const plan = planVenueAddition(venues, draft)
      if (plan.action === 'blank') return plan.message
      if (plan.action === 'reuse') return null
      if (plan.action === 'restore') return setVenueActive(plan.venue.id, true)

      const { error: failure } = await supabase.from('exhibition_venues').insert(plan.payload)
      if (failure) {
        // 23505: unique violation on (place_key(name), place_key(locality)). Either
        // somebody inserted the same venue a second ago — a race that is a success
        // — or the loaded copy was stale and the venue is there, possibly retired.
        // Re-read and decide again: it is the same decision with fresh data.
        if (failure.code !== '23505') return venueFailureText(failure, 'create')
        const { data } = await supabase.from('exhibition_venues').select(VENUE_COLUMNS)
        const again = planVenueAddition((data ?? []) as ExhibitionVenue[], draft)
        if (again.action === 'restore') return setVenueActive(again.venue.id, true)
      }
      await reload()
      return null
    },
    [venues, reload, setVenueActive],
  )

  /**
   * Saves an edited venue: name, locality, country and note in one write.
   *
   * The four travel together because three of them are one datum: (name, locality)
   * is the identity the database holds unique, and correcting «casa de cultura» to
   * «Casa de Cultura de Zafra» while moving the locality out of the name is one
   * edit of one venue, not two. The whole catalogue reads it at once, which is the
   * reason the table exists (ADR-007).
   *
   * `party_id` is not written and not cleared: this screen does not offer the
   * institution behind the venue, and a save that blanked it would throw away a
   * link made elsewhere.
   */
  const saveVenue = useCallback(
    async (id: string, draft: VenueDraft): Promise<string | null> => {
      const plan = planVenueEdit(venues, id, draft)
      if (plan.action === 'blank' || plan.action === 'duplicate') return plan.message
      if (plan.action === 'unchanged') return null

      const { data, error: failure } = await supabase
        .from('exhibition_venues')
        .update(plan.payload)
        .eq('id', id)
        .select('id')
      const message = venueWriteResult('save', { failure, rows: (data ?? []).length })
      await reload()
      return message
    },
    [venues, reload],
  )

  return { venues, loading, error, reload, addVenue, saveVenue, setVenueActive }
}
