import { useEffect, useRef, useState } from 'react'
import { SHOT_TYPE_LABEL } from '../../lib/types'
import { YesIcon } from '../../components/ui'
import { moveItem } from '../../lib/reorder'
import type { ImageRow } from './artworkImages'

/** Hold before a thumbnail is picked up. Below this, a tap is just a tap. */
const HOLD_MS = 300
/** Movement that cancels the hold: the finger is scrolling the page, not dragging. */
const SLOP = 10

/**
 * Grid of thumbnails that can be rearranged by dragging (RF-401).
 *
 * Pointer events instead of the HTML5 drag-and-drop API, which does not exist
 * on a touch screen — and the phone is the primary device. A thumbnail is
 * picked up by HOLDING it: the page scrolls vertically, so a drag that started
 * on contact would make the grid unscrollable. Any movement before the hold
 * elapses cancels the pickup and the scroll proceeds untouched.
 *
 * While dragging, the order rearranges live under the finger and is reported
 * only on release: `onReorder` is a write to the database and must not fire
 * once per pixel.
 */
export function ReorderableThumbnails({
  images,
  thumbUrls,
  mainId,
  selectedId,
  onSelect,
  onReorder,
  disabled = false,
}: {
  images: ImageRow[]
  thumbUrls: Record<string, string>
  mainId: string | null
  selectedId: string | null
  onSelect: (imageId: string) => void
  /** The final order, on release. Receives image ids, first to last. */
  onReorder: (imageIds: string[]) => void
  disabled?: boolean
}) {
  const [order, setOrder] = useState<string[]>(() => images.map((i) => i.image_id))
  const [draggingId, setDraggingId] = useState<string | null>(null)

  const holdRef = useRef<number | null>(null)
  const startRef = useRef<{ x: number; y: number } | null>(null)
  const draggedRef = useRef(false)
  // The order as of the last render, for the release handler: reading it from
  // a closure would risk reporting a position behind the finger.
  const orderRef = useRef(order)
  orderRef.current = order

  // A photo added or retired elsewhere (Realtime) resyncs the order — except
  // while a finger holds it, because yanking the grid mid-drag would drop the
  // thumbnail somewhere nobody chose.
  const serverOrder = images.map((i) => i.image_id).join(',')
  useEffect(() => {
    if (draggingId) return
    setOrder(serverOrder === '' ? [] : serverOrder.split(','))
  }, [serverOrder, draggingId])

  function cancelHold() {
    if (holdRef.current !== null) window.clearTimeout(holdRef.current)
    holdRef.current = null
  }

  useEffect(() => cancelHold, [])

  function onPointerDown(e: React.PointerEvent<HTMLElement>, imageId: string) {
    if (disabled || images.length < 2) return
    // currentTarget and pointerId are only valid during dispatch: taken now,
    // used inside the timeout.
    const tile = e.currentTarget
    const pointerId = e.pointerId
    startRef.current = { x: e.clientX, y: e.clientY }
    draggedRef.current = false
    holdRef.current = window.setTimeout(() => {
      // Capture so the moves keep arriving even when the finger leaves the
      // tile — which is the whole point of dragging it elsewhere.
      try {
        tile.setPointerCapture(pointerId)
      } catch {
        /* the pointer is gone: the release handler cleans up */
      }
      setDraggingId(imageId)
    }, HOLD_MS)
  }

  function onPointerMove(e: React.PointerEvent<HTMLElement>) {
    const start = startRef.current
    if (!draggingId) {
      if (
        start &&
        (Math.abs(e.clientX - start.x) > SLOP || Math.abs(e.clientY - start.y) > SLOP)
      ) {
        cancelHold()
      }
      return
    }
    const over = document
      .elementFromPoint(e.clientX, e.clientY)
      ?.closest('[data-image-id]')
      ?.getAttribute('data-image-id')
    if (!over || over === draggingId) return
    draggedRef.current = true
    setOrder((current) => moveItem(current, current.indexOf(draggingId), current.indexOf(over)))
  }

  function onPointerUp() {
    cancelHold()
    startRef.current = null
    if (!draggingId) return
    setDraggingId(null)
    if (draggedRef.current) onReorder([...orderRef.current])
  }

  function onPointerCancel() {
    cancelHold()
    startRef.current = null
    if (!draggingId) return
    setDraggingId(null)
    // The gesture was interrupted (a system notification, another finger):
    // back to the server order rather than half a rearrangement.
    setOrder(images.map((i) => i.image_id))
  }

  const byId = new Map(images.map((i) => [i.image_id, i]))

  return (
    <div>
      <ul
        // touch-action only while dragging: the rest of the time the grid must
        // scroll with the page like any other content.
        className={`grid grid-cols-3 gap-2 ${draggingId ? 'touch-none select-none' : ''}`}
      >
        {order.flatMap((imageId, position) => {
          const image = byId.get(imageId)
          if (!image) return []
          const isMain = imageId === mainId
          const isDragging = imageId === draggingId
          return [
            <li key={imageId}>
              <button
                type="button"
                data-image-id={imageId}
                aria-label={`${SHOT_TYPE_LABEL[image.shot_type]}, posición ${position + 1} de ${order.length}${isMain ? ', imagen principal' : ''}`}
                aria-pressed={imageId === selectedId}
                onPointerDown={(e) => onPointerDown(e, imageId)}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerCancel}
                // A long press must not raise the system menu on top of the drag.
                onContextMenu={(e) => e.preventDefault()}
                onClick={() => {
                  if (!draggedRef.current) onSelect(imageId)
                  draggedRef.current = false
                }}
                className={`relative block w-full overflow-hidden rounded-lg border-2 transition ${
                  isDragging
                    ? 'z-10 scale-105 border-stone-800 opacity-90 shadow-lg'
                    : imageId === selectedId
                      ? 'border-stone-800'
                      : 'border-stone-200'
                }`}
              >
                {thumbUrls[imageId] ? (
                  <img
                    src={thumbUrls[imageId]}
                    alt=""
                    className="aspect-square w-full object-cover"
                  />
                ) : (
                  <span className="flex aspect-square w-full items-center justify-center bg-stone-100 text-[10px] text-stone-500">
                    sin vista
                  </span>
                )}

                {/* The position is written on the thumbnail: after a drag, the
                    order must be readable without counting tiles. */}
                <span className="absolute bottom-1 right-1 rounded bg-stone-900/85 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-white">
                  {position + 1}
                </span>
                {isMain && (
                  <span
                    className="absolute left-1 top-1 rounded-full bg-stone-900/85 p-0.5 text-white"
                    title="Imagen principal"
                  >
                    <YesIcon className="h-3 w-3" />
                  </span>
                )}
                {image.shot_type !== 'GENERAL' && (
                  <span className="absolute bottom-1 left-1 rounded bg-stone-900/85 px-1.5 py-0.5 text-[10px] text-white">
                    {SHOT_TYPE_LABEL[image.shot_type]}
                  </span>
                )}
              </button>
            </li>,
          ]
        })}
      </ul>

      {images.length > 1 && (
        <p className="mt-2 text-xs text-stone-500">
          {draggingId
            ? 'Arrastra la fotografía a su sitio y suelta.'
            : 'Mantén pulsada una fotografía para cambiarla de orden.'}
        </p>
      )}
    </div>
  )
}
