import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
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
  /**
   * Vuelve a leer el perfil de la sesión actual.
   *
   * Lo usa quien acaba de corregir su propio nombre: sin esto la pantalla seguiría
   * enseñando el viejo hasta la siguiente recarga, y el nombre no es un dato del
   * perfil y ya está — es lo que se lee en «actualizado por» de cada obra.
   */
  refreshProfile: () => Promise<void>
  /**
   * La sesión abierta viene del enlace de recuperación y todavía no ha elegido
   * contraseña (RF-112).
   *
   * Mientras esto sea cierto, la aplicación no deja salir de «Nueva contraseña».
   * Sin ello el enlace del correo **es un acceso**: abre una sesión normal, y
   * quien lo pulse y se arrepienta se queda dentro del catálogo sin haber sabido
   * nunca la contraseña. Que es justo lo que un enlace de recuperación no puede
   * ser, porque vive para siempre en una bandeja de entrada.
   */
  passwordRecovery: boolean
  /** Called once the new password has been chosen. */
  finishPasswordRecovery: () => void
  signOut: () => Promise<void>
}

/**
 * Dónde se apunta que hay una recuperación a medias.
 *
 * En `sessionStorage` y no en memoria porque el aviso llega una sola vez, al
 * abrir el enlace: una recarga de la página no lo vuelve a disparar, y sin dejar
 * rastro la sesión se leería como una entrada normal — que es exactamente el
 * agujero que esto cierra. Y en `sessionStorage` y no en `localStorage` porque
 * muere con la pestaña, como debe morir una recuperación abandonada.
 */
const RECOVERY_KEY = 'password-recovery'

function readRecoveryFlag(): boolean {
  try {
    return sessionStorage.getItem(RECOVERY_KEY) === '1'
  } catch {
    // Storage denied (private browsing in some browsers). With no mark there is no
    // confinement, but signing in cannot break either.
    return false
  }
}

function writeRecoveryFlag(active: boolean) {
  try {
    if (active) sessionStorage.setItem(RECOVERY_KEY, '1')
    else sessionStorage.removeItem(RECOVERY_KEY)
  } catch {
    // Same as above: not being able to record it cannot stop the application being used.
  }
}

const Context = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [roleKnown, setRoleKnown] = useState(false)
  const [passwordRecovery, setPasswordRecovery] = useState(readRecoveryFlag)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((event, newSession) => {
      setSession(newSession)
      if (event === 'PASSWORD_RECOVERY') {
        setPasswordRecovery(true)
        writeRecoveryFlag(true)
      }
      if (event === 'SIGNED_OUT') {
        setPasswordRecovery(false)
        writeRecoveryFlag(false)
      }
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  const userId = session?.user.id ?? null

  const readProfile = useCallback(async (): Promise<Profile | null> => {
    if (userId === null) return null
    const { data } = await supabase
      .from('profiles')
      .select('id, email, name, role')
      .eq('id', userId)
      .single()
    return data as Profile | null
  }, [userId])

  useEffect(() => {
    if (userId === null) {
      setProfile(null)
      setRoleKnown(false)
      return
    }
    let current = true
    void readProfile().then((data) => {
      if (!current) return
      setProfile(data)
      // Settled, and that includes having failed: a session with no readable
      // profile is a Reader as far as the interface goes, and leaving this
      // false would hang the views that wait for it.
      setRoleKnown(true)
    })
    return () => {
      current = false
    }
  }, [userId, readProfile])

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
        refreshProfile: async () => {
          const data = await readProfile()
          // What is there is only overwritten when the read brought something: a network
          // failure on refresh cannot leave the screen with no name and no role.
          if (data !== null) setProfile(data)
        },
        passwordRecovery,
        finishPasswordRecovery: () => {
          setPasswordRecovery(false)
          writeRecoveryFlag(false)
        },
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

/**
 * Whether this session may edit — with «not known yet» as its own answer.
 *
 * Every view that only exists for whoever can edit needs the same three-way
 * decision, and it needed it in six places with the ordering copied by hand. Copying
 * it is what produced the bug twice: the profile arrives AFTER the session, so a
 * screen that reads `canEdit` on the first render reads false and throws out the very
 * cataloger it belongs to — visible only on a hard reload of its URL, which is why it
 * survived the first fix.
 *
 * `denied` means the role is known and it is not enough. `loading` means the question
 * cannot be answered yet, and the caller has to wait rather than guess. What actually
 * protects the data is the RLS policies; this only decides what to paint.
 */
export function useEditingAccess(): 'loading' | 'allowed' | 'denied' {
  const { canEdit, roleKnown } = useAuth()
  if (!roleKnown) return 'loading'
  return canEdit ? 'allowed' : 'denied'
}
