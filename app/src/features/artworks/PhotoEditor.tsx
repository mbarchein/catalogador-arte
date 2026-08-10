import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  centeredCrop,
  clampCrop,
  colorAvailability,
  withOwnColor,
  cornerPoint,
  editSummary,
  fitInside,
  moveCrop,
  normalizeEdit,
  resizeCrop,
  rotateCrop,
  rotateEdit,
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
import {
  LOUPE_SIDE,
  LOUPE_ZOOM,
  aidCorners,
  loupePixels,
  paintLoupe,
  type LoupeMode,
} from '../../lib/imageLoupe'
import {
  rotateSuggestion,
  type EdgeCandidate,
  type EdgeSuggestion,
} from '../../lib/edgeDetection'
import { suggestArtworkCrop } from '../../lib/imageEdges'
import {
  buildColorLuts,
  colorSvgTables,
  isNoColor,
  withNeutralPick,
  type ColorEdit,
  type ColorInput,
} from '../../lib/imageColor'
import { readAnalysisPixels, type PixelRaster } from '../../lib/imagePixels'
import { EXIF_SLICE_BYTES, readPhotoExif, type PhotoExif } from '../../lib/exif'
import { useBaseTextScaleHere } from '../../lib/useTextScale'
import type { GrayTargetCandidate } from '../../lib/grayTarget'
import {
  ColorControls,
  ColorIcon,
  reviewedColor,
  sampleAt,
  showsColorFilter,
} from './ColorControls'
import { DataIcon, PhotoDataPanel } from './PhotoDataPanel'
import { liftTakesSample, pointerIntent } from './pickGesture'
import {
  CropIcon,
  ImageIcon,
  MoveIcon,
  NoIcon,
  PerspectiveIcon,
  RevertIcon,
  RotateLeftIcon,
  RotateRightIcon,
  WandIcon,
} from '../../components/ui'
import { useCloseOnBack } from '../../components/useCloseOnBack'
import { editorExit } from './editorExit'
import { SHOT_TYPE_LABEL, type PhotoProvenance, type ShotTypeValue } from '../../lib/types'

/** Nudge of a corner with the arrow keys, as a fraction of the side. */
const KEY_STEP = 0.02

/** An arrow key as a step; nothing for any other key. */
function arrowStep(key: string): [number, number] | null {
  if (key === 'ArrowLeft') return [-KEY_STEP, 0]
  if (key === 'ArrowRight') return [KEY_STEP, 0]
  if (key === 'ArrowUp') return [0, -KEY_STEP]
  if (key === 'ArrowDown') return [0, KEY_STEP]
  return null
}

/** Closest and farthest the photograph can be zoomed on the working surface. */
const MIN_ZOOM = 1
const MAX_ZOOM = 8

/** Wheel notches to doublings: a notch of 100 units is about a 20 % step. */
const WHEEL_TO_ZOOM = 0.0018

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

/**
 * The three states of the framing, which is a single axis: the whole photograph, an
 * upright rectangle, or the four free corners of a painting shot at an angle.
 */
type Framing = 'NONE' | 'RECTANGLE' | 'PERSPECTIVE'

const FRAMINGS: { value: Framing; label: string; Icon: typeof ImageIcon }[] = [
  { value: 'NONE', label: 'Sin recorte', Icon: ImageIcon },
  { value: 'RECTANGLE', label: 'Rectángulo', Icon: CropIcon },
  { value: 'PERSPECTIVE', label: 'Perspectiva', Icon: PerspectiveIcon },
]

/**
 * What the FOOT of the dialog is showing. One axis with three states, like the framing.
 *
 * The colour controls and the photograph's data take the place of the row of tools
 * instead of floating over the artwork (§7): a white balance is judged looking at the
 * whole surface, and a panel on top of it would also collide with the loupe, which lands
 * in the corner opposite the finger. The row of tools measures 308 of the 336 usable
 * pixels of a 360 px phone, so a seventh icon does not fit either — which is why the two
 * ways in are round buttons in the header, where the close, the title and the summary
 * already live and a 44 px target costs no vertical room at all.
 */
