import { NavLink } from 'react-router'
import { useAuth } from '../auth/AuthContext'

// Inline SVG, like the rest of the project's icons (see ui.tsx).
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

function ArtworksIcon() {
  return (
    <svg {...svg}>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  )
}

// A plus, not a camera: the tab adds artworks to the catalog; the camera is
// only one step of that, and its icon now lives on the photo buttons.
function AddIcon() {
  return (
    <svg {...svg}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

// Dos cuadros colgados sobre la línea de una sala: una exposición es obra puesta
// en una pared, y el icono tenía que separarse de la cuadrícula de obras (que es
// el almacén entero) y de las estanterías de las tablas.
function ExhibitionsIcon() {
  return (
    <svg {...svg}>
      <rect x="3" y="4" width="8" height="10" rx="1" />
      <rect x="14" y="7" width="7" height="7" rx="1" />
      <path d="M3 18h18" />
    </svg>
  )
}

// Estanterías apiladas: las tablas maestras son las listas de las que se elige,
// y el icono tenía que distinguirse de la cuadrícula de obras.
function TablesIcon() {
  return (
    <svg {...svg}>
      <rect x="3" y="4" width="18" height="5" rx="1" />
      <rect x="3" y="12" width="18" height="5" rx="1" />
      <path d="M7 19h10" />
    </svg>
  )
}

function ProfileIcon() {
  return (
    <svg {...svg}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4.5 20c1.5-3.5 4.5-5 7.5-5s6 1.5 7.5 5" />
    </svg>
  )
}

/**
 * Footer menu: the primary navigation, always within thumb's reach — a
 * pattern inherited from the team's other application. The active tab is
 * marked with the top bar besides the color, which with gloves or in full sun
 * is not enough.
 *
 * ── POR QUÉ «EXPOSICIONES» ES UNA PESTAÑA Y NO UNA FILA DE «TABLAS» ──
 *
 * Aquí solo entra lo que el catálogo CONTIENE o lo que se hace con él, y una
 * exposición es contenido: se lee como se lee una obra, tiene su ficha, y quien
 * solo consulta la ve igual. Al listado de obras se llega por una pestaña de este
 * menú, y ese es el criterio que decide: al de exposiciones también. Meterla en
 * «Tablas» —el índice de las listas de las que eligen las fichas, y solo del
 * Catalogador— habría mentido sobre lo que es y se la habría escondido al lector.
 *
 * Las dos de contenido van juntas y delante, y las tres que actúan detrás, así que
 * quien solo consulta lee «Obras · Exposiciones · Mi perfil»: el catálogo entero y
 * nada más. La quinta pestaña costó un punto de tamaño en las etiquetas, y está
 * medido y explicado abajo, en la clase de cada una.
 *
 * La papelera NO está aquí, y no por olvido: se abre unas pocas veces al año, así
 * que una sexta pestaña estrecharía las cinco de todos los días para nada. Su
 * puerta está en «Tablas», que es donde ya se viene a hacer mantenimiento.
 */
export function FooterMenu() {
  const { canEdit } = useAuth()

  const tabs = [
    { to: '/', end: true, text: 'Obras', Icon: ArtworksIcon },
    // RF-309, RF-501: el listado de exposiciones lo lee cualquiera que pueda leer,
    // igual que el de obras. Crear y corregir son del Catalogador y se comprueban
    // dentro de esas pantallas.
    { to: '/exhibitions', end: false, text: 'Exposiciones', Icon: ExhibitionsIcon },
    // RF-1104: capture only exists for whoever can edit.
    ...(canEdit ? [{ to: '/capture', end: false, text: 'Añadir', Icon: AddIcon }] : []),
    // RF-1106: el mantenimiento de las listas maestras es del Catalogador, y no
    // vive dentro del formulario de ninguna obra.
    ...(canEdit ? [{ to: '/tables', end: false, text: 'Tablas', Icon: TablesIcon }] : []),
    { to: '/profile', end: false, text: 'Mi perfil', Icon: ProfileIcon },
  ]

  return (
    <nav
      aria-label="Navegación principal"
      className="sticky bottom-0 z-10 border-t border-stone-200 bg-stone-100/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
    >
      <div className="flex h-14 items-stretch">
        {tabs.map(({ to, end, text, Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              // 11 px y no 12, y en las CINCO y no solo en la larga: medido en el
              // navegador a 360 px de ancho —la pantalla de referencia—, cada
              // pestaña dispone de 72 px y «Exposiciones» pedía 73 a 12 px, así que
              // salía con puntos suspensivos en la navegación principal. A 11 px
              // pide 67 y entra con holgura. Bajar solo esa habría dejado una
              // etiqueta de otro tamaño que las demás.
              //
              // `min-w-0` y el `truncate` de la etiqueta son la red por debajo de
              // 340 px: ahí la más larga se recorta en vez de ensanchar su pestaña
              // y empujar a las vecinas.
              `relative flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] ${
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
                <Icon />
                <span className="max-w-full truncate">{text}</span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
