/**
 * La bibliografía del catálogo, cargada entera (RF-506, RF-606).
 *
 * **Entera y buscada en el cliente**, por lo mismo que las exposiciones: un catálogo
 * razonado de dos artistas tiene decenas o cientos de referencias, no cientos de
 * miles; una consulta pequeña contesta a cada pulsación sin viaje de ida y vuelta,
 * que es lo que hace la búsqueda usable con mala cobertura en un almacén. El día que
 * esta tabla pase de unos miles de filas, la búsqueda se va al servidor y el ranking
 * puro se queda donde está.
 *
 * **Las retiradas se cargan, y las esconde la pantalla.** La RLS decide qué llega —a
 * un Lector solo le llegan las vivas— así que para un Catalogador la lista trae
 * también la papelera, que es el único sitio desde el que una referencia retirada
 * puede volver. Filtrarlas aquí esconderría la única salida; el filtro es decisión
 * del índice (`rankReferences`), donde es puro y está probado.
 *
 * **Una sola escritura, y ninguna de alta**: corregir. Una referencia se CREA
 * citándola desde una obra —existe porque algo la cita— y eso sigue igual; lo que su
 * ficha propia añade es poder corregirla desde ella, con el mismo panel y el mismo
 * planificador que usa la ficha de obra. Y la corrección necesita justamente la lista
 * entera que este hook ya carga: el choque de la clave BibTeX se comprueba contra las
 * demás referencias, y sin ellas no se podría comprobar.
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
   * Corrige una referencia del catálogo. Responde null cuando entró —también cuando no
   * había nada que cambiar— y la frase que mostrar cuando no.
   *
   * Es la MISMA operación que la ficha de una obra, con el mismo `planReferenceEdit`:
   * lo que corrige el catálogo compartido no puede depender de por qué pantalla se
   * entró. Nada que teclear significa ninguna petición y, sobre todo, ninguna traza de
   * auditoría sobre una corrección que nadie ha hecho en una fila que lee todo el
   * catálogo.
   */
  updateReference: (id: string, draft: ReferenceEdit) => Promise<string | null>
}

export function useReferences(): ReferencesQuery {
  const [references, setReferences] = useState<ReferenceRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  // Se puede salir de la pantalla con la consulta en el aire, y escribir estado
  // sobre un componente que ya no está es un aviso sobre el que nadie puede actuar.
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  const reload = useCallback(async () => {
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
  }, [])

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
