import { describe, expect, it } from 'vitest'
import type { CitationRow, ReferenceRow } from '../documentaryRows'
import {
  citationEdit,
  citationPagesText,
  citationView,
  displayCitationPages,
  referenceAuthorText,
  referenceSourceText,
  referenceYearText,
} from './citationFormat'

/**
 * What is read of a bibliographic citation in the record (RF-504).
 *
 * A reference is read at a glance or it is of no use: authorship, title, where it appeared,
 * when, and the page where THIS artwork appears. Here the sentence is verified, not the
 * component that contains it: the suite runs in node and there is no DOM.
 */

function reference(over: Partial<ReferenceRow> = {}): ReferenceRow {
  return {
    id: 'bib-1',
    bibtex_key: null,
    authors: '',
    editors: '',
    title: 'Alberto Rotili, obra sobre papel',
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

function citation(over: Partial<CitationRow> = {}): CitationRow {
  return {
    id: 'ab-1',
    catalog_id: 'AR-0001',
    bibliography_id: 'bib-1',
    pages: '',
    note: '',
    active: true,
    reference: reference(),
    ...over,
  }
}

describe('RF-504 · quién firma la referencia', () => {
  it('la autoría, cuando la hay', () => {
    expect(referenceAuthorText(reference({ authors: 'Rotili, A.' }))).toBe('Rotili, A.')
  })

  it('los editores, con «(ed.)», cuando no hay autoría', () => {
    expect(referenceAuthorText(reference({ editors: 'Pérez, Juan' }))).toBe('Pérez, Juan (ed.)')
  })

  it('la autoría manda sobre los editores', () => {
    expect(referenceAuthorText(reference({ authors: 'Rotili, A.', editors: 'Pérez, J.' }))).toBe(
      'Rotili, A.',
    )
  })

  it('nunca pluraliza «(ed.)»: el campo es texto libre y «Pérez, Juan» lleva una coma', () => {
    expect(referenceAuthorText(reference({ editors: 'Pérez, Juan; López, Ana' }))).toBe(
      'Pérez, Juan; López, Ana (ed.)',
    )
  })

  it('null cuando nadie firma: un recorte sin firma se cita por su título', () => {
    expect(referenceAuthorText(reference({ authors: '   ', editors: '' }))).toBeNull()
  })
})

describe('RF-504 · el año, y «s.f.» que es un dato', () => {
  it('el año tal cual', () => {
    expect(referenceYearText(reference({ year: 1985 }))).toBe('1985')
  })

  it('«s.f.» cuando la publicación no lleva año, nunca un hueco (RF-304)', () => {
    expect(referenceYearText(reference({ year: null }))).toBe('s.f.')
  })
})

describe('RF-504 · dónde salió', () => {
  it('la revista sola', () => {
    expect(referenceSourceText(reference({ container_title: 'Revista de Estudios Extremeños' }))).toBe(
      'Revista de Estudios Extremeños',
    )
  })

  it('el pie de imprenta clásico: lugar, dos puntos, editorial', () => {
    expect(referenceSourceText(reference({ place: 'Badajoz', publisher: 'Diputación' }))).toBe(
      'Badajoz: Diputación',
    )
  })

  it('sin dos puntos sueltos cuando falta la mitad', () => {
    expect(referenceSourceText(reference({ place: 'Badajoz' }))).toBe('Badajoz')
    expect(referenceSourceText(reference({ publisher: 'Diputación' }))).toBe('Diputación')
  })

  it('la revista y el pie de imprenta juntos, separados por punto medio', () => {
    expect(
      referenceSourceText(
        reference({ container_title: 'Revista X', place: 'Badajoz', publisher: 'Diputación' }),
      ),
    ).toBe('Revista X · Badajoz: Diputación')
  })

  it('null cuando la referencia no dice ninguna de las tres cosas', () => {
    expect(referenceSourceText(reference())).toBeNull()
  })
})

describe('RF-504 · la página, que es dato citable y no una nota', () => {
  it('una página suelta lleva «pág.»', () => {
    expect(citationPagesText('34')).toBe('pág. 34')
  })

  it('un intervalo lleva «págs.»', () => {
    expect(citationPagesText('34-36')).toBe('págs. 34-36')
    expect(citationPagesText('34, 51')).toBe('págs. 34, 51')
  })

  it('lo que ya dice qué es se imprime tal cual, sin «pág. lám. XII»', () => {
    expect(citationPagesText('lám. XII')).toBe('lám. XII')
    expect(citationPagesText('s/p')).toBe('s/p')
    expect(citationPagesText('pp. 34-36')).toBe('pp. 34-36')
    expect(citationPagesText('fig. 3')).toBe('fig. 3')
    expect(citationPagesText('cat. 12 bis')).toBe('cat. 12 bis')
  })

  it('lo que no se reconoce se imprime tal cual, sin inventar abreviatura', () => {
    expect(citationPagesText('contraportada')).toBe('contraportada')
  })

  it('se recortan los espacios de alrededor', () => {
    expect(citationPagesText('  34  ')).toBe('pág. 34')
  })

  it('null cuando nadie ha escrito la página, que NO es «s/p»', () => {
    // «s/p» is somebody stating that the publication has no pagination; the empty
    // field is that nobody has noted it. The whole catalogue's distinction.
    expect(citationPagesText('')).toBeNull()
    expect(citationPagesText('   ')).toBeNull()
    expect(citationPagesText('s/p')).not.toBeNull()
  })

  it('RF-304: en pantalla la falta de página se dice, no se deja en blanco', () => {
    expect(displayCitationPages('')).toBe('Página sin registrar')
    expect(displayCitationPages('34')).toBe('pág. 34')
  })
})

describe('RF-504 · la cita entera, lista para pintar', () => {
  it('autoría y año en una línea, la fuente en otra y la página aparte', () => {
    const view = citationView(
      citation({
        pages: '34-36',
        reference: reference({
          authors: 'Rotili, A.',
          year: 1985,
          container_title: 'Revista X',
          place: 'Badajoz',
        }),
      }),
    )
    expect(view.title).toBe('Alberto Rotili, obra sobre papel')
    expect(view.byline).toBe('Rotili, A. · 1985')
    expect(view.sourceText).toBe('Revista X · Badajoz')
    expect(view.pagesText).toBe('págs. 34-36')
    expect(view.pagesMissing).toBe(false)
    expect(view.unavailable).toBe(false)
  })

  it('sin firma, la línea es solo el año: nunca queda vacía', () => {
    const view = citationView(citation({ reference: reference({ authors: '', year: null }) }))
    expect(view.byline).toBe('s.f.')
  })

  it('el identificador que se retira es el de la FILA PUENTE, no el de la referencia', () => {
    // Removing a citation takes this artwork out of that publication; the reference
    // is shared by the other artworks citing it.
    const view = citationView(citation({ id: 'ab-9', bibliography_id: 'bib-7' }))
    expect(view.id).toBe('ab-9')
    expect(view.referenceId).toBe('bib-7')
  })

  it('el tipo de publicación se lee aunque la entrada del vocabulario esté retirada (RF-514)', () => {
    const view = citationView(
      citation({
        reference: reference({
          publication_type: { id: 'pt-1', name: 'Catálogo de exposición', active: false },
        }),
      }),
    )
    expect(view.typeName).toBe('Catálogo de exposición')
  })

  it('una referencia retirada se apaga con su aviso, no se esconde (RF-901)', () => {
    const view = citationView(citation({ reference: reference({ active: false }) }))
    expect(view.retiredText).not.toBeNull()
    expect(view.title).toBe('Alberto Rotili, obra sobre papel')
  })

  it('sin referencia legible, la cita se muestra igual y con la página (RF-304)', () => {
    // The policy lets the bridge row be seen and not the withdrawn reference. Hiding
    // the row would hide from the reader that this artwork is published.
    const view = citationView(citation({ pages: '12', reference: null }))
    expect(view.unavailable).toBe(true)
    expect(view.unavailableText).not.toBeNull()
    expect(view.title).toBe('Referencia no disponible')
    expect(view.pagesText).toBe('pág. 12')
  })

  it('una referencia sin título no deja la fila muda', () => {
    const view = citationView(citation({ reference: reference({ title: '   ' }) }))
    expect(view.title).toBe('Referencia sin título')
  })
})

describe('RF-504 · corregir una cita ya registrada', () => {
  it('devuelve la página CRUDA, sin la abreviatura que añade la ficha', () => {
    // Reopening with «págs. 34-36» and saving would leave the prefix inside the
    // column, and one more would grow on every edit.
    const edit = citationEdit(citation({ pages: '34-36', note: 'Reproducida' }))
    expect(edit.pages).toBe('34-36')
    expect(edit.note).toBe('Reproducida')
    expect(edit.title).toBe('Alberto Rotili, obra sobre papel')
  })

  it('nombra la cita aunque su referencia no se pueda leer', () => {
    expect(citationEdit(citation({ reference: null })).title).toBe('Referencia no disponible')
  })
})
