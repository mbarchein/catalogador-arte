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
 * Linking an archive document to an exhibition (RF-516, RF-517).
 *
 * `exhibition_documents` and `document_exhibition` had been in the schema since the archive's
 * migration, with their `grant execute` and with their proof that they restore the withdrawn
 * link. **Nobody called them**, so a show's poster could not be
 * linked to the show from any screen.
 *
 * What these tests pin down is the selector's boundary, which is where this project has already
 * got it wrong before: **the withdrawn one and the already linked one are NOT treated the same**. A
 * withdrawn exhibition is left out —offering it would bring it back into circulation through the back
 * door— and an already linked one is still listed, marked, because hiding it makes people type
 * the same title over and over.
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
    // Hiding them makes the same title get typed over and over while wondering where it
    // went. It is the opposite criterion to the retired one, and deliberately so.
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
    // The line carries the year and the venue because there they are needed to tell two
    // tourings of the same title apart. The warning that the link went in, no: passing it the
    // whole line reads out «Muestra de Zafra · 1985 · Sede sin identificar», which is
    // a list's padding and not the name of anything.
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
    // A withdrawn link is not a link, and marking it as «already linked» would hide the
    // only way of recovering it: linking again, which is what the base's function
    // does (RF-517).
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
    // The previous sentence said it was not done from any screen, and it was true.
    // Leaving it there after building the button is the drift the artwork record's
    // card has paid for six times.
    expect(NO_LINKED_EXHIBITIONS_WRITABLE).toContain('enlázalo con ella aquí abajo')
    expect(NO_LINKED_EXHIBITIONS_WRITABLE).not.toContain('ninguna pantalla')
  })

  it('y quien solo consulta no lee una instrucción que no puede seguir', () => {
    expect(NO_LINKED_EXHIBITIONS_READONLY).toBe('Ninguna exposición lo tiene enlazado.')
  })
})
