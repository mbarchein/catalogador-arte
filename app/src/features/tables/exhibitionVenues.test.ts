import { describe, expect, it } from 'vitest'
import {
  emptyVenueDraft,
  planVenueAddition,
  planVenueEdit,
  sortVenues,
  venueDraft,
  venueDraftProblem,
  venueFailureText,
  venueKey,
  venueListNotice,
  venuePayload,
  venuePlaceNotice,
  venuePlaceText,
  venueWriteResult,
} from './exhibitionVenues'
import type { ExhibitionVenue } from '../../lib/types'

/**
 * RF-512: la sede de una exposición es una entrada de vocabulario con clave
 * propia, única por nombre Y localidad, y NO es el árbol de lugares del almacén.
 * RF-1106: se mantiene desde la sección «Tablas».
 */

function venue(over: Partial<ExhibitionVenue> = {}): ExhibitionVenue {
  return {
    id: 'v1',
    name: 'Casa de Cultura',
    locality: 'Zafra',
    country: 'España',
    party_id: null,
    note: '',
    active: true,
    ...over,
  }
}

// ── El sitio de la sede ──────────────────────────────────────

describe('el sitio de una sede', () => {
  it('se lee «localidad, país»', () => {
    expect(venuePlaceText(venue())).toBe('Zafra, España')
  })

  it('sin localidad no deja una coma suelta', () => {
    expect(venuePlaceText(venue({ locality: '' }))).toBe('España')
  })

  it('sin nada no es una cadena con basura', () => {
    expect(venuePlaceText(venue({ locality: '', country: '' }))).toBe('')
  })

  it('los espacios sobrantes no cuentan como localidad', () => {
    expect(venuePlaceText(venue({ locality: '   ', country: 'España' }))).toBe('España')
  })

  /**
   * RF-512: hay una «Casa de Cultura» en cada pueblo, así que una fila sin
   * localidad es la única que hace ambigua la lista. Nunca un hueco (RF-304).
   */
  it('una sede sin sitio lo dice, en vez de dejar la línea en blanco', () => {
    expect(venuePlaceNotice(venue({ locality: '', country: '' }))).toBe('Sin localidad')
  })

  it('una sede con sitio muestra el sitio', () => {
    expect(venuePlaceNotice(venue())).toBe('Zafra, España')
  })
})

// ── La clave de comparación ──────────────────────────────────

describe('la clave de comparación de una sede', () => {
  /** Es el gemelo de `place_key(name), place_key(locality)` del índice único. */
  it('ignora mayúsculas y tildes, en el nombre y en la localidad', () => {
    expect(venueKey({ name: 'Cása de Cultura', locality: 'Badajóz' })).toBe(
      venueKey({ name: 'casa de cultura', locality: 'BADAJOZ' }),
    )
  })

  it('conserva la ñ, que es una letra y no una tilde', () => {
    expect(venueKey({ name: 'Sala Muñoz', locality: '' })).not.toBe(
      venueKey({ name: 'Sala Munoz', locality: '' }),
    )
  })

  it('ignora los espacios de alrededor', () => {
    expect(venueKey({ name: '  Casa de Cultura  ', locality: ' Zafra ' })).toBe(
      venueKey({ name: 'Casa de Cultura', locality: 'Zafra' }),
    )
  })

  /**
   * La misma casa de cultura en dos pueblos son dos sedes: es la razón de que el
   * índice único lleve la localidad dentro.
   */
  it('la misma sede en dos localidades son dos claves', () => {
    expect(venueKey({ name: 'Casa de Cultura', locality: 'Zafra' })).not.toBe(
      venueKey({ name: 'Casa de Cultura', locality: 'Mérida' }),
    )
  })

  /** Sin separador imposible, «Casa, de Cultura»/«Zafra» chocaría con «Casa»/«de Cultura, Zafra». */
  it('el nombre y la localidad no se confunden entre sí', () => {
    expect(venueKey({ name: 'Casa de Cultura', locality: 'Zafra' })).not.toBe(
      venueKey({ name: 'Casa', locality: 'de CulturaZafra' }),
    )
  })
})

// ── El orden de la lista ─────────────────────────────────────

