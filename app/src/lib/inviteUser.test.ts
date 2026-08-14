import { describe, expect, it } from 'vitest'
import {
  inviteFailureText,
  invitePayload,
  invitedNotice,
  isInvitableEmail,
  normalizeEmail,
} from '../../../supabase/functions/invite-user/invite'

/**
 * Lo que decide la función Edge que invita (RF-112, RF-1107).
 *
 * Se prueba desde aquí, como los otros tres módulos de `sign-file`, y por lo mismo: no hay
 * Deno en esta batería, y ésta es la única ruta por la que se crea una cuenta del
 * catálogo. Lo que se fija es lo que se puede equivocar sin que se vea — una dirección con
 * una errata a la que se manda una invitación que nadie lee, un nombre que viaja con la
 * clave que el trigger no mira, o un rol colado en la invitación.
 */

describe('qué dirección se acepta', () => {
  it('las normales', () => {
    expect(isInvitableEmail('rita@catalogo.es')).toBe(true)
    expect(isInvitableEmail('rita.perez+catalogo@museo.gob.es')).toBe(true)
  })

  it('y no las que son una errata', () => {
    // La invitación se va a un buzón que nadie mira y quien invita cree que ya está: por
    // eso el criterio es estrecho a propósito.
    expect(isInvitableEmail('')).toBe(false)
    expect(isInvitableEmail('rita')).toBe(false)
    expect(isInvitableEmail('rita@catalogo')).toBe(false)
    expect(isInvitableEmail('rita @catalogo.es')).toBe(false)
    expect(isInvitableEmail('rita@@catalogo.es')).toBe(false)
    expect(isInvitableEmail('rita@catalogo..es')).toBe(false)
  })

  it('ni las que traen algo raro dentro', () => {
    expect(isInvitableEmail('rita@catalogo.es, otra@catalogo.es')).toBe(false)
    expect(isInvitableEmail('"rita"@catalogo.es')).toBe(false)
    // Un salto EN MEDIO sí: es lo que se cuela en una cabecera de correo.
    expect(isInvitableEmail('rita@cata\nlogo.es')).toBe(false)
  })

  it('pero un salto al final se recorta, que es como llega pegado de un correo', () => {
    expect(isInvitableEmail('rita@catalogo.es\n')).toBe(true)
    expect(normalizeEmail('rita@catalogo.es\n')).toBe('rita@catalogo.es')
  })

  it('el correo se manda sin espacios y en minúsculas', () => {
    expect(normalizeEmail('  Rita@Catalogo.ES ')).toBe('rita@catalogo.es')
  })
})

describe('lo que se le manda a la plataforma', () => {
  it('el nombre con la clave que lee el trigger del perfil', () => {
    // `tg_new_user` lee `name`. Con otra clave el perfil nacería sin nombre y la pantalla
    // del equipo enseñaría el correo hasta que la persona lo corrigiera.
    expect(invitePayload('Rita@Catalogo.es', ' Rita Pérez ', 'https://catalogo/reset-password')).toEqual(
      {
        email: 'rita@catalogo.es',
        data: { name: 'Rita Pérez' },
        redirect_to: 'https://catalogo/reset-password',
      },
    )
  })

  it('y sin nombre no se manda la clave vacía', () => {
    expect(invitePayload('rita@catalogo.es', '   ', '')).toEqual({ email: 'rita@catalogo.es' })
  })

  it('el rol NO viaja en la invitación', () => {
    // Nace Lector por omisión y se asigna después desde la pantalla, que es donde queda la
    // traza. Mandarlo aquí sería un segundo camino para dar permisos, y uno que no pasa
    // por el trigger que exige ser superusuario.
    const payload = invitePayload('rita@catalogo.es', 'Rita', '') as Record<string, unknown>
    expect(JSON.stringify(payload)).not.toContain('role')
    expect(JSON.stringify(payload)).not.toContain('CATALOGER')
  })
})

describe('cuando la plataforma dice que no', () => {
  it('el correo repetido no es una avería: es que ya está en el equipo', () => {
    const said = inviteFailureText(422, 'A user with this email address has already been registered')
    expect(said).toContain('ya tiene cuenta')
    expect(said).toContain('devuelvas el acceso')
  })

  it('demasiadas seguidas se dice como lo que es, con qué hacer', () => {
    expect(inviteFailureText(429, 'rate limit')).toContain('Espera un minuto')
  })

  it('y lo que no se reconoce no cuenta el fallo de la plataforma en inglés', () => {
    const said = inviteFailureText(500, 'internal server error: pgbouncer')
    expect(said).toBe('No se ha podido mandar la invitación. Vuelve a intentarlo en un momento.')
    expect(said).not.toContain('pgbouncer')
  })
})

describe('y cuando sí', () => {
  it('se dice qué va a pasar después, no solo que se mandó', () => {
    expect(invitedNotice(' Rita@Catalogo.es ')).toBe(
      'Invitación mandada a rita@catalogo.es. Entra como Lector en cuanto elija su contraseña.',
    )
  })
})
