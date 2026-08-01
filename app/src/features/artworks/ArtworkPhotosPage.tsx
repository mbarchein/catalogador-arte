import { useEffect, useMemo, useState } from 'react'
import { Navigate, useParams } from 'react-router'
import { Layout } from '../../components/Layout'
import { supabase } from '../../lib/supabase'
import { uploadShot } from '../../lib/images'
import {
  composeEdits,
  editFromColumns,
  editSummary,
  sameEdit,
  NO_EDIT,
  type PhotoEdit,
} from '../../lib/imageEdits'
import { editSource, savePhotoEdit, type CropSource } from '../../lib/imageRender'
import { SHOT_TYPE_LABEL, type ShotTypeValue } from '../../lib/types'
import { displayDate } from '../../lib/dates'
import { useAuth } from '../../auth/AuthContext'
import { Chips, CropIcon } from '../../components/ui'
import { moveItem } from '../../lib/reorder'
import { PhotoPicker, type QueuedShot } from './PhotoPicker'
import { useArtworkImages, type ImageRow } from './artworkImages'
import { PhotoCarousel } from './PhotoCarousel'
import { PhotoEditor } from './PhotoEditor'
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
  // Order being dragged, before the database confirms it. null means "what the
  // database says": there is one order and one owner, so a dropped thumbnail
  // never fights the order arriving from a reload or from Realtime.
  const [draggedOrder, setDraggedOrder] = useState<string[] | null>(null)
  const [staged, setStaged] = useState<QueuedShot[]>([])
  const [uploading, setUploading] = useState<string | null>(null)
  /** What the reframing is doing right now, so the screen is never half done. */
  const [working, setWorking] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmRemoval, setConfirmRemoval] = useState<string | null>(null)
  /**
   * Photo being reframed. `source` is the image the editor works on and `baked`
   * is the framing that image ALREADY shows: no framing when it is the master,
   * the stored one when the master could not be downloaded and the consultation
   * copy is used instead — the copy carries it in its pixels.
   */
  const [editing, setEditing] = useState<{
    row: ImageRow
    source: Blob
    baked: PhotoEdit
    initial: PhotoEdit
    note: string | null
  } | null>(null)

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

  /**
   * The photos in the order on screen. While a thumbnail is being dragged that
   * is the provisional order; a photo the drag knows nothing about (someone
   * else just added one) goes last instead of disappearing.
   */
  const ordered = useMemo(() => {
    if (!draggedOrder) return images
    const byId = new Map(images.map((i) => [i.image_id, i]))
    const known = draggedOrder.flatMap((id) => {
      const row = byId.get(id)
      return row ? [row] : []
    })
    const rest = images.filter((i) => !draggedOrder.includes(i.image_id))
    return [...known, ...rest]
  }, [images, draggedOrder])

  const selected = ordered.find((r) => r.image_id === selectedId)

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
    // Whatever happened, the database has the last word: the reload brings the
    // real order and the provisional one is dropped — after a failure that
    // means snapping back to the truth instead of showing a lie.
    await reload()
    setDraggedOrder(null)
    setSaving(false)
  }

  /** Moves the selected photo one place, for whoever does not drag. */
  async function moveSelected(delta: number) {
    if (!selectedId) return
    const current = ordered.map((i) => i.image_id)
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

  /**
   * Opens the editor on a photo already uploaded.
   *
   * The source is the master, because cropping the consultation copy and
   * re-encoding it at the same size throws away resolution the archive already
   * has. It is a 2-8 MB download and it is announced; if it fails, the copy is
   * used and the editor says so instead of leaving the screen doing nothing.
   */
  async function openEditor(row: ImageRow) {
    setError(null)
    setNotice(null)
    setWorking(row.master_path ? 'Descargando el máster…' : 'Abriendo la copia de consulta…')
    try {
      const stored = editFromColumns(row)
      const source = await editSource(row)
      setEditing({
        row,
        source: source.blob,
        baked: source.fromMaster ? NO_EDIT : stored,
        initial: source.fromMaster ? stored : NO_EDIT,
        note: source.fromMaster
          ? null
          : 'No se ha podido descargar el máster: se parte de la copia de consulta, que ya viene recortada y tiene menos resolución. Puedes recortar más, pero no ensanchar el recorte ni volver al original. El máster de archivo no se toca: inténtalo de nuevo con mejor cobertura para reencuadrar desde él.',
      })
    } catch (e) {
      setError(
        `No se ha podido abrir la fotografía para editarla: ${
          e instanceof Error ? e.message : String(e)
        }`,
      )
    } finally {
      setWorking(null)
    }
  }

  /**
   * Publishes the framing. The new copies go to NEW paths and the row is
   * pointed at them: the paths of the bucket are immutable because the service
   * worker caches images by path, and overwriting one would keep showing the old
   * framing from the phone's cache. The superseded files stay in the bucket —
   * here nothing is ever really deleted — and the master is not touched.
   *
   * `edit` comes measured over the image the editor worked on; what is stored is
   * the whole transformation from the master.
   */
  async function applyEdit(edit: PhotoEdit, cropSource: CropSource) {
    const current = editing
    setEditing(null)
    if (!current) return
    const stored = editFromColumns(current.row)
    const absolute = composeEdits(current.baked, edit)
    if (sameEdit(absolute, stored)) {
      // Not rewriting for nothing: every rewrite leaves the previous copies
      // orphaned in the bucket.
      setNotice('El encuadre no ha cambiado: no se ha reescrito ninguna copia.')
      return
    }
    setWorking('Aplicando el encuadre y subiendo las copias…')
    setError(null)
    setNotice(null)
    try {
      await savePhotoEdit({
        catalogId,
        imageId: current.row.image_id,
        source: current.source,
        render: edit,
        store: absolute,
        cropSource,
      })
      // The reload brings the new paths; Realtime tells the record and the
      // listing, which also listen to the images table.
      await reload()
      setNotice(
        `${editSummary(absolute) ?? 'Encuadre original restablecido'}. El máster de archivo se conserva intacto.`,
      )
    } catch (e) {
      setError(
        `No se ha podido guardar el encuadre: ${
          e instanceof Error ? e.message : String(e)
        }. La fotografía sigue como estaba.`,
      )
    } finally {
      setWorking(null)
    }
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
              images={ordered}
              thumbUrls={thumbUrls}
              mainId={mainId}
              selectedId={selectedId}
              onSelect={(imageId) => {
                setSelectedId(imageId)
                setConfirmRemoval(null)
              }}
              onReorder={(from, to) => {
                // Shown at once and persisted right after: the provisional
                // order avoids the thumbnails jumping back while the database
                // answers.
                const next = moveItem(
                  ordered.map((i) => i.image_id),
                  from,
                  to,
                )
                setDraggedOrder(next)
                void saveOrder(next)
              }}
              disabled={saving}
            />

            {/* Same swipe carousel as the record view: flicking through the
                shots while retyping them is exactly the reviewing gesture. */}
            <div className="mt-3">
              <PhotoCarousel
                images={ordered}
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

                {/* Straightening and trimming. It only redoes the copies that
                    are served: the archive master stays as it left the camera
                    (ADR-002). */}
                <div>
                  <button
                    type="button"
                    disabled={saving || working !== null}
                    onClick={() => void openEditor(selected)}
                    className="btn-secondary w-full"
                  >
                    <CropIcon className="h-5 w-5" />
                    {working ?? 'Girar y recortar'}
                  </button>
                  <p className="mt-1 text-xs text-stone-500">
                    {editSummary(editFromColumns(selected))
                      ? `${editSummary(editFromColumns(selected))}. El máster de archivo se conserva sin tocar.`
                      : 'Sin giro ni recorte. Se editan las copias, nunca el máster de archivo.'}
                  </p>
                </div>

                {/* Same move, one place at a time: dragging is faster but it
                    is a gesture, and a gesture cannot be the only way to
                    reach a function. */}
                {ordered.length > 1 && (
                  <div>
                    <p className="label">
                      Orden · {ordered.findIndex((i) => i.image_id === selected.image_id) + 1} de{' '}
                      {ordered.length}
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        disabled={saving || ordered[0]?.image_id === selected.image_id}
                        onClick={() => void moveSelected(-1)}
                        className="btn-secondary disabled:opacity-40"
                      >
                        ← Antes
                      </button>
                      <button
                        type="button"
                        disabled={
                          saving || ordered[ordered.length - 1]?.image_id === selected.image_id
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

      {editing && (
        <PhotoEditor
          source={editing.source}
          initialEdit={editing.initial}
          title={editing.row.image_id}
          note={editing.note}
          shotType={editing.row.shot_type}
          // Only from the master: with the consultation copy there is nothing
          // outside the crop to come back to.
          canRestoreOriginal={editing.note === null}
          onApply={(edit, cropSource) => void applyEdit(edit, cropSource)}
          onCancel={() => setEditing(null)}
        />
      )}
    </Layout>
  )
}
