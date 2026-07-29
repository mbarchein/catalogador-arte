import { describe, expect, it } from 'vitest'
import {
  MIN_CROP,
  NO_EDIT,
  addRotation,
  centeredCrop,
  clampCrop,
  composeCrop,
  composeEdits,
  cornerPoint,
  cropRectInPixels,
  editFromColumns,
  editSummary,
  editToColumns,
  editedSize,
  fitInside,
  fullCrop,
  isFullCrop,
  isNoEdit,
  loupeRegion,
  moveCrop,
  normalizeEdit,
  normalizeRotation,
  resizeCrop,
  rotateCrop,
  rotatedSize,
  sameEdit,
  swapsSides,
  type Crop,
  type PhotoEdit,
  type Rotation,
} from './imageEdits'

/** Compares fractions without demanding bit equality. */
function expectCrop(actual: Crop | null, expected: Crop) {
  expect(actual).not.toBeNull()
  expect(actual?.x).toBeCloseTo(expected.x, 9)
  expect(actual?.y).toBeCloseTo(expected.y, 9)
  expect(actual?.width).toBeCloseTo(expected.width, 9)
  expect(actual?.height).toBeCloseTo(expected.height, 9)
}

describe('normalizeRotation / addRotation (RF-409)', () => {
  it('only ever produces the four turns the database accepts', () => {
    expect(normalizeRotation(0)).toBe(0)
    expect(normalizeRotation(90)).toBe(90)
    expect(normalizeRotation(360)).toBe(0)
    expect(normalizeRotation(450)).toBe(90)
    // Turning left is what the button on the left does, and it must not store
    // a negative rotation the check constraint would reject.
    expect(normalizeRotation(-90)).toBe(270)
    expect(normalizeRotation(-450)).toBe(270)
  })

  it('accumulates: four taps of the same button come back to the start', () => {
    let rotation = 0
    for (let i = 0; i < 4; i += 1) rotation = addRotation(rotation, 90)
    expect(rotation).toBe(0)
    // Two taps make 180, which is the practical way to reach it.
    expect(addRotation(addRotation(0, 90), 90)).toBe(180)
    // And one to each side cancels out.
    expect(addRotation(addRotation(0, 90), -90)).toBe(0)
  })

  it('survives a non-finite value instead of storing NaN', () => {
    expect(normalizeRotation(Number.NaN)).toBe(0)
    expect(addRotation(90, Number.NaN)).toBe(90)
  })

  it('knows which turns swap the sides of the image', () => {
    expect(swapsSides(90)).toBe(true)
    expect(swapsSides(270)).toBe(true)
    expect(swapsSides(180)).toBe(false)
    expect(swapsSides(0)).toBe(false)
  })
})

describe('rotatedSize', () => {
  it('swaps the sides at 90 and 270, and leaves them at 0 and 180', () => {
    const photo = { width: 4032, height: 3024 }
    expect(rotatedSize(photo, 90)).toEqual({ width: 3024, height: 4032 })
    expect(rotatedSize(photo, 270)).toEqual({ width: 3024, height: 4032 })
    expect(rotatedSize(photo, 180)).toEqual(photo)
    expect(rotatedSize(photo, 0)).toEqual(photo)
  })
})

