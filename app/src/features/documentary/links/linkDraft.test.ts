import { describe, expect, it } from 'vitest'
import {
  CHECK_CLEAR_TEXT,
  CHECK_OPTIONS,
  NOTHING_CHANGED,
  REFUSAL_GENERAL,
  describeArchiveRefusal,
  describeLinkFailure,
  describeUrlRefusal,
  draftFrom,
  duplicateMessage,
  duplicateOf,
  emptyDraft,
  insertPayload,
  missingUrl,
  retireConfirmText,
  retiredTwin,
  trimDraft,
  updatePayload,
  type LinkDraft,
} from './linkDraft'
import type { ExternalLinkRow } from './externalLinks'

/**
 * RF-1403 and RF-1406: **the address's rule lives in the base and the client
 * calls it**; what is tested here is the other half, that of saying in Spanish why
 * the base has said no.
 *
 * The two addresses that hold up this block's security are measured
 * against the local base, and both are cases a new hand-written pattern
 * would have let through:
 *
 *   select is_web_url('https://evil.example\.ejemplo.es/')  → false
 *   select is_web_url('https://macvac\u200b.es/')            → false   (U+200B)
 *
 * That is why `describeUrlRefusal` **decides nothing**: it has no branch that
 * returns «fine». It is called only when the base has already rejected, and if no
 * hint fits it returns the general sentence. That contract is the first thing
 * checked here.
 */

// ── Fixtures ─────────────────────────────────────────────────

function draft(over: Partial<LinkDraft> = {}): LinkDraft {
  return {
    anchor: { kind: 'ARTWORK', id: 'RC-0005' },
    url: 'https://www.macvac.es/obra/saliente-en-el-espacio/',
    title: 'Ficha en el MACVA',
    linkType: 'MUSEUM_PAGE',
    note: 'De aquí salen los datos de la ficha.',
    archiveUrl: '',
    ...over,
  }
}

function link(over: Partial<ExternalLinkRow> = {}): ExternalLinkRow {
  return {
    id: 'link-1',
    artwork_id: 'RC-0005',
    image_id: null,
    url: 'https://www.macvac.es/obra/saliente-en-el-espacio/',
    title: 'Ficha en el MACVA',
    link_type: 'MUSEUM_PAGE',
    note: '',
    archive_url: null,
    check_status: null,
    checked_at: null,
    checked_by: null,
    active: true,
    created_at: '2026-08-05T10:00:00Z',
    ...over,
  }
}

// ── The draft and what travels ───────────────────────────────

describe('trimDraft · lo que se valida es lo que se guarda', () => {
  it('recorta los extremos de la dirección, el título y la nota', () => {
    const clean = trimDraft(
      draft({ url: '  https://www.macvac.es/x \n', title: ' Ficha ', note: ' nota ' }),
    )
    expect(clean.url).toBe('https://www.macvac.es/x')
    expect(clean.title).toBe('Ficha')
    expect(clean.note).toBe('nota')
  })

  it('recortar NO cuela nada: un esquema prohibido sigue siendo prohibido', () => {
    // « javascript:alert(1)» with a leading space is executed by the browser, which
    // trims. Here it is trimmed BEFORE asking, so what the base sees —and
    // rejects by its scheme whitelist— is exactly what would be sent.
    const clean = trimDraft(draft({ url: ' javascript:alert(1) ' }))
    expect(clean.url).toBe('javascript:alert(1)')
    expect(describeUrlRefusal(clean.url)).toContain('no es una dirección de un sitio web')
  })

  it('no toca el interior del texto', () => {
    expect(trimDraft(draft({ title: 'Ficha  en  el  MACVA' })).title).toBe('Ficha  en  el  MACVA')
  })
})

