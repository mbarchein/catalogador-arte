import { describe, expect, it } from 'vitest'
import { cornersOfRect } from './perspective'
import {
  COLOR_RANGES,
  GRAY_LABEL,
  NO_COLOR,
  buildColorLuts,
  normalizeColor,
  type ColorEdit,
  type ColorParam,
} from './imageColor'
import {
  COLOR_PARAM_ORDER,
  MIN_CROP,
  NO_EDIT,
  addRotation,
  centeredCrop,
  clampCrop,
  colorAvailability,
  colorParamsForShotType,
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
  inheritColor,
  isFullCrop,
  isInheritedColor,
  isNoEdit,
  loupeRegion,
  moveCrop,
  normalizeEdit,
  normalizeRotation,
  resizeCrop,
  restrictColorToShotType,
  rotateCrop,
  rotateEdit,
  rotatedSize,
  sameEdit,
  swapsSides,
  withOwnColor,
  type Crop,
  type PhotoEdit,
  type Rotation,
} from './imageEdits'

/**
 * Las catorce columnas de color en su valor identidad: lo que escribe una fotografía
 * sin ajuste.
 *
 * Escritas a mano y no con `colorToColumns`, para que los nombres que se comprueban
 * sean los de la migración y no los que este módulo diga que son.
 */
const SIN_COLOR = {
  color_temperature: null,
  color_tint: null,
  color_exposure: null,
  color_black: null,
  color_white: null,
  color_gamma: null,
  color_shoulder: null,
  color_gray: false,
  color_neutral_x: null,
  color_neutral_y: null,
  color_source: null,
  color_reference: null,
  color_light: null,
  color_inherited: false,
}

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

