import { describe, expect, it } from 'vitest'
import {
  NAMELESS_LABEL,
  RETIRED_NOTICE,
  UNREADABLE_NOTICE,
  UNREADABLE_TITLE,
  artworkByline,
  predicate,
  recordLink,
  relatedGroups,
  relatedRow,
  relatedRows,
  relatedSentence,
} from './relatedArtworks'
import type { ArtworkRef, RelationshipRow, RelationshipView } from '../documentaryRows'

/**
 * RF-217 y RF-305: una relación tiene DOS EXTREMOS y una dirección, se guarda una
 * sola vez, y la ficha tiene que enseñar la que corresponde mirada desde la obra
 * que se está viendo.
 *
 * Lo que se verifica aquí es justo eso —qué frase se lee desde cada lado— y lo
 * que pasa cuando la obra del otro extremo no se puede leer. Equivocar la
 * dirección publicaría el estudio previo como la obra final, y no hay nada aguas
 * abajo que lo detecte: las dos filas son igual de válidas.
 */

// ── Fixtures ─────────────────────────────────────────────────

function artwork(over: Partial<ArtworkRef> = {}): ArtworkRef {
  return {
    catalog_id: 'AR-0013',
    title: 'Retrato de mujer',
    artist: 'ROTILI',
    execution_date: '1978',
    active: true,
    ...over,
  }
}

/** «Estudio previo de» / «Obra final de», the catalogue's asymmetric pair. */
const STUDY = {
  id: 'type-study',
  name: 'Estudio previo de',
  inverse_name: 'Obra final de',
  is_symmetric: false,
  active: true,
}

/** «Pareja de», symmetric and with no inverse. */
const PAIR = {
  id: 'type-pair',
  name: 'Pareja de',
  inverse_name: '',
  is_symmetric: true,
  active: true,
}

function relationship(over: Partial<RelationshipRow> = {}): RelationshipRow {
  return {
    id: 'rel-1',
    from_catalog_id: 'AR-0012',
    to_catalog_id: 'AR-0013',
    relationship_type_id: STUDY.id,
    note: '',
    active: true,
    relationship_type: STUDY,
    from_artwork: artwork({ catalog_id: 'AR-0012', title: 'Apunte de cabeza' }),
    to_artwork: artwork({ catalog_id: 'AR-0013' }),
    ...over,
  }
}

function view(over: Partial<RelationshipView> = {}): RelationshipView {
  return {
    id: 'rel-1',
    otherCatalogId: 'AR-0013',
    other: artwork(),
    label: 'Estudio previo de',
    reversed: false,
    note: '',
    ...over,
  }
}

// ── The direction, which is what cannot be got wrong ─────────

describe('RF-217: una fila, dos lecturas', () => {
  it('desde el extremo cercano se lee el nombre directo', () => {
    const [row] = relatedRows([relationship()], 'AR-0012')
    expect(row?.label).toBe('Estudio previo de')
    expect(row?.catalogId).toBe('AR-0013')
    expect(row?.reversed).toBe(false)
  })

  it('desde el extremo lejano se lee la inversa, sin haber guardado una segunda fila', () => {
    const [row] = relatedRows([relationship()], 'AR-0013')
    expect(row?.label).toBe('Obra final de')
    expect(row?.catalogId).toBe('AR-0012')
    expect(row?.reversed).toBe(true)
  })

  it('una relación simétrica se lee igual desde los dos lados', () => {
    const pair = relationship({
      id: 'rel-pair',
      relationship_type_id: PAIR.id,
      relationship_type: PAIR,
    })
    expect(relatedRows([pair], 'AR-0012')[0]?.label).toBe('Pareja de')
    expect(relatedRows([pair], 'AR-0013')[0]?.label).toBe('Pareja de')
    // And neither of the two readings is «backwards»: there is no back to read.
    expect(relatedRows([pair], 'AR-0013')[0]?.reversed).toBe(false)
  })

  it('cada lectura apunta a la OTRA obra y nunca a la que se está viendo', () => {
    for (const catalogId of ['AR-0012', 'AR-0013']) {
      expect(relatedRows([relationship()], catalogId)[0]?.catalogId).not.toBe(catalogId)
    }
  })
})

// ── What is read of the artwork at the other end ─────────────