type Panel = 'TOOLS' | 'COLOR' | 'DATA'

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
 *  6. Closing goes through `useCloseOnBack`, like the viewer and every sheet: on a
 *     phone the back button must close the editor and not leave the record.
 *     Applying consumes the same history entry, so back never lands on a stale
 *     editor.
 *  7. «Sugerir recorte» detects the borders of the painting on demand, never on
 *     opening: it costs a decode of the master plus a pass over the pixels, and
 *     spending that on every editor that opens — most of which only rotate —
 *     would slow the common case for the rare one. And a suggestion the
 *     cataloger did not ask for arrives as an opinion about her framing.
 *     What it does is PRELOAD the rectangle. It never applies: what leaves the
 *     editor is always what she confirmed with «Aplicar».
 *  8. One drag is one meaning, whatever it is made of: on a handle it adjusts that
 *     handle, anywhere else it pans the photograph — one finger, the mouse or a pen
 *     alike. Two fingers are the pinch, and the pinch has precedence over everything:
 *     they land one after the other and often on top of a handle, and a corner that
 *     moves while the photograph zooms is a corner nobody placed.
 *  9. The colour (RF-414) is previewed with an inline SVG `<filter>` carrying the
 *     **256** entries of the same lookup table the export applies, and
 *     `color-interpolation-filters="sRGB"` on it, which is the silent failure number
 *     one of the feature: without it the browser interpolates in linear light, the
 *     table is applied to numbers that did not build it, and the preview stops
 *     matching the file while both keep looking plausible. It goes on the two `<img>`
 *     — the surface and the straightened preview — and **never on the area the handles
 *     live in**: there it would tint the handles and the polygon, and `filter` creates
 *     a stacking context that would break the `z-10`/`z-20` arbitration the loupe, the
 *     preview panel and the handles depend on.
 * 10. The colour is corrected with the artwork in front of you, so the sample the
 *     eyedropper takes must be of the RAW pixels: a grey that is already grey measures
 *     the correction and not the light of the room, and every second pick would undo
 *     part of the previous one. That is `loupeTables`' rule and the loupe is told which
 *     mode it is in.
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
  provenance,
  generalColor,
  recordPhotoDate,
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
  /**
   * Where the photograph comes from (RF-417). It gates the colour panel and nothing
   * else: on a reproduction taken from another catalog or received from a third party
   * the adjustment is not offered, because correcting its cast would be amending
   * somebody else's development of an artwork this cataloger never saw under that
   * light. The rule itself is `colorAvailability`'s and it is never rewritten here.
   *
   * Absent means «propia», which is what the column defaults to and what 40 of the 44
   * masters are.
   */
  provenance?: PhotoProvenance | null
  /**
   * The colour adjustment of the artwork's GENERAL shot, when there is one.
   *
   * «La toma general manda» (§7): the back, the signature, the damage and the frame
   * start from her adjustment, are changed from there one by one, and can be brought
   * back to it. Absent —or neutral— means there is nothing to inherit and the offer is
   * not made; on the general shot itself it is ignored, because it inherits from nobody.
   */
  generalColor?: ColorInput
  /** `photo_date` of the record, so §7.1 can name a discrepancy in a low voice. */
  recordPhotoDate?: string | null
  onApply: (edit: PhotoEdit, cropSource: CropSource) => void
  onCancel: () => void
}) {
  // El editor se queda al tamaño de letra normal, aunque el perfil haya pedido letra
  // grande, y es la excepción razonada del ajuste: aquí se mide el lienzo en píxeles y se
  // calcula la posición de los tiradores de recorte y perspectiva contra el rectángulo real
  // del elemento, así que escalarlo es pedirle problemas a la única pantalla del proyecto
  // donde un par de puntos de desviación se ven. Y ocupa la pantalla entera, así que
  // mientras está abierto no hay ningún otro texto que leer.
  useBaseTextScaleHere()

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
  /**
   * Where the cataloger parked the preview, in pixels of the working surface, or null
   * while it places itself.
   *
   * Once she has moved it, it stays: the automatic placement follows the finger from
   * corner to corner, and a panel that jumps away every time you grab a different
   * handle is a panel you cannot watch while you work. Deciding beats guessing, so the
   * guess stops as soon as there is a decision.
   */
  const [previewSpot, setPreviewSpot] = useState<{ x: number; y: number } | null>(null)
  /**
   * Zoom and pan of the photograph on the working surface. Presentation only: nothing
   * here reaches the framing that gets stored.
   *
   * It is applied as a CSS transform on the area the handles live in, and that choice
   * is what keeps the rest of the component untouched — the pointer arithmetic reads
   * `getBoundingClientRect()` of that area, which already comes back transformed, so
   * every corner and every drag keeps working with no change. What does need to know
   * is the loupe, whose contract is «three times what is ON SCREEN»: with the
   * photograph magnified, the region it reads has to shrink by the same factor.
   */
  const [view, setView] = useState({ zoom: 1, x: 0, y: 0 })
  /**
   * The colour adjustment (RF-414), absolute over the master exactly like the framing.
   *
   * It is the COMMITTED value: while a strip is being dragged the value in flight lives
   * in a ref inside the strip and reaches the screen through the filter's attributes, so
   * this state is written once, when the finger lifts. The bottleneck is not the pixels —
   * building the three 256-entry tables costs 0,5 ms — it is React re-rendering the
   * sixteen hundred lines of JSX below on every `pointermove`.
   */
  const [color, setColor] = useState<ColorEdit>(() => normalizeEdit(initialEdit).color)
  /** Which of the three things the foot of the dialog is showing. */
  const [panel, setPanel] = useState<Panel>('TOOLS')
  /** What the file says about the camera, or null when it says nothing. `undefined` = not read. */
  const [exif, setExif] = useState<PhotoExif | null | undefined>(undefined)
  /**
   * The analysis raster of the photograph, kept while the editor is open.
   *
   * Decoding a 12 MP master and drawing it shrunk costs hundreds of milliseconds on the
   * phone used in a storeroom, and the colour panel measures the histogram again on every
   * release of a strip: `imagePixels` says explicitly that caching it is the caller's job,
   * because only the caller knows when the editor closes. Half a million pixels, not the
   * master.
   */
  const rasterRef = useRef<PixelRaster | null>(null)
  /**
   * Number of the decode in flight. A change of photograph invalidates the previous answer
   * instead of letting it arrive late and be measured as this one — the same idiom, and the
   * same reason, as `analysisTicket` of the border detection.
   */
  const rasterTicket = useRef(0)
  const [rasterState, setRasterState] = useState<'idle' | 'working' | 'ready' | 'failed'>('idle')
  /**
   * The eyedropper as an armed mode in which **one finger aims**: the sample follows the
   * finger and the lift commits it. It does take the one-finger pan away while armed, and
   * that is the correction of a first design where a drag did both and aiming was therefore
   * impossible. The pinch keeps zooming and repositioning. See `pickGesture.ts`.
   */
  const [eyedropper, setEyedropper] = useState(false)
  /** Where the finger is while the eyedropper is armed, so the loupe can show the raw pixels. */
  const [aim, setAim] = useState<{ x: number; y: number } | null>(null)
  /** What the last pick said, when the sample could not be believed. */
  const [pickNotice, setPickNotice] = useState<string | null>(null)
  /**
   * Grey targets found, drawn over the photograph and **offered**: the detection never
   * applies anything by itself (RF-418).
   */
  const [candidates, setCandidates] = useState<readonly GrayTargetCandidate[]>([])

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
  editRef.current = { rotation, crop, corners, color }
  /**
   * Whether the colour was LOOKED AT, which is not the same as changed.
   *
   * «Sin revisar» no es «no»: opening the panel with the artwork in front of you and
   * deciding the colour was already right is work done, and with every column null there
   * is no way to tell it from «nobody has ever looked». That is what `REVIEWED_UNCHANGED`
   * is for, and `reviewedColor` only ever writes it when the look is untouched — so it
   * changes no pixel and rewrites no file.
   */
  const reviewedRef = useRef(false)
  /** Read by the history listener, which is registered once and must see the current panel. */
  const panelRef = useRef<Panel>(panel)
  panelRef.current = panel
  const eyedropperRef = useRef(eyedropper)
  eyedropperRef.current = eyedropper
  /** The pointer that may still turn out to be a tap of the eyedropper. */
  const pickRef = useRef<{ pointer: number } | null>(null)
  // Number of the border detection in flight. Asking again, or closing the
  // editor, invalidates the previous answer instead of letting it arrive late
  // and move a rectangle the cataloger is already dragging.
  const analysisTicket = useRef(0)
  const appliedRef = useRef(false)
  /** Set by `close`: leave the editor without peeling any layer first. */
  const leavingRef = useRef(false)
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
    setExif(undefined)

    /**
     * The camera data of §7.1, read here because this is the effect that already has the
     * file: only the first 128 KB, which over the 44 masters of the dump gives the same
     * answer as the whole file in 44 of 44 — EXIF lives in the APP1 segment, before the
     * pixels, and a segment is capped at 64 KB. The alternative is `await
     * source.arrayBuffer()` on an 8 MB photograph, on a phone, in the same tick that
     * builds the object URL.
     *
     * It never throws and it never explains the machine: a PNG, a HEIC, a JPEG with no
     * EXIF and a `slice` the browser refuses are all «esta fotografía no trae datos de
     * cámara», and the panel has the two sentences that tell that apart from a master that
     * did not download.
     */
    let alive = true
    void (async () => {
      try {
        const buffer = await source.slice(0, EXIF_SLICE_BYTES).arrayBuffer()
        if (alive) setExif(readPhotoExif(buffer))
      } catch {
        if (alive) setExif(null)
      }
    })()

    return () => {
      alive = false
      URL.revokeObjectURL(objectUrl)
    }
  }, [source])

  /**
   * Undoes the innermost layer that is up, and answers whether there was one. The
   * ladder itself — which layer goes first, and when leaving skips it altogether —
   * is `editorExit` and has its own tests; here it is only carried out.
   */
  function peelLayer(): 'PEELED' | 'LEAVE' {
    const exit = editorExit({
      eyedropper: eyedropperRef.current,
      panelOpen: panelRef.current !== 'TOOLS',
      leaving: leavingRef.current,
    })
    if (exit === 'DISARM_EYEDROPPER') {
      setEyedropper(false)
      setAim(null)
      return 'PEELED'
    }
    if (exit === 'CLOSE_PANEL') {
      setPanel('TOOLS')
      return 'PEELED'
    }
    return 'LEAVE'
  }

  // One exit for the three ways of leaving — ✕, Escape and the phone's back
  // button — so the entry pushed on opening is always consumed exactly once. The
  // pushing and the arbitration live in `useCloseOnBack`, shared with the viewer
  // and the sheets: while each modal listened for itself, one back with two of
  // them open closed both.
  useCloseOnBack(() => {
    // Peeling a layer leaves the editor mounted, and `useCloseOnBack` reads that
    // as a close it was refused: it hands the history entry back, so the next
    // back peels the next layer instead of walking out of the record.
    if (peelLayer() === 'PEELED') return
    if (appliedRef.current) {
      const edit = normalizeEdit(editRef.current)
      // The one place `REVIEWED_UNCHANGED` is stamped: on the way out, and only when the
      // panel was opened and the look was left alone.
      onApplyRef.current(
        { ...edit, color: reviewedColor(edit.color, reviewedRef.current) },
        cropSourceRef.current,
      )
    } else onCancelRef.current()
  })

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      // The last rung goes out through the same door as everything else:
      // consuming the history entry, so no exit keeps its own count.
      if (peelLayer() === 'PEELED') return
      window.history.back()
    }
    window.addEventListener('keydown', onKey)

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
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
    // La ✕, «Cancelar» y «Aplicar» son la salida del editor y no un peldaño de la
    // escalera: se ven también con un panel abierto, y desde ahí «Aplicar» tiene
    // que aplicar. Sin esta marca cerraría el panel y se quedaría dentro.
    leavingRef.current = true
    window.history.back()
  }

  /* ------------------------------------------------------------------- colour */

  /**
   * Whether the colour adjustment is offered at all, and why not when it is not.
   *
   * The rule is `colorAvailability`'s and it is not restated here: not over the
   * consultation copy, which already carries the colour baked into pixels that went
   * through a lossy WebP, and not on a photograph that is not ours (RF-417). The panel
   * still opens when the answer is no — what it shows then is the reason, because a
   * control that is simply missing is indistinguishable from one that is broken.
   */
  const availability = useMemo(
    () => colorAvailability(canRestoreOriginal, provenance),
    [canRestoreOriginal, provenance],
  )

  /**
   * The preview filter, and the three nodes whose `tableValues` a drag rewrites by hand.
   *
   * A suffix of its own and not a constant: two editors mounted at once would otherwise
   * share one filter, and the second would silently colour the first's photograph. Not
   * `useId` either, whose output carries `:` in React 18 and `«»` in React 19 — legal in an
   * `id`, and exactly the sort of thing that makes `url(#…)` and a CSS selector disagree.
   */
  const [filterId] = useState(() => `photo-color-${Math.random().toString(36).slice(2, 10)}`)
  const funcR = useRef<SVGFEFuncRElement | null>(null)
  const funcG = useRef<SVGFEFuncGElement | null>(null)
  const funcB = useRef<SVGFEFuncBElement | null>(null)

  const svgTables = useMemo(() => colorSvgTables(color), [color])
  /**
   * The filter is on while the panel is open even with a neutral adjustment. That is not
   * waste: the strips write the tables STRAIGHT TO THE DOM without going through React,
   * so a filter React had not rendered yet would leave the first drag of an untouched
   * photograph previewing nothing. With the panel closed it is on only when there is
   * something to show. The identity table is exactly the identity — ADR-009 pins
   * `lut[c][i] === i` with a test — so having it on changes no pixel.
   */
  const colorFilter = showsColorFilter(panel === 'COLOR' && availability.available, color)
  /** The same tables the filter shows, for the loupe, which applies them in CPU. */
  const luts = useMemo(() => (colorFilter ? buildColorLuts(color) : null), [colorFilter, color])

  /**
   * The colour on screen, without a re-render.
   *
   * Called once per frame from inside a strip, and once more right after every commit: the
   * DOM was mutated by hand, so if the committed value happens to equal the last one React
   * rendered, React would leave the hand-written attribute in place. Writing it again costs
   * 0,5 ms and removes the whole class of bug.
   */
  function previewColor(next: ColorEdit) {
    const tables = colorSvgTables(next)
    funcR.current?.setAttribute('tableValues', tables.r)
    funcG.current?.setAttribute('tableValues', tables.g)
    funcB.current?.setAttribute('tableValues', tables.b)
  }

  function commitColor(next: ColorEdit) {
    previewColor(next)
    setColor(next)
  }

  /**
   * A new photograph invalidates the pixels of the previous one, and everything measured on
   * them: a histogram of the artwork before this one is worse than no histogram.
   *
   * Declared BEFORE the effect that loads them, which is the part that matters: effects run
   * in declaration order, so on a change of source this clears first and the loader starts
   * again straight after. The other way round the loader would start and this would throw
   * its answer away.
   */
  useEffect(() => {
    rasterTicket.current += 1
    rasterRef.current = null
    setRasterState('idle')
    setCandidates([])
    setEyedropper(false)
    setPickNotice(null)
  }, [source])

  /**
   * The pixels the panel measures, decoded once and kept while the editor is open.
   *
   * On demand and never on opening, for the same reason as the border suggestion: it costs a
   * decode of the master plus a pass over the pixels, and spending that on every editor —
   * most of which only turn a photograph — would slow the common case for the rare one.
   *
   * `rasterState` is deliberately NOT a dependency, and that is not an oversight: writing
   * `working` from inside would re-run the effect, and the cleanup of the run that launched
   * the decode would discard its own answer. The photograph would stay «midiendo» forever.
   * What guards a late answer is the ticket, the same idiom the border detection uses.
   */
  useEffect(() => {
    if (panel !== 'COLOR' || !availability.available) return
    if (rasterRef.current) return
    const ticket = rasterTicket.current
    setRasterState('working')
    void readAnalysisPixels(source).then((raster) => {
      if (rasterTicket.current !== ticket) return
      rasterRef.current = raster
      setRasterState(raster ? 'ready' : 'failed')
    })
  }, [panel, availability.available, source])

  /**
   * Closing the colour panel takes its aids with it.
   *
   * A staircase still drawn on the photograph with no button left to accept it is a mark
   * that says nothing, and an armed eyedropper with nothing on screen saying so is a trap:
   * the next tap on the artwork would silently change the white balance.
   */
  useEffect(() => {
    if (panel === 'COLOR') return
    setCandidates([])
    setEyedropper(false)
    setAim(null)
  }, [panel])

  /**
   * A point of the working surface as fractions of the rotated photograph, or null when it
   * is off the photograph.
   *
   * Read off `areaRef`, whose `getBoundingClientRect()` already comes back with the zoom
   * and the pan applied — the same reason every corner drag reads it and needs no change
   * when the surface is magnified.
   */
  function surfacePoint(clientX: number, clientY: number): { x: number; y: number } | null {
    const area = areaRef.current?.getBoundingClientRect()
    if (!area || area.width === 0 || area.height === 0) return null
    const x = (clientX - area.left) / area.width
    const y = (clientY - area.top) / area.height
    if (x < 0 || x > 1 || y < 0 || y > 1) return null
    return { x, y }
  }

  /**
   * Takes the neutral grey the cataloger tapped (RF-418).
   *
   * The sample is the median of a patch of the RAW pixels —`sampleAt` explains why the
   * median and why the analysis raster— and what it writes is the white balance and the
   * traceability of it, nothing else. When the sample cannot be believed, `withNeutralPick`
   * answers null and the panel says so: a wrong suggestion that looks measured is worse
   * than none, and quietly doing nothing would be the worst of the three.
   */
  function pickAt(point: { x: number; y: number }) {
    if (!rasterRef.current) {
      setPickNotice(
        'No se han podido medir los píxeles: el cuentagotas no puede tomar el gris.',
      )
      return
    }
    const sample = sampleAt(rasterRef.current, rotation, point)
    const next = withNeutralPick(color, sample, point, 'SCENE')
    if (!next) {
      setPickNotice(
        'Ese punto está quemado o demasiado oscuro para medir. Prueba con un gris medio.',
      )
      return
    }
    setPickNotice('Gris tomado de la escena: el balance de blancos se ha fijado con él.')
    // Through `withOwnColor`, which clears `inherited` even when the numbers do not move:
    // the column says how the adjustment arrived, and this one arrived from her finger.
    commitColor(withOwnColor(editRef.current, next).color)
  }

  /**
   * Turning must not move the framing: everything drawn over the photograph turns
   * with it.
   *
   * The turn, the rectangle and the quadrilateral go together through `rotateEdit`,
   * which is the whole reason it exists: they used to be turned one by one here and
   * the quadrilateral was left out, so turning a straightened photograph left its
   * four corners in the previous frame.
   */
  function rotate(delta: number) {
    const turned = rotateEdit(editRef.current, delta)
    setRotation(turned.rotation)
    setCrop(turned.crop ?? null)
    setCorners(turned.corners ?? null)
    // What a suggestion replaced travels too, or «Deshacer la sugerencia» would put
    // back a rectangle measured over the previous frame.
    setReplaced((c) => (c ? rotateCrop(c, delta) : null))
    // And so do the stored candidates, or choosing between frame and canvas after
    // turning the photo would load a rectangle from the previous frame.
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
   * The framing is ONE axis with three states, and naming it that way is what makes
   * the footer readable.
   *
   * It used to be two separate switches —«Recortar/Quitar recorte» and «Corregir
   * perspectiva/Volver al rectángulo»— sitting in different rows with a third button
   * in between, each flipping its own label when pressed. Two controls for one
   * decision, and a label that never says whether it describes the state or the
   * action: «Quitar recorte» reads both ways. As a single selector the state is what
   * is shown and the labels stop moving.
   */
  const framing: Framing = corners ? 'PERSPECTIVE' : crop ? 'RECTANGLE' : 'NONE'

  /**
   * Moves the framing to one of its three states.
   *
   * Entering the quadrilateral starts from the rectangle that is on screen, so asking
   * for perspective never loses the framing already drawn. Leaving it keeps the
   * bounding box of the quadrilateral, which is what the crop would have been —
   * measured, that box is very close to what the cataloger draws by hand — so the way
   * back is not a way to lose work either.
   */
  function setFraming(next: Framing) {
    if (next === framing) return
    if (next === 'NONE') {
      setCrop(null)
      setCorners(null)
      return
    }
    if (next === 'RECTANGLE') {
      setCrop(corners ? clampCrop(cornersBoundingBox(corners)) : (crop ?? centeredCrop()))
      setCorners(null)
      return
    }
    setCorners(cornersOfRect(crop ?? centeredCrop()))
  }

  /**
   * Starts dragging the preview panel.
   *
   * Its own pointer capture and its own listeners, on purpose: it must not go through
   * the `dragging` machinery of the framing, which is about the photograph and would
   * take the loupe and the corner arithmetic along with it.
   */
  function startPreviewDrag(e: React.PointerEvent) {
    const frame = frameRef.current?.getBoundingClientRect()
    const panel = (e.currentTarget as HTMLElement).getBoundingClientRect()
    if (!frame) return
    e.preventDefault()
    e.stopPropagation()
    previewDragRef.current = {
      pointer: e.pointerId,
      dx: e.clientX - panel.left,
      dy: e.clientY - panel.top,
    }

    const onMove = (move: PointerEvent) => {
      const start = previewDragRef.current
      if (!start || move.pointerId !== start.pointer) return
      setPreviewSpot({
        x: move.clientX - frame.left - start.dx,
        y: move.clientY - frame.top - start.dy,
      })
    }
    const end = () => {
      previewDragRef.current = null
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
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
    // Another pointer already on the surface means the hand is making a pinch, not
    // adjusting a corner: the two fingers of a pinch land one after the other and
    // often on top of a handle, and letting the second one grab it is what made a
    // zoom near a corner drag that corner instead. The pinch has precedence, always.
    if (touchesRef.current.size > 1) return
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
    const step = arrowStep(e.key)
    if (!step) return
    e.preventDefault()
    nudge(corner, step[0], step[1])
    // The loupe is as useful with the keyboard as with a finger: a nudge of two
    // percent is invisible on a photo shrunk to fit the screen.
    setNudged(corner)
  }

  /**
   * The arrow keys on the middle handle move the whole rectangle.
   *
   * Same rule as the corners: a function cannot be reachable by gesture only. No
   * loupe here — moving the frame is not aiming at a pixel.
   */
  function onMoveKeyDown(e: React.KeyboardEvent) {
    const step = arrowStep(e.key)
    const current = cropRef.current
    if (!step || !current) return
    e.preventDefault()
    setCrop(moveCrop(current, step[0], step[1]))
  }

  /**
   * ONE line of help, the one that matters right now.
   *
   * There used to be two paragraphs always on screen, 474 characters between them on
   * a phone, saying overlapping things — both explained dragging the corners — and
   * together they cost more vertical room than the row of buttons they explained.
   * Ordered by how much the cataloger needs it: what she cannot do comes before what
   * the detector is doing, and that before how to drag.
   */
  function helpText(): string {
    if (!canRestoreOriginal)
      return 'Sobre la copia de consulta solo puedes girar y recortar más: el color ya viene aplicado.'
    if (analysis.status === 'working') return 'Analizando la fotografía para reconocer el borde del cuadro…'
    if (analysis.status === 'none')
      return 'No he reconocido el borde del cuadro: arrastra las esquinas para recortarlo a mano.'
    if (analysis.status === 'found' && analysis.suggestion.inner)
      return 'Recorte sugerido: se han reconocido dos bordes. Elige uno y ajusta las esquinas.'
    if (analysis.status === 'found') return 'Recorte sugerido: ajusta las esquinas si hace falta.'
    if (!suggestionMakesSense && framing !== 'NONE')
      return `En una toma de tipo «${SHOT_TYPE_LABEL[shotType!]}» no hay borde que reconocer: ajústalo a mano.`
    if (framing === 'PERSPECTIVE')
      return 'Perspectiva: arrastra las cuatro esquinas de la obra.'
    if (framing === 'RECTANGLE')
      return 'Rectángulo: arrastra las esquinas, o el asa del centro para moverlo entero.'
    return 'Sin recorte: se guarda la fotografía entera.'
  }

  const rotated = rotatedSize(natural, rotation)
  const fit = fitInside(rotated, box)

  /**
   * The pan, kept so that some of the photograph is always on the surface.
   *
   * Half its size of slack on each side: enough to bring a corner of the artwork to
   * the middle of the screen —which is the point of panning, since a corner can sit
   * outside the photograph— and not enough to lose the photograph off the edge.
   */
  const clampPan = useCallback(
    (next: { zoom: number; x: number; y: number }) => {
      const width = fit.width * next.zoom
      const height = fit.height * next.zoom
      const slackX = Math.max(box.width, width) / 2
      const slackY = Math.max(box.height, height) / 2
      return {
        zoom: next.zoom,
        x: Math.max(-slackX, Math.min(slackX, next.x)),
        y: Math.max(-slackY, Math.min(slackY, next.y)),
      }
    },
    [box.width, box.height, fit.width, fit.height],
  )

  /**
   * Zooms about a point of the working surface, so what is under the fingers —or under
   * the cursor— stays under them. Zooming about the centre instead makes the detail
   * being adjusted run away, which on a phone means chasing it with the pan.
   */
  const zoomAbout = useCallback(
    (factor: number, at: { x: number; y: number }) => {
      setView((current) => {
        const zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, current.zoom * factor))
        const ratio = zoom / current.zoom
        // Measured FROM THE CENTRE, because that is where `transform-origin` is — and
        // the centre of the area is the centre of the surface, since the area is
        // centred in it whatever the photograph's proportions. Using the raw surface
        // coordinate instead treats the top left as the origin, and the error scales
        // with the zoom: measured, a wheel zoom to 2.9× threw the corner being adjusted
        // to −459 px, well off screen.
        const from = { x: at.x - box.width / 2, y: at.y - box.height / 2 }
        return clampPan({
          zoom,
          x: from.x - (from.x - current.x) * ratio,
          y: from.y - (from.y - current.y) * ratio,
        })
      })
    },
    [clampPan, box.width, box.height],
  )
  const ready = fit.width > 0 && fit.height > 0
  /**
   * What the header says was done — read from the very object that gets applied.
   *
   * Not from a literal built here, which is what it used to be and is how it came
   * to lie: that literal carried `rotation` and `crop` and forgot `corners`, so a
   * photograph whose four corners had been dragged, and that was neither turned nor
   * cropped, announced «Sin cambios» while the correction was on screen. One source
   * of truth for both, and the header cannot drift from what is stored again.
   */
  const summary = editSummary(editRef.current)

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

    // Measured against `rotated`, the photograph's own pixels, and not against `fit`,
    // which is where it is drawn: the two agree in proportion —`fitInside` keeps
    // it— but the corners are fractions of the rotated photograph, and taking the
    // proportion from the box on screen is one refactor away from taking it from the
    // `<img>`'s sides, which is exactly how the straightening came out skewed at 90°
    // and 270° once already.
    const straightened = straightenedSize(corners, rotated)
    const wide = straightened.width * fit.width
    const tall = straightened.height * fit.height
    if (wide <= 0 || tall <= 0) return null
    // A quarter of the working surface, so it informs without covering the photo.
    const scale = Math.min(1, Math.min(box.width, box.height) / 3 / Math.max(wide, tall))
    const width = Math.max(1, Math.round(wide * scale))
    const height = Math.max(1, Math.round(tall * scale))

    // From screen pixels of the ROTATED photograph to the unit square, through the
    // inverse, and out to the pixels of the preview box. Always the rotated frame,
    // because that is the space the corners are fractions of — normalizing by the
    // `<img>` element's own sides instead swapped them on a quarter turn.
    const sx = fit.width
    const sy = fit.height
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

    /**
     * The turn, composed BEFORE the homography.
     *
     * What the preview draws is the photograph as it was decoded, while the corners
     * live over the turned one — so without this the panel showed the artwork in its
     * original orientation while the screen showed it turned, and at 90 and 270 the
     * homography was also being fed sides that did not match. Written as a turn about
     * the top left corner —the element's `transform-origin`— plus the shift that puts
     * the result back inside the frame, which for a quarter turn is exactly one side.
     */
    const spin =
      rotation === 90
        ? ` translate(${fit.width}px, 0px) rotate(90deg)`
        : rotation === 180
          ? ` translate(${fit.width}px, ${fit.height}px) rotate(180deg)`
          : rotation === 270
            ? ` translate(0px, ${fit.height}px) rotate(270deg)`
            : ''
    return { width, height, transform: `${homographyToCssMatrix(matrix)}${spin}` }
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
  const cornerAim = !magnified
    ? null
    : corners
      ? corners[magnified]
      : crop
        ? cornerPoint(clampCrop(crop), magnified)
        : null
  /**
   * With the eyedropper armed the loupe follows the finger instead of a corner, and it
   * shows the RAW pixels: the grey has to be aimed at the light of the room and not at the
   * correction already applied, or every second pick would undo part of the previous one.
   * The rule is `loupeTables`', which `paintLoupe` asks for the mode.
   */
  const picking = eyedropper && aim !== null
  const aimed = picking ? aim : cornerAim
  const loupeMode: LoupeMode = picking ? 'EYEDROPPER' : 'FRAMING'

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
  /**
   * Every pointer down on the working surface, recorded in the CAPTURE phase.
   *
   * The capture phase is the whole point and not a detail. A handle claims its gesture
   * by stopping the event, so a finger landing on one never reached this bookkeeping:
   * the surface counted one pointer while the hand had two, the count never got to two,
   * and the rule that gives the pinch precedence could not fire. That is exactly the
   * zoom near a corner that dragged the corner instead of zooming.
   *
   * Two fingers WIN over any handle drag in progress: the second finger landing means
   * the intent changed, and finishing the handle drag while the photograph moves under
   * it would leave the corner somewhere nobody chose.
   */
  const touchesRef = useRef(new Map<number, { x: number; y: number }>())
  const pinchRef = useRef<{ distance: number; centre: { x: number; y: number } } | null>(null)
  /**
   * One gesture step per frame.
   *
   * Two fingers produce two separate `pointermove` events, so reading the pinch on each
   * of them measures one finger's new position against the other's old one. Measured
   * with a synthetic two-finger pan —where the distance never changes— the zoom went
   * 5.30 → 9.5 → 4.44 in a single gesture: pure jitter, and it would be felt on a real
   * hand. Coalescing to a frame means both positions are fresh before anything moves.
   */
  const pinchFrameRef = useRef<number | null>(null)

  /**
   * The pan in progress: ONE pointer dragging, whatever it is made of.
   *
   * One finger and the mouse do the same thing here, and that is deliberate. Reserving
   * the pan for two fingers left the single finger doing nothing over most of the
   * photograph, and the mouse cannot make a pinch at all. So the plain drag carries the
   * pan on every device, anywhere that is not a handle — reaching the surface already
   * means nothing claimed the gesture, since `startDrag` and the preview panel stop the
   * event on the things that do.
   *
   * The pointer is captured, and that is not decoration: a pan that reaches the edge of
   * the surface —which is exactly what panning is for— would otherwise stop dead the
   * moment the finger or the cursor leaves it.
   */
  const panRef = useRef<{ pointer: number; x: number; y: number } | null>(null)

  /** Two fingers: the distance between them and their midpoint, in surface pixels. */
  function pinchOf(frame: DOMRect) {
    const points = [...touchesRef.current.values()]
    if (points.length < 2) return null
    const [a, b] = points as [{ x: number; y: number }, { x: number; y: number }]
    return {
      distance: Math.hypot(a.x - b.x, a.y - b.y),
      centre: { x: (a.x + b.x) / 2 - frame.left, y: (a.y + b.y) / 2 - frame.top },
    }
  }

  /**
   * Counts the pointers, and hands the gesture to the pinch as soon as there are two.
   *
   * Registered on the capture phase, so it runs BEFORE the handles and the preview
   * panel and sees every pointer even though those stop the event.
   */
  function trackPointer(e: React.PointerEvent) {
    touchesRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (touchesRef.current.size !== 2) return
    const frame = frameRef.current?.getBoundingClientRect()
    if (!frame) return
    // The gesture changed hands: whatever was being dragged or panned stops here.
    // `startRef` is cleared on the spot and not through the state, because the state
    // only lands on the next render and a move arriving before it would still drag the
    // corner — a corner that jumps as the second finger lands is the confusion this
    // rule exists to remove.
    setDragging(null)
    startRef.current = null
    panRef.current = null
    // And the pending tap of the eyedropper: two fingers are a pinch, and a grey sampled
    // where the second finger happened to land is a grey nobody chose.
    pickRef.current = null
    setAim(null)
    pinchRef.current = pinchOf(frame)
  }

  /** A cancelled pointer takes no sample: it is not a lift, it is the system taking over. */
  function onSurfacePointerCancel() {
    pickRef.current = null
    setAim(null)
  }

  /**
   * Starts the pan. Bubble phase on purpose: getting here means no handle and no panel
   * claimed the gesture, so the surface is free to take it.
   */
  function startPan(e: React.PointerEvent) {
    // Which button counts and what a second finger means are decided in `pickGesture.ts`
    // too, and not repeated here: two copies of a rule about pointers is how they drift.
    //
    // Aiming the eyedropper and sliding the photograph are MUTUALLY EXCLUSIVE, and that
    // exclusivity is a correction: the first design let a drag do both, which made aiming
    // impossible because moving towards the grey you want drags the picture out from under
    // the finger. Zooming and repositioning stay available through the pinch, so the mode
    // never has to be left to frame the shot. The rule itself lives in `pickGesture.ts`,
    // where it can be tested.
    const intent = pointerIntent({
      eyedropper,
      touches: touchesRef.current.size,
      pointerType: e.pointerType,
      button: e.button,
    })
    if (intent.aims) {
      pickRef.current = { pointer: e.pointerId }
      setAim(surfacePoint(e.clientX, e.clientY))
    }
    if (intent.pans) {
      panRef.current = { pointer: e.pointerId, x: e.clientX, y: e.clientY }
    }
    if (intent.aims || intent.pans) e.currentTarget.setPointerCapture(e.pointerId)
  }

  /**
   * The end of a gesture on the surface, which is where a tap of the eyedropper becomes a
   * sample.
   *
   * On the surface and not on `window` because the pointer is captured by it, so the lift
   * is retargeted here even when the finger leaves. What disqualifies a sample is a change
   * of intent — a second finger landed, so this was a pinch — or the mode being disarmed
   * mid-gesture. **How far the finger travelled does not disqualify anything**: sliding to
   * the grey you mean is the normal way to use this.
   */
  function onSurfacePointerUp(e: React.PointerEvent) {
    const pick = pickRef.current
    pickRef.current = null
    setAim(null)
    const takes = liftTakesSample({
      eyedropper,
      aiming: pick?.pointer === e.pointerId,
      pinching: pinchRef.current !== null,
      touches: touchesRef.current.size,
    })
    if (!takes) return
    const point = surfacePoint(e.clientX, e.clientY)
    if (point) pickAt(point)
  }

  function onSurfacePointerMove(e: React.PointerEvent) {
    // The loupe follows the finger while the eyedropper is armed, showing the RAW pixels:
    // the finger covers exactly the pixel being aimed at, and a grey that is already
    // corrected measures the correction and not the light of the room.
    const pick = pickRef.current
    if (pick && pick.pointer === e.pointerId) {
      setAim(surfacePoint(e.clientX, e.clientY))
    }
    const pan = panRef.current
    if (pan && e.pointerId === pan.pointer) {
      // Read from the event before handing anything to `setView`: the update runs
      // later and the deltas have to be the ones of THIS move.
      const dx = e.clientX - pan.x
      const dy = e.clientY - pan.y
      panRef.current = { pointer: pan.pointer, x: e.clientX, y: e.clientY }
      setView((state) => clampPan({ zoom: state.zoom, x: state.x + dx, y: state.y + dy }))
      return
    }
    if (!touchesRef.current.has(e.pointerId)) return
    touchesRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (!pinchRef.current) return
    e.preventDefault()
    if (pinchFrameRef.current !== null) return
    pinchFrameRef.current = requestAnimationFrame(() => {
      pinchFrameRef.current = null
      const frame = frameRef.current?.getBoundingClientRect()
      const previous = pinchRef.current
      const current = frame ? pinchOf(frame) : null
      if (!previous || !current || previous.distance === 0) return
      // Pinch and two-finger pan are the same gesture read two ways: how much the
      // distance changed is the zoom, how much the midpoint moved is the pan.
      setView((state) =>
        clampPan({
          zoom: state.zoom,
          x: state.x + (current.centre.x - previous.centre.x),
          y: state.y + (current.centre.y - previous.centre.y),
        }),
      )
      zoomAbout(current.distance / previous.distance, current.centre)
      pinchRef.current = current
    })
  }

  /**
   * The end of a pointer, heard on `window` and not on the surface.
   *
   * On the surface it is missed whenever the finger lifts outside it —over the buttons,
   * past the edge of the screen— and a pointer left in the map counts forever: from
   * then on every gesture would look like a pinch and no handle would move again for
   * the rest of the session. Refs only, so it registers once.
   */
  useEffect(() => {
    const end = (e: PointerEvent) => {
      touchesRef.current.delete(e.pointerId)
      if (panRef.current?.pointer === e.pointerId) panRef.current = null
      if (touchesRef.current.size >= 2) return
      pinchRef.current = null
      if (pinchFrameRef.current !== null) {
        cancelAnimationFrame(pinchFrameRef.current)
        pinchFrameRef.current = null
      }
      // One finger left of a pinch: it takes the pan over from where it IS, so lifting
      // one finger neither stops the gesture dead nor makes the photograph jump.
      const [remaining] = [...touchesRef.current.entries()]
      if (remaining) panRef.current = { pointer: remaining[0], ...remaining[1] }
    }
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
    return () => {
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
    }
  }, [])

  /**
   * The wheel zooms, which is what a mouse and a trackpad both do here. `passive:
   * false` is not available on a React handler, so the listener is registered by hand
   * below — without it the browser scrolls the page behind the editor.
   */
  useEffect(() => {
    const node = frameRef.current
    if (!node) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const frame = node.getBoundingClientRect()
      zoomAbout(Math.exp(-e.deltaY * WHEEL_TO_ZOOM), {
        x: e.clientX - frame.left,
        y: e.clientY - frame.top,
      })
    }
    node.addEventListener('wheel', onWheel, { passive: false })
    return () => node.removeEventListener('wheel', onWheel)
  }, [zoomAbout])

  /** Back to the whole photograph, which is where a double tap lands. */
  function resetView() {
    setView({ zoom: 1, x: 0, y: 0 })
  }

  /** Drag of the preview panel itself, in progress. */
  const previewDragRef = useRef<{ pointer: number; dx: number; dy: number } | null>(null)

  const previewPlacement: React.CSSProperties = (() => {
    // Parked by hand: it stays where it was left, clamped into the surface so a
    // resize —turning the phone— cannot leave it off screen.
    if (previewSpot && preview) {
      return {
        left: `${Math.max(0, Math.min(box.width - preview.width, previewSpot.x))}px`,
        top: `${Math.max(0, Math.min(box.height - preview.height, previewSpot.y))}px`,
      }
    }
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
    if (!aimed || !canvas || !image) return
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
        // Divided by the zoom as well: what is on screen is already magnified by it,
        // and the loupe promises three times WHAT IS ON SCREEN.
        sourceSide: (LOUPE_SIDE / LOUPE_ZOOM) * (rotated.width / (fit.width * view.zoom)),
        // The same tables the surface is showing through its SVG filter, so the magnifier
        // and the photograph are the same photograph — except with the eyedropper, where
        // `loupeTables` refuses them on purpose.
        luts,
        mode: loupeMode,
      })
    })
    return () => cancelAnimationFrame(handle)
    // `aimed.x` and `aimed.y` and not `aimed`: the object is new on every render,
    // and depending on it would repaint even when the point has not moved. What has
    // to trigger a repaint is the point changing, which in perspective mode is the
    // only thing that changes — the crop stays still, and depending on IT was the
    // bug.
  }, [aimed?.x, aimed?.y, rotation, natural, rotated.width, fit.width, view.zoom, luts, loupeMode])

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Girar y recortar la fotografía ${title}`}
      className="fixed inset-0 z-50 flex flex-col bg-black"
    >
      {/* The header: the close, the title, the summary and the two ways into the panels.
          Two round 44 px targets where a 44 px target already lives, so they cost no
          vertical room at all — which is the whole reason they are here and not in the
          footer, where the row of tools already fills 308 of the 336 usable pixels of a
          360 px phone. Everything textual truncates instead of wrapping: a header that
          grows a second line is exactly the space this arrangement was chosen to save. */}
      <div className="flex items-center gap-2 p-3 text-white">
        <button
          type="button"
          aria-label="Cerrar sin aplicar"
          onClick={() => close(false)}
          className="flex min-h-touch min-w-[2.75rem] shrink-0 items-center justify-center rounded-full bg-white/10"
        >
          <NoIcon className="h-5 w-5" />
        </button>
        <p className="min-w-0 flex-1 truncate text-sm text-stone-300">{title}</p>
        <p aria-live="polite" className="min-w-0 max-w-[8rem] shrink truncate text-xs text-stone-400">
          {summary ?? 'Sin cambios'}
        </p>
        <button
          type="button"
          aria-pressed={panel === 'COLOR'}
          aria-label="Ajuste de color"
          title="Ajuste de color"
          onClick={() => {
            // Opening the panel is what «revisar el color» means, and it is recorded even
            // if nothing is touched: «sin revisar» no es «no». Only when the adjustment is
            // actually on offer — a reproduction from another catalog was not reviewed by
            // reading why it cannot be.
            if (availability.available) reviewedRef.current = true
            setPanel((current) => (current === 'COLOR' ? 'TOOLS' : 'COLOR'))
          }}
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${
            panel === 'COLOR' ? 'bg-white text-stone-900' : 'bg-white/10'
          } ${isNoColor(color) ? '' : 'ring-2 ring-amber-300'}`}
        >
          <ColorIcon className="h-5 w-5" />
        </button>
        <button
          type="button"
          aria-pressed={panel === 'DATA'}
          aria-label="Datos de la fotografía"
          title="Datos de la fotografía"
          onClick={() => setPanel((current) => (current === 'DATA' ? 'TOOLS' : 'DATA'))}
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${
            panel === 'DATA' ? 'bg-white text-stone-900' : 'bg-white/10'
          }`}
        >
          <DataIcon className="h-5 w-5" />
        </button>
      </div>

      {/* The preview of the colour: an inline `<filter>` with the 256 entries of the same
          lookup table the export applies, and NOT `ctx.filter`, which is a silent no-op on
          old WebKit while the declared target is phones from 2020 on.
          `color-interpolation-filters="sRGB"` is mandatory and its absence is the silent
          failure number one of this feature — by default a filter interpolates in linear
          light, and a table indexed by 8-bit sRGB codes applied to linearized values is a
          different curve, wrong precisely in the shadows, precisely where the black point
          works. The value comes from `colorSvgTables` so that it cannot be forgotten here.
          It lives OUTSIDE `frameRef`: that element carries a non-passive wheel listener and
          counts pointers in the capture phase. */}
      <svg
        aria-hidden
        focusable="false"
        className="pointer-events-none absolute h-0 w-0 overflow-hidden"
      >
        <filter
          id={filterId}
          colorInterpolationFilters={svgTables.colorInterpolationFilters}
          x="0"
          y="0"
          width="100%"
          height="100%"
        >
          <feComponentTransfer>
            <feFuncR ref={funcR} type="table" tableValues={svgTables.r} />
            <feFuncG ref={funcG} type="table" tableValues={svgTables.g} />
            <feFuncB ref={funcB} type="table" tableValues={svgTables.b} />
          </feComponentTransfer>
          {/* Black and white is the one step that is not per channel, so it cannot live in
              the tables: it comes after them, and it carries the OPPOSITE interpolation
              space on purpose — in `linearRGB` the browser linearizes, applies the matrix
              and encodes back, which is exactly Rec. 709 luminance in linear light, the
              same thing `grayFromRgb` computes by hand. It is a switch and not a strip, so
              it is committed at once and React renders it; the hand-written preview only
              ever touches the three tables. */}
          {svgTables.grayMatrix && (
            <feColorMatrix
              type="matrix"
              values={svgTables.grayMatrix.values}
              colorInterpolationFilters={svgTables.grayMatrix.colorInterpolationFilters}
            />
          )}
        </filter>
      </svg>

      {/* Working surface. `touch-none` on the whole area: the editor covers the
          screen and nothing here should scroll or zoom the page underneath.
          `select-none` and the grabbing cursor are for the mouse pan: without the
          first, a drag paints a text selection over the photograph — and the pointer
          down is deliberately NOT default-prevented, because that also suppresses the
          double click that goes back to the whole photograph. */}
      <div
        ref={frameRef}
        onPointerDownCapture={trackPointer}
        onPointerDown={startPan}
        onPointerMove={onSurfacePointerMove}
        onPointerUp={onSurfacePointerUp}
        onPointerCancel={onSurfacePointerCancel}
        onDoubleClick={resetView}
        className="relative min-h-0 flex-1 cursor-grab touch-none select-none overflow-hidden active:cursor-grabbing"
      >
        {url && (
          <div
            ref={areaRef}
            className="absolute"
            style={{
              left: `${(box.width - fit.width) / 2}px`,
              top: `${(box.height - fit.height) / 2}px`,
              width: `${fit.width}px`,
              height: `${fit.height}px`,
              // Zoom and pan of the surface. On the AREA and not on the image, so the
              // handles travel with the photograph and `getBoundingClientRect()` keeps
              // answering the transformed rectangle the pointer arithmetic expects.
              transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})`,
              transformOrigin: 'center center',
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
                // Not decoration, and the same trap as in the preview panel: the CSS
                // preflight sets `img { max-width: 100% }`, and after a quarter turn
                // the width asked for is the LONG side while the box around it is the
                // short one — so the browser clipped the width and left the height,
                // and a 4:3 photograph was drawn square. Measured: 720×540 asked,
                // 540×540 drawn. The photo looked squashed by a quarter, the
                // suggested quadrilateral no longer sat on the painting —its corners
                // were right, the image under them was not— and the loupe, which
                // reads the intrinsic pixels and ignores the CSS size, disagreed with
                // the screen. One cause, three symptoms.
                maxWidth: 'none',
                maxHeight: 'none',
                transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
                // On the image and NEVER on the area the handles live in: there it would
                // tint the handles and the polygon, and `filter` creates a stacking
                // context that would break the z-10/z-20 arbitration between the loupe,
                // the preview panel and the handles.
                filter: colorFilter ? `url(#${filterId})` : undefined,
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
                    className="absolute z-20 flex h-11 w-11 touch-none select-none items-center justify-center"
                    style={{
                      left: `${corners[corner].x * 100}%`,
                      top: `${corners[corner].y * 100}%`,
                      // Counter-scaled: the handle keeps its size on screen while the
                      // photograph grows under it. A 44 px target that becomes 350 px
                      // at 8× would cover the corner it is meant to place.
                      transform: `translate(-50%, -50%) scale(${1 / view.zoom})`,
                    }}
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

                {/* The rectangle itself is only drawn: a drag inside it pans the
                    photograph, like anywhere else on the surface. That is where the
                    pan is needed most —zoomed on a corner the rectangle covers the
                    whole screen and there is no free background left to grab— and what
                    moves the frame is the handle in the middle. */}
                <div
                  aria-hidden
                  className="pointer-events-none absolute border-white/90 shadow-[0_0_0_1px_rgba(0,0,0,0.6)]"
                  style={{
                    left: `${crop.x * 100}%`,
                    top: `${crop.y * 100}%`,
                    width: `${crop.width * 100}%`,
                    height: `${crop.height * 100}%`,
                    // In surface pixels, not scaled: a two-pixel line at 8× would be
                    // a sixteen-pixel band hiding the border it marks.
                    borderWidth: `${2 / view.zoom}px`,
                  }}
                />

                {/* The handle in the middle, which moves the whole rectangle. It is
                    drawn BEFORE the corners on purpose: with the same z-index the
                    later element wins the gesture where they overlap, and on a small
                    crop the corners have to keep winning — they are the finer
                    adjustment, and the middle one is reachable anywhere inside. */}
                <span
                  role="button"
                  tabIndex={0}
                  aria-label="Mover el recorte"
                  onPointerDown={(e) => startDrag(e, 'move')}
                  onKeyDown={onMoveKeyDown}
                  onContextMenu={(e) => e.preventDefault()}
                  className="absolute z-20 flex h-11 w-11 touch-none select-none items-center justify-center"
                  style={{
                    left: `${(crop.x + crop.width / 2) * 100}%`,
                    top: `${(crop.y + crop.height / 2) * 100}%`,
                    transform: `translate(-50%, -50%) scale(${1 / view.zoom})`,
                  }}
                >
                  <span
                    aria-hidden
                    className={`flex items-center justify-center rounded-full border-2 border-stone-900 bg-white text-stone-900 ${
                      dragging === 'move' ? 'h-8 w-8' : 'h-7 w-7'
                    }`}
                  >
                    <MoveIcon className="h-4 w-4" />
                  </span>
                </span>

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
                      className="absolute z-20 flex h-11 w-11 touch-none select-none items-center justify-center"
                      style={{
                        left: `${point.x * 100}%`,
                        top: `${point.y * 100}%`,
                        transform: `translate(-50%, -50%) scale(${1 / view.zoom})`,
                      }}
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

            {/* The grey targets that were found, drawn and nothing more: the detection
                never applies anything by itself (RF-418), it points and offers, and what
                accepts one is a button in the panel. Drawn LAST inside the area so it
                paints over the dimming of the crop, and `pointer-events-none` so it cannot
                take a gesture from a handle or from the pan. The boxes are measured on the
                unrotated raster and travel here through `rotateCrop`, the same function
                that turns the crop with its photograph. */}
            {ready &&
              candidates.map((candidate, index) => {
                const box = rotateCrop(candidate.box, rotation)
                return (
                  <div
                    key={`target-${candidate.axis}-${index}`}
                    aria-hidden
                    className="pointer-events-none absolute border-2 border-amber-300"
                    style={{
                      left: `${box.x * 100}%`,
                      top: `${box.y * 100}%`,
                      width: `${box.width * 100}%`,
                      height: `${box.height * 100}%`,
                      // In surface pixels and not scaled, for the same reason as the crop
                      // rectangle: a two-pixel line at 8× would be a sixteen-pixel band
                      // hiding the patch it marks.
                      borderWidth: `${2 / view.zoom}px`,
                      boxShadow: '0 0 0 1px rgba(0,0,0,0.6)',
                    }}
                  >
                    <span
                      className="absolute left-0 top-0 rounded bg-amber-300 px-1 text-[0.625rem] font-medium text-stone-900"
                      // Counter-scaled and pushed above the box, so the number keeps its
                      // size on screen while the photograph grows under it.
                      style={{
                        transform: `translateY(-110%) scale(${1 / view.zoom})`,
                        transformOrigin: 'bottom left',
                      }}
                    >
                      {index + 1}
                    </span>
                  </div>
                )
              })}
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
            role="button"
            tabIndex={-1}
            aria-label="Mover la vista previa del resultado"
            onPointerDown={startPreviewDrag}
            onContextMenu={(e) => e.preventDefault()}
            // Interactive, so it takes pointer events — and the handles sit above it
            // (z-20), so where the two overlap the handle still wins the gesture. That
            // ordering is what makes this safe to make draggable at all.
            className="absolute z-10 cursor-grab touch-none overflow-hidden rounded-lg border border-white/40 bg-white shadow-lg active:cursor-grabbing"
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
                // The straightened preview gets the same filter as the surface: it is the
                // same photograph, and the incident where it did not turn with the
                // photograph is the precedent for keeping the two in step.
                filter: colorFilter ? `url(#${filterId})` : undefined,
              }}
            />
          </div>
        )}

        {/* The loupe. `pointer-events-none` so it cannot steal the gesture, and
            `aria-hidden` because it says nothing new: it is the same corner,
            bigger. It lives outside the image area, anchored to the working
            surface, so its placement does not depend on where the photo fits. */}
        {aimed && ready && (
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

      {/* Controls at the bottom, within reach of the thumb — and centred as one
          block. The width is capped at the phone the editor is designed for, so on a
          laptop the row of tools does not drift to one edge while «Aplicar» stretches
          to the other: the controls stay together under the middle of the photograph,
          which is where the eye already is. On a phone the cap is wider than the
          screen and nothing changes. */}
      <div
        className="mx-auto w-full max-w-md space-y-2 p-3"
        style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
      >
        {note && (
          <p className="rounded-lg bg-amber-100 p-2 text-xs text-amber-900">{note}</p>
        )}

        {/* The three states of the foot (§7). The colour controls and the data of the
            photograph EXCHANGE places with the row of tools instead of floating over the
            artwork: a balance of whites is judged looking at the whole surface, and a panel
            on top of it would collide with the loupe, which lands in the corner opposite
            the finger. «Cancelar» and «Aplicar» stay put in all three, because leaving is
            never a mode. */}
        {panel === 'COLOR' ? (
          <ColorControls
            edit={editRef.current}
            shotType={shotType}
            availability={availability}
            raster={rasterRef.current}
            rasterState={rasterState}
            generalColor={generalColor}
            isGeneralShot={shotType === 'GENERAL'}
            eyedropper={eyedropper}
            pickNotice={pickNotice}
            candidates={candidates}
            onCandidates={setCandidates}
            onEyedropper={(armed) => {
              setEyedropper(armed)
              if (!armed) setAim(null)
              setPickNotice(null)
            }}
            onClearPickNotice={() => setPickNotice(null)}
            onPreview={previewColor}
            onColorChange={commitColor}
            onClose={() => setPanel('TOOLS')}
          />
        ) : panel === 'DATA' ? (
          <PhotoDataPanel
            exif={exif ?? null}
            loading={exif === undefined}
            canRestoreOriginal={canRestoreOriginal}
            // The size from the decoder, which is the only source that has already been
            // through the EXIF orientation, and the weight of the very Blob in hand.
            original={{ width: natural.width, height: natural.height, bytes: source.size }}
            recordPhotoDate={recordPhotoDate}
            onClose={() => setPanel('TOOLS')}
          />
        ) : (
          <>
          {/* Every tool in one row of 44 px targets, and not a label in sight.
              Drawings instead of words is what makes it fit: as labelled buttons the two
              turns alone took a row of three lines each on a phone. What names them is
              the help line underneath, which always starts with the framing that is
              selected — an icon that is never spelled out anywhere is a guess. */}
          <div className="flex items-center justify-center gap-2">
            {/* The two turns share a box, like the framing does: they are one pair —
                the same thing in two directions— and grouped they read as a pair
                instead of as two unrelated icons. */}
            <div role="group" aria-label="Girar" className="flex shrink-0 gap-1 rounded-lg bg-white/10 p-1">
              <button
                type="button"
                aria-label="Rotar a la izquierda"
                title="Rotar a la izquierda"
                onClick={() => rotate(-90)}
                className="btn h-11 w-11 rounded-md p-0 text-white active:bg-white/20"
              >
                <RotateLeftIcon className="h-6 w-6" />
              </button>
              <button
                type="button"
                aria-label="Rotar a la derecha"
                title="Rotar a la derecha"
                onClick={() => rotate(90)}
                className="btn h-11 w-11 rounded-md p-0 text-white active:bg-white/20"
              >
                <RotateRightIcon className="h-6 w-6" />
              </button>
            </div>

            {/* A track with a thumb, and not three buttons in a row: the white fill
                inside the track reads as «this one is selected», while the same fill
                standing alone would read as «this is the main action» — which is what
                made three white buttons compete on one screen. */}
            <div
              role="group"
              aria-label="Encuadre"
              className="flex shrink-0 gap-1 rounded-lg bg-white/10 p-1"
            >
              {FRAMINGS.map(({ value, label, Icon }) => (
                <button
                  key={value}
                  type="button"
                  // Straightening cannot be expressed over the consultation copy, so the
                  // segment is disabled there with the reason underneath.
                  disabled={!ready || (value === 'PERSPECTIVE' && !canRestoreOriginal)}
                  aria-pressed={framing === value}
                  aria-label={label}
                  title={label}
                  aria-describedby="editor-help"
                  onClick={() => setFraming(value)}
                  className={`btn h-11 w-11 rounded-md p-0 disabled:opacity-40 ${
                    framing === value ? 'bg-white text-stone-900' : 'text-stone-300'
                  }`}
                >
                  <Icon className="h-6 w-6" />
                </button>
              ))}
            </div>

            <button
              type="button"
              disabled={!ready || analysis.status === 'working' || !suggestionMakesSense}
              aria-label={analysis.status === 'working' ? 'Analizando la fotografía…' : 'Sugerir recorte'}
              title={analysis.status === 'working' ? 'Analizando la fotografía…' : 'Sugerir recorte'}
              aria-describedby="editor-help"
              onClick={() => void suggest()}
              className={`btn h-11 w-11 shrink-0 bg-white/10 p-0 text-white disabled:opacity-40 ${
                analysis.status === 'working' ? 'animate-pulse' : ''
              }`}
            >
              <WandIcon className="h-6 w-6" />
            </button>
          </div>

          <div className="space-y-2">

            {/* With two candidates the cataloger picks: in a catalogue raisonné the
                work is usually the canvas, but the frame can be part of the piece
                and only she can tell. */}
            {/* The same track and thumb as the framing, because it is the same kind of
                thing: a state being chosen, not an action being fired. */}
            {analysis.status === 'found' && analysis.suggestion.inner && (
              <div
                role="group"
                aria-label="Hasta dónde recortar"
                className="grid grid-cols-2 gap-1 rounded-lg bg-white/10 p-1"
              >
                {([
                  { value: 'outer', label: 'Hasta el marco' },
                  { value: 'inner', label: 'Solo la obra' },
                ] as const).map(({ value, label }) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={analysis.choice === value}
                    onClick={() => choose(value)}
                    className={`btn min-h-touch rounded-md px-1 text-sm ${
                      analysis.choice === value ? 'bg-white text-stone-900' : 'text-stone-300'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}

            {/* Putting back what a suggestion replaced: inline and only while there is
                something to put back. As a permanent button it sat disabled almost
                always, spending half a row on an action that belongs to the seconds
                right after a suggestion lands. */}
            {replaced && (
              <button
                type="button"
                onClick={discardSuggestion}
                className="btn min-h-touch w-full text-sm text-stone-300 underline underline-offset-4"
              >
                Deshacer la sugerencia
              </button>
            )}

            <p id="editor-help" role="status" aria-live="polite" className="text-center text-xs text-stone-400">
              {helpText()}
            </p>
          </div>

          {/* Back to square one: the framing is data, not a cut, so the original frame
              can be recovered whenever — today or in a year — and the crop redone from
              scratch. That is what makes cropping a safe decision, and why it gets a row
              of its own instead of the ghost button it used to be, squeezed between two
              paragraphs of help. Amber and not white: it weighs like a main action, but
              white is «Aplicar», the only thing that confirms and closes.

              It only appears when there IS a turn to undo, and that is the whole point:
              it clears the turn and the framing, while «Sin recorte» clears the framing,
              so with no turn applied the two did letter for letter the same thing —
              `setCrop(null); setCorners(null)`— and the loudest control in the footer
              was a duplicate of a segment sitting right above it. With no turn, the way
              back to the original IS the first segment of the selector.

              The exception is the consultation copy, where it shows disabled: there it
              is not an action but an explanation, and the reason is in the help line.
              An action that is simply missing leaves the cataloger wondering whether
              the crop is final.

              The colour joins it, and that widens both halves of the rule: the button now
              appears when there is a turn OR an adjustment of colour to undo, and it clears
              the colour along with the two. The framing and the colour are the same kind of
              thing — parameters absolute over an untouched master — so one control puts the
              photograph back as it came out of the camera, and there is no way to end up
              with a rectangle undone and a temperature nobody remembers setting.

              What it does NOT clear is the trace: a colour that had been looked at keeps
              `REVIEWED_UNCHANGED`, because going back to the original undoes the numbers and
              not the fact that she looked. «Sin revisar» no es «no». */}
          {(rotation !== 0 || !isNoColor(color) || !canRestoreOriginal) && (
            <button
              type="button"
              disabled={!canRestoreOriginal}
              aria-describedby="editor-help"
              onClick={() => {
                setRotation(0)
                setCrop(null)
                setCorners(null)
                commitColor(reviewedColor(null, color.source != null))
              }}
              className="btn min-h-touch w-full border border-amber-400/70 bg-amber-400/10 text-sm text-amber-200 disabled:opacity-40"
            >
              <RevertIcon className="h-5 w-5" />
              Volver al original
            </button>
          )}
          </>
        )}

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
