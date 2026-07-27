import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Layout } from '../components/Layout'
import { CampoContrasena } from '../components/ui'
import { validarNuevaContrasena } from '../lib/contrasena'
import { supabase } from '../lib/supabase'

/**
 * Fijar una contraseña nueva. Se llega de dos maneras: desde el enlace del
 * correo de recuperación (que abre sesión temporal y redirige aquí) o desde
 * «Mi perfil», con la sesión normal. En ambos casos la operación es la misma.
 */
export function RestablecerPage() {
  const navegar = useNavigate()
  const [nueva, setNueva] = useState('')
  const [repetida, setRepetida] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [hecho, setHecho] = useState(false)

  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    const invalida = validarNuevaContrasena(nueva, repetida)
    if (invalida) {
      setError(invalida)
      return
    }
    setEnviando(true)
    setError(null)
    const { error: fallo } = await supabase.auth.updateUser({ password: nueva })
    setEnviando(false)
    if (fallo) {
      setError('No se ha podido cambiar la contraseña. Vuelve a pedir el correo de recuperación e inténtalo otra vez.')
      return
    }
    setHecho(true)
    // Se deja leer la confirmación antes de volver al catálogo.
    setTimeout(() => navegar('/', { replace: true }), 1500)
  }

  return (
    <Layout titulo="Nueva contraseña" atras="/">
      {hecho ? (
        <div className="tarjeta text-sm">
          <p className="font-medium">Contraseña cambiada.</p>
          <p className="mt-1 text-stone-600">Ya puedes seguir trabajando con normalidad.</p>
        </div>
      ) : (
        <form onSubmit={guardar} className="tarjeta space-y-4">
          <p className="text-sm text-stone-600">
            Elige la contraseña nueva para tu cuenta. Al menos 8 caracteres.
          </p>

          <div>
            <label className="etiqueta" htmlFor="nueva">
              Contraseña nueva
            </label>
            <CampoContrasena id="nueva" valor={nueva} alCambiar={setNueva} />
          </div>

          <div>
            <label className="etiqueta" htmlFor="repetida">
              Repítela
            </label>
            <CampoContrasena id="repetida" valor={repetida} alCambiar={setRepetida} />
          </div>

          {error && (
            <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">
              {error}
            </p>
          )}

          <button className="boton-primario w-full" disabled={enviando}>
            {enviando ? 'Guardando…' : 'Guardar la contraseña'}
          </button>
        </form>
      )}
    </Layout>
  )
}
