import { describe, expect, it } from 'vitest'
import type { ReferenceRow } from '../documentary/documentaryRows'
import {
  bibliographyListNotice,
  bibliographyOrderKey,
  rankReferences,
  referenceCountText,
  retiredReferenceCount,
  sortReferences,
} from './bibliographyIndex'

/**
 * The bibliography's index (RF-506, RF-606, RF-609).
 *
 * What these tests pin down is what a list decides and a record does not: the whole
 * table's order, what the search catches, and what is said where the rows would go when there
 * are none — which is the «never a blank page» criterion applied, and the one
 * most easily lost in a refactor.
 *
 * And it pins down the screen's reason to exist: a reference no artwork cites
 * was still in the catalogue and could not be found from anywhere.
 */

function reference(over: Partial<ReferenceRow> = {}): ReferenceRow {
  return {
    id: 'ref-1',
    bibtex_key: null,
    authors: '',
    editors: '',
    title: 'Sin título',
    container_title: '',
    publication_type_id: null,
    year: null,
    publisher: '',
    place: '',
    note: '',
    active: true,
    publication_type: null,
    ...over,
  } as ReferenceRow
}

describe('bibliographyOrderKey, con qué se ordena una referencia', () => {
  it('con el autor cuando lo tiene', () => {
    expect(bibliographyOrderKey(reference({ authors: 'Rotili, Alberto' }))).toBe('Rotili, Alberto')
  })

  it('con los editores cuando no hay autores', () => {
    expect(bibliographyOrderKey(reference({ editors: 'Ruiz Campins, María' }))).toBe(
      'Ruiz Campins, María (ed.)',
    )
  })

  it('y con el título cuando no hay nadie firmando', () => {
    // Half of a real archive is unsigned clippings. «Anónimo» is not an author starting
    // with z: the reference is placed by its title among the rest.
    expect(bibliographyOrderKey(reference({ title: 'Crónica de la exposición' }))).toBe(
      'Crónica de la exposición',
    )
  })
})

describe('sortReferences, el orden del índice', () => {
  it('alfabético por autor, en es-ES', () => {
    // «Álvarez» sits with the a's and not after the z, which is what byte order
    // would do.
    const rows = [
      reference({ id: 'c', authors: 'Zafra, Luis' }),
      reference({ id: 'a', authors: 'Álvarez, Ana' }),
      reference({ id: 'b', authors: 'Rotili, Alberto' }),
    ]
    expect(sortReferences(rows).map((r) => r.id)).toEqual(['a', 'b', 'c'])
  })

  it('y dentro de un autor, por año ascendente', () => {
    // Ascending, like the exhibition history (RF-502): within an author what is read
    // is their journey.
    const rows = [
      reference({ id: 'nuevo', authors: 'Rotili, Alberto', year: 1991 }),
      reference({ id: 'viejo', authors: 'Rotili, Alberto', year: 1978 }),
    ]
    expect(sortReferences(rows).map((r) => r.id)).toEqual(['viejo', 'nuevo'])
  })

  it('la referencia sin año va después de las fechadas del mismo autor', () => {
    // «s.f.» is a legitimate datum and not a point in time, so it does not head its
    // author's work.
    const rows = [
      reference({ id: 'sin-fecha', authors: 'Rotili, Alberto', year: null }),
      reference({ id: 'con-fecha', authors: 'Rotili, Alberto', year: 1985 }),
    ]
    expect(sortReferences(rows).map((r) => r.id)).toEqual(['con-fecha', 'sin-fecha'])
  })

  it('una anónima se coloca por su título entre los autores, no al final', () => {
    const rows = [
      reference({ id: 'zafra', authors: 'Zafra, Luis' }),
      reference({ id: 'anonima', title: 'Crónica de la exposición' }),
      reference({ id: 'alvarez', authors: 'Álvarez, Ana' }),
    ]
    expect(sortReferences(rows).map((r) => r.id)).toEqual(['alvarez', 'anonima', 'zafra'])
  })

  it('el orden es estable entre dos cargas de la misma pantalla', () => {
    // Same author, same year and same title: without the identifier breaking the
    // tie, two references would swap places from one load to the next.
    const rows = [
      reference({ id: 'b', authors: 'Rotili', year: 1985, title: 'Igual' }),
      reference({ id: 'a', authors: 'Rotili', year: 1985, title: 'Igual' }),
    ]
    expect(sortReferences(rows).map((r) => r.id)).toEqual(['a', 'b'])
    expect(sortReferences(rows.slice().reverse()).map((r) => r.id)).toEqual(['a', 'b'])
  })

  it('no toca el array que recibe', () => {
    const rows = [reference({ id: 'b', authors: 'Zafra' }), reference({ id: 'a', authors: 'Álvarez' })]
    sortReferences(rows)
    expect(rows.map((r) => r.id)).toEqual(['b', 'a'])
  })
})