describe('insertPayload · el arco exclusivo y las columnas que no se mandan', () => {
  it('anclado a la obra, la fotografía va a nulo', () => {
    expect(insertPayload(draft())).toEqual({
      artwork_id: 'RC-0005',
      image_id: null,
      url: 'https://www.macvac.es/obra/saliente-en-el-espacio/',
      title: 'Ficha en el MACVA',
      link_type: 'MUSEUM_PAGE',
      note: 'De aquí salen los datos de la ficha.',
      archive_url: null,
    })
  })

  it('anclado a una fotografía, la obra va a nulo (RF-1407)', () => {
    const payload = insertPayload(draft({ anchor: { kind: 'IMAGE', id: 'RC-0005_v1' } }))
    expect(payload.image_id).toBe('RC-0005_v1')
    expect(payload.artwork_id).toBeNull()
  })

  it('«sin clasificar» viaja como nulo y no como OTHER (RF-1402)', () => {
    expect(insertPayload(draft({ linkType: '' })).link_type).toBeNull()
    expect(insertPayload(draft({ linkType: 'OTHER' })).link_type).toBe('OTHER')
  })

  it('NO manda las tres columnas de comprobación: las congela la base (RF-1405)', () => {
    const payload = insertPayload(draft())
    expect(payload).not.toHaveProperty('check_status')
    expect(payload).not.toHaveProperty('checked_at')
    expect(payload).not.toHaveProperty('checked_by')
  })

  it('una copia archivada vacía viaja como nulo, no como cadena vacía', () => {
    // The column admits null and the `check` requires that, if there is anything, it be
    // an address: sending '' would make it fail for nothing.
    expect(insertPayload(draft({ archiveUrl: '' })).archive_url).toBeNull()
    expect(insertPayload(draft({ archiveUrl: ' https://web.archive.org/x ' })).archive_url).toBe(
      'https://web.archive.org/x',
    )
  })
})

describe('updatePayload · el ancla no se mueve al corregir', () => {
  it('no lleva ninguna de las dos claves del arco', () => {
    const payload = updatePayload(draft())
    expect(payload).not.toHaveProperty('artwork_id')
    expect(payload).not.toHaveProperty('image_id')
    expect(payload.url).toBe('https://www.macvac.es/obra/saliente-en-el-espacio/')
  })
})

describe('draftFrom y emptyDraft', () => {
  it('un enlace de obra vuelve a su borrador tal cual', () => {
    expect(draftFrom(link())).toEqual(draft({ note: '', archiveUrl: '' }))
  })

  it('un enlace de fotografía recuerda de qué toma cuelga', () => {
    const row = link({ artwork_id: null, image_id: 'RC-0005_v1', link_type: null })
    expect(draftFrom(row).anchor).toEqual({ kind: 'IMAGE', id: 'RC-0005_v1' })
    expect(draftFrom(row).linkType).toBe('')
  })

  it('un borrador nuevo nace vacío y sin clasificar', () => {
    const nuevo = emptyDraft({ kind: 'ARTWORK', id: 'RC-0005' })
    expect(nuevo.url).toBe('')
    expect(nuevo.linkType).toBe('')
    expect(missingUrl(nuevo)).toBe(true)
  })

  it('una dirección de solo espacios sigue siendo ninguna dirección', () => {
    expect(missingUrl(draft({ url: '   ' }))).toBe(true)
    expect(missingUrl(draft())).toBe(false)
  })
})

// ── The same address again (RF-1406) ────────────────────────

describe('duplicateOf · la misma dirección no se repite activa en la misma ficha', () => {
  it('encuentra el choque en la misma obra', () => {
    expect(duplicateOf(draft(), [link()])?.id).toBe('link-1')
  })

  it('la misma dirección en OTRA ficha no es un choque: son dos enlaces', () => {
    expect(duplicateOf(draft({ anchor: { kind: 'ARTWORK', id: 'AR-0001' } }), [link()])).toBeNull()
  })

  it('la misma dirección en la obra y en su fotografía no choca: son dos hechos', () => {
    // «this record is documented here» and «this image was downloaded from here». The
    // base's unique indexes are (artwork, url) and (photo, url) separately.
    const enLaFoto = draft({ anchor: { kind: 'IMAGE', id: 'RC-0005_v1' } })
    expect(duplicateOf(enLaFoto, [link()])).toBeNull()
  })

  it('un enlace retirado no ocupa el sitio', () => {
    expect(duplicateOf(draft(), [link({ active: false })])).toBeNull()
  })

  it('corregir un enlace no choca consigo mismo', () => {
    expect(duplicateOf(draft(), [link()], 'link-1')).toBeNull()
  })

  it('sin dirección no hay choque que predecir', () => {
    expect(duplicateOf(draft({ url: '' }), [link()])).toBeNull()
  })
})

