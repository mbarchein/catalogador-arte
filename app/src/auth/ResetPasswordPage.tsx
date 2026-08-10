import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Layout } from '../components/Layout'
import { useAuth } from './AuthContext'
import { PasswordField } from '../components/ui'
import { validateNewPassword } from '../lib/password'
import { supabase } from '../lib/supabase'

/**
 * Setting a new password. Reached in two ways: from the recovery email link
 * (which opens a temporary session and redirects here) or from "Mi perfil",
 * with the normal session. The operation is the same in both cases.
 */
export function ResetPasswordPage() {
  const navigate = useNavigate()
  const { finishPasswordRecovery, passwordRecovery } = useAuth()
  const [newPassword, setNewPassword] = useState('')
  const [repeated, setRepeated] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [done, setDone] = useState(false)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    const invalid = validateNewPassword(newPassword, repeated)
    if (invalid) {
      setError(invalid)
      return
    }
    setSending(true)
    setError(null)
    const { error: failure } = await supabase.auth.updateUser({ password: newPassword })
    setSending(false)
    if (failure) {
      setError('No se ha podido cambiar la contraseña. Vuelve a pedir el correo de recuperación.')
      return
    }

    // Whoever changes their password for fear that somebody knows it has to throw
    // that somebody out, not just leave them with the old password: the other sessions
    // are closed. If this failed, the password is ALREADY changed and saying so here
    // would turn a success into an error message, so it is let through.
    await supabase.auth.signOut({ scope: 'others' }).catch(() => undefined)

    // And with the password chosen, the recovery is no longer half done: the application
    // lets this screen be left again.
    finishPasswordRecovery()
    setDone(true)
    // The confirmation gets a moment to be read before returning to the
    // catalog.
    setTimeout(() => navigate('/', { replace: true }), 1500)
  }

  return (
    // With no bottom menu, however it is reached: choosing a password is a
    // task, not a section of the catalogue. Arriving from the e-mail the tabs
    // would also bounce back to this same screen —the application does not let anyone leave until
    // one is chosen—, which is a menu of five broken buttons; and arriving from the
    // profile they invite leaving mid-task, with «volver» already alongside.
    //
    // The «volver» only when there is somewhere to go: from the e-mail there is not.
    <Layout
      title="Nueva contraseña"
      back={passwordRecovery ? undefined : '/profile'}
      tabs={false}
    >
      {done ? (
        <div className="card text-sm">
          <p className="font-medium">Contraseña cambiada.</p>
          <p className="mt-1 text-stone-600">Ya puedes seguir trabajando con normalidad.</p>
        </div>
      ) : (
        <form onSubmit={save} className="card space-y-4">
          <p className="text-sm text-stone-600">
            Elige la contraseña nueva para tu cuenta. Al menos 8 caracteres.
          </p>

          <div>
            <label className="label" htmlFor="new-password">
              Contraseña nueva
            </label>
            <PasswordField id="new-password" value={newPassword} onChange={setNewPassword} />
          </div>

          <div>
            <label className="label" htmlFor="repeated">
              Repítela
            </label>
            <PasswordField id="repeated" value={repeated} onChange={setRepeated} />
          </div>

          {error && (
            <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">
              {error}
            </p>
          )}

          <button className="btn-primary w-full" disabled={sending}>
            {sending ? 'Guardando…' : 'Guardar la contraseña'}
          </button>
        </form>
      )}
    </Layout>
  )
}
