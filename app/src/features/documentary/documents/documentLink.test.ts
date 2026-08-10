import { describe, expect, it } from 'vitest'
import type { DocumentLinkRow } from '../documentaryRows'
import {
  allLinkedText,
  DOCUMENT_OPTION_COLUMNS,
  documentLinkArgs,
  documentOptionFileText,
  documentOptionText,
  linkBlockedReason,
  linkedDocumentIds,
  noDocumentOptionsText,
  rankDocumentOptions,
  retireLinkConfirmText,
  TWO_ACTS_TEXT,
  type DocumentOption,
} from './documentLink'

/**
 * Linking to an artwork a document that is ALREADY in the archive (RF-516, RF-517,
 * RF-218, RF-304).
 *
 * What is verified here is the rule that holds up the whole screen: a document
 * hangs from several artworks through a bridge table and the PDF is stored ONCE, so
 * linking and uploading are two different acts and the finder has to push towards the
 * first. A finder that hides what is already linked is a finder that invites
 * uploading the same scan a second time.
 */

function option(over: Partial<DocumentOption> = {}): DocumentOption {
  return {
    id: 'doc-1',
    archive_code: 'AR-ARCH-0001',
    title: 'Carta de la galería',
    start_year: 1985,
    end_year: null,
    approximate_date: false,
    unconfirmed_date: false,
    date_note: '',
    date_text: '1985',
    file_path: 'archivo/ar-arch-0001_k3m9p2qz.pdf',
    file_size_bytes: 3_355_443,
    mime_type: 'application/pdf',
    active: true,
    document_type: { id: 'type-1', name: 'Carta', active: true },
    ...over,
  }
}

function link(over: Partial<DocumentLinkRow> = {}): DocumentLinkRow {
  return {
    id: 'link-1',
    catalog_id: 'AR-0001',
    document_id: 'doc-1',
    note: '',
    active: true,
    document: null,
    ...over,
  }
}

describe('las columnas que pide el buscador', () => {
  /**
   * A TypeScript type does not exist at run time: whatever the query forgets
   * arrives as `undefined` with the type promising a value, which is the failure a photograph's
   * corners already cost once in this project.
   */
  it('la lista de columnas cubre todo lo que `DocumentOption` promete', () => {
    const keys = Object.keys(option()).filter((key) => key !== 'document_type')
    for (const key of keys) {
      expect(DOCUMENT_OPTION_COLUMNS).toContain(key)
    }
    expect(DOCUMENT_OPTION_COLUMNS).toContain('document_type:document_types(')
  })

  /** Narrower than the block's on purpose: a finder identifies, it does not paint. */
  it('no arrastra las notas, la serie ni el lugar del papel', () => {
    // `note` as a standalone column, which is the document's: `date_note` does travel,
    // because it is the date in words and it is what gets printed (ADR-004).
    expect(DOCUMENT_OPTION_COLUMNS).not.toMatch(/(^|[ ,])note([ ,)]|$)/)
    expect(DOCUMENT_OPTION_COLUMNS).not.toContain('archive_series')
    expect(DOCUMENT_OPTION_COLUMNS).not.toContain('physical_place_id')
  })
})

describe('lo que se lee de un documento en el buscador, que es lo que se busca', () => {
  it('la signatura primero, y con ella el tipo y la fecha', () => {
    expect(documentOptionText(option())).toBe('AR-ARCH-0001 · Carta de la galería · Carta · 1985')
  })

  it('sin signatura no deja un separador huérfano', () => {
    expect(documentOptionText(option({ archive_code: null }))).toBe(
      'Carta de la galería · Carta · 1985',
    )
  })

  it('sin tipo y sin fecha sigue diciendo algo (RF-304)', () => {
    expect(
      documentOptionText(
        option({ archive_code: null, document_type: null, date_text: '', start_year: null }),
      ),
    ).toBe('Carta de la galería · Tipo sin clasificar · Sin fecha')
  })

  /**
   * Whether there is a scan or not is the datum that decides whether linking is enough or whether one has to go
   * and fetch the paper, so it goes in the row and not one tap further in. There is no
   * «digitised» column: it is the path (RF-408).
   */
  it('dice si está digitalizado y cuánto pesa', () => {
    expect(documentOptionFileText(option())).toBe('Digitalizado · 3,2 MB')
    expect(documentOptionFileText(option({ file_size_bytes: null }))).toBe('Digitalizado')
    expect(documentOptionFileText(option({ file_path: null }))).toBe('Sin digitalizar')
    expect(documentOptionFileText(option({ file_path: '   ' }))).toBe('Sin digitalizar')
  })
})

