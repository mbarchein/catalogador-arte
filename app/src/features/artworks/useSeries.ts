import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { activeNames, planAddition } from '../../lib/masterTables'
import type { ArtistFund, SeriesEntry } from '../../lib/types'

const COLUMNS = 'id, artist, name, active'

/**
 * The series vocabulary, loaded from `series`.
 *
 * Each fund has its own set of series: «Paisajes de la sierra» is a Rotili
 * series, and offering it while cataloging Ruiz Campins invites a false datum
 * (the database rejects it outright — see the series_in_vocabulary trigger and
 * artwork_series_matches_fund).
 *
 * ONE query serves the four consumers, which is why the fund is a parameter of
 * the hook and not a filter of the query:
 *  - the record and the capture flow pass the fund they work in and use `names`,
 *    the plain list of strings a ComboBox wants, still on offer;
 *  - the list filter passes nothing and uses `entries`, because it offers the
 *    series of several funds at once and labels each option with its fund;
 *  - the series screen (RF-1106) uses `entries` too, retired ones included: it is
 *    the only place a retired series can be brought back from.
 *
 * Sorting happens here with es-ES collation, not in the query: the database
 * default collation may order accented names after 'z', and «Óleos de la
 * sierra» belongs with the o's.
 */
export function useSeries(fund?: ArtistFund) {
  const [entries, setEntries] = useState<SeriesEntry[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    const { data, error } = await supabase.from('series').select(COLUMNS)
    setLoading(false)
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
   * The names of `fund` still on offer, ready for a ComboBox. Empty when no fund
   * was given: whoever needs more than one fund wants `entries`, where every
   * name still carries the fund it belongs to.
   */
  const names = useMemo(
    () => (fund === undefined ? [] : activeNames(entries.filter((e) => e.artist === fund))),
    [entries, fund],
  )

  /**
   * Retires a series, or brings it back (RF-901). The database refuses to retire
   * one that still has artworks inside and says what to do first; that sentence
   * is what gets shown, and it is not counted a second time here.
   */
  const setSeriesActive = useCallback(
    async (id: string, active: boolean): Promise<string | null> => {
      const { error } = await supabase.from('series').update({ active }).eq('id', id)
      if (error) return error.message
      await reload()
      return null
    },
    [reload],
  )

  /**
   * Adds an entry to the vocabulary OF A FUND. The fund is an explicit argument
   * and not the hook's parameter: this one writes, and which fund's vocabulary
   * grows must be readable at the call site.
   *
   * Equivalence is checked WITHIN the fund, because that is what is unique: the
   * same name in another fund is another series, and reusing across funds would
   * silently file a Ruiz Campins piece under a Rotili series.
   *
   * A name already there is a success in its three forms — identical, equivalent
   * but for capitals or accents, and retired, which is brought back (see
   * planAddition).
   */
  const addSeries = useCallback(
    async (name: string, artist: ArtistFund): Promise<string | null> => {
      const plan = planAddition(
        entries.filter((e) => e.artist === artist),
        name,
      )
      if (plan.action === 'blank') return 'Escribe el nombre de la serie'
      if (plan.action === 'reuse') return null
      if (plan.action === 'restore') return setSeriesActive(plan.entry.id, true)

      const { error } = await supabase.from('series').insert({ artist, name: plan.name })
      if (error) {
        // 23505: unique violation on the pair (fund, name). Either a lost race,
        // which is a success, or a stale copy of the vocabulary — possibly with
        // the name retired. Re-read and decide again with fresh data.
        if (error.code !== '23505') return `No se ha podido añadir la serie: ${error.message}`
        const { data } = await supabase.from('series').select(COLUMNS)
        const again = planAddition(
          ((data ?? []) as SeriesEntry[]).filter((e) => e.artist === artist),
          plan.name,
        )
        if (again.action === 'restore') return setSeriesActive(again.entry.id, true)
      }
      await reload()
      return null
    },
    [entries, reload, setSeriesActive],
  )

  /**
   * Renames a series. One row, and the artworks see it because they point at the
   * identifier (ADR-007).
   *
   * The second request is the same transition as in useArtworkTypes:
   * `artworks.series` still holds a copy of the name as text, the record form
   * sends it on every save and a trigger demands that it be in the vocabulary OF
   * THE ARTWORK'S FUND, so renaming without bringing the copy along leaves those
   * artworks unsaveable and the list filter pointing at nothing. Vocabulary
   * first, copy second — the other order is rejected by the trigger. The copy is
   * matched by `series_id`, which is exact and also reaches a text stored with
   * stray spaces; the fund needs no clause because the identifier already belongs
   * to one fund.
   *
   * The fund of an existing series is deliberately NOT changeable here. The
   * database would accept it and it would leave every artwork of the series
   * filed under a fund that is not theirs — a state an insert would refuse
   * (artwork_series_matches_fund) but that nothing re-checks afterwards.
   */
  const renameSeries = useCallback(
    async (id: string, name: string): Promise<string | null> => {
      const clean = name.trim()
      if (clean === '') return 'El nombre no puede quedar vacío'

      const { error } = await supabase.from('series').update({ name: clean }).eq('id', id)
      if (error) {
        if (error.code === '23505') return 'Ese fondo ya tiene una serie con ese nombre'
        return `No se ha podido renombrar: ${error.message}`
      }

      const { error: copyError } = await supabase
        .from('artworks')
        .update({ series: clean })
        .eq('series_id', id)
      await reload()
      if (copyError) {
        return `La serie se ha renombrado, pero sus obras siguen con el nombre anterior: ${copyError.message}`
      }
      return null
    },
    [reload],
  )

  return { entries, names, loading, error, reload, addSeries, renameSeries, setSeriesActive }
}
