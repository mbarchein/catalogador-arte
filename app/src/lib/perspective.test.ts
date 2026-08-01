import { describe, expect, it } from 'vitest'
import {
  CORNER_REACH,
  applyHomography,
  cornersBoundingBox,
  cornersOfRect,
  homographyFromUnitSquare,
  homographyToCssMatrix,
  invertHomography,
  isRectangle,
  isConvexQuadrilateral,
  moveCorner,
  signedArea,
  straightenedSize,
  type Corners,
} from './perspective'

/**
 * The homography is tested by what it has to DO — carry the unit square onto the
 * four corners and back — and not by comparing its nine numbers against numbers
 * written by hand. A matrix is only defined up to scale, so asserting its entries
 * would be asserting one particular normalization; asserting where it sends points
 * is asserting the geometry.
 */

const square = (): Corners => cornersOfRect({ x: 0.2, y: 0.2, width: 0.6, height: 0.6 })

/** A trapezoid: the top side narrower than the bottom, which is a keystone. */
const keystone = (): Corners => ({
  nw: { x: 0.3, y: 0.15 },
  ne: { x: 0.7, y: 0.15 },
  se: { x: 0.85, y: 0.9 },
  sw: { x: 0.15, y: 0.9 },
})

describe('signedArea and the simple quadrilateral (RF-410)', () => {
  /**
   * The sign is the thing worth pinning down: with Y pointing down, clockwise on
   * screen gives POSITIVE area. It is easy to derive backwards — it was, and the
   * database `check` caught it on the first insert — so the unit square is here as
   * the reference the comment claims.
   */
  it('the unit square, clockwise with Y downwards, gives +2', () => {
    expect(signedArea(cornersOfRect({ x: 0, y: 0, width: 1, height: 1 }))).toBeCloseTo(2, 10)
  })

  it('a quadrilateral that crosses itself is refused', () => {
    // The two top corners swapped: NE to the left of NW. It is what dragging one
    // handle past its neighbour produces, and straightening it gives an image
    // folded over itself.
    const crossed: Corners = {
      nw: { x: 0.8, y: 0.2 },
      ne: { x: 0.2, y: 0.2 },
      se: { x: 0.8, y: 0.8 },
      sw: { x: 0.2, y: 0.8 },
    }
    expect(isConvexQuadrilateral(crossed)).toBe(false)
  })

  it('a degenerate quadrilateral is refused, and a real one accepted', () => {
    const point = cornersOfRect({ x: 0.5, y: 0.5, width: 0, height: 0 })
    expect(isConvexQuadrilateral(point)).toBe(false)
    expect(isConvexQuadrilateral(square())).toBe(true)
    expect(isConvexQuadrilateral(keystone())).toBe(true)
  })
})

describe('homographyFromUnitSquare (RF-410)', () => {
  it('carries the four corners of the unit square onto the four given', () => {
    const corners = keystone()
    const h = homographyFromUnitSquare(corners)
    expect(h).not.toBeNull()

    const at = (x: number, y: number) => applyHomography(h!, { x, y })
    for (const [point, corner] of [
      [at(0, 0), corners.nw],
      [at(1, 0), corners.ne],
      [at(1, 1), corners.se],
      [at(0, 1), corners.sw],
    ] as const) {
      expect(point.x).toBeCloseTo(corner.x, 10)
      expect(point.y).toBeCloseTo(corner.y, 10)
    }
  })

  it('a rectangle comes out affine: no perspective term at all', () => {
    const h = homographyFromUnitSquare(square())!
    // The third row is what makes a transform projective. For a parallelogram it
    // has to be exactly zero, not nearly: otherwise a photograph taken square on
    // would get a perspective made of rounding noise.
    expect(h[6]).toBe(0)
    expect(h[7]).toBe(0)
  })

  it('the middle of the square lands inside the quadrilateral, not at its centroid', () => {
    // The signature of a projective transform: the centre of the source does NOT
    // map to the average of the corners. If it did, this would be affine and it
    // could not straighten anything.
    const corners = keystone()
    const middle = applyHomography(homographyFromUnitSquare(corners)!, { x: 0.5, y: 0.5 })
    const centroid = {
      x: (corners.nw.x + corners.ne.x + corners.se.x + corners.sw.x) / 4,
      y: (corners.nw.y + corners.ne.y + corners.se.y + corners.sw.y) / 4,
    }
    expect(middle.y).not.toBeCloseTo(centroid.y, 3)
    // And it stays inside the trapezoid, which is what «not a bad transform» means.
    expect(middle.x).toBeGreaterThan(corners.sw.x)
    expect(middle.x).toBeLessThan(corners.se.x)
    expect(middle.y).toBeGreaterThan(corners.nw.y)
    expect(middle.y).toBeLessThan(corners.sw.y)
  })

  it('straight lines stay straight, which is the property that makes this usable', () => {
    const h = homographyFromUnitSquare(keystone())!
    // Three points along a line of the source have to stay collinear in the
    // destination. Checked with the cross product of the two segments.
    const a = applyHomography(h, { x: 0.1, y: 0.25 })
    const b = applyHomography(h, { x: 0.5, y: 0.25 })
    const c = applyHomography(h, { x: 0.9, y: 0.25 })
    const cross = (b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y)
    expect(Math.abs(cross)).toBeLessThan(1e-9)
  })

  it('answers null when there is no transform rather than a bad one', () => {
    expect(homographyFromUnitSquare(cornersOfRect({ x: 0.5, y: 0.5, width: 0, height: 0 }))).toBeNull()
  })
})

