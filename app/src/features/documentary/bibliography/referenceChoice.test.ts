import { describe, expect, it } from 'vitest'
import type { CitationRow, ReferenceRow } from '../documentaryRows'
import {
  EMPTY_REFERENCE_DRAFT,
  REFERENCE_COLUMNS,
  citedReferenceIds,
  equivalentReference,
  equivalentReferenceNotice,
  newReferencePayload,
  noReferenceOptionsText,
  newReferenceProblem,
  referenceOptionHint,
  referenceOptions,
  referenceSearchText,
  searchReferenceOptions,
  type ReferenceDraft,
} from './referenceChoice'

/**
 * Elegir en qué referencia se cita una obra, y escribir la referencia cuando
 * todavía no está en el catálogo (RF-504).
 *
 * Lo que se comprueba aquí es lo que decide algo: qué referencias se ofrecen,
 * cuáles alcanza lo que se teclea, cuándo un borrador es en realidad una
 * referencia que ya existe, y qué falta antes de poder guardarla.
 */

function reference(over: Partial<ReferenceRow> = {}): ReferenceRow {
  return {
    id: 'bib-1',
    bibtex_key: null,
    authors: '',
    editors: '',
    title: 'Obra sobre papel',
    container_title: '',
    publication_type_id: null,
    year: 1985,
    publisher: '',
    place: '',
    note: '',
    active: true,
    publication_type: null,
    ...over,
  }
}

function draft(over: Partial<ReferenceDraft> = {}): ReferenceDraft {
  return { ...EMPTY_REFERENCE_DRAFT, title: 'Obra sobre papel', year: 1985, ...over }
}

/**
 * Cada campo de la fila tiene que estar en la lista de columnas: un campo que la
 * consulta olvida llega como `undefined` con el tipo prometiendo un valor.
 */
function selectsEveryField(columns: string, row: object, embeds: Record<string, string> = {}) {
  for (const field of Object.keys(row)) {
    const embed = embeds[field]
    if (embed !== undefined) {
      expect(columns, `la incrustación de ${field}`).toContain(embed)
      continue
    }
    expect(columns, `la columna ${field}`).toMatch(new RegExp(`\\b${field}\\b`))
  }
}

describe('las columnas del catálogo de referencias', () => {
  it('pide todos los campos de una referencia y su tipo de publicación (RF-504, RF-514)', () => {
    selectsEveryField(REFERENCE_COLUMNS, reference(), {
      publication_type: 'publication_type:publication_types(',
    })
    selectsEveryField(REFERENCE_COLUMNS, { id: '', name: '', active: true })
  })

  it('no filtra por `active`: una referencia retirada sigue haciendo falta para pintar sus citas', () => {
    expect(REFERENCE_COLUMNS).toContain('active')
  })
})

describe('RF-504 · qué referencias se ofrecen para citar', () => {
  it('las retiradas no se ofrecen: están en la papelera (RF-901)', () => {
    const options = referenceOptions(
      [reference({ id: 'a' }), reference({ id: 'b', active: false })],
      new Set(),
    )
    expect(options.map((o) => o.id)).toEqual(['a'])
  })

  it('las que esta obra ya cita se ofrecen marcadas, no desaparecen', () => {
    // Disappearing with no explanation leaves the cataloguer typing the same
    // title over and over.
    const options = referenceOptions([reference({ id: 'a' })], new Set(['a']))
    expect(options).toHaveLength(1)
    expect(options[0]?.alreadyCited).toBe(true)
  })

  it('en orden alfabético del título, con las tildes en su sitio', () => {
    const options = referenceOptions(
      [
        reference({ id: '1', title: 'Zafra, 1985' }),
        reference({ id: '2', title: 'Álbum de la sierra' }),
        reference({ id: '3', title: 'Badajoz en papel' }),
      ],
      new Set(),
    )
    expect(options.map((o) => o.text)).toEqual([
      'Álbum de la sierra',
      'Badajoz en papel',
      'Zafra, 1985',
    ])
  })

  it('una referencia sin título no se ofrece muda', () => {
    expect(referenceOptions([reference({ title: '  ' })], new Set())[0]?.text).toBe(
      'Referencia sin título',
    )
  })

  it('la segunda línea distingue dos ediciones del mismo título', () => {
    const hint = referenceOptionHint(
      reference({
        authors: 'Rotili, A.',
        year: 2003,
        container_title: 'Cuadernos',
        publication_type: { id: 'pt', name: 'Libro', active: true },
      }),
    )
    expect(hint).toBe('Rotili, A. · 2003 · Cuadernos · Libro')
  })

  it('las citas de la ficha dan los identificadores de lo ya citado', () => {
    const rows = [
      { bibliography_id: 'bib-1' },
      { bibliography_id: 'bib-2' },
    ] as unknown as CitationRow[]
    expect([...citedReferenceIds(rows)].sort()).toEqual(['bib-1', 'bib-2'])
  })
})

