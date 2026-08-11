import { useState } from 'react'
import { useParams } from 'react-router'
import { useAuth } from '../../auth/AuthContext'
import { Layout } from '../../components/Layout'
import { AddToDossier } from './AddToDossier'
import { DossierIssues } from './DossierIssues'
import { DossierItems } from './DossierItems'
import { DossierSettings } from './DossierSettings'
import { itemCountText } from './dossierItems'
import { retireDossierConfirmText } from './dossierMessages'
import { useRelatedThumbnails } from '../documentary/relationships/useRelatedThumbnails'
import { useDossier } from './useDossier'

/**
 * Arming a dossier: what it holds, in what order, and what it is going to say
 * (RF-1600).
 *
 * **The list comes first and the settings are a panel that opens.** The order of
 * this screen is the order of the work: an afternoon here is twenty taps moving
 * artworks and two writing the cover, so the twenty are at the top and within a
 * thumb's reach, and the two are behind «Ajustes». Putting the form first would
 * mean scrolling past it every single time.
 *
 * **A Lector reads it and does not arm it.** Every write is behind `canEdit`, and
 * the database refuses them anyway with its own sentence — a button that is not
 * painted is not a protection, so the check is in both places.
 *
 * **Emitir va debajo de la lista**, y no es maquetación: un botón de emitir por
 * encima de las obras se pulsa antes de haberlas ordenado. Lo que se emite es un
 * documento nuevo cada vez —las versiones anteriores no se tocan (RF-1607)—, y el
 * rótulo del botón lo dice diciendo qué número va a llevar.
 */
export function DossierPage() {
  const { id } = useParams<{ id: string }>()
  const { canEdit } = useAuth()
  const {
    dossier,
    items,
    loading,
    error,
    save,
    addArtwork,
    addText,
    addBiography,
    editItem,
    removeItem,
    moveItem,
  } = useDossier(id)
  // Las miniaturas se piden por código, con el mismo gancho que las obras
  // relacionadas de una ficha: pinta del espejo local y se corrige con la consulta,
  // así que la lista se recorre sin esperar y con mala cobertura.
  //
  // Se piden ANTES del retorno temprano de abajo, porque un gancho no se puede
  // llamar después de un `return`. Y se piden también las de los elementos
  // retirados: una fila en gris con su fotografía sigue diciendo qué obra era.
  const thumbnails = useRelatedThumbnails(
    items.flatMap((row) => (row.catalog_id === null ? [] : [row.catalog_id])),
  )
  const [showSettings, setShowSettings] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  if (dossier === null) {
    return (
      <Layout title="Dossier" back="/dossiers">
        {error !== null ? (
          <p role="alert" className="card text-sm text-red-700">
            {error}
          </p>
        ) : (
          <p className="card text-sm text-stone-600">
            {loading ? 'Cargando el dossier…' : 'Ese dossier no está en el catálogo.'}
          </p>
        )}
      </Layout>
    )
  }

  const contents = itemCountText(items)
  // `flatMap` y no `filter` + `map`: así el tipo sale de la comprobación en vez de
  // de una aserción, que es lo que este proyecto evita en datos que vienen de la red.
  const inDossier = items.flatMap((row) =>
    row.active && row.catalog_id !== null ? [row.catalog_id] : [],
  )

  return (
    <Layout
      title={dossier.title}
      back="/dossiers"
      action={
        canEdit ? (
          <button
            type="button"
            onClick={() => {
              setShowAdd((open) => !open)
              setShowSettings(false)
            }}
            className="flex min-h-[2.5rem] items-center rounded-lg bg-stone-800 px-2.5 text-sm font-medium text-white"
          >
            {showAdd ? 'Cerrar' : '+ Añadir'}
          </button>
        ) : undefined
      }
    >
      {error && (
        <p role="alert" className="card mb-3 text-sm text-red-700">
          {error}
        </p>
      )}
      {problem && (
        <p role="alert" className="card mb-3 text-sm text-red-700">
          {problem}
        </p>
      )}

      {!dossier.active && (
        <div className="card mb-3 text-sm">
          <p className="text-amber-900">
            Este dossier está retirado. No aparece en el listado, y lo que ya se emitió sigue como
            estaba.
          </p>
          {canEdit && (
            <button
              type="button"
              className="mt-2 min-h-[2.5rem] rounded-lg border border-stone-300 px-3 text-sm"
              onClick={() => void save({ active: true })}
            >
              Recuperar
            </button>
          )}
        </div>
      )}

      {/* Lo que hay dentro, contado por tipos: es la respuesta a «cuántas páginas
          va a tener esto», que es lo que se pregunta mientras se arma. */}
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-stone-600">
        <span>{contents}</span>
        {dossier.show_prices && <span>· con precios</span>}
        {canEdit && (
          <button
            type="button"
            className="ml-auto underline"
            onClick={() => {
              setShowSettings((open) => !open)
              setShowAdd(false)
            }}
          >
            {showSettings ? 'Cerrar ajustes' : 'Ajustes'}
          </button>
        )}
      </div>

      {showAdd && canEdit && (
        <div className="mb-3">
          <AddToDossier
            inDossier={inDossier}
            onAddArtwork={addArtwork}
            onAddText={addText}
            onAddBiography={addBiography}
          />
        </div>
      )}

      {(showSettings || !canEdit) && (
        <div className="mb-3">
          <DossierSettings dossier={dossier} canEdit={canEdit} onSave={save} />
        </div>
      )}

      <DossierItems
        items={items}
        thumbnails={thumbnails}
        loading={loading}
        error={error}
        canEdit={canEdit}
        showPrices={dossier.show_prices}
        onMove={moveItem}
        onEdit={editItem}
        onRemove={removeItem}
      />

      {/* Debajo de la lista y no arriba: emitir es lo último que se hace, y un botón
          de emitir por encima de las obras se pulsa antes de haberlas ordenado. */}
      <DossierIssues dossier={dossier} items={items} canEdit={canEdit} />

      {canEdit && dossier.active && (
        <div className="mt-3">
          <button
            type="button"
            className="min-h-[2.75rem] w-full rounded-lg border border-red-300 px-3 text-sm text-red-800"
            onClick={() => {
              if (!window.confirm(retireDossierConfirmText(dossier.title, contents))) return
              void save({ active: false }).then((message) => setProblem(message))
            }}
          >
            Retirar este dossier
          </button>
        </div>
      )}
    </Layout>
  )
}
