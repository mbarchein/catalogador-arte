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

/**
 * The hierarchy levels of a location, largest to smallest. Normalized first,
 * so a value typed by hand (a URL parameter, say) compares against a stored
 * one. An empty location has no levels.
 */
export function locationLevels(location: string): string[] {
  return normalizeLocation(location)
    .split(',')
    .map((level) => level.trim())
    .filter((level) => level !== '')
}

/**
 * True when `location` IS `place` or is inside it: the levels of `place` must
 * be a prefix of the levels of `location`, level by level and whole.
 *
 *   locationWithin('edificio a, habitacion amarilla', 'edificio a')   → true
 *   locationWithin('edificio a', 'edificio a')                        → true
 *   locationWithin('edificio a', 'edificio a, habitacion amarilla')   → false
 *   locationWithin('edificio ab', 'edificio a')                       → false
 *
 * Comparing whole levels and not the raw string is the whole point: "edificio
 * a" must reach everything inside it, and must NOT reach "edificio ab", which
 * is another building. That is what makes the location filter usable in a
 * storage room, where one asks for "everything in the yellow room" and expects
 * every shelf, folder and box under it.
 *
 * An artwork with no location is inside nothing: it answers no place.
 */
/**
 * A list of places in canonical form: normalized to the convention, without
 * blanks and without repeats.
 *
 * Places reaching the list filter come from the URL — typed by hand, or from a
 * link shared months ago — and one written differently from the option the
 * chooser offers would paint a checkbox that cannot be unmarked: it filters,
 * but no option matches it. Canonicalizing on the way in makes both the same
 * string.
 */
export function canonicalPlaces(places: readonly string[]): string[] {
  const canonical = places
    .map((place) => locationLevels(place).join(', '))
    .filter((place) => place !== '')
  return [...new Set(canonical)]
}

export function locationWithin(location: string, place: string): boolean {
  const outer = locationLevels(place)
  if (outer.length === 0) return false
  const inner = locationLevels(location)
  if (outer.length > inner.length) return false
  return outer.every((level, i) => level === inner[i])
}