describe('retiredTwin · volver a añadir lo retirado lo devuelve', () => {
  it('encuentra la fila retirada con la misma dirección', () => {
    expect(retiredTwin(draft(), [link({ active: false })])?.id).toBe('link-1')
  })

  it('no confunde una activa con una retirada', () => {
    expect(retiredTwin(draft(), [link()])).toBeNull()
  })
})

describe('duplicateMessage · el mismo choque se cuenta igual desde los dos lados', () => {
  it('con la fila conocida nombra el enlace y manda a corregirlo', () => {
    const message = duplicateMessage(link())
    expect(message).toContain('ya está en esta ficha')
    expect(message).toContain('Ficha en el MACVA')
  })

  it('en la carrera, sin fila conocida, manda a volver a mirar la lista', () => {
    expect(duplicateMessage(null)).toContain('mientras tenías esto abierto')
  })

  it('la respuesta 23505 de la base usa la misma frase', () => {
    expect(
      describeLinkFailure('add', {
        code: '23505',
        message: 'duplicate key value violates unique constraint "external_links_artwork_url_unique"',
      }),
    ).toBe(duplicateMessage(null))
  })
})

// ── Why the base has said no ────────────────────────────────

describe('describeUrlRefusal · no decide, explica (RF-1403)', () => {
  it('el esquema prohibido se nombra y se dice que la lista es de lo permitido', () => {
    for (const bad of ['javascript:alert(1)', 'data:text/html,<b>x', 'file:///etc/passwd', 'mailto:a@b.es']) {
      const message = describeUrlRefusal(bad)
      expect(message).toContain('no es una dirección de un sitio web')
      expect(message).toContain('lista de lo permitido')
    }
  })

  it('la forma relativa al protocolo dice qué falta', () => {
    expect(describeUrlRefusal('//evil.example')).toContain('Falta el principio')
  })

  it('sin esquema, manda pegar lo que copia el navegador', () => {
    expect(describeUrlRefusal('www.macvac.es/obra')).toContain('tiene que empezar por http://')
  })

  it('LA BARRA INVERTIDA se explica por lo que hace el navegador, no por la sintaxis', () => {
    const message = describeUrlRefusal('https://evil.example\\.ejemplo.es/')
    expect(message).toContain('barra invertida')
    expect(message).toContain('el sitio real es lo que hay antes')
  })

  it('LOS CARACTERES INVISIBLES se nombran como invisibles, no como «no ASCII»', () => {
    const message = describeUrlRefusal('https://macvac\u200b.es/')
    expect(message).toContain('invisibles')
    expect(message).not.toContain('ASCII')
  })

  it('las credenciales antes del anfitrión se explican con un ejemplo', () => {
    const message = describeUrlRefusal('https://www.macvac.es@otro.example/obra')
    expect(message).toContain('@')
    expect(message).toContain('otro.example')
  })

  it('un dominio en Unicode manda a la forma punycode, que es la que copia el navegador', () => {
    const message = describeUrlRefusal('https://münchen.example/obra')
    expect(message).toContain('xn--mnchen-3ya.example')
  })

  it('un espacio en medio se dice como un espacio', () => {
    expect(describeUrlRefusal('https://www.macvac.es/obra x')).toContain('espacio')
  })

  it('un carácter de control se nombra como tal', () => {
    // `java<tab>script:` and `java<nl>script:` have been run by real browsers;
    // written with their code, because in the source it would not be visible.
    expect(describeUrlRefusal('https://www.macvac.es/o\u0001bra')).toContain('control')
  })

  it('una IP se rechaza por lo que es: no una fuente citable', () => {
    expect(describeUrlRefusal('https://192.168.1.7/obra')).toContain('no es una fuente')
    expect(describeUrlRefusal('https://[::1]/obra')).toContain('no es una fuente')
  })

  it('un nombre sin dominio lo dice, y localhost cae aquí', () => {
    expect(describeUrlRefusal('http://localhost:5173/obra')).toContain('le falta el dominio')
  })

  it('los puntos de más o de menos se señalan', () => {
    expect(describeUrlRefusal('https://.ejemplo.es')).toContain('punto de más o de menos')
    expect(describeUrlRefusal('https://ejemplo..es')).toContain('punto de más o de menos')
    expect(describeUrlRefusal('https://ejemplo.es.')).toContain('punto de más o de menos')
  })

  it('el guion bajo se explica como la errata que suele ser', () => {
    expect(describeUrlRefusal('https://ejemplo_a.es')).toContain('guion bajo')
  })

  it('un pegado accidental enorme se cuenta con su tamaño', () => {
    const largo = `https://www.macvac.es/${'x'.repeat(2100)}`
    expect(describeUrlRefusal(largo)).toContain('2048')
  })

  it('el campo vacío pide la dirección en vez de dar una lección', () => {
    expect(describeUrlRefusal('   ')).toContain('Pega la dirección')
  })

  it('lo que no se ha previsto se explica igual, con la frase general', () => {
    // Rejected by the base —the top-level domain has a single letter— and
    // with no hint of its own: the general sentence says what is accepted.
    expect(describeUrlRefusal('https://ejemplo.e')).toBe(REFUSAL_GENERAL)
    expect(REFUSAL_GENERAL).toContain('http:// o https://')
  })

  it('NUNCA devuelve nada que se pueda leer como una aceptación', () => {
    // The module's contract: this function is called over what has already been rejected, so
    // it cannot have a branch that says it is fine. Not even with a
    // perfectly valid address —which never gets here— does it say it is valid.
    const message = describeUrlRefusal('https://www.macvac.es/obra/')
    expect(message).toBe(REFUSAL_GENERAL)
    expect(message).toContain('no acepta')
  })

  it('la copia archivada se explica con la misma regla, dicha para su campo', () => {
    expect(describeArchiveRefusal('ftp://archivo.example/x')).toContain('copia archivada')
  })
})

