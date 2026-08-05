/**
 * El archivo entero, y una ficha suya con lo que cuelga de ella (RF-515, RF-516).
 *
 * **Cargado entero y buscado en el cliente**, por lo mismo que la bibliografía y las
 * exposiciones: son decenas o cientos de documentos, no cientos de miles, y una consulta
 * pequeña contesta a cada pulsación sin viaje de ida y vuelta — que es lo que hace la
 * búsqueda usable con mala cobertura. El día que la tabla crezca, la búsqueda se va al
 * servidor y el ranking puro se queda donde está.
 *
 * **Los retirados se cargan y los esconde la pantalla**: la RLS decide qué llega, así
 * que para un Catalogador la lista trae la papelera, que es el único sitio desde el que
 * un documento retirado puede volver. El filtro es decisión del índice, donde es puro.
 *
 * Ninguna escritura: subir un documento y enlazarlo es de la ficha de una obra —así
 * queda subido y enlazado de una vez—, y corregirlo también. Estas pantallas son para
 * encontrarlo y leerlo, que era lo que no se podía hacer.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { describeDocumentRefusal } from '../documentary/documents/documentDraft'
import type { DocumentOption } from '../documentary/documents/documentLink'
import type { DocumentRow } from '../documentary/documentaryRows'
import { DOCUMENT_INDEX_COLUMNS } from './documentIndex'
import {
  DOCUMENT_RECORD_COLUMNS,
  LINKED_ARTWORK_COLUMNS,
  LINKED_EXHIBITION_COLUMNS,
  type LinkedArtworkRow,
  type LinkedExhibitionRow,
} from './documentRecord'

export interface ArchiveIndexQuery {
  documents: DocumentOption[]
  loading: boolean
  error: string | null
  reload: () => Promise<void>
}

/** Un `ref` que dice si el componente sigue montado. El mismo patrón que el resto. */
function useAlive() {
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])
  return alive
}

export function useArchiveIndex(): ArchiveIndexQuery {
  const [documents, setDocuments] = useState<DocumentOption[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const alive = useAlive()

  const reload = useCallback(async () => {
    const { data, error: failure } = await supabase
      .from('archive_documents')
      .select(DOCUMENT_INDEX_COLUMNS)
    if (!alive.current) return
    setLoading(false)
    if (failure) {
      setError(describeDocumentRefusal('load', failure))
      return
    }
    setError(null)
    // Sin `order`: el orden del índice es el de la estantería —la signatura normalizada
    // como la compara el índice único— y se decide en `sortArchiveDocuments`.
    setDocuments((data ?? []) as unknown as DocumentOption[])
  }, [alive])

  useEffect(() => {
    void reload()
  }, [reload])

  return { documents, loading, error, reload }
}

export interface DocumentRecordQuery {
  /** El documento, o null mientras carga y cuando esa dirección no es ninguno. */
  document: DocumentRow | null
  artworks: LinkedArtworkRow[]
  exhibitions: LinkedExhibitionRow[]
  loading: boolean
  /** Un fallo al leer el documento. */
  error: string | null
  /** Un fallo al leer lo que cuelga de él: la ficha se lee igual, y el bloque lo dice. */
  linksError: string | null
  reload: () => Promise<void>
}

/**
 * Una ficha del archivo con sus dos listas de vínculos.
 *
 * Tres consultas en paralelo y no una con dos incrustaciones: PostgREST las traería en
 * un solo viaje, pero un fallo en cualquiera de las dos puentes dejaría sin ficha. Así
 * el documento se lee aunque un bloque no cargue, y el bloque dice lo que le pasa.
 */
export function useDocumentRecord(id: string): DocumentRecordQuery {
  const [document, setDocument] = useState<DocumentRow | null>(null)
  const [artworks, setArtworks] = useState<LinkedArtworkRow[]>([])
  const [exhibitions, setExhibitions] = useState<LinkedExhibitionRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [linksError, setLinksError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const alive = useAlive()

  const reload = useCallback(async () => {
    if (id === '') {
      setLoading(false)
      return
    }
    const [row, links, shows] = await Promise.all([
      supabase.from('archive_documents').select(DOCUMENT_RECORD_COLUMNS).eq('id', id).maybeSingle(),
      supabase.from('artwork_documents').select(LINKED_ARTWORK_COLUMNS).eq('document_id', id),
      supabase.from('exhibition_documents').select(LINKED_EXHIBITION_COLUMNS).eq('document_id', id),
    ])
    if (!alive.current) return
    setLoading(false)

    if (row.error) setError(describeDocumentRefusal('load', row.error))
    else {
      setError(null)
      setDocument((row.data ?? null) as unknown as DocumentRow | null)
    }

    const linkFailure = links.error ?? shows.error
    setLinksError(linkFailure ? describeDocumentRefusal('load', linkFailure) : null)
    if (!links.error) setArtworks((links.data ?? []) as unknown as LinkedArtworkRow[])
    if (!shows.error) setExhibitions((shows.data ?? []) as unknown as LinkedExhibitionRow[])
  }, [id, alive])

  useEffect(() => {
    void reload()
  }, [reload])

  return { document, artworks, exhibitions, loading, error, linksError, reload }
}
