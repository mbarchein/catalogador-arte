import { describe, expect, it } from 'vitest'
import {
  activeParticipantCount,
  participantCountText,
  participantEntries,
  participantEntry,
  participantsNotice,
  PARTICIPANT_COLUMNS,
  sortParticipants,
  thumbnailCatalogIds,
  type ParticipantRow,
} from './participatingArtworks'

/**
 * «Obras participantes»: which artworks of the catalogue are recorded in this exhibition
 * (RF-505, RF-513, RF-304).
 *
 * The block only READS, and that is not a shortcoming of the delivery: a participation is
 * a fact about an ARTWORK and is added from its record, where the research
 * state that has to be kept coherent is. Here what decides is checked:
 * the block's order, what each row says and what is said when there is none.
 */

function row(over: Partial<ParticipantRow> = {}): ParticipantRow {
  return {
    id: 'ae-1',
    catalog_id: 'AR-0001',
    exhibition_id: 'ex-1',
    catalogue_number: '12',
    note: '',
    active: true,
    artwork: {
      catalog_id: 'AR-0001',
      title: 'Paisaje de Zafra',
      artist: 'ROTILI',
      execution_date: '1985',
      active: true,
    },
    ...over,
  }
}

describe('lo que se le pide a la base', () => {
  /** RF-105: a third party's contact is not asked for where it is not needed. */
  it('RF-105: la consulta del bloque no pide ningún dato de contacto', () => {
    expect(PARTICIPANT_COLUMNS).not.toContain('contact')
  })

  /** The block links to the record by its code, which is its only door (RF-604). */
  it('pide el código de la obra, que es lo único que enlaza con su ficha', () => {
    expect(PARTICIPANT_COLUMNS).toContain('catalog_id')
    expect(PARTICIPANT_COLUMNS).toContain('artwork:artworks(')
  })
})

describe('RF-513: el bloque se ordena por el número del catálogo de la muestra', () => {
  /**
   * THE ASSERTION THAT JUSTIFIES THE FUNCTION. Compared as text, «12 bis» goes before
   * «2» and the block stops reading like the catalogue the cataloguer has
   * open on the table. They are compared first as numbers.
   */
  it('«2» va antes que «12 bis», que es lo que la comparación de texto rompe', () => {
    const ordered = sortParticipants([
      row({ id: 'a', catalog_id: 'AR-0001', catalogue_number: '12 bis' }),
      row({ id: 'b', catalog_id: 'AR-0002', catalogue_number: '2' }),
      row({ id: 'c', catalog_id: 'AR-0003', catalogue_number: '13' }),
    ])
    expect(ordered.map((item) => item.catalogue_number)).toEqual(['2', '12 bis', '13'])
  })

  it('el mismo número con sufijo va detrás del número desnudo: 12, 12 bis, 13', () => {
    const ordered = sortParticipants([
      row({ id: 'a', catalog_id: 'AR-0001', catalogue_number: '13' }),
      row({ id: 'b', catalog_id: 'AR-0002', catalogue_number: '12 bis' }),
      row({ id: 'c', catalog_id: 'AR-0003', catalogue_number: '12' }),
    ])
    expect(ordered.map((item) => item.catalogue_number)).toEqual(['12', '12 bis', '13'])
  })

  /**
   * An empty number is a datum nobody has copied yet. Ordering it first
   * would make it look like the show's piece number one.
   */
  it('las que no tienen número van al final y no al principio', () => {
    const ordered = sortParticipants([
      row({ id: 'sin', catalog_id: 'AR-0009', catalogue_number: '' }),
      row({ id: 'con', catalog_id: 'AR-0001', catalogue_number: '7' }),
    ])
    expect(ordered.map((item) => item.id)).toEqual(['con', 'sin'])
  })

  /** «s/n» is a transcription, not a number, and it also goes last. */
  it('un «s/n» tampoco se cuela entre los numerados', () => {
    const ordered = sortParticipants([
      row({ id: 'sn', catalog_id: 'AR-0009', catalogue_number: 's/n' }),
      row({ id: 'uno', catalog_id: 'AR-0001', catalogue_number: '1' }),
    ])
    expect(ordered.map((item) => item.id)).toEqual(['uno', 'sn'])
  })

  it('sin número el empate lo rompe el código de la obra, así que el orden es estable', () => {
    const ordered = sortParticipants([
      row({ id: 'b', catalog_id: 'AR-0022', catalogue_number: '' }),
      row({ id: 'a', catalog_id: 'AR-0003', catalogue_number: '' }),
    ])
    expect(ordered.map((item) => item.catalog_id)).toEqual(['AR-0003', 'AR-0022'])
  })

  it('no toca el array que recibe', () => {
    const rows = [
      row({ id: 'a', catalogue_number: '9' }),
      row({ id: 'b', catalog_id: 'AR-0002', catalogue_number: '1' }),
    ]
    sortParticipants(rows)
    expect(rows.map((item) => item.id)).toEqual(['a', 'b'])
  })
})

