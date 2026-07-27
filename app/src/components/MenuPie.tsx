import { NavLink } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'

// SVG en línea, como el resto de iconos del proyecto (ver ui.tsx).
const svg = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  className: 'h-5 w-5',
}

function IconoObras() {
  return (
    <svg {...svg}>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  )
}

function IconoCaptura() {
  return (
    <svg {...svg}>
      <path d="M4 7h3l2-2.5h6L17 7h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1Z" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  )
}

function IconoPerfil() {
  return (
    <svg {...svg}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4.5 20c1.5-3.5 4.5-5 7.5-5s6 1.5 7.5 5" />
    </svg>
  )
}

/**
 * Menú de pie: la navegación primaria, siempre al alcance del pulgar — patrón
 * heredado de la otra aplicación del equipo. La pestaña activa se marca con la
 * barrita superior además del color, que con guantes o a pleno sol no basta.
 */
export function MenuPie() {
  const { puedeEditar } = useAuth()

  const pestanas = [
    { a: '/', fin: true, texto: 'Obras', Icono: IconoObras },
    // RF-1104: la captura solo existe para quien puede editar.
    ...(puedeEditar ? [{ a: '/captura', fin: false, texto: 'Captura', Icono: IconoCaptura }] : []),
    { a: '/perfil', fin: false, texto: 'Mi perfil', Icono: IconoPerfil },
  ]

  return (
    <nav
      aria-label="Navegación principal"
      className="sticky bottom-0 z-10 border-t border-stone-200 bg-stone-100/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
    >
      <div className="flex h-14 items-stretch">
        {pestanas.map(({ a, fin, texto, Icono }) => (
          <NavLink
            key={a}
            to={a}
            end={fin}
            className={({ isActive }) =>
              `relative flex flex-1 flex-col items-center justify-center gap-0.5 text-xs ${
                isActive ? 'font-semibold text-stone-900' : 'text-stone-500'
              }`
            }
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <span
                    className="absolute inset-x-6 top-0 h-0.5 rounded-full bg-stone-800"
                    aria-hidden
                  />
                )}
                <Icono />
                {texto}
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
