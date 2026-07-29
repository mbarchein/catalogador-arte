import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  addRotation,
  centeredCrop,
  cornerPoint,
  editSummary,
  fitInside,
  moveCrop,
  normalizeEdit,
  resizeCrop,
  rotateCrop,
  rotatedSize,
  type Corner,
  type Crop,
  type PhotoEdit,
  type Rotation,
} from '../../lib/imageEdits'
import { rotateSuggestion, type EdgeSuggestion } from '../../lib/edgeDetection'
import { suggestArtworkCrop } from '../../lib/imageEdges'
import { CropIcon, NoIcon, RotateLeftIcon, RotateRightIcon } from '../../components/ui'

/** Nudge of a corner with the arrow keys, as a fraction of the side. */
const KEY_STEP = 0.02

/**
 * State of the border detection (edgeDetection.ts). It only ever preloads the
 * crop rectangle: `found` means there is a suggestion on screen to adjust, never
 * an applied edit.
 */
type Analysis =
  | { status: 'idle' }
  | { status: 'working' }
  | { status: 'none' }
  | { status: 'found'; suggestion: EdgeSuggestion; choice: 'outer' | 'inner' }

const CORNERS: { corner: Corner; label: string }[] = [
  { corner: 'nw', label: 'esquina superior izquierda' },
  { corner: 'ne', label: 'esquina superior derecha' },
  { corner: 'sw', label: 'esquina inferior izquierda' },
  { corner: 'se', label: 'esquina inferior derecha' },
]

/**
 * Straightening and trimming a photo, full screen (RF-409, RF-410).
 *
 * The editor knows nothing about storage or about the database: it receives an
 * image, returns a rotation and a crop, and whoever opened it decides what to do
 * with them. That is what lets the same component serve the capture queue, where
 * the photo is still a file in memory, and a record's photo already uploaded.
 *
 * Decisions that come from using it on a phone, which is the primary device:
 *
 *  1. The image is shown WHOLE with the crop drawn on top, dimming what is left
 *     out, instead of showing only the cropped result. With the artwork in front
 *     of you, what you need to see is what is being left out.
 *  2. `touch-action: none` is on the handles from the first render, never set
 *     when the gesture is detected: the browser evaluates it when the touch
 *     STARTS, so setting it later arrives after it has already claimed the drag
 *     as a scroll (the same dead end as in ReorderableThumbnails).
 *  3. The pointer listeners live on `window`: a drag that leaves the handle —
 *     which is what happens when the rectangle reaches the edge — must keep
 *     being heard.
 *  4. Corners can also be nudged with the arrow keys. A gesture cannot be the
 *     only way to reach a function.
 *  5. Closing pushes a history entry, like PhotoViewer: on a phone the back
 *     button must close the editor, not leave the record. Applying consumes the
 *     same entry, so back never lands on a stale editor.
 *  6. «Sugerir recorte» detects the borders of the painting on demand, never on
 *     opening: it costs a decode of the master plus a pass over the pixels, and
 *     spending that on every editor that opens — most of which only rotate —
 *     would slow the common case for the rare one. And a suggestion the
 *     cataloger did not ask for arrives as an opinion about her framing.
 *     What it does is PRELOAD the rectangle. It never applies: what leaves the
 *     editor is always what she confirmed with «Aplicar».
 *
 * The suggestion is stored, and not only drawn, because with a framed painting
 * there are two candidates — the frame and the canvas — and switching between
 * them has to keep working afterwards, including after a rotation.
 *
 * The master is never modified: what is edited are the copies the application
 * serves (ADR-002). The screen says so.
 */
