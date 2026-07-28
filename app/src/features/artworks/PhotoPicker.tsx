import { useState } from 'react'
import type { PreparedShot } from '../../lib/images'
import { SHOT_TYPE_LABEL, type ShotTypeValue } from '../../lib/types'
import { Chips, NoIcon, PlusIcon, YesIcon } from '../../components/ui'
import { PhotoInput } from './PhotoInput'

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

  function add(prepared: PreparedShot[]) {
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

  const openShot = shots.find((s) => s.key === openKey)

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
          {/* "+" square at the end of the strip: repeats the file-selection
              entry next to the thumbnails, so one is not forced back to the
              top of the form once several photos exist. */}
          <li>
            <button
              type="button"
              aria-label="Añadir más fotos"
              disabled={disabled}
              onClick={() =>
                document
                  .querySelector<HTMLInputElement>("#photo-zone input[type='file'][multiple]")
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
          </p>
        </div>
      )}
    </div>
  )
}
