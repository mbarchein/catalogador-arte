/**
 * Las obras que citan una referencia (RF-506, RF-504).
 *
 * Es la consulta simétrica de la que hace la ficha de una obra: aquella pide las
 * citas de un `catalog_id` con la referencia incrustada, y esta pide las citas de una
 * referencia con la obra incrustada. Dos consultas y no una, porque son dos preguntas
 * distintas y cada una incrusta el extremo que la otra ya tiene.
 *
 * **Sin miniaturas, y no por ahorrar**: lo dice RF-506. Aquí la fila responde «¿en qué
 * página sale?», que es una pregunta de texto; en la ficha de una exposición sí las
 * hay porque allí lo que se reconoce es la pared. De paso, esta pantalla no firma
 * ninguna URL ni descarga un byte de imagen.
 *
 * Qué se enseña y en qué orden lo decide `referenceRecord.ts`, que es puro y tiene
 * tests. Aquí está el cable.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { referenceFailureText } from '../documentary/bibliography/referenceEdit'
import { CITED_ARTWORK_COLUMNS, type CitedArtworkRow } from './referenceRecord'

export interface CitedArtworksQuery {
  rows: CitedArtworkRow[]
  loading: boolean
  error: string | null
  reload: () => Promise<void>
}

export function useCitedArtworks(bibliographyId: string): CitedArtworksQuery {
  const [rows, setRows] = useState<CitedArtworkRow[]>([])
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
    if (bibliographyId === '') {
      setLoading(false)
      return
    }
    const { data, error: failure } = await supabase
      .from('artwork_bibliography')
      .select(CITED_ARTWORK_COLUMNS)
      .eq('bibliography_id', bibliographyId)
    if (!alive.current) return
    setLoading(false)
    if (failure) {
      setError(referenceFailureText(failure))
      return
    }
    setError(null)
    // Sin `order` en la consulta: el orden del bloque es el del identificador de
    // catalogación y se decide en `sortCitedArtworks`, donde es puro y está probado.
    setRows((data ?? []) as unknown as CitedArtworkRow[])
  }, [bibliographyId])

  useEffect(() => {
    void reload()
  }, [reload])

  return { rows, loading, error, reload }
}
