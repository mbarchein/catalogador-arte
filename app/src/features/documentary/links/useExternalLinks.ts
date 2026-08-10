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
 * Los enlaces de una ficha: los que cuelgan de la obra y los que cuelgan de
 * cualquiera de sus fotografías.
 *
 * **Son tres consultas y no una, y el motivo es el arco exclusivo.**
 * `external_links` no tiene columna `catalog_id` —cada fila cuelga de una cosa por
 * clave ajena declarada—, así que los de las fotografías se piden por la relación:
 * `images!inner(catalog_id)` con filtro sobre la tabla incrustada, que es un
 * `join` interno y devuelve solo los enlaces cuya toma es de esta obra.
 * Comprobado por HTTP contra la base local antes de escribirlo, no supuesto.
 *
 * Las tres van EN PARALELO: son tres viajes independientes y encadenarlos
 * triplicaría la espera en el sitio donde esto se usa, que es un almacén con mala
 * cobertura.
 *
 * **Quién ve qué lo decide la política de la tabla y no este código.** La de
 * `external_links` esconde al Lector lo retirado y, además, hereda la visibilidad
 * de la ficha de la que cuelga el enlace: una obra que no se puede ver no enseña
 * sus enlaces. Por eso no se filtra por `active` aquí — quien puede editar tiene
 * que ver lo retirado para poder recuperarlo (RF-1406).
 */
export function useExternalLinks(catalogId: string, enabled = true): ExternalLinksState {
  const [rows, setRows] = useState<readonly ExternalLinkRow[]>([])
  const [photos, setPhotos] = useState<readonly PhotoRef[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // La ficha se pasa con un gesto (RF-311): una respuesta que llega después de
  // que el bloque se haya desmontado no debe pintar los enlaces de la obra
  // anterior sobre la siguiente.
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
      // Un bloque que no ha podido leerse NO se pinta vacío: «sin enlaces» y «no
      // se ha podido preguntar» son dos cosas distintas, y confundirlas manda a
      // buscar un dato que está perfectamente bien.
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
   * Pregunta a la base si acepta esta dirección (RF-1403).
   *
   * Llama a `is_web_url`, que es la MISMA función que aplica el `check` de la
   * tabla: no hay una segunda copia de la regla en el cliente y por lo tanto no
   * hay una copia que se quede atrás. Existe solo para poder explicar el rechazo
   * en español antes de guardar.
   *
   * Contesta `UNKNOWN` cuando no ha contestado nadie —sin cobertura—, y en ese
   * caso quien llama **sigue adelante e intenta guardar**: la validación de
   * verdad es el `check` de la tabla, que no se puede saltar, así que lo único que
   * se pierde sin red es la calidad del mensaje. Bloquear el guardado por no haber
   * podido preguntar convertiría un problema de cobertura en un enlace que no se
   * puede añadir.
   */
  readonly verifyUrl: (url: string) => Promise<UrlVerdict>
  /** Adds the link (RF-1401). Null if it went well; the sentence in Spanish if not. */
  readonly add: (draft: LinkDraft) => Promise<string | null>
  /** Corrects the address, the title, the kind or the note. The anchor does not move. */
  readonly save: (linkId: string, draft: LinkDraft) => Promise<string | null>
  /** Withdraws or recovers (RF-1406). Never a `delete`: there is no privilege and there is not going to be. */
  readonly setActive: (linkId: string, active: boolean) => Promise<string | null>
  /**
   * Sella la comprobación a mano (RF-1405) por la RPC `record_link_check`, que es
   * el único camino: las tres columnas están congeladas por un trigger, así que un
   * `update` normal las dejaría exactamente como estaban y en silencio.
   */
  readonly check: (linkId: string, status: LinkCheckStatus | null) => Promise<string | null>
}

/**
 * Las cinco escrituras del bloque.
 *
 * Las dos que pasan por `update` piden la fila de vuelta (`select()`) y
 * comprueban que ha vuelto alguna. No es celo: medido contra la base local, un
 * `PATCH` con la sesión de un Lector contesta `200 []` y **no** un error, porque
 * la política de UPDATE no le deja ver la fila. Tratar eso como éxito le diría a
 * la usuaria que ha guardado algo que no se ha guardado.
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
    // La RPC sí levanta excepción cuando el enlace no existe o cuando quien llama
    // no puede editar, y las dos frases llegan ya escritas en español para la
    // usuaria: se muestran tal cual.
    return error ? describeLinkFailure('check', error) : null
  }, [])

  return { saving, verifyUrl, add, save, setActive, check }
}
