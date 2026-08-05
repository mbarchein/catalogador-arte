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
 * Lo que dicen las pantallas de exposiciones cuando la base dice no, y lo que dicen
 * donde irían las filas (RF-304, RF-901, RF-905).
 *
 * **Los códigos y los mensajes de esta batería están MEDIDOS**, provocados el 4 de
 * agosto de 2026 contra la base local por la misma pasarela REST que usa la
 * aplicación, con la sesión de un Catalogador de verdad y la de un Lector de
 * verdad. Los ocho rechazos de `exhibitions` llegan todos con el mismo código
 * —`23514`— y lo único que los distingue es el nombre del check dentro del
 * mensaje, en inglés. De ahí que las cadenas de estas pruebas sean literales: son
 * la respuesta copiada, no una imitación.
 */

/** La respuesta literal de la pasarela para un check de `exhibitions`. */
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

  /** El mismo check para las dos mitades: cierre antes de la apertura, y cierre sin apertura. */
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
   * Dos claves ajenas se pueden romper por el mismo motivo —lo del otro extremo ya
   * no está— y no con la misma consecuencia, así que no comparten frase.
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

  /** Con la sesión del Lector. Lo que hace falta decir es «vuelve a entrar», no el nombre de una política. */
  it('RF-103: una sesión que no puede escribir se lo dice sin nombrar políticas', () => {
    const text = exhibitionFailureText(
      { code: '42501', message: 'new row violates row-level security policy for table "exhibitions"' },
      'create',
    )
    expect(text).toContain('solo el Catalogador')
    expect(text).not.toContain('row-level security')
  })

  /**
   * Una dirección de una ficha que no está: un enlace pegado mal, o el marcador de
   * algo que nunca se creó. No es un fallo del catálogo y no puede leerse como uno.
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
   * Un mensaje que un trigger ya escribió en español PARA la usuaria se pasa tal
   * cual, con su pista pegada: reescribirlo aquí sería una segunda copia de una
   * frase que vive al lado de la regla.
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
   * En un almacén sin cobertura es el fallo más probable de todos, y sin esta rama
   * la pantalla enseñaba el inglés del navegador sobre `fetch`. Falta además la
   * mitad que importa: no se ha enviado, así que no se ha perdido.
   */
  it('RNF-111: la red caída se dice en español y nombra la operación', () => {
    const text = exhibitionFailureText({ message: 'Failed to fetch' }, 'save')
    expect(text).toContain('No se ha podido guardar la exposición')
    expect(text).toContain('Comprueba la conexión')
  })

  /** La copia local de `isNetworkFailure` tiene que reconocer lo mismo que el original. */
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
   * Medido: PostgREST contesta `[]` y ningún error a un `patch` que no encaja con
   * nada. Fiarse de «no hubo error» haría que la pantalla dijera que la exposición
   * se corrigió cuando no se corrigió, que es el único fallo que una pantalla de
   * mantenimiento no puede tener.
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
   * El esquema NO lo impide, y está medido: a diferencia de una sede —que
   * `tg_exhibition_venue_deactivation` protege— una exposición con participaciones se
   * retira sin protestar, y lo que pasa es que sus filas puente dejan de verse
   * (RF-905). Así que aquí no hay un rechazo que traducir: hay una consecuencia que
   * nadie ve desde esta pantalla y que la confirmación tiene que nombrar y contar.
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

  /** Rellenar con «ninguna obra» entrenaría el ojo a saltarse justo la frase que importa. */
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
   * Mientras la consulta está en vuelo NO se afirma que no haya exposiciones: es la
   * afirmación que hace que alguien cree una segunda ficha de una muestra que ya
   * tiene una.
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

  /** El catálogo empieza con cero exposiciones, así que este es el primer texto que se lee. */
  it('el catálogo vacío explica qué es esta pantalla y qué se hace después', () => {
    const text = exhibitionListNotice({ ...settled, total: 0, shown: 0 }) ?? ''
    expect(text).toContain('Todavía no hay ninguna exposición registrada')
    expect(text).toContain('individual o colectiva')
    expect(text).toContain('desde su propia ficha')
  })

  it('una búsqueda sin resultados repite lo que se buscó', () => {
    const text = exhibitionListNotice({ ...settled, total: 7, shown: 0, query: 'zafra' }) ?? ''
    expect(text).toContain('«zafra»')
  })

  /** Y avisa de que la papelera está fuera, que es la respuesta a la mitad de las búsquedas fallidas. */
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

  /** El cero no se pinta nunca como recuento: en ese caso hay una frase. */
  it('un cero se dice en plural, y la pantalla no lo usa', () => {
    expect(exhibitionCountText(0)).toBe('0 exposiciones')
    expect(exhibitionCountText(-2)).toBe('0 exposiciones')
  })
})
