import { computeTarget } from './images'
import {
  detectArtworkEdges,
  rotateSuggestion,
  type EdgeSuggestion,
} from './edgeDetection'

/**
 * Getting the luminance of a photograph out of a `Blob` so the border detector
 * can look at it.
 *
 * The split is the same one as between imageEdits.ts and imageRender.ts, and for
 * the same reason: the arithmetic — here edgeDetection.ts — has no DOM and is
 * tested with synthetic images, and what needs a canvas lives apart and **cannot
 * be tested in this repository**, because the test environment has neither
 * `canvas` nor `createImageBitmap`. What is here is checked in the browser, with
 * real photographs of real paintings, which is anyway the only thing that would
 * prove it.
 *
 * There is no network here either: the photograph has already been downloaded to
 * open the editor and travels in as a `Blob`. Asking for it again to suggest a
 * crop would spend the data of a phone in a storage room twice.
 */

/**
 * Long edge, in pixels, of the copy that gets analysed.
 *
 * Around 700 px is enough: a border of a painting is dozens of pixels long at
 * that size and the profiles add it up perfectly, while one pixel is a seventh
 * of a percent of the frame — finer than the crop needs, since the cataloger
 * adjusts it by hand afterwards. Analysing the 12 MP master straight would cost
 * some forty times more arithmetic to gain a precision nobody would use.
 */
export const ANALYSIS_LONG_EDGE = 700

/**
 * Rec. 709 luminance, on the sRGB values as they come.
 *
 * Not linearized on purpose: the gradient only has to say where the value
 * changes abruptly, and undoing the gamma would move every border by the same
 * nothing while costing a table lookup per channel and per pixel.
 */
function luminanceOf(pixels: Uint8ClampedArray, count: number): Uint8Array {
  const luminance = new Uint8Array(count)
  for (let i = 0; i < count; i += 1) {
    const at = i * 4
    luminance[i] =
      (0.2126 * pixels[at]! + 0.7152 * pixels[at + 1]! + 0.0722 * pixels[at + 2]!) | 0
  }
  return luminance
}

/**
 * The crop or crops suggested for a photograph, or null when there is nothing
 * to suggest.
 *
 * `rotation` is the quarter turn the cataloger has active. The detector reads
 * the photograph as it was decoded, and a crop is always expressed over the
 * ALREADY ROTATED image (see imageEdits.ts), so the rectangles come out of here
 * already turned into that frame.
 *
 * **It never throws.** A photograph that cannot be decoded, a browser that
 * refuses a drawing context, an image too small to hold a profile: for the
 * cataloger they are all the same thing, which is that the border could not be
 * recognized and the crop has to be done by hand. Turning any of them into an
 * error to display would be explaining the machine instead of the photograph.
 */
export async function suggestArtworkCrop(
  source: Blob,
  rotation = 0,
): Promise<EdgeSuggestion | null> {
  try {
    // `imageOrientation: 'from-image'` for the same reason as in prepareShot and
    // in renderEditedLevels: the EXIF orientation has to be applied before
    // anything else, or the suggestion would be measured on a photograph other
    // than the one on screen — the `<img>` of the editor applies it too.
    const bitmap = await createImageBitmap(source, { imageOrientation: 'from-image' })
    try {
      const target = computeTarget(bitmap.width, bitmap.height, ANALYSIS_LONG_EDGE)
      const canvas = document.createElement('canvas')
      canvas.width = target.width
      canvas.height = target.height
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      if (!ctx) return null
      ctx.drawImage(bitmap, 0, 0, target.width, target.height)

      const { data } = ctx.getImageData(0, 0, target.width, target.height)
      const luminance = luminanceOf(data, target.width * target.height)

      const suggestion = detectArtworkEdges(luminance, target.width, target.height)
      if (!suggestion) return null
      return rotation === 0 ? suggestion : rotateSuggestion(suggestion, rotation)
    } finally {
      bitmap.close()
    }
  } catch {
    return null
  }
}
