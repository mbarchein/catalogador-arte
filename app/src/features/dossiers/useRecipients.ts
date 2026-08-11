/**
 * Who a dossier can be sent to: the active people and institutions, by name
 * (RF-508, RF-1601).
 *
 * A query of its own and deliberately narrow — two columns of the live rows —
 * because this is a chooser and not the maintenance screen. It is the same reason
 * `useParties` of the provenance chooser exists next to `usePartiesAdmin`, written
 * down there: **`contact` is not in the select**, so forty third parties'
 * telephone numbers never sit in this browser at once for a job that was choosing
 * a gallery.
 *
 * Retired parties are not offered: choosing one would put the catalogue's own
 * wastebasket into a document that goes outside. The one already chosen keeps
 * showing, because the screen paints the name it loaded with the dossier.
 */

import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

export interface Recipient {
  id: string
  name: string
}

export function useRecipients(enabled: boolean): { recipients: Recipient[]; loading: boolean } {
  const [recipients, setRecipients] = useState<Recipient[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!enabled) return
    let alive = true
    setLoading(true)
    void supabase
      .from('parties')
      .select('id, name')
      .eq('active', true)
      .then(({ data }) => {
        if (!alive) return
        setLoading(false)
        // Ordered here and not in the query: the database's collation can sort
        // «Álvarez» past the z, and this list is read by eye.
        setRecipients(
          ((data ?? []) as Recipient[])
            .slice()
            .sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' })),
        )
      })
    return () => {
      alive = false
    }
  }, [enabled])

  return { recipients, loading }
}
