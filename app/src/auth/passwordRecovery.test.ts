import { describe, expect, it } from 'vitest'
import {
  invitedByLink,
  normalizeEmail,
  recoveryOutcome,
  recoveryText,
  resendText,
  secondsLeft,
  RECOVERY_NOTICE,
  RESEND_COOLDOWN_SECONDS,
  UNREACHABLE_NOTICE,
} from './passwordRecovery'

/**
 * Recovering the forgotten password (RF-112, RF-101).
 *
 * **This file's first priority is that enumeration be impossible.** This
 * screen is used by anybody without having logged in, and the team is three people with
 * guessable addresses: knowing which of them has an account turns «trying
 * passwords against several addresses» into «trying against the right one».
 */

describe('nada distingue una cuenta que existe de una que no', () => {
  it('el servidor conteste lo que conteste, se dice lo mismo', () => {
    // A rate refusal, an address with no account, a badly configured template. All three
    // carry a `status`, and all three read the same.
    expect(recoveryOutcome(null)).toBe('requested')
    expect(recoveryOutcome({ status: 400 })).toBe('requested')
    expect(recoveryOutcome({ status: 429 })).toBe('requested')
    expect(recoveryOutcome({ status: 500 })).toBe('requested')
  })

  it('y el texto de todos ellos es el mismo', () => {
    const said = [null, { status: 400 }, { status: 429 }, { status: 500 }].map((f) =>
      recoveryText(recoveryOutcome(f)),
    )
    expect(new Set(said).size).toBe(1)
    expect(said[0]).toBe(RECOVERY_NOTICE)
  })

  it('el aviso va en condicional, no afirmando un envío', () => {
    // Claiming «te lo hemos enviado» would be a lie half the time, and whoever mistypes
    // their own address would wait for a mail nobody sent.
    expect(RECOVERY_NOTICE).toContain('Si esa dirección tiene cuenta')
    expect(RECOVERY_NOTICE).not.toContain('Te hemos enviado')
  })
})

describe('la única excepción es la red, y no habla de cuentas', () => {
  it('sin llegar a salir la petición, se dice', () => {
    // Without this branch, being out of coverage in a storeroom would read as «already
    // sent» and a message that will never arrive would be waited for.
    expect(recoveryOutcome({})).toBe('unreachable')
    expect(recoveryOutcome({ status: 0 })).toBe('unreachable')
    expect(recoveryText('unreachable')).toBe(UNREACHABLE_NOTICE)
  })

  it('y ese texto no menciona ninguna cuenta', () => {
    expect(UNREACHABLE_NOTICE).not.toMatch(/cuenta|correo|dirección/i)
  })
})

describe('la dirección que se manda', () => {
  it('va recortada y en minúsculas', () => {
    // A space stuck on while copying from another application is the silliest cause of
    // «no me llega».
    expect(normalizeEmail('  Mario@Ejemplo.ES ')).toBe('mario@ejemplo.es')
  })
})

describe('la espera entre envíos', () => {
  it('empieza en el máximo y baja', () => {
    const sent = 1_000_000
    expect(secondsLeft(sent, sent)).toBe(RESEND_COOLDOWN_SECONDS)
    expect(secondsLeft(sent, sent + 10_000)).toBe(RESEND_COOLDOWN_SECONDS - 10)
  })

  it('se acaba, y no se queda en negativo', () => {
    const sent = 1_000_000
    expect(secondsLeft(sent, sent + RESEND_COOLDOWN_SECONDS * 1000)).toBe(0)
    expect(secondsLeft(sent, sent + 999_000)).toBe(0)
  })

  it('sin haber enviado nada no hay que esperar', () => {
    expect(secondsLeft(null, 1_000_000)).toBe(0)
  })

  it('y el botón dice cuánto falta en vez de solo no funcionar', () => {
    // A disabled button with no explanation reads as a breakage and gets pressed ten more
    // times.
    expect(resendText(42)).toBe('Volver a enviarlo en 42 s')
    expect(resendText(0)).toBe('Enviarme el enlace')
  })
})

describe('el enlace de una invitación (RF-112, RF-1107)', () => {
  it('se reconoce por la marca que la propia aplicación puso al invitar', () => {
    expect(invitedByLink('?invitacion=1')).toBe(true)
    expect(invitedByLink('?otra=cosa&invitacion=1')).toBe(true)
  })

  it('y una entrada normal no lo es', () => {
    // Si esto contestara que sí de más, confinaría en «Nueva contraseña» a quien solo
    // estaba entrando.
    expect(invitedByLink('')).toBe(false)
    expect(invitedByLink('?invitacion=0')).toBe(false)
    expect(invitedByLink('?invitacion')).toBe(false)
    expect(invitedByLink('?otra=1')).toBe(false)
  })
})
