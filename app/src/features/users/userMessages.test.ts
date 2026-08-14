import { describe, expect, it } from 'vitest'
import { userFailureText, userWriteResult, withoutRequirementId } from './userMessages'

/**
 * Lo que dice la pantalla de usuarios cuando la base dice que no (RF-1107).
 *
 * Los códigos y los textos están **provocados contra la base y copiados** —la cabecera del
 * módulo dice cuándo y con qué sesión—, así que estos asertos se rompen si alguien
 * reescribe el mensaje de un trigger, que es justo lo que se quiere: la frase que ve quien
 * administra vive junto a la regla, y aquí se fija que llega entera.
 */

describe('los tres noes de la base, en sus palabras', () => {
  it('el rol sin ser superusuario, y sin el identificador del requisito', () => {
    // «(RF-108)» es la referencia que explica la regla dentro del código, y jerga en una
    // pantalla. Se queda donde estaba.
    expect(
      userFailureText(
        { code: 'P0001', message: 'Solo el superusuario puede cambiar el rol de un usuario (RF-108)' },
        'role',
      ),
    ).toBe('Solo el superusuario puede cambiar el rol de un usuario')
  })

  it('el acceso sin ser superusuario, con la pista pegada detrás', () => {
    expect(
      userFailureText(
        {
          code: 'P0001',
          message: 'Solo el superusuario puede dar o quitar el acceso al catálogo',
          hint: 'Pídeselo a quien administre el catálogo.',
        },
        'access',
      ),
    ).toBe(
      'Solo el superusuario puede dar o quitar el acceso al catálogo. Pídeselo a quien administre el catálogo.',
    )
  })

  it('y el último superusuario, que sin la pista no diría qué hacer', () => {
    const said = userFailureText(
      {
        code: 'P0001',
        message: 'No se puede dejar el catálogo sin ningún superusuario',
        hint: 'Nombra antes a otro superusuario: si no queda ninguno, nadie podrá volver a asignar roles desde la aplicación.',
      },
      'role',
    )
    expect(said).toContain('sin ningún superusuario')
    expect(said).toContain('Nombra antes a otro superusuario')
  })
})

describe('el identificador del requisito se queda en el código', () => {
  it('se quita del final, con o sin espacio', () => {
    expect(withoutRequirementId('Una frase (RF-108)')).toBe('Una frase')
    expect(withoutRequirementId('Una frase (RNF-106)')).toBe('Una frase')
  })

  it('pero no se toca lo que va en medio ni un paréntesis normal', () => {
    // Quitar cualquier paréntesis se comería media frase de otro mensaje.
    expect(withoutRequirementId('Mira (RF-108) y sigue')).toBe('Mira (RF-108) y sigue')
    expect(withoutRequirementId('Una obra (con paréntesis)')).toBe('Una obra (con paréntesis)')
  })
})

describe('cuando la base ni siquiera se queja', () => {
  it('cero filas es un no, y se dice', () => {
    // **Es el caso medido**: sobre la fila de otra persona, a quien no administra la
    // política le filtra la fila y la escritura contesta cero filas sin error. Darlo por
    // bueno diría que el rol se cambió cuando no se cambió.
    const said = userWriteResult('role', { rows: 0 })
    expect(said).not.toBeNull()
    expect(said).toContain('No se ha cambiado nada')
  })

  it('una fila tocada es que sí', () => {
    expect(userWriteResult('role', { rows: 1 })).toBeNull()
  })

  it('y un fallo manda sobre el recuento', () => {
    expect(
      userWriteResult('access', { failure: { code: '42501', message: 'row-level security' }, rows: 0 }),
    ).toContain('Solo el superusuario')
  })
})

describe('lo demás', () => {
  it('la política, cuando la escritura sí llega a intentarse', () => {
    expect(
      userFailureText(
        { code: '42501', message: 'new row violates row-level security policy for table "profiles"' },
        'role',
      ),
    ).toBe('Tu sesión no puede administrar el equipo. Solo el superusuario asigna roles.')
  })

  it('sin cobertura se dice que es la conexión y no el catálogo', () => {
    expect(userFailureText({ message: 'Failed to fetch' }, 'load')).toContain('Comprueba la conexión')
  })

  it('y lo que no se reconoce se enseña nombrando lo que se intentaba', () => {
    expect(userFailureText({ code: '23505', message: 'duplicate key' }, 'invite')).toBe(
      'No se ha podido invitar: duplicate key',
    )
  })
})
