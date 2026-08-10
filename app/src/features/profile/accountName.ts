/**
 * The name everybody appears under in the catalogue (RF-109, RF-804).
 *
 * It is not just a datum of the profile: it is what is read in every artwork's «actualizado por»
 * and in the trace of who withdrew what. That is why it is corrected from the profile
 * —it would occur to nobody to look for their own name elsewhere— and that is why it is not
 * allowed blank: an empty name turns all that trace into «Sin indicar»,
 * which is exactly the opposite of what the trace is there to say.
 *
 * The schema leaves it blank on purpose (`name text not null default ''`),
 * because a freshly created account has not said what it is called yet. Not having said it yet
 * is one thing and erasing it another: the first is a legitimate state and the
 * second an oversight with consequences in records that are already written.
 */

/**
 * How far a name goes.
 *
 * The column is `text` and does not limit it, so this does not repeat a rule of the
 * base: the interface sets it, and the reason is the record itself, where «actualizado
 * por» goes on one line with the date alongside.
 */
export const NAME_MAX_LENGTH = 120

/** What is explained next to the field, which is what this is for. */
export const NAME_HINT =
  'Es el nombre con el que apareces en cada obra que corriges, en «actualizado por» y en la ' +
  'traza de lo retirado.'

/** The error, or null when the name can be saved. */
export function validateFullName(name: string): string | null {
  const clean = name.trim()
  if (clean === '') {
    return 'El nombre no puede quedarse en blanco: es el que aparece en cada obra que corriges.'
  }
  if (clean.length > NAME_MAX_LENGTH) {
    return `El nombre no puede pasar de ${NAME_MAX_LENGTH} caracteres.`
  }
  return null
}

/**
 * What actually gets stored.
 *
 * Trimmed, as in the rest of the catalogue: one extra space at the start sorts
 * differently in any list and is not visible on looking at it.
 */
export function cleanFullName(name: string): string {
  return name.trim()
}

/** Whether this changes anything, so as not to send a save that saves nothing. */
export function nameChanged(draft: string, current: string): boolean {
  return cleanFullName(draft) !== cleanFullName(current)
}

/** What is said on finishing. */
export function nameSavedNotice(name: string): string {
  return `Ahora apareces como «${cleanFullName(name)}» en todo el catálogo.`
}
