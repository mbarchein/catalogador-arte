import { describe, expect, it } from 'vitest'
import type { ExhibitionDocumentLinkRow } from '../documentary/documentaryRows'
import {
  documentLinkedNotice,
  documentTitleText,
  documentUnlinkedNotice,
  exhibitionDocumentCountText,
  exhibitionDocumentsNotice,
  linkedDocumentIds,
  retireDocumentLinkText,
  EXHIBITION_DOCUMENTS_HINT,
} from './exhibitionDocuments'

/**
 * RF-516, RF-517: los documentos del archivo que hablan de una exposición.
 *
 * El vínculo estaba en el esquema y se creaba desde la ficha del documento; lo que faltaba
 * era que la exposición lo enseñara. Aquí se fija lo que se lee, que es donde este bloque
 * puede equivocarse sin que se note: un vacío contado como error, un «quitar» que parece
 * llevarse el documento, o una frase que nombra «esta obra» en la ficha de una muestra.
 */

const link = (over: Partial<ExhibitionDocumentLinkRow> = {}): ExhibitionDocumentLinkRow =>
  ({
    id: 'l1',
    exhibition_id: 'e1',
    document_id: 'd1',
    note: '',
    active: true,
    document: null,
    ...over,
  }) as ExhibitionDocumentLinkRow

describe('el recuento y el vacío', () => {
  it('cuenta en singular y en plural', () => {
    expect(exhibitionDocumentCountText(1)).toBe('1 documento')
    expect(exhibitionDocumentCountText(3)).toBe('3 documentos')
  })

  it('un bloque vacío NO es un error, y dice dónde se suben', () => {
    // Una exposición sin documentos de archivo es lo normal, así que no puede leerse como
    // una avería; y el hueco tiene que decir qué hacer, porque el botón de subir no está
    // en esta pantalla a propósito.
    const said = exhibitionDocumentsNotice({ loading: false, error: null, count: 0 })
    expect(said).toContain('No hay ningún documento del archivo enlazado con esta exposición')
    expect(said).toContain('documentación de una obra')
    expect(said).not.toMatch(/error|fallo/i)
  })

  it('la espera y el fallo se distinguen del vacío', () => {
    expect(exhibitionDocumentsNotice({ loading: true, error: null, count: 0 })).toBe(
      'Buscando los documentos de esta exposición…',
    )
    // El mensaje de la base se enseña tal cual: es el que dice qué política negó qué.
    expect(exhibitionDocumentsNotice({ loading: false, error: 'sin permiso', count: 0 })).toContain(
      'sin permiso',
    )
  })

  it('con filas no dice nada, que las filas ya se leen solas', () => {
    expect(exhibitionDocumentsNotice({ loading: false, error: null, count: 2 })).toBeNull()
  })

  it('la espera manda sobre el vacío', () => {
    // Sin esto, el primer pintado leería «no hay ninguno» mientras la consulta está en el
    // aire, y eso es afirmar algo que todavía no se sabe.
    expect(exhibitionDocumentsNotice({ loading: true, error: null, count: 0 })).not.toContain(
      'No hay ningún documento',
    )
  })
})

describe('lo que ya está enlazado', () => {
  it('no se vuelve a ofrecer', () => {
    expect(linkedDocumentIds([link({ document_id: 'd1' }), link({ id: 'l2', document_id: 'd2' })])).toEqual(
      new Set(['d1', 'd2']),
    )
  })

  it('un vínculo retirado NO cuenta como enlazado', () => {
    // Está en la papelera, así que volver a enlazarlo es legítimo: la función del esquema
    // lo restaura en vez de chocar contra la unicidad (RF-517). Contarlo aquí dejaría el
    // documento fuera del selector para siempre.
    expect(linkedDocumentIds([link({ active: false })])).toEqual(new Set())
  })
})

describe('quitar un vínculo', () => {
  it('dice qué NO se lleva, que es la mitad que importa (RF-901)', () => {
    // «Quitar» sobre un documento que también cuelga de tres obras parece que las va a
    // tocar. El documento sigue en el archivo y sus otros vínculos siguen vivos.
    const said = retireDocumentLinkText('Nota de prensa de El País')
    expect(said).toContain('«Nota de prensa de El País»')
    expect(said).toContain('sigue en el archivo')
    expect(said).toContain('otras obras')
    expect(said).toContain('se puede devolver')
  })

  it('lo que se dice al enlazar y al quitar nombra el documento', () => {
    expect(documentLinkedNotice('Cartel')).toBe('«Cartel» ya consta como documento de esta exposición.')
    expect(documentUnlinkedNotice('Cartel')).toBe(
      '«Cartel» ya no consta en esta exposición. Sigue en el archivo.',
    )
  })
})

describe('el título con el que se nombra', () => {
  it('un documento sin título no produce unas comillas vacías', () => {
    expect(documentTitleText(null)).toBe('Documento sin título')
    expect(documentTitleText('   ')).toBe('Documento sin título')
    expect(retireDocumentLinkText(documentTitleText(''))).toContain('«Documento sin título»')
  })

  it('y uno con título se recorta pero no se toca', () => {
    expect(documentTitleText('  Díptico de la muestra  ')).toBe('Díptico de la muestra')
  })
})

describe('la frase de qué se hace aquí y qué no', () => {
  it('dice que aquí se enlaza y en la obra se sube', () => {
    // Sin ella, este bloque es una pantalla donde falta un botón, que se lee como un
    // permiso que falta.
    expect(EXHIBITION_DOCUMENTS_HINT).toContain('ya está en el archivo')
    expect(EXHIBITION_DOCUMENTS_HINT).toContain('documentación de una obra')
  })
})
