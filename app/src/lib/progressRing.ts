/**
 * La geometría del anillo de progreso (RNF-106).
 *
 * Un círculo SVG se rellena con `stroke-dasharray` y `stroke-dashoffset`: el trazo
 * mide toda la circunferencia y el desplazamiento decide cuánto queda por pintar.
 * Es aritmética de una línea y por eso está aquí y no dentro del componente: mal
 * calculada dibuja un arco que avanza al revés, o uno que se llena antes de que la
 * subida termine, y **un progreso que miente es peor que no tener ninguno** —quien
 * lo mira decide si esperar o desistir por lo que ve—.
 */

/** El radio y el grosor del anillo, en las unidades del `viewBox` de 24. */
export const RING_RADIUS = 9
export const RING_STROKE = 2.5

/** La vuelta entera, que es lo que mide el trazo. */
export const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS

/**
 * Cuánto del trazo queda SIN pintar, para un porcentaje dado.
 *
 * Cero es el anillo completo y la circunferencia entera es el anillo vacío. Se
 * recorta a [0, 100]: un total mal medido puede dar un 103 %, y sin recortar el
 * desplazamiento se volvería negativo y el navegador pintaría el arco al revés.
 */
export function ringOffset(percent: number, circumference = RING_CIRCUMFERENCE): number {
  if (!Number.isFinite(percent)) return circumference
  const clamped = Math.min(100, Math.max(0, percent))
  return circumference * (1 - clamped / 100)
}

/**
 * Lo que se le dice a quien no ve el anillo.
 *
 * Un dibujo que solo informa por su forma no informa a nadie que use lector de
 * pantalla, y aquí el dibujo ES el dato.
 */
export function ringLabel(action: string, percent: number | null): string {
  return percent === null ? `${action}…` : `${action}: ${percent}%`
}
