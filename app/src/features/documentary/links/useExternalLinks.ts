/**
 * What this block asks of the base: the record's links, the photographs
 * one can hang from, and the five writes.
 *
 * As in the rest of the artwork's documentation, nothing is decided here: the
 * order, the groups, the sentences and the translation of each answer live alongside
 * in `externalLinks.ts` and `linkDraft.ts`, which the suite can open. What
 * is left here is the request.
 *
 * No write reloads anything on its own: the section awaits the answer and
 * calls its own `reload()`. These rows **do not arrive by Realtime** —their
 * migration decided not to publish them, on the argument that they are added by the same
 * person who is looking at the record—, so the only way for the list and the
 * heading's count to agree is for whoever painted them to reload them.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import type { LinkCheckStatus } from '../../../lib/types'
import type { ExternalLinkRow, PhotoRef } from './externalLinks'
import {
  NOTHING_CHANGED,
  describeLinkFailure,
  insertPayload,
  updatePayload,
  type LinkDraft,
  type UrlVerdict,
} from './linkDraft'

/**
 * The link's columns.
 *
 * `created_at` is asked for because it is the order within a type (the table deliberately does not carry
 * `sort_order`). `checked_by` is asked for and **not resolved to a name**:
 * the block shows when it was checked, which is what decides whether one has to look
 * again, and who did it is one more query to `profiles` for a datum the
 * change history already stores.
 */
const LINK_COLUMNS =
  'id, artwork_id, image_id, url, title, link_type, note, archive_url, ' +
  'check_status, checked_at, checked_by, active, created_at'

/** Just enough of each photograph: to name it, order it and know whether it is a reproduction (RF-1407). */
const PHOTO_COLUMNS = 'image_id, shot_type, sort_order, provenance, active'

export interface ExternalLinksState {
  /** The artwork's links and those of its photographs, in a single list. */
  readonly rows: readonly ExternalLinkRow[]
  /** The artwork's photographs, to name the groups and to choose an anchor. */
  readonly photos: readonly PhotoRef[]
  readonly loading: boolean
  readonly error: string | null
  readonly reload: () => Promise<void>
}

/**
 * A record's links: the ones hanging from the artwork and the ones hanging from
 * any of its photographs.
 *
 * **They are three queries and not one, and the reason is the exclusive arc.**
 * `external_links` has no `catalog_id` column —each row hangs from one thing by a
 * declared foreign key—, so the photographs' ones are asked for through the relationship:
 * `images!inner(catalog_id)` with a filter over the embedded table, which is an
 * inner `join` and returns only the links whose shot belongs to this artwork.
 * Checked over HTTP against the local base before writing it, not assumed.
 *
 * The three go IN PARALLEL: they are three independent trips and chaining them
 * would triple the wait in the place where this is used, which is a storeroom with poor
 * coverage.
 *
 * **Who sees what is decided by the table's policy and not by this code.**
 * `external_links`' hides what is withdrawn from the Reader and, besides, inherits the visibility
 * of the record the link hangs from: an artwork that cannot be seen does not show
 * its links. That is why there is no filter by `active` here — whoever can edit has
 * to see what is withdrawn in order to be able to recover it (RF-1406).
 */