describe('rotateEdit: todo lo dibujado sobre la foto gira con ella (RF-410)', () => {
  // A crooked painting, which is when there are four corners and not a rectangle.
  const corners = {
    nw: { x: 0.175, y: 0.1 },
    ne: { x: 0.875, y: 0.18 },
    se: { x: 0.86, y: 0.87 },
    sw: { x: 0.15, y: 0.78 },
  }

  it('gira las esquinas, y no solo el giro y el recorte', () => {
    // La incidencia: el editor giraba el giro, el recorte y los candidatos uno a
    // uno, y se dejaba las esquinas. Girar una foto ya enderezada dejaba el
    // cuadrilátero en el marco anterior, transpuesto sobre un cuadro que se había
    // movido.
    const turned = rotateEdit({ rotation: 0, crop: null, corners }, 90)
    expect(turned.rotation).toBe(90)
    expect(turned.corners).not.toBeNull()
    // A quarter turn clockwise: (x, y) → (1 − y, x), and the name
    // travels — the one that was north-west turns up at the north-east.
    expect(turned.corners!.ne.x).toBeCloseTo(1 - corners.nw.y, 6)
    expect(turned.corners!.ne.y).toBeCloseTo(corners.nw.x, 6)
  })

  it('cuatro cuartos de vuelta devuelven el encuadre intacto', () => {
    let edit: PhotoEdit = {
      rotation: 0,
      crop: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 },
      corners,
    }
    for (let i = 0; i < 4; i += 1) edit = rotateEdit(edit, 90)
    expect(edit.rotation).toBe(0)
    expectCrop(edit.crop, { x: 0.1, y: 0.2, width: 0.3, height: 0.4 })
    for (const key of ['nw', 'ne', 'se', 'sw'] as const) {
      expect(edit.corners![key].x).toBeCloseTo(corners[key].x, 6)
      expect(edit.corners![key].y).toBeCloseTo(corners[key].y, 6)
    }
  })

  it('sin encuadre no inventa ninguno', () => {
    const turned = rotateEdit({ rotation: 270, crop: null, corners: null }, 90)
    expect(turned).toEqual({ rotation: 0, crop: null, corners: null, color: NO_COLOR })
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
    expect(composeEdits(NO_EDIT, NO_EDIT)).toEqual({
      rotation: 0,
      crop: null,
      corners: null,
      color: NO_COLOR,
    })
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
    const region = loupeRegion(size, 0, cornerPoint(crop, 'se'), 40)
    expect(region.x).toBeCloseTo(680, 6)
    expect(region.y).toBeCloseTo(540, 6)
    expect(region.width).toBeCloseTo(40, 6)
    expect(region.height).toBeCloseTo(40, 6)
  })

  it('follows the corner through the rotation, because the crop is over the rotated image', () => {
    // Turned 90° clockwise the image is 800x1000, and the «nw» corner of the
    // crop — (0.2, 0.3) there, that is (160, 300) px — comes from (300, 640) of
    // the original: turning clockwise sends (x, y) to (height - y, x).
    const region = loupeRegion(size, 90, cornerPoint(crop, 'nw'), 40)
    expect(region.x + region.width / 2).toBeCloseTo(300, 6)
    expect(region.y + region.height / 2).toBeCloseTo(640, 6)
  })

  it('shows a square of the same pixels whatever the rotation', () => {
    for (const rotation of [0, 90, 180, 270] as const) {
      const region = loupeRegion(size, rotation, cornerPoint(crop, 'ne'), 60)
      expect(region.width).toBeCloseTo(60, 6)
      expect(region.height).toBeCloseTo(60, 6)
    }
  })

  it('lets the square poke outside the image instead of sliding it inwards', () => {
    // With the corner on the edge of the photograph, half the loupe has nothing
    // to show. Moving the region to fill it would take the corner off the centre
    // of the loupe, and the crosshair drawn there would point somewhere else.
    const region = loupeRegion(size, 0, { x: 0, y: 0 }, 40)
    expect(region.x).toBe(-20)
    expect(region.y).toBe(-20)
  })

  it('survives a degenerate crop without producing nonsense', () => {
    const region = loupeRegion(size, 0, { x: 0.5, y: 0.5 }, 40)
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

/** The eight corner columns null: what a frame with no perspective writes. */
const SIN_ESQUINAS = {
  corner_nw_x: null,
  corner_nw_y: null,
  corner_ne_x: null,
  corner_ne_y: null,
  corner_se_x: null,
  corner_se_y: null,
  corner_sw_x: null,
  corner_sw_y: null,
}

describe('el encuadre por esquinas (RF-410)', () => {
  /** A trapezium: the top side narrower than the bottom one. */
  const trapecio = {
    nw: { x: 0.3, y: 0.15 },
    ne: { x: 0.7, y: 0.15 },
    se: { x: 0.85, y: 0.9 },
    sw: { x: 0.15, y: 0.9 },
  }

  it('las esquinas mandan sobre el recorte, y no se escriben las dos cosas', () => {
    // Las dos columnas pueden convivir en una FILA —es lo que deja el despliegue en
    // una fase— pero un encuadre concreto es una cosa o la otra: escribir además un
    // rectángulo sería escribir algo que el renderizador va a ignorar.
    const columns = editToColumns({ rotation: 0, crop: fullCrop(), corners: trapecio })
    expect(columns.corner_nw_x).toBeCloseTo(0.3, 6)
    expect(columns.crop_x).toBeNull()
    expect(columns.crop_width).toBeNull()
  })

  it('unas esquinas que son un rectángulo se guardan como recorte', () => {
    // Enderezar remuestrea cada píxel, así que hacerlo para un cuadrilátero que ES
    // un rectángulo costaría nitidez a cambio de nada. Y evita que una fotografía
    // cuyas asas se arrastraron y se devolvieron quede registrada como «corregida».
    const columns = editToColumns({
      rotation: 0,
      crop: null,
      corners: cornersOfRect({ x: 0.2, y: 0.1, width: 0.5, height: 0.6 }),
    })
    expect(columns.corner_nw_x).toBeNull()
    expect(columns.crop_x).toBeCloseTo(0.2, 6)
    expect(columns.crop_height).toBeCloseTo(0.6, 6)
  })

  it('ida y vuelta por las columnas sin perder la forma', () => {
    const edit: PhotoEdit = { rotation: 90, crop: null, corners: trapecio }
    const back = editFromColumns(editToColumns(edit))
    expect(back.rotation).toBe(90)
    expect(back.corners).not.toBeNull()
    expect(back.corners!.se.x).toBeCloseTo(trapecio.se.x, 6)
    expect(sameEdit(edit, back)).toBe(true)
  })

  it('una fila con esquinas a medias se lee como recorte, no como cuadrilátero roto', () => {
    // La base no puede haber aceptado esa fila, así que si aparece es un dato
    // corrupto: leerla como el recorte que sí tiene es mejor que enderezar con tres
    // esquinas.
    const back = editFromColumns({
      rotation: 0,
      crop_x: 0.1,
      crop_y: 0.1,
      crop_width: 0.5,
      crop_height: 0.5,
      corner_nw_x: 0.1,
      corner_nw_y: 0.1,
    })
    expect(back.corners).toBeNull()
    expect(back.crop?.width).toBeCloseTo(0.5, 6)
  })

  it('una fila con un cuadrilátero cruzado se lee sin enderezar', () => {
    // Straightening a bow tie gives an image folded over itself. Showing the photograph
    // uncorrected is always better than that.
    const back = editFromColumns({
      rotation: 0,
      corner_nw_x: 0.8, corner_nw_y: 0.2,
      corner_ne_x: 0.2, corner_ne_y: 0.2,
      corner_se_x: 0.8, corner_se_y: 0.8,
      corner_sw_x: 0.2, corner_sw_y: 0.8,
    })
    expect(back.corners).toBeNull()
    expect(back.crop).toBeNull()
  })

  it('el tamaño de salida es el rectángulo enderezado', () => {
    // The trapezium measures 0.4 at the top and 0.7 at the bottom: the mean is 0.55 of the width.
    const size = editedSize({ width: 2000, height: 1000 }, { rotation: 0, crop: null, corners: trapecio })
    expect(size.width).toBe(Math.round(0.55 * 2000))
  })

  /**
   * Este caso afirmaba lo contrario y por eso pasaba mientras la función estaba
   * rota: decía que componer perspectiva SIEMPRE lanza. Pero `composeEdits` se
   * llama en cada guardado, también desde el máster, y ahí no hay nada sobre lo que
   * componer — así que aplicar la primera corrección de perspectiva lanzaba. Lo
   * imposible es la perspectiva sobre algo ya incrustado, no la perspectiva.
   */
  it('desde el máster, la perspectiva pasa tal cual: no hay nada que componer', () => {
    const perspectiva: PhotoEdit = { rotation: 0, crop: null, corners: trapecio }
    const compuesta = composeEdits(NO_EDIT, perspectiva)
    expect(compuesta.corners).not.toBeNull()
    expect(sameEdit(compuesta, perspectiva)).toBe(true)
  })

  it('pero sobre un encuadre ya incrustado se rechaza', () => {
    // La vía degradada: el máster no se pudo descargar y la copia de consulta ya
    // viene recortada. Un segundo warp iría sobre píxeles ya interpolados y la fila
    // dejaría de decir la verdad sobre el máster.
    const horneado: PhotoEdit = { rotation: 0, crop: { x: 0.1, y: 0.1, width: 0.6, height: 0.6 } }
    expect(() => composeEdits(horneado, { rotation: 0, crop: null, corners: trapecio })).toThrow()
    // And over an already straightened base, anything: there is no way of expressing a
    // frame over the master starting from a rectified image.
    expect(() => composeEdits({ rotation: 0, crop: null, corners: trapecio }, NO_EDIT)).toThrow()
  })

  it('y el resumen lo dice en español', () => {
    expect(editSummary({ rotation: 0, crop: null, corners: trapecio })).toMatch(/Perspectiva corregida/)
  })

  /**
   * Incidencia: el editor mostraba «Sin cambios» mientras la perspectiva estaba
   * corregida en pantalla.
   *
   * La causa no estaba aquí —`editSummary` describe las esquinas desde el primer
   * día— sino en la cabecera del editor, que construía su propio objeto con el giro
   * y el recorte y **se dejaba las esquinas fuera**. Este caso fija las dos mitades
   * del contrato: qué tiene que decir una edición que solo trae esquinas, y que
   * omitir el campo es exactamente lo que producía el «Sin cambios». Así, quien
   * vuelva a pasar una edición a medias verá aquí escrito lo que se rompe.
   */
  it('la perspectiva sola ya es un cambio, y omitir las esquinas es lo que lo silenciaba', () => {
    const soloPerspectiva: PhotoEdit = { rotation: 0, crop: null, corners: trapecio }
    expect(editSummary(soloPerspectiva)).not.toBeNull()
    // What the user was seeing: the same frame without the corners field
    // describes nothing, and the heading paints it as «Sin cambios».
    expect(editSummary({ rotation: soloPerspectiva.rotation, crop: soloPerspectiva.crop })).toBeNull()
    // And what is shown describes what is stored: the summary of the edit in
    // progress and that of its canonical form are the same text.
    expect(editSummary(soloPerspectiva)).toBe(editSummary(normalizeEdit(soloPerspectiva)))
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
      ...SIN_ESQUINAS,
      ...SIN_COLOR,
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
    expect(editFromColumns(null)).toEqual({ rotation: 0, crop: null, corners: null, color: NO_COLOR })
    expect(editFromColumns({})).toEqual({ rotation: 0, crop: null, corners: null, color: NO_COLOR })
    expect(editFromColumns({ rotation: 90 })).toEqual({
      rotation: 90,
      crop: null,
      corners: null,
      color: NO_COLOR,
    })
  })

  it('a half-written crop is ignored rather than drawn wrong', () => {
    // The database cannot hold this, but a stale client or a manual fix could
    // send it: showing the photo unframed beats not showing it.
    expect(editFromColumns({ rotation: 0, crop_x: 0.1, crop_y: 0.1 })).toEqual({
      corners: null,
      rotation: 0,
      crop: null,
      color: NO_COLOR,
    })
  })
})

describe('normalizeEdit / editSummary', () => {
  it('reduces the rotation and drops a crop that crops nothing', () => {
    expect(normalizeEdit({ rotation: 450 as Rotation, crop: fullCrop() })).toEqual({
      rotation: 90,
      crop: null,
      corners: null,
      color: NO_COLOR,
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
    expect(composeEdits(NO_EDIT, widened)).toEqual({ ...widened, corners: null, color: NO_COLOR })

    // And that is the whole point: the new crop is WIDER than the stored one,
    // which composing onto it could never produce.
    const composed = composeEdits(stored, widened)
    expect(composed.crop!.width).toBeLessThan(widened.crop!.width)
  })

  it('el recorte nuevo no tiene que solaparse con el anterior', () => {
    const elsewhere: PhotoEdit = { rotation: 0, crop: { x: 0.7, y: 0.7, width: 0.3, height: 0.3 } }
    expect(composeEdits(NO_EDIT, elsewhere)).toEqual({
      ...elsewhere,
      corners: null,
      color: NO_COLOR,
    })
  })

  it('volver al original deja la fila sin encuadre NI COLOR: todo a nulo y sin giro', () => {
    // «Volver al original» limpia también el color (RF-414): si dejara el ajuste
    // puesto, la fila diría que la fotografía está corregida mientras los ficheros se
    // regeneran desde el máster sin tocar.
    const columns = editToColumns(NO_EDIT)
    expect(columns).toEqual({
      rotation: 0,
      crop_x: null,
      crop_y: null,
      crop_width: null,
      crop_height: null,
      ...SIN_ESQUINAS,
      ...SIN_COLOR,
    })
    expect(isNoEdit(editFromColumns(columns))).toBe(true)
  })

  it('el recorte completo es no tener recorte: no encoge nada', () => {
    expect(isNoEdit({ rotation: 0, crop: fullCrop() })).toBe(true)
  })

  // ── Degraded mode: the reference copy already carries the crop ──
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

/* ================================================================= colour */

/**
 * Un ajuste real de los que salen de un almacén con bombilla: dominante cálida
 * corregida con el cuentagotas, medio paso de exposición y el rango tonal recogido.
 */
const AJUSTE: ColorEdit = normalizeColor({
  temperature: -34,
  tint: -5,
  exposure: 1 / 3,
  blackPoint: 6,
  whitePoint: 248,
  gamma: 1.1,
  shoulder: 20,
  neutral: { x: 0.32, y: 0.71 },
  source: 'NEUTRAL_PICKED',
  reference: 'SCENE',
  light: 'INCANDESCENT',
})

/** A crooked painting, to check that colour coexists with the corners. */
const TORCIDO = {
  nw: { x: 0.3, y: 0.15 },
  ne: { x: 0.7, y: 0.15 },
  se: { x: 0.85, y: 0.9 },
  sw: { x: 0.15, y: 0.9 },
}

describe('el color entra en el modelo de edición (RF-414)', () => {
  it('NO_EDIT trae el color neutro, y una edición sin color se lee igual', () => {
    expect(NO_EDIT.color).toEqual(NO_COLOR)
    expect(isNoEdit(NO_EDIT)).toBe(true)
    // Without the field and with the field neutral are the same thing: the same pixels and the same
    // row, which is what avoids rewriting files over a difference that cannot be seen.
    expect(normalizeEdit({ rotation: 0, crop: null }).color).toEqual(NO_COLOR)
    expect(sameEdit({ rotation: 0, crop: null }, NO_EDIT)).toBe(true)
  })

  it('normalizeEdit deja el color en su forma canónica y no lo anula nunca', () => {
    const normalized = normalizeEdit({ rotation: 0, crop: null, color: { temperature: 12 } })
    expect(normalized.color.temperature).toBe(12)
    expect(normalized.color.gamma).toBe(1)
    // Un color neutro NO es la ausencia de color: puede estar diciendo «se miró con la
    // obra delante y se dejó como estaba», que es trabajo hecho. «Sin revisar» no es
    // «no», y anularlo aquí borraría justo eso.
    const reviewed = normalizeEdit({ rotation: 0, crop: null, color: { source: 'REVIEWED_UNCHANGED' } })
    expect(reviewed.color.source).toBe('REVIEWED_UNCHANGED')
    // And, for the pixels, it is still not a change: no file gets regenerated.
    expect(isNoEdit(reviewed)).toBe(true)
  })

  it('un valor de color imposible se lee como identidad, no como el tope', () => {
    // La regla es de imageColor.ts y aquí solo se comprueba que se delega en ella: un
    // número que la base no podría haber aceptado enseña la fotografía como es, en vez
    // de alterarla a lo bestia por un dato que nadie escribió.
    expect(normalizeEdit({ rotation: 0, crop: null, color: { gamma: 9 } }).color.gamma).toBe(1)
    expect(
      normalizeEdit({ rotation: 0, crop: null, color: { temperature: Number.NaN } }).color.temperature,
    ).toBe(0)
  })

  it('solo el color ya es un cambio (RF-414)', () => {
    expect(isNoEdit({ rotation: 0, crop: null, color: { temperature: 12 } })).toBe(false)
    expect(isNoEdit({ rotation: 0, crop: null, color: { gray: true } })).toBe(false)
    expect(isNoEdit({ rotation: 0, crop: null, color: AJUSTE })).toBe(false)
  })

  /**
   * El caso que sostiene toda la fase: si `sameEdit` no mirara el color, «Aplicar»
   * decidiría que no hay nada que regenerar, los ficheros se quedarían como estaban y
   * la corrección que la usuaria acaba de hacer se perdería **en silencio**, con la
   * fila diciendo que está aplicada.
   */
  it('sameEdit distingue dos ediciones que solo difieren en el color (RF-414)', () => {
    const encuadre: PhotoEdit = { rotation: 90, crop: { x: 0.1, y: 0.1, width: 0.6, height: 0.6 } }
    expect(sameEdit(encuadre, { ...encuadre, color: AJUSTE })).toBe(false)
    expect(
      sameEdit(
        { ...encuadre, color: AJUSTE },
        { ...encuadre, color: { ...AJUSTE, temperature: AJUSTE.temperature + 1 } },
      ),
    ).toBe(false)
    // A single control, and the smallest step there is: a sixth of an EV.
    expect(
      sameEdit(
        { rotation: 0, crop: null, color: { exposure: 0 } },
        { rotation: 0, crop: null, color: { exposure: 1 / 6 } },
      ),
    ).toBe(false)
    expect(sameEdit(NO_EDIT, { rotation: 0, crop: null, color: { gray: true } })).toBe(false)
    // And two ways of writing the same adjustment are still the same: opening the editor,
    // looking and applying rewrites no file.
    expect(
      sameEdit({ rotation: 0, crop: null, color: AJUSTE }, { rotation: 0, crop: null, color: { ...AJUSTE } }),
    ).toBe(true)
  })

  it('dos ajustes que solo difieren en su procedencia son la misma foto y filas distintas', () => {
    const a: PhotoEdit = { rotation: 0, crop: null, color: AJUSTE }
    const b: PhotoEdit = {
      rotation: 0,
      crop: null,
      color: { ...AJUSTE, neutral: { x: 0.9, y: 0.9 }, source: 'MANUAL' },
    }
    // The same pixels: there are no derivatives to regenerate.
    expect(sameEdit(a, b)).toBe(true)
    // But not the same row, and whoever needs to know whether it changed compares the columns.
    expect(editToColumns(a)).not.toEqual(editToColumns(b))
    expect(editToColumns(b).color_neutral_x).toBeCloseTo(0.9, 5)
  })

  it('el resumen dice el color en la misma línea y en español (RF-414)', () => {
    const summary = editSummary({ rotation: 90, crop: null, color: AJUSTE })
    expect(summary).toContain('Girada 90°')
    expect(summary).toContain(COLOR_RANGES.temperature.label)
    expect(summary).toContain('Exposición +0,33 EV')
    // With no colour no tag line is invented.
    expect(editSummary({ rotation: 90, crop: null })).toBe('Girada 90°')
    expect(editSummary({ rotation: 0, crop: null, color: { gray: true } })).toContain(GRAY_LABEL)
    // An adjustment that does nothing is not a change to announce, not even when it is recorded that it
    // was reviewed: that is read in the record, not in the line of «what has been done».
    expect(editSummary({ rotation: 0, crop: null, color: { source: 'REVIEWED_UNCHANGED' } })).toBeNull()
  })

  it('el punto donde se tomó el gris gira con la fotografía (RF-418)', () => {
    // Es el cuarto hermano de la lista de rotateEdit: no cambia ningún píxel, y por eso
    // es fácil olvidarlo. Lo que se rompe es lo único para lo que existe el campo —
    // saber en un año que el gris se tomó del cartón y no del cuadro.
    const color = normalizeColor({ temperature: 10, neutral: { x: 0.2, y: 0.7 } })
    const turned = rotateEdit({ rotation: 0, crop: null, color }, 90)
    expect(turned.color.neutral).not.toBeNull()
    expect(turned.color.neutral!.x).toBeCloseTo(1 - 0.7, 5)
    expect(turned.color.neutral!.y).toBeCloseTo(0.2, 5)
    // La corrección en sí no gira: una tabla de 256 entradas no tiene orientación.
    expect(turned.color.temperature).toBe(10)
    // Y cuatro cuartos de vuelta devuelven el punto a su sitio.
    let edit: PhotoEdit = { rotation: 0, crop: null, color }
    for (let i = 0; i < 4; i += 1) edit = rotateEdit(edit, 90)
    expect(normalizeColor(edit.color).neutral).toEqual(color.neutral)
  })
})

describe('el color como dato: las columnas de la fila (RF-414)', () => {
  it('nulo es identidad: solo se escribe lo que hace algo', () => {
    const columns = editToColumns({ rotation: 0, crop: null, color: { temperature: 12, gray: true } })
    expect(columns.color_temperature).toBe(12)
    expect(columns.color_tint).toBeNull()
    expect(columns.color_gamma).toBeNull()
    expect(columns.color_white).toBeNull()
    expect(columns.color_shoulder).toBeNull()
    expect(columns.color_gray).toBe(true)
  })

  it('los nombres son los de la migración, y las dos del empastado no se escriben aquí', () => {
    const columns = editToColumns({ rotation: 0, crop: null, color: AJUSTE })
    for (const name of Object.keys(SIN_COLOR)) expect(columns).toHaveProperty(name)
    // `color_clipped_low` y `color_clipped_high` no son el ajuste: son la medición de lo
    // que aplicarlo le hizo a los píxeles, «se anota al aplicar». Aquí no hay píxeles, y
    // rellenarlas desde este módulo sería una cuenta que nadie ha hecho (las escribe
    // clippingToColumns, en imageHistogram.ts).
    expect(columns).not.toHaveProperty('color_clipped_low')
    expect(columns).not.toHaveProperty('color_clipped_high')
  })

  it('el color convive con las esquinas, no en su lugar', () => {
    const columns = editToColumns({ rotation: 0, crop: null, corners: TORCIDO, color: AJUSTE })
    expect(columns.corner_nw_x).toBeCloseTo(TORCIDO.nw.x, 6)
    expect(columns.crop_x).toBeNull()
    expect(columns.color_temperature).toBe(AJUSTE.temperature)
    expect(columns.color_source).toBe('NEUTRAL_PICKED')
  })

  it('ida y vuelta por las columnas: el aspecto y su procedencia (RF-414)', () => {
    const edit: PhotoEdit = {
      rotation: 180,
      crop: { x: 0.1, y: 0.2, width: 0.5, height: 0.6 },
      color: AJUSTE,
    }
    const back = editFromColumns(editToColumns(edit))
    expect(back.color).toEqual(AJUSTE)
    expect(back.rotation).toBe(180)
    expect(sameEdit(edit, back)).toBe(true)
  })

  it('y devuelve la misma tabla de 256 entradas, que es lo que ven los píxeles', () => {
    // La comparación que de verdad importa: el redondeo de `numeric` no puede cambiar
    // el color con el que sale la derivada.
    const back = editFromColumns(editToColumns({ rotation: 0, crop: null, color: AJUSTE }))
    const written = buildColorLuts(back.color)
    const original = buildColorLuts(AJUSTE)
    expect(Array.from(written.r)).toEqual(Array.from(original.r))
    expect(Array.from(written.g)).toEqual(Array.from(original.g))
    expect(Array.from(written.b)).toEqual(Array.from(original.b))
    expect(written.gray).toBe(original.gray)
  })

  it('una fila anterior a la migración se lee como color neutro (RF-414)', () => {
    // Las 39 filas activas se quedaron a nulo y nadie las reescribe: el despliegue es de
    // una sola fase porque nulo aquí significa «este parámetro no hace nada».
    const back = editFromColumns({
      rotation: 90,
      crop_x: 0.1,
      crop_y: 0.1,
      crop_width: 0.5,
      crop_height: 0.5,
    })
    expect(back.color).toEqual(NO_COLOR)
    // La excepción es color_source, donde nulo es «nadie ha mirado todavía el color de
    // esta fotografía» y no «se miró y se dejó igual».
    expect(back.color.source).toBeNull()
    expect(editFromColumns({ rotation: 0, color_source: 'REVIEWED_UNCHANGED' }).color.source).toBe(
      'REVIEWED_UNCHANGED',
    )
  })

  it('un parámetro que la base no podría haber aceptado no arrastra a los demás', () => {
    const back = editFromColumns({ rotation: 0, color_temperature: 900, color_tint: 8 })
    expect(back.color.temperature).toBe(0)
    expect(back.color.tint).toBe(8)
  })
})

describe('composeEdits y el color (RF-414, camino degradado)', () => {
  it('desde el máster el color pasa tal cual: no hay nada que componer', () => {
    const nuevo: PhotoEdit = { rotation: 0, crop: null, color: AJUSTE }
    const composed = composeEdits(NO_EDIT, nuevo)
    expect(composed.color).toEqual(AJUSTE)
    expect(sameEdit(composed, nuevo)).toBe(true)
  })

  it('y la perspectiva y el color a la vez, también', () => {
    const composed = composeEdits(NO_EDIT, { rotation: 0, crop: null, corners: TORCIDO, color: AJUSTE })
    expect(composed.corners).not.toBeNull()
    expect(composed.color.temperature).toBe(AJUSTE.temperature)
  })

  it('sobre una imagen que ya lleva el encuadre aplicado se rechaza, y lo dice en español', () => {
    // La copia de consulta pasó por un WebP con pérdida: ajustar el color ahí corregiría
    // los defectos de la compresión como si fueran la obra.
    const horneado: PhotoEdit = { rotation: 0, crop: { x: 0.1, y: 0.1, width: 0.6, height: 0.6 } }
    expect(() => composeEdits(horneado, { rotation: 0, crop: null, color: AJUSTE })).toThrow(
      'No se puede ajustar el color sobre una imagen que ya lleva aplicado un ajuste anterior',
    )
    // Y sobre una que ya lleva el color cocido, cualquier ajuste nuevo.
    expect(() =>
      composeEdits({ rotation: 0, crop: null, color: AJUSTE }, { rotation: 0, crop: null, color: { tint: 5 } }),
    ).toThrow(/color/)
  })

  it('pero el color ya aplicado viaja intacto cuando solo se recorta', () => {
    // Recortar más sí se puede desde la copia de consulta, y la fila no puede quedarse
    // diciendo que no hay color sobre un fichero que lo lleva cocido.
    const stored: PhotoEdit = {
      rotation: 0,
      crop: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 },
      color: AJUSTE,
    }
    const composed = composeEdits(stored, { rotation: 0, crop: { x: 0, y: 0, width: 0.5, height: 0.5 } })
    expect(composed.color).toEqual(AJUSTE)
    expect(composed.crop!.width).toBeCloseTo(0.4, 6)
  })
})

describe('cuándo se ofrece el ajuste de color (RF-414, RF-417)', () => {
  it('no se ofrece en una fotografía que no es propia, y se dice por qué', () => {
    expect(colorAvailability(true, 'OWN')).toEqual({ available: true, reason: null })
    expect(colorAvailability(true, null)).toEqual({ available: true, reason: null })
    const otro = colorAvailability(true, 'OTHER_CATALOG')
    expect(otro.available).toBe(false)
    expect(otro.reason).toMatch(/otro catálogo/)
    expect(otro.reason).toMatch(/revelado de otra persona/)
    expect(colorAvailability(true, 'THIRD_PARTY').reason).toMatch(/tercero/)
  })

  it('ni sobre la copia de consulta, que ya lleva el color aplicado', () => {
    const degradado = colorAvailability(false, 'OWN')
    expect(degradado.available).toBe(false)
    expect(degradado.reason).toMatch(/máster de archivo/)
    expect(degradado.reason).toMatch(/copia de consulta/)
  })

  it('cuando fallan las dos cosas manda la que no se puede arreglar', () => {
    // Una reproducción ajena no será ajustable nunca; un máster que no se ha descargado
    // puede descargarse al siguiente intento. Decir lo segundo mandaría a la usuaria a
    // arreglar lo que no es.
    expect(colorAvailability(false, 'OTHER_CATALOG').reason).toMatch(/otro catálogo/)
  })

  it('nunca un hueco: si no se ofrece, hay razón', () => {
    for (const provenance of ['OWN', 'OTHER_CATALOG', 'THIRD_PARTY'] as const) {
      for (const master of [true, false]) {
        const availability = colorAvailability(master, provenance)
        if (availability.available) expect(availability.reason).toBeNull()
        else expect((availability.reason ?? '').length).toBeGreaterThan(20)
      }
    }
  })
})

describe('qué parámetros ofrece cada tipo de toma (RF-414, §3.1)', () => {
  const TODOS: readonly ColorParam[] = [...COLOR_PARAM_ORDER]

  it('la lista de mandos cubre exactamente la tabla del conjunto cerrado', () => {
    // Un parámetro añadido a COLOR_RANGES sin colocarlo aquí desaparecería del panel sin
    // una queja; y uno de más aquí es un mando que la base no sabría guardar.
    expect([...TODOS].sort()).toEqual(Object.keys(COLOR_RANGES).sort())
  })

  it('el blanco y negro solo en el reverso y en el detalle de firma', () => {
    expect(colorParamsForShotType('BACK').gray).toEqual({ offered: true, reason: null })
    expect(colorParamsForShotType('SIGNATURE_DETAIL').gray.offered).toBe(true)
    const general = colorParamsForShotType('GENERAL')
    expect(general.gray.offered).toBe(false)
    expect(general.gray.reason).toMatch(/reverso/)
    // En un daño o un marco el color ES el dato, así que ahí tiene su propia razón.
    expect(colorParamsForShotType('DAMAGE_DETAIL').gray.reason).toMatch(/detalle de daño/)
    expect(colorParamsForShotType('FRAME').gray.offered).toBe(false)
  })

  it('en un detalle de daño y en uno de marco, solo la dominante y la exposición', () => {
    for (const shotType of ['DAMAGE_DETAIL', 'FRAME'] as const) {
      const params = colorParamsForShotType(shotType)
      expect(params.offered).toEqual(['temperature', 'tint', 'exposure'])
      expect(params.disabled.map((entry) => entry.param)).toEqual([
        'blackPoint',
        'whitePoint',
        'gamma',
        'shoulder',
      ])
      // Visibles y desactivados, con la razón en la línea de ayuda: un mando que
      // desaparece no explica nada.
      for (const entry of params.disabled) expect(entry.reason.length).toBeGreaterThan(20)
    }
    expect(colorParamsForShotType('DAMAGE_DETAIL').disabled[0]!.reason).toMatch(/amarilleo|humedad|óxido/)
    expect(colorParamsForShotType('FRAME').disabled[0]!.reason).toMatch(/dorado/)
  })

  it('ningún parámetro se queda sin sitio, sea el tipo de toma el que sea', () => {
    for (const shotType of ['GENERAL', 'BACK', 'SIGNATURE_DETAIL', 'DAMAGE_DETAIL', 'FRAME', 'OTHER'] as const) {
      const params = colorParamsForShotType(shotType)
      const all = [...params.offered, ...params.disabled.map((entry) => entry.param)]
      expect([...all].sort()).toEqual([...TODOS].sort())
    }
    // Un tipo de toma desconocido se trata como la general: ofrece lo que ella y nunca
    // habilita lo que un detalle prohíbe.
    expect(colorParamsForShotType(null).offered).toEqual(TODOS)
    expect(colorParamsForShotType(null).gray.offered).toBe(false)
  })

  it('lo que un tipo de toma no ofrece vuelve a su identidad', () => {
    // Para lo que escribe varios mandos de golpe y no sabe dónde aterriza: el
    // automático, un preset de luz y un ajuste heredado. Sin esto, el automático sobre
    // un detalle de daño movería el punto negro por un mando que ahí está desactivado.
    const restringido = restrictColorToShotType(AJUSTE, 'DAMAGE_DETAIL')
    expect(restringido.temperature).toBe(AJUSTE.temperature)
    expect(restringido.tint).toBe(AJUSTE.tint)
    expect(restringido.exposure).toBe(AJUSTE.exposure)
    expect(restringido.blackPoint).toBe(0)
    expect(restringido.whitePoint).toBe(255)
    expect(restringido.gamma).toBe(1)
    expect(restringido.shoulder).toBe(0)
    // La procedencia no se toca: lo que se ha restringido es el aspecto.
    expect(restringido.source).toBe(AJUSTE.source)
    expect(restringido.reference).toBe(AJUSTE.reference)
    expect(restringido.light).toBe(AJUSTE.light)
  })

  it('y el blanco y negro cae donde el color es el dato', () => {
    expect(restrictColorToShotType({ gray: true }, 'BACK').gray).toBe(true)
    expect(restrictColorToShotType({ gray: true }, 'FRAME').gray).toBe(false)
    expect(restrictColorToShotType({ gray: true }, 'GENERAL').gray).toBe(false)
    // En una toma general no hay nada que restringir de los siete mandos.
    expect(restrictColorToShotType(AJUSTE, 'GENERAL')).toEqual(AJUSTE)
  })
})

describe('el ajuste heredado de la toma general (RF-414, §7)', () => {
  const general: ColorEdit = normalizeColor({
    temperature: -30,
    tint: -4,
    exposure: 0.5,
    blackPoint: 8,
    gamma: 1.15,
    neutral: { x: 0.4, y: 0.6 },
    source: 'NEUTRAL_PICKED',
    reference: 'SCENE',
    light: 'INCANDESCENT',
  })
  const reverso: PhotoEdit = { rotation: 90, crop: { x: 0.1, y: 0.1, width: 0.7, height: 0.7 } }

  it('heredar marca el ajuste como heredado y conserva el encuadre de la toma', () => {
    const back = inheritColor(reverso, general, 'BACK')
    expect(back.color.inherited).toBe(true)
    expect(isInheritedColor(back)).toBe(true)
    expect(back.color.temperature).toBe(general.temperature)
    expect(back.color.gamma).toBe(general.gamma)
    expect(back.rotation).toBe(90)
    expectCrop(back.crop, { x: 0.1, y: 0.1, width: 0.7, height: 0.7 })
    // Y el hecho llega a la fila: es la columna la que lo dice, no una comparación de
    // números, que diría «heredado» también cuando coinciden por casualidad.
    expect(editToColumns(back).color_inherited).toBe(true)
  })

  it('el punto donde se tomó el gris NO se hereda: es un sitio de otra fotografía (RF-418)', () => {
    const back = inheritColor(reverso, general, 'BACK')
    expect(back.color.neutral).toBeNull()
    expect(editToColumns(back).color_neutral_x).toBeNull()
    // Pero de dónde salieron los números sí se conserva.
    expect(back.color.source).toBe('NEUTRAL_PICKED')
    expect(back.color.light).toBe('INCANDESCENT')
  })

  it('un detalle de daño hereda la luz de la sala y no el rango tonal (§3.1)', () => {
    const damage = inheritColor({ rotation: 0, crop: null }, general, 'DAMAGE_DETAIL')
    expect(damage.color.temperature).toBe(general.temperature)
    expect(damage.color.exposure).toBe(general.exposure)
    expect(damage.color.blackPoint).toBe(0)
    expect(damage.color.gamma).toBe(1)
    expect(damage.color.inherited).toBe(true)
  })

  it('cambiarlo a mano deja de ser heredado, aunque los números coincidan', () => {
    const heredado = inheritColor(reverso, general, 'BACK')
    const propio = withOwnColor(heredado, heredado.color)
    expect(propio.color.inherited).toBe(false)
    expect(isInheritedColor(propio)).toBe(false)
    // Los mismos píxeles: lo que ha cambiado es cómo llegó el ajuste, no su aspecto.
    expect(sameEdit(heredado, propio)).toBe(true)
    expect(editToColumns(propio).color_inherited).toBe(false)
  })

  it('restablecer a lo heredado es volver a heredar', () => {
    const tocado = withOwnColor(reverso, { ...general, temperature: 0 })
    expect(isInheritedColor(tocado)).toBe(false)
    expect(tocado.color.temperature).toBe(0)
    const restablecido = inheritColor(tocado, general, 'BACK')
    expect(restablecido.color.temperature).toBe(general.temperature)
    expect(restablecido.color.inherited).toBe(true)
    expect(restablecido.rotation).toBe(90)
  })

  it('y la pantalla lo dice: el resumen menciona la herencia', () => {
    expect(editSummary(inheritColor(reverso, general, 'BACK'))).toMatch(/heredado de la toma general/)
    // Sobre un ajuste que no hace nada no se anuncia ninguna herencia: sería anunciar la
    // herencia de nada.
    expect(editSummary(inheritColor(reverso, NO_COLOR, 'BACK'))).not.toMatch(/heredado/)
  })
})
