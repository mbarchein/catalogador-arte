import { describe, expect, it } from 'vitest'
import {
  TRASH_GROUPS,
  TRASH_KINDS,
  cell,
  embedded,
  embeddedRetired,
  groupSpec,
  joinParts,
  kindSpec,
  kindsOfGroup,
  type TrashKindSpec,
} from './trashKinds'

/**
 * Las veintiuna tablas con baja lógica, medidas en la base local:
 *
 *   select table_name from information_schema.columns
 *    where table_schema='public'
 *      and column_name in ('active','deactivated_at','deactivated_by')
 *    group by table_name having count(*) = 3;
 *
 * Escritas aquí a mano para que el registro no pueda «cubrirlo todo» por el simple
 * hecho de que nadie lo compare con la base.
 */
const TABLES_WITH_TRASH = [
  'archive_documents',
  'archive_series',
  'artwork_bibliography',
  'artwork_documents',
  'artwork_exhibitions',
  'artwork_relationship_types',
  'artwork_relationships',
  'artwork_types',
  'artworks',
  'bibliography',
  'document_types',
  'exhibition_documents',
  'exhibition_venues',
  'exhibitions',
  'external_links',
  'images',
  'parties',
  'physical_places',
  'provenance_events',
  'publication_types',
  'series',
]

