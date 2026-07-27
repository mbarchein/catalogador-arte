/**
 * Convention for `physical_location` from field schema v11: always lowercase
 * and without accents, hierarchy levels separated by commas from largest to
 * smallest.
 *
 *   edificio a, habitacion amarilla, bloque 3
 *   edificio b, habitacion 4, estanteria 3, balda 2, carpeta 1
 *
 * The convention is not cosmetic. These strings are grouped and compared to
 * generate work lists ("everything in the yellow room"), and without
 * normalization "Habitación amarilla" and "habitacion amarilla" would be two
 * different places that are not.
 *
 * Normalization happens **while typing**, not on save, so what is seen in the
 * field is exactly what gets stored. Storing something different from what you
 * display is a surprise discovered late and badly.
 */

/**
 * Combining marks to remove: accents and diaeresis. U+0303, the tilde of the
 * ñ, is excluded on purpose: the ñ is a letter of the alphabet and not an
 * accent — turning "muñeca" into "muneca" would not be normalizing, it would
 * be a spelling error.
 */
const ACCENTS = /[̀-̂̄-ͯ]/g

export function normalizeLocation(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(ACCENTS, '')
    .normalize('NFC')
    // Stray spaces around commas: they show up constantly when typing on a
    // phone and would break comparison between equal locations.
    .replace(/\s*,\s*/g, ', ')
    .replace(/\s{2,}/g, ' ')
    .replace(/^\s+/, '')
}

/**
 * Final trim, for the moment of saving. Separate from `normalizeLocation`
 * because while typing the trailing space must stay: otherwise "edificio a,
 * habitacion" cannot be typed without the space after the comma vanishing.
 */
export function locationForSaving(text: string): string {
  return normalizeLocation(text).replace(/[\s,]+$/, '')
}