describe('invertHomography and the CSS matrix (RF-410)', () => {
  it('the inverse undoes the transform on any point', () => {
    const h = homographyFromUnitSquare(keystone())!
    const back = invertHomography(h)!
    for (const point of [{ x: 0.2, y: 0.3 }, { x: 0.9, y: 0.05 }, { x: 0.5, y: 0.5 }]) {
      const round = applyHomography(back, applyHomography(h, point))
      expect(round.x).toBeCloseTo(point.x, 9)
      expect(round.y).toBeCloseTo(point.y, 9)
    }
  })

  it('and takes the four corners back to the corners of the square', () => {
    const corners = keystone()
    const back = invertHomography(homographyFromUnitSquare(corners)!)!
    const nw = applyHomography(back, corners.nw)
    const se = applyHomography(back, corners.se)
    expect(nw.x).toBeCloseTo(0, 9)
    expect(nw.y).toBeCloseTo(0, 9)
    expect(se.x).toBeCloseTo(1, 9)
    expect(se.y).toBeCloseTo(1, 9)
  })

  it('answers null for a singular matrix instead of infinities', () => {
    expect(invertHomography([1, 0, 0, 2, 0, 0, 0, 0, 1])).toBeNull()
  })

  /**
   * The order of a `matrix3d` is COLUMN-major, which is the usual place to get this
   * wrong. Pinned with a transform whose numbers can be read: the identity, and one
   * that only translates.
   */
  it('the CSS matrix is column-major', () => {
    expect(homographyToCssMatrix([1, 0, 0, 0, 1, 0, 0, 0, 1])).toBe(
      'matrix3d(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1)',
    )
    // A translation lives in the third column of the homography, which becomes the
    // FOURTH group of four in the CSS matrix.
    expect(homographyToCssMatrix([1, 0, 7, 0, 1, 9, 0, 0, 1])).toBe(
      'matrix3d(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 7, 9, 0, 1)',
    )
  })
})

describe('straightenedSize (RF-410)', () => {
  /**
   * The average of opposite sides, which is a decision and not an approximation
   * chosen for convenience: recovering the true proportion needs the focal length,
   * and of the 44 masters only 17 carry one usable while the three canonical
   * keystone photographs carry no EXIF at all.
   */
  it('a rectangle keeps its own size', () => {
    const size = straightenedSize(cornersOfRect({ x: 0.1, y: 0.2, width: 0.5, height: 0.3 }))
    expect(size.width).toBeCloseTo(0.5, 10)
    expect(size.height).toBeCloseTo(0.3, 10)
  })

  it('a keystone averages its two unequal sides', () => {
    const size = straightenedSize(keystone())
    // Top side 0.4 wide, bottom 0.7: the average is 0.55.
    expect(size.width).toBeCloseTo(0.55, 10)
  })

  it('does not depend on which corner is named first', () => {
    // Two corners swapped in a way that keeps the same shape must give the same
    // size: the rule is about the sides, not about the order they were listed in.
    const turned: Corners = {
      nw: { x: 0.15, y: 0.9 },
      ne: { x: 0.85, y: 0.9 },
      se: { x: 0.7, y: 0.15 },
      sw: { x: 0.3, y: 0.15 },
    }
    expect(straightenedSize(turned).width).toBeCloseTo(straightenedSize(keystone()).width, 10)
  })
})