describe('RF-504 · buscar entre las referencias', () => {
  const catalog = [
    reference({ id: '1', title: 'Alberto Rotili, obra sobre papel', place: 'Zafra', year: 1985 }),
    reference({ id: '2', title: 'Pintura extremeña del siglo XX', authors: 'López, Ana' }),
    reference({ id: '3', title: 'Memoria del taller', bibtex_key: 'rotili85' }),
  ]

  it('el título alcanza la referencia', () => {
    const found = searchReferenceOptions(catalog, new Set(), 'papel')
    expect(found.map((m) => m.item.id)).toEqual(['1'])
  })

  it('también el lugar, la autoría y la clave BibTeX, que es como se la nombra', () => {
    // La coincidencia es por subsecuencia, como en el resto de la aplicación:
    // las letras cuentan aunque estén separadas, así que lo que se comprueba es
    // que la referencia buscada encabece el resultado y no que sea la única.
    expect(searchReferenceOptions(catalog, new Set(), 'zafra')[0]?.item.id).toBe('1')
    expect(searchReferenceOptions(catalog, new Set(), 'lopez')[0]?.item.id).toBe('2')
    expect(searchReferenceOptions(catalog, new Set(), 'rotili85')[0]?.item.id).toBe('3')
  })

  it('sin nada tecleado se devuelve el catálogo entero, en su orden', () => {
    expect(searchReferenceOptions(catalog, new Set(), '')).toHaveLength(3)
  })

  it('se recorta la lista: en una hoja inferior se teclea una letra más antes que desplazar', () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      reference({ id: `r${i}`, title: `Referencia ${i}` }),
    )
    expect(searchReferenceOptions(many, new Set(), 'refe')).toHaveLength(6)
    expect(searchReferenceOptions(many, new Set(), 'refe', 3)).toHaveLength(3)
  })

  it('las letras resaltadas nunca se salen del título', () => {
    // El ranking corre sobre todo el texto buscable y el resaltado se pinta
    // sobre el título: una coincidencia en el lugar no puede marcar letras
    // arbitrarias del título.
    const [match] = searchReferenceOptions(catalog, new Set(), 'zafra')
    for (const index of match?.indices ?? []) {
      expect(index).toBeLessThan((match?.item.text ?? '').length)
    }
  })

  it('el texto buscable empieza por el título, carácter a carácter', () => {
    const ref = reference({ title: '  Obra sobre papel  ', place: 'Zafra' })
    expect(referenceSearchText(ref).startsWith('Obra sobre papel')).toBe(true)
  })
})