describe('el orden de la lista de sedes', () => {
  it('es por nombre en es-ES, con las tildes en su sitio y no detrás de la z', () => {
    const rows = [
      venue({ id: 'c', name: 'Zabala, sala' }),
      venue({ id: 'a', name: 'Ávila, museo de' }),
      venue({ id: 'b', name: 'Badajoz, museo de' }),
    ]
    expect(sortVenues(rows).map((row) => row.id)).toEqual(['a', 'b', 'c'])
  })

  it('cuando el nombre se repite, manda la localidad', () => {
    const rows = [
      venue({ id: 'z', name: 'Casa de Cultura', locality: 'Zafra' }),
      venue({ id: 'm', name: 'Casa de Cultura', locality: 'Mérida' }),
      venue({ id: 'b', name: 'Casa de Cultura', locality: 'Badajoz' }),
    ]
    expect(sortVenues(rows).map((row) => row.id)).toEqual(['b', 'm', 'z'])
  })

  /** RF-901: la retirada se ve gris donde estaba, no escondida al final. */
  it('las retiradas no se van al fondo: se buscan donde están', () => {
    const rows = [
      venue({ id: 'b', name: 'Bilbao, sala de' }),
      venue({ id: 'a', name: 'Ávila, museo de', active: false }),
    ]
    expect(sortVenues(rows).map((row) => row.id)).toEqual(['a', 'b'])
  })

  it('no toca la lista que recibe', () => {
    const rows = [venue({ id: 'b', name: 'B' }), venue({ id: 'a', name: 'A' })]
    sortVenues(rows)
    expect(rows.map((row) => row.id)).toEqual(['b', 'a'])
  })
})

// ── Lo que la base exige antes de escribir ───────────────────

describe('lo que impide escribir una sede', () => {
  /** `exhibition_venues_name_not_blank`: un nombre en blanco no sitúa nada. */
  it('el nombre en blanco', () => {
    expect(venueDraftProblem({ ...emptyVenueDraft(), name: '   ' })).toBe(
      'Escribe el nombre de la sede',
    )
  })

  /**
   * RF-512: un recorte que dice «Galería Rayuela» y nada más es un dato. Exigir la
   * localidad pararía el registro justo cuando se hace.
   */
  it('no la falta de localidad, aunque sea media identidad', () => {
    expect(venueDraftProblem({ name: 'Galería Rayuela', locality: '', country: '', note: '' })).toBe(
      null,
    )
  })

  it('el país viene puesto en España, que es una pulsación menos y se cambia', () => {
    expect(emptyVenueDraft().country).toBe('España')
    expect(emptyVenueDraft().name).toBe('')
    expect(emptyVenueDraft().note).toBe('')
  })

  it('editar una sede abre sus cuatro campos tal como están guardados', () => {
    expect(venueDraft(venue({ note: 'Cerró en 1988' }))).toEqual({
      name: 'Casa de Cultura',
      locality: 'Zafra',
      country: 'España',
      note: 'Cerró en 1988',
    })
  })
})

describe('lo que viaja a la base', () => {
  /**
   * La base exige que el nombre YA venga sin espacios (`name = btrim(name)`), y
   * dejarlos pasar contesta con el nombre de una restricción en inglés: comprobado
   * contra la base, « Sala Probeta » devuelve 23514, el mismo código que el vacío.
   */
  it('recorta los cuatro campos, porque el nombre lo exige la base', () => {
    expect(
      venuePayload({
        name: '  Sala Rayuela  ',
        locality: ' Zafra ',
        country: ' España ',
        note: '  Cerró en 1988  ',
      }),
    ).toEqual({
      name: 'Sala Rayuela',
      locality: 'Zafra',
      country: 'España',
      note: 'Cerró en 1988',
    })
  })
})

// ── Añadir ──────────────────────────────────────────────────