describe('moveCorner (RF-410)', () => {
  /** Las esquinas movidas sin comprobar nada, para poder medir lo que se rechaza. */
  const moveCorner2 = (corners: Corners, key: 'nw' | 'ne' | 'se' | 'sw', point: { x: number; y: number }) => ({
    ...corners,
    [key]: point,
  })

  it('moves the corner asked for and leaves the other three alone', () => {
    const moved = moveCorner(keystone(), 'nw', { x: 0.4, y: 0.25 })!
    expect(moved.nw).toEqual({ x: 0.4, y: 0.25 })
    expect(moved.ne).toEqual(keystone().ne)
    expect(moved.se).toEqual(keystone().se)
    expect(moved.sw).toEqual(keystone().sw)
  })

  it('lets a corner out of the photograph, up to the reach the schema allows', () => {
    const moved = moveCorner(keystone(), 'nw', { x: -0.2, y: -0.1 })!
    expect(moved.nw).toEqual({ x: -0.2, y: -0.1 })
    // And no further: past the reach it is clamped, not refused, so a finger that
    // slips does not lose the drag.
    expect(moveCorner(keystone(), 'nw', { x: -5, y: -5 })!.nw).toEqual({
      x: -CORNER_REACH,
      y: -CORNER_REACH,
    })
  })

  it('refuses the move that would fold the quadrilateral over itself', () => {
    // The top left dragged past the top right: straightening that gives an image
    // doubled over.
    //
    // This case is here because the first version accepted it. The check was the
    // signed area, and this shape scores 0.332 — a self-intersecting polygon keeps a
    // positive area when its larger lobe wins, so the area alone never was a test for
    // crossing. The database had the same hole and it is fixed in its own migration.
    expect(signedArea(moveCorner2(keystone(), 'nw', { x: 0.95, y: 0.16 }))).toBeGreaterThan(0.3)
    expect(moveCorner(keystone(), 'nw', { x: 0.95, y: 0.16 })).toBeNull()
  })

  it('survives a point that is not a number', () => {
    const moved = moveCorner(keystone(), 'se', { x: Number.NaN, y: 0.9 })
    // Not a crash and not a NaN in the row: the coordinate falls back to zero, and
    // whether the result is a quadrilateral is then decided as always.
    expect(moved === null || Number.isFinite(moved.se.x)).toBe(true)
  })
})

describe('cornersOfRect, cornersBoundingBox and isRectangle (RF-410)', () => {
  it('a rectangle survives the round trip through corners', () => {
    const rect = { x: 0.12, y: 0.34, width: 0.5, height: 0.4 }
    const box = cornersBoundingBox(cornersOfRect(rect))
    // Field by field and not `toEqual`: the width comes back as `max - min`, and
    // 0.12 + 0.5 - 0.12 is not bit-exactly 0.5. The round trip is exact to floating
    // point, which is what matters and all that can be claimed.
    expect(box.x).toBeCloseTo(rect.x, 12)
    expect(box.y).toBeCloseTo(rect.y, 12)
    expect(box.width).toBeCloseTo(rect.width, 12)
    expect(box.height).toBeCloseTo(rect.height, 12)
    expect(isRectangle(cornersOfRect(rect))).toBe(true)
  })

  it('the bounding box of a keystone contains it, and is not it', () => {
    const box = cornersBoundingBox(keystone())
    expect(box.x).toBeCloseTo(0.15, 10)
    expect(box.width).toBeCloseTo(0.7, 10)
    expect(isRectangle(keystone())).toBe(false)
  })

  it('corners outside the photograph are legitimate and survive', () => {
    // Five photographs of the catalog have sides of the artwork out of frame, and
    // dragging a handle past the edge is the only way to straighten them.
    const outside: Corners = {
      nw: { x: -0.1, y: -0.05 },
      ne: { x: 1.1, y: 0.02 },
      se: { x: 1.05, y: 1.08 },
      sw: { x: -0.05, y: 1.02 },
    }
    expect(isConvexQuadrilateral(outside)).toBe(true)
    expect(cornersBoundingBox(outside).x).toBeCloseTo(-0.1, 10)
    expect(homographyFromUnitSquare(outside)).not.toBeNull()
  })
})
