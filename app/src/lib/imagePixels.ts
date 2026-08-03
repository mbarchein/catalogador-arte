import { computeTarget } from './images'

/**
 * Decoding a photograph out of a `Blob` into a small COLOUR raster, which is
 * where everything this application measures over pixels starts: the border
 * detector, the histogram, the automatic adjustment and the white balance.
 *
 * It used to live inside `suggestArtworkCrop`, which built the raster, turned it
 * straight into luminance and closed the bitmap. That threw away two things at
 * once: the colour — luminance cannot answer «is this photograph yellowish» —
 * and the raster itself, which nobody else could reuse. So what is returned here
 * is the RGBA raster as it was decoded; computing luminance is a step the caller
 * takes when it wants it (see `luminanceOf`), not something baked in on the way
 * out.
 *
 * The split is the same one as between imageEdits.ts and imageRender.ts, and for
 * the same reason: the arithmetic is tested with synthetic rasters, and what
 * needs a canvas lives apart and **cannot be tested in this repository**,
 * because the test environment has neither `canvas` nor `createImageBitmap`.
 * That is why this module is deliberately thin — a decode, a downscale and a
 * `getImageData` — and why the size of the raster and the conversion to
 * luminance are exported separately: those two are pure and they do carry tests.
 *
 * **The raster is cacheable, and caching it is the caller's job.** Decoding a 12
 * MP master and drawing it shrunk costs hundreds of milliseconds on the phone
 * used in a storage room, and the colour panel recomputes the histogram on every
 * drag of a slider: it keeps the raster in a `ref` while it is open and reads the
 * already decoded pixels, instead of decoding once per gesture. It is not cached
 * in this module on purpose — a cache keyed by `Blob` would hold megabytes of
 * pixels for photographs nobody is looking at any more, and only the caller
 * knows when the panel closes.
 *
 * There is no network here either: the photograph has already been downloaded to
 * open the editor and travels in as a `Blob`. Asking for it again to suggest a
 * crop or to draw a histogram would spend the data of a phone in a storage room
 * twice.
 */

/**
 * Long edge, in pixels, of the copy that gets analysed.
 *
 * Around 700 px is enough: a border of a painting is dozens of pixels long at
 * that size and the profiles add it up perfectly, while one pixel is a seventh
 * of a percent of the frame — finer than the crop needs, since the cataloger
 * adjusts it by hand afterwards. Analysing the 12 MP master straight would cost
 * some forty times more arithmetic to gain a precision nobody would use.
 *
 * The histogram is happy with the same size for a different reason: half a
 * million pixels is a sample large enough that a percentile does not move when
 * the raster grows, and sharing ONE size with the border detector is what lets
 * both read a single cached raster.
 */
export const ANALYSIS_LONG_EDGE = 700

/**
 * A block of pixels, RGBA, four bytes per pixel and row by row.
 *
 * A structural type and not `ImageData` so that whoever consumes a raster —the
 * detector, the histogram, their tests— does not depend on a DOM type: a plain
 * object built by hand satisfies it, and the `ImageData` this module returns
 * satisfies it too.
 */
export interface PixelRaster {
  readonly data: Uint8ClampedArray
  readonly width: number
  readonly height: number
}

/**
 * Size of the analysis raster for an image of `width` × `height`.
 *
 * Null when there is nothing to analyse. A bitmap with a side of zero is not a
 * theoretical case —a truncated or empty file decodes to one in some browsers—
 * and a canvas of zero pixels cannot be read: `getImageData` throws on it. Being
 * refused here says the same thing sooner, which for the cataloger is anyway one
 * single thing: the photograph could not be measured.
 *
 * Whole pixels, because that is what a canvas has: a decoder that reports a
 * fractional size would otherwise be rounded by the canvas itself, and the
 * raster would not be the size this function promised.
 */
export function analysisRasterSize(
  width: number,
  height: number,
  longEdge = ANALYSIS_LONG_EDGE,
): { width: number; height: number } | null {
  if (!Number.isFinite(width) || !Number.isFinite(height)) return null
  const whole = { width: Math.floor(width), height: Math.floor(height) }
  if (whole.width < 1 || whole.height < 1) return null
  return computeTarget(whole.width, whole.height, longEdge)
}

/**
 * Rec. 709 luminance, on the sRGB values as they come.
 *
 * Not linearized on purpose: the gradient of the border detector only has to say
 * where the value changes abruptly, and undoing the gamma would move every
 * border by the same nothing while costing a table lookup per channel and per
 * pixel.
 *
 * Which is exactly why **this is not the luminance of the colour model**: the
 * black-and-white conversion of an adjustment is photometric and has to be
 * computed in linear light (see the canonical chain of imageColor), and using
 * this one there would darken the greens and lighten the blues of a painting.
 * This is a cheap perceptual proxy for «how light is this pixel», good for a
 * gradient, a percentile and a histogram bin.
 *
 * The truncation to an integer loses at most one level —pure white comes back as
 * 254— and every consumer reads differences between neighbours, where a constant
 * shift cancels out.
 */
export function luminanceOf(raster: PixelRaster): Uint8Array {
  const { data } = raster
  const count = raster.width * raster.height
  const luminance = new Uint8Array(count)
  for (let i = 0; i < count; i += 1) {
    const at = i * 4
    luminance[i] =
      (0.2126 * data[at]! + 0.7152 * data[at + 1]! + 0.0722 * data[at + 2]!) | 0
  }
  return luminance
}

/**
 * Decodes a photograph and returns its analysis raster, with colour.
 *
 * **It never throws**, and it never explains itself: a photograph that cannot be
 * decoded, a browser that refuses a drawing context, a file that turns out not
 * to be an image — for the cataloger they are all the same thing, which is that
 * this photograph cannot be measured and the work has to be done by hand.
 * Turning any of them into an error to display would be explaining the machine
 * instead of the photograph. Whoever calls this gets null and says its own
 * sentence.
 */
export async function readAnalysisPixels(
  source: Blob,
  longEdge = ANALYSIS_LONG_EDGE,
): Promise<PixelRaster | null> {
  try {
    // `imageOrientation: 'from-image'` for the same reason as in prepareShot and
    // in renderEditedLevels: the EXIF orientation has to be applied before
    // anything else, or the measurement would be taken on a photograph other
    // than the one on screen — the `<img>` of the editor applies it too.
    //
    // Note who applies it: **the browser does, not us.** We never read the
    // orientation tag, and nothing downstream may assume the raster is turned —
    // there is no test in this repository that could prove it, since there is no
    // `createImageBitmap` here, and the flag is honoured on the browsers of the
    // declared target but the guarantee is theirs.
    const bitmap = await createImageBitmap(source, { imageOrientation: 'from-image' })
    try {
      const size = analysisRasterSize(bitmap.width, bitmap.height, longEdge)
      if (!size) return null
      const canvas = document.createElement('canvas')
      canvas.width = size.width
      canvas.height = size.height
      // `willReadFrequently` because the whole point of this canvas is being
      // read back: without it the browser may keep the surface on the GPU and
      // charge the round trip on `getImageData`.
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      if (!ctx) return null
      ctx.drawImage(bitmap, 0, 0, size.width, size.height)
      return ctx.getImageData(0, 0, size.width, size.height)
    } finally {
      // The bitmap holds the full master decoded — tens of megabytes — and is
      // closed as soon as the raster is copied out of it. Whoever keeps the
      // raster in a `ref` keeps half a million pixels, not the master.
      bitmap.close()
    }
  } catch {
    return null
  }
}