describe('clampCrop', () => {
  it('leaves a valid rectangle untouched', () => {
    const crop = { x: 0.1, y: 0.2, width: 0.5, height: 0.6 }
    expectCrop(clampCrop(crop), crop)
  })

  it('brings back inside a rectangle that sticks out', () => {
    // Everything the database would reject must be impossible to produce here.
    const fixed = clampCrop({ x: 0.8, y: 0.9, width: 0.5, height: 0.4 })
    expect(fixed.x + fixed.width).toBeLessThanOrEqual(1)
    expect(fixed.y + fixed.height).toBeLessThanOrEqual(1)
    expect(fixed.x).toBeGreaterThanOrEqual(0)
    expect(fixed.y).toBeGreaterThanOrEqual(0)
  })

  it('never returns a degenerate rectangle', () => {
    // The database demands width and height greater than zero: a zero-width
    // crop would produce an empty file discovered only when opening the record.
    const zero = clampCrop({ x: 0.5, y: 0.5, width: 0, height: -1 })
    expect(zero.width).toBeGreaterThan(0)
    expect(zero.height).toBeGreaterThan(0)
    const nan = clampCrop({ x: Number.NaN, y: Number.NaN, width: Number.NaN, height: Number.NaN })
    expect(nan.width).toBeGreaterThan(0)
    expect(nan.height).toBeGreaterThan(0)
  })

  it('honours a minimum side and keeps the rectangle inside the image', () => {
    const small = clampCrop({ x: 0.99, y: 0.99, width: 0.001, height: 0.001 }, MIN_CROP)
    expect(small.width).toBeCloseTo(MIN_CROP, 9)
    expect(small.x + small.width).toBeLessThanOrEqual(1)
  })
})

describe('rotateCrop (rotating must not move the framing)', () => {
  const crop = { x: 0.1, y: 0.2, width: 0.3, height: 0.4 }

  it('maps the top-left region of a clockwise turn', () => {
    // A region near the top-left corner ends up near the top-right one.
    expectCrop(rotateCrop(crop, 90), { x: 1 - 0.2 - 0.4, y: 0.1, width: 0.4, height: 0.3 })
  })

  it('mirrors the rectangle at 180', () => {
    expectCrop(rotateCrop(crop, 180), { x: 1 - 0.1 - 0.3, y: 1 - 0.2 - 0.4, width: 0.3, height: 0.4 })
  })

  it('four quarter turns return the original rectangle', () => {
    let moved = crop
    for (let i = 0; i < 4; i += 1) moved = rotateCrop(moved, 90)
    expectCrop(moved, crop)
  })

  it('turning one way and back is the identity', () => {
    expectCrop(rotateCrop(rotateCrop(crop, 90), -90), crop)
    expectCrop(rotateCrop(rotateCrop(crop, 270), 90), crop)
  })

  it('keeps the whole image whole', () => {
    expect(isFullCrop(rotateCrop(fullCrop(), 90))).toBe(true)
    expect(isFullCrop(rotateCrop(fullCrop(), 270))).toBe(true)
  })
})

describe('composeCrop (a crop of a crop)', () => {
  it('brings the inner rectangle back to the original image', () => {
    const outer = { x: 0.2, y: 0.1, width: 0.5, height: 0.4 }
    // The right-hand half of what was left visible.
    const inner = { x: 0.5, y: 0, width: 0.5, height: 1 }
    expectCrop(composeCrop(outer, inner), { x: 0.45, y: 0.1, width: 0.25, height: 0.4 })
  })

  it('composing with the whole image changes nothing', () => {
    const outer = { x: 0.2, y: 0.1, width: 0.5, height: 0.4 }
    expectCrop(composeCrop(outer, fullCrop()), outer)
  })

  it('never grows: cropping twice keeps shrinking', () => {
    const outer = { x: 0.1, y: 0.1, width: 0.6, height: 0.6 }
    const result = composeCrop(outer, { x: 0.1, y: 0.1, width: 0.8, height: 0.8 })
    expect(result.width).toBeLessThan(outer.width)
    expect(result.x).toBeGreaterThanOrEqual(outer.x)
    expect(result.x + result.width).toBeLessThanOrEqual(outer.x + outer.width + 1e-9)
  })
})

