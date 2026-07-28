import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

/**
 * The artwork-type vocabulary (RF-213), loaded from `artwork_types` and
 * sorted for the interface. The sort happens here with es-ES collation, not
 * in the query: the database default collation may order accented names
 * after 'z', and «Óleo» belongs with the o's.
 */
export function useArtworkTypes() {
  const [types, setTypes] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    const { data, error } = await supabase.from('artwork_types').select('name').order('name')
    if (error) {
      setError(error.message)
      return
    }
    setError(null)
    setTypes(
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
   * else inserted the same name first: a lost race against a teammate adding
   * "Acuarela" at the same time is a success, not an error.
   */
  const addType = useCallback(
    async (name: string): Promise<string | null> => {
      const { error } = await supabase.from('artwork_types').insert({ name: name.trim() })
      // 23505: unique violation. The entry already exists, which is what was
      // wanted.
      if (error && error.code !== '23505') {
        return `No se ha podido añadir el tipo: ${error.message}`
      }
      await reload()
      return null
    },
    [reload],
  )

  return { types, error, reload, addType }
}
