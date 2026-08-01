import { describe, expect, it } from 'vitest'
import { aidCorners } from './imageLoupe'

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
