/**
 * The geometry of straightening a photographed plane: four corners in, a
 * projective transform out.
 *
 * A painting is a plane. Photographing it with a camera that is not perpendicular
 * to it maps that plane onto the sensor with a **projective transformation** — a
 * homography — which has exactly eight degrees of freedom and keeps straight lines
 * straight while letting parallels converge. That convergence is the keystone
 * effect, and it is what makes a rectangle come out as a trapezoid: measured on the
 * catalog, eight of the fourteen artworks are past 1° and two reach 11.69°.
 *
 * Eight degrees of freedom is exactly what four corners give (four points × two
 * coordinates), which is why the corners are what gets stored (see the migration)
 * and the matrix is computed here. Storing the matrix would be storing the result
 * of a calculation instead of its data, and a `h21` cannot be checked by eye or by
 * a constraint the way a corner can.
 *
 * **What separates this from a rotation, a scale or a shear** is the division by
 * the third row. Those are affine: the bottom row is `[0 0 1]`, there is no
 * division, and parallels stay parallel. Here `h31` and `h32` are not zero, the
 * division depends on where you are in the image, and that is both why it can
 * straighten a trapezoid and why Canvas 2D cannot apply it — `setTransform` takes
 * six numbers and is affine by construction. It is not an API limitation to work
 * around; the operation does not fit in it.
 *
 * No DOM here, like imageEdits.ts and for the same reason: this is the arithmetic,
 * and it is the part that can be tested. What paints pixels lives in imageRender.ts.
 */

/** A point in fractions (0..1) of the image it refers to. Outside 0..1 is legal. */
export interface Point {
  x: number
  y: number
}

/**
 * The four corners of the artwork in the photograph, clockwise from the top left
 * as seen on screen.
 *
 * Clockwise on screen and not counter-clockwise: with the Y axis pointing down,
 * which is how image rows are numbered, that order gives a positive signed area,
 * and the database constraint uses exactly that to refuse a quadrilateral that
 * crosses itself.
 */
export interface Corners {
  nw: Point
  ne: Point
  se: Point
  sw: Point
}

/**
 * A 3×3 homography, row-major: `[h11, h12, h13, h21, h22, h23, h31, h32, h33]`.
 *
 * Applied to a point as `(x', y', z') = H · (x, y, 1)` and then divided:
 * `u = x'/z'`, `v = y'/z'`. That division is the whole difference from an affine
 * transform.
 */
export type Homography = readonly [
  number, number, number,
  number, number, number,
  number, number, number,
]

export const CORNER_KEYS = ['nw', 'ne', 'se', 'sw'] as const
export type CornerKey = (typeof CORNER_KEYS)[number]

/**
 * Twice the signed area of the quadrilateral (the shoelace formula).
 *
 * Positive means the corners run clockwise on screen, and the magnitude says how far
 * it is from degenerate. What it does NOT say is that the quadrilateral does not cross
 * itself: a self-intersecting one keeps a positive area whenever its larger lobe wins.
 * That is why `isConvexQuadrilateral` exists and why this is not used alone.
 */
export function signedArea(corners: Corners): number {
  const order = CORNER_KEYS.map((key) => corners[key])
  let total = 0
  for (let i = 0; i < order.length; i += 1) {
    const a = order[i]!
    const b = order[(i + 1) % order.length]!
    total += a.x * b.y - b.x * a.y
  }
  return total
}

/**
 * Whether these corners can be straightened at all: a convex quadrilateral, run
 * clockwise on screen, with an interior.
 *
 * **Convex and not merely «does not cross itself»**, and the difference is not
 * pedantry: the signed area alone —which is what this used to check, and what the
 * schema still checked— accepts plenty of crossed quadrilaterals, because a
 * self-intersecting polygon keeps a positive area whenever its larger lobe wins.
 * Measured: dragging the top left corner to (0.95, 0.16) of the trapezoid of the
 * tests crosses two sides and still scores an area of 0.332.
 *
 * Convexity is also the right rule and not just a stricter one: the projective image
 * of a rectangle is convex, always. So anything non-convex is not a photograph of a
 * painting seen at an angle, whatever else it may be.
 *
 * The test is the sign of the cross product at each vertex — all four the same, and
 * with this traversal all four positive. The area is kept alongside it with a job of
 * its own: excluding the quadrilateral that is technically convex and too small to
 * be anything.
 */