describe('a quién se ofrece y a quién no', () => {
  const archive = [
    option(),
    option({ id: 'doc-2', archive_code: 'AR-ARCH-0002', title: 'Recorte de prensa' }),
    option({ id: 'doc-3', archive_code: 'AR-ARCH-0003', title: 'Cartel de la muestra', active: false }),
  ]

  /**
   * A withdrawn document is NOT offered: this is a list for choosing, and offering something
   * the archive has withdrawn would be putting it back into use through the back door. It is the
   * opposite rule to the record's, which does show the name of what is withdrawn.
   */
  it('los documentos retirados no se ofrecen', () => {
    const choices = rankDocumentOptions(archive, '', new Set())
    expect(choices.map((choice) => choice.option.id)).toEqual(['doc-1', 'doc-2'])
  })

  /**
   * **The decision that avoids duplicating the PDF.** What is already linked is visible,
   * marked and not selectable: hiding it would leave the finder looking as if the
   * document were not in the archive, and from there it gets uploaded again.
   */
  it('lo que ya está enlazado se LISTA, marcado, y no se puede elegir dos veces', () => {
    const choices = rankDocumentOptions(archive, '', new Set(['doc-1']))
    expect(choices).toHaveLength(2)
    const already = choices.find((choice) => choice.option.id === 'doc-1')
    expect(already?.alreadyLinked).toBe(true)
    expect(already?.fileText).toBe('Ya está enlazado con esta obra')
    expect(choices.find((choice) => choice.option.id === 'doc-2')?.alreadyLinked).toBe(false)
  })

  it('la búsqueda va sobre lo que se ve, sin tildes ni mayúsculas, y con letras separadas', () => {
    expect(rankDocumentOptions(archive, 'recorte', new Set()).map((c) => c.option.id)).toEqual([
      'doc-2',
    ])
    expect(rankDocumentOptions(archive, '0002', new Set()).map((c) => c.option.id)).toEqual(['doc-2'])
    expect(rankDocumentOptions(archive, 'galeria', new Set()).map((c) => c.option.id)).toEqual([
      'doc-1',
    ])
  })

  it('las letras que han coincidido se señalan, o la opción parece arbitraria', () => {
    const choice = rankDocumentOptions(archive, 'carta', new Set())[0]
    expect(choice?.indices.length).toBeGreaterThan(0)
    expect(choice?.text).toBe(documentOptionText(option()))
  })

  /** Withdrawn links count: `document_artwork` restores them, it does not duplicate them. */
  it('se considera enlazado también lo que está en la papelera', () => {
    const ids = linkedDocumentIds([link(), link({ id: 'link-2', document_id: 'doc-2', active: false })])
    expect(ids).toEqual(new Set(['doc-1', 'doc-2']))
  })
})

describe('nunca una lista vacía sin explicación (RF-304)', () => {
  /**
   * The two cases are different and confusing them costs an afternoon: the archive is
   * empty, or it has documents and none matches. Both have to point at the OTHER
   * button, or the cataloguer concludes that the finder is broken.
   */
  it('el archivo vacío manda a subir, y lo nombra igual que el botón', () => {
    const said = noDocumentOptionsText(0, '')
    expect(said).toContain('todavía no tiene ningún documento')
    expect(said).toContain('Subir un documento del archivo')
  })

  it('ninguna coincidencia repite lo que se escribió y también manda a subir', () => {
    const said = noDocumentOptionsText(12, '  cartel  ')
    expect(said).toContain('«cartel»')
    expect(said).toContain('Subir un documento del archivo')
  })

  it('sin nada escrito no se cita una búsqueda que no se ha hecho', () => {
    expect(noDocumentOptionsText(12, '   ')).toContain('coincide.')
    expect(noDocumentOptionsText(12, '   ')).not.toContain('coincide con')
  })

  it('cuando todo lo que coincide ya está enlazado, se dice en vez de dejar la lista muerta', () => {
    const choices = rankDocumentOptions([option()], '', new Set(['doc-1']))
    expect(allLinkedText(choices)).toContain('ya enlazados con esta obra')
    // With something selectable nothing is said: it would be noise over a list that works.
    expect(allLinkedText(rankDocumentOptions([option()], '', new Set()))).toBeNull()
    // And with the list empty, nothing either: `noDocumentOptionsText` tells that.
    expect(allLinkedText([])).toBeNull()
  })
})

