import { useState } from 'react'
import type { PreparedShot } from '../../lib/images'
import { editSummary, sameEdit, type PhotoEdit } from '../../lib/imageEdits'
import { renderEditedLevels } from '../../lib/imageRender'
import { SHOT_TYPE_LABEL, type ShotTypeValue } from '../../lib/types'
import { Chips, CropIcon, NoIcon, PlusIcon, YesIcon } from '../../components/ui'
import { PhotoInput, type PhotoSource } from './PhotoInput'
import { PhotoEditor } from './PhotoEditor'

/**
 * The "+" tile reopens whatever entry path the last photos came from: while
 * photographing an artwork with the phone, landing on the file selector after
 * every shot breaks the rhythm. Persisted because opening the camera is
 * exactly the moment the phone may discard the tab and reload the page.
 */
const SOURCE_KEY = 'catalogador.photo-source'

function rememberedSource(): PhotoSource {
  try {
    return localStorage.getItem(SOURCE_KEY) === 'camera' ? 'camera' : 'files'
  } catch {
    return 'files'
  }
}

export interface QueuedShot {
  /** Local identifier, only for React. The catalog one is assigned by the database. */
  key: string
  prepared: PreparedShot
  shotType: ShotTypeValue
  isIndex: boolean
  status: 'pending' | 'uploading' | 'uploaded' | 'error'
  error?: string
}

let counter = 0

/** Local key for a freshly prepared shot. */
export function newKey(): string {
  counter += 1
  return `t${counter}`
}

/**
 * Photo queue of the capture flow: photos are prepared and wait for the
 * artwork to be saved, because images need an artwork to hang from and it does
 * not exist yet.
 *
 * The queue is persisted in IndexedDB (see photoQueue.ts): when the camera
 * opens, the phone may discard the tab and the page reloads on return.
 */