export function useExternalLinks(catalogId: string, enabled = true): ExternalLinksState {
  const [rows, setRows] = useState<readonly ExternalLinkRow[]>([])
  const [photos, setPhotos] = useState<readonly PhotoRef[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // The record is flicked past with a gesture (RF-311): an answer arriving after
  // the block has been unmounted must not paint the previous artwork's links
  // over the next one.
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  const reload = useCallback(async () => {
    if (!enabled || catalogId === '') return
    setLoading(true)
    const [own, ofPhotos, gallery] = await Promise.all([
      supabase.from('external_links').select(LINK_COLUMNS).eq('artwork_id', catalogId),
      supabase
        .from('external_links')
        .select(`${LINK_COLUMNS}, images!inner(catalog_id)`)
        .eq('images.catalog_id', catalogId),
      supabase.from('images').select(PHOTO_COLUMNS).eq('catalog_id', catalogId),
    ])
    if (!alive.current) return
    setLoading(false)

    const failure = own.error ?? ofPhotos.error ?? gallery.error
    if (failure) {
      // A block that could not be read is NOT painted empty: «no links» and «it could
      // not be asked» are two different things, and confusing them sends people
      // looking for a datum that is perfectly fine.
      setError(describeLinkFailure('load', failure))
      setRows([])
      setPhotos([])
      return
    }
    setError(null)
    setRows([
      ...((own.data ?? []) as unknown as ExternalLinkRow[]),
      ...((ofPhotos.data ?? []) as unknown as ExternalLinkRow[]),
    ])
    setPhotos((gallery.data ?? []) as unknown as PhotoRef[])
  }, [catalogId, enabled])

  useEffect(() => {
    void reload()
  }, [reload])

  return { rows, photos, loading, error, reload }
}

export interface LinkActions {
  /** A write is in flight. The controls go dark with it. */
  readonly saving: boolean
  /**
   * Asks the base whether it accepts this address (RF-1403).
   *
   * It calls `is_web_url`, which is the SAME function the table's `check` applies:
   * there is no second copy of the rule in the client and therefore there is
   * no copy that falls behind. It exists only to be able to explain the rejection
   * in Spanish before saving.
   *
   * It answers `UNKNOWN` when nobody has answered —no coverage—, and in that
   * case the caller **carries on and tries to store**: the real
   * validation is the table's `check`, which cannot be skipped, so all that
   * is lost with no network is the quality of the message. Blocking the save for not having
   * been able to ask would turn a coverage problem into a link that cannot
   * be added.
   */
  readonly verifyUrl: (url: string) => Promise<UrlVerdict>
  /** Adds the link (RF-1401). Null if it went well; the sentence in Spanish if not. */
  readonly add: (draft: LinkDraft) => Promise<string | null>
  /** Corrects the address, the title, the kind or the note. The anchor does not move. */
  readonly save: (linkId: string, draft: LinkDraft) => Promise<string | null>
  /** Withdraws or recovers (RF-1406). Never a `delete`: there is no privilege and there is not going to be. */
  readonly setActive: (linkId: string, active: boolean) => Promise<string | null>
  /**
   * Stamps the check done by hand (RF-1405) through the `record_link_check` RPC, which is
   * the only path: the three columns are frozen by a trigger, so a
   * normal `update` would leave them exactly as they were and in silence.
   */
  readonly check: (linkId: string, status: LinkCheckStatus | null) => Promise<string | null>
}

/**
 * The block's five writes.
 *
 * The two that go through `update` ask for the row back (`select()`) and
 * check that some row came back. It is not zeal: measured against the local base, a
 * `PATCH` with a Reader's session answers `200 []` and **not** an error, because
 * the UPDATE policy does not let them see the row. Treating that as success would tell
 * the user she has stored something that has not been stored.
 */
export function useLinkActions(): LinkActions {
  const [saving, setSaving] = useState(false)

  const verifyUrl = useCallback(async (url: string): Promise<UrlVerdict> => {
    const { data, error } = await supabase.rpc('is_web_url', { p_url: url })
    if (error) return 'UNKNOWN'
    // The function is `strict`: with null it returns null, and that is not a «yes».
    return data === true ? 'ACCEPTED' : data === false ? 'REFUSED' : 'UNKNOWN'
  }, [])

  const add = useCallback(async (draft: LinkDraft) => {
    setSaving(true)
    const { error } = await supabase.from('external_links').insert(insertPayload(draft))
    setSaving(false)
    return error ? describeLinkFailure('add', error, draft.url) : null
  }, [])

  const save = useCallback(async (linkId: string, draft: LinkDraft) => {
    setSaving(true)
    const { data, error } = await supabase
      .from('external_links')
      .update(updatePayload(draft))
      .eq('id', linkId)
      .select('id')
    setSaving(false)
    if (error) return describeLinkFailure('save', error, draft.url)
    return (data ?? []).length === 0 ? NOTHING_CHANGED : null
  }, [])

  const setActive = useCallback(async (linkId: string, active: boolean) => {
    setSaving(true)
    const { data, error } = await supabase
      .from('external_links')
      .update({ active })
      .eq('id', linkId)
      .select('id')
    setSaving(false)
    if (error) return describeLinkFailure(active ? 'restore' : 'retire', error)
    return (data ?? []).length === 0 ? NOTHING_CHANGED : null
  }, [])

  const check = useCallback(async (linkId: string, status: LinkCheckStatus | null) => {
    setSaving(true)
    const { error } = await supabase.rpc('record_link_check', {
      p_link_id: linkId,
      p_status: status,
    })
    setSaving(false)
    // The RPC does raise an exception when the link does not exist or when the caller
    // cannot edit, and both sentences arrive already written in Spanish for the
    // user: they are shown as is.
    return error ? describeLinkFailure('check', error) : null
  }, [])

  return { saving, verifyUrl, add, save, setActive, check }
}