describe('composeEdits (the editor works on an already edited photo)', () => {
  it('adds nothing when there is nothing to add', () => {
    expect(composeEdits(NO_EDIT, NO_EDIT)).toEqual({ rotation: 0, crop: null })
  })

  it('keeps the previous edit when the second one is empty', () => {
    const base = { rotation: 90 as const, crop: { x: 0.1, y: 0.1, width: 0.5, height: 0.5 } }
    const result = composeEdits(base, NO_EDIT)
    expect(result.rotation).toBe(90)
    expectCrop(result.crop, base.crop)
  })

  it('accumulates the rotation', () => {
    expect(composeEdits({ rotation: 270, crop: null }, { rotation: 180, crop: null }).rotation).toBe(90)
  })

  it('carries the previous crop through the new rotation (90 with a crop)', () => {
    // The photo was cropped and is now turned: without moving the rectangle
    // through the turn, the framing would end up somewhere else on the artwork.
    const base = { rotation: 0 as const, crop: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 } }
    const result = composeEdits(base, { rotation: 90, crop: null })
    expect(result.rotation).toBe(90)
    expectCrop(result.crop, rotateCrop(base.crop, 90))
  })

  it('composes a crop made over what a previous crop left visible', () => {
    const base = { rotation: 0 as const, crop: { x: 0.2, y: 0.2, width: 0.4, height: 0.4 } }
    const result = composeEdits(base, {
      rotation: 0,
      crop: { x: 0.5, y: 0.5, width: 0.5, height: 0.5 },
    })
    expectCrop(result.crop, { x: 0.4, y: 0.4, width: 0.2, height: 0.2 })
  })

  it('rotates and crops in one go, in the canonical order', () => {
    // Cropping and then turning is the same as turning and cropping the turned
    // region: that identity is what lets the pair of columns describe any
    // sequence of gestures.
    const base = { rotation: 90 as const, crop: { x: 0.1, y: 0.1, width: 0.6, height: 0.5 } }
    const extra = { rotation: 90 as const, crop: { x: 0, y: 0, width: 0.5, height: 0.5 } }
    const result = composeEdits(base, extra)
    expect(result.rotation).toBe(180)
    const carried = rotateCrop(base.crop, 90)
    expectCrop(result.crop, composeCrop(carried, extra.crop))
  })

  it('produces a rectangle the database would accept even after many gestures', () => {
    let edit = { rotation: 0, crop: null } as ReturnType<typeof composeEdits>
    for (let i = 0; i < 12; i += 1) {
      edit = composeEdits(edit, {
        rotation: 90,
        crop: { x: 0.05, y: 0.05, width: 0.9, height: 0.9 },
      })
    }
    expect([0, 90, 180, 270]).toContain(edit.rotation)
    expect(edit.crop?.x).toBeGreaterThanOrEqual(0)
    expect((edit.crop?.x ?? 0) + (edit.crop?.width ?? 0)).toBeLessThanOrEqual(1)
    expect(edit.crop?.width).toBeGreaterThan(0)
  })

  it('a degenerate crop comes out drawable, not as an empty rectangle', () => {
    const result = composeEdits(NO_EDIT, { rotation: 0, crop: { x: 0.5, y: 0.5, width: 0, height: 0 } })
    expect(result.crop?.width).toBeGreaterThan(0)
    expect(result.crop?.height).toBeGreaterThan(0)
  })
})

