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
 * No hay ninguna escritura aquí, y es deliberado: una referencia se crea CITÁNDOLA
 * desde una obra —existe porque algo la cita— y se corrige desde la ficha que la
 * cita. Este listado es para encontrarla, que era lo que no se podía hacer.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { ReferenceRow } from '../documentary/documentaryRows'
import { referenceFailureText } from '../documentary/bibliography/referenceEdit'
import { REFERENCE_COLUMNS } from './bibliographyIndex'

export interface ReferencesQuery {
  references: ReferenceRow[]
  loading: boolean
  error: string | null
  reload: () => Promise<void>
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

  return { references, loading, error, reload }
}
