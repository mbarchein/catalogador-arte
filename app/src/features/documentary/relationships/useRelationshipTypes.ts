import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { sortByName } from '../../../lib/masterTables'
import type { ArtworkRelationshipType } from '../../../lib/types'

const COLUMNS = 'id, name, inverse_name, is_symmetric, active'

/**
 * The vocabulary of relationship kinds (RF-217): «Pareja de», «Estudio previo
 * de», «Reverso de»…
 *
 * Five columns and not three, because this master is not a list of labels: each
 * entry carries `inverse_name` — the label the artwork at the OTHER end shows —
 * and `is_symmetric`, and the form reads both to ask which way round the
 * relationship goes. That pair is exactly what an enum could not carry, and the
 * reason the migration made this a table.
 *
 * **Read-only from here, deliberately.** Adding a kind means deciding its inverse
 * label and its symmetry, and the database freezes the symmetry the moment the
 * kind is used — rows written under one canonicalisation convention and rows
 * written under another cannot be told apart afterwards. That is a maintenance
 * screen's decision (RF-1106), taken once and calmly, not something to improvise
 * from a phone with the artwork in front of you. The six seeded kinds cover the
 * cases the catalogue has.
 *
 * Sorted here with es-ES collation and not in the query: the database's own
 * collation can order an accented name past the z.
 */
export function useRelationshipTypes() {
  const [entries, setEntries] = useState<ArtworkRelationshipType[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    const { data, error: failure } = await supabase
      .from('artwork_relationship_types')
      .select(COLUMNS)
    setLoading(false)
    if (failure) {
      setError(failure.message)
      return
    }
    setError(null)
    setEntries(sortByName((data ?? []) as unknown as ArtworkRelationshipType[]))
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  /**
   * The kinds still on offer. Retired ones are filtered HERE and not in the
   * query, for the reason the rest of the feature already gives: a relationship
   * pointing at a retired kind still has to be able to read its name, or the
   * record would show a code with no verb.
   */
  const offered = useMemo(() => entries.filter((entry) => entry.active), [entries])

  return { entries, offered, loading, error, reload }
}
