import { describe, expect, it } from 'vitest'
import { MIN_PASSWORD_LENGTH, validateNewPassword } from './password'

// Password recovery: the local validation replicates the server rule
// (GOTRUE_PASSWORD_MIN_LENGTH) to warn without the round trip.
describe('validateNewPassword', () => {
  it('rejects a password shorter than the server minimum', () => {
    const short = 'a'.repeat(MIN_PASSWORD_LENGTH - 1)
    expect(validateNewPassword(short, short)).toMatch(/al menos 8/)
  })

  it('rejects a mismatched repetition, even when both are valid', () => {
    expect(validateNewPassword('contraseña-larga', 'contraseña-largo')).toMatch(/no coinciden/)
  })

  it('accepts a valid and well-repeated password', () => {
    expect(validateNewPassword('contraseña-larga', 'contraseña-larga')).toBeNull()
  })
})
