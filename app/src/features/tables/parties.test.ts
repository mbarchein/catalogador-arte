import { describe, expect, it } from 'vitest'
import {
  CONTACT_DETAIL,
  CONTACT_NOTICE,
  CONTACT_STATUS_OPTIONS,
  PARTY_TYPE_OPTIONS,
  contactFieldNotice,
  contactText,
  describePartyUsage,
  emptyPartyDraft,
  emptyPartyUsage,
  filterParties,
  partyDraft,
  partyDraftProblem,
  partyFailureText,
  partyKey,
  partyListNotice,
  partyPayload,
  partyPlaceText,
  partySubtitle,
  partyUsageIsEmpty,
  partyWriteResult,
  planPartyAddition,
  planPartyEdit,
  retireRefusalText,
  sortParties,
  spanishList,
  summarizeParties,
  type PartyDraft,
  type PartyListRow,
} from './parties'

/**
 * RF-508: personas e instituciones son UNA SOLA ficha con clave sustituta
 * (ADR-007), y su nombre se corrige en un sitio y lo ve el catálogo entero.
 * RF-105: el contacto es dato personal de un tercero que el Lector SÍ puede leer,
 * medido contra la base; la pantalla no lo pinta por descuido, y sobre todo no lo
 * borra al guardar otra cosa.
 * RF-1106: se mantiene desde la sección «Tablas», solo el Catalogador.
 * RF-901: nada se borra, se retira — y no se retira lo que está en uso.
 * RF-304: nunca un hueco sin explicación.
 */

function row(over: Partial<PartyListRow> = {}): PartyListRow {
  return {
    id: 'p1',
    party_type: 'INSTITUTION',
    name: 'Museo de Bellas Artes de Badajoz (MUBA)',
    locality: 'Badajoz',
    country: 'España',
    contact_status: 'NOT_CONTACTED',
    note: '',
    active: true,
    ...over,
  }
}

function draft(over: Partial<PartyDraft> = {}): PartyDraft {
  return { ...emptyPartyDraft(), name: 'Galería Rayuela', ...over }
}

// ── Los dos enumerados, en su orden ──────────────────────────

describe('los enumerados que ofrece la pantalla (RF-508)', () => {
  it('persona e institución, en el orden del tipo y sin «Sin revisar»', () => {
    expect(PARTY_TYPE_OPTIONS).toEqual([
      { value: 'PERSON', text: 'Persona' },
      { value: 'INSTITUTION', text: 'Institución' },
    ])
  })

  it('el estado de contacto conserva el orden del progreso, no el alfabético', () => {
    expect(CONTACT_STATUS_OPTIONS.map((option) => option.value)).toEqual([
      'NOT_CONTACTED',
      'CONTACTED',
      'INFO_RECEIVED',
      'VISITED',
      'VERIFIED',
    ])
  })

  it('y sus etiquetas son las de types.ts, en español', () => {
    expect(CONTACT_STATUS_OPTIONS[0]).toEqual({ value: 'NOT_CONTACTED', text: 'Sin contactar' })
    expect(CONTACT_STATUS_OPTIONS[4]).toEqual({ value: 'VERIFIED', text: 'Datos verificados' })
  })
})

// ── La identidad: place_key, no normalizeForSearch ───────────

describe('la clave de comparación de un nombre (ADR-007)', () => {
  it('ignora mayúsculas y tildes, que es lo que hace el índice único', () => {
    expect(partyKey('Colección Vargas')).toBe(partyKey('coleccion vargas'))
  })

  it('DEJA EN PIE LA Ñ: «Muñiz» y «Muniz» son dos personas distintas', () => {
    // La trampa de esta tanda de pantallas: normalizeForSearch aplana la ñ y
    // habría contestado «ya está» a un nombre que la base sí acepta.
    expect(partyKey('Muñiz')).not.toBe(partyKey('Muniz'))
  })

  it('y recorta los espacios de alrededor, como place_key', () => {
    expect(partyKey('  Fundación Rotili  ')).toBe(partyKey('Fundación Rotili'))
  })
})

// ── El orden y la línea de debajo ────────────────────────────

