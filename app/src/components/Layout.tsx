import { useLocation, useNavigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from '../auth/AuthContext'

function IconoAtras() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-6 w-6"
      aria-hidden
    >
      <path d="M15 18l-6-6 6-6" />
    </svg>
  )
}

/**
 * Cabecera fija con botón de volver, el rótulo de la vista y un hueco para la
 * acción principal de la página («Editar», «+ Nueva»...). Que la acción viva en
 * la cabecera fija significa que está disponible sin volver arriba, por larga
 * que sea la página — patrón heredado de la otra aplicación del equipo.
 *
 * Volver: si hay historial dentro de la aplicación se vuelve por él (conserva
 * la página de la que se vino); si no —entrada en frío, p. ej. escaneando el QR
 * de la etiqueta— se va al destino `atras`. Nunca un history.back() a secas: con
 * el historial vacío sacaría al catalogador de la aplicación instalada, que en
 * pantalla completa no tiene barra del navegador para volver a entrar.
 */
export function Layout({
  children,
  titulo,
  atras,
  accion,
}: {
  children: ReactNode
  /** Rótulo corto de la vista, junto al botón de volver. */
  titulo?: string
  /** Destino de reserva del botón de volver. Sin él no se muestra: es la raíz. */
  atras?: string
  /** Acción principal de la vista, en el lado derecho de la cabecera. */
  accion?: ReactNode
}) {
  const navegar = useNavigate()
  const { key } = useLocation()

  function volver() {
    // location.key vale 'default' solo en la primera entrada (enlace directo,
    // recarga): cualquier otro valor significa que hay historial propio.
    if (key !== 'default') navegar(-1)
    else if (atras) navegar(atras)
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col">
      <header className="sticky top-0 z-10 border-b border-stone-200 bg-stone-100/95 px-2 py-2 backdrop-blur">
        <div className="flex items-center gap-1">
          {atras ? (
            <button
              type="button"
              onClick={volver}
              aria-label="Volver"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-stone-700 active:bg-stone-200"
            >
              <IconoAtras />
            </button>
          ) : (
            <span className="w-2" />
          )}
          <span className="min-w-0 flex-1 truncate font-semibold">{titulo ?? 'Catalogador'}</span>
          {accion && <div className="shrink-0 pr-1">{accion}</div>}
        </div>
      </header>

      <main className="flex-1 p-4">{children}</main>
    </div>
  )
}

/**
 * Cierre de sesión. Fuera de la cabecera, donde competía por el sitio con el
 * botón de volver y se podía pulsar sin querer en mitad de un lote. Aquí abajo
 * sigue estando siempre a mano, que hace falta: la sesión dura doce horas y el
 * dispositivo puede ser compartido.
 */
export function CerrarSesion() {
  const { perfil, puedeEditar, salir } = useAuth()

  return (
    <div className="mt-8 border-t border-stone-200 pt-4 text-center text-xs text-stone-500">
      {perfil && (
        <p className="mb-1">
          {perfil.nombre || perfil.email}
          {!puedeEditar && ' · solo consulta'}
        </p>
      )}
      <button onClick={salir} className="min-h-toque px-4 underline hover:text-stone-800">
        Cerrar sesión
      </button>
    </div>
  )
}
