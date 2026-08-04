/**
 * Writing the chain of provenance (RF-509, RF-517).
 *
 * Four operations and no more: add a link at the end, correct one, retire one,
 * and rearrange the order. There is no delete and there never will be — retiring
 * is an update of `active` (RF-901), and the table carries the full trash trail
 * so restoring keeps the record of the previous removal.
 *
 * Every one of them ends in the caller's `reload`: these rows do not arrive by
 * Realtime (`useLiveChanges` only knows `artworks` and `images`), so what is on
 * screen after a write is what the database answers when asked again — never
 * what this file guessed it wrote.
 *
 * The shaping and the checking are NOT here: they are pure and live in
 * `provenanceDraft.ts`, where the battery can reach them. What is here is the
 * plumbing and the Spanish around a refusal.
 */

import { useCallback, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import type { ProvenanceEventRow } from '../documentaryRows'
import { draftPayload, insertPayload, movedChainIds, type ProvenanceDraft } from './provenanceDraft'

export interface ProvenanceEdits {
  /** A write is in flight: the controls wait instead of firing twice. */
  saving: boolean
  /** Adds the link at the END of the chain, where the database's trigger puts it. */
  addLink: (draft: ProvenanceDraft) => Promise<string | null>
  /** Corrects an existing link. */
  saveLink: (draft: ProvenanceDraft) => Promise<string | null>
  /** Retires it (RF-901). Never a delete. */
  retireLink: (id: string) => Promise<string | null>
  /** Rearranges the whole chain, all or nothing. */
  reorder: (rows: readonly ProvenanceEventRow[], from: number, to: number) => Promise<string | null>
}

/**
 * The writes of one artwork's chain.
 *
 * Every operation answers null when it worked and the database's own message
 * when it did not. That message is worth showing verbatim: the refusals of this
 * table are written in Spanish and say what to do next — «Cambia antes el estado
 * de la procedencia a "En curso" o "Completa"» is the answer to adding a link to
 * a block declared investigated with no results (RF-218), and rewriting it here
 * would be a second copy of a rule that lives next to the data.
 */
export function useProvenanceEdits(
  catalogId: string,
  reload: () => Promise<void>,
): ProvenanceEdits {
  const [saving, setSaving] = useState(false)

  const run = useCallback(
    async (work: () => Promise<{ error: { message: string } | null }>): Promise<string | null> => {
      setSaving(true)
      const { error } = await work()
      if (error) {
        setSaving(false)
        return error.message
      }
      // The reload happens BEFORE releasing the controls: between the write and
      // the answer the chain on screen is the old one, and a form that reopens
      // over stale rows is how a link gets written twice.
      await reload()
      setSaving(false)
      return null
    },
    [reload],
  )

  const addLink = useCallback(
    (draft: ProvenanceDraft) =>
      run(async () => await supabase.from('provenance_events').insert(insertPayload(draft, catalogId))),
    [catalogId, run],
  )

  const saveLink = useCallback(
    (draft: ProvenanceDraft) =>
      run(async () => {
        if (draft.id === null) {
          return { error: { message: 'Este eslabón todavía no existe: no hay nada que corregir.' } }
        }
        return await supabase
          .from('provenance_events')
          .update(draftPayload(draft))
          .eq('id', draft.id)
      }),
    [run],
  )

  const retireLink = useCallback(
    (id: string) =>
      run(
        async () =>
          await supabase.from('provenance_events').update({ active: false }).eq('id', id),
      ),
    [run],
  )

  /**
   * The whole chain in its new order.
   *
   * The RPC demands EXACTLY the artwork's active links: a stale client — someone
   * else added or retired one meanwhile — gets a readable refusal instead of half
   * an order, and half an order is worse than none because it reads as an order.
   * Whatever happens, the reload brings the real one.
   */
  const reorder = useCallback(
    (rows: readonly ProvenanceEventRow[], from: number, to: number) =>
      run(
        async () =>
          await supabase.rpc('reorder_provenance_events', {
            p_catalog_id: catalogId,
            p_event_ids: movedChainIds(rows, from, to),
          }),
      ),
    [catalogId, run],
  )

  return { saving, addLink, saveLink, retireLink, reorder }
}
