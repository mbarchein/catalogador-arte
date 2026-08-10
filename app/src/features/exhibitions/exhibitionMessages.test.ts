import { describe, expect, it } from 'vitest'
import { isNetworkFailure } from '../tables/vocabularies'
import {
  exhibitionCountText,
  exhibitionFailureText,
  exhibitionListNotice,
  exhibitionWriteResult,
  retireConfirmText,
  retireImpactText,
} from './exhibitionMessages'

/**
 * What the exhibition screens say when the base says no, and what they say
 * where the rows would go (RF-304, RF-901, RF-905).
 *
 * **This suite's codes and messages are MEASURED**, provoked on 4
 * August 2026 against the local base through the same REST gateway the
 * application uses, with a real Cataloguer's session and a real Reader's.
 * `exhibitions`' eight rejections all arrive with the same code
 * —`23514`— and the only thing distinguishing them is the check's name inside the
 * message, in English. Hence this suite's strings being
 * literal: they are the answer copied, not an imitation.
 */

/** The gateway's literal answer for an `exhibitions` check. */
function check(name: string) {
  return {
    code: '23514',
    message: `new row for relation "exhibitions" violates check constraint "${name}"`,
    details: null,
    hint: null,
  }
}

describe('los ocho rechazos de la base, en español y con la consecuencia', () => {
  it('título en blanco', () => {
    const text = exhibitionFailureText(check('exhibitions_title_not_blank'), 'create')
    expect(text).toContain('no puede quedar en blanco')
    expect(text).not.toContain('exhibitions_title_not_blank')
  })

  it('sin fechar', () => {
    expect(exhibitionFailureText(check('exhibitions_dated'), 'create')).toContain(
      'necesita al menos el año',
    )
  })

  /** The same check for both halves: closing before opening, and closing with no opening. */
  it('fechas incoherentes, con las dos mitades en una frase', () => {
    const text = exhibitionFailureText(check('exhibitions_coherent_dates'), 'save')
    expect(text).toContain('cerraría antes de abrir')
    expect(text).toContain('sin fecha de apertura')
  })

  it('el año contradice a la fecha, y la salida es quitar el año', () => {
    const text = exhibitionFailureText(check('exhibitions_year_matches_start_date'), 'save')
    expect(text).toContain('Deja solo la fecha')
  })

  it('año fuera de rango', () => {
    expect(exhibitionFailureText(check('exhibitions_plausible_year'), 'create')).toContain(
      'entre 1000 y 2100',
    )
  })

  it('RF-503: catálogo con ficha bibliográfica que se quiere dejar sin catálogo', () => {
    const text = exhibitionFailureText(
      check('exhibitions_catalogue_reference_needs_catalogue'),
      'save',
    )
    expect(text).toContain('está dado de alta en la bibliografía')
    expect(text).toContain('desde la bibliografía')
  })

  /**
   * Two foreign keys can break for the same reason —what was at the other end is
   * no longer there— and not with the same consequence, so they do not share a sentence.
   */
  it('la sede desaparecida ofrece la salida que de verdad existe', () => {
    const text = exhibitionFailureText(
      {
        code: '23503',
        message:
          'insert or update on table "exhibitions" violates foreign key constraint "exhibitions_venue_id_fkey"',
        details: 'Key is not present in table "exhibition_venues".',
        hint: null,
      },
      'save',
    )
    expect(text).toContain('sin sede')
    expect(text).toContain('la sede consta así')
  })

  it('la ficha del catálogo desaparecida manda a la bibliografía', () => {
    const text = exhibitionFailureText(
      {
        code: '23503',
        message:
          'insert or update on table "exhibitions" violates foreign key constraint "exhibitions_catalogue_reference_id_fkey"',
        message_details: null,
      } as never,
      'save',
    )
    expect(text).toContain('bibliografía')
  })

  it('una clave ajena que no se reconoce no deja al catálogo sin explicación', () => {
    const text = exhibitionFailureText(
      { code: '23503', message: 'violates foreign key constraint "otra_cosa_fkey"' },
      'save',
    )
    expect(text).toContain('ya no está en el catálogo')
  })

  /** With the Reader's session. What needs saying is «vuelve a entrar», not a policy's name. */
  it('RF-103: una sesión que no puede escribir se lo dice sin nombrar políticas', () => {
    const text = exhibitionFailureText(
      { code: '42501', message: 'new row violates row-level security policy for table "exhibitions"' },
      'create',
    )
    expect(text).toContain('solo el Catalogador')
    expect(text).not.toContain('row-level security')
  })

  /**
   * An address of a record that is not there: a badly pasted link, or the bookmark of
   * something that was never created. It is not a failure of the catalogue and cannot read as one.
   */
  it('una ficha que no existe no se cuenta como avería', () => {
    const text = exhibitionFailureText(
      { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' },
      'loadOne',
    )
    expect(text).toContain('no está en el catálogo')
    expect(text).not.toContain('JSON')
  })

  /**
   * A message a trigger already wrote in Spanish FOR the user is passed as
   * is, with its hint attached: rewriting it here would be a second copy of a
   * sentence that lives next to the rule.
   */
  it('lo que la base escribió en español se muestra tal cual, con su pista', () => {
    expect(
      exhibitionFailureText(
        { code: 'P0001', message: 'No se puede retirar algo', hint: 'Haz esto antes.' },
        'retire',
      ),
    ).toBe('No se puede retirar algo. Haz esto antes.')
  })

  it('sin pista, el mensaje del trigger no se adorna', () => {
    expect(
      exhibitionFailureText({ code: 'P0001', message: 'No se puede retirar algo', hint: '' }, 'retire'),
    ).toBe('No se puede retirar algo')
  })

  /**
   * In a storeroom with no coverage it is the most likely failure of all, and without this branch
   * the screen showed the browser's English about `fetch`. It also misses the
   * half that matters: it has not been sent, so it has not been lost.
   */
  it('RNF-111: la red caída se dice en español y nombra la operación', () => {
    const text = exhibitionFailureText({ message: 'Failed to fetch' }, 'save')
    expect(text).toContain('No se ha podido guardar la exposición')
    expect(text).toContain('Comprueba la conexión')
  })

  /** The local copy of `isNetworkFailure` has to recognise the same things as the original. */
  it('reconoce las mismas caídas de red que las pantallas de Tablas', () => {
    for (const message of ['Failed to fetch', 'NetworkError when attempting', 'Load failed']) {
      expect(isNetworkFailure(message)).toBe(true)
      expect(exhibitionFailureText({ message }, 'load')).toContain('Comprueba la conexión')
    }
  })

  it('un rechazo inesperado conserva lo que dijo la base: si no, nadie lo diagnostica', () => {
    const text = exhibitionFailureText({ code: '42P01', message: 'relation does not exist' }, 'load')
    expect(text).toBe('No se han podido cargar las exposiciones: relation does not exist')
  })
})

describe('el resultado de una escritura', () => {
  it('sin fallo y con filas tocadas, no hay nada que decir', () => {
    expect(exhibitionWriteResult('save', { failure: null, rows: 1 })).toBeNull()
  })

  /**
   * Measured: PostgREST answers `[]` and no error to a `patch` that matches
   * nothing. Trusting «there was no error» would make the screen say that the exhibition
   * was corrected when it was not, which is the one failure a maintenance
   * screen cannot have.
   */
  it('cero filas tocadas no es un éxito', () => {
    const text = exhibitionWriteResult('save', { failure: null, rows: 0 })
    expect(text).toContain('no se ha tocado')
    expect(text).toContain('Vuelve a cargar')
  })

  it('sin contar filas no se inventa un cero: un insert sin select no devuelve nada que contar', () => {
    expect(exhibitionWriteResult('create', { failure: null })).toBeNull()
  })

  it('un fallo manda sobre el recuento', () => {
    expect(
      exhibitionWriteResult('retire', { failure: { code: '42501', message: 'x' }, rows: 0 }),
    ).toContain('solo el Catalogador')
  })
})

describe('retirar una exposición dice a cuántas obras se lleva (RF-901, RF-905)', () => {
  /**
   * The schema does NOT prevent it, and it is measured: unlike a venue —which
   * `tg_exhibition_venue_deactivation` protects— an exhibition with participations is
   * withdrawn without protest, and what happens is that its bridge rows stop being visible
   * (RF-905). So here there is no rejection to translate: there is a consequence
   * nobody sees from this screen and that the confirmation has to name and tell.
   */
  it('cuenta las obras y concuerda en número', () => {
    expect(retireImpactText(1)).toContain('1 obra')
    expect(retireImpactText(1)).toContain('su historial expositivo')
    expect(retireImpactText(3)).toContain('3 obras')
    expect(retireImpactText(3)).toContain('sus historiales expositivos')
  })

  it('dice qué se pierde de vista: el número de catálogo y las notas', () => {
    const text = retireImpactText(2) ?? ''
    expect(text).toContain('número de catálogo')
    expect(text).toContain('se puede recuperar')
  })

  /** Padding it with «ninguna obra» would train the eye to skip precisely the sentence that matters. */
  it('sin obras dentro no hay impacto que anunciar', () => {
    expect(retireImpactText(0)).toBeNull()
    expect(retireImpactText(-4)).toBeNull()
  })

  it('la confirmación nombra la exposición y encabeza con el impacto', () => {
    const text = retireConfirmText('Rotili. Obra reciente', 3)
    expect(text).toContain('«Rotili. Obra reciente»')
    expect(text).toContain('3 obras')
  })

  it('sin obras dentro, la confirmación tranquiliza en vez de alarmar', () => {
    const text = retireConfirmText('Rotili. Obra reciente', 0)
    expect(text).toContain('No se borra')
    expect(text).not.toContain('obras del catálogo')
  })

  it('sin título —que la base no permite— no deja la frase descabezada', () => {
    expect(retireConfirmText('   ', 0)).toContain('esta exposición')
  })
})

describe('lo que el listado dice cuando no tiene filas (RF-304, RF-605)', () => {
  const settled = { loading: false, error: null, query: '', includingRetired: false }

  it('con filas que pintar, ningún aviso', () => {
    expect(exhibitionListNotice({ ...settled, total: 5, shown: 5 })).toBeNull()
  })

  /**
   * While the query is in flight it is NOT stated that there are no exhibitions: it is the
   * statement that makes somebody create a second record for a show that already
   * has one.
   */
  it('cargando no afirma que el catálogo esté vacío', () => {
    const text = exhibitionListNotice({ ...settled, loading: true, total: 0, shown: 0 })
    expect(text).toBe('Cargando las exposiciones…')
  })

  it('si la carga falló, el aviso calla: el error tiene su propia línea', () => {
    expect(
      exhibitionListNotice({ ...settled, error: 'sin red', total: 0, shown: 0 }),
    ).toBeNull()
  })

  /** The catalogue starts with zero exhibitions, so this is the first text read. */
  it('el catálogo vacío dice que lo está y dónde se da de alta la primera', () => {
    const text = exhibitionListNotice({ ...settled, total: 0, shown: 0 }) ?? ''
    expect(text).toContain('Todavía no hay ninguna exposición registrada')
    expect(text).toContain('Aquí se dan de alta')
  })

  it('una búsqueda sin resultados repite lo que se buscó', () => {
    const text = exhibitionListNotice({ ...settled, total: 7, shown: 0, query: 'zafra' }) ?? ''
    expect(text).toContain('«zafra»')
  })

  /** And it warns that the wastebasket is out, which is the answer to half the failed searches. */
  it('con las retiradas escondidas, lo dice', () => {
    expect(exhibitionListNotice({ ...settled, total: 7, shown: 0 })).toContain(
      'Las retiradas no se están mostrando',
    )
  })

  it('con las retiradas a la vista, no lo repite', () => {
    expect(
      exhibitionListNotice({ ...settled, total: 7, shown: 0, includingRetired: true }),
    ).not.toContain('retiradas no se están mostrando')
  })
})

describe('el recuento del listado', () => {
  it('concuerda en número', () => {
    expect(exhibitionCountText(1)).toBe('1 exposición')
    expect(exhibitionCountText(3)).toBe('3 exposiciones')
  })

  /** Zero is never painted as a count: in that case there is a sentence. */
  it('un cero se dice en plural, y la pantalla no lo usa', () => {
    expect(exhibitionCountText(0)).toBe('0 exposiciones')
    expect(exhibitionCountText(-2)).toBe('0 exposiciones')
  })
})