describe('añadir una sede', () => {
  it('sin nombre no llega a pedir nada', () => {
    const plan = planVenueAddition([], { ...emptyVenueDraft(), name: ' ' })
    expect(plan).toEqual({ action: 'blank', message: 'Escribe el nombre de la sede' })
  })

  it('una sede nueva se inserta con los campos recortados', () => {
    const plan = planVenueAddition([venue()], {
      name: ' Galería Rayuela ',
      locality: 'Madrid',
      country: 'España',
      note: '',
    })
    expect(plan).toEqual({
      action: 'insert',
      payload: { name: 'Galería Rayuela', locality: 'Madrid', country: 'España', note: '' },
    })
  })

  it('la que ya existe se reutiliza, aunque se escriba con otras tildes', () => {
    const plan = planVenueAddition([venue({ id: 'v9' })], {
      name: 'cása de cultura',
      locality: 'ZAFRA',
      country: 'España',
      note: '',
    })
    expect(plan.action).toBe('reuse')
    expect(plan.action === 'reuse' && plan.venue.id).toBe('v9')
  })

  /**
   * RF-901: escribir el nombre de una sede retirada es querer que vuelva. La base
   * contestaría 23505 —el índice único cubre las retiradas— y tratarlo como éxito
   * diría «añadida» dejándola escondida.
   */
  it('la que está retirada vuelve, en vez de fallar por duplicada', () => {
    const plan = planVenueAddition([venue({ id: 'v7', active: false })], {
      name: 'Casa de Cultura',
      locality: 'Zafra',
      country: 'España',
      note: '',
    })
    expect(plan.action).toBe('restore')
    expect(plan.action === 'restore' && plan.venue.id).toBe('v7')
  })

  /** RF-512: el mismo nombre en otro pueblo es otra sede, y la base la acepta. */
  it('la misma casa de cultura en otro pueblo es una sede nueva', () => {
    const plan = planVenueAddition([venue({ locality: 'Zafra' })], {
      name: 'Casa de Cultura',
      locality: 'Mérida',
      country: 'España',
      note: '',
    })
    expect(plan.action).toBe('insert')
  })

  /** El país no entra en el índice único: no distingue dos sedes. */
  it('el país no convierte una sede repetida en una sede nueva', () => {
    const plan = planVenueAddition([venue({ id: 'v1', country: 'España' })], {
      name: 'Casa de Cultura',
      locality: 'Zafra',
      country: 'Portugal',
      note: '',
    })
    expect(plan.action).toBe('reuse')
  })
})

// ── Editar ──────────────────────────────────────────────────

describe('guardar una sede editada', () => {
  it('sin nombre no llega a pedir nada', () => {
    const rows = [venue()]
    expect(planVenueEdit(rows, 'v1', { ...venueDraft(venue()), name: '  ' })).toEqual({
      action: 'blank',
      message: 'Escribe el nombre de la sede',
    })
  })

  /** Abrir una fila, leerla y cerrarla no escribe: gastaría petición y recarga para nada. */
  it('sin cambios no se pide nada a la base', () => {
    const rows = [venue({ note: 'Cerró en 1988' })]
    expect(planVenueEdit(rows, 'v1', venueDraft(rows[0] as ExhibitionVenue))).toEqual({
      action: 'unchanged',
    })
  })

  it('los espacios de alrededor tampoco son un cambio', () => {
    const rows = [venue()]
    expect(
      planVenueEdit(rows, 'v1', { ...venueDraft(venue()), name: ' Casa de Cultura ' }),
    ).toEqual({ action: 'unchanged' })
  })

  it('corregir la localidad es un cambio y se manda recortado', () => {
    const rows = [venue({ locality: 'zafra' })]
    const plan = planVenueEdit(rows, 'v1', { ...venueDraft(rows[0] as ExhibitionVenue), locality: ' Zafra ' })
    expect(plan).toEqual({
      action: 'update',
      payload: { name: 'Casa de Cultura', locality: 'Zafra', country: 'España', note: '' },
    })
  })

  /** Cambiar solo las tildes del nombre no choca con la propia fila. */
  it('ponerle las tildes al nombre no se lee como un duplicado de sí misma', () => {
    const rows = [venue({ name: 'galeria rayuela' })]
    const plan = planVenueEdit(rows, 'v1', {
      ...venueDraft(rows[0] as ExhibitionVenue),
      name: 'Galería Rayuela',
    })
    expect(plan.action).toBe('update')
  })

  it('renombrar hacia una sede que ya está lo dice antes de pedirlo', () => {
    const rows = [
      venue({ id: 'v1', name: 'Sala Nueva', locality: 'Zafra' }),
      venue({ id: 'v2', name: 'Casa de Cultura', locality: 'Zafra' }),
    ]
    const plan = planVenueEdit(rows, 'v1', {
      name: 'casa de cultura',
      locality: 'Zafra',
      country: 'España',
      note: '',
    })
    expect(plan.action).toBe('duplicate')
    expect(plan.action === 'duplicate' && plan.message).toBe(
      'Ya hay una sede llamada «Casa de Cultura» en Zafra, España, y no puede haber dos iguales: ' +
        'usa esa, o distínguelas por la localidad.',
    )
  })

  /**
   * El índice único cubre las retiradas, así que el choque puede ser con una fila
   * que la lista muestra en gris: decir «ya hay una» sin decir que está retirada
   * parecería mentira.
   */
  it('si la que choca está retirada, propone recuperarla', () => {
    const rows = [
      venue({ id: 'v1', name: 'Sala Nueva', locality: 'Mérida' }),
      venue({ id: 'v2', name: 'Casa de Cultura', locality: 'Mérida', active: false }),
    ]
    const plan = planVenueEdit(rows, 'v1', {
      name: 'Casa de Cultura',
      locality: 'Mérida',
      country: 'España',
      note: '',
    })
    expect(plan.action).toBe('duplicate')
    expect(plan.action === 'duplicate' && plan.message).toContain('Recupérala')
  })

  it('la que choca sin localidad se nombra sin dejar «en » colgando', () => {
    const rows = [
      venue({ id: 'v1', name: 'Sala Nueva', locality: '', country: '' }),
      venue({ id: 'v2', name: 'Galería Rayuela', locality: '', country: '' }),
    ]
    const plan = planVenueEdit(rows, 'v1', {
      name: 'Galería Rayuela',
      locality: '',
      country: '',
      note: '',
    })
    expect(plan.action === 'duplicate' && plan.message).toBe(
      'Ya hay una sede llamada «Galería Rayuela» sin localidad, y no puede haber dos iguales: usa ' +
        'esa, o distínguelas por la localidad.',
    )
  })

  /** RF-512: mudar la sede de pueblo la separa de la homónima, y es legítimo. */
  it('mover una sede a otra localidad deja de chocar con su homónima', () => {
    const rows = [
      venue({ id: 'v1', name: 'Casa de Cultura', locality: 'Zafra' }),
      venue({ id: 'v2', name: 'Casa de Cultura', locality: 'Mérida' }),
    ]
    const plan = planVenueEdit(rows, 'v1', {
      name: 'Casa de Cultura',
      locality: 'Badajoz',
      country: 'España',
      note: '',
    })
    expect(plan.action).toBe('update')
  })
})

