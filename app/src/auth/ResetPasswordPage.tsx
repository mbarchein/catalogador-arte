import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Layout } from '../components/Layout'
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
      setError('No se ha podido cambiar la contraseña. Vuelve a pedir el correo de recuperación e inténtalo otra vez.')
      return
    }
    setDone(true)
    // The confirmation gets a moment to be read before returning to the
    // catalog.
    setTimeout(() => navigate('/', { replace: true }), 1500)
  }

  return (
    <Layout title="Nueva contraseña" back="/">
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
