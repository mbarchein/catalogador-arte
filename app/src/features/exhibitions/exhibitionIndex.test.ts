import { describe, expect, it } from 'vitest'
import type { ExhibitionRow, VenueRow } from '../documentary/documentaryRows'
import { EXHIBITION_OPTION_COLUMNS } from '../documentary/exhibitions/participationEdits'
import {
  EXHIBITION_COLUMNS,
  exhibitionSearchText,
  rankExhibitions,
  retiredCount,
  similarExhibitions,
  similarTitleNotice,
  sortExhibitions,
} from './exhibitionIndex'

/**
 * The exhibition listing: what is asked for, in what order it is read, what the
 * search catches and what each row says (RF-502, RF-606, RF-609, RF-909).
 *
 * The suite runs in node and opens no JSX, so a list's order and
 * a row's words are verified here or they are not verified anywhere.
 * `ExhibitionsPage` decides nothing: it paints what these functions return.
 */

function venue(over: Partial<VenueRow> = {}): VenueRow {
  return {
    id: 'v-1',
    name: 'Museo de Bellas Artes',
    locality: 'Badajoz',
    country: 'España',
    party_id: null,
    note: '',
    active: true,
    party: null,
    ...over,
  }
}

function row(over: Partial<ExhibitionRow> = {}): ExhibitionRow {
  return {
    id: 'ex-1',
    title: 'Rotili. Obra reciente',
    exhibition_type: 'INDIVIDUAL',
    venue_id: 'v-1',
    venue_note: '',
    year: 1985,
    start_date: '1985-03-12',
    end_date: '1985-05-04',
    date_note: '',
    catalogue_published: 'YES',
    catalogue_reference_id: null,
    note: '',
    active: true,
    venue: venue(),
    ...over,
  }
}

describe('lo que se le pide a la base', () => {
  /**
   * Copying a column list is the failure a photograph's corners
   * already cost once: a field the query forgets arrives as
   * `undefined` while the type promises a value. This assertion is the one that prevents
   * the two lists from drifting apart.
   */
  it('el listado pide exactamente las columnas del selector de la ficha, sin una segunda copia', () => {
    expect(EXHIBITION_COLUMNS).toBe(EXHIBITION_OPTION_COLUMNS)
  })

  /** RF-105: a third party's contact is not asked for where it is not needed. */
  it('RF-105: no pide el contacto de la institución que hay detrás de la sede', () => {
    expect(EXHIBITION_COLUMNS).not.toContain('contact')
  })

  /**
   * The search catches what the row shows. A list that responds to a text it
   * does not show looks arbitrary.
   */
  it('RF-606: la búsqueda caza el título, el año y la sede, que es lo que se ve', () => {
    const text = exhibitionSearchText(row())
    expect(text).toContain('Rotili. Obra reciente')
    expect(text).toContain('1985')
    expect(text).toContain('Museo de Bellas Artes')
  })
})

describe('RF-502: el orden del listado es el más reciente primero', () => {
  /**
   * The other way round from an artwork's history, and both things are true at once: an
   * artwork's history reads like a career and goes up through the years; a listing
   * is opened to FIND the show whose catalogue is on the table, and that
   * one is far more likely to be from this decade than from 1978.
   */
  it('ordena por la fecha de apertura, descendente', () => {
    const ordered = sortExhibitions([
      row({ id: 'a', year: 1978, start_date: '1978-04-01' }),
      row({ id: 'b', year: 2019, start_date: '2019-10-05' }),
      row({ id: 'c', year: 1995, start_date: '1995-01-20' }),
    ])
    expect(ordered.map((item) => item.id)).toEqual(['b', 'c', 'a'])
  })

  /** A bare year sorts as its 1 January, exactly as the base indexes it. */
  it('un año sin fecha de apertura se ordena como su 1 de enero', () => {
    const ordered = sortExhibitions([
      row({ id: 'enero', year: 1985, start_date: '1985-01-05' }),
      row({ id: 'desnudo', year: 1985, start_date: null }),
      row({ id: 'marzo', year: 1985, start_date: '1985-03-12' }),
    ])
    expect(ordered.map((item) => item.id)).toEqual(['marzo', 'enero', 'desnudo'])
  })

  /**
   * THE ROW THAT CANNOT HEAD THE LISTING. `exhibitions_dated` forbids an
   * exhibition with no date at all, but if one arrived anyway, an empty key would
   * put it in first place and it would read as the catalogue's most recent
   * show. It goes last.
   */
  it('una exposición sin ninguna fecha va al final y no al principio', () => {
    const ordered = sortExhibitions([
      row({ id: 'sin-fecha', year: null, start_date: null }),
      row({ id: 'antigua', year: 1978, start_date: '1978-04-01' }),
    ])
    expect(ordered.map((item) => item.id)).toEqual(['antigua', 'sin-fecha'])
  })

  /** Two loads of the same screen cannot swap two rows. */
  it('el empate se rompe por título y luego por identificador, así que el orden es estable', () => {
    const same = { year: 1985, start_date: '1985-03-12' }
    const ordered = sortExhibitions([
      row({ id: 'z', title: 'Zafra', ...same }),
      row({ id: 'b', title: 'Antológica', ...same }),
      row({ id: 'a', title: 'Antológica', ...same }),
    ])
    expect(ordered.map((item) => item.id)).toEqual(['a', 'b', 'z'])
  })

  /** Sorting cannot modify what it is given: the list comes from a `useState`. */
  it('no toca el array que recibe', () => {
    const rows = [row({ id: 'a', year: 1978 }), row({ id: 'b', year: 2019 })]
    sortExhibitions(rows)
    expect(rows.map((item) => item.id)).toEqual(['a', 'b'])
  })
})