// ── The base's answers, translated ──────────────────────────

describe('describeLinkFailure · códigos medidos contra la base local', () => {
  it('el check de la dirección explica ESTA dirección cuando se le pasa', () => {
    const failure = {
      code: '23514',
      message: 'new row for relation "external_links" violates check constraint "external_links_url_is_web"',
    }
    expect(describeLinkFailure('add', failure, 'javascript:alert(1)')).toContain(
      'no es una dirección de un sitio web',
    )
    // Without the address —PostgreSQL does not return it— the general sentence remains,
    // which is still actionable.
    expect(describeLinkFailure('add', failure)).toBe(REFUSAL_GENERAL)
  })

  it('el arco exclusivo se cuenta como lo que es: cuelga de una sola cosa', () => {
    const message = describeLinkFailure('add', {
      code: '23514',
      message:
        'new row for relation "external_links" violates check constraint "external_links_exactly_one_owner"',
    })
    expect(message).toContain('una sola cosa')
  })

  it('el título sin recortar se cuenta, aunque no debería llegar', () => {
    expect(
      describeLinkFailure('add', {
        code: '23514',
        message:
          'new row for relation "external_links" violates check constraint "external_links_title_trimmed"',
      }),
    ).toContain('espacios')
  })

  it('la clave ajena distingue la fotografía de la obra', () => {
    expect(
      describeLinkFailure('add', {
        code: '23503',
        message:
          'insert or update on table "external_links" violates foreign key constraint "external_links_image_id_fkey"',
        details: 'Key is not present in table "images".',
      }),
    ).toContain('la fotografía')
    expect(
      describeLinkFailure('add', {
        code: '23503',
        message:
          'insert or update on table "external_links" violates foreign key constraint "external_links_artwork_id_fkey"',
      }),
    ).toContain('la obra')
  })

  it('la RLS se cuenta como una sesión sin permiso y no como un fallo', () => {
    const message = describeLinkFailure('add', {
      code: '42501',
      message: 'new row violates row-level security policy for table "external_links"',
    })
    expect(message).toContain('permiso')
    expect(message).toContain('vuelve a entrar')
  })

  it('las excepciones de la base ya están en español y se muestran tal cual', () => {
    expect(
      describeLinkFailure('check', {
        code: 'P0001',
        message: 'No tienes permiso para comprobar enlaces',
      }),
    ).toBe('No tienes permiso para comprobar enlaces.')
    expect(
      describeLinkFailure('check', {
        code: 'P0001',
        message: 'No existe el enlace que se intenta comprobar',
      }),
    ).toBe('No existe el enlace que se intenta comprobar.')
  })

  it('una excepción con pista pega las dos frases', () => {
    expect(
      describeLinkFailure('retire', {
        code: 'P0001',
        message: 'No se puede retirar esto.',
        hint: 'Haz antes lo otro.',
      }),
    ).toBe('No se puede retirar esto. Haz antes lo otro.')
  })

  it('sin código no es una regla diciendo que no: es que no hay conexión', () => {
    const message = describeLinkFailure('add', { code: '', message: 'Failed to fetch' })
    expect(message).toContain('no hay conexión')
    expect(message).toContain('No se ha podido añadir el enlace')
  })

  it('un valor que la base no entiende se cuenta con lo que dijo', () => {
    expect(
      describeLinkFailure('check', {
        code: '22P02',
        message: 'invalid input value for enum link_check_status: "NOPE"',
      }),
    ).toContain('link_check_status')
  })

  it('lo imprevisto se enmarca pero se cita literalmente', () => {
    const message = describeLinkFailure('save', { code: '40001', message: 'could not serialize' })
    expect(message).toContain('No se han podido guardar los cambios del enlace')
    expect(message).toContain('could not serialize')
  })

  it('cada acción se nombra por lo que se estaba intentando', () => {
    const sinRed = { code: '', message: '' }
    expect(describeLinkFailure('load', sinRed)).toContain('cargar los enlaces')
    expect(describeLinkFailure('retire', sinRed)).toContain('retirar el enlace')
    expect(describeLinkFailure('restore', sinRed)).toContain('recuperar el enlace')
    expect(describeLinkFailure('check', sinRed)).toContain('anotar la comprobación')
  })
})

