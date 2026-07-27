import { useEffect, useRef } from 'react'
import { supabase } from './supabase'

/**
 * Live views: runs `onChange` when rows of a table change, over WebSocket
 * (Supabase Realtime). Delivery is already filtered by RLS with the user's
 * JWT: nobody receives through the channel what they could not query.
 *
 * The pattern is the one from the team's other application: the event does not
 * carry the truth, it triggers a reload. Rebuilding state from the event
 * payload looks more efficient and is the classic source of desynchronized
 * views — the reload asks for the data with the usual query, policies
 * included.
 */
export function useLiveChanges(
  table: 'artworks' | 'images',
  onChange: () => void,
  filter?: string,
) {
  // The callback lives in a ref to avoid resubscribing the channel on every
  // render: opening and closing WebSockets at React's pace is noise for the
  // server and loses events in the gaps between channels.
  const ref = useRef(onChange)
  ref.current = onChange

  useEffect(() => {
    const channel = supabase
      .channel(`live:${table}:${filter ?? 'all'}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table, ...(filter ? { filter } : {}) },
        () => ref.current(),
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [table, filter])
}