describe('la obra relacionada en pantalla (RF-304, RF-305)', () => {
  it('lleva título, autor y fecha, y enlaza a su ficha', () => {
    const row = relatedRow(view())
    expect(row.title).toBe('Retrato de mujer')
    expect(row.byline).toBe('Alberto Rotili · 1978')
    expect(row.linked).toBe(true)
    expect(row.notice).toBeNull()
  })

  it('una obra sin título se anuncia como tal y no como una línea en blanco (RF-209)', () => {
    expect(relatedRow(view({ other: artwork({ title: '  ' }) })).title).toBe('[Sin título]')
  })

  it('una obra sin fecha tampoco deja un hueco', () => {
    expect(artworkByline(artwork({ execution_date: '' }))).toBe('Alberto Rotili · Sin fecha')
  })

  it('si la ficha del otro extremo no se puede leer, se dice y NO se enlaza', () => {
    const row = relatedRow(view({ other: null }))
    expect(row.title).toBe(UNREADABLE_TITLE)
    expect(row.byline).toBeNull()
    expect(row.linked).toBe(false)
    expect(row.notice).toBe(UNREADABLE_NOTICE)
    // The code is still there: the relationship is recorded, and with whom.
    expect(row.catalogId).toBe('AR-0013')
  })

  it('una obra dada de baja se enlaza igual, avisando: quien la ve puede abrirla', () => {
    const row = relatedRow(view({ other: artwork({ active: false }) }))
    expect(row.linked).toBe(true)
    expect(row.notice).toBe(RETIRED_NOTICE)
  })

  it('un tipo que el lector no puede ver deja la frase, no un hueco donde va el verbo', () => {
    const [row] = relatedRows([relationship({ relationship_type: null })], 'AR-0012')
    expect(row?.label).toBe('Tipo de relación no disponible')
  })

  it('una etiqueta vacía —que la base impide— tampoco deja la fila sin verbo', () => {
    expect(relatedRow(view({ label: '   ' })).label).toBe(NAMELESS_LABEL)
  })

  it('la frase completa nombra el verbo, el código y el título, para quien escucha', () => {
    expect(relatedSentence(relatedRow(view()))).toBe(
      'Estudio previo de AR-0013, Retrato de mujer',
    )
  })
})

// ── The order and the grouping ───────────────────────────────

describe('cómo se apilan las obras relacionadas', () => {
  const rows = [
    relationship({ id: 'r1', from_catalog_id: 'AR-0001', to_catalog_id: 'AR-0009' }),
    relationship({
      id: 'r2',
      from_catalog_id: 'AR-0001',
      to_catalog_id: 'AR-0003',
      relationship_type_id: PAIR.id,
      relationship_type: PAIR,
      to_artwork: artwork({ catalog_id: 'AR-0003' }),
    }),
    relationship({
      id: 'r3',
      from_catalog_id: 'AR-0001',
      to_catalog_id: 'AR-0002',
      to_artwork: artwork({ catalog_id: 'AR-0002' }),
    }),
  ]

  it('se agrupan por tipo, y dentro del tipo por código de la otra obra', () => {
    const groups = relatedGroups(relatedRows(rows, 'AR-0001'))
    expect(groups.map((group) => group.label)).toEqual(['Estudio previo de', 'Pareja de'])
    expect(groups[0]?.rows.map((row) => row.catalogId)).toEqual(['AR-0002', 'AR-0009'])
    expect(groups[1]?.rows.map((row) => row.catalogId)).toEqual(['AR-0003'])
  })

  it('cada obra relacionada aparece una sola vez por relación, y ninguna se pierde', () => {
    const related = relatedRows(rows, 'AR-0001')
    expect(related).toHaveLength(rows.length)
    expect(new Set(related.map((row) => row.id)).size).toBe(rows.length)
  })

  it('la misma pareja con dos tipos distintos son dos filas: el anverso puede ser políptico', () => {
    const both = [
      relationship({ id: 'a', from_catalog_id: 'AR-0001', to_catalog_id: 'AR-0002' }),
      relationship({
        id: 'b',
        from_catalog_id: 'AR-0001',
        to_catalog_id: 'AR-0002',
        relationship_type_id: PAIR.id,
        relationship_type: PAIR,
      }),
    ]
    const groups = relatedGroups(relatedRows(both, 'AR-0001'))
    expect(groups).toHaveLength(2)
  })

  it('sin relaciones no hay ningún grupo, y el bloque lo explica por su cuenta', () => {
    expect(relatedGroups([])).toEqual([])
  })
})

// ── The verb inside a sentence ───────────────────────────────

describe('el nombre del tipo puesto en medio de una frase', () => {
  it('baja la inicial para que «AR-0001 es estudio previo de AR-0002» sea español', () => {
    expect(predicate('Estudio previo de')).toBe('estudio previo de')
    expect(predicate('Parte del mismo políptico que')).toBe('parte del mismo políptico que')
  })

  it('respeta una sigla: el vocabulario es abierto y alguien escribirá una', () => {
    expect(predicate('MNCARS lo cataloga como')).toBe('MNCARS lo cataloga como')
  })

  it('no se atraganta con el espacio de más ni con un nombre de una palabra', () => {
    expect(predicate('  Copia de  ')).toBe('copia de')
    expect(predicate('Versión')).toBe('versión')
  })
})

// ── The link ─────────────────────────────────────────────────

describe('RF-305: el enlace a la ficha de la obra relacionada', () => {
  it('apunta a la ruta en inglés de la ficha', () => {
    expect(recordLink('AR-0042')).toEqual({ pathname: '/artwork/AR-0042', search: '' })
  })

  it('se lleva la vista del listado, que es la cola por la que se está pasando (RF-311)', () => {
    expect(recordLink('AR-0042', 'artist=ROTILI&order=CODE').search).toBe(
      'artist=ROTILI&order=CODE',
    )
  })
})
