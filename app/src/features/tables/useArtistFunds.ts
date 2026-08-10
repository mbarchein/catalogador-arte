import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { ArtistFund } from '../../lib/types'
import { sortFunds, type ArtistFundEntry } from './artistFunds'

const COLUMNS = 'id, code, prefix, name, active, hide_artworks'

interface FundRow {
  id: string
  code: ArtistFund
  prefix: string
  name: string
  active: boolean
  hide_artworks: boolean
}

const shape = (row: FundRow): ArtistFundEntry => ({
  id: row.id,
  code: row.code,
  prefix: row.prefix,
  name: row.name,
  active: row.active,
  hideArtworks: row.hide_artworks,
})

/**
 * What the base answers when it refuses, in Spanish.
 *
 * This table's two triggers —the one protecting the code and the prefix, and the
 * one preventing being left with no funds— speak Spanish and say what to do, so their
 * message is shown as is. Rewriting it here would be a second copy of a
 * rule that lives next to the datum.
 */
function describeFailure(action: 'load' | 'save', failure: { message?: string }): string {
  const said = (failure.message ?? '').trim()
  if (action === 'load') {
    return said === ''
      ? 'No se han podido leer los fondos.'
      : `No se han podido leer los fondos: ${said}`
  }
  return said === '' ? 'No se ha podido guardar el cambio.' : said
}

/**
 * The catalogue's funds (ADR-007, second delivery).
 *
 * **They are all read, active and withdrawn, and that is not an exception of this screen
 * but of the table**: every artwork carries its fund, so the withdrawn row has
 * to keep arriving or the record of an artwork of that fund would be left with no name.
 * The base's read policy says the same, and there is a test that pins it down.
 *
 * With no `addFund` and no delete: a new fund is a migration —it brings a prefix, and the
 * prefix enters the numbering and the signing of the archive's files— and
 * none is deleted. The base does not grant those privileges either, so this is not
 * only an omission of the interface.
 */
export function useArtistFunds() {
  const [entries, setEntries] = useState<ArtistFundEntry[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    const { data, error: failure } = await supabase.from('artist_funds').select(COLUMNS)
    setLoading(false)
    if (failure) {
      setError(describeFailure('load', failure))
      return
    }
    setError(null)
    setEntries(sortFunds(((data ?? []) as FundRow[]).map(shape)))
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  /** Sends a single field and reloads. Answers null when it went in. */
  const write = useCallback(
    async (id: string, patch: Record<string, unknown>): Promise<string | null> => {
      // `select('id')` for what the other maintenance screens already
      // learnt: an update the policies deny comes back 204 with no
      // error, and zero rows affected means it was not written.
      const { data, error: failure } = await supabase
        .from('artist_funds')
        .update(patch)
        .eq('id', id)
        .select('id')
      if (failure) return describeFailure('save', failure)
      if ((data ?? []).length === 0) {
        return 'No se ha podido guardar el cambio: tu cuenta es de solo consulta.'
      }
      await reload()
      return null
    },
    [reload],
  )

  return {
    entries,
    loading,
    error,
    reload,
    renameFund: (id: string, name: string) => write(id, { name: name.trim() }),
    setFundActive: (id: string, active: boolean) => write(id, { active }),
    setFundHidesArtworks: (id: string, hide: boolean) => write(id, { hide_artworks: hide }),
  }
}
