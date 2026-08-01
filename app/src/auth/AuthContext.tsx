import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { Profile } from '../lib/types'
import { clearArtworksCache } from '../features/artworks/artworksCache'

interface AuthContextValue {
  session: Session | null
  profile: Profile | null
  loading: boolean
  /**
   * True once the profile query has settled, whatever it answered.
   *
   * It is NOT the same as `profile !== null`, and the difference is what keeps a
   * cataloger from being bounced out of their own screen: between the session
   * arriving and the profile arriving, `canEdit` is false because the role is
   * unknown, not because it is No. A view that only exists for whoever can edit
   * has to wait for this before deciding — `loading` does not cover it, on
   * purpose, because the list paints from its local copy without waiting for
   * anything.
   */
  roleKnown: boolean
  /** RF-103: only Cataloger and Superuser write. */
  canEdit: boolean
  signOut: () => Promise<void>
}

const Context = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [roleKnown, setRoleKnown] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) {
      setProfile(null)
      setRoleKnown(false)
      return
    }
    let current = true
    supabase
      .from('profiles')
      .select('id, email, name, role')
      .eq('id', session.user.id)
      .single()
      .then(({ data }) => {
        if (!current) return
        setProfile(data as Profile | null)
        // Settled, and that includes having failed: a session with no readable
        // profile is a Reader as far as the interface goes, and leaving this
        // false would hang the views that wait for it.
        setRoleKnown(true)
      })
    return () => {
      current = false
    }
  }, [session])

  // The role is read from the profile, but the database is what truly decides.
  // This only avoids showing controls that would fail (RF-106): the real
  // protection is the RLS policies, not this boolean.
  const canEdit = profile?.role === 'CATALOGER' || profile?.role === 'SUPERUSER'

  return (
    <Context.Provider
      value={{
        session,
        profile,
        loading,
        roleKnown,
        canEdit,
        signOut: async () => {
          // The local mirror and the cached images hold catalog data, not
          // preferences: they must not stay readable on a shared device after
          // the session ends.
          clearArtworksCache()
          await supabase.auth.signOut()
        },
      }}
    >
      {children}
    </Context.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(Context)
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider')
  return ctx
}
