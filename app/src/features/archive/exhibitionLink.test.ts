import { describe, expect, it } from 'vitest'
import type { ExhibitionRow } from '../documentary/documentaryRows'
import {
  exhibitionLinkedNotice,
  linkedExhibitionIds,
  NO_LINKED_EXHIBITIONS_READONLY,
  NO_LINKED_EXHIBITIONS_WRITABLE,
  noExhibitionOptionsText,
  rankExhibitionLinkOptions,
  retireExhibitionLinkText,
} from './exhibitionLink'

/**
 * Enlazar un documento del archivo con una exposición (RF-516, RF-517).
 *
 * `exhibition_documents` y `document_exhibition` estaban en el esquema desde la migración
 * del archivo, con su `grant execute` y con su prueba de que restauran el vínculo
 * retirado. **No las llamaba nadie**, así que el cartel de una muestra no se podía
 * enlazar con la muestra desde ninguna pantalla.
 *
 * Lo que fijan estos tests es la frontera del selector, que es donde este proyecto ya se
 * ha equivocado antes: **la retirada y la ya enlazada NO se tratan igual**. Una
 * exposición retirada se deja fuera —ofrecerla la devolvería a circulación por la puerta
 * de atrás— y una ya enlazada se sigue listando, marcada, porque esconderla hace teclear
 * el mismo título una y otra vez.
 */

function exhibition(over: Partial<ExhibitionRow> = {}): ExhibitionRow {
  return {
    id: 'exp-1',
    title: 'Muestra de Zafra',
    exhibition_type: 'GROUP',
    venue_id: null,
    venue_note: '',
    year: 1985,
    start_date: null,
    end_date: null,
    date_note: '',
    catalogue_published: 'UNREVIEWED',
    catalogue_reference_id: null,
    note: '',
    active: true,
    venue: null,
    ...over,
  } as ExhibitionRow
}

describe('rankExhibitionLinkOptions, la frontera del selector (RF-609, RF-901)', () => {
  const catalogo = [
    exhibition({ id: 'zafra', title: 'Muestra de Zafra', year: 1985 }),
    exhibition({ id: 'badajoz', title: 'Antológica de Badajoz', year: 1991 }),
    exhibition({ id: 'retirada', title: 'Muestra duplicada', year: 2001, active: false }),
  ]

  it('las retiradas se dejan fuera, y no se marcan', () => {
    const ids = rankExhibitionLinkOptions(catalogo, '', new Set()).map((r) => r.item.id)
    expect(ids).not.toContain('retirada')
    expect(ids).toHaveLength(2)
  })

  it('las ya enlazadas se siguen listando, marcadas', () => {
    // Esconderlas hace teclear el mismo título una y otra vez preguntándose dónde se ha
    // metido. Es el criterio opuesto al de la retirada, y a propósito.
    const options = rankExhibitionLinkOptions(catalogo, '', new Set(['zafra']))
    expect(options.map((r) => r.item.id)).toContain('zafra')
    expect(options.find((r) => r.item.id === 'zafra')?.item.alreadyLinked).toBe(true)
    expect(options.find((r) => r.item.id === 'badajoz')?.item.alreadyLinked).toBe(false)
  })

  it('caza por título y por año, que es lo que la fila enseña', () => {
    expect(rankExhibitionLinkOptions(catalogo, 'badajoz', new Set()).map((r) => r.item.id)).toEqual([
      'badajoz',
    ])
    expect(rankExhibitionLinkOptions(catalogo, '1985', new Set())[0]?.item.id).toBe('zafra')
  })

  it('sin coincidencias, la lista vacía, para que la pantalla lo explique', () => {
    expect(rankExhibitionLinkOptions(catalogo, 'zzzzz', new Set())).toEqual([])
  })

  it('la opción lleva el título a secas además de la línea de la lista', () => {
    // La línea lleva el año y la sede porque ahí hacen falta para distinguir dos
    // itinerancias del mismo título. El aviso de que el vínculo entró, no: pasarle la
    // línea entera le lee «Muestra de Zafra · 1985 · Sede sin identificar», que es el
    // relleno de una lista y no el nombre de nada.
    const [option] = rankExhibitionLinkOptions([exhibition({ venue_note: '' })], '', new Set())
    expect(option?.item.title).toBe('Muestra de Zafra')
    expect(option?.item.text).toContain('1985')
    expect(option?.item.text).not.toBe(option?.item.title)
  })

  it('y una exposición sin título no deja el aviso colgando', () => {
    const [option] = rankExhibitionLinkOptions([exhibition({ title: '   ' })], '', new Set())
    expect(option?.item.title).toBe('Exposición sin título')
  })
})

describe('linkedExhibitionIds, qué cuenta como ya enlazada', () => {
  it('solo los vínculos vivos', () => {
    // Un vínculo retirado no es un vínculo, y marcarlo como «ya enlazada» esconderría la
    // única forma de recuperarlo: volver a enlazar, que es lo que hace la función de la
    // base (RF-517).
    const ids = linkedExhibitionIds([
      { exhibition_id: 'vivo', active: true },
      { exhibition_id: 'retirado', active: false },
    ])
    expect([...ids]).toEqual(['vivo'])
  })
})

describe('noExhibitionOptionsText, nunca una lista vacía (RF-304)', () => {
  it('el catálogo sin exposiciones dice dónde se dan de alta', () => {
    expect(noExhibitionOptionsText(0, 'zafra')).toContain('«Exposiciones»')
  })

  it('sin nada teclado, invita a escribir', () => {
    expect(noExhibitionOptionsText(9, '')).toContain('Escribe para buscar')
  })

  it('y sin coincidencias dice cómo dar de alta la muestra que falta', () => {
    const text = noExhibitionOptionsText(9, 'zafra')
    expect(text).toContain('Ninguna exposición coincide')
    expect(text).toContain('«Exposiciones»')
  })
})

describe('lo que se dice al enlazar y al quitar', () => {
  it('al enlazar, nombra la muestra', () => {
    expect(exhibitionLinkedNotice('Muestra de Zafra')).toBe(
      'Documento enlazado con «Muestra de Zafra».',
    )
    expect(exhibitionLinkedNotice('  ')).toBe('Documento enlazado con la exposición.')
  })

  it('al quitar, se dice lo que NO pasa, que es la mitad que importa', () => {
    const text = retireExhibitionLinkText('Muestra de Zafra')
    expect(text).toContain('«Muestra de Zafra»')
    expect(text).toContain('se queda en el archivo con su fichero')
  })
})

describe('el bloque vacío, que ya no puede decir lo de antes', () => {
  it('quien puede escribir lee que se enlaza ahí mismo', () => {
    // La frase anterior decía que no se hacía desde ninguna pantalla, y era verdad.
    // Dejarla después de construir el botón es la deriva que la tarjeta de la ficha de
    // obra ha pagado seis veces.
    expect(NO_LINKED_EXHIBITIONS_WRITABLE).toContain('enlázalo con ella aquí abajo')
    expect(NO_LINKED_EXHIBITIONS_WRITABLE).not.toContain('ninguna pantalla')
  })

  it('y quien solo consulta no lee una instrucción que no puede seguir', () => {
    expect(NO_LINKED_EXHIBITIONS_READONLY).toBe('Ninguna exposición lo tiene enlazado.')
  })
})