describe('el orden de la lista', () => {
  it('ordena en es-ES: «Álvarez» va con las a, no detrás de la z', () => {
    const names = sortParties([
      row({ id: '1', name: 'Zabala' }),
      row({ id: '2', name: 'Álvarez' }),
      row({ id: '3', name: 'Muñoz' }),
    ]).map((party) => party.name)
    expect(names).toEqual(['Álvarez', 'Muñoz', 'Zabala'])
  })

  it('no manda las retiradas al fondo: se recuperan desde donde se buscan', () => {
    const names = sortParties([
      row({ id: '1', name: 'Bermejo' }),
      row({ id: '2', name: 'Aranda', active: false }),
    ]).map((party) => party.name)
    expect(names).toEqual(['Aranda', 'Bermejo'])
  })

  it('no toca el array que recibe', () => {
    const original = [row({ id: '1', name: 'Z' }), row({ id: '2', name: 'A' })]
    sortParties(original)
    expect(original[0]?.name).toBe('Z')
  })
})

describe('la segunda línea de una ficha (RF-304)', () => {
  it('dice el tipo y el sitio', () => {
    expect(partySubtitle(row())).toBe('Institución · Badajoz, España')
  })

  it('sin localidad ni país se queda en el tipo, nunca en blanco', () => {
    expect(partySubtitle(row({ party_type: 'PERSON', locality: '', country: '' }))).toBe('Persona')
  })

  it('el sitio no deja comas colgando cuando falta una mitad', () => {
    expect(partyPlaceText({ locality: '', country: 'España' })).toBe('España')
    expect(partyPlaceText({ locality: 'Zafra', country: '' })).toBe('Zafra')
    expect(partyPlaceText({ locality: '', country: '' })).toBe('')
  })
})

// ── La búsqueda: perdona lo que la identidad no perdona ──────

describe('el filtro de la lista', () => {
  const register = [
    row({ id: '1', name: 'Muñiz Hermanos', locality: 'Cáceres' }),
    row({ id: '2', name: 'Galería Rayuela', locality: 'Madrid' }),
    row({ id: '3', name: 'Colección Vargas', locality: 'Zafra', country: 'Portugal' }),
  ]

  it('sin texto devuelve todo', () => {
    expect(filterParties(register, '  ')).toHaveLength(3)
  })

  it('busca por nombre sin tildes ni mayúsculas', () => {
    expect(filterParties(register, 'GALERIA').map((party) => party.id)).toEqual(['2'])
  })

  it('SÍ aplana la ñ al buscar, al contrario que la identidad', () => {
    // Buscar perdona: en un teclado de móvil «muniz» tiene que encontrar
    // «Muñiz». Crear no perdona: son dos personas.
    expect(filterParties(register, 'muniz').map((party) => party.id)).toEqual(['1'])
    expect(partyKey('Muniz')).not.toBe(partyKey('Muñiz'))
  })

  it('busca también por localidad y por país', () => {
    expect(filterParties(register, 'zafra').map((party) => party.id)).toEqual(['3'])
    expect(filterParties(register, 'portugal').map((party) => party.id)).toEqual(['3'])
  })

  it('no encuentra nada que no esté, y no devuelve la lista entera', () => {
    expect(filterParties(register, 'prado')).toEqual([])
  })
})

// ── El borrador, y el contacto que NO se pisa ────────────────

describe('el borrador de una ficha nueva', () => {
  it('arranca en Persona y con el país puesto', () => {
    const blank = emptyPartyDraft()
    expect(blank.party_type).toBe('PERSON')
    expect(blank.country).toBe('España')
    expect(blank.contact_status).toBe('NOT_CONTACTED')
  })

  it('arranca SIN contacto cargado: el alta no puede escribir un dato personal', () => {
    expect(emptyPartyDraft().contact).toBeNull()
  })

  it('pide el nombre y solo el nombre', () => {
    expect(partyDraftProblem(draft({ name: '   ' }))).toBe(
      'Escribe el nombre de la persona o de la institución',
    )
    expect(partyDraftProblem(draft({ locality: '', country: '' }))).toBeNull()
  })
})

describe('el borrador con el que se abre una ficha existente (RF-105)', () => {
  it('trae los campos de la fila y el contacto que se le pase', () => {
    const opened = partyDraft(row(), '655 000 000')
    expect(opened.name).toBe('Museo de Bellas Artes de Badajoz (MUBA)')
    expect(opened.party_type).toBe('INSTITUTION')
    expect(opened.contact).toBe('655 000 000')
  })

  it('con el contacto sin cargar queda null, que no es lo mismo que vacío', () => {
    expect(partyDraft(row(), null).contact).toBeNull()
    expect(partyDraft(row(), '').contact).toBe('')
  })
})

