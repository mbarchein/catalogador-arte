import { useMemo, useState } from 'react'
import { BottomSheet, YesIcon } from '../../components/ui'
import {
  findPlaceByPath,
  flattenPlaces,
  placePathText,
  splitPlacePath,
  type PlaceTree,
} from '../../lib/places'
import { normalizeForSearch } from '../../lib/vocabulary'

/**
 * Choosing where an artwork is, out of the tree of places (ADR-006, RF-215).
 *
 * The field is not a text box any more, and it is not a flat vocabulary either:
 * a place hangs from another place, and what identifies it is the branch. So the
 * control is a sheet with the whole tree indented and a search box on top —
 * dozens of rows, one thumb, and the artwork in front of you.
 *
 * **Commas close a level, and that is the only syntax left.** The old convention
 * made the comma a separator inside the stored text, which broke the moment a
 * level contained one — a postal address does. Here the comma is just a
 * comfortable way of typing a branch on a phone keyboard, where it sits on the
 * first layer: «Castelar 4, mesa de Mario» walks down two levels, creating what
 * is missing. And for the level that really does have a comma in its name, there
 * is a second button that takes the text whole and puts it inside whatever is
 * selected. Two actions, two labels, no guessing.
 *
 * **No place is a legitimate answer** (RF-215), so there is a row for it and no
 * ceremony around it: cataloging with the piece in front of you cannot demand
 * deciding where it is.
 *
 * Whoever cannot edit sees the branch and no way to change it: `onChange`
 * missing is what makes it read-only, the same way ComboBox works without
 * `onAdd`.
 */
