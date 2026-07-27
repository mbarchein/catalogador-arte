import { describe, expect, it } from 'vitest'
import { LONGITUD_MINIMA_CONTRASENA, validarNuevaContrasena } from './contrasena'

// Recuperación de contraseña: la validación local replica la regla del
// servidor (GOTRUE_PASSWORD_MIN_LENGTH) para avisar sin hacer el viaje.
describe('validarNuevaContrasena', () => {
  it('rechaza una contraseña más corta que el mínimo del servidor', () => {
    const corta = 'a'.repeat(LONGITUD_MINIMA_CONTRASENA - 1)
    expect(validarNuevaContrasena(corta, corta)).toMatch(/al menos 8/)
  })

  it('rechaza la repetición que no coincide, aunque ambas sean válidas', () => {
    expect(validarNuevaContrasena('contraseña-larga', 'contraseña-largo')).toMatch(/no coinciden/)
  })

  it('acepta una contraseña válida y bien repetida', () => {
    expect(validarNuevaContrasena('contraseña-larga', 'contraseña-larga')).toBeNull()
  })
})