// ── Cuando la base dice no ───────────────────────────────────

describe('cuando la base dice no', () => {
  /**
   * Códigos comprobados contra la base local a través de la misma pasarela REST
   * que usa la aplicación, no imaginados.
   */
  it('23505: el duplicado explica que la localidad es lo que distingue dos sedes', () => {
    const text = venueFailureText(
      {
        code: '23505',
        message: 'duplicate key value violates unique constraint "exhibition_venues_name_unique"',
        hint: null,
      },
      'create',
    )
    expect(text).toBe(
      'Ya hay una sede con ese nombre en esa localidad, y no puede haber dos iguales. Puede estar ' +
        'retirada: recupérala desde la lista, o distínguela cambiándole la localidad.',
    )
    expect(text).not.toContain('exhibition_venues_name_unique')
  })

  it('23514: el nombre en blanco no se cuenta con el nombre de una restricción', () => {
    const text = venueFailureText(
      {
        code: '23514',
        message:
          'new row for relation "exhibition_venues" violates check constraint "exhibition_venues_name_not_blank"',
      },
      'save',
    )
    expect(text).toBe(
      'El nombre de la sede no puede quedar en blanco: es lo que la ficha de la obra imprime.',
    )
    expect(text).not.toContain('check constraint')
  })

  /**
   * RF-512, RF-901: el disparador `tg_exhibition_venue_deactivation` escribió el
   * mensaje en español para la catalogadora, y la pista es la consecuencia
   * práctica. Se pasan los dos juntos: reescribirlos aquí sería una segunda copia
   * de una frase que vive al lado de la regla, y quedarse solo con el mensaje
   * —como hacen las otras pantallas de la sección— deja el «no se puede» sin el
   * «haz esto primero».
   */
  it('P0001: la sede en uso cuenta el motivo y qué hacer antes', () => {
    expect(
      venueFailureText(
        {
          code: 'P0001',
          message: 'No se puede retirar una sede que todavía acoge exposiciones del catálogo',
          hint: 'Cambia antes la sede de esas exposiciones.',
        },
        'retire',
      ),
    ).toBe(
      'No se puede retirar una sede que todavía acoge exposiciones del catálogo. Cambia antes la ' +
        'sede de esas exposiciones.',
    )
  })

  it('P0001 sin pista no deja un punto suelto al final', () => {
    expect(
      venueFailureText({ code: 'P0001', message: 'No se puede retirar la sede', hint: null }, 'retire'),
    ).toBe('No se puede retirar la sede')
  })

  it('23503: la institución que ya no está no se cuenta como una clave ajena', () => {
    const text = venueFailureText(
      {
        code: '23503',
        message:
          'insert or update on table "exhibition_venues" violates foreign key constraint "exhibition_venues_party_id_fkey"',
        details: 'Key is not present in table "parties".',
      },
      'save',
    )
    expect(text).toContain('institución')
    expect(text).not.toContain('foreign key')
  })

  /** RF-1106: solo el Catalogador mantiene las maestras. */
  it('42501: la sesión sin permiso se cuenta como sesión, no como política', () => {
    const text = venueFailureText(
      { code: '42501', message: 'new row violates row-level security policy for table "exhibition_venues"' },
      'create',
    )
    expect(text).toContain('Vuelve a entrar')
    expect(text).not.toContain('row-level security')
  })

  it('lo que no se esperaba conserva lo que dijo la base, para poder diagnosticarlo', () => {
    expect(venueFailureText({ code: '08006', message: 'connection failure' }, 'load')).toBe(
      'No se han podido cargar las sedes de exposición: connection failure',
    )
  })

  it('un fallo de red se cuenta en español, no con las palabras del navegador', () => {
    // Antes decía «No se ha podido retirar la sede: Failed to fetch»: inglés, y
    // hablando de fetch en vez de la conexión, justo en el fallo más probable de
    // un almacén sin cobertura. Y lo que hace falta saber es que no se mandó.
    const text = venueFailureText({ message: 'Failed to fetch' }, 'retire')
    expect(text).toBe(
      'No se ha podido retirar la sede: la aplicación no ha podido hablar con el catálogo. ' +
        'Comprueba la conexión y vuelve a intentarlo.',
    )
    expect(text).not.toMatch(/fetch/i)
  })

  it('cada operación se nombra por lo que se estaba intentando', () => {
    const failure = { message: 'boom' }
    expect(venueFailureText(failure, 'create')).toContain('crear la sede')
    expect(venueFailureText(failure, 'save')).toContain('guardar la sede')
    expect(venueFailureText(failure, 'restore')).toContain('recuperar la sede')
  })
})

