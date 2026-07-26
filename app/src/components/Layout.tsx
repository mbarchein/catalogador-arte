import { useNavigate } from 'react-router-dom'
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
 * Cabecera con botón de volver, y nada más.
 *
 * `atras` es un destino explícito y no un `history.back()` a propósito: la ficha
 * se abre también escaneando el código QR de la etiqueta, y en ese caso el
 * historial de la aplicación está vacío — un «atrás» genérico sacaría al
 * catalogador de la aplicación instalada, que en modo pantalla completa no tiene
 * barra del navegador para volver a entrar.
 *
 * Cuando los filtros de búsqueda vivan en la URL, este destino es el sitio donde
 * se cumplirá RF-608, que pide conservarlos al volver al listado.
 */
export function Layout({
  children,
  titulo,
  atras,
}: {
  children: ReactNode
  /** Rótulo corto de la vista, junto al botón de volver. */
  titulo?: string
  /** Destino del botón de volver. Sin él no se muestra: es la vista raíz. */
  atras?: string
}) {
  const navegar = useNavigate()

  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col">
      <header className="sticky top-0 z-10 border-b border-stone-200 bg-stone-100/95 px-2 py-2 backdrop-blur">
        <div className="flex items-center gap-1">
          {atras ? (
            <button
              type="button"
              onClick={() => navegar(atras)}
              aria-label="Volver"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-stone-700 active:bg-stone-200"
            >
              <IconoAtras />
            </button>
          ) : (
            <span className="w-2" />
          )}
          <span className="truncate font-semibold">{titulo ?? 'Catalogador'}</span>
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
