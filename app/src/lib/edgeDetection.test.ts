import { describe, expect, it } from 'vitest'
import {
  analyseArtworkEdges,
  detectArtworkEdges,
  rotateSuggestion,
  type EdgeSuggestion,
} from './edgeDetection'
import type { Crop } from './imageEdits'
import { cornersBoundingBox, isConvexQuadrilateral } from './perspective'

/**
 * The detector is exercised with synthetic photographs: a luminance array built
 * by hand, with the painting drawn as a rectangle of a known value. That is the
 * only way to check the precision of the suggestion — with a real photograph
 * there is no ground truth to compare against, only an opinion.
 *
 * The value used for the wall is a mid grey and the ones for the paintings are
 * chosen to give the contrast each case is about: plenty when the border has to
 * be found, almost none when the answer must be that it could not be.
 */

const WALL = 128

interface Photo {
  luminance: Uint8Array
  width: number
  height: number
}

function photo(width: number, height: number, background = WALL): Photo {
  const luminance = new Uint8Array(width * height).fill(background)
  return { luminance, width, height }
}

/** Fills a rectangle given in fractions of the frame, as the detector reports it. */
function paint(target: Photo, rect: Crop, value: number): void {
  const left = Math.round(rect.x * target.width)
  const right = Math.round((rect.x + rect.width) * target.width)
  const top = Math.round(rect.y * target.height)
  const bottom = Math.round((rect.y + rect.height) * target.height)
  for (let y = Math.max(0, top); y < Math.min(target.height, bottom); y += 1) {
    for (let x = Math.max(0, left); x < Math.min(target.width, right); x += 1) {
      target.luminance[y * target.width + x] = value
    }
  }
}