export function PhotoEditor({
  source,
  initialEdit,
  title,
  note,
  canRestoreOriginal = false,
  onApply,
  onCancel,
}: {
  /** Image to work on: the archive master, or the consultation copy if it failed. */
  source: Blob
  /**
   * Framing the source ALREADY shows. With the master it is the stored edit, so
   * the editor opens on the photo as the record displays it; with the
   * consultation copy it is no edit, because the copy already carries it baked
   * in and whoever called composes afterwards.
   */
  initialEdit: PhotoEdit
  title: string
  /** Warning to keep in sight, e.g. that the crop starts from the small copy. */
  note?: string | null
  /**
   * Whether going back to the untouched original is truly possible, which is
   * only the case when the source IS the master: from the consultation copy the
   * pixels outside the crop are simply not there, and offering it would store
   * «no framing» over an already-framed image — a lie in the data.
   */
  canRestoreOriginal?: boolean
  onApply: (edit: PhotoEdit) => void
  onCancel: () => void
}) {
  const [url, setUrl] = useState<string | null>(null)
  const [rotation, setRotation] = useState<Rotation>(() => normalizeEdit(initialEdit).rotation)
  const [crop, setCrop] = useState<Crop | null>(() => normalizeEdit(initialEdit).crop)
  const [natural, setNatural] = useState({ width: 0, height: 0 })
  const [box, setBox] = useState({ width: 0, height: 0 })
  const [dragging, setDragging] = useState<Corner | 'move' | null>(null)
  const [failed, setFailed] = useState(false)
  const [analysis, setAnalysis] = useState<Analysis>({ status: 'idle' })

  const frameRef = useRef<HTMLDivElement | null>(null)
  const areaRef = useRef<HTMLDivElement | null>(null)
  const cropRef = useRef<Crop | null>(crop)
  cropRef.current = crop
  // Origin of the drag, so a rectangle stopped at the edge does not drift away
  // from the finger.
  const startRef = useRef<{ point: { x: number; y: number }; crop: Crop } | null>(null)

  // The callbacks live in refs so the history listener registers once: doing it
  // on every render could miss the closing pop.
  const editRef = useRef<PhotoEdit>(initialEdit)
  editRef.current = { rotation, crop }
  // Number of the border detection in flight. Asking again, or closing the
  // editor, invalidates the previous answer instead of letting it arrive late
  // and move a rectangle the cataloger is already dragging.
  const analysisTicket = useRef(0)
  const appliedRef = useRef(false)
  const onApplyRef = useRef(onApply)
  onApplyRef.current = onApply
  const onCancelRef = useRef(onCancel)
  onCancelRef.current = onCancel

  useEffect(() => {
    const objectUrl = URL.createObjectURL(source)
    setUrl(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [source])

  useEffect(() => {
    window.history.pushState({ photoEditor: true }, '')
    // One exit for the three ways of leaving — ✕, Escape and the phone's back
    // button — so the pushed entry is always consumed exactly once.
    const onPop = () => {
      if (appliedRef.current) onApplyRef.current(normalizeEdit(editRef.current))
      else onCancelRef.current()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') window.history.back()
    }
    window.addEventListener('popstate', onPop)
    window.addEventListener('keydown', onKey)

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      window.removeEventListener('popstate', onPop)
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = previousOverflow
      analysisTicket.current += 1
    }
  }, [])

  // The working surface changes with the phone turning or the browser bars
  // appearing, and the crop rectangle is drawn over it.
  useEffect(() => {
    const node = frameRef.current
    if (!node) return
    const measure = () => setBox({ width: node.clientWidth, height: node.clientHeight })
    measure()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    observer?.observe(node)
    window.addEventListener('resize', measure)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [])

  useEffect(() => {
    if (!dragging) return
    // Captured so the listeners read the gesture of this drag and not whatever
    // the state holds when they fire.
    const gesture = dragging

    function normalizedPoint(e: PointerEvent): { x: number; y: number } | null {
      const area = areaRef.current?.getBoundingClientRect()
      if (!area || area.width === 0 || area.height === 0) return null
      return { x: (e.clientX - area.left) / area.width, y: (e.clientY - area.top) / area.height }
    }

    function onPointerMove(e: PointerEvent) {
      const point = normalizedPoint(e)
      const start = startRef.current
      if (!point || !start) return
      if (gesture === 'move') {
        setCrop(moveCrop(start.crop, point.x - start.point.x, point.y - start.point.y))
      } else {
        setCrop(resizeCrop(start.crop, gesture, point))
      }
    }

    const end = () => {
      setDragging(null)
      startRef.current = null
    }

    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
    }
  }, [dragging])

  function close(applied: boolean) {
    appliedRef.current = applied
    window.history.back()
  }

  /** Turning must not move the framing: the rectangle turns with the photo. */
  function rotate(delta: number) {
    setRotation((r) => addRotation(r, delta))
    setCrop((c) => (c ? rotateCrop(c, delta) : null))
    // The stored candidates travel too, or choosing between frame and canvas
    // after turning the photo would load a rectangle from the previous frame.
    setAnalysis((a) =>
      a.status === 'found' ? { ...a, suggestion: rotateSuggestion(a.suggestion, delta) } : a,
    )
  }

  /**
   * Looks for the borders of the painting and preloads the outer rectangle.
   *
   * The outer one — the frame, when there is a frame — because it is the
   * conservative candidate: suggesting the tightest rectangle straight away
   * risks cutting off a strip of the artwork if the detection is off by a
   * little, and nobody notices what is missing from a photograph they did not
   * take. Leaving a sliver of wall is visible and takes one drag to fix.
   */
  async function suggest() {
    const ticket = analysisTicket.current + 1
    analysisTicket.current = ticket
    setAnalysis({ status: 'working' })
    // The rotation at the moment of asking: the detector reads the photograph as
    // it was decoded and the crop lives over the rotated one.
    const suggestion = await suggestArtworkCrop(source, rotation)
    // A second request, or a closed editor, makes this answer stale.
    if (analysisTicket.current !== ticket) return
    if (!suggestion) {
      setAnalysis({ status: 'none' })
      return
    }
    setAnalysis({ status: 'found', suggestion, choice: 'outer' })
    setCrop(suggestion.outer)
  }

  /** Loads one of the two candidates into the crop rectangle. */
  function choose(which: 'outer' | 'inner') {
    if (analysis.status !== 'found') return
    const candidate = which === 'inner' ? analysis.suggestion.inner : analysis.suggestion.outer
    if (!candidate) return
    setAnalysis({ ...analysis, choice: which })
    setCrop(candidate)
  }

  function startDrag(e: React.PointerEvent, what: Corner | 'move') {
    const current = cropRef.current
    const area = areaRef.current?.getBoundingClientRect()
    if (!current || !area || area.width === 0 || area.height === 0) return
    // The handle owns the gesture from the first pixel: no hold to wait for.
    e.preventDefault()
    e.stopPropagation()
    startRef.current = {
      point: { x: (e.clientX - area.left) / area.width, y: (e.clientY - area.top) / area.height },
      crop: current,
    }
    setDragging(what)
  }

  function nudge(corner: Corner, dx: number, dy: number) {
    const current = cropRef.current
    if (!current) return
    const point = cornerPoint(current, corner)
    setCrop(resizeCrop(current, corner, { x: point.x + dx, y: point.y + dy }))
  }

  function onHandleKeyDown(e: React.KeyboardEvent, corner: Corner) {
    const step =
      e.key === 'ArrowLeft'
        ? [-KEY_STEP, 0]
        : e.key === 'ArrowRight'
          ? [KEY_STEP, 0]
          : e.key === 'ArrowUp'
            ? [0, -KEY_STEP]
            : e.key === 'ArrowDown'
              ? [0, KEY_STEP]
              : null
    if (!step) return
    e.preventDefault()
    nudge(corner, step[0] ?? 0, step[1] ?? 0)
  }

  const rotated = rotatedSize(natural, rotation)
  const fit = fitInside(rotated, box)
  const ready = fit.width > 0 && fit.height > 0
  const summary = editSummary({ rotation, crop })

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Girar y recortar la fotografía ${title}`}
      className="fixed inset-0 z-50 flex flex-col bg-black"
    >
      <div className="flex items-center justify-between gap-2 p-3 text-white">
        <button
          type="button"
          aria-label="Cerrar sin aplicar"
          onClick={() => close(false)}
          className="flex min-h-touch min-w-[2.75rem] items-center justify-center rounded-full bg-white/10"
        >
          <NoIcon className="h-5 w-5" />
        </button>
        <p className="min-w-0 flex-1 truncate text-sm text-stone-300">{title}</p>
        <p aria-live="polite" className="shrink-0 text-xs text-stone-400">
          {summary ?? 'Sin cambios'}
        </p>
      </div>

      {/* Working surface. `touch-none` on the whole area: the editor covers the
          screen and nothing here should scroll or zoom the page underneath. */}
      <div ref={frameRef} className="relative min-h-0 flex-1 touch-none overflow-hidden">
        {url && (
          <div
            ref={areaRef}
            className="absolute"
            style={{
              left: `${(box.width - fit.width) / 2}px`,
              top: `${(box.height - fit.height) / 2}px`,
              width: `${fit.width}px`,
              height: `${fit.height}px`,
            }}
          >
            <img
              src={url}
              alt={`Fotografía ${title}`}
              draggable={false}
              onLoad={(e) =>
                setNatural({
                  width: e.currentTarget.naturalWidth,
                  height: e.currentTarget.naturalHeight,
                })
              }
              onError={() => setFailed(true)}
              className="absolute left-1/2 top-1/2 select-none"
              style={{
                // The element keeps the photo's own proportions and the turn is
                // done with a transform, so the box it occupies is exactly the
                // rotated fit computed above.
                width: `${rotation % 180 === 0 ? fit.width : fit.height}px`,
                height: `${rotation % 180 === 0 ? fit.height : fit.width}px`,
                transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
              }}
            />

            {crop && ready && (
              <>
                {/* What is left out, dimmed. Four rectangles instead of a
                    single box-shadow so it also works while dragging. */}
                <div
                  className="pointer-events-none absolute left-0 top-0 w-full bg-black/60"
                  style={{ height: `${crop.y * 100}%` }}
                />
                <div
                  className="pointer-events-none absolute left-0 w-full bg-black/60"
                  style={{
                    top: `${(crop.y + crop.height) * 100}%`,
                    height: `${(1 - crop.y - crop.height) * 100}%`,
                  }}
                />
                <div
                  className="pointer-events-none absolute left-0 bg-black/60"
                  style={{
                    top: `${crop.y * 100}%`,
                    height: `${crop.height * 100}%`,
                    width: `${crop.x * 100}%`,
                  }}
                />
                <div
                  className="pointer-events-none absolute bg-black/60"
                  style={{
                    top: `${crop.y * 100}%`,
                    height: `${crop.height * 100}%`,
                    left: `${(crop.x + crop.width) * 100}%`,
                    width: `${(1 - crop.x - crop.width) * 100}%`,
                  }}
                />

                {/* The rectangle itself: dragging inside it moves the frame. */}
                <div
                  role="button"
                  tabIndex={-1}
                  aria-label="Mover el recorte"
                  onPointerDown={(e) => startDrag(e, 'move')}
                  onContextMenu={(e) => e.preventDefault()}
                  className="absolute touch-none border-2 border-white/90 shadow-[0_0_0_1px_rgba(0,0,0,0.6)]"
                  style={{
                    left: `${crop.x * 100}%`,
                    top: `${crop.y * 100}%`,
                    width: `${crop.width * 100}%`,
                    height: `${crop.height * 100}%`,
                  }}
                />

                {CORNERS.map(({ corner, label }) => {
                  const point = cornerPoint(crop, corner)
                  return (
                    <span
                      key={corner}
                      role="button"
                      tabIndex={0}
                      aria-label={`Arrastrar la ${label} del recorte`}
                      onPointerDown={(e) => startDrag(e, corner)}
                      onKeyDown={(e) => onHandleKeyDown(e, corner)}
                      onContextMenu={(e) => e.preventDefault()}
                      // 44 px of touch area, with a smaller visible mark: on a
                      // phone the finger needs the room even if the drawing
                      // does not.
                      className="absolute flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 touch-none select-none items-center justify-center"
                      style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }}
                    >
                      <span
                        aria-hidden
                        className={`block rounded-full border-2 border-stone-900 bg-white ${
                          dragging === corner ? 'h-7 w-7' : 'h-5 w-5'
                        }`}
                      />
                    </span>
                  )
                })}
              </>
            )}
          </div>
        )}

        {failed ? (
          <p role="alert" className="absolute inset-x-4 top-1/2 text-center text-sm text-red-200">
            No se ha podido abrir la fotografía para editarla. Cierra e inténtalo de nuevo.
          </p>
        ) : (
          !ready && (
            <p role="status" className="absolute inset-x-4 top-1/2 text-center text-sm text-stone-400">
              Cargando la fotografía…
            </p>
          )
        )}
      </div>

      {/* Controls at the bottom, within reach of the thumb. */}
      <div
        className="space-y-2 p-3"
        style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
      >
        {note && (
          <p className="rounded-lg bg-amber-100 p-2 text-xs text-amber-900">{note}</p>
        )}

        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() => rotate(-90)}
            className="btn min-h-[3.25rem] flex-col gap-0.5 bg-white/10 text-xs text-white"
          >
            <RotateLeftIcon className="h-6 w-6" />
            Rotar a la izquierda
          </button>
          <button
            type="button"
            onClick={() => rotate(90)}
            className="btn min-h-[3.25rem] flex-col gap-0.5 bg-white/10 text-xs text-white"
          >
            <RotateRightIcon className="h-6 w-6" />
            Rotar a la derecha
          </button>
          <button
            type="button"
            onClick={() => setCrop((c) => (c ? null : centeredCrop()))}
            aria-pressed={crop !== null}
            className={`btn min-h-[3.25rem] flex-col gap-0.5 text-xs ${
              crop ? 'bg-white text-stone-900' : 'bg-white/10 text-white'
            }`}
          >
            <CropIcon className="h-6 w-6" />
            {crop ? 'Quitar recorte' : 'Recortar'}
          </button>
        </div>

        {/* Border detection: on demand, and it only preloads the rectangle. */}
        <div className="space-y-2">
          <button
            type="button"
            disabled={!ready || analysis.status === 'working'}
            aria-describedby="editor-suggestion-help"
            onClick={() => void suggest()}
            className="btn min-h-touch w-full bg-white/10 text-sm text-white disabled:opacity-40"
          >
            {analysis.status === 'working' ? 'Analizando la fotografía…' : 'Sugerir recorte'}
          </button>

          {/* With two candidates the cataloger picks: in a catalogue raisonné the
              work is usually the canvas, but the frame can be part of the piece
              and only she can tell. */}
          {analysis.status === 'found' && analysis.suggestion.inner && (
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                aria-pressed={analysis.choice === 'outer'}
                onClick={() => choose('outer')}
                className={`btn min-h-touch text-sm ${
                  analysis.choice === 'outer'
                    ? 'bg-white text-stone-900'
                    : 'border border-stone-600 text-white'
                }`}
              >
                Hasta el marco
              </button>
              <button
                type="button"
                aria-pressed={analysis.choice === 'inner'}
                onClick={() => choose('inner')}
                className={`btn min-h-touch text-sm ${
                  analysis.choice === 'inner'
                    ? 'bg-white text-stone-900'
                    : 'border border-stone-600 text-white'
                }`}
              >
                Solo la obra
              </button>
            </div>
          )}

          <p
            id="editor-suggestion-help"
            role="status"
            aria-live="polite"
            className="text-center text-xs text-stone-400"
          >
            {analysis.status === 'working'
              ? 'Analizando la fotografía para reconocer el borde del cuadro…'
              : analysis.status === 'none'
                ? 'No se ha podido reconocer el borde del cuadro: ajusta el recorte a mano'
                : analysis.status === 'found'
                  ? analysis.suggestion.inner
                    ? 'Recorte sugerido: se han reconocido dos bordes. Elige uno, ajusta las esquinas y pulsa «Aplicar»'
                    : 'Recorte sugerido: ajusta las esquinas si hace falta y pulsa «Aplicar»'
                  : 'Reconoce el borde del cuadro y precarga el recorte. Nunca se aplica solo: siempre lo confirmas tú'}
          </p>
        </div>

        {/* Back to square one, always available while the master is the source:
            the framing is data, not a cut, so the original frame can be
            recovered whenever — today or in a year — and the crop redone from
            scratch. That is what makes cropping a safe decision. */}
        {/* Shown even when it cannot be used, and disabled with the reason: an
            action that simply is not there leaves the cataloger wondering
            whether the crop is final. */}
        {(rotation !== 0 || crop !== null || !canRestoreOriginal) && (
          <button
            type="button"
            disabled={!canRestoreOriginal}
            aria-describedby="editor-original-help"
            onClick={() => {
              setRotation(0)
              setCrop(null)
            }}
            className="btn min-h-touch w-full border border-stone-600 text-sm text-white disabled:opacity-40"
          >
            Volver al original, sin giro ni recorte
          </button>
        )}

        <p id="editor-original-help" className="text-center text-xs text-stone-400">
          {!canRestoreOriginal
            ? 'Sobre la copia de consulta puedes girar y recortar más, pero no ensanchar el recorte ni volver al original: lo que quedó fuera no está en esta copia.'
            : crop
              ? 'Arrastra las esquinas para ajustar el recorte, o el centro para moverlo. El original de archivo no se modifica nunca: puedes ensanchar el recorte o volver al original cuando quieras.'
              : 'El máster de archivo no se modifica: se rehacen las copias que se muestran, y siempre puedes volver al original.'}
        </p>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => close(false)}
            className="btn min-h-[3.25rem] border border-stone-600 text-white"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={!ready}
            onClick={() => close(true)}
            className="btn min-h-[3.25rem] bg-white text-base font-medium text-stone-900"
          >
            Aplicar
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
