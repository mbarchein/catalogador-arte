/**
 * Rules for the new password. The minimum length replicates the server's
 * (GOTRUE_PASSWORD_MIN_LENGTH = 8): validating here only saves the round trip
 * to find out; GoTrue is in charge.
 */

export const MIN_PASSWORD_LENGTH = 8

/** Returns the error message, or null when the password can be submitted. */
export function validateNewPassword(newPassword: string, repeated: string): string | null {
  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    return `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`
  }
  if (newPassword !== repeated) {
    return 'Las dos contraseñas no coinciden.'
  }
  return null
}
