import { applyColorLuts, type ColorLuts } from './imageColor'
import { loupeRegion, type Rotation, type Size } from './imageEdits'

/**
 * The loupe of the photo editor: the corner being adjusted, magnified.
 *
 * On a phone the finger covers exactly the pixel being aimed at, so adjusting
 * the border of a painting to the millimetre is not possible without seeing that
 * corner somewhere else, bigger. This is the drawing; where to put it on screen
 * and when to show it is the editor's business (PhotoEditor.tsx), and which
 * region of the photograph it corresponds to is `loupeRegion` in imageEdits.ts,
 * which is arithmetic and is tested.
 *
 * The colour adjustment reaches the loupe too, and it has to: the `<img>` on the
 * working surface is corrected by an SVG `<filter>`, and a loupe showing the raw
 * pixels next to it would be a magnifier of a different photograph. It cannot use
 * the same filter — this is a canvas and not an element — so it applies the same
 * table in CPU, which is exactly what `applyColorLuts` is for. **Nothing is
 * re-derived here**: the table comes from imageColor.ts, the normative definition.
 *
 * What draws cannot be tested in this repository —the test environment has no
 * canvas— and is verified in the browser. What IS arithmetic or rule is separated out
 * and tested: where the loupe goes (`aidCorners`) and whether the table applies at
 * all (`loupeTables`).
 */

/** A corner of the working surface. */
export type ScreenCorner = 'nw' | 'ne' | 'sw' | 'se'

/**
 * Where the loupe and the straightened preview go, given the point under the finger.
 *
 * The loupe goes to the corner OPPOSITE the finger, recomputed as it moves: anchoring
 * it to which handle is being dragged would not be enough, because the framing can
 * sit in any quadrant and then the «nw» handle is at the bottom right of the screen
 * with the thumb over the loupe.
 *
 * The preview takes the same column as the loupe and the other row. Sharing the
 * column and flipping the row is what GUARANTEES the two never land on the same
 * corner — which is the whole reason this is a function with a test instead of two
 * ternaries in the markup. The first version repeated the loupe's horizontal rule and
 * always sat at the bottom, so with the finger on either top corner both ended up in
 * the same place, one drawn over the other.
 */
export function aidCorners(point: { x: number; y: number }): {
  loupe: ScreenCorner
  preview: ScreenCorner
} {
  const right = point.x < 0.5
  const below = point.y < 0.5
  const corner = (isRight: boolean, isBelow: boolean): ScreenCorner =>
    isBelow ? (isRight ? 'se' : 'sw') : isRight ? 'ne' : 'nw'
  return {
    loupe: corner(right, below),
    preview: corner(right, !below),
  }
}

/**
 * What the loupe is being used for right now.
 *
 * `FRAMING` is a corner of the crop or of the perspective quadrilateral: the
 * cataloger is comparing the line she is dragging with the border of the artwork, so
 * what she has to see is the photograph as it will be — corrected.
 *
 * `EYEDROPPER` is taking the neutral grey (RF-418), and there it is the opposite:
 * the sample has to be aimed at the **raw** pixels. Showing the corrected ones would
 * mean aiming at a grey that is already grey, which measures the correction already
 * applied instead of the light of the room, and every second pick would undo the
 * previous one.
 */
export type LoupeMode = 'FRAMING' | 'EYEDROPPER'

/**
 * The table the loupe must really apply, which in eyedropper mode is none.
 *
 * A function of two lines with a test, and not a ternary at the call site, because
 * the rule is the requirement: the pixels under the eyedropper are raw. Written
 * inline it would be a condition nobody could fail a test on, and the way it breaks
 * is silent — a grey that looks right and a white balance that drifts one pick at a
 * time.
 */
export function loupeTables(
  luts: ColorLuts | null | undefined,
  mode: LoupeMode,
): ColorLuts | null {
  return mode === 'EYEDROPPER' ? null : (luts ?? null)
}

/** Side of the loupe on screen, in CSS pixels. */
export const LOUPE_SIDE = 112

/**
 * Three times what is ON SCREEN, which is the only reference that matters: the
 * photograph is displayed shrunk to fit the working surface, so magnifying the
 * master's own pixels would mean something different for every photo — a lot on
 * a 12 MP master and nothing on a small scan.
 */
export const LOUPE_ZOOM = 3

/**
 * Backing store of the loupe, so the crosshair is not soft on a phone. Capped at
 * two: beyond that it costs pixels to draw and gains nothing that can be seen.
 */
export function loupePixels(): number {
  const ratio = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1
  return Math.round(LOUPE_SIDE * Math.min(2, Math.max(1, ratio)))
}

/**
 * The two lines of the framing, crossing at the centre of the loupe. `side` is in
 * pixels of the canvas backing store, which on a phone is not the same as CSS
 * pixels: the lines are measured in the same units so they do not come out
 * hairline on a dense screen.
 */
function crosshair(ctx: CanvasRenderingContext2D, side: number): void {
  // Half a pixel off the grid so a one-pixel line is one pixel and not two grey
  // ones.
  const middle = Math.round(side / 2) + 0.5
  ctx.beginPath()
  ctx.moveTo(middle, 0)
  ctx.lineTo(middle, side)
  ctx.moveTo(0, middle)
  ctx.lineTo(side, middle)
  ctx.stroke()
}

