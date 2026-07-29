import { useEffect, useState } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { Layout } from '../../components/Layout'
import { supabase } from '../../lib/supabase'
import { uploadShot } from '../../lib/images'
import { SHOT_TYPE_LABEL, type ShotTypeValue } from '../../lib/types'
import { displayDate } from '../../lib/dates'
import { useAuth } from '../../auth/AuthContext'
import { Chips } from '../../components/ui'
import { moveItem } from '../../lib/reorder'
import { PhotoPicker, type QueuedShot } from './PhotoPicker'
import { useArtworkImages } from './artworkImages'
import { PhotoCarousel } from './PhotoCarousel'
import { ReorderableThumbnails } from './ReorderableThumbnails'

/**
 * Photo management of a record, on its own route (/artwork/:id/photos): the
 * record view stays a view, and everything that changes the photos — adding
 * with a shot type, retyping, choosing the main one, retiring — lives here.
 * Every action applies immediately, with no save-and-cancel: each one touches
 * only the images table and is reversible by another tap (except retiring,
 * which asks twice). That is why this is not part of the edit form: a
 * "Cancelar" that cannot undo would promise what it cannot keep.
 */
export function ArtworkPhotosPage() {
  const { id } = useParams<{ id: string }>()
  const { canEdit } = useAuth()
  const catalogId = id ?? ''
  const { images, thumbUrls, mainId, manuallyChosen, loading, reload } =
    useArtworkImages(catalogId)

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [staged, setStaged] = useState<QueuedShot[]>([])
  const [uploading, setUploading] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmRemoval, setConfirmRemoval] = useState<string | null>(null)

  // The selection starts on the main image and follows removals; it never
  // jumps on its own while the cataloger is working.
  useEffect(() => {
    if (loading) return
    setSelectedId((current) =>
      current && images.some((r) => r.image_id === current)
        ? current
        : (mainId ?? images[0]?.image_id ?? null),
    )
  }, [loading, images, mainId])

  const selected = images.find((r) => r.image_id === selectedId)

  function discardStaged() {
    staged.forEach((s) => URL.revokeObjectURL(s.prepared.preview))
    setStaged([])
  }

  async function uploadStaged() {
    setError(null)
    setNotice(null)
    const queue = staged
    const failed: QueuedShot[] = []
    let done = 0
    for (let i = 0; i < queue.length; i += 1) {
      const shot = queue[i]
      if (!shot) continue
      setUploading(`Subiendo ${i + 1} de ${queue.length}…`)
      try {
        // Never marked as index: which one represents the artwork is decided
        // separately, and adding a photo should not change the cover without
        // anyone asking.
        await uploadShot(catalogId, shot.prepared, { shotType: shot.shotType, isIndex: false })
        URL.revokeObjectURL(shot.prepared.preview)
        done += 1
      } catch (e) {
        failed.push({
          ...shot,
          status: 'error',
          error: e instanceof Error ? e.message : String(e),
        })
      }
    }
    // Failed shots stay staged with their type chosen, ready to retry.
    setStaged(failed)
    setUploading(null)
    await reload()
    if (failed.length > 0) {
      setError(`No se han podido subir ${failed.length} de ${queue.length}: ${failed[0]?.error}`)
    } else {
      setNotice(done === 1 ? 'Fotografía añadida.' : `${done} fotografías añadidas.`)
    }
  }

  async function changeShotType(imageId: string, type: ShotTypeValue) {
    setSaving(true)
    setError(null)
    setNotice(null)
    const { error } = await supabase
      .from('images')
      .update({ shot_type: type })
      .eq('image_id', imageId)
    if (error) {
      setError(error.message)
    } else {
      await reload()
      setNotice('Tipo de toma actualizado.')
    }
    setSaving(false)
  }

  /**
   * Persists the arranged order (RF-401). The database validates that the list
   * is exactly the artwork's active photos, so a stale client — someone else
   * added or retired one meanwhile — gets a readable error instead of half an
   * order; reloading then shows the real one.
   */
  async function saveOrder(imageIds: string[]) {
    setSaving(true)
    setError(null)
    setNotice(null)
    const { error } = await supabase.rpc('reorder_images', {
      p_catalog_id: catalogId,
      p_image_ids: imageIds,
    })
    if (error) {
      setError(error.message)
    } else {
      setNotice('Orden de las fotografías actualizado.')
    }
    await reload()
    setSaving(false)
  }

  /** Moves the selected photo one place, for whoever does not drag. */
  async function moveSelected(delta: number) {
    if (!selectedId) return
    const current = images.map((i) => i.image_id)
    const from = current.indexOf(selectedId)
    if (from < 0) return
    await saveOrder(moveItem(current, from, from + delta))
  }

  async function useAsMain(imageId: string) {
    setSaving(true)
    setError(null)
    setNotice(null)
    const { error } = await supabase.rpc('set_main_image', { p_image_id: imageId })
    if (error) {
      setError(error.message)
    } else {
      await reload()
      setNotice('Imagen principal actualizada.')
    }
    setSaving(false)
  }

  /**
   * Removing a photo is a logical deletion: the row is kept and the bucket
   * file is not deleted. A deleted master is unrecoverable, and for a
   * destroyed or missing artwork the photograph may be the only proof it
   * existed.
   */
  async function removePhoto(imageId: string) {
    setSaving(true)
    setError(null)
    setNotice(null)
    const { error } = await supabase
      .from('images')
      .update({ active: false })
      .eq('image_id', imageId)
    if (error) {
      setError(error.message)
    } else {
      const { main } = await reload()
      setSelectedId(main)
      setNotice('Fotografía retirada. El archivo se conserva.')
    }
    setConfirmRemoval(null)
    setSaving(false)
  }

  // A reader reaching this URL falls back to the record view (RF-109).
  if (!canEdit) {
    return <Navigate to={`/artwork/${catalogId}`} replace />
  }

  return (
    <Layout title={`Fotografías de ${catalogId}`} back={`/artwork/${catalogId}`}>
      {/* ── Adding, with the shot type chosen before uploading ── */}
      <section className="card mb-3">
        <h2 className="mb-2 font-medium">Añadir fotografías</h2>
        {uploading ? (
          <p role="status" className="text-sm text-stone-600">
            {uploading}
          </p>
        ) : (
          <div className="space-y-2">
            <PhotoPicker shots={staged} onChange={setStaged} disabled={saving} withIndex={false} />
            {staged.length > 0 && (
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void uploadStaged()}
                  className="btn min-h-touch bg-stone-900 text-white"
                >
                  {staged.length === 1 ? 'Subir la foto' : `Subir ${staged.length} fotos`}
                </button>
                <button type="button" onClick={discardStaged} className="btn-secondary">
                  Descartar
                </button>
              </div>
            )}
          </div>
        )}
      </section>

      {/* ── The photos already in the record ── */}
      <section className="card">
        <h2 className="mb-2 font-medium">
          {images.length === 0
            ? 'Fotografías de la ficha'
            : `${images.length} ${images.length === 1 ? 'fotografía' : 'fotografías'}`}
        </h2>

        {loading ? (
          <div className="aspect-[4/3] animate-pulse rounded-xl bg-stone-200" />
        ) : images.length === 0 ? (
          // RF-404: explicit placeholder, not an unexplained gap.
          <p className="text-sm text-stone-500">Sin fotografías registradas.</p>
        ) : (
          <>
            <ReorderableThumbnails
              images={images}
              thumbUrls={thumbUrls}
              mainId={mainId}
              selectedId={selectedId}
              onSelect={(imageId) => {
                setSelectedId(imageId)
                setConfirmRemoval(null)
              }}
              onReorder={(imageIds) => void saveOrder(imageIds)}
              disabled={saving}
            />

            {/* Same swipe carousel as the record view: flicking through the
                shots while retyping them is exactly the reviewing gesture. */}
            <div className="mt-3">
              <PhotoCarousel
                images={images}
                thumbUrls={thumbUrls}
                viewId={selectedId}
                onView={(imageId) => {
                  setSelectedId(imageId)
                  setConfirmRemoval(null)
                }}
                catalogId={catalogId}
              />
            </div>

            {selected && (
              <div className="mt-3 space-y-3 rounded-lg border border-stone-300 bg-stone-50 p-3">
                <p className="text-xs text-stone-500">
                  {selected.image_id}
                  {selected.photo_date ? ` · ${displayDate(selected.photo_date)}` : ''}
                </p>

                <Chips
                  id="p-shot-type"
                  label="Tipo de toma"
                  columns={3}
                  options={(Object.keys(SHOT_TYPE_LABEL) as ShotTypeValue[]).map((v) => ({
                    value: v,
                    text: SHOT_TYPE_LABEL[v],
                  }))}
                  value={selected.shot_type}
                  onChange={(v) => void changeShotType(selected.image_id, v)}
                />

                {/* Same move, one place at a time: dragging is faster but it
                    is a gesture, and a gesture cannot be the only way to
                    reach a function. */}
                {images.length > 1 && (
                  <div>
                    <p className="label">
                      Orden · {images.findIndex((i) => i.image_id === selected.image_id) + 1} de{' '}
                      {images.length}
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        disabled={saving || images[0]?.image_id === selected.image_id}
                        onClick={() => void moveSelected(-1)}
                        className="btn-secondary disabled:opacity-40"
                      >
                        ← Antes
                      </button>
                      <button
                        type="button"
                        disabled={
                          saving || images[images.length - 1]?.image_id === selected.image_id
                        }
                        onClick={() => void moveSelected(1)}
                        className="btn-secondary disabled:opacity-40"
                      >
                        Después →
                      </button>
                    </div>
                  </div>
                )}

                {selected.image_id === mainId ? (
                  <p className="text-xs text-stone-500">
                    {manuallyChosen
                      ? 'Esta es la imagen principal.'
                      : // Distinguishing "chosen by hand" from "chosen by the
                        // fallback rule" matters: in the second case, uploading
                        // one more photo can change it on its own.
                        'Se muestra como principal por ser la general más reciente. Fíjala para que no cambie al añadir fotos.'}
                    {!manuallyChosen && (
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => void useAsMain(selected.image_id)}
                        className="ml-1 underline"
                      >
                        Fijar esta
                      </button>
                    )}
                  </p>
                ) : (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void useAsMain(selected.image_id)}
                    className="btn-secondary w-full"
                  >
                    {saving ? 'Guardando…' : 'Usar como imagen principal'}
                  </button>
                )}

                {confirmRemoval === selected.image_id ? (
                  <div className="rounded-lg border border-red-200 bg-red-50 p-2">
                    <p className="text-xs text-red-900">
                      ¿Quitar esta fotografía de la ficha? El archivo se conserva, pero deja de
                      mostrarse.
                    </p>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => void removePhoto(selected.image_id)}
                        className="btn min-h-touch bg-red-700 text-white"
                      >
                        {saving ? 'Quitando…' : 'Sí, quitar'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmRemoval(null)}
                        className="btn-secondary"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmRemoval(selected.image_id)}
                    className="btn min-h-touch w-full border border-red-300 bg-white text-sm text-red-800"
                  >
                    Quitar esta fotografía
                  </button>
                )}
              </div>
            )}
          </>
        )}

        {notice && (
          <p role="status" className="mt-2 rounded-lg bg-green-50 p-2 text-xs text-green-900">
            {notice}
          </p>
        )}
        {error && (
          <p role="alert" className="mt-2 rounded-lg bg-red-50 p-2 text-xs text-red-800">
            {error}
          </p>
        )}
      </section>
    </Layout>
  )
}
