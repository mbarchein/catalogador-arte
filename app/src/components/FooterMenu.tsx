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

// Two paintings hung over the line of a room: an exhibition is work put
// on a wall, and the icon had to be separated from the grid of artworks (which is
// the whole storeroom) and from the shelves of the tables.
function ExhibitionsIcon() {
  return (
    <svg {...svg}>
      <rect x="3" y="4" width="8" height="10" rx="1" />
      <rect x="14" y="7" width="7" height="7" rx="1" />
      <path d="M3 18h18" />
    </svg>
  )
}

// Stacked shelves: the master tables are the lists things are chosen from, and the icon
// had to be told apart from the grid of artworks.
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
 * ── WHY «EXPOSICIONES» IS A TAB AND NOT A ROW OF «TABLAS» ───
 *
 * Only what the catalogue CONTAINS or what is done with it goes here, and an
 * exhibition is content: it reads the way an artwork reads, it has its record, and whoever
 * only consults sees it just the same. The artwork listing is reached through a tab of this
 * menu, and that is the criterion that decides: so is the exhibition one. Putting it in
 * «Tablas» —the index of the lists the records choose from, and the Cataloguer's
 * only— would have lied about what it is and would have hidden it from the reader.
 *
 * The two content ones go together and first, and the three that act behind, so that
 * whoever only consults reads «Obras · Exposiciones · Mi perfil»: the whole catalogue and
 * nothing else. The fifth tab cost a point of size in the labels, and it is
 * measured and explained below, in each one's class.
 *
 * The wastebasket is NOT here, and not out of forgetfulness: it is opened a few times a year, so
 * a sixth tab would narrow the five everyday ones for nothing. Its
 * door is in «Tablas», which is where maintenance is already done.
 */
export function FooterMenu() {
  const { canEdit } = useAuth()

  const tabs = [
    { to: '/', end: true, text: 'Obras', Icon: ArtworksIcon },
    // RF-309, RF-501: the exhibition listing is read by anybody who can read,
    // just like the artwork one. Creating and correcting belong to the Cataloguer and are checked
    // inside those screens.
    { to: '/exhibitions', end: false, text: 'Exposiciones', Icon: ExhibitionsIcon },
    // RF-1104: capture only exists for whoever can edit.
    ...(canEdit ? [{ to: '/capture', end: false, text: 'Añadir', Icon: AddIcon }] : []),
    // RF-1106: maintaining the master lists belongs to the Cataloger, and does not live
    // inside any artwork's form.
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
              // 11 px and not 12, and in ALL FIVE and not just the long one: measured in the
              // browser at 360 px wide —the reference screen—, each
              // tab has 72 px available and «Exposiciones» asked for 73 at 12 px, so
              // it came out ellipsised in the primary navigation. At 11 px it
              // asks for 67 and fits with room to spare. Lowering only that one would have left a
              // label of a different size from the rest.
              //
              // `min-w-0` and the label's `truncate` are the net below
              // 340 px: there the longest one is clipped instead of widening its tab
              // and pushing its neighbours.
              `relative flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 text-2xs ${
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
