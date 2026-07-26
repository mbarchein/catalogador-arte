import { useState } from 'react'
import { supabase } from '../lib/supabase'

export function LoginPage() {
  const [email, setEmail] = useState('')
  const [contrasena, setContrasena] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  async function entrar(e: React.FormEvent) {
    e.preventDefault()
    setEnviando(true)
    setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password: contrasena })
    if (error) {
      // Mensaje genérico a propósito: distinguir «no existe esa cuenta» de
      // «contraseña incorrecta» permitiría averiguar quién tiene cuenta.
      setError('No se ha podido entrar. Revisa el correo y la contraseña.')
    }
    setEnviando(false)
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <form onSubmit={entrar} className="tarjeta w-full max-w-sm space-y-4">
        <div>
          <h1 className="text-xl font-semibold">Catalogador</h1>
          <p className="text-sm text-stone-600">Rotili · Ruiz Campins</p>
        </div>

        <div>
          <label className="etiqueta" htmlFor="email">
            Correo
          </label>
          <input
            id="email"
            className="campo"
            type="email"
            inputMode="email"
            autoComplete="username"
            autoCapitalize="none"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div>
          <label className="etiqueta" htmlFor="contrasena">
            Contraseña
          </label>
          <input
            id="contrasena"
            className="campo"
            type="password"
            autoComplete="current-password"
            required
            value={contrasena}
            onChange={(e) => setContrasena(e.target.value)}
          />
        </div>

        {error && (
          <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">
            {error}
          </p>
        )}

        <button className="boton-primario w-full" disabled={enviando}>
          {enviando ? 'Entrando…' : 'Entrar'}
        </button>

        {/* RF-112: no hay registro abierto. Las cuentas las crea el superusuario,
            así que no se ofrece enlace de alta. */}
        <p className="text-center text-xs text-stone-500">
          El acceso lo da el responsable del catálogo.
        </p>
      </form>
    </div>
  )
}