export function isConvexQuadrilateral(corners: Corners): boolean {
  if (!(signedArea(corners) > 0.01)) return false
  const order = CORNER_KEYS.map((key) => corners[key])
  for (let i = 0; i < order.length; i += 1) {
    const a = order[i]!
    const b = order[(i + 1) % order.length]!
    const c = order[(i + 2) % order.length]!
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x)
    if (!(cross > 0)) return false
  }
  return true
}

/**
 * The size of the rectangle the corners get straightened into, in fractions of the
 * source image.
 *
 * **The average of opposite sides**, and that is a decision with an alternative
 * that was measured and rejected. A single homography does let you recover the
 * plane's true proportions if you know the camera's focal length, and it is even
 * possible to recover the focal from the vanishing points — but that calculation
 * becomes numerically unstable exactly when the tilt is small, which is our whole
 * range (1° to 12°), and the EXIF does not carry what it needs: of the 44 master
 * photographs only 17 have a focal length convertible to pixels, and the three
 * canonical keystone cases have no EXIF at all.
 *
 * Taking it from the artwork's own `height_cm` / `width_cm` was rejected too, and
 * also with data: five of the eight tilted photographs belong to artworks whose
 * measurements are null, and none to one with `measurements_verified`. It would
 * also tie a photograph's pixels to a datum that gets corrected later, so
 * straightening the same photo twice would give two different results.
 *
 * So: deterministic, reproducible in the Python pipeline, and independent of any
 * datum anybody can edit. It does not recover the physical proportion and does not
 * claim to.
 *
 * **Why the frame in pixels is an argument and not optional.** The corners are
 * fractions, and a fraction of the width and a fraction of the height are only the
 * same length when the frame is square. Measuring a side with `hypot` on the
 * fractions alone therefore adds two different units, and the error does not come
 * from the convergence —which is what this function is for— but from the TILT in
 * the plane and the frame's proportion: a rectangle that really is 800 × 500 px,
 * merely turned 5° on a 16:9 frame, came out as 806,54 × 498,70, a proportion
 * 1,08 % too wide. Measured on the ten stored rows the deformation ran from 0,02 %
 * to 0,66 %, so nothing needed regenerating, but the arithmetic was wrong.
 *
 * The algebra is one line: `hypot(dx·W, dy·H) = W·hypot(dx, dy·H/W)`, and likewise
 * `= H·hypot(dx·W/H, dy)`. So each side is measured in the unit of the side it
 * belongs to and what comes back is still a fraction of W and a fraction of H — the
 * callers keep multiplying by `rotated.width` and `rotated.height` as before.
 *
 * `frame` is **the size of the image the corners are fractions of, already rotated**,
 * never the size it is drawn at on screen — the two agree in proportion today, and
 * relying on that is how the sides got swapped at 90° and 270° once already. It is
 * required rather than defaulted so that a new caller cannot silently get the square
 * frame back.
 */
export function straightenedSize(
  corners: Corners,
  frame: { width: number; height: number },
): { width: number; height: number } {
  // Guarded because this arrives from a decoder or from a layout: a zero or a NaN
  // would turn every side into NaN, and a NaN reaches the canvas as a blank file.
  const w = Number.isFinite(frame.width) && frame.width > 0 ? frame.width : 1
  const h = Number.isFinite(frame.height) && frame.height > 0 ? frame.height : 1
  const aspect = w / h
  /** A side of the artwork's width, as a fraction of the frame's width. */
  const alongWidth = (a: Point, b: Point) => Math.hypot(b.x - a.x, (b.y - a.y) / aspect)
  /** A side of the artwork's height, as a fraction of the frame's height. */
  const alongHeight = (a: Point, b: Point) => Math.hypot((b.x - a.x) * aspect, b.y - a.y)
  return {
    width: (alongWidth(corners.nw, corners.ne) + alongWidth(corners.sw, corners.se)) / 2,
    height: (alongHeight(corners.nw, corners.sw) + alongHeight(corners.ne, corners.se)) / 2,
  }
}

