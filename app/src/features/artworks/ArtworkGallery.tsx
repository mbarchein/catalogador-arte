import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { uploadShot, masterDownloadUrl, signedUrl, type PreparedShot } from '../../lib/images'
import { SHOT_TYPE_LABEL, type ShotTypeValue } from '../../lib/types'
import { useAuth } from '../../auth/AuthContext'
import { useLiveChanges } from '../../lib/live'
import { YesIcon } from '../../components/ui'
import { PhotoInput } from './PhotoInput'

interface ImageRow {
  image_id: string
  thumbnail_path: string
  derivative_path: string
  master_path: string | null
  shot_type: ShotTypeValue
  index_image: boolean
  photo_date: string | null
}

/**
 * Gallery of the record page, with main-image selection (RF-405).
 *
 * The main-image change applies **immediately**, with its own button, and not
 * as part of the artwork form. They are two different things: one touches the
 * images table and the other the artworks one, and mixing them would force
 * deciding what happens to the image if someone cancels the record edit. It is
 * also a single-datum change, reversible with another tap, so it needs none of
 * the ceremony of a form with save and cancel.
 *
 * All URLs are requested signed (RF-110): the bucket is private. They expire
 * in an hour, plenty for a session and limiting the damage if someone shares
 * the link.
 */
