/**
 * Reglas de la contraseña nueva. La longitud mínima replica la del servidor
 * (GOTRUE_PASSWORD_MIN_LENGTH = 8): validar aquí solo evita el viaje para
 * enterarse; quien manda es GoTrue.
 */

export const LONGITUD_MINIMA_CONTRASENA = 8

/** Devuelve el mensaje de error, o null si la contraseña se puede enviar. */
export function validarNuevaContrasena(nueva: string, repetida: string): string | null {
  if (nueva.length < LONGITUD_MINIMA_CONTRASENA) {
    return `La contraseña debe tener al menos ${LONGITUD_MINIMA_CONTRASENA} caracteres.`
  }
  if (nueva !== repetida) {
    return 'Las dos contraseñas no coinciden.'
  }
  return null
}