/**
 * The homography that maps the unit square onto the four corners.
 *
 * Which direction: from **destination to source**. The renderer walks the pixels of
 * the straightened output and asks where each one comes from in the photograph,
 * because that is the only way to fill every output pixel exactly once — walking
 * the source instead leaves holes wherever the transform stretches.
 *
 * The closed form is the classical one for the unit square and it is worth having
 * instead of a general four-point solver: no 8×8 system, no pivoting, no library,
 * and every step can be read. Derivation in one line: with the square's corners at
 * (0,0), (1,0), (1,1), (0,1), six of the eight unknowns fall out directly and the
 * two of the third row come from solving a 2×2 system.
 *
 * Returns null when the quadrilateral is degenerate — three corners in a line, or
 * all four in one point — where there is no transform to compute rather than a bad
 * one.
 */
export function homographyFromUnitSquare(corners: Corners): Homography | null {
  const { nw, ne, se, sw } = corners

  const dx1 = ne.x - se.x
  const dx2 = sw.x - se.x
  const dy1 = ne.y - se.y
  const dy2 = sw.y - se.y
  const sx = nw.x - ne.x + se.x - sw.x
  const sy = nw.y - ne.y + se.y - sw.y

  // The 2×2 system for the third row. Its determinant vanishes exactly when the
  // quadrilateral has no interior.
  const determinant = dx1 * dy2 - dx2 * dy1
  if (Math.abs(determinant) < 1e-12) return null

  let g: number
  let h: number
  if (Math.abs(sx) < 1e-12 && Math.abs(sy) < 1e-12) {
    // A parallelogram: the transform is affine and the third row is zero. Worth
    // the special case because it is the common one — a photograph taken square
    // on — and going through the general formula there would divide two near-zero
    // numbers and hand back noise as a perspective.
    g = 0
    h = 0
  } else {
    g = (sx * dy2 - dx2 * sy) / determinant
    h = (dx1 * sy - sx * dy1) / determinant
  }

  return [
    ne.x - nw.x + g * ne.x,
    sw.x - nw.x + h * sw.x,
    nw.x,
    ne.y - nw.y + g * ne.y,
    sw.y - nw.y + h * sw.y,
    nw.y,
    g,
    h,
    1,
  ] as const
}

/** A point through a homography, with the division that makes it projective. */
export function applyHomography(h: Homography, point: Point): Point {
  const z = h[6] * point.x + h[7] * point.y + h[8]
  if (Math.abs(z) < 1e-12) return { x: point.x, y: point.y }
  return {
    x: (h[0] * point.x + h[1] * point.y + h[2]) / z,
    y: (h[3] * point.x + h[4] * point.y + h[5]) / z,
  }
}

/**
 * The inverse transform: from the photograph back to the straightened rectangle.
 *
 * Needed for the preview, and only for it. The renderer walks the destination and
 * asks where each pixel comes from, so it wants square → corners; the browser, given
 * a CSS transform, walks the source, so it wants corners → square.
 *
 * A 3×3 inverse by the adjugate, which for nine numbers is shorter and clearer than
 * elimination and has no pivoting to get wrong. Null when the matrix is singular,
 * which for a homography means the quadrilateral had no interior.
 */
export function invertHomography(h: Homography): Homography | null {
  const [a, b, c, d, e, f, g, i, j] = h
  const A = e * j - f * i
  const B = f * g - d * j
  const C = d * i - e * g
  const determinant = a * A + b * B + c * C
  if (Math.abs(determinant) < 1e-12) return null
  const k = 1 / determinant
  return [
    A * k,
    (c * i - b * j) * k,
    (b * f - c * e) * k,
    B * k,
    (a * j - c * g) * k,
    (c * d - a * f) * k,
    C * k,
    (b * g - a * i) * k,
    (a * e - b * d) * k,
  ] as const
}

/**
 * The transform as a CSS `matrix3d`, so the browser can draw the preview.
 *
 * **A homography does fit in a CSS transform**, which is the one place a projective
 * transform is free: `matrix3d` is 4×4 and homogeneous, and CSS divides by the
 * fourth coordinate exactly as the homography divides by the third. So the preview
 * costs nothing per frame while a handle is being dragged — the alternative, running
 * the pixel loop on every pointer move, is 89 ms a frame on a phone.
 *
 * The order is column-major, which is what `matrix3d` takes and the usual place to
 * get this wrong: the first four numbers are the first COLUMN, not the first row. Z
 * is left as the identity because the plane does not move in depth; what makes it
 * projective is the fourth row, which carries the two perspective terms.
 *
 * The result is in the units the element is drawn at, so the caller applies it with
 * `transform-origin: 0 0` over a box of the size of the straightened rectangle.
 */
