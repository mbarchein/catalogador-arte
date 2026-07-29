import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

/**
 * The series vocabulary, loaded from `series` and sorted for the interface.
 * The sort happens here with es-ES collation, not in the query: the database
 * default collation may order accented names after 'z', and «Óleos de la
 * sierra» belongs with the o's.
 *
 * Same shape as useArtworkTypes on purpose: both feed a ComboBox that adds to
 * an open vocabulary, and two hooks that behave differently for the same job
 * would be a trap for whoever reads one and assumes the other.
 */
export function useSeries() {
  const [series, setSeries] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    const { data, error } = await supabase.from('series').select('name').order('name')
    if (error) {
      setError(error.message)
      return
    }
    setError(null)
    setSeries(
      ((data ?? []) as { name: string }[])
        .map((r) => r.name)
        .sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' })),
    )
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  /**
   * Adds an entry to the vocabulary. Resolves to an error message in Spanish
   * (what the ComboBox shows), or null when it worked — including when someone
   * else inserted the same name first: losing that race against a teammate
   * naming the same series is a success, not an error.
   */
  const addSeries = useCallback(
    async (name: string): Promise<string | null> => {
      const { error } = await supabase.from('series').insert({ name: name.trim() })
      // 23505: unique violation. The entry already exists, which is what was
      // wanted.
      if (error && error.code !== '23505') {
        return `No se ha podido añadir la serie: ${error.message}`
      }
      await reload()
      return null
    },
    [reload],
  )

  return { series, error, reload, addSeries }
}