describe('NOTHING_CHANGED · una escritura que no falla y no cambia nada', () => {
  it('no dice que se haya guardado, porque no se ha guardado', () => {
    // Measured: with a Reader's session, the PATCH answers 200 [] and not an error.
    expect(NOTHING_CHANGED).toContain('no ha cambiado nada')
    expect(NOTHING_CHANGED).toContain('permiso')
  })
})

// ── The texts of the two confirmations ──────────────────────

describe('retireConfirmText · retirar no es borrar (RF-901, RF-1406)', () => {
  it('dice qué pasa y qué no, y a dónde apuntaba', () => {
    const message = retireConfirmText(link())
    expect(message).toContain('Ficha en el MACVA')
    expect(message).toContain('macvac.es')
    expect(message).toContain('No se borra')
    expect(message).toContain('volver a añadir la misma dirección lo devuelve')
  })

  it('con un dominio que no se reconoce no se inventa uno', () => {
    const message = retireConfirmText(link({ url: 'https://a.es@otro.example/x', title: 'Algo' }))
    expect(message).toContain('esa dirección')
  })
})

describe('CHECK_OPTIONS · tres resultados y una cuarta salida (RF-1405)', () => {
  it('ofrece los tres, en el orden en que se leen', () => {
    expect(CHECK_OPTIONS.map((o) => o.value)).toEqual(['WORKING', 'CHANGED', 'BROKEN'])
    expect(CHECK_OPTIONS.map((o) => o.text)).toEqual(['Funciona', 'Ha cambiado', 'Ya no está'])
  })

  it('cada uno explica qué se ha visto, que es lo que se está contestando', () => {
    const changed = CHECK_OPTIONS.find((o) => o.value === 'CHANGED')
    expect(changed?.hint).toContain('ya no muestra')
  })

  it('«sin comprobar» NO es una de las tres respuestas: es volver atrás', () => {
    expect(CHECK_OPTIONS.map((o) => o.text)).not.toContain('Sin comprobar')
    expect(CHECK_CLEAR_TEXT).toContain('sin comprobar')
  })
})