describe('RF-505: lo que dice cada fila', () => {
  it('nombra la obra, su autor y su fecha, y su número en la muestra', () => {
    const entry = participantEntry(row(), { cataloguePublished: true })
    expect(entry.catalogId).toBe('AR-0001')
    expect(entry.title).toBe('Paisaje de Zafra')
    expect(entry.subtitle).toBe('Alberto Rotili · 1985')
    expect(entry.catalogueNumber).toBe('Nº 12 en el catálogo')
    expect(entry.retirementNotice).toBeNull()
  })

  /** Never a gap: an artwork with no title says so. */
  it('RF-304: una obra sin título no deja la línea en blanco', () => {
    const entry = participantEntry(
      row({ artwork: { ...row().artwork!, title: '' } }),
      { cataloguePublished: true },
    )
    expect(entry.title).not.toBe('')
  })

  /**
   * THE RULE THAT AVOIDS INVENTING A GAP. Saying «sin número de catálogo registrado»
   * under a show recorded as having NO catalogue answers a question nobody
   * has asked: no number is missing, because there was no catalogue to copy it from.
   */
  it('sin número y sin catálogo publicado, no dice nada: no falta ningún dato', () => {
    const entry = participantEntry(row({ catalogue_number: '' }), { cataloguePublished: false })
    expect(entry.catalogueNumber).toBeNull()
  })

  it('sin número pero con catálogo publicado, sí declara que falta', () => {
    const entry = participantEntry(row({ catalogue_number: '' }), { cataloguePublished: true })
    expect(entry.catalogueNumber).toBe('Sin número de catálogo registrado')
  })

  /**
   * Two different things may have been withdrawn and they mean the opposite, so
   * they do not share a sentence: the withdrawn PARTICIPATION means this artwork was taken
   * off the show's list; the withdrawn ARTWORK means the piece is out
   * of the catalogue while its participation still stands.
   */
  it('una participación retirada lo dice, y dice dónde se recupera', () => {
    const entry = participantEntry(row({ active: false }), { cataloguePublished: true })
    expect(entry.retirementNotice).toContain('participación está retirada')
    expect(entry.retirementNotice).toContain('ficha de la obra')
  })

  it('una obra retirada con la participación viva dice lo contrario, y no lo mismo', () => {
    const entry = participantEntry(
      row({ artwork: { ...row().artwork!, active: false } }),
      { cataloguePublished: true },
    )
    expect(entry.retirementNotice).toContain('obra está retirada del catálogo')
    expect(entry.retirementNotice).not.toContain('participación está retirada')
  })

  /** Two warnings in one row of a phone is one too many: the row's wins. */
  it('retiradas las dos, gana el aviso de la participación, que es de lo que va la fila', () => {
    const entry = participantEntry(
      row({ active: false, artwork: { ...row().artwork!, active: false } }),
      { cataloguePublished: true },
    )
    expect(entry.retirementNotice).toContain('participación está retirada')
  })

  /**
   * It should not happen —`artwork_exhibitions`' policy requires the artwork
   * to exist— but a row arriving without it is SAID instead of being painted as a
   * blank line.
   */
  it('RF-304: una obra que no se puede leer con esta sesión se declara, no se deja en blanco', () => {
    const entry = participantEntry(row({ artwork: null }), { cataloguePublished: true })
    expect(entry.title).toBe('Obra no disponible')
    expect(entry.subtitle).toContain('no se puede leer con tu sesión')
  })
})

