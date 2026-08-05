/**
 * ¿Hay algo escrito en este formulario que se perdería al cerrarlo?
 *
 * La condición que enciende la pregunta de `BottomSheet`. Vive aparte y es puro porque es
 * lo que decide si se pregunta o no, y ahí hay dos formas de equivocarse que se pagan en
 * direcciones opuestas:
 *
 *   · **quedarse corto** y no preguntar sobre un formulario con datos, que es la
 *     incidencia de la que viene todo esto;
 *   · **pasarse** y preguntar sobre uno en blanco, que es la forma más rápida de que la
 *     pregunta se aprenda a despachar sin leerla — y entonces el día que importa tampoco
 *     se lee.
 *
 * De ahí las dos reglas que no son obvias: **un espacio no es trabajo** —cerrar por un
 * roce después de haber tocado la barra espaciadora no merece un cartel— y **una búsqueda
 * a medio teclear tampoco**, así que las cajas de buscar no entran; eso lo decide cada
 * hoja al llamar, y está dicho en cada sitio.
 */

/**
 * Compara el borrador con el estado de partida, campo a campo.
 *
 * Con el borrador vacío como punto de partida contesta «¿se ha escrito algo?»; con la
 * fila guardada, «¿hay alguna corrección sin guardar?». Es la misma pregunta desde los dos
 * lados, y por eso es una sola función: una hoja de alta y una de corrección no pueden
 * proteger cosas distintas.
 *
 * Las cadenas se comparan **recortadas**: un espacio de más no es una corrección, y no va
 * a la base tampoco — todos los planificadores del proyecto recortan antes de escribir.
 *
 * Solo mira los campos que el estado de partida declara, lo que deja fuera lo que la hoja
 * lleve encima y no sea del formulario. Los borradores de este proyecto son planos
 * (`DocumentFields`, `ReferenceEdit`…); un valor que no sea primitivo se compara por
 * identidad, y si algún día hace falta comparar uno anidado, se compara en la hoja y se
 * añade con un `||`.
 */
export function draftDirty<T extends object>(current: T, initial: T): boolean {
  // `T extends object` y no un `Record` con los valores acotados: los borradores del
  // proyecto son interfaces (`DocumentFields`, `ReferenceEdit`) y una interfaz no tiene
  // firma de índice, así que acotar los valores en el tipo obligaría a tocarlas todas.
  // Lo que se compara está acotado abajo, que es donde se puede comprobar.
  return (Object.keys(initial) as (keyof T)[]).some((key) => !sameValue(current[key], initial[key]))
}

function sameValue(a: unknown, b: unknown): boolean {
  if (typeof a === 'string' && typeof b === 'string') return a.trim() === b.trim()
  // Null y undefined son el mismo «sin dato» para un formulario: un campo que la fila
  // trae a null y el borrador deja sin poner no es una corrección.
  if (a == null && b == null) return true
  return Object.is(a, b)
}

/**
 * ¿Se ha escrito algo en alguno de estos textos?
 *
 * Para las hojas cuyo trabajo son dos campos libres —la nota de un vínculo, la página de
 * una cita— y que no tienen un borrador con el que comparar. Recorta, por lo mismo que
 * `draftDirty`.
 */
export function anyWritten(...texts: (string | null | undefined)[]): boolean {
  return texts.some((text) => (text ?? '').trim() !== '')
}