export function ArtworkGallery({ catalogId }: { catalogId: string }) {
  const { canEdit } = useAuth()
  const [images, setImages] = useState<ImageRow[]>([])
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [viewId, setViewId] = useState<string | null>(null)
  const [largeUrl, setLargeUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  // Which image represents the artwork is decided by the
  // `representative_image` view, which applies the RF-403 rule. The client
  // does not recompute it: if it did, the list, the record and the printed
  // catalog could disagree.
  const [mainId, setMainId] = useState<string | null>(null)
  const [manuallyChosen, setManuallyChosen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState<string | null>(null)
  // Two-tap confirmation to remove a photo. On a touch screen, a single-tap
  // remove button next to the thumbnails gets pressed by accident.
  const [confirmRemoval, setConfirmRemoval] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('images')
      .select(
        'image_id, thumbnail_path, derivative_path, master_path, shot_type, index_image, photo_date',
      )
      .eq('catalog_id', catalogId)
      .eq('active', true)
      .order('image_id', { ascending: true })

    const rows = (data ?? []) as unknown as ImageRow[]
    setImages(rows)

    const { data: rep } = await supabase
      .from('representative_image')
      .select('image_id, manually_chosen')
      .eq('catalog_id', catalogId)
      .maybeSingle()
    const representative = rep as { image_id: string; manually_chosen: boolean } | null
    setMainId(representative?.image_id ?? null)
    setManuallyChosen(representative?.manually_chosen ?? false)

    const pairs = await Promise.all(
      rows.map(async (r) => [r.image_id, await signedUrl(r.thumbnail_path)] as const),
    )
    setUrls(Object.fromEntries(pairs.filter((p): p is [string, string] => p[1] !== null)))
    setLoading(false)
    return { rows, main: representative?.image_id ?? null }
  }, [catalogId])

  // Photos another cataloger adds or retires appear without reloading.
  useLiveChanges('images', () => void load(), `catalog_id=eq.${catalogId}`)

  useEffect(() => {
    let current = true
    void (async () => {
      const { main } = await load()
      if (!current) return
      setViewId(main)
    })()
    return () => {
      current = false
    }
  }, [load])

  // The derivative is requested only for the one being viewed: fetching all of
  // them would spend data on viewing what nobody opened.
  useEffect(() => {
    let current = true
    const row = images.find((r) => r.image_id === viewId)
    if (!row) {
      setLargeUrl(null)
      return
    }
    void signedUrl(row.derivative_path).then((u) => {
      if (current) setLargeUrl(u)
    })
    return () => {
      current = false
    }
  }, [viewId, images])

  async function useAsMain(imageId: string) {
    setSaving(true)
    setError(null)
    setNotice(null)
    const { error } = await supabase.rpc('set_main_image', { p_image_id: imageId })
    if (error) {
      setError(error.message)
    } else {
      await load()
      setNotice('Imagen principal actualizada.')
    }
    setSaving(false)
  }

  /**
   * On the record page photos upload **right away**: the artwork already
   * exists, so there is nothing to queue. That is the difference with the
   * capture flow, where the artwork has no identifier yet for the images to
   * hang from.
   */
  async function addPhotos(prepared: PreparedShot[]) {
    setError(null)
    setNotice(null)
    const failures: string[] = []
    for (let i = 0; i < prepared.length; i += 1) {
      const shot = prepared[i]
      if (!shot) continue
      setUploading(`Subiendo ${i + 1} de ${prepared.length}…`)
      try {
        // Not marked as index: which one represents the artwork is decided
        // separately, and adding a photo should not change the cover without
        // anyone asking.
        await uploadShot(catalogId, shot, { shotType: 'GENERAL', isIndex: false })
      } catch (e) {
        failures.push(e instanceof Error ? e.message : String(e))
      }
      URL.revokeObjectURL(shot.preview)
    }
    setUploading(null)
    await load()
    if (failures.length > 0) {
      setError(`No se han podido subir ${failures.length} de ${prepared.length}: ${failures[0]}`)
    } else {
      setNotice(
        prepared.length === 1 ? 'Fotografía añadida.' : `${prepared.length} fotografías añadidas.`,
      )
    }
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
      const { main } = await load()
      // The one being viewed is gone: switch to the one now representing the
      // artwork.
      setViewId(main)
      setNotice('Fotografía retirada. El archivo se conserva.')
    }
    setConfirmRemoval(null)
    setSaving(false)
  }

  if (loading) {
    return <div className="mb-3 aspect-[4/3] animate-pulse rounded-xl bg-stone-200" />
  }

  // RF-404: explicit placeholder, not an unexplained gap.
  if (images.length === 0) {
    return (
      <div className="mb-3">
        <div className="flex aspect-[4/3] items-center justify-center rounded-xl border border-stone-200 bg-stone-100">
          <p className="text-sm text-stone-500">Imagen no disponible</p>
        </div>
        {canEdit && (
          <div className="mt-2">
            {uploading ? (
              <p role="status" className="text-sm text-stone-600">
                {uploading}
              </p>
            ) : (
              <PhotoInput onPrepare={addPhotos} disabled={false} compact />
            )}
            {error && (
              <p role="alert" className="mt-2 rounded-lg bg-red-50 p-2 text-xs text-red-800">
                {error}
              </p>
            )}
          </div>
        )}
      </div>
    )
  }

  const viewing = images.find((r) => r.image_id === viewId)
  const viewingIsMain = viewing?.image_id === mainId

  return (
    <div className="mb-3">
      {largeUrl && (
        <img
          src={largeUrl}
          alt={`Obra ${catalogId}`}
          className="w-full rounded-xl border border-stone-200 bg-white object-contain"
        />
      )}

      {images.length > 1 && (
        <ul className="mt-2 flex gap-2 overflow-x-auto pb-1">
          {images.map((r) => {
            const isMain = r.image_id === mainId
            return (
              <li key={r.image_id} className="shrink-0">
                <button
                  type="button"
                  onClick={() => setViewId(r.image_id)}
                  aria-label={`Ver ${SHOT_TYPE_LABEL[r.shot_type]}${isMain ? ', imagen principal' : ''}`}
                  aria-pressed={r.image_id === viewId}
                  className={`relative block overflow-hidden rounded-lg border-2 ${
                    r.image_id === viewId ? 'border-stone-800' : 'border-stone-200'
                  }`}
                >
                  {urls[r.image_id] ? (
                    <img
                      src={urls[r.image_id]}
                      alt=""
                      className="h-20 w-20 object-cover"
                    />
                  ) : (
                    <span className="flex h-20 w-20 items-center justify-center bg-stone-100 text-[10px] text-stone-500">
                      sin vista
                    </span>
                  )}
                  {isMain && (
                    <span
                      className="absolute left-1 top-1 rounded-full bg-stone-900/85 p-0.5 text-white"
                      title="Imagen principal"
                    >
                      <YesIcon className="h-3 w-3" />
                    </span>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {/* Adding and removing photos from the record: capture solves the
          initial entry, but an artwork gets re-photographed — after a
          restoration, with better light, or because the back side was missing
          — and that happens long after the initial entry. */}
      {canEdit && (
        <div className="mt-3 space-y-2">
          {uploading ? (
            <p role="status" className="text-sm text-stone-600">
              {uploading}
            </p>
          ) : (
            <PhotoInput onPrepare={addPhotos} disabled={saving} compact />
          )}

          {viewing &&
            (confirmRemoval === viewing.image_id ? (
              <div className="rounded-lg border border-red-200 bg-red-50 p-2">
                <p className="text-xs text-red-900">
                  ¿Quitar esta fotografía de la ficha? El archivo se conserva, pero deja de
                  mostrarse.
                </p>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void removePhoto(viewing.image_id)}
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
                onClick={() => setConfirmRemoval(viewing.image_id)}
                className="btn min-h-touch w-full border border-red-300 bg-white text-sm text-red-800"
              >
                Quitar esta fotografía
              </button>
            ))}
        </div>
      )}

      {/* RF-405: choosing the main one among those already uploaded. */}
      {canEdit && viewing && (
        <div className="mt-2">
          {viewingIsMain ? (
            <p className="text-xs text-stone-500">
              {!manuallyChosen
                ? // Distinguishing "chosen by hand" from "chosen by the
                  // fallback rule" matters: in the second case, uploading one
                  // more photo can change it on its own.
                  'Se muestra esta por ser la general más reciente. Fíjala para que no cambie al añadir fotos.'
                : `Esta es la imagen principal · ${SHOT_TYPE_LABEL[viewing.shot_type]}`}
              {!manuallyChosen && (
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void useAsMain(viewing.image_id)}
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
              onClick={() => void useAsMain(viewing.image_id)}
              className="btn-secondary w-full"
            >
              {saving ? 'Guardando…' : 'Usar esta como imagen principal'}
            </button>
          )}
        </div>
      )}

      {notice && (
        <p role="status" className="mt-2 rounded-lg bg-green-50 p-2 text-xs text-green-900">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-2 rounded-lg bg-red-50 p-2 text-xs text-red-800">
          No se ha podido cambiar: {error}
        </p>
      )}

      <div className="mt-1 flex items-baseline justify-between gap-2 text-xs text-stone-500">
        <span>
          {images.length} {images.length === 1 ? 'fotografía' : 'fotografías'}
        </span>
        {/* RF-411: the master is never shown in a view; it gets downloaded
            deliberately, with the function's signed URL. Also available to the
            Reader: downloading an original for a print shop or a curator is
            exactly their use case. */}
        {viewing?.master_path && (
          <button
            type="button"
            className="min-h-touch shrink-0 underline"
            onClick={() => {
              void masterDownloadUrl(viewing.master_path as string)
                .then((u) => window.open(u, '_blank', 'noopener'))
                .catch((e) => setError(e instanceof Error ? e.message : String(e)))
            }}
          >
            Descargar máster
          </button>
        )}
      </div>
    </div>
  )
}