describe('RF-504 · escribir una referencia nueva', () => {
  it('el título es lo único imprescindible: un recorte sin firma ni año es una referencia', () => {
    expect(newReferenceProblem(draft({ title: 'Recorte', authors: '', year: null }))).toBeNull()
  })

  it('sin título no se guarda, y se dice en español', () => {
    expect(newReferenceProblem(draft({ title: '   ' }))).toBe('Escribe el título de la referencia')
  })

  it('el año fuera de lo plausible se avisa aquí y no con el error de la base', () => {
    expect(newReferenceProblem(draft({ year: 999 }))).toContain('1000')
    expect(newReferenceProblem(draft({ year: 2101 }))).toContain('2100')
    expect(newReferenceProblem(draft({ year: 1000 }))).toBeNull()
    expect(newReferenceProblem(draft({ year: 2100 }))).toBeNull()
  })

  it('la fila que se inserta va recortada, y lo opcional va como null y no como cadena vacía', () => {
    const payload = newReferencePayload(
      draft({ title: '  Zafra 1985 ', authors: ' VV. AA. ', publicationTypeId: null }),
    )
    expect(payload.title).toBe('Zafra 1985')
    expect(payload.authors).toBe('VV. AA.')
    // Null is «nobody has classified it», which is not the vocabulary's «Otro»
    // entry (RF-514).
    expect(payload.publication_type_id).toBeNull()
  })
})

describe('RF-504 · no crear dos filas para el mismo libro', () => {
  const catalog = [reference({ id: 'a', title: 'Álbum de la Sierra', year: 1985 })]

  it('mismo título y mismo año, sin mirar mayúsculas ni tildes', () => {
    expect(equivalentReference(catalog, draft({ title: 'album de la sierra', year: 1985 }))?.id).toBe(
      'a',
    )
  })

  it('otro año es otra referencia: la reedición pagina distinto y la página es el dato', () => {
    expect(equivalentReference(catalog, draft({ title: 'Álbum de la Sierra', year: 2003 }))).toBeUndefined()
  })

  it('una referencia retirada también cuenta: escribirla otra vez es como nace la gemela (RF-901)', () => {
    const retired = [reference({ id: 'r', title: 'Zafra', year: 1985, active: false })]
    expect(equivalentReference(retired, draft({ title: 'Zafra', year: 1985 }))?.id).toBe('r')
  })

  it('un borrador sin título no es equivalente a nada', () => {
    expect(equivalentReference(catalog, draft({ title: '' }))).toBeUndefined()
  })

  it('se avisa de que se va a reusar, con el título de la que ya hay', () => {
    expect(equivalentReferenceNotice(reference({ title: 'Álbum de la Sierra' }))).toContain(
      '«Álbum de la Sierra»',
    )
  })

  it('si la que ya hay está retirada se dice, porque la cita saldrá con su aviso', () => {
    // Reusing a live one is the invisible good outcome; reusing a withdrawn one
    // hands over a citation with a warning nobody asked for.
    const notice = equivalentReferenceNotice(reference({ title: 'Zafra', active: false }))
    expect(notice).toContain('retirada')
    expect(notice).toContain('papelera')
    // And it is not recovered through the back door: that belongs to the
    // reference's own record (RF-309).
    expect(notice).toContain('su propia ficha')
  })

  it('una referencia sin título tampoco avisa muda', () => {
    expect(equivalentReferenceNotice(reference({ title: '  ' }))).toContain(
      'Referencia sin título',
    )
  })
})

describe('RF-304 · el buscador nunca se queda en blanco sin explicar por qué', () => {
  it('el catálogo vacío se distingue de una búsqueda sin resultados', () => {
    expect(noReferenceOptionsText(0, 0, '')).toContain('todavía no tiene ninguna referencia')
  })

  it('con todas las referencias retiradas se dice eso, y no que no coincide nada', () => {
    // Telling her that what she wrote does not match leaves her typing variants of
    // a title that is in the catalogue.
    const text = noReferenceOptionsText(0, 4, 'zafra')
    expect(text).toContain('retiradas')
    expect(text).not.toContain('coincide')
  })

  it('con referencias que ofrecer, lo que no coincide es lo que ha escrito, y se repite', () => {
    expect(noReferenceOptionsText(6, 6, ' zafra ')).toBe('Ninguna referencia coincide con «zafra».')
  })

  it('sin nada escrito no se le echa la culpa a lo escrito', () => {
    expect(noReferenceOptionsText(6, 6, '   ')).not.toContain('coincide con')
  })
})
