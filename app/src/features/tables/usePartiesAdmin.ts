/**
 * The register of people and institutions, for its maintenance screen (RF-508,
 * RF-1106, RF-105).
 *
 * **Every decision lives in `parties.ts`, which is pure and tested.** What is left
 * here is the wire: the requests, the reload, and handing each answer to the
 * function that turns it into a sentence. The convention of the section: an action
 * resolves to null when it worked and to the sentence to show when it did not.
 *
 * It is not `useParties` of the record's chooser and does not replace it. That one
 * loads the four columns a chain of provenance prints, for a chooser, and is
 * deliberately narrow; this one loads what the screen paints and writes. Merging
 * them would drag the maintenance write paths into every artwork record.
 *
 * ── THE CONTACT IS NOT IN THE LIST QUERY ────────────────────
 *
 * `PARTY_COLUMNS` has no `contact`, and that is the point rather than an oversight:
 * measured against the base, any authenticated Reader can read that column (RF-105
 * decided it out loud), so what the narrow select buys is not authorization — it is
 * that forty third parties' telephone numbers never sit in this browser at once for
 * a job that was renaming a museum. It is fetched one row at a time by
 * `loadContact`, only when the screen asks. See the header of `parties.ts`.
 *
 * ── AND THE RETIREMENT SAYS WHERE ───────────────────────────
 *
 * `setPartyActive` is the one action of the six master screens that asks the
 * database a second question. `tg_party_deactivation` checks provenance, then
 * rights holder, then venue, and raises on the FIRST one — so «no se puede retirar
 * una parte que sostiene un eslabón de procedencia» can be hiding two more uses,
 * and none of the three says WHICH artwork. `lookupUsage` answers that, and only
 * after the refusal: asked then, it cannot be a stale second copy of the rule the
 * way a counter painted next to the button would be.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import {
  emptyPartyUsage,
  partyFailureText,
  partyWriteResult,
  planPartyAddition,
  planPartyEdit,
  retireRefusalText,
  sortParties,
  type PartyDraft,
  type PartyListRow,
  type PartyUsage,
} from './parties'

/**
 * Exactly the columns the screen paints, `contact` excluded on purpose (see above).
 * The audit and trash trail (`created_by`, `deactivated_at`…) is sealed by the
 * database and belongs to whoever audits the catalogue (RF-906), not to a list.
 */
const PARTY_COLUMNS = 'id, party_type, name, locality, country, contact_status, note, active'

export interface PartiesAdminQuery {
  parties: PartyListRow[]
  loading: boolean
  error: string | null
  reload: () => Promise<void>
  /** The contact of ONE record, asked for when the screen needs it. */
  loadContact: (id: string) => Promise<{ contact: string } | { error: string }>
  addParty: (draft: PartyDraft) => Promise<string | null>
  saveParty: (id: string, opened: PartyDraft, draft: PartyDraft) => Promise<string | null>
  setPartyActive: (id: string, active: boolean) => Promise<string | null>
}

