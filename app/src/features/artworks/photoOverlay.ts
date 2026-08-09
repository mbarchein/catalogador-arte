/**
 * Los mandos que van SOBRE la fotografía: qué dicen y cuándo se pueden pulsar
 * (RF-405, RF-901, RNF-106).
 *
 * ── POR QUÉ ENCIMA Y NO EN EL PANEL ─────────────────────────
 *
 * Los cuatro actúan sobre **la toma que se está mirando**, y mientras se mira una
 * fotografía la vista está en la fotografía. En el panel de datos eran botones que
 * decían «esta» sin que se viera cuál era «esta»: en una ficha con cuatro tomas,
 * «Quitar esta fotografía» a dos pantallas de distancia de la imagen es la
 * ambigüedad que hace que se quite la que no era.
 *
 * ── LO QUE ESTE MÓDULO DECIDE, Y POR QUÉ ESTÁ SUELTO ────────
 *
 * Un icono sin palabra al lado solo dice lo que dice su dibujo y su estado, así que
 * el rótulo para lector de pantalla **es** el texto de esta función, no una etiqueta
 * decorativa. Está fuera del componente porque así se verifica en la batería, que
 * corre en node: lo que se comprueba es que los tres estados de la estrella se
 * distinguen, y que los dos extremos del orden no ofrecen un movimiento imposible.
 */

/** La estrella cuando esta toma NO es la principal: pulsarla la pone. */
export const MAIN_SET_LABEL = 'Usar como imagen principal'
/**
 * La estrella cuando ES la principal pero **nadie la ha elegido**.
 *
 * Sin fijar, la principal es «la general más reciente», así que subir otra general
 * la cambia sola. Es un estado distinto de las otras dos y por eso tiene su propio
 * rótulo: la estrella se ve encendida y sigue habiendo algo que hacer.
 */
export const MAIN_PIN_LABEL = 'Fijar esta como imagen principal'
/** La estrella cuando ya está fijada a mano: encendida y sin nada que hacer. */
export const MAIN_IS_LABEL = 'Es la imagen principal'

export const MOVE_BEFORE_LABEL = 'Mover hacia el principio'
export const MOVE_AFTER_LABEL = 'Mover hacia el final'
export const REMOVE_LABEL = 'Quitar de la ficha'

/** Cómo se pinta y qué hace la estrella. */
export interface MainButtonState {
  /** Rellena cuando esta toma es la principal, de las dos maneras. */
  filled: boolean
  /** Solo cuando ya está fijada a mano: no queda nada que pulsar. */
  disabled: boolean
  label: string
}

export function mainButtonState(isMain: boolean, manuallyChosen: boolean): MainButtonState {
  if (!isMain) return { filled: false, disabled: false, label: MAIN_SET_LABEL }
  if (manuallyChosen) return { filled: true, disabled: true, label: MAIN_IS_LABEL }
  return { filled: true, disabled: false, label: MAIN_PIN_LABEL }
}

/**
 * Lo que se lee bajo la fotografía: si es la portada y por dónde va.
 *
 * Con una sola fotografía no hay orden que decir —«1 de 1» es ruido— y tampoco hay
 * portada que elegir, así que ahí no dice nada y devuelve cadena vacía; quien pinta
 * decide si eso es un hueco o una línea que no se pone.
 */
export function photoStatusText(input: {
  isMain: boolean
  manuallyChosen: boolean
  /** Su sitio en el orden, empezando en 1. */
  position: number
  total: number
}): string {
  const order = input.total > 1 ? `${input.position} de ${input.total}` : ''
  if (!input.isMain) return order
  const main = input.manuallyChosen ? 'Principal' : 'Principal, sin fijar'
  return order === '' ? main : `${main} · ${order}`
}

/** El porqué de «sin fijar», que es lo único de esto con consecuencia. */
export const MAIN_AUTO_NOTE =
  'Es la principal porque es la general más reciente, no porque alguien la eligiera. ' +
  'Si se sube otra general, la portada cambia sola. Tocar la estrella fija esta.'

// ── Quitar, que es lo único que quita algo de la ficha ───────

export const REMOVE_TITLE = 'Quitar esta fotografía'
export const REMOVE_QUESTION = '¿Quitar esta fotografía de la ficha?'
/** Lo que NO pasa, que es la mitad que evita el susto (RF-901). */
export const REMOVE_CONSEQUENCE = 'El fichero se conserva, pero deja de mostrarse.'
export const REMOVE_CONFIRM_LABEL = 'Sí, quitar'
export const REMOVE_CANCEL_LABEL = 'Cancelar'

/** ¿Se puede mover hacia ese lado? En los extremos, no. */
export function canMove(position: number, total: number, step: -1 | 1): boolean {
  if (total < 2) return false
  return step === -1 ? position > 1 : position < total
}
