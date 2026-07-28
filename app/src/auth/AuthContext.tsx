import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { Profile } from '../lib/types'
import { clearArtworksSnapshot } from '../features/artworks/artworksCache'

interface AuthContextValue {
  session: Session | null
  profile: Profile | null
  loading: boolean
  /** RF-103: only Cataloger and Superuser write. */
  canEdit: boolean
  signOut: () => Promise<void>
}

const Context = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

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
      return
    }
    supabase
      .from('profiles')
      .select('id, email, name, role')
      .eq('id', session.user.id)
      .single()
      .then(({ data }) => setProfile(data as Profile | null))
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
        canEdit,
        signOut: async () => {
          // The local mirror holds catalog data, not preferences: it must not
          // stay readable on a shared device after the session ends.
          clearArtworksSnapshot()
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