describe('lo que viaja a la base', () => {
  it('recorta todo, porque la base exige que el nombre ya venga recortado', () => {
    const payload = partyPayload(
      draft({ name: '  Galería Rayuela  ', locality: ' Madrid ', country: ' España ', note: ' x ' }),
    )
    expect(payload.name).toBe('Galería Rayuela')
    expect(payload.locality).toBe('Madrid')
    expect(payload.country).toBe('España')
    expect(payload.note).toBe('x')
  })

  it('NO manda la columna de contacto cuando el borrador no la cargó', () => {
    // El fallo que convertiría la protección en destrucción: guardar el nombre
    // corregido de un museo borraría el teléfono de la persona de la ficha.
    const payload = partyPayload(draft({ contact: null }))
    expect('contact' in payload).toBe(false)
  })

  it('la manda, recortada, cuando sí la cargó', () => {
    expect(partyPayload(draft({ contact: '  a@b.test ' })).contact).toBe('a@b.test')
  })

  it('y la manda vacía cuando se borró a propósito: eso sí es una decisión', () => {
    const payload = partyPayload(draft({ contact: '' }))
    expect('contact' in payload).toBe(true)
    expect(payload.contact).toBe('')
  })

  it('lleva el tipo y el estado de contacto tal cual', () => {
    const payload = partyPayload(draft({ party_type: 'INSTITUTION', contact_status: 'VISITED' }))
    expect(payload.party_type).toBe('INSTITUTION')
    expect(payload.contact_status).toBe('VISITED')
  })
})

// ── Dar de alta ──────────────────────────────────────────────

describe('qué hace «Añadir» (RF-901, ADR-007)', () => {
  const register = [
    row({ id: '1', name: 'Colección Vargas', active: true }),
    row({ id: '2', name: 'Galería Rayuela', active: false }),
  ]

  it('sin nombre no escribe nada y dice por qué', () => {
    const plan = planPartyAddition(register, draft({ name: ' ' }))
    expect(plan).toEqual({
      action: 'blank',
      message: 'Escribe el nombre de la persona o de la institución',
    })
  })

  it('un nombre nuevo se inserta, con lo escrito recortado', () => {
    const plan = planPartyAddition(register, draft({ name: '  Museo del Prado ' }))
    expect(plan.action).toBe('insert')
    if (plan.action === 'insert') expect(plan.payload.name).toBe('Museo del Prado')
  })

  it('un alta nunca manda contacto: el plan de inserción no lleva la columna', () => {
    const plan = planPartyAddition(register, draft({ name: 'Museo del Prado' }))
    if (plan.action === 'insert') expect('contact' in plan.payload).toBe(false)
  })

  it('el equivalente activo se reutiliza, aunque se escriba en minúsculas', () => {
    const plan = planPartyAddition(register, draft({ name: 'coleccion vargas' }))
    expect(plan.action).toBe('reuse')
    if (plan.action === 'reuse') expect(plan.party.id).toBe('1')
  })

  it('el equivalente RETIRADO se recupera, que es lo que significa escribirlo', () => {
    const plan = planPartyAddition(register, draft({ name: 'GALERIA RAYUELA' }))
    expect(plan.action).toBe('restore')
    if (plan.action === 'restore') expect(plan.party.id).toBe('2')
  })

  it('«Muniz» con «Muñiz» en la lista se inserta: son dos personas', () => {
    const plan = planPartyAddition([row({ id: '9', name: 'Muñiz' })], draft({ name: 'Muniz' }))
    expect(plan.action).toBe('insert')
  })
})

// ── Editar ───────────────────────────────────────────────────