export function homographyToCssMatrix(h: Homography): string {
  const [a, b, c, d, e, f, g, i, j] = h
  const values = [a, d, 0, g, b, e, 0, i, 0, 0, 1, 0, c, f, 0, j]
  return `matrix3d(${values.map((value) => Number(value.toFixed(9))).join(', ')})`
}

/**
 * How far outside the image a corner may be dragged, as a fraction.
 *
 * Mirrors the `images_corners_within_reach` constraint of the schema: in five
 * photographs of the catalog the sides of the artwork are not inside the frame, and
 * dragging a handle past the edge is the only way to straighten those. What falls
 * outside is filled with white.
 */
export const CORNER_REACH = 0.25

/**
 * One corner moved to `point`, or null when the move is refused.
 *
 * Refused means the result would not be a convex quadrilateral — which is what
 * happens as soon as a handle is dragged past its neighbour — and straightening that
 * gives an image folded over itself. The database refuses the row too; answering null
 * here is what lets the interface refuse the gesture at the finger instead of at the
 * save button.
 *
 * It exists as a function because the finger and the keyboard both do this, and two
 * copies of «clamp, then check the fold» would drift: the arrow keys would keep
 * accepting what a drag refuses.
 */
export function moveCorner(
  corners: Corners,
  key: CornerKey,
  point: Point,
): Corners | null {
  const clamp = (value: number) =>
    Math.min(1 + CORNER_REACH, Math.max(-CORNER_REACH, Number.isFinite(value) ? value : 0))
  const moved: Corners = {
    ...corners,
    [key]: { x: clamp(point.x), y: clamp(point.y) },
  }
  return isConvexQuadrilateral(moved) ? moved : null
}

/**
 * The same quadrilateral over the image turned `rotation` degrees clockwise.
 *
 * Two things happen at once and forgetting the second is the trap: each point moves,
 * AND each corner changes its NAME. After a quarter turn clockwise the corner that was
 * top left appears at the top right, so it becomes the NE — and the traversal has to
 * stay clockwise on screen or the convexity check, which depends on the order, would
 * start refusing perfectly good quadrilaterals. Both are one shift per quarter turn
 * around the NW → NE → SE → SW cycle.
 *
 * The point mapping matches `rotateCrop` of imageEdits.ts on a degenerate crop, which
 * is where it comes from: for 90° a point (x, y) lands at (1 - y, x).
 */
export function rotateCorners(corners: Corners, rotation: number): Corners {
  const quarters = ((Math.round(rotation / 90) % 4) + 4) % 4
  if (quarters === 0) return { ...corners }

  const turn = (p: Point): Point =>
    quarters === 1
      ? { x: 1 - p.y, y: p.x }
      : quarters === 2
        ? { x: 1 - p.x, y: 1 - p.y }
        : { x: p.y, y: 1 - p.x }

  const turned = {} as Record<CornerKey, Point>
  CORNER_KEYS.forEach((key, i) => {
    turned[CORNER_KEYS[(i + quarters) % 4]!] = turn(corners[key])
  })
  return turned as Corners
}

/** The bounding box of the four corners: what a crop would have been. */
export function cornersBoundingBox(corners: Corners): {
  x: number
  y: number
  width: number
  height: number
} {
  const xs = CORNER_KEYS.map((key) => corners[key].x)
  const ys = CORNER_KEYS.map((key) => corners[key].y)
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y }
}

/**
 * The four corners of a rectangle, which is the identity case.
 *
 * It is what the editor opens with when a photograph has a crop and no corners:
 * straightening starts from what is already framed, so asking for the corners
 * never loses the rectangle that was there.
 */
export function cornersOfRect(rect: { x: number; y: number; width: number; height: number }): Corners {
  return {
    nw: { x: rect.x, y: rect.y },
    ne: { x: rect.x + rect.width, y: rect.y },
    se: { x: rect.x + rect.width, y: rect.y + rect.height },
    sw: { x: rect.x, y: rect.y + rect.height },
  }
}

/** Whether these corners are, within tolerance, an axis-aligned rectangle. */
export function isRectangle(corners: Corners, tolerance = 1e-4): boolean {
  const { nw, ne, se, sw } = corners
  return (
    Math.abs(nw.y - ne.y) <= tolerance &&
    Math.abs(sw.y - se.y) <= tolerance &&
    Math.abs(nw.x - sw.x) <= tolerance &&
    Math.abs(ne.x - se.x) <= tolerance
  )
}
