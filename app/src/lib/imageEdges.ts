import { luminanceOf, readAnalysisPixels } from './imagePixels'
import {
  detectArtworkEdges,
  rotateSuggestion,
  type EdgeSuggestion,
} from './edgeDetection'

/**
 * Suggesting the crop of a photograph: what joins the raster of pixels with the
 * detector that reads it.
 *
 * Neither half lives here. Decoding the photograph into a reduced raster is
 * imagePixels.ts, which touches the DOM and is shared with the histogram and the
 * colour adjustment; the arithmetic is edgeDetection.ts, which has no DOM and is
 * tested with synthetic images. What is left in this module is the order of the
 * two steps and the rotation of the answer, which is the only thing that belongs
 * to «suggesting a crop» and to nothing else.
 *
 * The luminance is computed here and not returned by the raster: the detector
 * wants one byte per pixel and the colour panel wants the three channels, so
 * throwing the colour away is a decision of this consumer, not of whoever
 * decoded the photograph.
 */

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
  // Null already covers the whole decoding side: `readAnalysisPixels` never
  // throws either.
  const raster = await readAnalysisPixels(source)
  if (!raster) return null
  try {
    const suggestion = detectArtworkEdges(luminanceOf(raster), raster.width, raster.height)
    if (!suggestion) return null
    return rotation === 0 ? suggestion : rotateSuggestion(suggestion, rotation)
  } catch {
    // The arithmetic keeps its own net: an aid that breaks the editor when it
    // fails is worse than no aid.
    return null
  }
}
