import { useMemo, useState } from 'react'
import { Navigate } from 'react-router'
import { useAuth } from '../../auth/AuthContext'
import { Layout } from '../../components/Layout'
import { BanIcon, PenIcon, YesIcon } from '../../components/ui'
import { flattenPlaces, placesInside, splitPlacePath } from '../../lib/places'
import { PlacePicker } from '../artworks/PlacePicker'
import { usePhysicalPlaces } from '../artworks/usePhysicalPlaces'

/**
 * The places screen: creating, renaming, moving and retiring (RF-215, RF-1106,
 * ADR-006).
 *
 * This is the half of the decision that the record cannot give: **renaming and
 * moving happen once per place, not once per artwork.** The migration of the old
 * texts left eight nodes in lowercase and without accents, because that is how
 * the convention stored them, and curing them is exactly what this screen is
 * for — «museo de bellas artes de badajoz muba» becomes «Museo de Bellas Artes
 * de Badajoz (MUBA)» in one edit that the whole catalog reads.
 *
 * RF-1106 wants a «Tablas» section grouping the maintenance of every master
 * table — artwork types and series included, which today live inside the forms.
 * This is its first screen and not the section itself: designing where the other
 * two go is its own piece of work, and inventing it here would be deciding it in
 * passing.
 *
 * **What this screen does NOT do is check the rules.** Two siblings with the same
 * name, a cycle, retiring a place with artworks inside: all three are refused by
 * the database, in Spanish and with a hint about what to do first, and what shows
 * up here is that sentence. There is no second copy of the rule to keep in step —
 * the only one that cannot be bypassed is the one next to the data.
 *
 * Cataloger only (RF-1106). A Reader who reaches the address is sent to the list:
 * the tree is readable from the filter, and nothing here is.
 */
export function PlacesPage() {
  const { canEdit } = useAuth()
  const { tree, loading, error, ensurePlace, renamePlace, movePlace, setPlaceActive } =
    usePhysicalPlaces()
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  /** Node being renamed, and the text in the field. */
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null)
  /** Node being moved: the picker of the new parent opens for it. */
  const [moving, setMoving] = useState<string | null>(null)
  const [creating, setCreating] = useState('')

  // No live subscription here, unlike the list. `physical_places` is not in the
  // Realtime publication, and adding it would be a production change to serve a
  // screen one person uses to tidy up names: every action on this screen already
  // reloads the tree, and a second cataloger renaming a shelf at the same second
  // is not the failure worth spending a migration on. If the studio ever gets
  // reorganized by two people at once, that is when to add it.
  // Everything, retired included: this is the screen where a retired place is
  // brought back, so hiding it would hide the only way out.
  const rows = useMemo(() => flattenPlaces(tree), [tree])

  if (!canEdit) return <Navigate to="/" replace />

  async function run(action: () => Promise<string | null>) {
    setBusy(true)
    setFailure(null)
    const message = await action()
    setBusy(false)
    if (message) setFailure(message)
    return message === null
  }

  return (
    <Layout title="Ubicaciones" back="/profile">
      <p className="mb-3 text-sm text-stone-600">
        Los sitios donde están las obras. Renombrar o mover uno se hace una vez y lo ven todas
        sus obras: la ficha no guarda el nombre, guarda el lugar.
      </p>

      {failure && (
        <p role="alert" className="card mb-3 text-sm text-red-700">
          {failure}
        </p>
      )}
      {error && (
        <p role="alert" className="card mb-3 text-sm text-red-700">
          No se han podido cargar las ubicaciones: {error}
        </p>
      )}

      <section className="card mb-3">
        <h2 className="mb-2 font-medium">Añadir</h2>
        <input
          className="field"
          value={creating}
          onChange={(e) => setCreating(e.target.value)}
          placeholder="Castelar 4, mesa de Mario"
          aria-label="Nueva ubicación"
        />
        <p className="mt-1 text-xs text-stone-500">
          Cada coma abre un nivel dentro del anterior. Lo que ya exista se reutiliza.
        </p>
        <button
          type="button"
          className="btn-primary mt-2 w-full"
          disabled={busy || splitPlacePath(creating).length === 0}
          onClick={() =>
            void run(async () => {
              const result = await ensurePlace(splitPlacePath(creating))
              if ('error' in result) return result.error
              setCreating('')
              return null
            })
          }
        >
          Añadir ubicación
        </button>
      </section>

      {/* Never a blank page: an empty tree says what to do, not nothing. */}
      {!loading && rows.length === 0 && (
        <p className="card text-sm text-stone-600">
          Todavía no hay ninguna ubicación. La primera se crea aquí arriba.
        </p>
      )}

      <ul className="space-y-1">
        {rows.map(({ place, depth }) => (
          <li
            key={place.id}
            className={`card flex items-center gap-2 ${place.active ? '' : 'opacity-60'}`}
            // Indentation as padding, so a long name wrapping keeps its level.
            style={{ marginLeft: `${depth * 1}rem` }}
          >
            {renaming?.id === place.id ? (
              <>
                <input
                  className="field"
                  autoFocus
                  value={renaming.name}
                  onChange={(e) => setRenaming({ id: place.id, name: e.target.value })}
                  aria-label={`Nuevo nombre de ${place.name}`}
                />
                <button
                  type="button"
                  aria-label="Guardar el nombre"
                  className="btn-primary shrink-0"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      const message = await renamePlace(place.id, renaming.name)
                      if (!message) setRenaming(null)
                      return message
                    })
                  }
                >
                  <YesIcon className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  className="btn-secondary shrink-0"
                  onClick={() => setRenaming(null)}
                >
                  Cancelar
                </button>
              </>
            ) : (
              <>
                <span className="min-w-0 flex-1">
                  <span className="block break-words text-sm font-medium">{place.name}</span>
                  {!place.active && <span className="block text-xs text-stone-500">Retirada</span>}
                </span>
                <button
                  type="button"
                  aria-label={`Renombrar ${place.name}`}
                  className="btn-secondary shrink-0"
                  onClick={() => setRenaming({ id: place.id, name: place.name })}
                >
                  <PenIcon className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  className="btn-secondary shrink-0 text-xs"
                  onClick={() => setMoving(place.id)}
                >
                  Mover
                </button>
                {place.active ? (
                  <button
                    type="button"
                    aria-label={`Retirar ${place.name}`}
                    className="btn-secondary shrink-0"
                    disabled={busy}
                    onClick={() => void run(() => setPlaceActive(place.id, false))}
                  >
                    <BanIcon className="h-5 w-5" />
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn-secondary shrink-0 text-xs"
                    disabled={busy}
                    onClick={() => void run(() => setPlaceActive(place.id, true))}
                  >
                    Recuperar
                  </button>
                )}
              </>
            )}
          </li>
        ))}
      </ul>

      {/* Moving reuses the record's picker: choosing a place is the same gesture
          whether it is for an artwork or for another place. What changes is that
          the node being moved and everything inside it are not on offer — that
          would be a cycle — and that "no place" here means "make it a root". */}
      {moving !== null && (
        <PlacePicker
          id="move-place"
          label="Mover a"
          title="¿Dentro de qué lugar?"
          openOnMount
          value={tree.byId.get(moving)?.parent_id ?? null}
          tree={tree}
          exclude={placesInside(tree, [moving])}
          noneLabel="Que no esté dentro de nada"
          noneHint="Pasa a ser un sitio de primer nivel"
          onChange={(parentId) => {
            const id = moving
            setMoving(null)
            void run(() => movePlace(id, parentId))
          }}
        />
      )}
    </Layout>
  )
}
