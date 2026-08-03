import { useState } from 'react'
import type { PreparedShot } from '../../lib/images'
import {
  editSummary,
  isNoEdit,
  sameEdit,
  withOwnColor,
  type CropSource,
  type PhotoEdit,
} from '../../lib/imageEdits'
import { isNoColor, normalizeColor, type ColorEdit } from '../../lib/imageColor'
import { renderEditedLevels } from '../../lib/imageRender'
import {
  PHOTO_PROVENANCE_LABEL,
  SHOT_TYPE_LABEL,
  type PhotoProvenance,
  type ShotTypeValue,
} from '../../lib/types'
import { Chips, CropIcon, NoIcon, PlusIcon, YesIcon } from '../../components/ui'
import { PhotoInput, type PhotoSource } from './PhotoInput'
import { PhotoEditor } from './PhotoEditor'
import { readBatchColor, rememberBatchColor } from './batch'
import { PHOTO_PROVENANCES, carriedColorOffer, traceOnlyChange } from './photoDetails'

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
 * The colour of the batch's general shot, which is what the other shots of the same
 * artwork inherit (§7: «la toma general manda»).
 *
 * The first general shot in the strip, in the order they were taken, and never the one
 * being edited: the general shot inherits from nobody. Undefined when there is none or
 * when its colour does nothing, because then «heredar» would copy neutrality and look
 * broken.
 *
 * This is the staged twin of `generalColorOf`: here the adjustment is not in a row yet,
 * it is in the edit of a shot waiting in the queue.
 */