export function usePartiesAdmin(): PartiesAdminQuery {
  const [parties, setParties] = useState<PartyListRow[]>([])
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
    // Retired records included: this is the only screen one can be brought back
    // from, and the unique index covers them — a name that «does not exist» in a
    // filtered list is a name the database would still refuse.
    const { data, error: failure } = await supabase.from('parties').select(PARTY_COLUMNS)
    if (!alive.current) return
    setLoading(false)
    if (failure) {
      setError(partyFailureText(failure, 'load'))
      // The list is NOT cleared: the rows already painted keep the screen
      // readable, and nothing is written from a stale list — every write sends an
      // identifier the database checks.
      return
    }
    setError(null)
    setParties(sortParties((data ?? []) as PartyListRow[]))
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  /**
   * The contact of one record.
   *
   * One row and one column, which is the whole protection: the datum arrives
   * because somebody asked for that person's, not because a list was painted.
   *
   * A refusal is answered with a sentence and never with an empty string: the form
   * has to be able to tell «no contact written» from «could not read it», or the
   * next save would write the first over the second.
   */
  const loadContact = useCallback(
    async (id: string): Promise<{ contact: string } | { error: string }> => {
      const { data, error: failure } = await supabase
        .from('parties')
        .select('contact')
        .eq('id', id)
        .maybeSingle()
      if (failure) return { error: partyFailureText(failure, 'contact') }
      if (data === null) {
        return {
          error:
            'Esa ficha ya no está en el catálogo, así que no se han podido leer sus datos de ' +
            'contacto. Vuelve a cargar la pantalla.',
        }
      }
      return { contact: (data as { contact: string }).contact }
    },
    [],
  )

  /**
   * Where a party is in use, exactly as `tg_party_deactivation` counts it.
   *
   * The three conditions mirror the trigger and not something similar: the
   * provenance link must be active AND its artwork active (the trigger joins
   * `artworks`), the rights-holder artwork must be active, and the venue must be
   * active. Saying a retired artwork blocks the retirement would send the cataloger
   * looking for something she cannot find.
   *
   * The embedded `artworks!inner` is one request and not two, and the filter on the
   * embedded row was measured against the base. `catalog_id` is deduplicated
   * because a party can hold two links of the same chain — «propietario» and later
   * «depositario» is one artwork twice.
   *
   * Answers null when it could not be asked: the refusal then says so instead of
   * pretending the party is used nowhere.
   */
  const lookupUsage = useCallback(async (id: string): Promise<PartyUsage | null> => {
    const [links, rights, venues] = await Promise.all([
      supabase
        .from('provenance_events')
        .select('catalog_id, artworks!inner(active)')
        .eq('party_id', id)
        .eq('active', true)
        .eq('artworks.active', true),
      supabase
        .from('artworks')
        .select('catalog_id')
        .eq('rights_holder_party_id', id)
        .eq('active', true),
      supabase
        .from('exhibition_venues')
        .select('name, locality')
        .eq('party_id', id)
        .eq('active', true),
    ])
    if (links.error || rights.error || venues.error) return null

    const usage = emptyPartyUsage()
    usage.provenance = [
      ...new Set(((links.data ?? []) as { catalog_id: string }[]).map((row) => row.catalog_id)),
    ].sort()
    usage.rights = ((rights.data ?? []) as { catalog_id: string }[])
      .map((row) => row.catalog_id)
      .sort()
    usage.venues = ((venues.data ?? []) as { name: string; locality: string }[]).slice()
    return usage
  }, [])

  /**
   * Retires a record, or brings it back (RF-901: nothing is ever really deleted).
   *
   * `select('id')` is not decoration: measured against the base, a PATCH the
   * policies refuse comes back 200 with `[]` and NO error, so without counting rows
   * this screen would report a retirement that never happened.
   *
   * On a P0001 the usage is looked up and glued to the database's own sentence.
   * Only then — a lost session or a dead connection is not a usage problem, and
   * asking would answer a question nobody had.
   */
  const setPartyActive = useCallback(
    async (id: string, active: boolean): Promise<string | null> => {
      const { data, error: failure } = await supabase
        .from('parties')
        .update({ active })
        .eq('id', id)
        .select('id')

      if (failure && !active && (failure.code ?? '') === 'P0001') {
        const usage = await lookupUsage(id)
        await reload()
        return retireRefusalText(failure, usage)
      }

      const message = partyWriteResult(active ? 'restore' : 'retire', {
        failure,
        rows: (data ?? []).length,
      })
      // Reloaded even when it failed: a refusal usually means somebody else's data
      // decided it, and the screen showing that data stale is what made the
      // cataloger try.
      await reload()
      return message
    },
    [lookupUsage, reload],
  )

  /**
   * Adds a record. Resolves to the sentence to show, or null when it worked.
   *
   * A name that is already there is a success and not an error, in the three ways
   * it can be: identical, equivalent but for capitals and accents, and RETIRED —
   * the last one comes back, because that is what typing it means, and because the
   * retired record still holds the provenance of whatever artworks it held.
   *
   * **Restoring brings back only `active`.** The row already has its type, its
   * place, its contact and its note, and re-typing a name is not authority to
   * overwrite them — least of all the contact, which the add form never even loads.
   */
  const addParty = useCallback(
    async (draft: PartyDraft): Promise<string | null> => {
      const plan = planPartyAddition(parties, draft)
      if (plan.action === 'blank') return plan.message
      if (plan.action === 'reuse') return null
      if (plan.action === 'restore') return setPartyActive(plan.party.id, true)

      const { error: failure } = await supabase.from('parties').insert(plan.payload)
      if (failure) {
        // 23505 on `place_key(name)`: either somebody inserted the same name a
        // second ago — a race that is a success — or the loaded copy was stale and
        // the record is there, possibly retired. Re-read and decide again: the same
        // decision with fresh data.
        if ((failure.code ?? '') !== '23505') return partyFailureText(failure, 'create')
        const { data } = await supabase.from('parties').select(PARTY_COLUMNS)
        const again = planPartyAddition((data ?? []) as PartyListRow[], draft)
        if (again.action === 'restore') return setPartyActive(again.party.id, true)
        if (again.action === 'insert') {
          // Still not there after re-reading: something refused the insert that is
          // not a name already taken, and saying «añadida» would be a lie.
          await reload()
          return partyFailureText(failure, 'create')
        }
      }
      await reload()
      return null
    },
    [parties, reload, setPartyActive],
  )

  /**
   * Saves an edited record: type, name, place, contact, contact status and note in
   * one write.
   *
   * They travel together because they are one record and the database validates it
   * as one — and because the pair «name corrected, locality moved out of the name»
   * is one edit, not two. The whole catalogue reads it at once, which is why the
   * table exists (ADR-007).
   *
   * `opened` is the draft as the form opened it, and it is what `unchanged` compares
   * against: the contact is not on the row, so comparing to the row would either
   * ignore a corrected telephone number or report a change every time. **And when
   * the contact never loaded, the payload leaves the column out** — correcting the
   * name of a record whose contact could not be read must not erase it.
   */
  const saveParty = useCallback(
    async (id: string, opened: PartyDraft, draft: PartyDraft): Promise<string | null> => {
      const plan = planPartyEdit(parties, id, opened, draft)
      if (plan.action === 'blank' || plan.action === 'duplicate') return plan.message
      if (plan.action === 'unchanged') return null

      const { data, error: failure } = await supabase
        .from('parties')
        .update(plan.payload)
        .eq('id', id)
        .select('id')
      const message = partyWriteResult('save', { failure, rows: (data ?? []).length })
      await reload()
      return message
    },
    [parties, reload],
  )

  return { parties, loading, error, reload, loadContact, addParty, saveParty, setPartyActive }
}