describe('qué hace «Guardar» en una ficha (RF-801)', () => {
  const register = [
    row({ id: '1', name: 'Colección Vargas', locality: 'Zafra' }),
    row({ id: '2', name: 'Galería Rayuela', locality: 'Madrid' }),
    row({ id: '3', name: 'Fundación Antigua', locality: '', active: false }),
  ]

  it('sin nombre no escribe nada', () => {
    const opened = partyDraft(register[0] as PartyListRow, '')
    const plan = planPartyEdit(register, '1', opened, { ...opened, name: '  ' })
    expect(plan.action).toBe('blank')
  })

  it('abrir el lápiz y guardar sin tocar nada NO escribe', () => {
    // Escribiría updated_at y updated_by (sellados por tg_row_audit) y pondría
    // esta sesión sobre una ficha que nadie tocó.
    const opened = partyDraft(register[0] as PartyListRow, '655 000 000')
    expect(planPartyEdit(register, '1', opened, { ...opened })).toEqual({ action: 'unchanged' })
  })

  it('y tampoco escribe cuando el contacto no se pudo cargar y no se tocó nada más', () => {
    const opened = partyDraft(register[0] as PartyListRow, null)
    expect(planPartyEdit(register, '1', opened, { ...opened })).toEqual({ action: 'unchanged' })
  })

  it('cambiar solo el contacto SÍ es un cambio', () => {
    const opened = partyDraft(register[0] as PartyListRow, '655 000 000')
    const plan = planPartyEdit(register, '1', opened, { ...opened, contact: '655 000 001' })
    expect(plan.action).toBe('update')
    if (plan.action === 'update') expect(plan.payload.contact).toBe('655 000 001')
  })

  it('con el contacto sin cargar, guardar el nombre NO lleva la columna', () => {
    const opened = partyDraft(register[0] as PartyListRow, null)
    const plan = planPartyEdit(register, '1', opened, { ...opened, name: 'Colección Vargas Hnos.' })
    expect(plan.action).toBe('update')
    if (plan.action === 'update') expect('contact' in plan.payload).toBe(false)
  })

  it('corregir mayúsculas y tildes del propio nombre sigue siendo posible', () => {
    const opened = partyDraft(register[0] as PartyListRow, '')
    const plan = planPartyEdit(register, '1', opened, { ...opened, name: 'coleccion vargas' })
    expect(plan.action).toBe('update')
  })

  it('ponerle a una ficha el nombre de OTRA se explica, sin nombrar el índice', () => {
    const opened = partyDraft(register[0] as PartyListRow, '')
    const plan = planPartyEdit(register, '1', opened, { ...opened, name: 'galeria rayuela' })
    expect(plan.action).toBe('duplicate')
    if (plan.action === 'duplicate') {
      expect(plan.message).toContain('«Galería Rayuela»')
      expect(plan.message).toContain('Madrid')
      expect(plan.message).toContain('las mayúsculas y las tildes no cuentan')
      expect(plan.message).not.toContain('parties_name_unique')
    }
  })

  it('si la que choca está retirada, manda a recuperarla y dice qué se conserva', () => {
    const opened = partyDraft(register[0] as PartyListRow, '')
    const plan = planPartyEdit(register, '1', opened, { ...opened, name: 'Fundación Antigua' })
    expect(plan.action).toBe('duplicate')
    if (plan.action === 'duplicate') {
      expect(plan.message).toContain('retirada')
      expect(plan.message).toContain('Recupérala')
      expect(plan.message).toContain('procedencias')
    }
  })

  it('cambiar el tipo es una edición normal: una colección familiar se hace fundación', () => {
    // RF-508: el mismo eslabón de la cadena, no una ficha nueva.
    const opened = partyDraft(register[0] as PartyListRow, '')
    expect(opened.party_type).toBe('INSTITUTION')
    const plan = planPartyEdit(register, '1', opened, { ...opened, party_type: 'PERSON' })
    expect(plan.action).toBe('update')
    if (plan.action === 'update') expect(plan.payload.party_type).toBe('PERSON')
  })
})

// ── Lo que contesta la base, medido contra la base ───────────