export function stagedGeneralColor(
  shots: readonly QueuedShot[],
  exceptKey?: string | null,
): ColorEdit | undefined {
  for (const shot of shots) {
    if (shot.shotType !== 'GENERAL' || shot.key === exceptKey) continue
    const color = shot.prepared.edit.color
    // Normalized on the way out: a `PhotoEdit` may carry a partial adjustment — that is
    // what `ColorInput` is for — and what is inherited has to be a complete one.
    if (color && !isNoColor(color)) return normalizeColor(color)
  }
  return undefined
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

    // The panel of the photo just taken opens by itself: right after shooting,
    // what follows is always saying what the shot is (RF-401) or straightening
    // it, and having to hunt for the thumbnail to tap added a step to every
    // single photo. With several from the gallery it opens on the first of them,
    // which is where reviewing them starts.
    const firstAdded = total[shots.length]
    if (firstAdded) setOpenKey(firstAdded.key)
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
   * Where the photograph comes from (RF-417). **Chosen, never inferred**: a 1080×2400
   * file with no camera data looks exactly like a screenshot of an online catalog, and
   * looking like one is not being one — the project already decided the same about
   * `crop_source`.
   *
   * It lives in the prepared shot and not in the queued one so that the offline queue
   * persists it (photoQueue.ts) and `uploadShot` finds it: a reload while the camera is
   * in the foreground must not turn somebody else's reproduction back into own work,
   * because on own work the colour adjustment IS offered.
   */
  function setProvenance(key: string, provenance: PhotoProvenance) {
    onChange(
      shots.map((s) =>
        s.key === key ? { ...s, prepared: { ...s.prepared, provenance } } : s,
      ),
    )
  }

  /**
   * Applies the framing and the colour to a shot that has not been uploaded yet.
   *
   * The source is the master already in memory, so this costs no network: no
   * download, no re-upload, and the row will be born with the framing and the colour
   * already stored (see uploadShot). This is the moment RF-414 is cheapest — the master
   * in RAM and the artwork in front of you — and the reason the correction is baked
   * into the thumbnail and the consultation copy here instead of being redone from B2
   * later.
   *
   * Nothing is re-rendered if the cataloger applied without changing a pixel; but the
   * edit is still kept when only its TRACE changed, which is a different thing and is
   * spelled out in `traceOnlyChange`.
   */
  async function applyEdit(shot: QueuedShot, edit: PhotoEdit, cropSource?: CropSource) {
    setEditingKey(null)
    setEditError(null)
    if (sameEdit(edit, shot.prepared.edit)) {
      // Same pixels, different row: «se miró con la obra delante y se dejó como estaba»,
      // or the grey was sampled somewhere else. Nothing to re-encode, and the trace has
      // to survive all the same — it is the only thing that tells a reviewed photograph
      // from a pending one, and this shot has not been uploaded yet, so the row will be
      // born with whatever is kept here.
      if (traceOnlyChange(edit, shot.prepared.edit)) {
        onChange(
          shots.map((s) =>
            s.key === shot.key
              ? {
                  ...s,
                  prepared: {
                    ...s.prepared,
                    edit,
                    cropSource: cropSource ?? s.prepared.cropSource,
                  },
                }
              : s,
          ),
        )
      }
      return
    }
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
                  cropSource: cropSource ?? s.prepared.cropSource,
                },
              }
            : s,
        ),
      )
      // The light of the batch, remembered for the next shot (RF-414). Written after
      // the render and not before: what is offered to repeat is an adjustment that
      // really came out on a photograph, not one that failed halfway. An adjustment
      // that does nothing clears it, so undoing a correction also withdraws the offer.
      rememberBatchColor(edit.color)
    } catch (e) {
      setEditError(
        `No se ha podido aplicar la corrección: ${e instanceof Error ? e.message : String(e)}`,
      )
    } finally {
      setApplying(false)
    }
  }

  const openShot = shots.find((s) => s.key === openKey)
  const editingShot = shots.find((s) => s.key === editingKey)
  // Read on every render and not held in state: the batch colour is written by this
  // same component and by the one on the photos page, and a copy in state would be a
  // second truth that goes stale exactly when it matters — the shot after the one just
  // corrected. It is one `localStorage` read of a short string.
  const carried = openShot
    ? carriedColorOffer(readBatchColor(), openShot.shotType, openShot.prepared.provenance)
    : { color: null, reason: null }

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

          {/* Where the photograph comes from (RF-417). It is asked and not guessed,
              and it is asked HERE because this is the only moment at which the person
              who knows the answer is looking at the file. */}
          <Chips
            id={`provenance-${openShot.key}`}
            label="Procedencia"
            options={PHOTO_PROVENANCES.map((v) => ({ value: v, text: PHOTO_PROVENANCE_LABEL[v] }))}
            value={openShot.prepared.provenance ?? 'OWN'}
            onChange={(v) => setProvenance(openShot.key, v)}
          />

          {/* Straightening the shot before it goes up: the crop and the colour are
              applied to the copies, never to the master (ADR-002). */}
          <button
            type="button"
            disabled={applying || openShot.status === 'uploading' || openShot.status === 'uploaded'}
            onClick={() => setEditingKey(openShot.key)}
            className="btn-secondary w-full"
          >
            <CropIcon className="h-5 w-5" />
            {applying ? 'Aplicando la corrección…' : 'Girar, recortar y color'}
          </button>

          {/* «El mismo color que la anterior» (RF-414): the whole batch is photographed
              under the same light, so the second photograph's adjustment is the first
              one's. It is a starting point and not a decision — it lands on the controls
              and can be adjusted from there — and it is one tap instead of three per
              shot, which is what decides whether a correct tool gets used at all.

              Shown disabled with its reason and never hidden: a control that simply is
              not there is indistinguishable from one that is broken, which is the
              criterion the editor already applies to «Sugerir recorte». */}
          <div>
            <button
              type="button"
              disabled={
                carried.color === null ||
                applying ||
                openShot.status === 'uploading' ||
                openShot.status === 'uploaded'
              }
              onClick={() => {
                // `withOwnColor` and not a spread of the object: the adjustment this shot
                // decides for itself is not an inherited one, and that column says how the
                // numbers arrived and not which numbers they are.
                if (carried.color) {
                  void applyEdit(
                    openShot,
                    withOwnColor(openShot.prepared.edit, carried.color),
                    openShot.prepared.cropSource,
                  )
                }
              }}
              className="btn-secondary w-full disabled:opacity-40"
            >
              El mismo color que la anterior
            </button>
            <p className="mt-1 text-xs text-stone-500">
              {carried.reason ??
                'Repite en esta fotografía el ajuste de color de la última que corregiste. Es un ' +
                  'punto de partida: se puede ajustar después en el editor.'}
            </p>
          </div>

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
            {/* Decimal comma, like every other number the cataloger reads (es-ES). */}
            {(openShot.prepared.master.size / 1_048_576).toFixed(1).replace('.', ',')} MB. Se
            subirán tres versiones: miniatura, consulta y máster de archivo.
            {editSummary(openShot.prepared.edit) &&
              ` ${editSummary(openShot.prepared.edit)} (el máster se guarda sin tocar).`}
            {/* The fourth level, said before it is promised: with a correction there is
                also a full-resolution copy (RF-420), and when the phone cannot make it
                the row records that it is missing instead of pretending it is there. */}
            {!isNoEdit(openShot.prepared.edit) &&
              ' Al llevar correcciones se guarda además una copia a tamaño completo con todo' +
                ' aplicado, la que se manda a una imprenta; si el móvil no puede con ella, queda' +
                ' anotada como pendiente y se genera después desde un ordenador.'}
          </p>

          {/* A reproduction that is not ours, said where the consequence is: the colour
              adjustment will not be offered for it (RF-417). And if it already carries
              one — it was corrected before being marked — that is said too, because a
              correction baked into the copies does not come off by relabelling the row. */}
          {(openShot.prepared.provenance ?? 'OWN') !== 'OWN' && (
            <p className="text-xs text-stone-500">
              En una fotografía que no es propia no se ofrece el ajuste de color: corregir la
              dominante de una reproducción ajena es enmendar el revelado de otra persona.
              {!isNoColor(openShot.prepared.edit.color) &&
                ' Esta ya lleva un ajuste aplicado: si no debe llevarlo, ábrela y usa «Volver al' +
                  ' original».'}
            </p>
          )}

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
          shotType={editingShot.shotType}
          // The source is the master File still in memory: the original frame
          // is always one tap away.
          canRestoreOriginal
          // RF-417: what gates the colour panel, and the reason it prints when it is
          // closed. Absent is own work, which is what the column defaults to.
          provenance={editingShot.prepared.provenance}
          // What the back, the signature, the damage and the frame of this same artwork
          // inherit (§7). It comes from the staged general shot, because the row does not
          // exist yet — this is the same rule as `generalColorOf`, one queue earlier.
          generalColor={stagedGeneralColor(shots, editingShot.key)}
          // The date the row will get, so §7.1 can whisper a discrepancy with the date
          // the file carries. `uploadShot` writes today's date as `photo_date`, so this
          // is not an approximation of it: it is it.
          recordPhotoDate={new Date().toISOString().slice(0, 10)}
          onApply={(edit, cropSource) => void applyEdit(editingShot, edit, cropSource)}
          onCancel={() => setEditingKey(null)}
        />
      )}
    </div>
  )
}
