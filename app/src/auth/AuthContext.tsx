import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { Profile } from '../lib/types'
import { clearArtworksCache } from '../features/artworks/artworksCache'
import { clearExhibitionsCache } from '../features/exhibitions/exhibitionsCache'
import {
  clearRememberedRole,
  readRememberedRole,
  rememberRole,
  remembersEditing,
} from './rememberedRole'

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
   * Reads the current session's profile again.
   *
   * Used by whoever has just corrected their own name: without this the screen would keep
   * showing the old one until the next reload, and the name is not just a datum of the
   * profile — it is what is read in every artwork's «actualizado por».
   */
  refreshProfile: () => Promise<void>
  /**
   * The open session comes from the recovery link and has not yet chosen a
   * password (RF-112).
   *
   * While this is true, the application does not let anyone leave «Nueva contraseña».
   * Without it the e-mail's link **is an access**: it opens a normal session, and
   * whoever taps it and changes their mind stays inside the catalogue without ever
   * having known the password. Which is exactly what a recovery link cannot
   * be, because it lives forever in an inbox.
   */
  passwordRecovery: boolean
  /** Called once the new password has been chosen. */
  finishPasswordRecovery: () => void
  signOut: () => Promise<void>
}

/**
 * Where a half-done recovery is noted.
 *
 * In `sessionStorage` and not in memory because the notice arrives only once, on
 * opening the link: a page reload does not fire it again, and with no trace
 * left the session would read as a normal login — which is exactly the
 * hole this closes. And in `sessionStorage` and not `localStorage` because it
 * dies with the tab, as an abandoned recovery should die.
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
  // Read ONCE, and synchronously: the whole point is to have it in the first frame that
  // paints the menu. Nothing is painted before the session resolves (see App), so that
  // frame already knows whose session it is and can check the owner matches.
  const remembered = useRef(readRememberedRole()).current

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
      // Remembered for the next start, so the menu opens with the tabs it ended with
      // instead of building them a moment later. Only when the read brought something: a
      // failed query is not «this user is a Reader».
      if (data !== null) rememberRole(userId, data.role)
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
  //
  // While the answer is in the air, what this device remembers of THIS user stands in
  // for it, so the footer menu does not rebuild itself a moment after opening
  // (RNF-106). The moment the query settles the real answer wins, whatever it says: a
  // role taken away disappears from the interface without a reload.
  const canEdit = roleKnown
    ? profile?.role === 'CATALOGER' || profile?.role === 'SUPERUSER'
    : remembersEditing(remembered, userId)

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
          // El espejo del listado de exposiciones, por lo mismo: son datos del catálogo.
          clearExhibitionsCache()
          // Y el papel que este dispositivo recuerda: en un teléfono compartido, quien
          // entre después no abre el menú de quien salió.
          clearRememberedRole()
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
 *
 * **What the device remembers can only OFFER, never refuse.** `canEdit` answers from the
 * remembered role while the query is in the air, so «Tablas» opens without its wait; but
 * a remembered Reader still returns `loading` instead of `denied`, because turning
 * somebody away on a memory would bounce out of the screen whoever has just been made a
 * Cataloger — and a bounce is worse than a wait. A refusal is only ever the answer of the
 * database.
 */
export function useEditingAccess(): 'loading' | 'allowed' | 'denied' {
  const { canEdit, roleKnown } = useAuth()
  if (canEdit) return 'allowed'
  if (!roleKnown) return 'loading'
  return 'denied'
}