describe('RF-609: las retiradas no están en el listado salvo que se pidan', () => {
  const rows = [
    row({ id: 'viva', title: 'Viva', year: 1985, start_date: '1985-03-12' }),
    row({ id: 'retirada', title: 'Retirada', year: 1990, start_date: '1990-03-12', active: false }),
  ]

  it('por omisión solo salen las activas', () => {
    expect(rankExhibitions(rows, '').map((entry) => entry.row.id)).toEqual(['viva'])
  })

  /**
   * And they can be asked for, because always hiding them hides the only way out: the
   * listing is the only place from which a withdrawn exhibition is reached
   * in order to recover it.
   */
  it('pidiéndolas salen, y la fila lo DICE en vez de solo pintarse en gris', () => {
    const entries = rankExhibitions(rows, '', { includeRetired: true })
    expect(entries.map((entry) => entry.row.id)).toEqual(['retirada', 'viva'])
    expect(entries[0]?.retired).toBe(true)
    expect(entries[1]?.retired).toBe(false)
  })

  it('cuenta las retiradas para que el interruptor diga cuántas hay antes de pulsarlo', () => {
    expect(retiredCount(rows)).toBe(1)
    expect(retiredCount([])).toBe(0)
  })
})

describe('cada fila del listado, y ni un hueco (RF-304, RF-502)', () => {
  it('dice fechas, título, sede y carácter', () => {
    const entry = rankExhibitions([row()], '')[0]
    expect(entry?.title).toBe('Rotili. Obra reciente')
    expect(entry?.dates).not.toBe('')
    expect(entry?.venue).toContain('Museo de Bellas Artes')
    expect(entry?.kind).toBe('Individual')
    expect(entry?.kindPending).toBe(false)
  })

  /** «Sin revisar» is not «no»: the pending character is marked as a warning. */
  it('RF-218: el carácter sin revisar se declara y se marca como pendiente', () => {
    const entry = rankExhibitions([row({ exhibition_type: 'UNREVIEWED' })], '')[0]
    expect(entry?.kind).toBe('Sin revisar si fue individual o colectiva')
    expect(entry?.kindPending).toBe(true)
  })

  /** Never a gap where a date went. */
  it('sin ninguna fecha la fila dice «Sin fechar» y no deja el sitio vacío', () => {
    const entry = rankExhibitions([row({ year: null, start_date: null, end_date: null })], '')[0]
    expect(entry?.dates).toBe('Sin fechar')
  })

  /** Nor where the venue went: a blank there reads as «this show had no venue». */
  it('sin sede identificada y sin nota, la fila dice «Sede sin identificar»', () => {
    const entry = rankExhibitions([row({ venue: null, venue_id: null, venue_note: '' })], '')[0]
    expect(entry?.venue).toBe('Sede sin identificar')
  })

  /**
   * And when the source only said «una galería de Madrid», that IS the datum: it is
   * printed as is instead of being written off as an unknown venue.
   */
  it('la sede que solo consta como texto libre se imprime tal cual', () => {
    const entry = rankExhibitions(
      [row({ venue: null, venue_id: null, venue_note: 'Una galería de Madrid' })],
      '',
    )[0]
    expect(entry?.venue).toBe('Una galería de Madrid')
  })
})

