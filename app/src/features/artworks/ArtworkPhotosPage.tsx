import { useCallback, useEffect, useMemo, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router'
import { Layout } from '../../components/Layout'
import { supabase } from '../../lib/supabase'
import { photoSourceHint, photoSourceLabel } from './photoSource'
import {
  draftSourceText,
  pendingDataNotice,
  photoDataColumns,
  photoDataDirty,
  photoDataDraft,
  withSourceText,
  PHOTO_SECTIONS,
  type PhotoDataDraft,
} from './photoData'
import { CORRECTED_NOT_GENERATED, uploadShot, type CorrectedCopyResult } from '../../lib/images'
import {
  colorAvailability,
  composeEdits,
  editSummary,
  editToColumns,
  isNoEdit,
  sameEdit,
  NO_EDIT,
  type CropSource,
  type NormalizedPhotoEdit,
  type PhotoEdit,
} from '../../lib/imageEdits'
import { editSource, renderCorrectedCopy, savePhotoEdit } from '../../lib/imageRender'
import {
  pendingUploadNotice,
  pendingUploadText,
  preparingCopyText,
  uploadFailureText,
  uploadStatusText,
} from './uploadProgress'
import {
  PHOTO_PROVENANCE_LABEL,
  SHOT_TYPE_LABEL,
  type ShotTypeValue,
} from '../../lib/types'
import { displayDate } from '../../lib/dates'
import { useEditingAccess } from '../../auth/AuthContext'
import { ActionBar, Chips, CropIcon, LoadingNotice } from '../../components/ui'
import { moveItem } from '../../lib/reorder'
import { useUnloadGuard } from '../../components/useUnloadGuard'
import { rememberBatchColor } from './batch'
import { PhotoPicker, type QueuedShot } from './PhotoPicker'
import { useArtworkImages, type ImageRow } from './artworkImages'
import {
  PHOTO_DETAIL_COLUMNS,
  PHOTO_PROVENANCES,
  correctedStateText,
  generalColorOf,
  photoEdit,
  provenanceOf,
  traceOnlyChange,
  type PhotoDetailRow,
} from './photoDetails'
import { PhotoCarousel } from './PhotoCarousel'
import { photoDateWhisper } from './PhotoDataPanel'
import { PhotoEditor } from './PhotoEditor'
import { ReorderableThumbnails } from './ReorderableThumbnails'
import { usePhotoDetails } from './usePhotoDetails'

/**
 * The colour, the provenance and the state of the corrected copy of ONE photograph,
 * read again at the moment of opening the editor.
 *
 * Not taken from the list already on screen, and that is the difference between a
 * detail and a defect: `savePhotoEdit` writes the whole transformation, so it writes
 * the fourteen colour columns too. Opening the editor on a row whose colour was never
 * read means saving the identity over an adjustment somebody made — a silent
 * destruction of work that the photograph would show and the row would deny. One row
 * of short columns, next to a master download of several megabytes.
 */
async function fetchPhotoDetail(imageId: string): Promise<PhotoDetailRow | null> {
  const { data, error } = await supabase
    .from('images')
    .select(PHOTO_DETAIL_COLUMNS)
    .eq('image_id', imageId)
    .maybeSingle()
  if (error || !data) return null
  const row = data as unknown as PhotoDetailRow
  return { ...row, provenance: provenanceOf(row.provenance) }
}

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
  const { id, imageId } = useParams<{ id: string; imageId?: string }>()
  const navigate = useNavigate()
  const access = useEditingAccess()
  const catalogId = id ?? ''
  const { images, thumbUrls, mainId, manuallyChosen, loading, reload } =
    useArtworkImages(catalogId)
  const { details, detailsFailed } = usePhotoDetails(catalogId, images, loading)

  /**
   * Which photograph has its panel open lives in the ROUTE, not in local state
   * (`/artwork/TS-0005/photos/TS-0005_v2`): it survives a reload, it can be sent as
   * a link, and the phone's back button closes the panel instead of leaving the
   * screen. The same reason the record's edit mode is a route — see App.tsx.
   */
  const selectedId = imageId ?? null

  /**
   * Opens a photograph's panel, or closes it with null.
   *
   * Always `replace`, never push. The first version pushed when nothing was open, to
   * make «atrás» close the panel — and that branch is unreachable: the effect below
   * opens a photograph as soon as the rows arrive, so «nothing open» only exists in
   * an artwork with no photographs at all. Verified in the browser: «atrás» from the
   * screen goes to the record, which is what it did before this was a route.
   *
   * What `replace` does buy is the thing that would be felt: tapping through
   * thumbnails does not pile a history entry each, so «atrás» does not walk every
   * photograph looked at before leaving. It is the same reason the list's filters
   * replace instead of pushing.
   */
  const openPhoto = useCallback(
    (next: string | null) => {
      const base = `/artwork/${catalogId}/photos`
      navigate(next ? `${base}/${next}` : base, { replace: true })
    },
    [catalogId, navigate],
  )
  // Order being dragged, before the database confirms it. null means "what the
  // database says": there is one order and one owner, so a dropped thumbnail
  // never fights the order arriving from a reload or from Realtime.
  const [draggedOrder, setDraggedOrder] = useState<string[] | null>(null)
  const [staged, setStaged] = useState<QueuedShot[]>([])
  const [uploading, setUploading] = useState<string | null>(null)
  /**
   * Why the last upload failed, kept apart from the page's `error` so it can be shown
   * IN THE FOOTER BAR, next to the button that was pressed.
   *
   * The page's error lives at the end of the photographs section, which after adding
   * four shots is a long way down: pressing «Subir» and having the reason appear off
   * screen is how «la conexión se ha cortado» turns into «no ha pasado nada».
   */
  const [uploadError, setUploadError] = useState<string | null>(null)
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
   *
   * `stored` and `detail` are the row as it was read when the editor opened, and they
   * are kept instead of looked up again on save: what the save compares against and
   * writes has to be the state the cataloger was shown, not one that changed underneath
   * while the panel was open. `fromMaster` is that same fact stated for
   * `savePhotoEdit`, which needs it to decide whether a full-resolution copy can be
   * built at all (RF-420) — and it was already being carried, disguised as
   * `note === null`.
   */
  const [editing, setEditing] = useState<{
    row: ImageRow
    detail: PhotoDetailRow
    source: Blob
    fromMaster: boolean
    stored: NormalizedPhotoEdit
    baked: PhotoEdit
    initial: PhotoEdit
    note: string | null
  } | null>(null)

  /**
   * Una recarga sin querer aquí se lleva trabajo de verdad (RNF-106).
   *
   * Con una subida en marcha se pierde lo enviado y los segundos de generar la copia a
   * tamaño completo. Y con fotografías preparadas se pierden LAS FOTOGRAFÍAS: al
   * contrario que la pantalla de captura, que apunta su cola en el teléfono, aquí están
   * solo en memoria — se eligieron del carrete o se hicieron con la cámara, se les puso
   * el tipo de toma y quizá se recortaron, y de eso no queda nada.
   */
  useUnloadGuard(uploading !== null || staged.length > 0)

  // The selection starts on the main image and follows removals; it never
  // jumps on its own while the cataloger is working.
  useEffect(() => {
    if (loading) return
    const known = selectedId !== null && images.some((r) => r.image_id === selectedId)
    if (known) return
    // Nothing open, or the address names a photograph this artwork does not have —
    // a link shared before it was retired, or one typed by hand. It is corrected
    // with `replace` so «atrás» does not walk through the wrong address, and it
    // waits for the rows: correcting while they are still loading would throw away
    // a perfectly good link.
    const fallback = mainId ?? images[0]?.image_id ?? null
    if (fallback === selectedId) return
    navigate(fallback ? `/artwork/${catalogId}/photos/${fallback}` : `/artwork/${catalogId}/photos`, {
      replace: true,
    })
  }, [loading, images, mainId, selectedId, catalogId, navigate])

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
  const selectedDetail = selectedId ? details[selectedId] : undefined
  // The framing and the colour read together, which is the only way they mean anything:
  // the summary of a photograph with a correction and no colour column read would
  // announce «sin ajuste de color» over a photograph that plainly shows one.
  const selectedEdit = photoEdit(selected, selectedDetail)

  function discardStaged() {
    staged.forEach((s) => URL.revokeObjectURL(s.prepared.preview))
    setStaged([])
    setUploadError(null)
  }

  async function uploadStaged() {
    setError(null)
    setUploadError(null)
    setNotice(null)
    const queue = staged
    const failed: QueuedShot[] = []
    const pending: string[] = []
    let done = 0
    // The last thing the counter said, so a failure can be written down and not merely
    // watched: «se quedó en el original, 2,1 MB de 3,6 MB» is a different report from the
    // same sentence with no numbers in it, and it is the difference between a bad
    // connection and something that stops at the same byte every time.
    let at: Parameters<typeof uploadFailureText>[0]['at']
    const startedAt = Date.now()
    for (let i = 0; i < queue.length; i += 1) {
      const shot = queue[i]
      if (!shot) continue
      try {
        // The full-resolution copy is built HERE and not later, because here the master is
        // still in memory: RF-420 with no download. One shot at a time, which keeps the
        // peak at one master and not at the whole queue — this is a file the size of the
        // master, and a phone holding four of them at once is a phone that reloads.
        //
        // Announced with its own message because on a 9248 px master it is twelve seconds
        // of a screen that would otherwise claim to be uploading. `isNoEdit` here decides
        // only the WORDING; whether there is a copy at all is the generator's call.
        const position = { index: i + 1, count: queue.length }
        setUploading(
          isNoEdit(shot.prepared.edit)
            ? uploadStatusText(position)
            : preparingCopyText(position.index, position.count),
        )
        const correctedCopy = await correctedCopyOf(shot)
        setUploading(uploadStatusText(position))
        // Never marked as index: which one represents the artwork is decided
        // separately, and adding a photo should not change the cover without
        // anyone asking.
        const result = await uploadShot(catalogId, shot.prepared, {
          shotType: shot.shotType,
          isIndex: false,
          cropSource: shot.prepared.cropSource,
          // Chosen in the staging panel and persisted with the queue, so a reload while
          // the camera was in the foreground does not turn a reproduction into own work.
          provenance: shot.prepared.provenance,
          correctedCopy,
          // The bytes as they go out (RNF-106). Straight to state: these arrive a few
          // times a second at most — the browser throttles `upload.onprogress` — so
          // there is nothing here worth debouncing.
          onProgress: (step, event, attempt) => {
            at = { step, loaded: event.loaded, total: event.total, attempt }
            setUploading(uploadStatusText({ ...position, step, ...event, attempt }))
          },
        })
        if (result.correctedPending) pending.push(result.correctedPending)
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
      setUploadError(
        uploadFailureText({
          failed: failed.length,
          total: queue.length,
          message: failed[0]?.error ?? '',
          at,
          seconds: (Date.now() - startedAt) / 1000,
        }),
      )
    } else {
      // What is missing is said with the photographs that were added, and not instead of
      // them: the shot IS registered and its correction IS stored; what is pending is a
      // file for a print shop, and staying quiet about it is what ADR-010 refuses.
      const missing =
        pending.length > 0
          ? ` ${pending.length === 1 ? 'Una' : pending.length} sin copia a resolución completa: ${pending[0]}`
          : ''
      setNotice(
        (done === 1 ? 'Fotografía añadida.' : `${done} fotografías añadidas.`) + missing,
      )
    }
  }

  /**
   * The full-resolution corrected copy of a shot about to be uploaded (RF-420).
   *
   * It never throws and never takes the upload down with it: a master that will not
   * decode, or a canvas ceiling this phone cannot reach, leaves the copy pending — which
   * is a row that says «hace falta y falta» and a queue a computer empties later
   * (RF-421). Losing the photograph over the fourth level would be the wrong trade by a
   * wide margin, and a shot with no correction answers «no hace falta» without decoding
   * anything.
   */
  async function correctedCopyOf(shot: QueuedShot): Promise<CorrectedCopyResult> {
    try {
      return await renderCorrectedCopy(shot.prepared.master, shot.prepared.edit)
    } catch {
      return { status: 'PENDING', reason: CORRECTED_NOT_GENERATED }
    }
  }

  /**
   * Los datos de la toma, guardados a la vez y solo al pulsar (RF-417).
   *
   * Antes eran tres escrituras sueltas —los chips al tocarlos y el texto al salir
   * del campo— y esa última es medio invisible en un móvil. Ahora es un formulario:
   * nada se escribe hasta que se pulsa, y la pantalla dice si queda algo pendiente.
   */
  async function savePhotoData(imageId: string, draft: PhotoDataDraft) {
    setSaving(true)
    setError(null)
    setNotice(null)
    const { error } = await supabase
      .from('images')
      .update(photoDataColumns(draft))
      .eq('image_id', imageId)
    if (error) {
      setError(error.message)
    } else {
      await reload()
      setNotice('Datos de la toma guardados.')
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
      openPhoto(main)
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
      // The colour and the provenance first, and if they cannot be read the editor does
      // not open. Not caution: saving writes the fourteen colour columns from what was
      // read here, so opening without them would turn a crop into the deletion of an
      // adjustment nobody asked to remove.
      const detail = await fetchPhotoDetail(row.image_id)
      if (!detail) {
        setError(
          'No se han podido leer el color y la procedencia de esta fotografía, así que no se abre ' +
            'el editor: guardar sin ese dato borraría el ajuste que ya tenga. Vuelve a intentarlo ' +
            'con mejor cobertura. El máster de archivo está intacto.',
        )
        return
      }
      const stored = photoEdit(row, detail)
      const source = await editSource(row)

      // A straightened photograph cannot be re-edited from the consultation copy.
      // That copy IS the straightened image, so there is no way to express a framing
      // over the master starting from it, and `composeEdits` refuses perspective for
      // exactly that reason — it would throw here. Saying so is better than the
      // error it would produce two taps later.
      if (!source.fromMaster && stored.corners) {
        setError(
          'Esta fotografía tiene la perspectiva corregida y no se ha podido descargar el máster. ' +
            'Reencuadrarla desde la copia de consulta deformaría la imagen otra vez, así que hay que ' +
            'esperar a tener mejor cobertura. El máster de archivo está intacto.',
        )
        return
      }

      setEditing({
        row,
        detail,
        source: source.blob,
        fromMaster: source.fromMaster,
        stored,
        baked: source.fromMaster ? NO_EDIT : stored,
        initial: source.fromMaster ? stored : NO_EDIT,
        note: source.fromMaster
          ? null
          : 'No se ha podido descargar el máster: se parte de la copia de consulta, que ya viene recortada, tiene menos resolución y lleva el color ya aplicado. Puedes recortar más, pero no ensanchar el recorte, ni ajustar el color, ni volver al original. El máster de archivo no se toca: inténtalo de nuevo con mejor cobertura para reencuadrar desde él.',
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
   * Publishes the correction: the framing and the colour of the room's light. The new
   * copies go to NEW paths and the row is pointed at them: the paths of the bucket are
   * immutable because the service worker caches images by path, and overwriting one
   * would keep showing the old framing from the phone's cache. The superseded files
   * stay in the bucket — here nothing is ever really deleted — and the master is not
   * touched.
   *
   * `edit` comes measured over the image the editor worked on; what is stored is
   * the whole transformation from the master, colour included, absolute over it and
   * replacing whatever was there before (RF-414).
   */
  async function applyEdit(edit: PhotoEdit, cropSource: CropSource) {
    const current = editing
    setEditing(null)
    if (!current) return
    const stored = current.stored
    const absolute = composeEdits(current.baked, edit)
    if (sameEdit(absolute, stored)) {
      // Same pixels. Two different situations, and telling them apart is what keeps a
      // review from being lost: if the ROW changed —«se abrió el panel de color, se miró
      // la obra y se dejó como estaba», or the grey was sampled somewhere else— that
      // trace is written on its own, without touching a single file. `sameEdit`
      // deliberately ignores where the numbers came from, and `imageEdits.ts` exports
      // `editToColumns` for exactly this comparison.
      if (traceOnlyChange(absolute, stored)) {
        await saveEditTrace(current.row.image_id, absolute, cropSource)
        return
      }
      // Not rewriting for nothing: every rewrite leaves the previous copies
      // orphaned in the bucket.
      setNotice('El encuadre y el color no han cambiado: no se ha reescrito ninguna copia.')
      return
    }
    setWorking('Aplicando la corrección y subiendo las copias…')
    setError(null)
    setNotice(null)
    try {
      const result = await savePhotoEdit({
        catalogId,
        imageId: current.row.image_id,
        source: current.source,
        render: edit,
        store: absolute,
        cropSource,
        // What switches RF-420 on. Said explicitly and not deduced inside: from the
        // consultation copy a «full-resolution» copy would be a quietly reduced one,
        // which is what ADR-010 forbids, so whoever does not know says nothing and the
        // copy stays pending — recoverable from a computer (RF-421).
        sourceIsMaster: current.fromMaster,
        masterPath: current.row.master_path,
      })
      // The light of the batch, remembered for the next photograph (RF-414). It is the
      // same room and the same afternoon whether the shot is already uploaded or still
      // waiting, so correcting one here also fills «El mismo color que la anterior» for
      // the ones being added above. Cleared by itself when the correction is undone.
      rememberBatchColor(absolute.color)
      // The reload brings the new paths; Realtime tells the record and the
      // listing, which also listen to the images table.
      await reload()
      // The print copy is announced only when there is something to say. Pending comes
      // with the generator's own reason — it says the size, that it is generated later
      // from a computer and that the master is intact — and «uploaded» says nothing,
      // because a file that is where it should be is not news.
      const pending =
        result.corrected.status === 'PENDING' ? ` ${result.corrected.reason}` : ''
      setNotice(
        `${editSummary(absolute) ?? 'Fotografía original restablecida'}. El máster de archivo se conserva intacto.${pending}`,
      )
    } catch (e) {
      setError(
        `No se ha podido guardar la corrección: ${
          e instanceof Error ? e.message : String(e)
        }. La fotografía sigue como estaba.`,
      )
    } finally {
      setWorking(null)
    }
  }

  /**
   * Writes the row when the pixels did not change but the trace did.
   *
   * No files are encoded and none are uploaded: what changed is where the grey was
   * measured, which preset the numbers came from, or the fact that the colour was
   * reviewed and left alone (`REVIEWED_UNCHANGED`) — which is the one thing that tells
   * «revisado» from «pendiente», and «sin revisar» no es «no». The geometry columns are
   * written along with them and land on the values they already had, because the edit is
   * the same one.
   */
  async function saveEditTrace(imageId: string, edit: PhotoEdit, cropSource: CropSource) {
    setWorking('Anotando la revisión del color…')
    setError(null)
    setNotice(null)
    const { error } = await supabase
      .from('images')
      .update({ ...editToColumns(edit), crop_source: cropSource })
      .eq('image_id', imageId)
    if (error) {
      setError(`No se ha podido anotar la revisión del color: ${error.message}`)
    } else {
      await reload()
      setNotice(
        'El color no cambia ningún píxel, así que no se ha reescrito ninguna copia: solo se ha ' +
          'anotado que esta fotografía ya se ha revisado.',
      )
    }
    setWorking(null)
  }

  // A reader reaching this URL falls back to the record view (RF-109) — but only
  // once the role is KNOWN. Deciding on the first render sent the cataloger back to
  // the record every time she reloaded this address, because the profile arrives
  // after the session. See useEditingAccess.
  if (access === 'loading') return <LoadingNotice />
  if (access === 'denied') {
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
          <PhotoPicker shots={staged} onChange={setStaged} disabled={saving} withIndex={false} />
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
                openPhoto(imageId)
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
            {/* El icono de editar va SOBRE la fotografía, no en el panel de datos:
                actúa sobre lo que se está mirando y no sobre «la seleccionada»,
                que es la ambigüedad que tenía en una lista con cuatro tomas. Fuera
                del carrusel y no dentro de cada diapositiva, para que se quede
                quieto mientras se pasa de una a otra. */}
            <div className="relative mt-3">
              <PhotoCarousel
                images={ordered}
                thumbUrls={thumbUrls}
                viewId={selectedId}
                onView={(imageId) => {
                  openPhoto(imageId)
                  setConfirmRemoval(null)
                }}
                catalogId={catalogId}
              />
              {selected && (
                <button
                  type="button"
                  aria-label="Girar, recortar y color"
                  title="Girar, recortar y color"
                  disabled={saving || working !== null}
                  onClick={() => void openEditor(selected)}
                  className="absolute bottom-2 right-2 flex h-11 w-11 items-center justify-center
                             rounded-full bg-stone-900/70 text-white shadow-lg backdrop-blur
                             active:bg-stone-900 disabled:opacity-40"
                >
                  <CropIcon className="h-5 w-5" />
                </button>
              )}
            </div>

            {/* Lo que le ha pasado a esta fotografía, bajo la fotografía: es donde se
                ve lo que describen. Mientras se trabaja, aquí va el paso en curso —el
                icono no tiene sitio para decirlo—. */}
            {selected && (
              <div className="mt-1">
                <p className="text-xs text-stone-500">
                  {working ??
                    (editSummary(selectedEdit)
                      ? `${editSummary(selectedEdit)}. El máster de archivo se conserva sin tocar.`
                      : 'Sin giro, recorte ni ajuste de color. Se editan las copias, nunca el máster de archivo.')}
                </p>
                {/* El estado del cuarto nivel, siempre dicho y nunca un hueco: una copia,
                    ninguna que haga falta, una que hace falta y no está, o una fotografía
                    corregida antes de que existieran las copias (RF-420). */}
                <p className="mt-1 text-xs text-stone-500">
                  {selectedDetail || detailsFailed
                    ? correctedStateText(selectedDetail, selectedEdit)
                    : 'Comprobando el color y el estado de la copia a resolución completa…'}
                </p>
                {detailsFailed && (
                  <p className="mt-1 text-xs text-amber-800">
                    No se han podido leer el color, la procedencia ni el estado de la copia a
                    resolución completa de esta ficha. Lo que se ve arriba puede estar incompleto;
                    los datos guardados no se han tocado.
                  </p>
                )}
              </div>
            )}

            {selected && (
              <div className="mt-3 space-y-3 rounded-lg border border-stone-300 bg-stone-50 p-3">
                <p className="text-xs text-stone-500">
                  {selected.image_id}
                  {selected.photo_date ? ` · ${displayDate(selected.photo_date)}` : ''}
                  {/* The size of the original as the decoder gave it, orientation already
                      applied. It is in the row precisely because the master is in B2 and
                      reading it back would mean downloading megabytes. */}
                  {selectedDetail?.original_width && selectedDetail.original_height
                    ? ` · ${selectedDetail.original_width}×${selectedDetail.original_height} px`
                    : ''}
                </p>

                {/* The date the file carries, next to the record's and never instead of it
                    (RF-416). Same sentence as the editor's data panel, from the same
                    function: two wordings for the same discrepancy would be two rules.
                    In a low voice — today all 39 rows disagree, because their stored date
                    is the day they were uploaded — and saying which of the two it is,
                    because an approximation read as a measurement is worse than no date. */}
                {photoDateWhisper(selectedDetail?.file_photo_date, selected.photo_date) && (
                  <p className="text-xs text-stone-500">
                    {photoDateWhisper(selectedDetail?.file_photo_date, selected.photo_date)}
                    {selectedDetail?.file_photo_date_exact === false &&
                      ' Es la fecha del fichero, aproximada: la cámara no escribió la del disparo.'}
                  </p>
                )}

                {/* ── Qué es esta toma ──
                    Los tres datos que describen la fotografía, juntos y con un solo
                    «Guardar»: son la misma pregunta —qué es esto y de dónde salió— y
                    antes se guardaban de tres formas distintas. Ver photoData.ts. */}
                <PhotoDataForm
                  key={selected.image_id}
                  saved={photoDataDraft({
                    shot_type: selected.shot_type,
                    provenance: selectedDetail?.provenance ?? 'OWN',
                    photo_credit: selectedDetail?.photo_credit ?? '',
                    provenance_source: selectedDetail?.provenance_source ?? '',
                  })}
                  busy={saving}
                  onSave={(draft) => void savePhotoData(selected.image_id, draft)}
                />

                {/* ── Orden y portada ──
                    Dónde va esta toma entre las demás y si es la que representa la
                    obra. Juntas porque las dos contestan «cuál se ve primero».
                    Same move, one place at a time: dragging is faster but it
                    is a gesture, and a gesture cannot be the only way to
                    reach a function. */}
                <div>
                  <SectionTitle>{PHOTO_SECTIONS.order}</SectionTitle>
                  {ordered.length > 1 && (
                    <div className="mb-2">
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
                </div>

                {/* ── Retirar ──
                    Aparte y al final, con su propio título: es lo único de este
                    panel que quita algo de la ficha. */}
                <div>
                  <SectionTitle>{PHOTO_SECTIONS.remove}</SectionTitle>
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
          // outside the crop to come back to. It is also what closes the colour panel on
          // the degraded path — those pixels already carry the colour baked in, and
          // adjusting them again would correct the compression as if it were the artwork.
          canRestoreOriginal={editing.fromMaster}
          // RF-417: the other switch of the colour panel, and the reason it prints.
          provenance={editing.detail.provenance}
          // §7: the general shot rules. The back, the signature, the damage and the frame
          // start from her adjustment and can be brought back to it; the general shot
          // itself is left out, because it inherits from nobody.
          generalColor={generalColorOf(ordered, details, editing.row.image_id)}
          // The record's own date for this photograph, so §7.1 can name a discrepancy
          // with the date the file carries — in a low voice, without alarm. Today all 39
          // rows differ, because the record date is the day they were uploaded.
          recordPhotoDate={editing.row.photo_date}
          onApply={(edit, cropSource) => void applyEdit(edit, cropSource)}
          onCancel={() => setEditing(null)}
        />
      )}

      {/* ── Lo que falta por subir, pegado al pie ──
          Como en el formulario de editar la ficha, y por el mismo motivo. Estos botones
          vivían dentro de la tarjeta de arriba, así que añadir cuatro fotografías —cada
          una una miniatura en la tira, cada una con su tipo de toma que elegir— los
          sacaba de la pantalla. Fotos preparadas y nunca enviadas es el único fallo que
          esta pantalla produce en silencio, y «no lo he subido» no se distingue de «no lo
          he hecho». La barra solo existe mientras hay algo pendiente o algo subiendo: sin
          nada que hacer con ella, no tapa la ficha. */}
      {(staged.length > 0 || uploading) && (
        <ActionBar
          notice={
            uploading ? (
              <p role="status" className="rounded-lg bg-stone-50 p-2 text-sm text-stone-700">
                {uploading}
              </p>
            ) : uploadError ? (
              // El motivo, donde se pulsó el botón. Y las fotos siguen preparadas
              // debajo, con su tipo de toma elegido, listas para volver a intentarlo.
              <p role="alert" className="rounded-lg bg-red-50 p-2 text-sm text-red-800">
                {uploadError}
              </p>
            ) : (
              <p className="text-xs text-stone-600">{pendingUploadNotice(staged.length)}</p>
            )
          }
        >
          <button
            type="button"
            disabled={saving || uploading !== null}
            onClick={() => void uploadStaged()}
            className="btn min-h-touch flex-1 bg-stone-900 text-white"
          >
            {uploading
              ? 'Subiendo…'
              : uploadError
                ? 'Volver a intentarlo'
                : pendingUploadText(staged.length)}
          </button>
          <button
            type="button"
            disabled={uploading !== null}
            onClick={discardStaged}
            className="btn-secondary"
          >
            Descartar
          </button>
        </ActionBar>
      )}
    </Layout>
  )
}

/** El título de cada bloque del panel, con la misma voz que los del filtro. */
function SectionTitle({ children }: { children: string }) {
  return (
    <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-stone-500">{children}</h3>
  )
}

/**
 * Qué es esta toma: tipo, procedencia y de quién es (RF-417, RF-405).
 *
 * Un formulario de verdad, con su borrador y su «Guardar»: nada se escribe hasta
 * pulsarlo. Antes eran tres escrituras sueltas —dos al tocar un chip y una al
 * salir del campo de texto— y esa mezcla es lo que hacía imposible saber si algo
 * quedaba pendiente. La aritmética está en `photoData.ts`, con sus tests; aquí
 * solo se pinta.
 *
 * El `key` de quien lo monta es el identificador de la fotografía, así que pasar a
 * otra toma trae sus datos y no el borrador a medias de la anterior.
 */
function PhotoDataForm({
  saved,
  busy,
  onSave,
}: {
  saved: PhotoDataDraft
  busy: boolean
  onSave: (draft: PhotoDataDraft) => void
}) {
  const [draft, setDraft] = useState(saved)
  const dirty = photoDataDirty(draft, saved)
  const pending = pendingDataNotice(dirty)

  return (
    <div>
      <SectionTitle>{PHOTO_SECTIONS.data}</SectionTitle>

      <Chips
        id="p-shot-type"
        label="Tipo de toma"
        columns={3}
        options={(Object.keys(SHOT_TYPE_LABEL) as ShotTypeValue[]).map((v) => ({
          value: v,
          text: SHOT_TYPE_LABEL[v],
        }))}
        value={draft.shotType}
        onChange={(shotType) => setDraft({ ...draft, shotType })}
      />

      {/* Where the photograph comes from (RF-417). Asked and never inferred: a
          1080×2400 file with no camera data looks exactly like a screenshot of an
          online catalog, and looking like one is not being one. */}
      <div className="mt-3">
        <Chips
          id="p-provenance"
          label="Procedencia"
          options={PHOTO_PROVENANCES.map((v) => ({ value: v, text: PHOTO_PROVENANCE_LABEL[v] }))}
          value={draft.provenance}
          onChange={(provenance) => setDraft({ ...draft, provenance })}
        />
        {/* La consecuencia, en el mismo sitio que la causa, y tomada de la regla del
            propio modelo para que no se separe de lo que hace el editor. */}
        <p className="mt-1 text-xs text-stone-500">
          {colorAvailability(true, draft.provenance).reason ??
            'En una fotografía propia se ofrece el ajuste de color de la luz de la sala.'}
        </p>
      </div>

      <div className="mt-3">
        <label className="label" htmlFor="p-photo-source">
          {photoSourceLabel(draft.provenance)}
        </label>
        <input
          id="p-photo-source"
          className="field"
          value={draftSourceText(draft)}
          disabled={busy}
          onChange={(e) => setDraft(withSourceText(draft, e.target.value))}
        />
        <p className="mt-1 text-xs text-stone-500">{photoSourceHint(draft.provenance)}</p>
      </div>

      {/* Lo pendiente se dice, además de encender el botón: un botón que cambia de
          color no se ve cuando lo que se mira es la fotografía. */}
      {pending && <p className="mt-2 text-xs text-amber-800">{pending}</p>}

      <div className="mt-2 grid grid-cols-2 gap-2">
        <button
          type="button"
          className="btn-secondary"
          disabled={busy || !dirty}
          onClick={() => setDraft(saved)}
        >
          Deshacer
        </button>
        <button
          type="button"
          className="btn-primary"
          disabled={busy || !dirty}
          onClick={() => onSave(draft)}
        >
          {busy ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </div>
  )
}
