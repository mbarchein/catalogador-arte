import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { CampoContrasena } from '../components/ui'

export function LoginPage() {
  const [email, setEmail] = useState('')
  const [contrasena, setContrasena] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [recuperando, setRecuperando] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)

  async function entrar(e: React.FormEvent) {
    e.preventDefault()
    setEnviando(true)
    setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password: contrasena })
    if (error) {
      // Un fallo de red NO se puede confundir con unas credenciales incorrectas.
      // Antes se mostraba el mismo mensaje para ambos y eso hizo indiagnosticable
      // un caso real: al abrir la app desde el móvil, el servidor estaba
      // configurado con «localhost», que en el móvil es el propio móvil. Parecía
      // una contraseña mal escrita durante un buen rato.
      //
      // Distinguirlo no filtra nada: que el servidor no responda no dice nada
      // sobre qué cuentas existen. Lo que sigue siendo genérico es el mensaje de
      // credenciales, porque separar «no existe esa cuenta» de «contraseña
      // incorrecta» sí permitiría averiguar quién tiene acceso.
      const esDeRed = error.status === undefined || error.status === 0
      if (esDeRed) {
        setError(
          `No se ha podido contactar con el servidor (${import.meta.env.VITE_SUPABASE_URL}). ` +
            'Comprueba que estás en la misma red y que esa dirección es alcanzable desde este dispositivo.',
        )
      } else {
        setError('No se ha podido entrar. Revisa el correo y la contraseña.')
      }
    }
    setEnviando(false)
  }

  async function enviarRecuperacion(e: React.FormEvent) {
    e.preventDefault()
    setEnviando(true)
    setError(null)
    setAviso(null)
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    setEnviando(false)
    if (error) {
      setError('No se ha podido enviar el correo. Espera un momento y vuelve a intentarlo.')
      return
    }
    // Neutro a propósito: confirmar o negar el envío diría qué cuentas existen.
    setAviso(
      'Si la cuenta existe, en unos minutos llegará un correo con el enlace para elegir una contraseña nueva. Mira también la carpeta de spam.',
    )
  }

  // Arriba, no centrado verticalmente: en el móvil, al enfocar el correo se
  // abre el teclado y un formulario centrado queda medio tapado o saltando.
  // Anclado arriba, los campos siguen a la vista mientras se teclea.
  return (
    <div className="flex min-h-screen items-start justify-center p-4 pt-10">
      <form
        onSubmit={recuperando ? enviarRecuperacion : entrar}
        className="tarjeta w-full max-w-sm space-y-4"
      >
        <div>
          <h1 className="text-xl font-semibold">Catalogador</h1>
          <p className="text-sm text-stone-600">Rotili · Ruiz Campins</p>
        </div>

        {recuperando && (
          <p className="text-sm text-stone-600">
            Escribe tu correo y te enviaremos un enlace para elegir una contraseña nueva.
          </p>
        )}

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

        {!recuperando && (
          <div>
            <label className="etiqueta" htmlFor="contrasena">
              Contraseña
            </label>
            {/* Con mostrar/ocultar: en el móvil se teclea a ciegas y el mensaje de
                error es genérico a propósito, así que poder ver lo escrito es la
                salida barata cuando «no entra». */}
            <CampoContrasena id="contrasena" valor={contrasena} alCambiar={setContrasena} />
          </div>
        )}

        {error && (
          <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">
            {error}
          </p>
        )}

        {aviso && (
          <p role="status" className="rounded-lg bg-green-50 p-3 text-sm text-green-900">
            {aviso}
          </p>
        )}

        <button className="boton-primario w-full" disabled={enviando}>
          {enviando
            ? recuperando
              ? 'Enviando…'
              : 'Entrando…'
            : recuperando
              ? 'Enviarme el enlace'
              : 'Entrar'}
        </button>

        <button
          type="button"
          onClick={() => {
            setRecuperando(!recuperando)
            setError(null)
            setAviso(null)
          }}
          className="min-h-toque w-full text-center text-sm text-stone-600 underline hover:text-stone-800"
        >
          {recuperando ? 'Volver a la pantalla de entrada' : '¿Has olvidado la contraseña?'}
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
