/**
 * The two accesses to the database the exhibition history needs beyond reading
 * itself: the shows it can be linked to, and the two writes over the bridge row.
 *
 * The history itself is read by `useArtworkExhibitions` (see `useDocumentary.ts`),
 * which is shared by the five blocks. What is here is only what this block adds,
 * and it follows the same rules: the shaping and every decision are pure and live
 * next door, the error carries the database's own message untranslated, and every
 * successful write ends in the caller's `reload()` — these rows do not arrive by
 * Realtime.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import type { ExhibitionRow } from '../documentaryRows'
import { EXHIBITION_OPTION_COLUMNS, participationPayload } from './participationEdits'

export interface ExhibitionOptionsQuery {
  options: ExhibitionRow[]
  loading: boolean
  error: string | null
  reload: () => Promise<void>
}

/**
 * The exhibitions on offer, most recent first.
 *
 * **Only the live ones**, unlike everywhere else in this feature: this is a list
 * to choose from, and a retired show must not be linked to a new artwork. The
 * history does load retired shows, because there a name that disappears is a
 * hole in a record — the two rules are not in tension, they are about two
 * different screens.
 *
 * Loaded WHOLE and filtered in the client. A catalogue raisonné of two artists
 * has dozens of exhibitions, not thousands; one small query answers every
 * keystroke without a round trip, which is what makes the chooser usable over a
 * bad connection in a warehouse. The day this table grows past a few hundred
 * rows, the search moves to the server and the pure ranking stays where it is.
 *
 * The most recent first because that is what is being catalogued: the show whose
 * catalogue is on the table right now is far likelier to be from this decade than
 * from 1978.
 *
 * `enabled` exists because the chooser is MOUNTED and hidden inside every closed
 * block of every record: without it, swiping through thirty artworks would fetch
 * the whole exhibitions table thirty times to fill a sheet nobody opened. While
 * it is false nothing is asked and `loading` stays true, which is the truth — the
 * list is not known — and is never read, because only the open sheet paints it.
 */
export function useExhibitionOptions(enabled = true): ExhibitionOptionsQuery {
  const [options, setOptions] = useState<ExhibitionRow[]>([])
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
    if (!enabled) return
    setLoading(true)
    const { data, error: failure } = await supabase
      .from('exhibitions')
      .select(EXHIBITION_OPTION_COLUMNS)
      .eq('active', true)
      // `year` and not the opening date: the database fills the year from the
      // date but never the date from the year, so it is the one column every
      // show has (`exhibitions_dated`). Nulls cannot happen, and are put last
      // rather than trusted.
      .order('year', { ascending: false, nullsFirst: false })
    if (!alive.current) return
    setLoading(false)
    if (failure) {
      setError(failure.message)
      setOptions([])
      return
    }
    setError(null)
    setOptions((data ?? []) as unknown as ExhibitionRow[])
  }, [enabled])

  useEffect(() => {
    void reload()
  }, [reload])

  return { options, loading, error, reload }
}

export interface ParticipationActions {
  /** A write is in flight. The controls disable themselves with it. */
  saving: boolean
  /**
   * Links this artwork to a show (RF-501). Answers null when it worked and the
   * database's own message when it did not.
   *
   * Through the `exhibit_artwork` RPC and never a plain insert: the unique
   * constraint covers retired participations, so adding one that is in the trash
   * has to restore it instead of crashing into the index (RF-517).
   */
  add: (exhibitionId: string, catalogueNumber: string, note: string) => Promise<string | null>
  /**
   * Retires the participation (RF-901). Never a delete: there is no DELETE
   * privilege on this table and there is not going to be one.
   */
  retire: (participationId: string) => Promise<string | null>
}

/**
 * The two writes of the block.
 *
 * Neither reloads anything by itself, on purpose: the rows belong to
 * `useArtworkExhibitions` and the count belongs to the heading, so the section
 * awaits the answer and calls its own `reload()`. A hook that refreshed a list it
 * does not own would refresh it at the wrong moment — before the count that the
 * heading reads.
 */
export function useParticipationActions(catalogId: string): ParticipationActions {
  const [saving, setSaving] = useState(false)

  const add = useCallback(
    async (exhibitionId: string, catalogueNumber: string, note: string) => {
      setSaving(true)
      const { error } = await supabase.rpc(
        'exhibit_artwork',
        participationPayload(catalogId, exhibitionId, catalogueNumber, note),
      )
      setSaving(false)
      return error ? error.message : null
    },
    [catalogId],
  )

  const retire = useCallback(async (participationId: string) => {
    setSaving(true)
    const { error } = await supabase
      .from('artwork_exhibitions')
      .update({ active: false })
      .eq('id', participationId)
    setSaving(false)
    return error ? error.message : null
  }, [])

  return { saving, add, retire }
}