/**
 * Paints the corner being adjusted, magnified, with the crop lines on top.
 *
 * It draws from the `<img>` the editor already has decoded — no new decode and
 * nothing over the network — and reads a small region of it with the nine
 * argument `drawImage`, so magnifying a 12 MP master costs the same as
 * magnifying a thumbnail.
 *
 * The cataloger is looking at the ROTATED photograph, and that is what the loupe
 * has to show. A source rectangle cannot be rotated, so the region is read in the
 * coordinates of the original — that is what `loupeRegion` is for — and the
 * square canvas is turned about its centre, which for a quarter turn of a square
 * is the whole mapping.
 *
 * **The colour table goes on before the background and before the crosshair, and the
 * order is not cosmetic**: applied afterwards, a black point of 40 would take the
 * crosshair — a white line at 95 % over a dark stroke — and crush it into the very
 * shadow it is drawn over, leaving the cataloger placing a border by feel. So the
 * pixels of the photograph are corrected first, the dark surround is painted
 * *underneath* them with `destination-over`, and the two lines go on top of
 * everything, untouched.
 *
 * It draws or it does not: it never throws, because the loupe is an aid and the
 * drag has to keep working without it.
 */
export function paintLoupe(
  canvas: HTMLCanvasElement,
  image: CanvasImageSource,
  params: {
    /** Size of the image as decoded, before the rotation. */
    natural: Size
    rotation: Rotation
    /**
     * The point being aimed at, in fractions of the rotated image: a corner of the
     * crop, or a corner of the perspective quadrilateral. A point and not a
     * rectangle-plus-corner, because the loupe only ever needed the point — and
     * asking for the rectangle was what left it frozen while a quadrilateral corner
     * was being dragged, since that rectangle does not move then.
     */
    point: { x: number; y: number }
    /** Side of the region to show, in pixels of the rotated image. */
    sourceSide: number
    /**
     * The colour adjustment being previewed, if any. The same tables the working
     * surface shows through its SVG filter, so the magnifier and the photograph are
     * the same photograph.
     */
    luts?: ColorLuts | null
    /**
     * What the loupe is for right now. Defaults to framing; the eyedropper has to say
     * so, and saying so is what gets it the raw pixels (see `loupeTables`).
     */
    mode?: LoupeMode
  },
): void {
  const ctx = canvas.getContext('2d')
  // No drawing context: no loupe, and the drag goes on as before. The magnifier
  // is never a condition for editing.
  if (!ctx) return

  const side = canvas.width
  const region = loupeRegion(
    params.natural,
    params.rotation,
    params.point,
    params.sourceSide,
  )
  const tables = loupeTables(params.luts, params.mode ?? 'FRAMING')

  try {
    ctx.save()
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    // Cleared and not filled: the surround is painted at the end, underneath, so the
    // colour table only ever touches pixels of the photograph. What falls outside the
    // photograph —when the corner sits on its edge— stays transparent until then. The
    // region is deliberately not slid inwards to avoid this: see loupeRegion.
    ctx.clearRect(0, 0, side, side)
    ctx.translate(side / 2, side / 2)
    ctx.rotate((params.rotation * Math.PI) / 180)
    ctx.translate(-side / 2, -side / 2)
    // Interpolated only when the region is bigger than the loupe, which is the
    // usual case with a 12 MP master: there this is a reduction, and without
    // filtering it would alias into a noise that looks like texture. When the
    // region is genuinely being blown up, the pixels are shown as they are,
    // which is what lets a border be placed on the very line where the tone
    // changes.
    ctx.imageSmoothingEnabled = region.width > side
    ctx.drawImage(image, region.x, region.y, region.width, region.height, 0, 0, side, side)
  } catch {
    /* A region the browser refuses to read leaves the loupe as it was. */
  } finally {
    ctx.restore()
  }

  if (tables) {
    try {
      // A hundred and twelve pixels square, or two hundred and twenty-four on a dense
      // screen: fifty thousand lookups, which is nothing next to the `pointermove`
      // that asked for it. The table is applied in CPU because a canvas has no
      // filter that can be trusted — `ctx.filter` is a silent no-op on old WebKit,
      // and the declared target is phones from 2020 on.
      const pixels = ctx.getImageData(0, 0, side, side)
      applyColorLuts(tables, pixels.data)
      ctx.putImageData(pixels, 0, 0)
    } catch {
      /*
       * A canvas the browser will not let us read —an image from another origin
       * taints it— leaves the loupe with the raw pixels. Worse than corrected and far
       * better than nothing: the drag has to keep working. The colour panel is only
       * offered over the master, which travels as a Blob of this same origin, so this
       * is the path nobody should reach.
       */
    }
  }

  // The dark surround, painted UNDERNEATH everything already drawn: what falls
  // outside the photograph, without having gone through the table.
  try {
    ctx.save()
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.globalCompositeOperation = 'destination-over'
    ctx.fillStyle = '#1c1917'
    ctx.fillRect(0, 0, side, side)
  } finally {
    ctx.restore()
  }

  // Twice: a dark stroke underneath so the white line is visible over a light
  // painting too.
  const scale = side / LOUPE_SIDE
  ctx.lineWidth = 3 * scale
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)'
  crosshair(ctx, side)
  ctx.lineWidth = scale
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)'
  crosshair(ctx, side)
}
