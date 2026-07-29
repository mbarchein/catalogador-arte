import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { ArtistFund, SeriesEntry } from '../../lib/types'

/**
 * The series vocabulary, loaded from `series`.
 *
 * Each fund has its own set of series: «Paisajes de la sierra» is a Rotili
 * series, and offering it while cataloging Ruiz Campins invites a false datum
 * (the database rejects it outright — see the series_in_vocabulary trigger).
 *
 * ONE query serves the three consumers, which is why the fund is a parameter
 * of the hook and not a filter of the query:
 *  - the record and the capture flow pass the fund they work in and use
 *    `names`, the plain list of strings a ComboBox wants;
 *  - the list filter passes nothing and uses `entries`, because it offers the
 *    series of several funds at once and labels each option with its fund.
 *
 * Sorting happens here with es-ES collation, not in the query: the database
 * default collation may order accented names after 'z', and «Óleos de la
 * sierra» belongs with the o's.
 */
export function useSeries(fund?: ArtistFund) {
  const [entries, setEntries] = useState<SeriesEntry[]>([])
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    const { data, error } = await supabase.from('series').select('artist, name')
    if (error) {
      setError(error.message)
      return
    }
    setError(null)
    setEntries(
      ((data ?? []) as SeriesEntry[])
        .slice()
        .sort(
          (a, b) =>
            a.artist.localeCompare(b.artist) ||
            a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }),
        ),
    )
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  /**
   * The names of `fund`, ready for a ComboBox. Empty when no fund was given:
   * whoever needs more than one fund wants `entries`, where every name still
   * carries the fund it belongs to.
   */
  const names = useMemo(
    () => (fund === undefined ? [] : entries.filter((e) => e.artist === fund).map((e) => e.name)),
    [entries, fund],
  )

  /**
   * Adds an entry to the vocabulary OF A FUND. The fund is an explicit
   * argument and not the hook's parameter: this one writes, and which fund's
   * vocabulary grows must be readable at the call site. Resolves to an error
   * message in Spanish (what the ComboBox shows), or null when it worked —
   * including when someone else inserted the same name first: losing that race
   * against a teammate naming the same series is a success, not an error.
   */
  const addSeries = useCallback(
    async (name: string, artist: ArtistFund): Promise<string | null> => {
      const { error } = await supabase.from('series').insert({ artist, name: name.trim() })
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

  return { entries, names, error, reload, addSeries }
}