describe('rankReferences, lo que la búsqueda encuentra (RF-606)', () => {
  const catalogo = [
    reference({ id: 'articulo', authors: 'Rotili, Alberto', title: 'Notas sobre el paisaje', year: 1985, container_title: 'Revista de Estudios Extremeños' }),
    reference({ id: 'libro', authors: 'Álvarez, Ana', title: 'La pintura de posguerra', year: 1991, place: 'Badajoz', publisher: 'Diputación' }),
    reference({ id: 'recorte', title: 'Crónica de la muestra de Zafra', year: null }),
  ]

  it('sin nada teclado, el índice entero y alfabético', () => {
    expect(rankReferences(catalogo, '').map((e) => e.row.id)).toEqual([
      'libro',
      'recorte',
      'articulo',
    ])
  })

  it('caza por autor', () => {
    expect(rankReferences(catalogo, 'rotili').map((e) => e.row.id)).toEqual(['articulo'])
  })

  it('caza por el lugar, que no está en el título', () => {
    // «Zafra» —the place— or the journal is searched, not just the title: it is what
    // `referenceSearchText` puts in the string, and that is why the row shows that line.
    expect(rankReferences(catalogo, 'badajoz').map((e) => e.row.id)).toEqual(['libro'])
  })

  it('caza por año', () => {
    expect(rankReferences(catalogo, '1991').map((e) => e.row.id)).toEqual(['libro'])
  })

  it('caza por la clave BibTeX, que es como se cita en el ensayo, y la pone primero', () => {
    // The match is by SUBSEQUENCE and not by substring —it is the same one as the
    // location suggestions—, so «rotili85» also fits «Rotili,
    // Alberto … 1985»: the letters count even when separated. That is not a
    // failure, it is what makes something findable by typing little. What matters is
    // that the tight match wins, and that is why the ORDER is asserted and not the
    // set: demanding a single result would be demanding a different finder.
    const conClave = [...catalogo, reference({ id: 'con-clave', bibtex_key: 'rotili85', title: 'Otra' })]
    const ids = rankReferences(conClave, 'rotili85').map((e) => e.row.id)
    expect(ids[0]).toBe('con-clave')
    expect(ids).toContain('articulo')
  })

  it('sin coincidencias devuelve la lista vacía, para que la pantalla lo explique', () => {
    expect(rankReferences(catalogo, 'zzzzz')).toEqual([])
  })

  it('cada fila trae lo que se pinta, y nunca un hueco (RF-304)', () => {
    const [primera] = rankReferences(catalogo, 'posguerra')
    expect(primera?.title).toBe('La pintura de posguerra')
    expect(primera?.year).toBe('1991')
    expect(primera?.hint).toContain('Álvarez, Ana')
    expect(primera?.hint).toContain('Badajoz: Diputación')
    expect(primera?.retired).toBe(false)
  })

  it('la referencia sin año dice «s.f.» y no deja el hueco', () => {
    const [fila] = rankReferences(catalogo, 'crónica')
    expect(fila?.year).toBe('s.f.')
  })
})

describe('la papelera del índice (RF-609, RF-901)', () => {
  const conRetirada = [
    reference({ id: 'viva', authors: 'Rotili', title: 'Viva' }),
    reference({ id: 'retirada', authors: 'Álvarez', title: 'Retirada', active: false }),
  ]

  it('las retiradas no salen si no se piden', () => {
    expect(rankReferences(conRetirada, '').map((e) => e.row.id)).toEqual(['viva'])
  })

  it('pedidas salen, y marcadas', () => {
    const entries = rankReferences(conRetirada, '', { includeRetired: true })
    expect(entries.map((e) => e.row.id)).toEqual(['retirada', 'viva'])
    expect(entries.find((e) => e.row.id === 'retirada')?.retired).toBe(true)
  })

  it('se cuentan, para no ofrecer el interruptor sobre una papelera vacía', () => {
    expect(retiredReferenceCount(conRetirada)).toBe(1)
    expect(retiredReferenceCount([reference()])).toBe(0)
  })
})

describe('referenceCountText, cuántas hay y cuántas se enseñan', () => {
  it('el total cuando no se está buscando', () => {
    expect(referenceCountText({ total: 12, shown: 12, searching: false })).toBe('12 referencias')
    expect(referenceCountText({ total: 1, shown: 1, searching: false })).toBe('1 referencia')
  })

  it('y la fracción cuando la búsqueda ha recortado', () => {
    expect(referenceCountText({ total: 12, shown: 3, searching: true })).toBe('3 de 12 referencias')
  })

  it('buscando sin recortar no dice «12 de 12»', () => {
    expect(referenceCountText({ total: 12, shown: 12, searching: true })).toBe('12 referencias')
  })
})

describe('bibliographyListNotice, nunca una página en blanco', () => {
  const base = { loading: false, error: null, total: 5, shown: 5, query: '', includingRetired: false }

  it('con filas no dice nada', () => {
    expect(bibliographyListNotice(base)).toBeNull()
  })

  it('mientras carga lo dice', () => {
    expect(bibliographyListNotice({ ...base, loading: true, shown: 0 })).toBe(
      'Cargando la bibliografía…',
    )
  })

  it('el error manda sobre todo lo demás, incluso sobre «cargando»', () => {
    expect(
      bibliographyListNotice({ ...base, loading: true, shown: 0, error: 'Sin conexión' }),
    ).toBe('Sin conexión')
  })

  it('una búsqueda sin resultados apunta a la papelera', () => {
    const text = bibliographyListNotice({ ...base, shown: 0, query: 'zzz' })
    expect(text).toContain('No se ha encontrado ninguna referencia')
    expect(text).toContain('retirada')
  })

  it('y si ya se están incluyendo las retiradas, no la ofrece otra vez', () => {
    const text = bibliographyListNotice({
      ...base,
      shown: 0,
      query: 'zzz',
      includingRetired: true,
    })
    expect(text).toContain('ni entre las retiradas')
  })

  it('el catálogo sin ninguna referencia dice de dónde salen', () => {
    // And it offers no «nueva referencia» button that does not exist: a reference is
    // created by citing it from an artwork.
    const text = bibliographyListNotice({ ...base, total: 0, shown: 0 })
    expect(text).toContain('Todavía no hay ninguna referencia')
    expect(text).toContain('al citarla')
  })

  it('y con todas retiradas lo dice, en vez de parecer un catálogo vacío', () => {
    const text = bibliographyListNotice({ ...base, total: 3, shown: 0 })
    expect(text).toContain('están retiradas')
  })
})
