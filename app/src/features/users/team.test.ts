import { describe, expect, it } from 'vitest'
import {
  ROLE_HINT,
  accessChangedNotice,
  memberTitle,
  otherActiveSuperusers,
  removeAccessConfirmTitle,
  roleChangedNotice,
  roleOptions,
  teamEntries,
  type TeamMember,
} from './team'

/**
 * El equipo, y lo que la pantalla ofrece de cada fila (RF-1107, RF-108).
 *
 * Lo que se fija aquí es lo que separa esta pantalla de las demás: **ofrecer un gesto que
 * la base va a rechazar no es un fallo estético**. Que la aplicación proponga degradar al
 * último superusuario y luego la base diga que no se lee como una avería, y peor: hace
 * dudar de si el permiso se ha cambiado o no, en la única pantalla donde esa duda importa.
 *
 * Nada de esto es un permiso. Quien decide son las políticas y los triggers, y eso está
 * cubierto en `user_management.test.sql`, autenticándose de verdad como cada rol.
 */

const member = (over: Partial<TeamMember> = {}): TeamMember => ({
  id: 'u-1',
  email: 'rita@catalogo.local',
  name: 'Rita',
  role: 'CATALOGER',
  active: true,
  ...over,
})

describe('con quién se está hablando', () => {
  it('el nombre cuando lo hay', () => {
    expect(memberTitle(member())).toBe('Rita')
  })

  it('y el correo cuando todavía no ha puesto ninguno', () => {
    // Una cuenta recién invitada no tiene nombre hasta que entra: la fila no puede ser un
    // hueco (RF-304).
    expect(memberTitle(member({ name: '' }))).toBe('rita@catalogo.local')
    expect(memberTitle(member({ name: '   ' }))).toBe('rita@catalogo.local')
  })
})

describe('el orden del equipo', () => {
  const equipo = [
    member({ id: 'lector', name: 'Ana', role: 'READER' }),
    member({ id: 'fuera', name: 'Zoe', role: 'SUPERUSER', active: false }),
    member({ id: 'super', name: 'Berta', role: 'SUPERUSER' }),
    member({ id: 'catal', name: 'Carla', role: 'CATALOGER' }),
  ]

  it('primero quien entra, y dentro por responsabilidad', () => {
    expect(teamEntries(equipo, null).map((e) => e.member.id)).toEqual([
      'super',
      'catal',
      'lector',
      'fuera',
    ])
  })

  it('quien no entra va al final, pero está: es de donde se le devuelve el acceso', () => {
    const fuera = teamEntries(equipo, null).at(-1)
    expect(fuera?.member.id).toBe('fuera')
    expect(fuera?.withoutAccess).toBe(true)
  })

  it('la fila de quien mira se marca', () => {
    const entries = teamEntries(equipo, 'catal')
    expect(entries.filter((e) => e.self).map((e) => e.member.id)).toEqual(['catal'])
  })

  it('el correo no se repite debajo del nombre cuando el nombre ES el correo', () => {
    const [entry] = teamEntries([member({ name: '' })], null)
    expect(entry?.title).toBe('rita@catalogo.local')
    expect(entry?.subtitle).toBe('')
  })
})

describe('el último superusuario con acceso', () => {
  it('no se le ofrece nada que deje el catálogo sin gobierno', () => {
    // Sin ninguno, nadie puede volver a asignar roles desde la aplicación: hay que entrar
    // al panel de Supabase. Un clic no puede tener esa consecuencia.
    const solo = [member({ id: 'super', role: 'SUPERUSER' }), member({ id: 'catal' })]
    const entry = teamEntries(solo, null).find((e) => e.member.id === 'super')
    expect(entry?.demotable).toBe(false)
    expect(roleOptions(entry!).map((o) => o.value)).toEqual(['SUPERUSER'])
  })

  it('con otro superusuario con acceso, sí', () => {
    const dos = [
      member({ id: 'super', role: 'SUPERUSER' }),
      member({ id: 'otra', role: 'SUPERUSER' }),
    ]
    const entry = teamEntries(dos, null).find((e) => e.member.id === 'super')
    expect(entry?.demotable).toBe(true)
    expect(roleOptions(entry!)).toHaveLength(3)
  })

  it('un superusuario SIN acceso no vale de relevo', () => {
    // Si contara, el catálogo podría quedarse gobernado por alguien que no entra. Es la
    // misma cuenta que hace el trigger.
    const conFantasma = [
      member({ id: 'super', role: 'SUPERUSER' }),
      member({ id: 'fuera', role: 'SUPERUSER', active: false }),
    ]
    expect(otherActiveSuperusers(conFantasma, 'super')).toBe(0)
    const entry = teamEntries(conFantasma, null).find((e) => e.member.id === 'super')
    expect(entry?.demotable).toBe(false)
  })

  it('y a quien ya está sin acceso no le protege esta regla', () => {
    // Su rol se puede cambiar: no gobierna nada mientras no entre.
    const fuera = teamEntries([member({ id: 'fuera', role: 'SUPERUSER', active: false })], null)
    expect(fuera[0]?.demotable).toBe(true)
  })
})

describe('los roles se ofrecen diciendo qué dan', () => {
  it('los tres, con el suyo marcado y una línea de qué hace', () => {
    const entry = teamEntries([member()], null)[0]!
    const options = roleOptions(entry)
    expect(options.map((o) => o.value)).toEqual(['SUPERUSER', 'CATALOGER', 'READER'])
    // Sin la línea, elegir «Catalogador» es elegir una palabra.
    expect(options.every((o) => o.hint.length > 0)).toBe(true)
    expect(options[2]?.hint).toBe(ROLE_HINT.READER)
  })
})

describe('lo que se lee al hacerlo', () => {
  it('el rol, en pasado y nombrando a quién', () => {
    expect(roleChangedNotice(member(), 'READER')).toBe('Rita pasa a Lector · solo consulta.')
  })

  it('el acceso, en sus dos sentidos', () => {
    expect(accessChangedNotice(member(), false)).toBe('Rita ya no entra al catálogo.')
    expect(accessChangedNotice(member(), true)).toBe('Rita vuelve a entrar al catálogo.')
  })

  it('y la pregunta nombra a la persona, que es lo que se está a punto de hacer', () => {
    expect(removeAccessConfirmTitle(member())).toBe('¿Quitar el acceso a Rita?')
  })
})
