import { describe, expect, it } from 'vitest'
import {
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
 * Recuperar la contraseña olvidada (RF-112, RF-101).
 *
 * **La primera prioridad de este fichero es que no se pueda enumerar.** Esta
 * pantalla la usa cualquiera sin haber entrado, y el equipo son tres personas con
 * correos adivinables: saber cuál de ellos tiene cuenta convierte «probar
 * contraseñas contra varias direcciones» en «probar contra la buena».
 */

describe('nada distingue una cuenta que existe de una que no', () => {
  it('el servidor conteste lo que conteste, se dice lo mismo', () => {
    // Un rechazo por ritmo, una dirección sin cuenta, una plantilla mal
    // configurada. Los tres traen `status`, y los tres se leen igual.
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
    // Afirmar «te lo hemos enviado» sería mentira la mitad de las veces, y quien
    // teclee mal su propia dirección esperaría un correo que nadie mandó.
    expect(RECOVERY_NOTICE).toContain('Si esa dirección tiene cuenta')
    expect(RECOVERY_NOTICE).not.toContain('Te hemos enviado')
  })
})

describe('la única excepción es la red, y no habla de cuentas', () => {
  it('sin llegar a salir la petición, se dice', () => {
    // Sin esta rama, estar sin cobertura en un almacén se leería como «ya está
    // enviado» y se esperaría un mensaje que no va a llegar nunca.
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
    // Un espacio pegado al copiar de otra aplicación es la causa más tonta de
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
    // Un botón apagado sin explicación se lee como una avería y se pulsa otras
    // diez veces.
    expect(resendText(42)).toBe('Volver a enviarlo en 42 s')
    expect(resendText(0)).toBe('Enviarme el enlace')
  })
})
