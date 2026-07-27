import { describe, expect, it } from 'vitest'
import {
  MAX_BYTES,
  LEVELS,
  computeTarget,
  randomSuffix,
  validateFile,
} from './images'

describe('computeTarget', () => {
  it('reduces the long edge to the target keeping the aspect ratio', () => {
    // Typical landscape phone photo.
    expect(computeTarget(4032, 3024, 2000)).toEqual({ width: 2000, height: 1500 })
  })

  it('works the same in portrait', () => {
    expect(computeTarget(3024, 4032, 2000)).toEqual({ width: 1500, height: 2000 })
  })

  it('never upscales a small image', () => {
    // Stretching a 300 px photo to 2000 would only weigh more and fake a
    // quality it does not have, which in a catalog is worse than being small.
    expect(computeTarget(300, 200, 2000)).toEqual({ width: 300, height: 200 })
    expect(computeTarget(1, 1, 400)).toEqual({ width: 1, height: 1 })
  })

  it('leaves untouched the image that already measures exactly the target', () => {
    expect(computeTarget(2000, 1000, 2000)).toEqual({ width: 2000, height: 1000 })
  })

  it('never returns a zero dimension', () => {
    // A very elongated image could round the short side to zero and the
    // canvas would fail to draw.
    const r = computeTarget(8000, 3, 400)
    expect(r.height).toBeGreaterThanOrEqual(1)
    expect(r.width).toBe(400)
  })

  it('produces a thumbnail much lighter than the derivative', () => {
    const thumb = computeTarget(4032, 3024, LEVELS.thumbnail.longEdge)
    const der = computeTarget(4032, 3024, LEVELS.derivative.longEdge)
    // Area is what rules the final weight; the thumbnail must be an order of
    // magnitude smaller for the mosaic index to load on a phone.
    expect(thumb.width * thumb.height).toBeLessThan((der.width * der.height) / 10)
  })
})

describe('validateFile', () => {
  const file = (name: string, type: string, bytes: number) =>
    new File([new Uint8Array(1)], name, { type }) &&
    // File does not allow setting `size` directly: it is simulated with an
    // object that satisfies what the function uses.
    ({ name, type, size: bytes } as File)

  it('accepts a normal image', () => {
    expect(validateFile(file('obra.jpg', 'image/jpeg', 8_000_000))).toBeNull()
  })

  it('rejects what is not an image, naming the file', () => {
    const error = validateFile(file('procedencia.pdf', 'application/pdf', 1000))
    expect(error).toContain('procedencia.pdf')
    expect(error).toContain('no es una imagen')
  })

  it('rejects what exceeds the cap and says how much it weighs', () => {
    const error = validateFile(file('escaneo.tif', 'image/tiff', MAX_BYTES + 1))
    expect(error).toContain('escaneo.tif')
    // Saying "weighs 60.0 MB and the maximum is 60 MB" is more useful than
    // "file too big": one knows how much to trim.
    expect(error).toMatch(/MB/)
  })

  it('accepts exactly the limit size', () => {
    expect(validateFile(file('justo.jpg', 'image/jpeg', MAX_BYTES))).toBeNull()
  })
})

describe('randomSuffix', () => {
  it('has the requested length and only path-safe characters', () => {
    const s = randomSuffix()
    expect(s).toHaveLength(8)
    expect(s).toMatch(/^[a-z0-9]{8}$/)
    expect(randomSuffix(16)).toHaveLength(16)
  })

  it('does not repeat between calls', () => {
    const samples = new Set(Array.from({ length: 200 }, () => randomSuffix()))
    expect(samples.size).toBeGreaterThan(195)
  })

  it('works without crypto.randomUUID, which is the phone-over-http case', () => {
    // `crypto.randomUUID` is undefined outside a secure context, and the app
    // is used on the local network over http. This test pins that case: it
    // used to blow up the upload with an incomprehensible error, and only from
    // the phone.
    const original = globalThis.crypto
    try {
      Object.defineProperty(globalThis, 'crypto', {
        value: { getRandomValues: original.getRandomValues.bind(original) },
        configurable: true,
      })
      expect(randomSuffix()).toMatch(/^[a-z0-9]{8}$/)
    } finally {
      Object.defineProperty(globalThis, 'crypto', { value: original, configurable: true })
    }
  })

  it('works even with no crypto at all', () => {
    const original = globalThis.crypto
    try {
      Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true })
      expect(randomSuffix()).toMatch(/^[a-z0-9]{8}$/)
    } finally {
      Object.defineProperty(globalThis, 'crypto', { value: original, configurable: true })
    }
  })
})
