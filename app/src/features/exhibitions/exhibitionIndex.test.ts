import { describe, expect, it } from 'vitest'
import type { ExhibitionRow, VenueRow } from '../documentary/documentaryRows'
import { EXHIBITION_OPTION_COLUMNS } from '../documentary/exhibitions/participationEdits'
import {
  EXHIBITION_COLUMNS,
  exhibitionSearchText,
  exhibitionYearSpan,
  rankExhibitions,
  retiredCount,
  similarExhibitions,
  similarTitleNotice,
  sortExhibitions,
  splitYearQuery,
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
    poster_thumbnail_path: null,
    poster_derivative_path: null,
    poster_uploaded_at: null,
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

describe('RF-519: el año buscado es un año en el que la muestra estuvo abierta', () => {
  /**
   * La incidencia, con sus datos: una muestra de 2010 a 2025 no salía al teclear 2016.
   *
   * El texto que se busca lleva un solo año, `year`, y la base lo tiene clavado a la
   * apertura (`exhibitions_year_matches_start_date`), así que los catorce años de en medio
   * no estaban en ninguna parte. La fila **sí** los enseña —imprime los dos extremos—, de
   * modo que la lista contestaba «no se han encontrado exposiciones» sobre una muestra
   * cuyas fechas dicen lo contrario.
   */
  const larga = row({
    id: 'larga',
    title: 'Colección permanente',
    year: 2010,
    start_date: '2010-03-12',
    end_date: '2025-05-04',
  })
  const corta = row({
    id: 'corta',
    title: 'Antológica',
    year: 1985,
    start_date: '1985-03-12',
    end_date: '1985-05-04',
  })
  const rows = [larga, corta]

  it('un año de en medio la encuentra', () => {
    expect(rankExhibitions(rows, '2016').map((entry) => entry.row.id)).toEqual(['larga'])
  })

  it('y la fila explica por qué ha salido: enseña los dos extremos', () => {
    // Es lo que separa esto de una coincidencia arbitraria: 2016 no está escrito en la
    // fila, pero sí está el tramo que lo contiene.
    const entry = rankExhibitions(rows, '2016')[0]
    expect(entry?.dates).toContain('2010')
    expect(entry?.dates).toContain('2025')
  })

  it('los dos extremos también, que son los años que antes se buscaban', () => {
    expect(rankExhibitions(rows, '2010').map((entry) => entry.row.id)).toEqual(['larga'])
    expect(rankExhibitions(rows, '2025').map((entry) => entry.row.id)).toEqual(['larga'])
  })

  it('y un año de fuera no la encuentra, que es la otra mitad', () => {
    // Sin esto, «buscar por año» se convertiría en «salen todas», que es la forma de que
    // el filtro deje de servir sin dejar de parecer que funciona.
    expect(rankExhibitions(rows, '2009')).toEqual([])
    expect(rankExhibitions(rows, '2026')).toEqual([])
  })

  it('una muestra de un solo año no aparece por el año siguiente', () => {
    expect(rankExhibitions([corta], '1986')).toEqual([])
  })

  it('una muestra fechada solo por el año se sigue encontrando por él', () => {
    // La mitad de los recortes de prensa no dan más que el año, y la base lo permite.
    const suelta = row({ id: 'suelta', year: 1978, start_date: null, end_date: null })
    expect(rankExhibitions([suelta], '1978').map((entry) => entry.row.id)).toEqual(['suelta'])
    expect(rankExhibitions([suelta], '1979')).toEqual([])
  })

  it('el año va contra el tramo y el resto contra el texto: «2016 Cáceres»', () => {
    // Un buscador recibe dos palabras, así que el año no puede ser un caso especial que
    // solo funcione cuando es lo único escrito.
    const caceres = row({
      id: 'caceres',
      title: 'Colección permanente',
      year: 2010,
      start_date: '2010-03-12',
      end_date: '2025-05-04',
      venue: venue({ id: 'v-2', name: 'Casa de Cultura', locality: 'Cáceres' }),
    })
    expect(rankExhibitions([larga, caceres], '2016 Cáceres').map((e) => e.row.id)).toEqual([
      'caceres',
    ])
  })

  it('un número de cuatro cifras que no es un año se busca en el texto', () => {
    // «1000 días» es un título, y el tramo de esa muestra no llega al año 1000.
    const titulada = row({ id: 'titulada', title: '1000 días', year: 1985 })
    expect(rankExhibitions([titulada], '1000').map((entry) => entry.row.id)).toEqual(['titulada'])
  })

  it('y un número más largo no es el año escondido en sus cuatro primeras cifras', () => {
    expect(rankExhibitions(rows, '20161')).toEqual([])
  })
})

describe('el tramo de años de una muestra', () => {
  it('de la apertura al cierre', () => {
    expect(exhibitionYearSpan({ year: 2010, start_date: '2010-03-12', end_date: '2025-05-04' })).toEqual(
      { from: 2010, to: 2025 },
    )
  })

  it('sin cierre, un solo año', () => {
    expect(exhibitionYearSpan({ year: 1985, start_date: '1985-03-12', end_date: null })).toEqual({
      from: 1985,
      to: 1985,
    })
  })

  it('con solo el año, ese año', () => {
    expect(exhibitionYearSpan({ year: 1978, start_date: null, end_date: null })).toEqual({
      from: 1978,
      to: 1978,
    })
  })

  it('un cierre anterior a la apertura no se lee del revés', () => {
    // La base lo rechaza (`exhibitions_coherent_dates`); si llegara, el tramo es la
    // apertura y no un rango invertido que abarcaría años imposibles.
    expect(exhibitionYearSpan({ year: 2010, start_date: '2010-03-12', end_date: '2001-05-04' })).toEqual(
      { from: 2010, to: 2010 },
    )
  })

  it('sin fecha ninguna, nada: no abarca todo', () => {
    expect(exhibitionYearSpan({ year: null, start_date: null, end_date: null })).toBeNull()
  })

  it('y el año no se saca de la nota, que es prosa', () => {
    // «y una segunda etapa en otoño de 2011» es un texto, no una fecha que la
    // catalogadora haya introducido.
    expect(exhibitionYearSpan({ year: 2010, start_date: '2010-03-12', end_date: null })).toEqual({
      from: 2010,
      to: 2010,
    })
  })
})

describe('los años que menciona lo teclado', () => {
  it('el año sale y el resto se queda', () => {
    const { years, rest } = splitYearQuery('2016 Cáceres')
    expect(years).toEqual([2016])
    expect(rest.trim()).toBe('Cáceres')
  })

  it('dos años, los dos', () => {
    expect(splitYearQuery('2010 2016').years).toEqual([2010, 2016])
  })

  it('sin años, lo teclado entero y sin tocar', () => {
    expect(splitYearQuery('Antológica')).toEqual({ years: [], rest: 'Antológica' })
  })

  it('un número fuera del rango de un año no es un año', () => {
    expect(splitYearQuery('2200').years).toEqual([])
    expect(splitYearQuery('0999').years).toEqual([])
  })

  it('ni una cifra de más ni una de menos', () => {
    expect(splitYearQuery('201').years).toEqual([])
    expect(splitYearQuery('20161').years).toEqual([])
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