describe('isNoEdit / sameEdit (not rewriting files for nothing)', () => {
  it('a crop covering everything is not a crop', () => {
    expect(isNoEdit({ rotation: 0, crop: fullCrop() })).toBe(true)
    expect(isNoEdit(NO_EDIT)).toBe(true)
    expect(isNoEdit({ rotation: 90, crop: null })).toBe(false)
    expect(isNoEdit({ rotation: 0, crop: centeredCrop(0.5) })).toBe(false)
  })

  it('two ways of writing the same framing compare equal', () => {
    // Opening the editor, looking and applying must not rewrite files: each
    // rewrite leaves the previous ones orphaned in the bucket.
    expect(sameEdit({ rotation: 0, crop: fullCrop() }, NO_EDIT)).toBe(true)
    // 360 cannot be typed as a Rotation, but it can arrive from a row or from
    // an accumulated turn, and it means "not turned".
    expect(sameEdit({ rotation: 360 as Rotation, crop: null }, NO_EDIT)).toBe(true)
    expect(
      sameEdit(
        { rotation: 90, crop: { x: 0.1, y: 0.2, width: 0.5, height: 0.5 } },
        { rotation: 90, crop: { x: 0.1 + 1e-9, y: 0.2, width: 0.5, height: 0.5 } },
      ),
    ).toBe(true)
  })

  it('a different framing is different', () => {
    expect(sameEdit({ rotation: 90, crop: null }, { rotation: 270, crop: null })).toBe(false)
    expect(sameEdit(NO_EDIT, { rotation: 0, crop: centeredCrop(0.9) })).toBe(false)
    expect(
      sameEdit(
        { rotation: 0, crop: { x: 0.1, y: 0.1, width: 0.5, height: 0.5 } },
        { rotation: 0, crop: { x: 0.1, y: 0.1, width: 0.5, height: 0.4 } },
      ),
    ).toBe(false)
  })
})

describe('cropRectInPixels / editedSize', () => {
  it('turns fractions into whole pixels inside the image', () => {
    const rect = cropRectInPixels({ x: 0.25, y: 0.5, width: 0.5, height: 0.5 }, { width: 2000, height: 1000 })
    expect(rect).toEqual({ x: 500, y: 500, width: 1000, height: 500 })
  })

  it('never leaves the image, however the fractions round', () => {
    const rect = cropRectInPixels({ x: 0.999, y: 0.999, width: 0.5, height: 0.5 }, { width: 101, height: 51 })
    expect(rect.x + rect.width).toBeLessThanOrEqual(101)
    expect(rect.y + rect.height).toBeLessThanOrEqual(51)
    expect(rect.width).toBeGreaterThanOrEqual(1)
    expect(rect.height).toBeGreaterThanOrEqual(1)
  })

  it('never returns a zero side: the canvas would fail to draw', () => {
    const rect = cropRectInPixels({ x: 0, y: 0, width: 0.0001, height: 0.0001 }, { width: 400, height: 300 })
    expect(rect.width).toBeGreaterThanOrEqual(1)
    expect(rect.height).toBeGreaterThanOrEqual(1)
  })

  it('the edited size accounts for the turn and the crop together', () => {
    const master = { width: 4032, height: 3024 }
    expect(editedSize(master, NO_EDIT)).toEqual(master)
    expect(editedSize(master, { rotation: 90, crop: null })).toEqual({ width: 3024, height: 4032 })
    // Turned and then cropped to half of each side of the TURNED image.
    expect(editedSize(master, { rotation: 90, crop: { x: 0, y: 0, width: 0.5, height: 0.5 } })).toEqual({
      width: 1512,
      height: 2016,
    })
  })
})

describe('fitInside (the working surface of the editor)', () => {
  it('fits by the limiting side', () => {
    expect(fitInside({ width: 4000, height: 2000 }, { width: 400, height: 400 })).toEqual({
      width: 400,
      height: 200,
    })
    expect(fitInside({ width: 2000, height: 4000 }, { width: 400, height: 400 })).toEqual({
      width: 200,
      height: 400,
    })
  })

  it('does upscale: a small photo must still be grabbable with a thumb', () => {
    expect(fitInside({ width: 100, height: 50 }, { width: 400, height: 400 })).toEqual({
      width: 400,
      height: 200,
    })
  })

  it('answers zero instead of NaN before the image or the box are measured', () => {
    expect(fitInside({ width: 0, height: 0 }, { width: 400, height: 400 })).toEqual({ width: 0, height: 0 })
    expect(fitInside({ width: 400, height: 400 }, { width: 0, height: 0 })).toEqual({ width: 0, height: 0 })
  })
})