describe('las frases de las negativas de la base (RF-1106)', () => {
  it('23505: el nombre repetido, con qué hacer y sin el nombre del índice', () => {
    const text = partyFailureText(
      {
        code: '23505',
        message: 'duplicate key value violates unique constraint "parties_name_unique"',
        hint: null,
      },
      'create',
    )
    expect(text).toContain('Ya hay una ficha con ese nombre')
    expect(text).toContain('recupérala')
    expect(text).toContain('Juan Pérez (Badajoz)')
    expect(text).not.toContain('duplicate key')
    expect(text).not.toContain('parties_name_unique')
  })

  it('23514: el nombre en blanco o con espacios, dicho en español', () => {
    const text = partyFailureText(
      {
        code: '23514',
        message: 'new row for relation "parties" violates check constraint "parties_name_not_blank"',
      },
      'create',
    )
    expect(text).toContain('no puede quedar en blanco')
    expect(text).not.toContain('check constraint')
  })

  it('42501: la sesión que ya no puede editar, sin nombrar la política', () => {
    const text = partyFailureText(
      { code: '42501', message: 'new row violates row-level security policy for table "parties"' },
      'save',
    )
    expect(text).toContain('solo el Catalogador')
    expect(text).toContain('Vuelve a entrar')
    expect(text).not.toContain('row-level security')
  })

  it('22P02: el enumerado que no se entendió', () => {
    const text = partyFailureText(
      { code: '22P02', message: 'invalid input value for enum party_type_value: "COMPANY"' },
      'create',
    )
    expect(text).toContain('persona o una institución')
    expect(text).not.toContain('party_type_value')
  })

  it('P0001 pasa tal cual, uniendo el mensaje y la pista de la base', () => {
    // Los tres cuerpos, copiados de la respuesta real de la pasarela REST.
    expect(
      partyFailureText(
        {
          code: 'P0001',
          message: 'No se puede retirar una parte que sostiene un eslabón de procedencia',
          hint: 'Quita antes esa parte de las cadenas de procedencia donde aparece.',
        },
        'retire',
      ),
    ).toBe(
      'No se puede retirar una parte que sostiene un eslabón de procedencia. Quita antes esa parte ' +
        'de las cadenas de procedencia donde aparece.',
    )
  })

  it('P0001 del titular de derechos, con su pista', () => {
    expect(
      partyFailureText(
        {
          code: 'P0001',
          message: 'No se puede retirar una parte que es titular de derechos de una obra',
          hint: 'Cambia antes el titular de derechos de esas obras.',
        },
        'retire',
      ),
    ).toContain('Cambia antes el titular de derechos de esas obras.')
  })

  it('P0001 de la sede, con su pista', () => {
    expect(
      partyFailureText(
        {
          code: 'P0001',
          message: 'No se puede retirar una parte que es la institución de una sede de exposición',
          hint: 'Retira antes esa sede, o quítale la institución.',
        },
        'retire',
      ),
    ).toContain('Retira antes esa sede, o quítale la institución.')
  })

  it('P0001 sin pista no deja un punto doble', () => {
    expect(partyFailureText({ code: 'P0001', message: 'No se puede.', hint: null }, 'retire')).toBe(
      'No se puede.',
    )
  })

  it('sin código es la caída de red, y dice que no se ha guardado nada', () => {
    const text = partyFailureText({ message: 'Failed to fetch' }, 'retire')
    expect(text).toContain('No se ha podido retirar la ficha')
    expect(text).toContain('no hay conexión')
    expect(text).toContain('no se ha guardado nada')
  })

  it('lo imprevisto conserva lo que dijo la base, y nombra la operación', () => {
    expect(partyFailureText({ code: '08006', message: 'connection failure' }, 'load')).toBe(
      'No se han podido cargar las personas e instituciones: connection failure',
    )
  })
})

describe('el resultado de una escritura', () => {
  it('sin fallo y con filas tocadas, no hay nada que decir', () => {
    expect(partyWriteResult('save', { failure: null, rows: 1 })).toBeNull()
  })

  it('CERO filas sin error NO es éxito: es lo que contesta la base al Lector', () => {
    // Medido: un PATCH que las políticas niegan vuelve 200 con [] y sin error.
    const text = partyWriteResult('save', { failure: null, rows: 0 })
    expect(text).toContain('No se ha guardado nada')
    expect(text).toContain('Vuelve a entrar')
  })

  it('no contar filas no es contar cero', () => {
    expect(partyWriteResult('create', { failure: null })).toBeNull()
  })

  it('el fallo manda sobre el recuento', () => {
    expect(partyWriteResult('retire', { failure: { code: '42501', message: 'x' }, rows: 0 })).toContain(
      'solo el Catalogador',
    )
  })
})

// ── Dónde se usa una ficha, que es lo que la base no dice ────

