/**
 * Con qué más está enlazado un documento del archivo (RF-516).
 *
 * Dos números, pedidos por un motivo: el panel que corrige un documento tiene que
 * decir a qué está a punto de afectar ANTES de guardar, y «lo verán las demás fichas»
 * es un aviso distinto de «lo verán las otras tres obras y una exposición». La
 * decisión la toma `documentReachNotice`, que es pura y tiene tests; aquí está el
 * cable.
 *
 * **Son dos peticiones HEAD con `count=exact`, no dos listas.** El panel necesita el
 * tamaño y nunca las filas, y las filas serían los títulos de otras obras dentro de
 * una hoja que habla de esta. Se piden solo con el panel abierto —`enabled`—, porque
 * esto es por documento y por apertura, sobre datos móviles, y no lo necesita nada
 * más de la ficha.
 *
 * Las dos mitades se cuentan aparte porque son dos tablas puente y una exposición no
 * es una obra: contarlas juntas daría un número que no se puede escribir en ninguna
 * frase honrada.
 */

import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import type { DocumentReach } from './documentEdit'

export function useDocumentUsage(
  documentId: string | null,
  catalogId: string,
  enabled: boolean,
): DocumentReach {
  const [reach, setReach] = useState<DocumentReach>({ otherArtworks: null, exhibitions: null })

  // The panel is closed with the count in the air, and the whole record is flicked past with the
  // thumb.
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  useEffect(() => {
    if (!enabled || documentId === null) {
      setReach({ otherArtworks: null, exhibitions: null })
      return
    }
    // Vuelta a «no se sabe» mientras viaja el recuento nuevo: dejar en pantalla el
    // número del documento anterior sería un aviso medido sobre el documento
    // equivocado, que es peor que no tener número.
    setReach({ otherArtworks: null, exhibitions: null })
    void (async () => {
      const [artworks, exhibitions] = await Promise.all([
        supabase
          .from('artwork_documents')
          .select('id', { count: 'exact', head: true })
          .eq('document_id', documentId)
          // Los vínculos retirados NO se cuentan: la ficha de esa obra ya no muestra
          // este documento, así que corregirlo no cambia nada de lo que ahí se lee
          // (RF-901).
          .eq('active', true)
          .neq('catalog_id', catalogId),
        supabase
          .from('exhibition_documents')
          .select('id', { count: 'exact', head: true })
          .eq('document_id', documentId)
          .eq('active', true),
      ])
      if (!alive.current) return
      // Un fallo deja el número en «no se sabe» y no pinta ningún error propio: el
      // panel sigue funcionando, y el aviso de encima de los campos dice que no se
      // ha podido contar. Un párrafo rojo sobre una advertencia se leería como un
      // motivo para no guardar.
      setReach({
        otherArtworks: artworks.error ? null : (artworks.count ?? null),
        exhibitions: exhibitions.error ? null : (exhibitions.count ?? null),
      })
    })()
  }, [documentId, catalogId, enabled])

  return reach
}