describe('resizeCrop (dragging a corner)', () => {
  const crop = { x: 0.2, y: 0.2, width: 0.6, height: 0.6 }

  it('moves the dragged corner and leaves the opposite one where it was', () => {
    const result = resizeCrop(crop, 'se', { x: 0.5, y: 0.5 })
    expectCrop(result, { x: 0.2, y: 0.2, width: 0.3, height: 0.3 })
    const nw = resizeCrop(crop, 'nw', { x: 0.4, y: 0.3 })
    expectCrop(nw, { x: 0.4, y: 0.3, width: 0.4, height: 0.5 })
  })

  it('stops at the edge of the image instead of leaving it', () => {
    const result = resizeCrop(crop, 'se', { x: 5, y: 5 })
    expect(result.x + result.width).toBeCloseTo(1, 9)
    expect(result.y + result.height).toBeCloseTo(1, 9)
    const nw = resizeCrop(crop, 'nw', { x: -3, y: -3 })
    expect(nw.x).toBe(0)
    expect(nw.y).toBe(0)
  })

  it('does not flip inside out when the thumb overshoots the opposite corner', () => {
    // On a phone this is not a hypothesis: a finger crossing the rectangle is
    // the normal end of a fast gesture.
    const result = resizeCrop(crop, 'se', { x: 0, y: 0 })
    expect(result.width).toBeGreaterThanOrEqual(MIN_CROP - 1e-9)
    expect(result.height).toBeGreaterThanOrEqual(MIN_CROP - 1e-9)
    expect(result.x).toBeCloseTo(0.2, 9)
    expect(result.y).toBeCloseTo(0.2, 9)
  })

  it('respects the minimum side dragging the north-west corner too', () => {
    const result = resizeCrop(crop, 'nw', { x: 1, y: 1 })
    expect(result.width).toBeGreaterThanOrEqual(MIN_CROP - 1e-9)
    expect(result.x + result.width).toBeCloseTo(0.8, 9)
  })

  it('works on the two remaining corners', () => {
    expectCrop(resizeCrop(crop, 'ne', { x: 0.9, y: 0.1 }), {
      x: 0.2,
      y: 0.1,
      width: 0.7,
      height: 0.7,
    })
    expectCrop(resizeCrop(crop, 'sw', { x: 0.1, y: 0.9 }), {
      x: 0.1,
      y: 0.2,
      width: 0.7,
      height: 0.7,
    })
  })
})

describe('cornerPoint', () => {
  it('locates the four corners, which is where the handles go', () => {
    const crop = { x: 0.2, y: 0.3, width: 0.5, height: 0.4 }
    expect(cornerPoint(crop, 'nw')).toEqual({ x: 0.2, y: 0.3 })
    expect(cornerPoint(crop, 'ne')).toEqual({ x: 0.7, y: 0.3 })
    expect(cornerPoint(crop, 'sw')).toEqual({ x: 0.2, y: 0.7 })
    expect(cornerPoint(crop, 'se')).toEqual({ x: 0.7, y: 0.7 })
  })

  it('dragging a corner to where it already is changes nothing', () => {
    const crop = { x: 0.2, y: 0.3, width: 0.5, height: 0.4 }
    for (const corner of ['nw', 'ne', 'sw', 'se'] as const) {
      expectCrop(resizeCrop(crop, corner, cornerPoint(crop, corner)), crop)
    }
  })
})

