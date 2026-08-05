import { useEffect, useRef, useState } from 'react'
import { SHOT_TYPE_LABEL } from '../../lib/types'
import { GripIcon, YesIcon } from '../../components/ui'
import type { ImageRow } from './artworkImages'

/**
 * Grid of thumbnails rearranged by dragging (RF-401).
 *
 * Three decisions, each from a dead end that did not work on a phone — the
 * primary device:
 *
 *  1. The drag starts from a HANDLE with `touch-action: none`, not from the
 *     thumbnail. The HTML drag-and-drop API does not exist on touch, and
 *     picking the thumbnail up by holding it cannot work: `touch-action` is
 *     evaluated when the touch STARTS, so setting it once the hold elapses
 *     arrives too late — the browser already claimed the gesture as a scroll
 *     and sends pointercancel. Setting it beforehand on every thumbnail would
 *     make the grid impossible to scroll past.
 *  2. The listeners live on `window`, not on the handle: a drag that leaves
 *     the element must keep being heard.
 *  3. The grid does NOT rearrange while dragging; the target tile is marked
 *     instead. Reordering mid-drag moves the DOM node that holds the pointer
 *     capture, and moving it can release the capture and cancel the gesture.
 *     The order is applied on release, in one go.
 *
 * The component owns no order: it reports the movement and the page applies it
 * (see ArtworkPhotosPage). One order, one owner.
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
  /** In display order: position i is what the cataloger sees at i. */
  images: ImageRow[]
  thumbUrls: Record<string, string>
  mainId: string | null
  selectedId: string | null
  onSelect: (imageId: string) => void
  /** On release: move the photo at `from` to position `to`. */
  onReorder: (from: number, to: number) => void
  disabled?: boolean
}) {
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)
  const canDrag = !disabled && images.length > 1

  // The drag state the window listeners read: they are registered once per
  // drag and must not close over a stale render.
  const stateRef = useRef({ draggingId: null as string | null, overId: null as string | null })
  stateRef.current = { draggingId, overId }
  const imagesRef = useRef(images)
  imagesRef.current = images
  const onReorderRef = useRef(onReorder)
  onReorderRef.current = onReorder

  useEffect(() => {
    if (!draggingId) return

    function tileUnder(x: number, y: number): string | null {
      return (
        document.elementFromPoint(x, y)?.closest('[data-image-id]')?.getAttribute('data-image-id') ??
        null
      )
    }

    function onPointerMove(e: PointerEvent) {
      const over = tileUnder(e.clientX, e.clientY)
      setOverId(over === stateRef.current.draggingId ? null : over)
    }

    function finish(commit: boolean) {
      const { draggingId: dragged, overId: over } = stateRef.current
      setDraggingId(null)
      setOverId(null)
      if (!commit || !dragged || !over || dragged === over) return
      const rows = imagesRef.current
      const from = rows.findIndex((i) => i.image_id === dragged)
      const to = rows.findIndex((i) => i.image_id === over)
      if (from >= 0 && to >= 0) onReorderRef.current(from, to)
    }

    const onUp = () => finish(true)
    const onCancel = () => finish(false)

    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
    }
  }, [draggingId])

  return (
    <div>
      <ul className={`grid grid-cols-3 gap-2 ${draggingId ? 'select-none' : ''}`}>
        {images.map((image, position) => {
          const isMain = image.image_id === mainId
          const isDragging = image.image_id === draggingId
          const isTarget = image.image_id === overId
          return (
            <li
              key={image.image_id}
              data-image-id={image.image_id}
              className={`relative rounded-lg border-2 transition ${
                isDragging
                  ? 'border-stone-800 opacity-50'
                  : isTarget
                    ? 'border-dashed border-stone-800 ring-2 ring-stone-300'
                    : image.image_id === selectedId
                      ? 'border-stone-800'
                      : 'border-stone-200'
              }`}
            >
              <button
                type="button"
                aria-label={`${SHOT_TYPE_LABEL[image.shot_type]}, posición ${position + 1} de ${images.length}${isMain ? ', imagen principal' : ''}`}
                aria-pressed={image.image_id === selectedId}
                onClick={() => onSelect(image.image_id)}
                className="block w-full overflow-hidden rounded-md"
              >
                {thumbUrls[image.image_id] ? (
                  <img
                    src={thumbUrls[image.image_id]}
                    alt=""
                    className="aspect-square w-full object-cover"
                  />
                ) : (
                  <span className="flex aspect-square w-full items-center justify-center bg-stone-100 text-3xs text-stone-500">
                    sin vista
                  </span>
                )}
              </button>

              {canDrag && (
                <span
                  role="button"
                  tabIndex={-1}
                  aria-label={`Arrastrar ${SHOT_TYPE_LABEL[image.shot_type]} para reordenar`}
                  onPointerDown={(e) => {
                    // The handle owns the gesture from the first pixel: no
                    // hold, and touch-action none so nothing scrolls.
                    e.preventDefault()
                    setDraggingId(image.image_id)
                    setOverId(null)
                  }}
                  // A long press must not raise the system menu over the drag.
                  onContextMenu={(e) => e.preventDefault()}
                  className={`absolute right-0 top-0 flex h-7 w-7 cursor-grab touch-none select-none items-center justify-center rounded-bl-md text-white ${
                    isDragging ? 'bg-stone-900' : 'bg-stone-900/70'
                  }`}
                >
                  <GripIcon className="h-3.5 w-3.5" />
                </span>
              )}

              {/* The position is written on the thumbnail: after a drag, the
                  order must be readable without counting tiles. */}
              <span className="pointer-events-none absolute bottom-1 right-1 rounded bg-stone-900/85 px-1.5 py-0.5 text-3xs font-medium tabular-nums text-white">
                {position + 1}
              </span>
              {isMain && (
                <span
                  className="pointer-events-none absolute left-1 top-1 rounded-full bg-stone-900/85 p-0.5 text-white"
                  title="Imagen principal"
                >
                  <YesIcon className="h-3 w-3" />
                </span>
              )}
              {image.shot_type !== 'GENERAL' && (
                <span className="pointer-events-none absolute bottom-1 left-1 rounded bg-stone-900/85 px-1.5 py-0.5 text-3xs text-white">
                  {SHOT_TYPE_LABEL[image.shot_type]}
                </span>
              )}
            </li>
          )
        })}
      </ul>

      {images.length > 1 && (
        <p className="mt-2 text-xs text-stone-500">
          {draggingId
            ? overId
              ? 'Suelta para colocarla en el hueco marcado.'
              : 'Arrastra sobre la fotografía que quieres que ocupe su sitio.'
            : 'Arrastra por la esquina para cambiar el orden.'}
        </p>
      )}
    </div>
  )
}
