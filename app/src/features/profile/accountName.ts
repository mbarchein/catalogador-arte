/**
 * El nombre con el que aparece cada quien en el catálogo (RF-109, RF-804).
 *
 * No es un dato del perfil y ya está: es lo que se lee en «actualizado por» de
 * cada obra y en la traza de quién retiró qué. Por eso se corrige desde el perfil
 * —a nadie se le ocurre buscar su propio nombre en otra parte— y por eso no se
 * admite en blanco: un nombre vacío convierte toda esa traza en «Sin indicar»,
 * que es exactamente lo contrario de lo que la traza está para decir.
 *
 * El esquema lo deja en blanco a propósito (`name text not null default ''`),
 * porque una cuenta recién creada todavía no ha dicho cómo se llama. Una cosa es
 * no haberlo dicho aún y otra borrarlo: lo primero es un estado legítimo y lo
 * segundo, un descuido con consecuencias en fichas que ya están escritas.
 */

/**
 * Hasta dónde llega un nombre.
 *
 * La columna es `text` y no lo limita, así que esto no repite una regla de la
 * base: la pone la interfaz, y el motivo es la propia ficha, donde «actualizado
 * por» va en una línea con la fecha al lado.
 */
export const NAME_MAX_LENGTH = 120

/** Lo que se explica junto al campo, que es para qué sirve esto. */
export const NAME_HINT =
  'Es el nombre con el que apareces en cada obra que corriges, en «actualizado por» y en la ' +
  'traza de lo retirado.'

/** El error, o null cuando el nombre se puede guardar. */
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
 * Lo que se guarda de verdad.
 *
 * Recortado, como en el resto del catálogo: un espacio de más al principio ordena
 * distinto en cualquier lista y no se ve al mirarlo.
 */
export function cleanFullName(name: string): string {
  return name.trim()
}

/** Si esto cambia algo, para no mandar un guardado que no guarda nada. */
export function nameChanged(draft: string, current: string): boolean {
  return cleanFullName(draft) !== cleanFullName(current)
}

/** Lo que se dice al terminar. */
export function nameSavedNotice(name: string): string {
  return `Ahora apareces como «${cleanFullName(name)}» en todo el catálogo.`
}