describe('el resultado de una escritura', () => {
  it('sin fallo y con fila tocada, ha funcionado', () => {
    expect(venueWriteResult('save', { failure: null, rows: 1 })).toBe(null)
  })

  /**
   * Comprobado contra la base: PostgREST contesta 204 y ningún error a un update
   * que no encaja con ninguna fila —el Lector que hace PATCH, o un identificador
   * que ya no está—. Fiarse del «no hay error» haría que la pantalla dijera que la
   * sede se ha renombrado sin haberla tocado, que es el único fallo que una
   * pantalla de mantenimiento no puede tener.
   */
  it('sin fallo pero sin filas tocadas, NO ha funcionado', () => {
    const text = venueWriteResult('save', { failure: null, rows: 0 })
    expect(text).toContain('no se ha tocado')
    expect(text).toContain('Vuelve a cargar')
  })

  it('cuando no se cuentan filas, no se inventa un fallo', () => {
    expect(venueWriteResult('create', {})).toBe(null)
  })

  it('el fallo manda sobre el recuento', () => {
    expect(
      venueWriteResult('retire', {
        failure: { code: 'P0001', message: 'No se puede retirar la sede', hint: null },
        rows: 0,
      }),
    ).toBe('No se puede retirar la sede')
  })
})

// ── Nunca una página en blanco ───────────────────────────────

describe('lo que dice la lista cuando no tiene filas', () => {
  it('con filas, no dice nada', () => {
    expect(venueListNotice({ loading: false, error: null, count: 3 })).toBe(null)
  })

  /** Afirmar que no hay sedes mientras la consulta está en el aire es afirmar lo que no se sabe. */
  it('mientras carga, no afirma que no haya sedes', () => {
    expect(venueListNotice({ loading: true, error: null, count: 0 })).toBe('Cargando las sedes…')
  })

  it('si la carga falló, calla: el error ya tiene su párrafo y la lista no sabe nada', () => {
    expect(venueListNotice({ loading: false, error: 'connection failure', count: 0 })).toBe(null)
  })

  /**
   * RF-304, RF-512: nunca una página en blanco. Dice qué es una sede y dónde se crea
   * la primera. Lo que NO hace es defenderse de la confusión con las ubicaciones del
   * almacén: contarle a quien cataloga que dos cosas son distintas es un párrafo que
   * solo hace falta si la pantalla está mal nombrada, y no lo está.
   */
  it('vacía de verdad, dice qué es una sede y dónde se crea la primera', () => {
    const text = venueListNotice({ loading: false, error: null, count: 0 })
    expect(text).toContain('Todavía no hay ninguna sede')
    expect(text).toContain('donde ocurrieron las muestras')
    expect(text).toContain('La primera se crea aquí arriba')
  })
})
