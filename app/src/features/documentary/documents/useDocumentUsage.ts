/**
 * What else an archive document is linked to (RF-516).
 *
 * Two numbers, asked for for one reason: the panel that corrects a document has to
 * say what it is about to affect BEFORE saving, and «the other records will see it»
 * is a different warning from «the other three artworks and one exhibition will see it». The
 * decision is taken by `documentReachNotice`, which is pure and has tests; here is the
 * wiring.
 *
 * **They are two HEAD requests with `count=exact`, not two lists.** The panel needs the
 * size and never the rows, and the rows would be the titles of other artworks inside
 * a sheet that speaks of this one. They are asked for only with the panel open —`enabled`—, because
 * this is per document and per opening, over mobile data, and nothing else
 * in the record needs it.
 *
 * The two halves are counted separately because they are two bridge tables and an exhibition is
 * not an artwork: counting them together would give a number that cannot be written in any
 * honest sentence.
 */

import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import type { DocumentReach } from './documentEdit'

export function useDocumentUsage(
  documentId: string | null,
  catalogId: string,
  enabled: boolean,
): DocumentReach {
  const [reach, setReach] = useState<DocumentReach>({ otherArtworks: null, exhibitions: null })

  // The panel is closed with the count in the air, and the whole record is flicked past with the
  // thumb.
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  useEffect(() => {
    if (!enabled || documentId === null) {
      setReach({ otherArtworks: null, exhibitions: null })
      return
    }
    // Back to «not known» while the new count travels: leaving the previous
    // document's number on screen would be a measured warning about the wrong
    // document, which is worse than having no number.
    setReach({ otherArtworks: null, exhibitions: null })
    void (async () => {
      const [artworks, exhibitions] = await Promise.all([
        supabase
          .from('artwork_documents')
          .select('id', { count: 'exact', head: true })
          .eq('document_id', documentId)
          // Withdrawn links are NOT counted: that artwork's record no longer shows
          // this document, so correcting it changes nothing of what is read there
          // (RF-901).
          .eq('active', true)
          .neq('catalog_id', catalogId),
        supabase
          .from('exhibition_documents')
          .select('id', { count: 'exact', head: true })
          .eq('document_id', documentId)
          .eq('active', true),
      ])
      if (!alive.current) return
      // A failure leaves the number at «not known» and paints no error of its own: the
      // panel keeps working, and the warning above the fields says that it could not
      // be counted. A red paragraph over a warning would read as a
      // reason not to save.
      setReach({
        otherArtworks: artworks.error ? null : (artworks.count ?? null),
        exhibitions: exhibitions.error ? null : (exhibitions.count ?? null),
      })
    })()
  }, [documentId, catalogId, enabled])

  return reach
}
