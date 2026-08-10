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
 * RF-516, RF-517: the archive documents that speak of an exhibition.
 *
 * The link was in the schema and was created from the document's record; what was missing
 * was for the exhibition to show it. Here what is read is pinned down, which is where this block
 * can go wrong unnoticed: an emptiness counted as an error, a «quitar» that seems to
 * take the document away, or a sentence naming «esta obra» in a show's record.
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
    // An exhibition with no archive documents is the norm, so it cannot read as
    // a breakdown; and the gap has to say what to do, because the upload button is not
    // on this screen on purpose.
    const said = exhibitionDocumentsNotice({ loading: false, error: null, count: 0 })
    expect(said).toContain('No hay ningún documento enlazado')
    expect(said).toContain('documentación de una obra')
    expect(said).not.toMatch(/error|fallo/i)
  })

  it('la espera y el fallo se distinguen del vacío', () => {
    expect(exhibitionDocumentsNotice({ loading: true, error: null, count: 0 })).toBe(
      'Buscando los documentos de esta exposición…',
    )
    // The base's message is shown as is: it is the one saying which policy denied what.
    expect(exhibitionDocumentsNotice({ loading: false, error: 'sin permiso', count: 0 })).toContain(
      'sin permiso',
    )
  })

  it('con filas no dice nada, que las filas ya se leen solas', () => {
    expect(exhibitionDocumentsNotice({ loading: false, error: null, count: 2 })).toBeNull()
  })

  it('la espera manda sobre el vacío', () => {
    // Without this, the first paint would read «there is none» while the query is in the
    // air, and that is stating something not yet known.
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
    // It is in the wastebasket, so linking it again is legitimate: the schema's function
    // restores it instead of clashing against uniqueness (RF-517). Counting it here would leave the
    // document out of the selector forever.
    expect(linkedDocumentIds([link({ active: false })])).toEqual(new Set())
  })
})

describe('quitar un vínculo', () => {
  it('dice qué NO se lleva, que es la mitad que importa (RF-901)', () => {
    // «Quitar» on a document that also hangs from three artworks looks like it is going to
    // touch them. The document stays in the archive and its other links stay alive.
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
    // Without it, this block is a screen where a button is missing, which reads as a
    // missing permission.
    expect(EXHIBITION_DOCUMENTS_HINT).toContain('ya está en el archivo')
    expect(EXHIBITION_DOCUMENTS_HINT).toContain('documentación de una obra')
  })
})