describe('la lista leída en español', () => {
  it('uno solo', () => {
    expect(spanishList(['RC-0012'])).toBe('RC-0012')
  })

  it('dos con «y»', () => {
    expect(spanishList(['RC-0012', 'RC-0013'])).toBe('RC-0012 y RC-0013')
  })

  it('tres con comas y una «y» al final', () => {
    expect(spanishList(['RC-0012', 'RC-0013', 'RC-0014'])).toBe('RC-0012, RC-0013 y RC-0014')
  })

  it('ninguno no deja una «y» suelta', () => {
    expect(spanishList([])).toBe('')
  })
})

describe('en qué se está usando una ficha (RF-901)', () => {
  it('vacío es vacío', () => {
    expect(partyUsageIsEmpty(emptyPartyUsage())).toBe(true)
    expect(describePartyUsage(emptyPartyUsage())).toBeNull()
  })

  it('una obra en singular, con el identificador impreso en la etiqueta', () => {
    expect(describePartyUsage({ ...emptyPartyUsage(), provenance: ['RC-0012'] })).toBe(
      'Sostiene la procedencia de la obra RC-0012.',
    )
  })

  it('varias obras en plural', () => {
    expect(
      describePartyUsage({ ...emptyPartyUsage(), provenance: ['RC-0012', 'RC-0013', 'RC-0014'] }),
    ).toBe('Sostiene la procedencia de las obras RC-0012, RC-0013 y RC-0014.')
  })

  it('el titular de derechos se cuenta aparte de la procedencia', () => {
    expect(describePartyUsage({ ...emptyPartyUsage(), rights: ['AR-0003'] })).toBe(
      'Es titular de derechos de la obra AR-0003.',
    )
  })

  it('la sede lleva su localidad entre paréntesis', () => {
    expect(
      describePartyUsage({
        ...emptyPartyUsage(),
        venues: [{ name: 'Casa de Cultura', locality: 'Zafra' }],
      }),
    ).toBe('Es la institución de la sede «Casa de Cultura» (Zafra).')
  })

  it('una sede sin localidad no deja un paréntesis vacío', () => {
    expect(
      describePartyUsage({ ...emptyPartyUsage(), venues: [{ name: 'Sala B', locality: '  ' }] }),
    ).toBe('Es la institución de la sede «Sala B».')
  })

  it('LOS TRES USOS A LA VEZ se cuentan los tres, y el trigger solo dice uno', () => {
    // tg_party_deactivation comprueba en orden y lanza en el PRIMERO que
    // encuentra: sin esto, «sostiene un eslabón de procedencia» esconde que
    // además es titular de derechos y está detrás de una sede.
    const text = describePartyUsage({
      provenance: ['RC-0012'],
      rights: ['AR-0003', 'AR-0004'],
      venues: [{ name: 'Casa de Cultura', locality: 'Zafra' }],
    })
    expect(text).toBe(
      'Sostiene la procedencia de la obra RC-0012. Es titular de derechos de las obras AR-0003 y ' +
        'AR-0004. Es la institución de la sede «Casa de Cultura» (Zafra).',
    )
  })
})

describe('la respuesta completa a un retiro que la base rechaza', () => {
  const refusal = {
    code: 'P0001',
    message: 'No se puede retirar una parte que sostiene un eslabón de procedencia',
    hint: 'Quita antes esa parte de las cadenas de procedencia donde aparece.',
  }

  it('dice lo que dijo la base Y en qué obras está', () => {
    const text = retireRefusalText(refusal, {
      ...emptyPartyUsage(),
      provenance: ['RC-0012', 'RC-0013'],
    })
    expect(text).toContain('No se puede retirar una parte que sostiene un eslabón de procedencia.')
    expect(text).toContain('Quita antes esa parte')
    expect(text).toContain('RC-0012 y RC-0013')
  })

  it('si no se pudo consultar el uso, lo dice y manda a mirar los tres sitios', () => {
    const text = retireRefusalText(refusal, null)
    expect(text).toContain('No se ha podido consultar dónde se usa')
    expect(text).toContain('titular de derechos')
    expect(text).toContain('sedes de exposición')
  })

  it('si la base rechaza y no se ve ningún uso, admite que la pantalla va desfasada', () => {
    const text = retireRefusalText(refusal, emptyPartyUsage())
    expect(text).toContain('desfasada')
    expect(text).toContain('Vuelve a cargarla')
  })

  it('un rechazo que NO es P0001 no se pone a buscar usos', () => {
    const text = retireRefusalText({ code: '42501', message: 'denied' }, null)
    expect(text).toContain('solo el Catalogador')
    expect(text).not.toContain('dónde se usa')
  })

  it('una caída de red al retirar tampoco habla de usos', () => {
    const text = retireRefusalText({ message: 'Failed to fetch' }, null)
    expect(text).toContain('no hay conexión')
    expect(text).not.toContain('dónde se usa')
  })
})

