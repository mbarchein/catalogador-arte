import { Link, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from '../auth/AuthContext'

/** Migas de pan (RF-1102). Se construyen a partir de la ruta actual. */
function Migas({ hijo }: { hijo?: string }) {
  const { pathname } = useLocation()
  const enInicio = pathname === '/'
  return (
    <nav aria-label="Migas de pan" className="text-xs text-stone-500">
      {enInicio ? (
        <span>Obras</span>
      ) : (
        <>
          <Link to="/" className="underline hover:text-stone-800">
            Obras
          </Link>
          {hijo && <span> › {hijo}</span>}
        </>
      )}
    </nav>
  )
}

export function Layout({ children, miga }: { children: ReactNode; miga?: string }) {
  const { perfil, puedeEditar, salir } = useAuth()

  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col">
      <header className="sticky top-0 z-10 border-b border-stone-200 bg-stone-100/95 px-4 py-3 backdrop-blur">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <Migas hijo={miga} />
            <Link to="/" className="block truncate font-semibold">
              Catalogador
            </Link>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {perfil && (
              <span className="hidden text-xs text-stone-600 sm:inline">
                {perfil.nombre || perfil.email}
                {/* Se muestra el rol porque cambia lo que se puede hacer: saber
                    que estás en modo consulta evita rellenar un formulario que
                    la base va a rechazar. */}
                {!puedeEditar && ' · solo consulta'}
              </span>
            )}
            <button onClick={salir} className="text-xs underline hover:text-stone-900">
              Salir
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 p-4">{children}</main>
    </div>
  )
}
