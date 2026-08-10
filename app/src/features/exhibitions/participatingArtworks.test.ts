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
 * «Obras participantes»: qué obras del catálogo constan en esta exposición
 * (RF-505, RF-513, RF-304).
 *
 * El bloque solo LEE, y eso no es una carencia de la entrega: una participación es
 * un hecho sobre una OBRA y se añade desde su ficha, donde está el estado de
 * investigación que hay que mantener coherente. Aquí se comprueba lo que decide:
 * el orden del bloque, lo que dice cada fila y qué se dice cuando no hay ninguna.
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
  /** RF-105: el contacto de un tercero no se pide donde no hace falta. */
  it('RF-105: la consulta del bloque no pide ningún dato de contacto', () => {
    expect(PARTICIPANT_COLUMNS).not.toContain('contact')
  })

  /** El bloque enlaza a la ficha por el código, que es su única puerta (RF-604). */
  it('pide el código de la obra, que es lo único que enlaza con su ficha', () => {
    expect(PARTICIPANT_COLUMNS).toContain('catalog_id')
    expect(PARTICIPANT_COLUMNS).toContain('artwork:artworks(')
  })
})

describe('RF-513: el bloque se ordena por el número del catálogo de la muestra', () => {
  /**
   * EL ASERTO QUE JUSTIFICA LA FUNCIÓN. Comparados como texto, «12 bis» va delante
   * de «2» y el bloque deja de leerse como el catálogo que la catalogadora tiene
   * abierto encima de la mesa. Se comparan primero como número.
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
   * Un número vacío es un dato que nadie ha copiado todavía. Ordenarlo al principio
   * lo haría parecer la pieza número uno de la muestra.
   */
  it('las que no tienen número van al final y no al principio', () => {
    const ordered = sortParticipants([
      row({ id: 'sin', catalog_id: 'AR-0009', catalogue_number: '' }),
      row({ id: 'con', catalog_id: 'AR-0001', catalogue_number: '7' }),
    ])
    expect(ordered.map((item) => item.id)).toEqual(['con', 'sin'])
  })

  /** «s/n» es una transcripción, no un número, y también va al final. */
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

  /** Nunca un hueco: una obra sin título lo dice. */
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

  /** Dos avisos en una fila de un móvil es uno de más: gana el de la fila. */
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

  /** El recuento sí es de las vivas: es cuántas obras sostienen la muestra hoy. */
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

  /** Sin filas, ninguna petición: una muestra sin obras no manda firmar nada. */
  it('sin filas no pide firmar nada', () => {
    expect(thumbnailCatalogIds([])).toEqual([])
  })
})