// ── El contacto en pantalla (RF-105) ────────────────────────

describe('el aviso del contacto (RF-105)', () => {
  it('dice de quién es el dato y quién más lo ve', () => {
    // Fuera, lo que pasa en esta pantalla; detrás del icono, la regla que cambia
    // lo que se escribe. Las dos mitades siguen dichas, y por eso se comprueban
    // las dos: el recorte de los textos no puede llevarse por delante RF-105.
    expect(CONTACT_NOTICE).toContain('datos personales de un tercero')
    expect(CONTACT_DETAIL).toContain('No se pintan en la lista')
    expect(CONTACT_DETAIL).toContain('acceso de consulta')
  })

  it('un contacto vacío se cuenta, no se deja en hueco (RF-304)', () => {
    expect(contactText('   ')).toBe('Sin datos de contacto registrados')
  })

  it('y uno escrito se muestra recortado', () => {
    expect(contactText('  655 000 000  ')).toBe('655 000 000')
  })

  it('cargado, el campo avisa de que se verá desde consulta', () => {
    expect(contactFieldNotice(true)).toContain('Lo verá cualquiera')
  })

  it('sin cargar, explica por qué está apagado y que al guardar no se pierde', () => {
    const text = contactFieldNotice(false)
    expect(text).toContain('no se pueden editar')
    expect(text).toContain('se quedan como estaban')
  })
})

// ── Nunca una página en blanco ───────────────────────────────

describe('lo que dice la lista sin filas (RF-304)', () => {
  it('con filas no dice nada', () => {
    expect(
      partyListNotice({ loading: false, error: null, total: 3, shown: 3, query: '' }),
    ).toBeNull()
  })

  it('mientras carga NO afirma que el registro esté vacío', () => {
    expect(partyListNotice({ loading: true, error: null, total: 0, shown: 0, query: '' })).toBe(
      'Cargando las personas e instituciones…',
    )
  })

  it('si la carga falló calla: el error ya tiene su párrafo arriba', () => {
    expect(
      partyListNotice({ loading: false, error: 'x', total: 0, shown: 0, query: '' }),
    ).toBeNull()
  })

  it('una búsqueda sin resultados no dice que no haya fichas', () => {
    const text = partyListNotice({
      loading: false,
      error: null,
      total: 12,
      shown: 0,
      query: ' Vargaz ',
    })
    expect(text).toContain('Ninguna ficha coincide con «Vargaz»')
    expect(text).toContain('nombre, localidad y país')
  })

  it('el registro vacío dice qué es y dónde se crea la primera', () => {
    const text = partyListNotice({ loading: false, error: null, total: 0, shown: 0, query: '' })
    expect(text).toContain('cadena de procedencia')
    expect(text).toContain('La primera se crea aquí arriba')
  })
})

describe('el recuento bajo el título', () => {
  it('sin fichas no cuenta nada: habla el estado vacío', () => {
    expect(summarizeParties([])).toBeNull()
  })

  it('una sola en singular', () => {
    expect(summarizeParties([row()])).toBe('1 ficha')
  })

  it('varias en plural', () => {
    expect(summarizeParties([row({ id: '1' }), row({ id: '2' })])).toBe('2 fichas')
  })

  it('cuenta las retiradas aparte, porque esta pantalla las muestra', () => {
    expect(
      summarizeParties([row({ id: '1' }), row({ id: '2', active: false })]),
    ).toBe('1 ficha y 1 retirada')
  })

  it('y varias retiradas en plural', () => {
    expect(
      summarizeParties([
        row({ id: '1' }),
        row({ id: '2', active: false }),
        row({ id: '3', active: false }),
      ]),
    ).toBe('1 ficha y 2 retiradas')
  })
})