export function PhotoPicker({
  shots,
  onChange,
  disabled,
  withIndex = true,
}: {
  shots: QueuedShot[]
  onChange: (shots: QueuedShot[]) => void
  disabled: boolean
  /**
   * The record gallery stages photos for an artwork that already has a main
   * image chosen elsewhere (RF-405), and adding photos must not change the
   * cover on its own: `withIndex={false}` hides the index marking entirely.
   */
  withIndex?: boolean
}) {
  const [openKey, setOpenKey] = useState<string | null>(null)
  const [lastSource, setLastSource] = useState<PhotoSource>(rememberedSource)
  // Shot being straightened, and the state of redoing its copies. The editor
  // itself does not touch pixels: it returns the framing and here the thumbnail
  // and the consultation copy are regenerated from the master in memory.
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [applying, setApplying] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)

  function add(prepared: PreparedShot[], source: PhotoSource) {
    setLastSource(source)
    try {
      localStorage.setItem(SOURCE_KEY, source)
    } catch {
      /* without storage, the in-memory value still covers this session */
    }
    const total: QueuedShot[] = [
      ...shots,
      ...prepared.map((p) => ({
        key: newKey(),
        prepared: p,
        shotType: 'GENERAL' as ShotTypeValue,
        isIndex: false,
        status: 'pending' as const,
      })),
    ]
    // RF-403: the first photo is the index one, unless another was already
    // chosen. This way the normal case demands no decision.
    if (withIndex && total.length > 0 && !total.some((s) => s.isIndex) && total[0]) {
      total[0] = { ...total[0], isIndex: true }
    }
    onChange(total)
  }

  function remove(key: string) {
    const removed = shots.find((s) => s.key === key)
    if (removed) URL.revokeObjectURL(removed.prepared.preview)
    const remaining = shots.filter((s) => s.key !== key)
    // If the index one was removed, the first remaining inherits it: the
    // artwork cannot be left without a representative image while it has
    // photos.
    if (withIndex && removed?.isIndex && remaining.length > 0 && remaining[0]) {
      remaining[0].isIndex = true
    }
    onChange(remaining)
    setOpenKey(null)
  }

  function markIndex(key: string) {
    onChange(shots.map((s) => ({ ...s, isIndex: s.key === key })))
  }

  function setType(key: string, type: ShotTypeValue) {
    onChange(shots.map((s) => (s.key === key ? { ...s, shotType: type } : s)))
  }

  /**
   * Applies the framing to a shot that has not been uploaded yet.
   *
   * The source is the master already in memory, so this costs no network: no
   * download, no re-upload, and the row will be born with the framing already
   * stored (see uploadShot). Nothing is redone if the cataloger applied without
   * changing anything.
   */
  async function applyEdit(shot: QueuedShot, edit: PhotoEdit) {
    setEditingKey(null)
    setEditError(null)
    if (sameEdit(edit, shot.prepared.edit)) return
    setApplying(true)
    try {
      const levels = await renderEditedLevels(shot.prepared.master, edit)
      URL.revokeObjectURL(shot.prepared.preview)
      onChange(
        shots.map((s) =>
          s.key === shot.key
            ? {
                ...s,
                prepared: {
                  ...s.prepared,
                  thumbnail: levels.thumbnail,
                  derivative: levels.derivative,
                  preview: URL.createObjectURL(levels.thumbnail),
                  edit,
                },
              }
            : s,
        ),
      )
    } catch (e) {
      setEditError(
        `No se ha podido aplicar el giro o el recorte: ${e instanceof Error ? e.message : String(e)}`,
      )
    } finally {
      setApplying(false)
    }
  }

  const openShot = shots.find((s) => s.key === openKey)
  const editingShot = shots.find((s) => s.key === editingKey)

  return (
    <div>
      {/* No title of its own: the FieldGroup wrapping it in the capture page
          provides one. */}
      <PhotoInput onPrepare={add} disabled={disabled} compact />

      {shots.length > 0 && (
        <ul className="mt-3 grid grid-cols-3 gap-2">
          {shots.map((s) => (
            <li key={s.key}>
              <button
                type="button"
                onClick={() => setOpenKey(openKey === s.key ? null : s.key)}
                className={`relative block w-full overflow-hidden rounded-lg border-2 ${
                  openKey === s.key ? 'border-stone-800' : 'border-stone-200'
                }`}
              >
                <img
                  src={s.prepared.preview}
                  alt={`Toma ${SHOT_TYPE_LABEL[s.shotType]}`}
                  className="aspect-square w-full object-cover"
                />
                {s.isIndex && (
                  <span className="absolute left-1 top-1 rounded bg-stone-900/85 px-1.5 py-0.5 text-[10px] font-medium text-white">
                    Índice
                  </span>
                )}
                {s.shotType !== 'GENERAL' && (
                  <span className="absolute bottom-1 left-1 rounded bg-stone-900/85 px-1.5 py-0.5 text-[10px] text-white">
                    {SHOT_TYPE_LABEL[s.shotType]}
                  </span>
                )}
                {s.status === 'uploading' && (
                  <span className="absolute inset-0 flex items-center justify-center bg-white/80 text-xs">
                    Subiendo…
                  </span>
                )}
                {s.status === 'uploaded' && (
                  <span className="absolute right-1 top-1 rounded-full bg-green-600 p-0.5 text-white">
                    <YesIcon className="h-3 w-3" />
                  </span>
                )}
                {s.status === 'error' && (
                  <span className="absolute right-1 top-1 rounded-full bg-red-600 p-0.5 text-white">
                    <NoIcon className="h-3 w-3" />
                  </span>
                )}
              </button>
            </li>
          ))}
          {/* "+" square at the end of the strip: repeats the LAST entry path
              next to the thumbnails — the camera after shooting, the file
              selector after picking — so one is not forced back to the top of
              the form once several photos exist. */}
          <li>
            <button
              type="button"
              aria-label={lastSource === 'camera' ? 'Hacer otra foto' : 'Añadir más fotos'}
              disabled={disabled}
              onClick={() =>
                document
                  .querySelector<HTMLInputElement>(
                    lastSource === 'camera'
                      ? "#photo-zone input[type='file'][capture]"
                      : "#photo-zone input[type='file'][multiple]",
                  )
                  ?.click()
              }
              className="flex aspect-square w-full items-center justify-center rounded-lg border-2 border-dashed border-stone-300 text-stone-400"
            >
              <PlusIcon />
            </button>
          </li>
        </ul>
      )}

      {/* Panel of the selected shot. Opened by tapping the thumbnail instead
          of stacking controls under every photo: with four or five shots the
          form would become unreadable on a phone screen. */}
      {openShot && (
        <div className="mt-3 space-y-3 rounded-lg border border-stone-300 bg-stone-50 p-3">
          <Chips
            id={`type-${openShot.key}`}
            label="Tipo de toma"
            columns={3}
            options={(Object.keys(SHOT_TYPE_LABEL) as ShotTypeValue[]).map((v) => ({
              value: v,
              text: SHOT_TYPE_LABEL[v],
            }))}
            value={openShot.shotType}
            onChange={(v) => setType(openShot.key, v)}
          />

          {/* Straightening the shot before it goes up: the crop is applied to
              the copies, never to the master (ADR-002). */}
          <button
            type="button"
            disabled={applying || openShot.status === 'uploading' || openShot.status === 'uploaded'}
            onClick={() => setEditingKey(openShot.key)}
            className="btn-secondary w-full"
          >
            <CropIcon className="h-5 w-5" />
            {applying ? 'Aplicando la edición…' : 'Girar y recortar'}
          </button>

          <div className={`grid gap-2 ${withIndex ? 'grid-cols-2' : 'grid-cols-1'}`}>
            {withIndex && (
              <button
                type="button"
                disabled={openShot.isIndex}
                onClick={() => markIndex(openShot.key)}
                className="btn-secondary"
              >
                {openShot.isIndex ? 'Es la del índice' : 'Usar como índice'}
              </button>
            )}
            <button
              type="button"
              onClick={() => remove(openShot.key)}
              className="btn min-h-touch border border-red-300 bg-white text-red-800"
            >
              Quitar
            </button>
          </div>

          <p className="text-xs text-stone-500">
            Original {openShot.prepared.originalWidth}×{openShot.prepared.originalHeight} px,{' '}
            {(openShot.prepared.master.size / 1_048_576).toFixed(1)} MB. Se subirán tres
            versiones: miniatura, consulta y máster de archivo.
            {editSummary(openShot.prepared.edit) &&
              ` ${editSummary(openShot.prepared.edit)} (el máster se guarda sin tocar).`}
          </p>

          {editError && (
            <p role="alert" className="rounded-lg bg-red-50 p-2 text-xs text-red-800">
              {editError}
            </p>
          )}
        </div>
      )}

      {editingShot && (
        <PhotoEditor
          source={editingShot.prepared.master}
          initialEdit={editingShot.prepared.edit}
          title={`Toma ${SHOT_TYPE_LABEL[editingShot.shotType]} sin subir`}
          onApply={(edit) => void applyEdit(editingShot, edit)}
          onCancel={() => setEditingKey(null)}
        />
      )}
    </div>
  )
}
