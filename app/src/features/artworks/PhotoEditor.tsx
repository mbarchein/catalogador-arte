import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  addRotation,
  centeredCrop,
  clampCrop,
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
  type CropSource,
  type PhotoEdit,
  type Rotation,
} from '../../lib/imageEdits'
import {
  CORNER_KEYS,
  cornersBoundingBox,
  cornersOfRect,
  homographyFromUnitSquare,
  homographyToCssMatrix,
  invertHomography,
  moveCorner,
  straightenedSize,
  type Corners,
} from '../../lib/perspective'
import { LOUPE_SIDE, LOUPE_ZOOM, aidCorners, loupePixels, paintLoupe } from '../../lib/imageLoupe'
import {
  rotateSuggestion,
  type EdgeCandidate,
  type EdgeSuggestion,
} from '../../lib/edgeDetection'
import { suggestArtworkCrop } from '../../lib/imageEdges'
import { CropIcon, NoIcon, RotateLeftIcon, RotateRightIcon } from '../../components/ui'
import { SHOT_TYPE_LABEL, type ShotTypeValue } from '../../lib/types'

/** Nudge of a corner with the arrow keys, as a fraction of the side. */
const KEY_STEP = 0.02

/** Distance from the loupe to the edges of the working surface. */
const LOUPE_INSET = '0.75rem'

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

/**
 * Shot types where looking for the four sides of a painting makes sense.
 *
 * A general view, obviously, and a photograph OF the frame, which is a rectangle
 * too. What is left out is what has no artwork border in the frame: the back of a
 * canvas —where the strongest lines are the label and the stretcher bars—, a
 * close-up of a signature and a detail of damage. `OTHER` is deliberately IN:
 * whoever chose it did not say «this has no border», they said «none of these», and
 * refusing on that is refusing out of ignorance.
 */