export function PlacePicker({
  id,
  label,
  value,
  tree,
  onChange,
  ensurePlace,
  addPlaceInside,
  exclude,
  noneLabel = 'Sin ubicación',
  noneHint = 'La obra queda sin sitio registrado',
  openOnMount = false,
  title = 'Ubicación de la obra',
}: {
  id: string
  label: string
  /** Identifier of the place, or null when the artwork has none. */
  value: string | null
  tree: PlaceTree
  onChange: (placeId: string | null) => void
  /**
   * Places that must not be offered. The places screen passes the node it is
   * moving and everything inside it: hanging a shelf from its own drawer is a
   * cycle, and the database refuses it — offering it would be inviting the error
   * instead of preventing it.
   */
  exclude?: ReadonlySet<string>
  /** What the "no place" row reads, which is not the same thing when choosing a parent. */
  noneLabel?: string
  noneHint?: string
  /**
   * Opens the sheet as soon as it mounts, and shows no field of its own. For the
   * caller that already pressed its own button — the places screen, whose «Mover»
   * must not need a second tap to open the same sheet.
   */
  openOnMount?: boolean
  title?: string
  /**
   * Creates the place a path names, and whatever is missing above it, and
   * answers its identifier. Omit it for whoever may not add places: then the
   * sheet only offers what already exists.
   */
  ensurePlace?: (levels: readonly string[]) => Promise<{ id: string } | { error: string }>
  /**
   * Creates one place with the typed text verbatim, commas included, inside the
   * one currently selected. Without it that second button is not offered, which
   * is the right thing for whoever may not add places.
   */
  addPlaceInside?: (
    parentId: string | null,
    name: string,
  ) => Promise<{ id: string } | { error: string }>
}) {
  const [open, setOpen] = useState(openOnMount)
  const [typed, setTyped] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const current = placePathText(tree, value)

  // Retired places are not offered — putting an artwork on a shelf that no
  // longer exists is what retiring it was meant to prevent — but the one this
  // artwork already points at stays, or its own location would vanish from the
  // sheet that is supposed to show it.
  const rows = useMemo(
    () =>
      flattenPlaces(
        tree,
        (place) =>
          !(exclude?.has(place.id) ?? false) && (place.active || place.id === value),
      ),
    [tree, value, exclude],
  )

  const term = normalizeForSearch(typed)
  const matches = useMemo(
    () =>
      term === ''
        ? rows
        : // Matched against the whole branch and not only the name: someone who
          // types «castelar mesa» is describing a route, and someone who types
          // «castelar» expects to see what is inside it.
          rows.filter((row) => normalizeForSearch(row.path).includes(term)),
    [rows, term],
  )

  const levels = splitPlacePath(typed)
  // Nothing to create when the path already exists: what is offered then is the
  // row that is already on the list. Resolved against the tree and not by
  // comparing path texts, because a name may contain a comma and comparing texts
  // would split it — the very ambiguity ADR-006 removed.
  const already = useMemo(() => findPlaceByPath(tree, levels) !== null, [tree, levels])

  const canCreate = levels.length > 0 && !already

  function close() {
    setOpen(false)
    setTyped('')
    setError(null)
  }

  async function create(asOneLevel: boolean) {
    setCreating(true)
    setError(null)
    // Whole, commas included, INSIDE what is selected — by identifier, never by
    // reparsing its path — or as a branch walked down from the roots. The first
    // is the escape hatch for «c/Colón 11-1C»; the second is the normal case.
    const result = asOneLevel
      ? await addPlaceInside?.(value, typed.trim())
      : await ensurePlace?.(levels)
    setCreating(false)
    if (!result) return
    if ('error' in result) {
      setError(result.error)
      return
    }
    onChange(result.id)
    close()
  }

  return (
    <div>
      {!openOnMount && (
        <>
          <span className="label" id={`${id}-label`}>
            {label}
          </span>
          <button
            type="button"
            id={id}
            aria-labelledby={`${id}-label`}
            onClick={() => setOpen(true)}
            className="field flex min-h-touch w-full items-center justify-between gap-2 text-left"
          >
            {/* Never a blank space: a record with no location says so. */}
            <span className={current === '' ? 'text-stone-400' : ''}>
              {current === '' ? 'Sin ubicación' : current}
            </span>
            <span className="shrink-0 text-xs text-stone-500">Cambiar</span>
          </button>
        </>
      )}

      <BottomSheet open={open} onClose={close} title={title}>
        <input
          className="field mb-3"
          type="search"
          value={typed}
          onChange={(e) => {
            setTyped(e.target.value)
            setError(null)
          }}
          placeholder="Buscar o escribir: Castelar 4, mesa de Mario"
          aria-label="Buscar o escribir una ubicación"
        />

        {error && (
          <p role="alert" className="mb-2 text-sm text-red-700">
            {error}
          </p>
        )}

        <div role="group" className="space-y-1">
          <PlaceRow
            text={noneLabel}
            hint={noneHint}
            depth={0}
            active={value === null}
            onClick={() => {
              onChange(null)
              close()
            }}
          />
          {matches.map((row) => (
            <PlaceRow
              key={row.place.id}
              text={row.place.name}
              hint={row.place.active ? undefined : 'Lugar retirado'}
              depth={row.depth}
              active={row.place.id === value}
              onClick={() => {
                onChange(row.place.id)
                close()
              }}
            />
          ))}
          {matches.length === 0 && (
            <p className="px-3 py-2 text-sm text-stone-500">
              No hay ninguna ubicación que se llame así.
            </p>
          )}
        </div>

        {canCreate && (ensurePlace !== undefined || addPlaceInside !== undefined) && (
          <div className="mt-3 space-y-2 border-t border-stone-100 pt-3">
            {ensurePlace !== undefined && (
              <button
                type="button"
                disabled={creating}
                onClick={() => void create(false)}
                className="btn-primary min-h-touch w-full"
              >
                Crear «{levels.join(', ')}»
              </button>
            )}
            {/* Only worth offering when the text has a comma inside: without one
                the two buttons would do almost the same thing, and two buttons
                for one action is how a form starts lying. */}
            {typed.includes(',') && addPlaceInside !== undefined && (
              <button
                type="button"
                disabled={creating}
                onClick={() => void create(true)}
                className="btn-secondary min-h-touch w-full"
              >
                {current === ''
                  ? `Crear un solo lugar llamado «${typed.trim()}»`
                  : `Crear «${typed.trim()}» como un solo lugar dentro de ${current}`}
              </button>
            )}
            <p className="text-xs text-stone-500">
              Cada coma abre un nivel dentro del anterior. Si el nombre lleva una coma —una
              dirección, por ejemplo— usa el segundo botón.
            </p>
          </div>
        )}
      </BottomSheet>
    </div>
  )
}

/** One row of the tree: indented by depth, so the hierarchy is read and not deduced. */
function PlaceRow({
  text,
  hint,
  depth,
  active,
  onClick,
}: {
  text: string
  hint?: string
  depth: number
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={active}
      onClick={onClick}
      className={`flex min-h-touch w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left ${
        active ? 'bg-stone-800 text-white' : 'text-stone-800 active:bg-stone-100'
      }`}
      // Indentation as padding and not as spaces: it survives a long name
      // wrapping onto a second line, which on a phone is the normal case.
      style={{ paddingLeft: `${0.75 + depth * 1}rem` }}
    >
      <span className="min-w-0">
        <span className="block text-sm font-medium">{text}</span>
        {hint && (
          <span className={`block text-xs ${active ? 'text-stone-300' : 'text-stone-500'}`}>
            {hint}
          </span>
        )}
      </span>
      {active && <YesIcon className="h-5 w-5 shrink-0" />}
    </button>
  )
}
