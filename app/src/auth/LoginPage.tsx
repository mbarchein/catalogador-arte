import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { PasswordField } from '../components/ui'
import {
  normalizeEmail,
  recoveryOutcome,
  recoveryText,
  resendText,
  secondsLeft,
} from './passwordRecovery'

export function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [recovering, setRecovering] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [sentAt, setSentAt] = useState<number | null>(null)
  const [waiting, setWaiting] = useState(0)

  // La cuenta atrás del reenvío. Un segundo basta: lo que se pinta son segundos.
  useEffect(() => {
    if (sentAt === null) return
    const tick = () => setWaiting(secondsLeft(sentAt, Date.now()))
    tick()
    const timer = setInterval(tick, 1000)
    return () => clearInterval(timer)
  }, [sentAt])

  async function signIn(e: React.FormEvent) {
    e.preventDefault()
    setSending(true)
    setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      // A network failure must NOT be confused with wrong credentials. The
      // same message used to be shown for both and that made a real case
      // undiagnosable: opening the app from the phone, the server was
      // configured with "localhost", which on the phone is the phone itself.
      // It looked like a mistyped password for a good while.
      //
      // Distinguishing leaks nothing: the server not answering says nothing
      // about which accounts exist. What stays generic is the credentials
      // message, because separating "no such account" from "wrong password"
      // would reveal who has access.
      const isNetwork = error.status === undefined || error.status === 0
      if (isNetwork) {
        setError(
          `No hay contacto con el servidor (${import.meta.env.VITE_SUPABASE_URL}). ` +
            'Comprueba que estás en la misma red.',
        )
      } else {
        setError('No se ha podido entrar. Revisa el correo y la contraseña.')
      }
    }
    setSending(false)
  }

  async function sendRecovery(e: React.FormEvent) {
    e.preventDefault()
    if (waiting > 0) return
    setSending(true)
    setError(null)
    setNotice(null)
    const { error } = await supabase.auth.resetPasswordForEmail(normalizeEmail(email), {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    setSending(false)

    // El resultado es el mismo pase lo que pase salvo que el servidor no
    // conteste. Ver `passwordRecovery.ts`: un mensaje distinto para una
    // dirección sin cuenta, o para un rechazo por ritmo, sería decir quién
    // tiene acceso al catálogo.
    const outcome = recoveryOutcome(error)
    if (outcome === 'unreachable') {
      // En rojo, porque es un problema y hay que volver a intentarlo. No filtra
      // nada: que la red esté caída se contesta igual para cualquier dirección.
      setError(recoveryText(outcome))
      return
    }
    setNotice(recoveryText(outcome))
    // La espera solo empieza cuando la petición llegó a salir: con la red caída,
    // obligar a esperar un minuto castigaría el intento que no se hizo.
    setSentAt(Date.now())
  }

  // At the top, not vertically centered: on the phone, focusing the email
  // opens the keyboard and a centered form ends up half covered or jumping.
  // Anchored at the top, the fields stay in view while typing.
  return (
    <div className="flex min-h-screen items-start justify-center p-4 pt-10">
      <form
        onSubmit={recovering ? sendRecovery : signIn}
        className="card w-full max-w-sm space-y-4"
      >
        <div>
          <h1 className="text-xl font-semibold">Catalogador</h1>
          <p className="text-sm text-stone-600">Rotili · Ruiz Campins</p>
        </div>

        {recovering && (
          <p className="text-sm text-stone-600">
            Escribe tu correo y te enviaremos un enlace para elegir una contraseña nueva.
          </p>
        )}

        <div>
          <label className="label" htmlFor="email">
            Correo
          </label>
          <input
            id="email"
            className="field"
            type="email"
            inputMode="email"
            autoComplete="username"
            autoCapitalize="none"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        {!recovering && (
          <div>
            <label className="label" htmlFor="password">
              Contraseña
            </label>
            {/* With show/hide: on the phone one types blind and the error
                message is generic on purpose, so seeing what was typed is the
                cheap way out when "it won't let me in". */}
            <PasswordField id="password" value={password} onChange={setPassword} />
          </div>
        )}

        {error && (
          <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">
            {error}
          </p>
        )}

        {notice && (
          <p role="status" className="rounded-lg bg-green-50 p-3 text-sm text-green-900">
            {notice}
          </p>
        )}

        <button className="btn-primary w-full" disabled={sending || (recovering && waiting > 0)}>
          {sending
            ? recovering
              ? 'Enviando…'
              : 'Entrando…'
            : recovering
              ? resendText(waiting)
              : 'Entrar'}
        </button>

        <button
          type="button"
          onClick={() => {
            setRecovering(!recovering)
            setError(null)
            setNotice(null)
          }}
          className="min-h-touch w-full text-center text-sm text-stone-600 underline hover:text-stone-800"
        >
          {recovering ? 'Volver a la pantalla de entrada' : '¿Has olvidado la contraseña?'}
        </button>

        {/* RF-112: there is no open signup. Accounts are created by the
            superuser, so no registration link is offered. */}
        <p className="text-center text-xs text-stone-500">
          El acceso lo da el responsable del catálogo.
        </p>
      </form>
    </div>
  )
}
