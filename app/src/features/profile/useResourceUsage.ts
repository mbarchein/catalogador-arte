import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

/**
 * Lo que ocupa el catálogo, preguntado a los dos sitios que lo saben (RF-1202).
 *
 * ── DOS FUENTES, Y FALLAN POR SEPARADO ──────────────────────
 *
 * La base y el almacén de fotografías los cuenta una función SQL; el archivo de
 * másters, la función Edge, que es donde viven las credenciales de Backblaze. Son
 * dos peticiones a dos servicios distintos y **una puede ir bien y la otra no**:
 * el fallo se guarda por separado y lo que sí llegó se enseña igual. Perder la
 * cifra de la base porque Backblaze no contesta sería tirar un dato bueno.
 *
 * No se pide sola al abrir el perfil por capricho de tenerlo fresco: contar el
 * archivo obliga a recorrer el listado entero del bucket, y eso no puede pasar
 * cada vez que alguien entra a mirarse el nombre. Se pide al desplegar la sección
 * y luego solo cuando se pulsa «Actualizar».
 */

export interface ResourceUsage {
  databaseBytes: number
  storageBytes: number
  storageObjects: number
}

/** Lo que devuelve la función SQL, con sus nombres de columna. */
interface UsageRow {
  database_bytes: number | string
  storage_bytes: number | string
  storage_objects: number | string
}

export interface MastersUsage {
  bytes: number
  objects: number
  /** El recuento se quedó en el tope de páginas: lo de arriba es un mínimo. */
  truncated: boolean
}

export function useResourceUsage() {
  const [usage, setUsage] = useState<ResourceUsage | null>(null)
  const [masters, setMasters] = useState<MastersUsage | null>(null)
  const [usageError, setUsageError] = useState<string | null>(null)
  const [mastersError, setMastersError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [measuredAt, setMeasuredAt] = useState<Date | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)

    // Las dos a la vez: son servicios distintos y encadenarlas solo sumaría la
    // espera de una a la de la otra. `allSettled` y no `all` porque el objetivo
    // es justo que una caída no se lleve por delante a la otra.
    const [fromDatabase, fromArchive] = await Promise.allSettled([
      supabase.rpc('resource_usage'),
      supabase.functions.invoke('sign-file', { body: { operation: 'usage' } }),
    ])

    if (fromDatabase.status === 'rejected') {
      setUsageError('No se ha podido medir la base de datos.')
    } else {
      const { data, error } = fromDatabase.value
      const row = (data as UsageRow[] | null)?.[0]
      if (error || !row) {
        // El mensaje de la base se enseña tal cual cuando lo hay: el de esta
        // función habla español y dice qué se ha negado.
        setUsageError(
          error?.message?.trim()
            ? `No se ha podido medir la base de datos: ${error.message}`
            : 'No se ha podido medir la base de datos.',
        )
      } else {
        setUsageError(null)
        setUsage({
          databaseBytes: Number(row.database_bytes ?? 0),
          storageBytes: Number(row.storage_bytes ?? 0),
          storageObjects: Number(row.storage_objects ?? 0),
        })
      }
    }

    if (fromArchive.status === 'rejected') {
      setMastersError('No se ha podido medir el archivo de másters.')
    } else {
      const { data, error } = fromArchive.value
      const answer = data as { bytes?: number; objects?: number; truncated?: boolean } | null
      if (error || !answer || typeof answer.bytes !== 'number') {
        setMastersError('No se ha podido medir el archivo de másters.')
      } else {
        setMastersError(null)
        setMasters({
          bytes: answer.bytes,
          objects: answer.objects ?? 0,
          truncated: answer.truncated === true,
        })
      }
    }

    setMeasuredAt(new Date())
    setLoading(false)
  }, [])

  return { usage, masters, usageError, mastersError, loading, measuredAt, refresh }
}

/** Pide la medida una vez al montar. Se usa cuando la sección ya está a la vista. */
export function useResourceUsageOnMount() {
  const state = useResourceUsage()
  const { refresh } = state
  useEffect(() => {
    void refresh()
  }, [refresh])
  return state
}