const SUGGESTABLE_SHOTS: ReadonlySet<ShotTypeValue> = new Set(['GENERAL', 'FRAME', 'OTHER'])

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
 *  5. While a corner is being adjusted, that corner is magnified in a loupe
 *     placed at the OPPOSITE side of the surface: the finger covers exactly the
 *     pixel being aimed at, and without magnification adjusting the border of a
 *     painting to the millimetre on a phone is not possible. It disappears when
 *     the finger lifts, and it never intercepts anything.
 *  6. Closing pushes a history entry, like PhotoViewer: on a phone the back
 *     button must close the editor, not leave the record. Applying consumes the
 *     same entry, so back never lands on a stale editor.
 *  7. «Sugerir recorte» detects the borders of the painting on demand, never on
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
  shotType,
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
  /**
   * What the photograph is of, when it is known. It gates the crop suggestion:
   * the detector looks for the four straight sides of a painting, and on the back
   * of a canvas, on a close-up of a signature or on a detail of damage there is no
   * such thing to find — what it finds there is the label, the stretcher bar or
   * the edge of the photograph itself.
   *
   * Measured on the 44 photographs of the catalog, this single gate removes five
   * of the sixteen bad suggestions and eleven of the sixteen useless ones, and it
   * does not touch any of the four good ones, because the four are general views.
   * No arithmetic over the luminance can do that: ordered by contrast, the head of
   * the list is backs of canvases and screenshots, and the canonical framed
   * painting sits below a page of a French textbook.
   *
   * Undefined means «not known», and then it does not gate: the type is assigned
   * on adding the photo and can be set AFTER cropping, so for a photograph nobody
   * has classified the door stays open. Demanding the type first would add a
   * decision to all 44 to fix five, with the artwork in front of you and one hand.
   */
  shotType?: ShotTypeValue | null
  onApply: (edit: PhotoEdit, cropSource: CropSource) => void
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
  // Corner being nudged with the keyboard, so the loupe also serves whoever is
  // not using a finger. It stays while the handle keeps the focus.
  const [nudged, setNudged] = useState<Corner | null>(null)
  /**
   * The four corners, when the cataloger is straightening instead of cropping.
   * Null is the ordinary rectangle; non-null is perspective mode.
   */
  const [corners, setCorners] = useState<Corners | null>(
    () => normalizeEdit(initialEdit).corners ?? null,
  )
  /**
   * The rectangle that was on screen before a suggestion replaced it.
   *
   * `suggest()` overwrites the crop, and with sixteen suggestions of forty-four
   * measured good, asking for one used to be a bet that could cost the framing
   * already drawn by hand. Keeping the previous one is fifteen lines and turns the
   * bet into a try.
   */
  const [replaced, setReplaced] = useState<Crop | null>(null)

  const frameRef = useRef<HTMLDivElement | null>(null)
  const areaRef = useRef<HTMLDivElement | null>(null)
  const imageRef = useRef<HTMLImageElement | null>(null)
  const loupeRef = useRef<HTMLCanvasElement | null>(null)
  const cropRef = useRef<Crop | null>(crop)
  cropRef.current = crop
  const cornersRef = useRef<Corners | null>(corners)
  cornersRef.current = corners
  // Origin of the drag, so a rectangle stopped at the edge does not drift away
  // from the finger.
  const startRef = useRef<{ point: { x: number; y: number }; crop: Crop | null } | null>(null)

  // The callbacks live in refs so the history listener registers once: doing it
  // on every render could miss the closing pop.
  const editRef = useRef<PhotoEdit>(initialEdit)
  editRef.current = { rotation, crop, corners }
  // Number of the border detection in flight. Asking again, or closing the
  // editor, invalidates the previous answer instead of letting it arrive late
  // and move a rectangle the cataloger is already dragging.
  const analysisTicket = useRef(0)
  const appliedRef = useRef(false)
  const onApplyRef = useRef(onApply)
  onApplyRef.current = onApply
  // In a ref for the same reason as the edit: the history listener that closes the
  // editor is registered once and reads whatever is current when it fires.
  const cropSourceRef = useRef<CropSource>('MANUAL')
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
      if (appliedRef.current) onApplyRef.current(normalizeEdit(editRef.current), cropSourceRef.current)
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

      // In perspective mode a handle moves ONE corner freely, it does not resize a
      // rectangle: that freedom is the whole feature. `moveCorner` clamps to the reach
      // the schema allows and answers null for a move that would fold the
      // quadrilateral — refused at the finger, with the corner staying where it was,
      // instead of at the save button.
      const held = cornersRef.current
      if (held) {
        if (gesture === 'move') return
        const moved = moveCorner(held, gesture, point)
        if (moved) setCorners(moved)
        return
      }
      if (!start.crop) return

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
    if (applied) cropSourceRef.current = currentCropSource()
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
    // The rectangle that was there is kept before overwriting it: see `replaced`.
    setReplaced(cropRef.current ?? centeredCrop())
    load(suggestion.outer)
  }

  /**
   * Puts a candidate on screen: the rectangle always, and the quadrilateral when the
   * detector found the sides tilted.
   *
   * The corners are loaded only when the master is the source, and that is not a
   * detail: over the consultation copy the straightening cannot be expressed —
   * `composeEdits` refuses it and the handles are disabled there — so offering a
   * quadrilateral would offer something that cannot be applied. The box is always
   * loaded, so the suggestion never comes back empty.
   */
  function load(candidate: EdgeCandidate) {
    setCrop(candidate.box)
    setCorners(candidate.corners && canRestoreOriginal ? candidate.corners : null)
  }

  /**
   * Whether asking for a suggestion makes sense at all for this photograph. The
   * button stays visible and disabled, with the reason underneath, which is the
   * same thing «Volver al original» does when it cannot be offered: a control that
   * disappears leaves the cataloger wondering what she did wrong.
   */
  const suggestionMakesSense = shotType == null || SUGGESTABLE_SHOTS.has(shotType)

  /**
   * Turns straightening on and off.
   *
   * Entering starts from the rectangle that is on screen, so asking for perspective
   * never loses the framing already drawn. Leaving keeps the bounding box of the
   * quadrilateral, which is what the crop would have been — measured, that box is
   * very close to what the cataloger draws by hand — so the way back is not a way
   * to lose work either.
   */
  function togglePerspective() {
    if (corners) {
      setCrop(clampCrop(cornersBoundingBox(corners)))
      setCorners(null)
      return
    }
    setCorners(cornersOfRect(crop ?? centeredCrop()))
  }

  /** Puts back the rectangle a suggestion replaced. */
  function discardSuggestion() {
    if (!replaced) return
    setCrop(replaced)
    setCorners(null)
    setReplaced(null)
    setAnalysis({ status: 'idle' })
  }

  /**
   * Where the framing on screen came from, for `crop_source`.
   *
   * «Suggested» only if it is still, to the millimetre, the rectangle the detector
   * proposed: the moment a handle moves it becomes «suggested and adjusted», which is
   * a different thing to measure. Without a suggestion in play it is by hand, and a
   * photograph whose framing was never touched reports by hand too — nothing else is
   * true of it.
   */
  function currentCropSource(): CropSource {
    if (analysis.status !== 'found') return 'MANUAL'
    const candidate =
      analysis.choice === 'inner' ? analysis.suggestion.inner : analysis.suggestion.outer
    if (!candidate) return 'SUGGESTED_ADJUSTED'

    // With a quadrilateral on screen, «as suggested» means the four corners are still
    // the ones the detector gave. Comparing the rectangle instead would call it
    // suggested after every handle had been moved, because the box does not change
    // when a corner slides along a side.
    if (corners) {
      if (!candidate.corners) return 'SUGGESTED_ADJUSTED'
      const untouched = CORNER_KEYS.every(
        (key) =>
          Math.abs(candidate.corners![key].x - corners[key].x) < 1e-6 &&
          Math.abs(candidate.corners![key].y - corners[key].y) < 1e-6,
      )
      return untouched ? 'SUGGESTED' : 'SUGGESTED_ADJUSTED'
    }

    if (!crop) return 'SUGGESTED_ADJUSTED'
    const same =
      Math.abs(candidate.box.x - crop.x) < 1e-6 &&
      Math.abs(candidate.box.y - crop.y) < 1e-6 &&
      Math.abs(candidate.box.width - crop.width) < 1e-6 &&
      Math.abs(candidate.box.height - crop.height) < 1e-6
    return same ? 'SUGGESTED' : 'SUGGESTED_ADJUSTED'
  }

  /** Loads one of the two candidates into the crop rectangle. */
  function choose(which: 'outer' | 'inner') {
    if (analysis.status !== 'found') return
    const candidate = which === 'inner' ? analysis.suggestion.inner : analysis.suggestion.outer
    if (!candidate) return
    setAnalysis({ ...analysis, choice: which })
    load(candidate)
  }

  function startDrag(e: React.PointerEvent, what: Corner | 'move') {
    const current = cropRef.current
    const area = areaRef.current?.getBoundingClientRect()
    if (!area || area.width === 0 || area.height === 0) return
    // The rectangle is needed only to drag the rectangle. Requiring it always is what
    // left the perspective handles dead on REOPENING a photograph already
    // straightened: there the stored edit has corners and `crop` null, so this
    // returned before the drag ever started — and it worked when the mode was turned
    // on in the same session only because the crop was still lying around.
    if (!current && !cornersRef.current) return
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
    // The same two framings as the drag, and through the same rule: the arrow keys
    // must not accept what a finger is refused.
    const held = cornersRef.current
    if (held) {
      const from = held[corner]
      const moved = moveCorner(held, corner, { x: from.x + dx, y: from.y + dy })
      if (moved) setCorners(moved)
      return
    }
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
    // The loupe is as useful with the keyboard as with a finger: a nudge of two
    // percent is invisible on a photo shrunk to fit the screen.
    setNudged(corner)
  }

  const rotated = rotatedSize(natural, rotation)
  const fit = fitInside(rotated, box)
  const ready = fit.width > 0 && fit.height > 0
  const summary = editSummary({ rotation, crop })

  /**
   * The straightened preview: its size on screen and the transform that draws it.
   *
   * The chain, which is where this is easy to get wrong: the photograph is drawn at
   * `fit` on screen, the corners are fractions of that box, and the straightened
   * rectangle is `straightenedSize` of the same box. So the transform has to carry
   * screen pixels to screen pixels — the inverse homography scaled by `fit` on the
   * way in and by the preview box on the way out.
   */
  const preview = (() => {
    if (!corners || fit.width === 0) return null
    const forward = homographyFromUnitSquare(corners)
    const inverse = forward && invertHomography(forward)
    if (!inverse) return null

    const straightened = straightenedSize(corners)
    const wide = straightened.width * fit.width
    const tall = straightened.height * fit.height
    if (wide <= 0 || tall <= 0) return null
    // A quarter of the working surface, so it informs without covering the photo.
    const scale = Math.min(1, Math.min(box.width, box.height) / 3 / Math.max(wide, tall))
    const width = Math.max(1, Math.round(wide * scale))
    const height = Math.max(1, Math.round(tall * scale))

    // From screen pixels of the photograph to the unit square, through the inverse,
    // and out to the pixels of the preview box.
    const sx = rotation % 180 === 0 ? fit.width : fit.height
    const sy = rotation % 180 === 0 ? fit.height : fit.width
    const compose = (a: number, b: number, c: number) => [a, b, c] as const
    void compose
    const h = inverse
    const matrix = [
      (h[0] * width) / sx,
      (h[1] * width) / sy,
      h[2] * width,
      (h[3] * height) / sx,
      (h[4] * height) / sy,
      h[5] * height,
      h[6] / sx,
      h[7] / sy,
      h[8],
    ] as const
    return { width, height, transform: homographyToCssMatrix(matrix) }
  })()

  // Which corner the loupe is showing: the one being dragged, or the one being
  // nudged with the keyboard. Nothing while the whole rectangle is moved — there
  // no single pixel is being aimed at — and nothing once the finger lifts.
  const magnified = dragging && dragging !== 'move' ? dragging : nudged
  /**
   * The point under the finger, whichever framing is being adjusted.
   *
   * In perspective mode it is the corner OF THE QUADRILATERAL and not of the
   * rectangle: the rectangle does not move then, so reading it from there left the
   * loupe frozen on a corner nobody was touching.
   */
  const aimed = !magnified
    ? null
    : corners
      ? corners[magnified]
      : crop
        ? cornerPoint(clampCrop(crop), magnified)
        : null

  // Placement: the corner of the working surface OPPOSITE to where the finger
  // is, recomputed as it moves. Anchoring it to which handle it is would not be
  // enough — the crop can sit in any quadrant, and then the «nw» handle is at
  // the bottom right of the screen with the thumb over the loupe.
  const loupePlacement: React.CSSProperties = (() => {
    if (!aimed) return {}
    const corner = aidCorners(aimed).loupe
    return {
      ...(corner === 'ne' || corner === 'se' ? { right: LOUPE_INSET } : { left: LOUPE_INSET }),
      ...(corner === 'nw' || corner === 'ne' ? { top: LOUPE_INSET } : { bottom: LOUPE_INSET }),
    }
  })()

  /**
   * The preview: the same side as the loupe, the other half of the screen.
   *
   * Sharing the column and flipping the row is what GUARANTEES they never land on
   * the same corner, and that is the point of writing it this way. The first version
   * repeated the loupe's horizontal rule and always sat at the bottom, so with the
   * finger on either top corner both ended up in the same place — the two visible at
   * once, one over the other.
   */
  const previewPlacement: React.CSSProperties = (() => {
    // Nothing being dragged: a fixed corner, and the top right because the hand comes
    // from the bottom. It DOES sit over the artwork's own corner when the painting
    // fills the frame — the first attempt at this looked for a free corner and there
    // is none, because the four corners of a photographed painting are near the four
    // corners of the photograph. What solves it is the stacking order: the handles
    // paint above the preview, so the yellow dot stays visible on top of it and
    // nothing becomes ungrabbable.
    const corner = aimed ? aidCorners(aimed).preview : 'ne'
    return {
      ...(corner === 'ne' || corner === 'se' ? { right: LOUPE_INSET } : { left: LOUPE_INSET }),
      ...(corner === 'nw' || corner === 'ne' ? { top: LOUPE_INSET } : { bottom: LOUPE_INSET }),
    }
  })()

  useEffect(() => {
    const canvas = loupeRef.current
    const image = imageRef.current
    if (!magnified || !aimed || !canvas || !image) return
    if (natural.width === 0 || fit.width === 0) return
    // One paint per frame at most: a pointer fires far more often than the screen
    // refreshes, and every move already re-renders the rectangle.
    const handle = requestAnimationFrame(() => {
      paintLoupe(canvas, image, {
        natural,
        rotation,
        point: aimed,
        // From screen pixels to pixels of the rotated image: the photograph is
        // displayed at `fit`, so this is what makes the loupe magnify LOUPE_ZOOM
        // times what the cataloger is seeing, which is the reference that
        // matters — not the pixels of the master, which she never sees.
        sourceSide: (LOUPE_SIDE / LOUPE_ZOOM) * (rotated.width / fit.width),
      })
    })
    return () => cancelAnimationFrame(handle)
    // `aimed.x` and `aimed.y` and not `aimed`: the object is new on every render,
    // and depending on it would repaint even when the point has not moved. What has
    // to trigger a repaint is the point changing, which in perspective mode is the
    // only thing that changes — the crop stays still, and depending on IT was the
    // bug.
  }, [magnified, aimed?.x, aimed?.y, rotation, natural, rotated.width, fit.width])

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
              ref={imageRef}
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

            {corners && ready && (
              <>
                {/* The quadrilateral, drawn as an SVG polygon: four sides that are
                    not axis-aligned cannot be four divs, and a polygon also shows
                    the shape while it is being dragged. */}
                <svg
                  aria-hidden
                  viewBox="0 0 100 100"
                  preserveAspectRatio="none"
                  className="pointer-events-none absolute inset-0 h-full w-full"
                >
                  <polygon
                    points={CORNER_KEYS.map((key) => `${corners[key].x * 100},${corners[key].y * 100}`).join(' ')}
                    fill="rgba(0,0,0,0.35)"
                    stroke="rgba(255,255,255,0.9)"
                    strokeWidth="0.4"
                    vectorEffect="non-scaling-stroke"
                  />
                </svg>

                {CORNERS.map(({ corner, label }) => (
                  <span
                    key={corner}
                    role="button"
                    tabIndex={0}
                    aria-label={`Arrastrar la ${label} de la obra`}
                    onPointerDown={(e) => startDrag(e, corner)}
                    onKeyDown={(e) => onHandleKeyDown(e, corner)}
                    onBlur={() => setNudged((c) => (c === corner ? null : c))}
                    onContextMenu={(e) => e.preventDefault()}
                    // z-20 so it paints over the loupe and the preview: those two are
                    // aids and this is the thing being aimed at.
                    className="absolute z-20 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 touch-none select-none items-center justify-center"
                    style={{ left: `${corners[corner].x * 100}%`, top: `${corners[corner].y * 100}%` }}
                  >
                    <span
                      aria-hidden
                      className={`block rounded-full border-2 border-stone-900 bg-amber-300 ${
                        dragging === corner ? 'h-7 w-7' : 'h-5 w-5'
                      }`}
                    />
                  </span>
                ))}
              </>
            )}

            {crop && !corners && ready && (
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
                      onBlur={() => setNudged((c) => (c === corner ? null : c))}
                      onContextMenu={(e) => e.preventDefault()}
                      // 44 px of touch area, with a smaller visible mark: on a
                      // phone the finger needs the room even if the drawing
                      // does not.
                      className="absolute z-20 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 touch-none select-none items-center justify-center"
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

        {/* The straightened result, live.
            The homography goes into a CSS `matrix3d`, which is the one place a
            projective transform is free: the browser draws it on the GPU, so
            dragging a handle costs nothing per frame. Running the pixel loop
            instead would be 89 ms a frame on the cataloger's phone — measured.
            It sits opposite the loupe so the two never fight for the same thumb. */}
        {corners && ready && preview && (
          <div
            aria-hidden
            className="pointer-events-none absolute z-10 overflow-hidden rounded-lg border border-white/40 bg-white shadow-lg"
            style={{
              ...previewPlacement,
              width: `${preview.width}px`,
              height: `${preview.height}px`,
            }}
          >
            <img
              src={url ?? undefined}
              alt=""
              draggable={false}
              className="absolute left-0 top-0 origin-top-left select-none"
              style={{
                width: `${rotation % 180 === 0 ? fit.width : fit.height}px`,
                height: `${rotation % 180 === 0 ? fit.height : fit.width}px`,
                // `max-width: none` is not decoration: the CSS preflight sets
                // `img { max-width: 100% }`, which capped this one to the width of
                // the preview box while the transform assumed the full size — so the
                // straightened view came out as the top left corner of the wall. The
                // transform maps IMAGE pixels, so the image has to be at image size.
                maxWidth: 'none',
                maxHeight: 'none',
                transform: preview.transform,
              }}
            />
          </div>
        )}

        {/* The loupe. `pointer-events-none` so it cannot steal the gesture, and
            `aria-hidden` because it says nothing new: it is the same corner,
            bigger. It lives outside the image area, anchored to the working
            surface, so its placement does not depend on where the photo fits. */}
        {magnified && aimed && ready && (
          <canvas
            ref={loupeRef}
            aria-hidden
            width={loupePixels()}
            height={loupePixels()}
            className="pointer-events-none absolute z-10 rounded-lg border-2 border-white/80 shadow-lg"
            style={{ width: `${LOUPE_SIDE}px`, height: `${LOUPE_SIDE}px`, ...loupePlacement }}
          />
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
            disabled={!ready || analysis.status === 'working' || !suggestionMakesSense}
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

          {/* Straightening, and putting back what a suggestion replaced. Both live
              in this row and not in one of their own: the footer of the editor
              already measures some 372 px and leaves 250-310 px of working surface
              on a phone, so a new row would come out of the photograph. */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={!ready || !canRestoreOriginal}
              aria-pressed={corners !== null}
              onClick={togglePerspective}
              className={`btn min-h-touch text-sm ${
                corners !== null
                  ? 'bg-white text-stone-900'
                  : 'border border-stone-600 text-white disabled:opacity-40'
              }`}
            >
              {corners !== null ? 'Volver al rectángulo' : 'Corregir perspectiva'}
            </button>
            <button
              type="button"
              disabled={!replaced}
              onClick={discardSuggestion}
              className="btn min-h-touch border border-stone-600 text-sm text-white disabled:opacity-40"
            >
              Descartar la sugerencia
            </button>
          </div>

          <p
            id="editor-suggestion-help"
            role="status"
            aria-live="polite"
            className="text-center text-xs text-stone-400"
          >
            {corners !== null
              ? 'Arrastra las cuatro esquinas de la obra. A la derecha ves cómo va a quedar enderezada; lo que caiga fuera de la fotografía saldrá en blanco'
              : !canRestoreOriginal
                ? 'No se puede corregir la perspectiva sobre la copia de consulta: haría falta el máster, y esta vez no se ha podido descargar'
                : !suggestionMakesSense
              ? `En una toma de tipo «${SHOT_TYPE_LABEL[shotType!]}» no hay borde de cuadro que reconocer: ajusta el recorte a mano`
              : analysis.status === 'working'
                ? 'Analizando la fotografía para reconocer el borde del cuadro…'
                : analysis.status === 'none'
                  ? 'No he reconocido el borde del cuadro: arrastra las esquinas para recortarlo a mano'
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