/** Deterministic pseudorandom numbers: a test with real noise is not a test. */
function randomizer(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function addNoise(target: Photo, amplitude: number, seed = 1): void {
  const random = randomizer(seed)
  for (let i = 0; i < target.luminance.length; i += 1) {
    const value = target.luminance[i]! + Math.round((random() * 2 - 1) * amplitude)
    target.luminance[i] = Math.min(255, Math.max(0, value))
  }
}

function detect(target: Photo) {
  return detectArtworkEdges(target.luminance, target.width, target.height)
}

/** The safety margin the module adds: half a percentage point per side, outwards. */
const MARGIN = 0.005

function widened(rect: Crop): Crop {
  return {
    x: rect.x - MARGIN,
    y: rect.y - MARGIN,
    width: rect.width + 2 * MARGIN,
    height: rect.height + 2 * MARGIN,
  }
}

/**
 * Compares rectangles with a tolerance in fractions of the frame. The default,
 * one percent, is about seven pixels of the reduced copy: closer than that is
 * beyond what a suggestion needs, since the cataloger adjusts it by hand.
 */
function expectCrop(actual: Crop | null | undefined, expected: Crop, tolerance = 0.01) {
  expect(actual).toBeTruthy()
  if (!actual) return
  expect(Math.abs(actual.x - expected.x)).toBeLessThanOrEqual(tolerance)
  expect(Math.abs(actual.y - expected.y)).toBeLessThanOrEqual(tolerance)
  expect(Math.abs(actual.width - expected.width)).toBeLessThanOrEqual(tolerance)
  expect(Math.abs(actual.height - expected.height)).toBeLessThanOrEqual(tolerance)
}

describe('RF-410: crop suggested from the borders of the painting', () => {
  it('finds a centered painting with the precision the crop needs', () => {
    const frame = photo(700, 500)
    const artwork: Crop = { x: 0.2, y: 0.2, width: 0.6, height: 0.6 }
    paint(frame, artwork, 210)

    const suggestion = detect(frame)
    expect(suggestion).not.toBeNull()
    // Within a couple of pixels of the reduced copy: the profiles place the
    // border between pixels, not on one of them.
    expectCrop(suggestion?.outer.box, widened(artwork), 0.003)
    expect(suggestion?.inner).toBeNull()
  })

  it('finds a painting that is not centered, in a portrait photograph', () => {
    const frame = photo(600, 800)
    const artwork: Crop = { x: 0.08, y: 0.3, width: 0.48, height: 0.62 }
    paint(frame, artwork, 205)

    const suggestion = detect(frame)
    expectCrop(suggestion?.outer.box, widened(artwork), 0.003)
  })

  it('finds a darker painting than the wall, not only a lighter one', () => {
    const frame = photo(700, 500)
    const artwork: Crop = { x: 0.25, y: 0.15, width: 0.5, height: 0.7 }
    paint(frame, artwork, 40)

    expectCrop(detect(frame)?.outer.box, widened(artwork), 0.003)
  })

  it('offers two nested candidates for a framed painting: the frame and the canvas', () => {
    const frame = photo(700, 500)
    const moulding: Crop = { x: 0.15, y: 0.15, width: 0.7, height: 0.7 }
    const canvas: Crop = { x: 0.22, y: 0.22, width: 0.56, height: 0.56 }
    paint(frame, moulding, 60)
    paint(frame, canvas, 200)

    const suggestion = detect(frame)
    expectCrop(suggestion?.outer.box, widened(moulding), 0.005)
    expectCrop(suggestion?.inner?.box, widened(canvas), 0.005)
  })

  it('gives a single candidate when the second rectangle is not clearly inside', () => {
    // A frame one percent of the frame wide: two rectangles that on screen are
    // the same one, and choosing between them would be a coin toss.
    const frame = photo(700, 500)
    const moulding: Crop = { x: 0.2, y: 0.2, width: 0.6, height: 0.6 }
    paint(frame, moulding, 60)
    paint(frame, { x: 0.21, y: 0.21, width: 0.58, height: 0.58 }, 200)

    const suggestion = detect(frame)
    expectCrop(suggestion?.outer.box, widened(moulding), 0.01)
    expect(suggestion?.inner).toBeNull()
  })

  it('finds the painting with a noisy wall and a noisy canvas', () => {
    const frame = photo(700, 500)
    const artwork: Crop = { x: 0.18, y: 0.22, width: 0.62, height: 0.6 }
    paint(frame, artwork, 205)
    addNoise(frame, 25, 7)

    const suggestion = detect(frame)
    expectCrop(suggestion?.outer.box, widened(artwork), 0.01)
  })

  /**
   * This case used to assert the opposite: that a painting with two sides out of
   * frame got a suggestion, with `outer.x` and `outer.y` at exactly 0 — the edge
   * of the photograph standing in for the sides that are not visible.
   *
   * Measured against the 44 real photographs of the catalog, that completion was
   * the second largest source of bad suggestions: 22 invented sides across 15 of
   * the 36 suggestions, and with them 14 rectangles covering more than 90 % of the
   * frame, all legal because MAX_AREA is 0.98. So the test was describing the
   * implementation and not a requirement, and the requirement it seemed to serve —
   * «the artwork photographed up close» — was being served by answering with the
   * whole photograph, which answers nothing.
   *
   * The price is two good suggestions of the 44 that go quiet. It is paid on
   * purpose: a wrong suggestion looks like a measurement, and silence does not.
   */
  it('stays quiet when two sides of the painting are outside the photograph', () => {
    const frame = photo(700, 500)
    paint(frame, { x: 0, y: 0, width: 0.55, height: 0.6 }, 210)

    expect(detect(frame)).toBeNull()
  })

  it('and finds the same painting as soon as its four sides are in frame', () => {
    // The contrary case, so what changed is a rule about sides and not a loss of
    // sensitivity: the same artwork, the same contrast, moved off the corner.
    const frame = photo(700, 500)
    const artwork = { x: 0.06, y: 0.08, width: 0.55, height: 0.6 }
    paint(frame, artwork, 210)

    expectCrop(detect(frame)?.outer.box, widened(artwork), 0.01)
  })

  describe('the sides have to be lines, not just peaks of the profile', () => {
    /**
     * A profile peak says «the gradient adds up a lot along this whole column»,
     * and a band of paint does that as well as a border does. On the real
     * photographs this was what a threshold could not separate: two of the bad
     * suggestions had four peaks that no constant tells from an artwork.
     */
    /**
     * Both halves of the rule at once: four sides made of segments that are light,
     * dark and absent in turn. Each side produces a peak in its profile — the
     * gradient of the segments adds up down the column just as a border's does —
     * and yet neither direction reaches a third of its length, so it is a texture
     * and not a line. The control below is the same band with one direction, which
     * IS a line and has to be found: without it this test would pass just as well
     * against a detector that had stopped detecting anything.
     */
    it('rejects sides whose transition changes direction along them', () => {
      const band = (target: Photo, segment: (i: number) => number) => {
        for (const x of [140, 557]) {
          for (let y = 40; y < 460; y += 1) {
            for (let d = 0; d < 3; d += 1) target.luminance[y * 700 + x + d] = segment(y)
          }
        }
        for (const y of [40, 457]) {
          for (let x = 140; x < 560; x += 1) {
            for (let d = 0; d < 3; d += 1) target.luminance[(y + d) * 700 + x] = segment(x)
          }
        }
      }

      const textured = photo(700, 500)
      band(textured, (i) => [235, 25, WALL][Math.floor(i / 6) % 3]!)
      expect(detect(textured)).toBeNull()

      const line = photo(700, 500)
      band(line, () => 235)
      expect(detect(line)).not.toBeNull()
    })

    it('accepts a border interrupted a third of its length, and keeps its place', () => {
      // A real border does get cut: the cloth of an easel crosses one, a white
      // object splits another. That is why the support asks for half the length and
      // not all of it — and why what matters is that the side stays where the
      // border is instead of sliding to whatever else is long and straight.
      const frame = photo(700, 500)
      const artwork = { x: 0.2, y: 0.2, width: 0.5, height: 0.6 }
      paint(frame, artwork, 210)
      // A notch of wall eating into the left border along a third of its height:
      // there, quite simply, there is no transition to find.
      paint(frame, { x: 0.2, y: 0.2, width: 0.05, height: 0.2 }, WALL)

      const analysis = analyseArtworkEdges(frame.luminance, frame.width, frame.height)
      expect(analysis.suggestion).not.toBeNull()
      expect(analysis.detail.supportWest).toBeGreaterThan(0.5)
      // And on the border, not 35 px inside it on the edge of the notch.
      expect(analysis.suggestion?.outer.box.x).toBeCloseTo(artwork.x - 0.005, 2)
    })

    /**
     * What the support does NOT promise, written down because the first version of
     * this test claimed it did: it is not a guarantee that a badly interrupted
     * border gets refused. Grow the notch and its own right edge becomes a long,
     * clean vertical line, and the detector prefers it — the side slides inwards and
     * clips the artwork. The rule keeps a texture from passing as a border; it
     * cannot decide which of two real borders is the artwork's.
     */
    it('cannot tell which of two real borders is the one that matters', () => {
      const frame = photo(700, 500)
      paint(frame, { x: 0.2, y: 0.2, width: 0.5, height: 0.6 }, 210)
      paint(frame, { x: 0.2, y: 0.2, width: 0.05, height: 0.5 }, WALL)

      const suggestion = detect(frame)
      expect(suggestion).not.toBeNull()
      // It lands on the notch's edge, a twentieth of the frame inside the artwork.
      expect(suggestion!.outer.box.x).toBeGreaterThan(0.2)
    })
  })
})

describe('RF-410: the suggestion is refused rather than invented', () => {
  it('suggests nothing on a wall with no painting at all', () => {
    expect(detect(photo(700, 500))).toBeNull()
  })

  it('suggests nothing on a wall with noise and nothing else', () => {
    const frame = photo(700, 500)
    addNoise(frame, 30, 11)
    expect(detect(frame)).toBeNull()
  })

  it('suggests nothing for a dark painting on a dark wall, with no contrast', () => {
    const frame = photo(700, 500, 30)
    paint(frame, { x: 0.2, y: 0.2, width: 0.6, height: 0.6 }, 36)
    expect(detect(frame)).toBeNull()
  })

  it('suggests nothing when the rectangle has an absurd aspect ratio', () => {
    // A band across the whole wall: a shelf, a skirting board, a shadow.
    const frame = photo(700, 500)
    paint(frame, { x: 0.05, y: 0.4, width: 0.9, height: 0.2 }, 205)
    expect(detect(frame)).toBeNull()
  })

  it('suggests nothing when the rectangle is too small to be the artwork', () => {
    // A label, a nail, a socket: something in the photograph, not the painting.
    const frame = photo(700, 500)
    paint(frame, { x: 0.45, y: 0.45, width: 0.1, height: 0.1 }, 220)
    expect(detect(frame)).toBeNull()
  })

  it('suggests nothing when the rectangle is practically the whole frame', () => {
    const frame = photo(1000, 1000)
    paint(frame, { x: 0.004, y: 0.004, width: 0.992, height: 0.992 }, 205)
    expect(detect(frame)).toBeNull()
  })

  it('suggests nothing when there are borders in one direction only', () => {
    // Two vertical borders and nothing horizontal: a door frame, a panel of the
    // wall. A painting has four sides.
    const frame = photo(700, 500)
    paint(frame, { x: 0.3, y: 0, width: 0.4, height: 1 }, 205)
    expect(detect(frame)).toBeNull()
  })

  it('suggests nothing with an image too small to hold a profile', () => {
    expect(detectArtworkEdges(new Uint8Array(10 * 10), 10, 10)).toBeNull()
  })

  it('suggests nothing when the array does not hold the image it says', () => {
    expect(detectArtworkEdges(new Uint8Array(100), 700, 500)).toBeNull()
    expect(detectArtworkEdges(new Uint8Array(1000), 31.5, 31.5)).toBeNull()
  })
})

describe('RF-410: why the detector declined', () => {
  /**
   * The reason exists because the module answered `null` for six different
   * situations with nothing to tell them apart, and that made every change to it a
   * matter of opinion. Measured over the catalog it paid for itself at once: of the
   * 33 silences, four were a border that is not in the pixels and had to stay
   * silent, and seventeen were a rule throwing away a border that IS there — and
   * the two look identical from outside.
   */
  const reasonOf = (target: Photo) =>
    analyseArtworkEdges(target.luminance, target.width, target.height).reason

  it('says so when the photograph cannot be analysed at all', () => {
    expect(reasonOf(photo(10, 10))).toBe('unusable-image')
  })

  it('tells «there is no border here» from «the border is outside the frame»', () => {
    // A wall and nothing else: no contrast on either axis.
    expect(reasonOf(photo(700, 500))).toBe('no-columns-edge')

    // A painting pressed into the corner: the border IS there, on two sides.
    const cornered = photo(700, 500)
    paint(cornered, { x: 0, y: 0, width: 0.55, height: 0.6 }, 210)
    expect(reasonOf(cornered)).toBe('one-sided-columns')
  })

  it('tells a texture that fooled the profile from a rectangle that is no painting', () => {
    const textured = photo(700, 500)
    const segment = (i: number) => [235, 25, WALL][Math.floor(i / 6) % 3]!
    for (const x of [140, 557]) {
      for (let y = 40; y < 460; y += 1) {
        for (let d = 0; d < 3; d += 1) textured.luminance[y * 700 + x + d] = segment(y)
      }
    }
    for (const y of [40, 457]) {
      for (let x = 140; x < 560; x += 1) {
        for (let d = 0; d < 3; d += 1) textured.luminance[(y + d) * 700 + x] = segment(x)
      }
    }
    expect(reasonOf(textured)).toBe('sides-not-lines')

    // Four real borders, plenty of contrast, and a shape no painting has: 6.3
    // wide for 1 tall. It is the check that keeps a shelf or a skirting board
    // from being offered as an artwork.
    const shelf = photo(700, 500)
    paint(shelf, { x: 0.05, y: 0.4, width: 0.9, height: 0.2 }, 220)
    expect(reasonOf(shelf)).toBe('not-artwork')
  })

  it('carries the numbers the decision was made with, and no reason when it worked', () => {
    const frame = photo(700, 500)
    paint(frame, { x: 0.2, y: 0.2, width: 0.6, height: 0.6 }, 210)
    const analysis = analyseArtworkEdges(frame.luminance, frame.width, frame.height)

    expect(analysis.reason).toBeNull()
    expect(analysis.suggestion).not.toBeNull()
    // The support of the four sides of a clean synthetic border is total.
    expect(analysis.detail.supportWest).toBeCloseTo(1, 2)
    expect(analysis.detail.supportSouth).toBeCloseTo(1, 2)
    expect(analysis.detail.columnsContrast).toBeGreaterThan(20)
  })
})

describe('RF-410: the suggestion travels to the rotated frame', () => {
  it('turns both candidates with the image, because the crop is over the rotated one', () => {
    const suggestion: EdgeSuggestion = {
      outer: { box: { x: 0.1, y: 0.2, width: 0.5, height: 0.6 }, corners: null },
      inner: { box: { x: 0.15, y: 0.25, width: 0.4, height: 0.5 }, corners: null },
    }

    const turned = rotateSuggestion(suggestion, 90)
    expectCrop(turned.outer.box, { x: 0.2, y: 0.1, width: 0.6, height: 0.5 }, 1e-9)
    expectCrop(turned.inner?.box, { x: 0.25, y: 0.15, width: 0.5, height: 0.4 }, 1e-9)

    // Four quarter turns are no turn at all.
    let full = suggestion
    for (let i = 0; i < 4; i += 1) full = rotateSuggestion(full, 90)
    expectCrop(full.outer.box, suggestion.outer.box, 1e-9)
  })

  it('turns the quadrilateral too, and it stays convex', () => {
    // The box and the corners have to end up describing the same thing after the
    // turn: rotating one and not the other would leave the editor drawing a
    // quadrilateral over a photograph that has moved under it.
    const corners = {
      nw: { x: 0.3, y: 0.15 },
      ne: { x: 0.7, y: 0.15 },
      se: { x: 0.85, y: 0.9 },
      sw: { x: 0.15, y: 0.9 },
    }
    const turned = rotateSuggestion(
      { outer: { box: cornersBoundingBox(corners), corners }, inner: null },
      90,
    )
    expect(turned.outer.corners).not.toBeNull()
    expect(isConvexQuadrilateral(turned.outer.corners!)).toBe(true)
    // The box of the turned corners is the turned box: one measurement, two views.
    expectCrop(cornersBoundingBox(turned.outer.corners!), turned.outer.box, 1e-9)
  })

  it('keeps a single candidate single', () => {
    const turned = rotateSuggestion(
      { outer: { box: { x: 0.1, y: 0.2, width: 0.5, height: 0.6 }, corners: null }, inner: null },
      270,
    )
    expect(turned.inner).toBeNull()
    expectCrop(turned.outer.box, { x: 0.2, y: 0.4, width: 0.6, height: 0.5 }, 1e-9)
  })
})

describe('RF-410: the suggestion accepts luminance however it was computed', () => {
  it('gives the same answer from a Float32Array as from a Uint8Array', () => {
    const frame = photo(700, 500)
    const artwork: Crop = { x: 0.2, y: 0.25, width: 0.55, height: 0.5 }
    paint(frame, artwork, 200)

    const fromBytes = detect(frame)
    const fromFloats = detectArtworkEdges(
      Float32Array.from(frame.luminance),
      frame.width,
      frame.height,
    )
    expect(fromFloats).toEqual(fromBytes)
    expectCrop(fromFloats?.outer.box, widened(artwork), 0.003)
  })
})