describe('el bloque entero', () => {
  /**
   * Unlike an artwork's history, which only shows what holds up today.
   * From this side the question is another: this is the list of everything the catalogue
   * knows about who was in the show, and a row missing in silence is how
   * somebody concludes that a piece was never there.
   */
  it('las participaciones retiradas NO se caen del bloque, se muestran y se explican', () => {
    const entries = participantEntries(
      [
        row({ id: 'viva', catalog_id: 'AR-0001', catalogue_number: '1' }),
        row({ id: 'retirada', catalog_id: 'AR-0002', catalogue_number: '2', active: false }),
      ],
      { cataloguePublished: true },
    )
    expect(entries.map((entry) => entry.id)).toEqual(['viva', 'retirada'])
    expect(entries[1]?.retirementNotice).not.toBeNull()
  })

  /** The count is of the live ones: it is how many artworks hold up the show today. */
  it('el recuento cuenta solo las participaciones vivas', () => {
    const rows = [row({ id: 'a' }), row({ id: 'b', active: false })]
    expect(activeParticipantCount(rows)).toBe(1)
    expect(activeParticipantCount([])).toBe(0)
  })

  it('el recuento se dice en singular y en plural, y nunca como un cero pelado', () => {
    expect(participantCountText(1)).toBe('1 obra')
    expect(participantCountText(3)).toBe('3 obras')
    expect(participantCountText(0)).toBe('0 obras')
  })
})

describe('RF-304: nunca un hueco donde iban las obras', () => {
  const settled = { loading: false, error: null, count: 0 }

  /**
   * THE CASE THAT MATTERS, and it is «sin revisar is not no» read from the other side: an
   * exhibition with no catalogue artworks does NOT mean that none was exhibited,
   * it means nobody has linked them yet. Printing «no participó ninguna
   * obra» would answer for the afternoon in the archive nobody has started.
   */
  it('sin ninguna obra explica que falta enlazarlas, y no afirma que no hubiera', () => {
    const text = participantsNotice(settled) ?? ''
    // «Todavía» is what separates the pending datum from the researched datum, and it already
    // says it: the sentence that argued it —«no quiere decir que no se expusiera
    // ninguna»— sounded as if the screen were defending itself against an accusation.
    expect(text).toContain('todavía')
    expect(text).toContain('historial expositivo')
  })

  it('con obras no dice nada donde van las obras', () => {
    expect(participantsNotice({ ...settled, count: 2 })).toBeNull()
  })

  it('mientras carga lo dice, en vez de afirmar que el catálogo está vacío', () => {
    expect(participantsNotice({ ...settled, loading: true })).toContain('Cargando')
  })

  /**
   * And after a failure it keeps quiet: the error has its own line, and «todavía no hay
   * ninguna» over a query that failed is the screen stating what it does not
   * know.
   */
  it('tras un fallo no afirma que no haya ninguna: eso lo diría sin saberlo', () => {
    expect(participantsNotice({ ...settled, error: 'sin red' })).toBeNull()
    expect(participantsNotice({ ...settled, error: 'sin red', loading: true })).toBeNull()
  })
})

describe('RF-505: las miniaturas que se piden', () => {
  /**
   * The same artwork can hold two participations in one show —one live and one
   * withdrawn— and signing its thumbnail twice would spend a request on nothing.
   */
  it('no repite una obra que sostiene dos participaciones de la misma muestra', () => {
    expect(
      thumbnailCatalogIds([
        row({ id: 'a', catalog_id: 'AR-0001' }),
        row({ id: 'b', catalog_id: 'AR-0001', active: false }),
        row({ id: 'c', catalog_id: 'AR-0002' }),
      ]),
    ).toEqual(['AR-0001', 'AR-0002'])
  })

  /** With no rows, no request: a show with no artworks sends nothing to be signed. */
  it('sin filas no pide firmar nada', () => {
    expect(thumbnailCatalogIds([])).toEqual([])
  })
})