describe('RF-606: la búsqueda del listado', () => {
  const rows = [
    row({ id: 'badajoz', title: 'Antológica', year: 1985, start_date: '1985-03-12' }),
    row({
      id: 'caceres',
      title: 'Obra reciente',
      year: 2001,
      start_date: '2001-03-12',
      venue: venue({ id: 'v-2', name: 'Casa de Cultura', locality: 'Cáceres' }),
    }),
  ]

  it('filtra por la sede, que es la mitad de la identidad de una muestra', () => {
    expect(rankExhibitions(rows, 'Cáceres').map((entry) => entry.row.id)).toEqual(['caceres'])
  })

  it('filtra por el año', () => {
    expect(rankExhibitions(rows, '1985').map((entry) => entry.row.id)).toEqual(['badajoz'])
  })

  /**
   * With nothing typed everything ties, and then the listing is purely chronological,
   * which is exactly what it looks like being. This assertion is the one that pins down that
   * sorting BEFORE scoring was not accidental.
   */
  it('sin nada teclado el listado queda cronológico y no en el orden en que llegó', () => {
    expect(rankExhibitions(rows, '').map((entry) => entry.row.id)).toEqual(['caceres', 'badajoz'])
  })

  it('una búsqueda sin coincidencias devuelve una lista vacía para que la pantalla lo explique', () => {
    expect(rankExhibitions(rows, 'zzzz')).toEqual([])
  })

  /** The indexes are the ones highlighting the letters found. */
  it('devuelve dónde cayeron las letras buscadas, dentro del texto que la fila muestra', () => {
    const entry = rankExhibitions(rows, 'Antológica')[0]
    expect(entry?.indices.length).toBeGreaterThan(0)
    expect(entry?.text).toBe(exhibitionSearchText(rows[0]!))
  })
})

describe('RF-909: un título repetido se avisa, nunca se rechaza', () => {
  /**
   * `exhibitions` does NOT have a unique index on the title, and it is a decision written in its
   * migration: two touring shows from different years are called the same. So this can only
   * warn.
   */
  it('encuentra el homónimo ignorando mayúsculas, tildes y espacios de sobra', () => {
    const rows = [row({ id: 'ex-1', title: 'Alberto Rotili. Antológica' })]
    expect(similarExhibitions(rows, '  alberto rotili. antologica  ').map((r) => r.id)).toEqual([
      'ex-1',
    ])
  })

  /**
   * And it does NOT ignore punctuation, unlike `normalizeForSearch`: a title is
   * punctuated on purpose, and two that differ only in a full stop are two titles that
   * were typed differently.
   */
  it('no confunde dos títulos que solo difieren en la puntuación', () => {
    const rows = [row({ id: 'ex-1', title: 'Rotili. Obra reciente' })]
    expect(similarExhibitions(rows, 'Rotili Obra reciente')).toEqual([])
  })

  it('un título en blanco no señala a todo el catálogo', () => {
    expect(similarExhibitions([row()], '   ')).toEqual([])
  })

  /**
   * The withdrawn ones count: a duplicate of something that is in the wastebasket is still
   * a duplicate, and knowing it is there is what makes somebody
   * recover it instead of creating it again.
   */
  it('una homónima retirada cuenta, y la frase manda a recuperarla', () => {
    const rows = [row({ id: 'ex-1', title: 'Antológica', active: false })]
    const matches = similarExhibitions(rows, 'Antológica')
    expect(matches.map((r) => r.id)).toEqual(['ex-1'])
    expect(similarTitleNotice(matches)).toContain('Está retirada')
  })

  it('sin homónimas no hay aviso, y null no es una frase vacía', () => {
    expect(similarTitleNotice([])).toBeNull()
  })

  /** The sentence names the one that already exists, so it can be decided whether it is the same. */
  it('el aviso nombra la exposición que ya existe, con sus fechas y su sede', () => {
    const text = similarTitleNotice([row()]) ?? ''
    expect(text).toContain('«Rotili. Obra reciente»')
    expect(text).toContain('Museo de Bellas Artes')
    // And it does not forbid: pressing «Crear» anyway is a legitimate act.
    expect(text).toContain('Puede ser correcto')
  })

  it('con varias homónimas dice cuántas más hay', () => {
    const rows = [
      row({ id: 'a', title: 'Antológica', year: 1985, start_date: '1985-03-12' }),
      row({ id: 'b', title: 'Antológica', year: 1990, start_date: '1990-03-12' }),
      row({ id: 'c', title: 'Antológica', year: 1995, start_date: '1995-03-12' }),
    ]
    expect(similarTitleNotice(similarExhibitions(rows, 'Antológica'))).toContain('y 2 más')
  })

  /** And the one it names is the most recent, not the one that came first in the array. */
  it('nombra la más reciente de las homónimas', () => {
    const rows = [
      row({ id: 'vieja', title: 'Antológica', year: 1985, start_date: '1985-03-12' }),
      row({ id: 'nueva', title: 'Antológica', year: 2019, start_date: '2019-03-12' }),
    ]
    expect(similarExhibitions(rows, 'Antológica')[0]?.id).toBe('nueva')
  })
})
