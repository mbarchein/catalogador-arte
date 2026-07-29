import { loupeRegion, type Corner, type Crop, type Rotation, type Size } from './imageEdits'

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
 * Like imageRender.ts, what is here cannot be tested in this repository: the test
 * environment has no canvas. It is verified in the browser.
 */

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
 * The two lines of the crop, crossing at the centre of the loupe. `side` is in
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
    crop: Crop
    corner: Corner
    /** Side of the region to show, in pixels of the rotated image. */
    sourceSide: number
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
    params.crop,
    params.corner,
    params.sourceSide,
  )

  try {
    ctx.save()
    // What falls outside the photograph, when the corner sits on its edge. The
    // region is deliberately not slid inwards to avoid this: see loupeRegion.
    ctx.fillStyle = '#1c1917'
    ctx.fillRect(0, 0, side, side)
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
