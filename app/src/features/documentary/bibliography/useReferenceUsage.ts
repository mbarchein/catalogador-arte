/**
 * How many OTHER artworks cite a reference (RF-504, RF-506).
 *
 * One number, asked for one reason: the correction panel has to say what it is
 * about to affect before it is saved, and «lo verán las demás obras» is a
 * different warning from «lo verán las otras once obras». The decision it feeds
 * is `referenceReachNotice`, which is pure and tested; what is here is the wire.
 *
 * **It is a HEAD request with `count=exact`, not a list.** The panel needs the
 * size and never the rows, and the rows would be the titles of other artworks in
 * a sheet about this one. Measured against the gateway: the answer is a
 * `Content-Range` header and an empty body.
 *
 * It is asked only when a panel is actually open — `enabled` — because this is
 * per reference and per opening, over mobile data, and nothing else on the record
 * needs it.
 */

import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../../lib/supabase'

export interface ReferenceUsage {
  /**
   * Artworks other than this one that cite the reference, or NULL while it is
   * being counted and when the count failed.
   *
   * Null and not zero on failure, deliberately: the notice built from this says
   * «no se ha podido contar» in that case, and a zero would tell the cataloger
   * that nobody else is affected — which is the one thing this number exists to
   * prevent her from believing by mistake.
   */
  otherArtworks: number | null
}

export function useReferenceUsage(
  bibliographyId: string | null,
  catalogId: string,
  enabled: boolean,
): ReferenceUsage {
  const [otherArtworks, setOtherArtworks] = useState<number | null>(null)

  // The panel can be closed while the count is in the air, and the record can be
  // swiped away entirely.
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  useEffect(() => {
    if (!enabled || bibliographyId === null) {
      setOtherArtworks(null)
      return
    }
    // Back to «unknown» while the new count travels: keeping the previous
    // reference's number on screen would be a measured warning about the wrong
    // reference, which is worse than no number at all.
    setOtherArtworks(null)
    void (async () => {
      const { count, error } = await supabase
        .from('artwork_bibliography')
        .select('id', { count: 'exact', head: true })
        .eq('bibliography_id', bibliographyId)
        // Retired citations are NOT counted: that artwork's record does not show
        // this reference any more, so correcting it changes nothing anybody reads
        // there (RF-901).
        .eq('active', true)
        .neq('catalog_id', catalogId)
      if (!alive.current) return
      // A failure leaves it unknown and shows no error of its own: the panel
      // still works, and the notice above the fields says the number could not
      // be counted. An error paragraph about a warning would look like a reason
      // not to save.
      setOtherArtworks(error ? null : (count ?? null))
    })()
  }, [bibliographyId, catalogId, enabled])

  return { otherArtworks }
}
