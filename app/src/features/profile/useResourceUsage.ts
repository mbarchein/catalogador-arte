import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

/**
 * What the catalogue takes up, asked of the two places that know (RF-1202).
 *
 * ── TWO SOURCES, AND THEY FAIL SEPARATELY ───────────────────
 *
 * The base and the photograph store are counted by an SQL function; the master
 * archive, by the Edge function, which is where Backblaze's credentials live. They are
 * two requests to two different services and **one can go well and the other not**:
 * the failure is stored separately and whatever did arrive is shown all the same. Losing the
 * base's figure because Backblaze does not answer would be throwing away a good datum.
 *
 * It is not asked for by itself on opening the profile out of a whim to have it fresh: counting
 * the archive forces one to walk the bucket's whole listing, and that cannot happen
 * every time somebody comes in to look at their name. It is asked for on unfolding the section
 * and then only when «Actualizar» is pressed.
 */

export interface ResourceUsage {
  databaseBytes: number
  storageBytes: number
  storageObjects: number
}

/** What the SQL function returns, with its column names. */
interface UsageRow {
  database_bytes: number | string
  storage_bytes: number | string
  storage_objects: number | string
}

export interface MastersUsage {
  bytes: number
  objects: number
  /** The count stopped at the page cap: the figure above is a minimum. */
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

    // Both at once: they are different services and chaining them would only add
    // one's wait to the other's. `allSettled` and not `all` because the aim
    // is precisely that one falling over does not take the other with it.
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
        // The base's message is shown as is when there is one: this function's
        // speaks Spanish and says what has been denied.
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

/** Asks for the measurement once on mount. Used when the section is already in view. */
export function useResourceUsageOnMount() {
  const state = useResourceUsage()
  const { refresh } = state
  useEffect(() => {
    void refresh()
  }, [refresh])
  return state
}
