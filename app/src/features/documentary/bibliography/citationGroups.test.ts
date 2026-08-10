import { describe, expect, it } from 'vitest'
import type { CitationRow, MasterRef, ReferenceRow } from '../documentaryRows'
import {
  MIN_ROWS_TO_GROUP,
  UNCLASSIFIED_GROUP,
  UNCLASSIFIED_TITLE,
  citationList,
  groupingHelps,
} from './citationGroups'

/**
 * Grouping the bibliography by publication type when it helps, and not when it does not
 * (RF-504, RF-514).
 *
 * Each label costs one line of a phone screen, so it has to
 * earn it: three references are read whole and fourteen are not. The rule that
 * decides it is checked here and is not read inside the JSX.
 */

const ARTICLE: MasterRef = { id: 'pt-article', name: 'Artículo', active: true }
const CATALOG: MasterRef = { id: 'pt-catalog', name: 'Catálogo de exposición', active: true }
const PRESS: MasterRef = { id: 'pt-press', name: 'Prensa', active: true }

let counter = 0

function citation(type: MasterRef | null, over: Partial<ReferenceRow> = {}): CitationRow {
  counter += 1
  const id = `row-${counter}`
  const reference: ReferenceRow = {
    id: `bib-${counter}`,
    bibtex_key: null,
    authors: '',
    editors: '',
    title: `Referencia ${counter}`,
    container_title: '',
    publication_type_id: type?.id ?? null,
    year: 1985,
    publisher: '',
    place: '',
    note: '',
    active: true,
    publication_type: type,
    ...over,
  }
  return {
    id,
    catalog_id: 'AR-0001',
    bibliography_id: reference.id,
    pages: '',
    note: '',
    active: true,
    reference,
  }
}

describe('RF-504 · cuándo agrupar aporta algo', () => {
  it('con menos de cuatro referencias no se agrupa: la lista se lee entera', () => {
    expect(MIN_ROWS_TO_GROUP).toBe(4)
    expect(groupingHelps([citation(ARTICLE), citation(PRESS), citation(CATALOG)])).toBe(false)
  })

  it('con un solo tipo no se agrupa: un rótulo sobre todo el bloque no dice nada', () => {
    expect(groupingHelps([citation(PRESS), citation(PRESS), citation(PRESS), citation(PRESS)])).toBe(
      false,
    )
  })

  it('cuatro referencias de dos tipos sí se agrupan', () => {
    expect(
      groupingHelps([citation(PRESS), citation(PRESS), citation(ARTICLE), citation(ARTICLE)]),
    ).toBe(true)
  })

  it('cinco referencias de cinco tipos NO se agrupan: serían cinco rótulos sobre cinco líneas', () => {
    const kinds = ['a', 'b', 'c', 'd', 'e'].map((k) =>
      citation({ id: `pt-${k}`, name: `Tipo ${k}`, active: true }),
    )
    expect(groupingHelps(kinds)).toBe(false)
  })

  it('una bibliografía real y desigual —ocho recortes y un libro— sí se agrupa', () => {
    const rows = [
      ...Array.from({ length: 8 }, () => citation(PRESS)),
      citation({ id: 'pt-book', name: 'Libro', active: true }),
    ]
    expect(groupingHelps(rows)).toBe(true)
  })

  it('las referencias sin clasificar cuentan como un grupo más', () => {
    expect(groupingHelps([citation(null), citation(null), citation(PRESS), citation(PRESS)])).toBe(
      true,
    )
  })
})

describe('RF-504 · la lista que se pinta', () => {
  it('sin agrupar, un único grupo sin rótulo y en el orden que llegó', () => {
    const rows = [citation(PRESS), citation(ARTICLE)]
    const list = citationList(rows)
    expect(list.grouped).toBe(false)
    expect(list.groups).toHaveLength(1)
    expect(list.groups[0]?.title).toBeNull()
    expect(list.groups[0]?.views.map((v) => v.id)).toEqual(rows.map((r) => r.id))
  })

  it('agrupada, los rótulos van en orden alfabético del vocabulario', () => {
    const list = citationList([
      citation(PRESS),
      citation(PRESS),
      citation(CATALOG),
      citation(CATALOG),
      citation(ARTICLE),
      citation(ARTICLE),
    ])
    expect(list.grouped).toBe(true)
    expect(list.groups.map((g) => g.title)).toEqual([
      'Artículo',
      'Catálogo de exposición',
      'Prensa',
    ])
  })

  it('«Sin clasificar» va el último, y nunca se esconde', () => {
    // Hiding it is how a block ends up looking complete without anybody having
    // classified anything.
    const list = citationList([citation(null), citation(PRESS), citation(PRESS), citation(PRESS)])
    expect(list.groups.at(-1)?.key).toBe(UNCLASSIFIED_GROUP)
    expect(list.groups.at(-1)?.title).toBe(UNCLASSIFIED_TITLE)
  })

  it('«Sin clasificar» no es «Otro»: nadie ha mirado no es se ha mirado y no encaja', () => {
    const other: MasterRef = { id: 'pt-other', name: 'Otro', active: true }
    const list = citationList([
      citation(null),
      citation(null),
      citation(other),
      citation(other),
      citation(PRESS),
      citation(PRESS),
    ])
    const keys = list.groups.map((g) => g.key)
    expect(keys).toContain('pt-other')
    expect(keys).toContain(UNCLASSIFIED_GROUP)
  })

  it('dentro de cada grupo se conserva el orden cronológico que trajo la consulta', () => {
    const old = citation(PRESS, { year: 1968, title: 'Antigua' })
    const mid = citation(PRESS, { year: 1985, title: 'Media' })
    const recent = citation(PRESS, { year: 2003, title: 'Reciente' })
    const list = citationList([old, mid, recent, citation(ARTICLE)])
    const press = list.groups.find((g) => g.key === PRESS.id)
    expect(press?.views.map((v) => v.title)).toEqual(['Antigua', 'Media', 'Reciente'])
  })

  it('ninguna cita se pierde ni se duplica al agrupar', () => {
    const rows = [
      citation(PRESS),
      citation(ARTICLE),
      citation(null),
      citation(CATALOG),
      citation(PRESS),
      citation(ARTICLE),
    ]
    const list = citationList(rows)
    const ids = list.groups.flatMap((g) => g.views.map((v) => v.id))
    expect(ids).toHaveLength(rows.length)
    expect(new Set(ids).size).toBe(rows.length)
  })

  it('una cita cuya referencia no se puede leer cae en «Sin clasificar» y se pinta', () => {
    const orphan: CitationRow = { ...citation(PRESS), reference: null }
    const list = citationList([
      orphan,
      citation(PRESS),
      citation(PRESS),
      citation(PRESS),
      citation(ARTICLE),
      citation(ARTICLE),
    ])
    const unclassified = list.groups.find((g) => g.key === UNCLASSIFIED_GROUP)
    expect(unclassified?.views).toHaveLength(1)
    expect(unclassified?.views[0]?.unavailable).toBe(true)
  })

  it('un bloque vacío da un grupo vacío y no revienta', () => {
    const list = citationList([])
    expect(list.grouped).toBe(false)
    expect(list.groups[0]?.views).toEqual([])
  })
})