describe('RF-410: loupeRegion (magnifying the corner under the finger)', () => {
  const size = { width: 1000, height: 800 }
  const crop = { x: 0.2, y: 0.3, width: 0.5, height: 0.4 }

  it('centers the square on the corner, in pixels of the original', () => {
    // The «se» corner sits at (0.7, 0.7) of the image, which is (700, 560) px.
    const region = loupeRegion(size, 0, crop, 'se', 40)
    expect(region.x).toBeCloseTo(680, 6)
    expect(region.y).toBeCloseTo(540, 6)
    expect(region.width).toBeCloseTo(40, 6)
    expect(region.height).toBeCloseTo(40, 6)
  })

  it('follows the corner through the rotation, because the crop is over the rotated image', () => {
    // Turned 90° clockwise the image is 800x1000, and the «nw» corner of the
    // crop — (0.2, 0.3) there, that is (160, 300) px — comes from (300, 640) of
    // the original: turning clockwise sends (x, y) to (height - y, x).
    const region = loupeRegion(size, 90, crop, 'nw', 40)
    expect(region.x + region.width / 2).toBeCloseTo(300, 6)
    expect(region.y + region.height / 2).toBeCloseTo(640, 6)
  })

  it('shows a square of the same pixels whatever the rotation', () => {
    for (const rotation of [0, 90, 180, 270] as const) {
      const region = loupeRegion(size, rotation, crop, 'ne', 60)
      expect(region.width).toBeCloseTo(60, 6)
      expect(region.height).toBeCloseTo(60, 6)
    }
  })

  it('lets the square poke outside the image instead of sliding it inwards', () => {
    // With the corner on the edge of the photograph, half the loupe has nothing
    // to show. Moving the region to fill it would take the corner off the centre
    // of the loupe, and the crosshair drawn there would point somewhere else.
    const region = loupeRegion(size, 0, { x: 0, y: 0, width: 0.5, height: 0.5 }, 'nw', 40)
    expect(region.x).toBe(-20)
    expect(region.y).toBe(-20)
  })

  it('survives a degenerate crop without producing nonsense', () => {
    const region = loupeRegion(size, 0, { x: 0.5, y: 0.5, width: 0, height: 0 }, 'se', 40)
    expect(Number.isFinite(region.x)).toBe(true)
    expect(Number.isFinite(region.y)).toBe(true)
    expect(region.width).toBe(40)
  })
})

describe('moveCrop (dragging the whole rectangle)', () => {
  it('slides the rectangle keeping its size', () => {
    const result = moveCrop({ x: 0.2, y: 0.2, width: 0.4, height: 0.4 }, 0.1, -0.1)
    expectCrop(result, { x: 0.3, y: 0.1, width: 0.4, height: 0.4 })
  })

  it('stops at the edges instead of shrinking', () => {
    const result = moveCrop({ x: 0.2, y: 0.2, width: 0.4, height: 0.4 }, 1, 1)
    expectCrop(result, { x: 0.6, y: 0.6, width: 0.4, height: 0.4 })
  })
})

describe('the edit as data (columns of the images row)', () => {
  it('writes four nulls when there is no crop, never half a rectangle', () => {
    expect(editToColumns({ rotation: 90, crop: null })).toEqual({
      rotation: 90,
      crop_x: null,
      crop_y: null,
      crop_width: null,
      crop_height: null,
    })
    // A crop covering everything is stored as no crop: it is what it means.
    expect(editToColumns({ rotation: 0, crop: fullCrop() }).crop_x).toBeNull()
  })

  it('writes the four fractions of a real crop, rounded', () => {
    const columns = editToColumns({
      rotation: 270,
      crop: { x: 1 / 3, y: 0.2, width: 0.5, height: 0.25 },
    })
    expect(columns.rotation).toBe(270)
    expect(columns.crop_x).toBeCloseTo(0.333333, 6)
    expect(columns.crop_width).toBe(0.5)
  })

  it('reads back what it wrote', () => {
    const edit = { rotation: 180 as const, crop: { x: 0.1, y: 0.2, width: 0.5, height: 0.6 } }
    const back = editFromColumns(editToColumns(edit))
    expect(back.rotation).toBe(180)
    expectCrop(back.crop, edit.crop)
  })

  it('a row from before this feature reads as no edit', () => {
    expect(editFromColumns(null)).toEqual({ rotation: 0, crop: null })
    expect(editFromColumns({})).toEqual({ rotation: 0, crop: null })
    expect(editFromColumns({ rotation: 90 })).toEqual({ rotation: 90, crop: null })
  })

  it('a half-written crop is ignored rather than drawn wrong', () => {
    // The database cannot hold this, but a stale client or a manual fix could
    // send it: showing the photo unframed beats not showing it.
    expect(editFromColumns({ rotation: 0, crop_x: 0.1, crop_y: 0.1 })).toEqual({
      rotation: 0,
      crop: null,
    })
  })
})

