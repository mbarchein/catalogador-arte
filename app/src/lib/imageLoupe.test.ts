import { describe, expect, it } from 'vitest'
import { aidCorners, loupeTables } from './imageLoupe'
import { buildColorLuts } from './imageColor'

/**
 * Only the placement is tested here. What draws the loupe needs a canvas, which the
 * test environment does not have, and is checked in the browser.
 *
 * This exists because it regressed: the loupe and the straightened preview ended up
 * in the same corner of the screen whenever the finger was on either top corner, one
 * drawn over the other. The invariant below is the fix, stated as something that can
 * fail a test.
 */
describe('RF-410: where the loupe and the preview go', () => {
  const quadrants = [
    { name: 'nw', point: { x: 0.2, y: 0.2 } },
    { name: 'ne', point: { x: 0.8, y: 0.2 } },
    { name: 'sw', point: { x: 0.2, y: 0.8 } },
    { name: 'se', point: { x: 0.8, y: 0.8 } },
  ]

  it('never puts the two in the same corner, whichever quadrant the finger is in', () => {
    for (const { name, point } of quadrants) {
      const { loupe, preview } = aidCorners(point)
      expect(loupe, `con el dedo en ${name}`).not.toBe(preview)
    }
  })

  it('and puts the loupe opposite the finger, so it is not under the hand', () => {
    expect(aidCorners({ x: 0.2, y: 0.2 }).loupe).toBe('se')
    expect(aidCorners({ x: 0.8, y: 0.2 }).loupe).toBe('sw')
    expect(aidCorners({ x: 0.2, y: 0.8 }).loupe).toBe('ne')
    expect(aidCorners({ x: 0.8, y: 0.8 }).loupe).toBe('nw')
  })

  it('the preview shares the column with the loupe and takes the other row', () => {
    for (const { point } of quadrants) {
      const { loupe, preview } = aidCorners(point)
      // Same side left/right, different side top/bottom: that is what makes the
      // collision impossible rather than unlikely.
      expect(preview[1]).toBe(loupe[1])
      expect(preview[0]).not.toBe(loupe[0])
    }
  })

  // A corner of the perspective quadrilateral may legitimately sit outside the
  // photograph, so the placement has to answer for those points too.
  it('answers for a point dragged outside the photograph', () => {
    const { loupe, preview } = aidCorners({ x: -0.2, y: 1.2 })
    expect(loupe).toBe('ne')
    expect(preview).toBe('se')
  })
})

/**
 * The other rule of the loupe that is not drawing: whether the colour table applies.
 *
 * What paints needs a canvas and is verified in the browser. This is the decision,
 * and it is here because getting it wrong is invisible — a corrected grey looks like
 * a grey — and because it decides a measurement: the white balance of the photograph.
 */
describe('RF-414 y RF-418: la tabla de color en la lupa', () => {
  const warm = buildColorLuts({ temperature: 40, exposure: 1 })

  it('aplica la tabla mientras se ajusta el encuadre, para que la lupa y la foto sean la misma foto', () => {
    expect(loupeTables(warm, 'FRAMING')).toBe(warm)
  })

  // The one that matters. The eyedropper is measuring the light of the room off the
  // pixels, and the pixels it has to see are the ones the camera wrote: aiming at an
  // already corrected grey measures the correction, and each pick would then partly
  // undo the one before it.
  it('NO la aplica con el cuentagotas: ahí se apunta a los píxeles crudos', () => {
    expect(loupeTables(warm, 'EYEDROPPER')).toBeNull()
  })

  it('sin ajuste no hay tabla, en cualquiera de los dos modos', () => {
    expect(loupeTables(null, 'FRAMING')).toBeNull()
    expect(loupeTables(undefined, 'FRAMING')).toBeNull()
    expect(loupeTables(undefined, 'EYEDROPPER')).toBeNull()
  })
})
