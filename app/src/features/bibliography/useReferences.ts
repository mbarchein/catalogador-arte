/**
 * The catalogue's bibliography, loaded whole (RF-506, RF-606).
 *
 * **Whole and searched in the client**, for the same reason as the exhibitions: a catalogue
 * raisonné of two artists has tens or hundreds of references, not hundreds of
 * thousands; a small query answers every keystroke with no round trip,
 * which is what makes the search usable with poor coverage in a storeroom. The day
 * this table goes beyond a few thousand rows, the search goes to the server and the pure ranking
 * stays where it is.
 *
 * **The withdrawn ones are loaded, and the screen hides them.** The RLS decides what arrives —a
 * Reader only receives the live ones— so for a Cataloguer the list also brings
 * the wastebasket, which is the only place from which a withdrawn reference
 * can come back. Filtering them here would hide the only way out; the filter is the
 * index's decision (`rankReferences`), where it is pure and tested.
 *
 * **A single write, and none for creation**: correcting. A reference is CREATED
 * by citing it from an artwork —it exists because something cites it— and that stays the same; what its
 * own record adds is being able to correct it from there, with the same panel and the same
 * planner the artwork record uses. And the correction needs precisely the whole
 * list this hook already loads: the BibTeX key clash is checked against the
 * other references, and without them it could not be checked.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { ReferenceRow } from '../documentary/documentaryRows'
import {
  planReferenceEdit,
  referenceFailureText,
  referenceWriteResult,
  type ReferenceEdit,
} from '../documentary/bibliography/referenceEdit'
import { REFERENCE_COLUMNS } from './bibliographyIndex'

export interface ReferencesQuery {
  references: ReferenceRow[]
  loading: boolean
  error: string | null
  reload: () => Promise<void>
  /**
   * Corrects a reference of the catalogue. Answers null when it went in —also when there
   * was nothing to change— and the sentence to show when it did not.
   *
   * It is the SAME operation as an artwork's record, with the same `planReferenceEdit`:
   * what corrects the shared catalogue cannot depend on which screen it was
   * entered by. Nothing to type means no request and, above all, no audit
   * trace over a correction nobody has made in a row the whole catalogue
   * reads.
   */
  updateReference: (id: string, draft: ReferenceEdit) => Promise<string | null>
}

/**
 * @param enabled Falso pide NADA. La ficha de una exposición carga la bibliografía entera
 *   solo cuando va a nombrar o a elegir su catálogo (RF-503): esa pantalla se abre muchas
 *   veces para leer una muestra, y quien solo lee no tiene por qué pagar el catálogo de
 *   referencias. Por omisión verdadero, que es lo que necesitan el listado y la ficha.
 */
export function useReferences(enabled = true): ReferencesQuery {
  const [references, setReferences] = useState<ReferenceRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  // The screen can be left with the query in the air, and writing state on a component
  // that is gone is a warning nobody can act upon.
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  const reload = useCallback(async () => {
    if (!enabled) {
      setLoading(false)
      return
    }
    // Se vuelve a pedir al pasar de apagado a encendido, y esa espera tiene que verse:
    // si no, el selector leería «todavía no hay ninguna referencia» mientras la primera
    // consulta está en el aire. Al listado no le cuesta nada, que solo enseña la espera
    // cuando no hay ninguna fila pintada.
    setLoading(true)
    const { data, error: failure } = await supabase.from('bibliography').select(REFERENCE_COLUMNS)
    if (!alive.current) return
    setLoading(false)
    if (failure) {
      setError(referenceFailureText(failure))
      // La lista NO se vacía: las filas ya pintadas mantienen la pantalla legible, y
      // de una lista vieja no se escribe nada — desde aquí no se escribe nada en
      // absoluto.
      return
    }
    setError(null)
    // Sin `order` en la consulta: el orden del índice es por autor con la
    // colación es-ES, y la de la base ordenaría «Álvarez» después de la z. Se decide
    // en `sortReferences`, donde es puro y está probado.
    setReferences((data ?? []) as unknown as ReferenceRow[])
  }, [enabled])

  useEffect(() => {
    void reload()
  }, [reload])

  const updateReference = useCallback(
    async (id: string, draft: ReferenceEdit): Promise<string | null> => {
      const plan = planReferenceEdit(references, id, draft)
      if (plan.action === 'blank' || plan.action === 'duplicate') return plan.message
      if (plan.action === 'unchanged') return null

      const { data, error: failure } = await supabase
        .from('bibliography')
        .update(plan.payload)
        .eq('id', id)
        .select('id')
      const message = referenceWriteResult({ failure, rows: (data ?? []).length })
      await reload()
      return message
    },
    [references, reload],
  )

  return { references, loading, error, reload, updateReference }
}