describe('normalizeEdit / editSummary', () => {
  it('reduces the rotation and drops a crop that crops nothing', () => {
    expect(normalizeEdit({ rotation: 450 as Rotation, crop: fullCrop() })).toEqual({
      rotation: 90,
      crop: null,
    })
  })

  it('says in Spanish what was done, or nothing when nothing was', () => {
    expect(editSummary(NO_EDIT)).toBeNull()
    expect(editSummary({ rotation: 90, crop: null })).toBe('Girada 90°')
    const summary = editSummary({ rotation: 0, crop: { x: 0, y: 0, width: 0.5, height: 0.5 } })
    expect(summary).toContain('Recortada')
    expect(summary).toContain('25')
    expect(editSummary({ rotation: 180, crop: centeredCrop(0.5) })).toMatch(/^Girada 180° · Recortada/)
  })
})

describe('el original siempre se puede recuperar', () => {
  const stored: PhotoEdit = { rotation: 90, crop: { x: 0.3, y: 0.3, width: 0.3, height: 0.3 } }

  it('reeditar sobre el máster REEMPLAZA el encuadre, no lo compone', () => {
    // With the master as source the editor opens with baked = NO_EDIT, so what
    // it returns is what gets stored: composing is the identity.
    const widened: PhotoEdit = { rotation: 90, crop: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 } }
    expect(composeEdits(NO_EDIT, widened)).toEqual(widened)

    // And that is the whole point: the new crop is WIDER than the stored one,
    // which composing onto it could never produce.
    const composed = composeEdits(stored, widened)
    expect(composed.crop!.width).toBeLessThan(widened.crop!.width)
  })

  it('el recorte nuevo no tiene que solaparse con el anterior', () => {
    const elsewhere: PhotoEdit = { rotation: 0, crop: { x: 0.7, y: 0.7, width: 0.3, height: 0.3 } }
    expect(composeEdits(NO_EDIT, elsewhere)).toEqual(elsewhere)
  })

  it('volver al original deja la fila sin encuadre: cuatro nulos y sin giro', () => {
    const columns = editToColumns(NO_EDIT)
    expect(columns).toEqual({
      rotation: 0,
      crop_x: null,
      crop_y: null,
      crop_width: null,
      crop_height: null,
    })
    expect(isNoEdit(editFromColumns(columns))).toBe(true)
  })

  it('el recorte completo es no tener recorte: no encoge nada', () => {
    expect(isNoEdit({ rotation: 0, crop: fullCrop() })).toBe(true)
  })

  // ── Modo degradado: la copia de consulta ya trae el recorte ──
  it('desde la copia de consulta el recorte solo puede encoger', () => {
    const relative: PhotoEdit = { rotation: 0, crop: { x: 0, y: 0, width: 1, height: 1 } }
    // Asking for the whole (degraded) image keeps the stored crop untouched:
    // the row never claims «sin recorte» over an already cropped file.
    expect(composeEdits(stored, relative)).toEqual(normalizeEdit(stored))
    expect(composeEdits(stored, NO_EDIT)).toEqual(normalizeEdit(stored))
  })

  it('desde la copia de consulta, recortar más sigue siendo relativo al máster', () => {
    const half: PhotoEdit = { rotation: 0, crop: { x: 0, y: 0, width: 0.5, height: 0.5 } }
    const absolute = composeEdits(stored, half)
    // Half of a 0.3-wide crop is 0.15 of the master, not 0.5.
    expect(absolute.crop!.width).toBeCloseTo(0.15, 5)
    expect(absolute.rotation).toBe(90)
  })
})
