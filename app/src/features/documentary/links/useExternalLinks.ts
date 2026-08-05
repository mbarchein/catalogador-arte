/**
 * Lo que este bloque le pide a la base: los enlaces de la ficha, las fotografías
 * de las que puede colgar uno, y las cinco escrituras.
 *
 * Como en el resto de la documentación de la obra, aquí no se decide nada: el
 * orden, los grupos, las frases y la traducción de cada respuesta viven al lado
 * en `externalLinks.ts` y `linkDraft.ts`, que la batería sí puede abrir. Lo que
 * queda aquí es la petición.
 *
 * Ninguna escritura recarga nada por su cuenta: la sección espera la respuesta y
 * llama a su propio `reload()`. Estas filas **no llegan por Realtime** —su
 * migración decidió no publicarlas, con el argumento de que las añade la misma
 * persona que está mirando la ficha—, así que la única forma de que la lista y el
 * recuento de la cabecera cuadren es que los recargue quien los pintó.
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
 * Las columnas del enlace.
 *
 * `created_at` se pide porque es el orden dentro de un tipo (la tabla no lleva
 * `sort_order` a propósito). `checked_by` se pide y **no se resuelve a un nombre**:
 * el bloque enseña cuándo se comprobó, que es lo que decide si hay que volver a
 * mirar, y quién lo hizo es una consulta más a `profiles` para un dato que ya
 * guarda el historial de cambios.
 */
const LINK_COLUMNS =
  'id, artwork_id, image_id, url, title, link_type, note, archive_url, ' +
  'check_status, checked_at, checked_by, active, created_at'

/** Lo justo de cada fotografía: nombrarla, ordenarla y saber si es una reproducción (RF-1407). */
const PHOTO_COLUMNS = 'image_id, shot_type, sort_order, provenance, active'

export interface ExternalLinksState {
  /** Los enlaces de la obra y los de sus fotografías, en una sola lista. */
  readonly rows: readonly ExternalLinkRow[]
  /** Las fotografías de la obra, para nombrar los grupos y para elegir ancla. */
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
  /** Una escritura está en vuelo. Los controles se apagan con ella. */
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
  /** Añade el enlace (RF-1401). Null si ha ido bien; la frase en español si no. */
  readonly add: (draft: LinkDraft) => Promise<string | null>
  /** Corrige la dirección, el título, la clase o la nota. El ancla no se mueve. */
  readonly save: (linkId: string, draft: LinkDraft) => Promise<string | null>
  /** Retira o recupera (RF-1406). Nunca un `delete`: no hay privilegio y no va a haberlo. */
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
    // La función es `strict`: con nulo devuelve nulo, y eso no es un «sí».
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