describe('la papelera cubre todo lo que tiene baja lógica (RF-901)', () => {
  it('hay una clase por cada tabla que puede retirar filas', () => {
    // A table with `active` and no place in the wastebasket is a table whose withdrawals have
    // no way out: that was exactly the pending item this piece closes.
    expect([...TRASH_KINDS.map((kind) => kind.table)].sort()).toEqual(
      [...TABLES_WITH_TRASH].sort(),
    )
  })

  it('ninguna tabla aparece dos veces', () => {
    const tables = TRASH_KINDS.map((kind) => kind.table)
    expect(new Set(tables).size).toBe(tables.length)
  })

  it('ningún identificador de clase se repite', () => {
    const ids = TRASH_KINDS.map((kind) => kind.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('cada clase pertenece a un grupo que existe', () => {
    const groups = new Set(TRASH_GROUPS.map((group) => group.id))
    for (const kind of TRASH_KINDS) expect(groups.has(kind.group)).toBe(true)
  })

  it('ningún grupo se queda sin clases, que sería un título vacío para siempre', () => {
    for (const group of TRASH_GROUPS) expect(kindsOfGroup(group.id).length).toBeGreaterThan(0)
  })
})

describe('cada clase se sabe nombrar en español', () => {
  it('tiene singular, plural y participio con género', () => {
    for (const kind of TRASH_KINDS) {
      expect(kind.one.trim()).not.toBe('')
      expect(kind.many.trim()).not.toBe('')
      expect(['retirada', 'retirado']).toContain(kind.retired)
    }
  })

  it('el singular y el plural no son la misma palabra, salvo donde el español lo es', () => {
    // «serie» / «series» does change; the real exception is the one that does not change in the plural.
    // It is checked that nobody has filled the plural by copying the singular out of carelessness.
    const suspicious = TRASH_KINDS.filter((kind) => kind.one === kind.many).map((kind) => kind.id)
    expect(suspicious).toEqual([])
  })

  it('la clave y las columnas están puestas, o el update no sabría a quién tocar', () => {
    for (const kind of TRASH_KINDS) {
      expect(kind.key.trim()).not.toBe('')
      // The trace is what makes the wastebasket decidable: if these two columns are not
      // asked for, the line cannot say when or who.
      expect(kind.columns).toContain('deactivated_at')
      expect(kind.columns).toContain('deactivated_by')
      // The key has to come in the select or there would be nothing to recover the row with.
      expect(kind.columns).toContain(kind.key)
    }
  })

  it('las columnas de un incrustado que hace de padre traen su «active»', () => {
    // Without `active` in the embedded row, `restoreBlock` cannot know whether the parent is still
    // withdrawn, and the prior check would become an ornament that always passes.
    for (const kind of TRASH_KINDS) {
      for (const parent of kind.parents) {
        if (parent.via !== 'embed') continue
        expect(kind.columns).toContain(parent.key)
      }
    }
  })

  it('los padres de la misma tabla piden su columna de padre', () => {
    for (const kind of TRASH_KINDS) {
      for (const parent of kind.parents) {
        if (parent.via !== 'self') continue
        expect(kind.columns).toContain(parent.column)
      }
    }
  })
})

describe('ninguna línea de la papelera puede quedarse muda', () => {
  /**
   * Una fila con TODO vacío es lo peor que le puede llegar a una etiqueta, y llega:
   * medido en la base local, `artworks.title` de RC-0001 es la cadena vacía y sale en
   * el incrustado de sus fotografías retiradas.
   */
  it('la etiqueta dice algo aunque la fila venga vacía', () => {
    for (const kind of TRASH_KINDS) {
      expect(kind.label({}).trim()).not.toBe('')
    }
  })

  it('la etiqueta dice algo aunque los incrustados lleguen nulos', () => {
    for (const kind of TRASH_KINDS) {
      const row: Record<string, unknown> = {}
      for (const parent of kind.parents) {
        if (parent.via === 'embed') row[parent.key] = null
      }
      expect(kind.label(row).trim()).not.toBe('')
    }
  })

  it('el contexto nunca deja un separador suelto', () => {
    // « · » at the start or the end is the sign that an empty piece has slipped into
    // the join, and it is what is seen on screen.
    for (const kind of TRASH_KINDS) {
      const context = kind.context({})
      expect(context.startsWith(' · ')).toBe(false)
      expect(context.endsWith(' · ')).toBe(false)
      expect(context.includes(' ·  · ')).toBe(false)
    }
  })

  it('el nombre de un padre nunca queda vacío en la frase del bloqueo', () => {
    for (const kind of TRASH_KINDS) {
      for (const parent of kind.parents) {
        expect(parent.what.trim()).not.toBe('')
        expect(parent.name({}).trim()).not.toBe('')
      }
    }
  })
})

describe('las obras y las fotografías se reconocen por lo que está pegado al cuadro', () => {
  it('la obra se nombra por su identificador de catalogación y luego su título', () => {
    const spec = kindSpec('artworks')
    expect(spec.label({ catalog_id: 'AR-0012', title: 'Bodegón' })).toBe('AR-0012 · Bodegón')
  })

  it('una obra sin título no deja un hueco: lo dice entre corchetes', () => {
    // `displayTitle` already settled that an empty title reads «[Sin título]» and that the
    // brackets are the only thing separating it from an artwork the artist titled that way.
    const spec = kindSpec('artworks')
    expect(spec.label({ catalog_id: 'RC-0001', title: '' })).toBe('RC-0001 · [Sin título]')
  })

  it('la fotografía dice su tipo de toma en español y de qué obra es', () => {
    const spec = kindSpec('images')
    const row = {
      image_id: 'RC-0001_v2',
      catalog_id: 'RC-0001',
      shot_type: 'SIGNATURE_DETAIL',
      artworks: { title: 'Flores', active: true },
    }
    expect(spec.label(row)).toBe('RC-0001_v2 · Firma')
    expect(spec.context(row)).toContain('De RC-0001')
    expect(spec.context(row)).toContain('Flores')
  })

  it('un tipo de toma que la tabla no conoce no deja la línea sin decir nada', () => {
    const spec = kindSpec('images')
    expect(spec.label({ image_id: 'AR-0001_v1', shot_type: 'INVENTADO' })).toContain(
      'Toma sin clasificar',
    )
  })
})

describe('un eslabón de procedencia se nombra por su parte o por su nota', () => {
  const spec = kindSpec('provenance_events')

  it('con parte, la parte', () => {
    expect(spec.label({ parties: { name: 'Galería Juana Mordó', active: true } })).toBe(
      'Galería Juana Mordó',
    )
  })

  it('sin parte, la nota, que la base garantiza que no está vacía', () => {
    // `provenance_events_link_has_an_end` requires a party OR a note, so this is the other
    // legitimate case and not a corrupt row.
    expect(spec.label({ parties: null, party_note: 'Colección particular, Madrid' })).toBe(
      'Colección particular, Madrid',
    )
  })
})

describe('los enlaces externos dicen de quién cuelgan, obra o fotografía', () => {
  const spec = kindSpec('external_links')

  it('el título manda sobre la dirección, y la dirección va al contexto', () => {
    const row = { title: 'Ficha en el MACVA', url: 'https://www.macvac.es/obra/x/', artwork_id: 'RC-0005' }
    expect(spec.label(row)).toBe('Ficha en el MACVA')
    expect(spec.context(row)).toContain('https://www.macvac.es/obra/x/')
  })

  it('sin título se muestra la dirección, que es lo único que hay', () => {
    expect(spec.label({ title: '', url: 'https://example.org/x' })).toBe('https://example.org/x')
  })

  it('el que cuelga de una fotografía la nombra a ella y no a una obra', () => {
    expect(spec.context({ image_id: 'RC-0001_v2', artwork_id: null, url: 'https://e.org' })).toContain(
      'la fotografía RC-0001_v2',
    )
  })
})

describe('las nueve maestras enlazan a su propia pantalla, y las demás no', () => {
  it('las maestras tienen pantalla propia', () => {
    const lists = kindsOfGroup('lists')
    expect(lists.length).toBe(9)
    for (const kind of lists) expect(kind.ownScreen).toBeDefined()
  })

  it('lo que solo se recupera aquí NO finge tener otra puerta', () => {
    // Las clases cuyo único camino de vuelta sigue siendo la papelera: una obra, una
    // fotografía, una referencia o un documento retirados no tienen ninguna otra
    // pantalla que los muestre. Las exposiciones SALIERON de esta lista el 5 de
    // agosto de 2026, cuando se construyó su ficha: dejar el aserto habría fijado
    // como verdad que no la tienen.
    for (const id of ['artworks', 'images', 'bibliography', 'archive_documents'] as const) {
      expect(kindSpec(id).ownScreen).toBeUndefined()
    }
  })

  it('una exposición retirada enlaza a su ficha, que existe desde el 5 de agosto', () => {
    expect(kindSpec('exhibitions').ownScreen).toBe('/exhibitions')
  })

  it('solo los enlaces externos explican el choque de duplicado a su manera', () => {
    // Medido: los índices únicos de las maestras no son parciales sobre `active`, así
    // que el nombre de algo retirado sigue reservado y recuperarlo no puede chocar.
    // Donde el hueco sí se libera es en `external_links`, cuyos índices son
    // `where ... and active`.
    const withOwnText = TRASH_KINDS.filter((kind) => kind.duplicateText !== undefined)
    expect(withOwnText.map((kind) => kind.id)).toEqual(['external_links'])
  })
})

describe('buscar una clase o un grupo por su identificador', () => {
  it('devuelve la especificación', () => {
    expect(kindSpec('images').table).toBe('images')
    expect(groupSpec('catalog').title).toBe('Obras y fotografías')
  })

  it('un identificador inventado avisa en vez de devolver algo a medias', () => {
    // Unreachable by the type, but an `undefined` travelling towards the screen would
    // turn into a blank line a long way from here.
    expect(() => kindSpec('inventado' as TrashKindSpec['id'])).toThrow(/desconocida/)
    expect(() => groupSpec('inventado' as never)).toThrow(/desconocido/)
  })
})

describe('los lectores de una fila cruda', () => {
  it('cell recorta, convierte números y nunca devuelve undefined', () => {
    expect(cell({ name: '  Cartel  ' }, 'name')).toBe('Cartel')
    expect(cell({ year: 1985 }, 'year')).toBe('1985')
    expect(cell({}, 'name')).toBe('')
    expect(cell({ name: null }, 'name')).toBe('')
  })

  it('embedded acepta el objeto y también la lista de uno', () => {
    expect(embedded({ artworks: { title: 'X' } }, 'artworks')).toEqual({ title: 'X' })
    expect(embedded({ artworks: [{ title: 'X' }] }, 'artworks')).toEqual({ title: 'X' })
    expect(embedded({ artworks: null }, 'artworks')).toBeNull()
    expect(embedded({ artworks: [] }, 'artworks')).toBeNull()
  })

  it('«no hay padre» y «el padre está retirado» no se confunden', () => {
    // The distinction decides whether recovery is blocked. A document with no archive
    // series arrives with the embedded row null, and that is NOT a withdrawn parent.
    expect(embeddedRetired({ artworks: { active: false } }, 'artworks')).toBe(true)
    expect(embeddedRetired({ artworks: { active: true } }, 'artworks')).toBe(false)
    expect(embeddedRetired({ artworks: null }, 'artworks')).toBeNull()
    expect(embeddedRetired({}, 'artworks')).toBeNull()
    expect(embeddedRetired({ artworks: {} }, 'artworks')).toBeNull()
  })

  it('joinParts descarta los vacíos en vez de dejar separadores sueltos', () => {
    expect(joinParts(['Cartel', '', '1985'])).toBe('Cartel · 1985')
    expect(joinParts(['', ''])).toBe('')
    expect(joinParts(['Solo'])).toBe('Solo')
  })
})
