/**
 * One exhibition: reading its record, correcting it, and retiring or recovering it
 * (RF-309, RF-901).
 *
 * The two writes are here and the decisions are next door, in
 * `exhibitionDraft.ts` and `exhibitionMessages.ts`, which is what lets the battery
 * verify them: it runs in node and cannot open a component.
 *
 * The record is asked for by identifier with `.single()`, which answers
 * `PGRST116` when there is nothing — measured — and that is a real case and not a
 * failure of the catalogue: a bookmark of a record never created, or a link
 * pasted wrong. `exhibitionFailureText` says it in Spanish.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { ExhibitionRow } from '../documentary/documentaryRows'
import { planExhibitionSave, type ExhibitionDraft } from './exhibitionDraft'
import { EXHIBITION_COLUMNS } from './exhibitionIndex'
import { exhibitionFailureText, exhibitionWriteResult } from './exhibitionMessages'

export interface ExhibitionQuery {
  exhibition: ExhibitionRow | null
  loading: boolean
  error: string | null
  /** A write is in flight. The controls disable themselves with it. */
  saving: boolean
  reload: () => Promise<void>
  /** Corrects it. Null when it worked, the sentence to show when it did not. */
  save: (draft: ExhibitionDraft) => Promise<string | null>
  /** Retires it or brings it back (RF-901). Never a delete: there is no privilege for one. */
  setActive: (active: boolean) => Promise<string | null>
  /**
   * Dice cuál de las referencias de la bibliografía es el catálogo de esta muestra, o
   * deja de decirlo con `null` (RF-503).
   *
   * **Su propia operación y no un campo del formulario**, y el motivo está en
   * `catalogueReference.ts`: la base la ata a `catalogue_published`, se elige en vez de
   * escribirse, y quitarla tiene sentido propio. Manda esta columna y ninguna otra, así
   * que el guardado del formulario sigue sin poder borrarla por descuido — que es la
   * garantía escrita más abajo, en `save`.
   */
  setCatalogueReference: (referenceId: string | null) => Promise<string | null>
}

export function useExhibition(id: string): ExhibitionQuery {
  const [exhibition, setExhibition] = useState<ExhibitionRow | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  const reload = useCallback(async () => {
    if (id === '') return
    const { data, error: failure } = await supabase
      .from('exhibitions')
      .select(EXHIBITION_COLUMNS)
      .eq('id', id)
      .single()
    if (!alive.current) return
    setLoading(false)
    if (failure) {
      setError(exhibitionFailureText(failure, 'loadOne'))
      // Kept, unlike the list: if a reload after a save fails, the record already
      // on screen is the last thing known to be true, and blanking it would turn a
      // lost connection into a record that looks deleted.
      return
    }
    setError(null)
    setExhibition(data as unknown as ExhibitionRow)
  }, [id])

  useEffect(() => {
    setLoading(true)
    void reload()
  }, [reload])

  /**
   * Saves the corrected record, all its fields in one write.
   *
   * `catalogue_reference_id` is NOT in the payload and is therefore not cleared:
   * this screen cannot choose the bibliographic record of the show's catalogue —
   * that needs the bibliography's chooser — and a save that blanked it would throw
   * away a link made elsewhere. «Lo que no se manda no se borra».
   *
   * `select('id')` is not decoration: PostgREST answers `[]` and no error to an
   * update that matched nothing — measured — and without counting the rows the
   * screen would report a correction that never happened.
   */
  const save = useCallback(
    async (draft: ExhibitionDraft): Promise<string | null> => {
      const current = exhibition
      if (current === null) {
        return 'La exposición todavía no se ha cargado. Espera a que aparezca y vuelve a guardar.'
      }
      const plan = planExhibitionSave(current, draft)
      if (plan.action === 'blank') return plan.message
      // Nothing changed: no request, and no `updated_at` moved. `tg_row_audit`
      // seals who and when on every update, and stamping a name on a change that
      // changed nothing would put an edit that never happened into the record's
      // own history.
      if (plan.action === 'unchanged') return null

      setSaving(true)
      const { data, error: failure } = await supabase
        .from('exhibitions')
        .update(plan.payload)
        .eq('id', current.id)
        .select('id')
      const message = exhibitionWriteResult('save', { failure, rows: (data ?? []).length })
      // Reloaded even when it failed: a refusal usually means somebody else's data
      // decided it, and the screen showing that data stale is what made the
      // cataloger try. It also brings back the year the trigger derived from the
      // opening date, which the form does not compute.
      await reload()
      if (alive.current) setSaving(false)
      return message
    },
    [exhibition, reload],
  )

  /**
   * Retires the exhibition, or brings it back (RF-901: nothing is ever really
   * deleted).
   *
   * **The database does not refuse this even with artworks inside, and that was
   * measured**: unlike a venue, which `tg_exhibition_venue_deactivation` protects,
   * a retired exhibition simply stops being visible and its participations stop
   * being visible with it (RF-905). There is therefore no refusal to translate —
   * what there is is a consequence the screen has to state and count before the
   * tap, which is `retireImpactText`'s job.
   */
  const setActive = useCallback(
    async (active: boolean): Promise<string | null> => {
      if (id === '') return null
      setSaving(true)
      const { data, error: failure } = await supabase
        .from('exhibitions')
        .update({ active })
        .eq('id', id)
        .select('id')
      const message = exhibitionWriteResult(active ? 'restore' : 'retire', {
        failure,
        rows: (data ?? []).length,
      })
      await reload()
      if (alive.current) setSaving(false)
      return message
    },
    [id, reload],
  )

  const setCatalogueReference = useCallback(
    async (referenceId: string | null): Promise<string | null> => {
      if (id === '') return null
      setSaving(true)
      const { data, error: failure } = await supabase
        .from('exhibitions')
        .update({ catalogue_reference_id: referenceId })
        .eq('id', id)
        .select('id')
      const message = exhibitionWriteResult('catalogue', {
        failure,
        rows: (data ?? []).length,
      })
      await reload()
      if (alive.current) setSaving(false)
      return message
    },
    [id, reload],
  )

  return { exhibition, loading, error, saving, reload, save, setActive, setCatalogueReference }
}
