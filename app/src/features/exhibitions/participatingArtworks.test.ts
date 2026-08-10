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
   * LA REGLA QUE EVITA INVENTAR UN HUECO. Decir «sin número de catálogo registrado»
   * debajo de una muestra que consta SIN catálogo contesta una pregunta que nadie
   * ha hecho: no falta ningún número, porque no hubo catálogo del que copiarlo.
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
   * Dos cosas distintas se pueden haber retirado y significan lo contrario, así que
   * no comparten frase: la PARTICIPACIÓN retirada quiere decir que esta obra se sacó
   * de la lista de la muestra; la OBRA retirada quiere decir que la pieza está fuera
   * del catálogo mientras su participación sigue en pie.
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
   * No debería pasar —la política de `artwork_exhibitions` exige que la obra
   * exista— pero una fila que llega sin ella se DICE en vez de pintarse como una
   * línea en blanco.
   */
  it('RF-304: una obra que no se puede leer con esta sesión se declara, no se deja en blanco', () => {
    const entry = participantEntry(row({ artwork: null }), { cataloguePublished: true })
    expect(entry.title).toBe('Obra no disponible')
    expect(entry.subtitle).toContain('no se puede leer con tu sesión')
  })
})

describe('el bloque entero', () => {
  /**
   * Al contrario que el historial de una obra, que solo muestra lo que sostiene hoy.
   * Desde este lado la pregunta es otra: esta es la lista de todo lo que el catálogo
   * sabe de quién estuvo en la muestra, y una fila que faltara en silencio es cómo
   * alguien concluye que una pieza nunca estuvo allí.
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
   * EL CASO QUE IMPORTA, y es «sin revisar no es no» leído desde el otro lado: una
   * exposición sin obras del catálogo NO quiere decir que no se expusiera ninguna,
   * quiere decir que nadie las ha enlazado todavía. Imprimir «no participó ninguna
   * obra» contestaría por la tarde de archivo que nadie ha empezado.
   */
  it('sin ninguna obra explica que falta enlazarlas, y no afirma que no hubiera', () => {
    const text = participantsNotice(settled) ?? ''
    // «Todavía» es lo que separa el dato pendiente del dato investigado, y ya lo
    // dice: la frase que lo argumentaba —«no quiere decir que no se expusiera
    // ninguna»— sonaba a que la pantalla se defiende de una acusación.
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
   * Y tras un fallo se calla: el error tiene su propia línea, y «todavía no hay
   * ninguna» encima de una consulta que falló es la pantalla afirmando lo que no
   * sabe.
   */
  it('tras un fallo no afirma que no haya ninguna: eso lo diría sin saberlo', () => {
    expect(participantsNotice({ ...settled, error: 'sin red' })).toBeNull()
    expect(participantsNotice({ ...settled, error: 'sin red', loading: true })).toBeNull()
  })
})

describe('RF-505: las miniaturas que se piden', () => {
  /**
   * La misma obra puede sostener dos participaciones en una muestra —una viva y una
   * retirada— y firmar su miniatura dos veces gastaría una petición en nada.
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
