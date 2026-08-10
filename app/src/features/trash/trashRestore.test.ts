import { describe, expect, it } from 'vitest'
import { TRASH_KINDS } from './trashKinds'
import { describeLoadFailure, describeRestoreRefusal } from './trashRestore'

/**
 * The refusals here were provoked against the local base through PostgREST, with
 * the token of whoever catalogues and with that of whoever only consults. The objects in these
 * tests are literal copies of what it answered, not inventions.
 */
describe('un disparador que dice no ya escribe en español, y su pista es la mitad útil', () => {
  it('muestra el mensaje Y la pista, unidos', () => {
    // Measured on recovering a link of an artwork whose provenance is recorded as researched
    // with no result. Keeping only the message leaves the user knowing she cannot and
    // not knowing what to touch: the hint is the one that says what to do.
    const text = describeRestoreRefusal('provenance_events', {
      code: 'P0001',
      message:
        'La procedencia de la obra RC-0001 consta investigada sin resultado y este eslabón la contradice',
      hint: 'Cambia antes el estado de la procedencia a «En curso» o «Completa».',
    })
    expect(text).toBe(
      'La procedencia de la obra RC-0001 consta investigada sin resultado y este eslabón la ' +
        'contradice. Cambia antes el estado de la procedencia a «En curso» o «Completa».',
    )
  })

  it('sin pista no deja un punto suelto al final', () => {
    expect(
      describeRestoreRefusal('artworks', { code: 'P0001', message: 'No se puede.', hint: null }),
    ).toBe('No se puede.')
  })

  it('no dobla el punto que el mensaje ya traía', () => {
    const text = describeRestoreRefusal('artworks', {
      code: 'P0001',
      message: 'No se puede recuperar esto. ',
      hint: 'Haz lo otro primero.',
    })
    expect(text).toBe('No se puede recuperar esto. Haz lo otro primero.')
    expect(text).not.toContain('..')
  })
})

describe('el hueco ocupado mientras algo estaba en la papelera (23505)', () => {
  it('los enlaces externos lo cuentan a su manera, porque son los únicos donde ocurre', () => {
    // Measured: `external_links`' indexes are partial —`where ... and active`—,
    // so a withdrawn link's address IS freed and another one can take it.
    const text = describeRestoreRefusal('external_links', {
      code: '23505',
      message: 'duplicate key value violates unique constraint "external_links_artwork_url_unique"',
      hint: null,
    })
    expect(text).toContain('la misma dirección')
    expect(text).toContain('retira antes el otro')
    // The raw message names an index and helps nobody: it must not reach the screen.
    expect(text).not.toContain('external_links_artwork_url_unique')
    expect(text).not.toContain('duplicate key')
  })

  it('las demás clases dicen lo general, sin nombrar índices', () => {
    const text = describeRestoreRefusal('parties', {
      code: '23505',
      message: 'duplicate key value violates unique constraint "parties_name_unique"',
      hint: null,
    })
    expect(text).toContain('persona o institución')
    expect(text).not.toContain('parties_name_unique')
    expect(text).not.toContain('duplicate key')
  })
})

describe('la negativa silenciosa, que es la peligrosa', () => {
  it('cero filas y ningún error NO es «recuperado»', () => {
    // Measured with the reader's token: a PATCH the policies reject answers
    // HTTP 200 with an empty list and no error. Reporting success there is the one failure
    // a wastebasket cannot afford: the user closes the screen believing that
    // the artwork has come back.
    const text = describeRestoreRefusal('images', null)
    expect(text).toContain('No se ha recuperado nada')
    expect(text).toContain('Vuelve a entrar')
    expect(text.toLowerCase()).not.toContain('recuperada correctamente')
  })
})

describe('la sesión que ya no puede escribir (42501)', () => {
  it('se cuenta como lo que es, y no con el inglés de la política', () => {
    const text = describeRestoreRefusal('artworks', {
      code: '42501',
      message: 'new row violates row-level security policy for table "artworks"',
      hint: null,
    })
    expect(text).toContain('no tiene permiso')
    expect(text).not.toContain('row-level security')
  })
})

describe('lo que no debería poder pasar se dice, no se traga', () => {
  it('una clave ajena rota se cuenta como la anomalía que es', () => {
    // In this catalogue nothing is really deleted, so a 23503 on recovery means
    // something has left the base by a path that does not exist.
    const text = describeRestoreRefusal('provenance_events', {
      code: '23503',
      message: 'insert or update on table "provenance_events" violates foreign key constraint',
      hint: null,
    })
    expect(text).toContain('ya no existe')
    expect(text).toContain('anótalo')
  })

  it('un fallo desconocido conserva el mensaje crudo detrás de una entradilla', () => {
    // Inventing a kind sentence for a failure never seen before hides the
    // only clue there is.
    const text = describeRestoreRefusal('artworks', {
      code: 'XX000',
      message: 'algo muy raro ha pasado',
      hint: null,
    })
    expect(text).toContain('No se ha podido recuperar')
    expect(text).toContain('algo muy raro ha pasado')
  })
})

describe('la conexión caída se separa de la regla que dice no', () => {
  it('un fallo de red dice que el cambio no se ha enviado, no que se haya rechazado', () => {
    // In a storeroom with no coverage it is this screen's most likely failure, and the two
    // sentences ask for opposite things: retry, or change something first.
    const text = describeRestoreRefusal('images', { message: 'TypeError: Failed to fetch' })
    expect(text).toContain('no ha podido hablar con el catálogo')
    expect(text).toContain('Comprueba la conexión')
    expect(text).not.toContain('Failed to fetch')
  })
})

describe('que una clase no se pueda leer no apaga las otras veinte', () => {
  it('el fallo se cuenta nombrando qué clase es', () => {
    const text = describeLoadFailure('bibliography', { message: 'Failed to fetch' })
    expect(text).toContain('referencias bibliográficas')
    expect(text).toContain('no hay conexión')
  })

  it('sin permiso para una tabla, se dice de esa tabla', () => {
    const text = describeLoadFailure('artworks', {
      code: '42501',
      message: 'permission denied for table artworks',
      hint: null,
    })
    expect(text).toContain('no tiene permiso')
    expect(text).toContain('obras')
  })
})

describe('ninguna clase se queda sin frase, en ninguna de las negativas', () => {
  it('las veintiuna contestan algo legible en los seis casos', () => {
    const refusals = [
      null,
      { code: 'P0001', message: 'Un disparador dice no', hint: 'Haz esto antes.' },
      { code: '23505', message: 'duplicate key value violates unique constraint "x"', hint: null },
      { code: '42501', message: 'new row violates row-level security policy', hint: null },
      { code: '23503', message: 'violates foreign key constraint', hint: null },
      { message: 'Failed to fetch' },
    ]
    for (const kind of TRASH_KINDS) {
      for (const refusal of refusals) {
        const text = describeRestoreRefusal(kind.id, refusal)
        expect(text.trim()).not.toBe('')
        // No half-filled templates reaching the screen.
        expect(text).not.toContain('undefined')
        expect(text).not.toContain('[object')
      }
      const load = describeLoadFailure(kind.id, { message: 'Failed to fetch' })
      expect(load).not.toContain('undefined')
    }
  })
})
