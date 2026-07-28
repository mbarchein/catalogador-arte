import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

/**
 * Physical locations already used in the catalog, as suggestions. NOT a
 * controlled vocabulary: the location stays free text (a new shelf must not
 * require any ceremony), but the field schema's convention exists so that
 * equal places compare equal, and reusing what is already written is the
 * cheapest way to keep it.
 */
export function usePhysicalLocations() {
  const [locations, setLocations] = useState<string[]>([])

  useEffect(() => {
    let current = true
    void supabase
      .from('artworks')
      .select('physical_location')
      .neq('physical_location', '')
      .then(({ data }) => {
        if (!current || !data) return
        const values = (data as { physical_location: string }[]).map((r) => r.physical_location)
        setLocations([...new Set(values)].sort())
      })
    return () => {
      current = false
    }
  }, [])

  return locations
}