describe('lo que viaja a `document_artwork` (RF-516, RF-517)', () => {
  it('los tres argumentos, con la nota recortada', () => {
    expect(documentLinkArgs('AR-0001', 'doc-1', '  reproducida en la página 3  ')).toEqual({
      p_catalog_id: 'AR-0001',
      p_document_id: 'doc-1',
      p_note: 'reproducida en la página 3',
    })
  })

  /**
   * An empty note travels empty on purpose: the function keeps whatever was already there
   * when what arrives is blank —«what is not sent is not erased»— and this way
   * linking again from a form that opens clean cannot empty the sentence
   * somebody researched.
   */
  it('una nota en blanco viaja en blanco, que es «no toques la que hay»', () => {
    expect(documentLinkArgs('AR-0001', 'doc-1', '   ').p_note).toBe('')
  })
})

describe('«sin revisar» no es «no», y aquí manda al revés (RF-218)', () => {
  /**
   * `tg_artwork_document_status_coherent` rejects it and says so in Spanish —measured
   * against the base—, and that sentence is shown as is when it arrives. But a control that
   * is going to be rejected has to say so BEFORE being pressed: she is on her feet.
   */
  it('con la documentación «investigada sin resultado» se avisa antes de tocar', () => {
    const said = linkBlockedReason('NONE_FOUND')
    expect(said).toContain('Investigado, sin resultados')
    expect(said).toContain('Investigación en curso')
  })

  it('en cualquier otro estado no estorba, «sin revisar» incluido', () => {
    expect(linkBlockedReason('UNREVIEWED')).toBeNull()
    expect(linkBlockedReason('IN_PROGRESS')).toBeNull()
    expect(linkBlockedReason('COMPLETE')).toBeNull()
    // And without knowing the state nothing is blocked either: not knowing is not a no.
    expect(linkBlockedReason(null)).toBeNull()
  })
})

describe('quitar un documento de la ficha dice lo que NO pasa (RF-517, RF-901)', () => {
  /**
   * It is this piece's whole warning: the document stays in the archive, with its
   * file, and the other artworks keep seeing it. A cataloguer who believes she is going to
   * destroy a scanned file will leave the wrong link in the catalogue.
   */
  it('el documento sigue en el archivo y el fichero no se toca', () => {
    const said = retireLinkConfirmText({ title: 'Carta de la galería', file: { bytes: 3_355_443 } })
    expect(said).toContain('«Carta de la galería»')
    expect(said).toContain('sigue en el archivo')
    expect(said).toContain('las demás obras y exposiciones')
    expect(said).toContain('no se borran nunca')
    expect(said).toContain('se puede volver a añadir')
  })

  it('sin fichero no se promete nada sobre ningún fichero', () => {
    const said = retireLinkConfirmText({ title: 'Carta', file: null })
    expect(said).not.toContain('fichero')
    expect(said).toContain('sigue en el archivo')
  })

  it('sin título no deja unas comillas vacías', () => {
    expect(retireLinkConfirmText({ title: '   ', file: null })).toMatch(/^este documento/)
  })
})

describe('por qué hay dos botones, dicho una vez', () => {
  /**
   * Without this sentence the two buttons look like the long way and the short way to the same thing, and
   * the top one gets pressed: for a clipping's second artwork that means two copies of the
   * PDF in the store and two records to reconcile by hand.
   */
  it('dice que un documento se guarda una vez y cuelga de varias obras', () => {
    expect(TWO_ACTS_TEXT).toContain('varias obras')
    expect(TWO_ACTS_TEXT).toContain('una sola vez')
    expect(TWO_ACTS_TEXT).toContain('todavía no está en el archivo')
  })
})
