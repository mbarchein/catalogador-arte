import { describe, expect, it } from 'vitest'
import type { ExhibitionRow, ParticipationRow, PartyRef, VenueRow } from '../documentaryRows'
import { blockState } from '../researchState'
import { sectionSpec } from '../sections'
import {
  catalogueNumberText,
  catalogueText,
  EXHIBITION_UNAVAILABLE,
  exhibitionCitationLine,
  exhibitionCitationParts,
  exhibitionKindCounts,
  exhibitionKindPending,
  exhibitionKindSummary,
  exhibitionKindText,
  exhibitionVenueLine,
  exhibitionVenueNote,
  historyBlockState,
  historyLoadState,
  retirementNotice,
} from './exhibitionHistory'

/**
 * How an artwork's exhibition history reads (RF-501, RF-502).
 *
 * What is verified here is the sentence, not the component: the suite runs in
 * node and cannot open a JSX, so everything that DECIDES something —what an
 * unidentified venue says, whether a show was a solo one, what an empty block
 * means— is in pure functions and is checked word by word.
 *
 * The case that gives the project's rule its name belongs to this block: an artwork with no
 * registered exhibitions is not an artwork that has not been exhibited (RF-218).
 */

const spec = sectionSpec('exhibitions')

function party(over: Partial<PartyRef> = {}): PartyRef {
  return {
    id: 'party-1',
    party_type: 'INSTITUTION',
    name: 'Diputación de Badajoz',
    locality: 'Badajoz',
    country: 'España',
    active: true,
    ...over,
  }
}

function venue(over: Partial<VenueRow> = {}): VenueRow {
  return {
    id: 'v-1',
    name: 'Museo de Bellas Artes',
    locality: 'Badajoz',
    country: 'España',
    party_id: 'party-1',
    note: '',
    active: true,
    party: party(),
    ...over,
  }
}

function exhibition(over: Partial<ExhibitionRow> = {}): ExhibitionRow {
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
    catalogue_reference_id: 'bib-1',
    note: '',
    poster_thumbnail_path: null,
    poster_derivative_path: null,
    poster_uploaded_at: null,
    active: true,
    venue: venue(),
    ...over,
  }
}

function participation(over: Partial<ParticipationRow> = {}): ParticipationRow {
  return {
    id: 'ae-1',
    catalog_id: 'AR-0001',
    exhibition_id: 'ex-1',
    catalogue_number: '12 bis',
    note: '',
    active: true,
    exhibition: exhibition(),
    ...over,
  }
}

describe('individual o colectiva (RF-501)', () => {
  it('dice el carácter de la muestra con la etiqueta del catálogo', () => {
    expect(exhibitionKindText('INDIVIDUAL')).toBe('Individual')
    expect(exhibitionKindText('COLLECTIVE')).toBe('Colectiva')
  })

  /**
   * A bare «Sin revisar», hanging from a show's title, reads as if the
   * EXHIBITION were unreviewed. What is unreviewed is its character, and
   * a press clipping gives the title long before saying whether the artist exhibited
   * alone.
   */
  it('RF-218: sin revisar no es «ni individual ni colectiva», y lo dice entero', () => {
    const text = exhibitionKindText('UNREVIEWED')
    expect(text).toBe('Sin revisar si fue individual o colectiva')
    expect(text).not.toBe('Sin revisar')
  })

  it('solo el carácter sin decidir se señala como pendiente', () => {
    expect(exhibitionKindPending('UNREVIEWED')).toBe(true)
    expect(exhibitionKindPending('INDIVIDUAL')).toBe(false)
    expect(exhibitionKindPending('COLLECTIVE')).toBe(false)
  })
})

describe('la sede de la muestra (RF-502, RF-512)', () => {
  it('nombra la sede, la institución que hay detrás y el lugar', () => {
    expect(exhibitionVenueLine(exhibition())).toBe(
      'Museo de Bellas Artes (Diputación de Badajoz), Badajoz, España',
    )
  })

  /** Two different tables, filled in by hand months apart: if the venue already carries the institution's name, it is not printed twice on the same line of a phone. */
  it('no repite la institución cuando la sede ya la nombra, aunque cambien tildes y mayúsculas', () => {
    const row = exhibition({
      venue: venue({
        name: 'Museo de Bellas Artes de Badajoz',
        party: party({ name: 'MUSEO DE BELLAS ARTES DE BADAJOZ' }),
      }),
    })
    expect(exhibitionVenueLine(row)).toBe('Museo de Bellas Artes de Badajoz, Badajoz, España')
  })

  it('sin institución detrás, la sede y su lugar', () => {
    expect(exhibitionVenueLine(exhibition({ venue: venue({ party: null, party_id: null }) }))).toBe(
      'Museo de Bellas Artes, Badajoz, España',
    )
  })

  it('sin localidad ni país no deja una coma suelta', () => {
    const row = exhibition({ venue: venue({ locality: '', country: '', party: null }) })
    expect(exhibitionVenueLine(row)).toBe('Museo de Bellas Artes')
  })

  /**
   * «Una galería de Madrid» is a legitimate datum and not a missing record: it is what
   * the source said, and inventing a venue in order to be able to store it is how a
   * catalogue ends up with two Casas de Cultura.
   */
  it('la sede que consta sin identificar se imprime tal cual', () => {
    const row = exhibition({ venue: null, venue_id: null, venue_note: 'una galería de Madrid' })
    expect(exhibitionVenueLine(row)).toBe('una galería de Madrid')
  })

  it('RF-304: sin sede y sin nota, lo dice en vez de dejar el hueco', () => {
    expect(exhibitionVenueLine(exhibition({ venue: null, venue_id: null }))).toBe(
      'Sede sin identificar',
    )
  })

  it('la transcripción de la fuente se conserva cuando además hay ficha de sede', () => {
    expect(exhibitionVenueNote(exhibition({ venue_note: 'en la sala baja' }))).toBe('en la sala baja')
  })

  it('no repite la nota cuando ya es la línea de la sede, ni inventa nada sin exposición', () => {
    expect(exhibitionVenueNote(exhibition({ venue: null, venue_note: 'una galería' }))).toBeNull()
    expect(exhibitionVenueNote(exhibition())).toBeNull()
    expect(exhibitionVenueNote(null)).toBeNull()
  })
})

describe('la línea del historial (RF-502)', () => {
  it('RF-502: cuándo, qué y dónde, en ese orden', () => {
    const parts = exhibitionCitationParts(participation())
    expect(parts.dates).toBe('12 de marzo – 4 de mayo de 1985')
    expect(parts.title).toBe('Rotili. Obra reciente')
    expect(parts.venue).toBe('Museo de Bellas Artes (Diputación de Badajoz), Badajoz, España')
  })

  /**
   * The row is painted with these three pieces and the line joins them: pinned together,
   * what is read on screen and what is cited cannot come apart.
   */
  it('la línea es exactamente la unión de las tres piezas', () => {
    const row = participation()
    const { dates, title, venue: place } = exhibitionCitationParts(row)
    expect(exhibitionCitationLine(row)).toBe(`${dates}, ${title}, ${place}`)
  })

  it('una muestra con solo el año se cita por el año', () => {
    const row = participation({
      exhibition: exhibition({ start_date: null, end_date: null, year: 1985 }),
    })
    expect(exhibitionCitationParts(row).dates).toBe('1985')
  })

  /**
   * It happens to a Reader when the show is withdrawn: the bridge row is still
   * alive and the exhibition's policy does not hand it over. The participation is
   * real, and saying so is the only honest thing (RF-304).
   */
  it('RF-304: una exposición que el lector no puede ver no deja la fila descabezada', () => {
    const row = participation({ exhibition: null })
    expect(exhibitionCitationParts(row).title).toBe(EXHIBITION_UNAVAILABLE)
    expect(exhibitionCitationLine(row)).toBe(EXHIBITION_UNAVAILABLE)
    expect(exhibitionCitationLine(row)).not.toMatch(/^,|,$/)
  })
})

describe('el catálogo de la muestra (RF-503)', () => {
  it('con catálogo y con su ficha bibliográfica', () => {
    expect(catalogueText(exhibition())).toBe('Con catálogo, con ficha en la bibliografía')
  })

  it('con catálogo todavía sin dar de alta en la bibliografía', () => {
    expect(catalogueText(exhibition({ catalogue_reference_id: null }))).toBe(
      'Con catálogo, todavía sin ficha en la bibliografía',
    )
  })

  it('sin catálogo', () => {
    const row = exhibition({ catalogue_published: 'NO', catalogue_reference_id: null })
    expect(catalogueText(row)).toBe('Sin catálogo')
  })

  /** A show whose catalogue nobody has looked for is not a show without a catalogue. */
  it('RF-218: sin revisar el catálogo no se lee como que no lo hubo', () => {
    const row = exhibition({ catalogue_published: 'UNREVIEWED', catalogue_reference_id: null })
    expect(catalogueText(row)).toBe('Sin revisar si hubo catálogo')
    expect(catalogueText(row)).not.toBe('Sin catálogo')
  })
})

describe('el número en el catálogo de la muestra (RF-513)', () => {
  it('lo cita tal como se imprimió', () => {
    expect(catalogueNumberText(participation())).toBe('Nº 12 bis en el catálogo')
  })

  it('con catálogo publicado y sin número, dice que falta', () => {
    expect(catalogueNumberText(participation({ catalogue_number: '  ' }))).toBe(
      'Sin número de catálogo registrado',
    )
  })

  /**
   * «Sin número registrado» only means something where there is a catalogue in which
   * to have one: under a show recorded as having no catalogue it would invent a shortcoming, and
   * under an unreviewed one it would answer a question nobody has asked.
   */
  it('calla cuando no consta catálogo, y calla cuando nadie lo ha mirado', () => {
    const noCatalogue = exhibition({ catalogue_published: 'NO', catalogue_reference_id: null })
    const unreviewed = exhibition({ catalogue_published: 'UNREVIEWED', catalogue_reference_id: null })
    expect(catalogueNumberText(participation({ catalogue_number: '', exhibition: noCatalogue }))).toBeNull()
    expect(catalogueNumberText(participation({ catalogue_number: '', exhibition: unreviewed }))).toBeNull()
  })

  it('sigue diciendo el número aunque la exposición no se pueda leer', () => {
    expect(catalogueNumberText(participation({ exhibition: null }))).toBe('Nº 12 bis en el catálogo')
  })
})

describe('lo retirado que se sigue leyendo (RF-901)', () => {
  it('una exposición en la papelera se muestra, y se dice que lo está', () => {
    const notice = retirementNotice(exhibition({ active: false }))
    expect(notice).toContain('retirada del catálogo')
    expect(notice).toContain('participación de esta obra sigue viva')
  })

  it('una sede retirada detrás de una muestra viva también se dice', () => {
    expect(retirementNotice(exhibition({ venue: venue({ active: false }) }))).toBe(
      'La sede está retirada del catálogo.',
    )
  })

  it('con las dos retiradas manda la exposición: dos avisos en una fila de móvil es uno de más', () => {
    const row = exhibition({ active: false, venue: venue({ active: false }) })
    expect(retirementNotice(row)).toContain('Esta exposición')
  })

  it('no dice nada cuando no hay nada retirado', () => {
    expect(retirementNotice(exhibition())).toBeNull()
    expect(retirementNotice(null)).toBeNull()
  })
})

describe('de qué está hecho el historial (RF-501)', () => {
  const collective = exhibition({ id: 'ex-2', exhibition_type: 'COLLECTIVE' })
  const pending = exhibition({ id: 'ex-3', exhibition_type: 'UNREVIEWED' })

  it('cuenta individuales, colectivas y las que nadie ha clasificado', () => {
    const rows = [
      participation({ id: 'a' }),
      participation({ id: 'b', exhibition: collective }),
      participation({ id: 'c', exhibition: collective }),
      participation({ id: 'd', exhibition: pending }),
      participation({ id: 'e', exhibition: null }),
    ]
    expect(exhibitionKindCounts(rows)).toEqual({ individual: 1, collective: 2, unreviewed: 1 })
  })

  it('resume el historial concordando en número', () => {
    const rows = [
      participation({ id: 'a' }),
      participation({ id: 'b', exhibition: collective }),
      participation({ id: 'c', exhibition: collective }),
    ]
    expect(exhibitionKindSummary(rows)).toBe('Del historial registrado: 1 individual y 2 colectivas.')
  })

  it('las que nadie ha clasificado se cuentan aparte y las últimas', () => {
    const rows = [
      participation({ id: 'a' }),
      participation({ id: 'b' }),
      participation({ id: 'c', exhibition: collective }),
      participation({ id: 'd', exhibition: pending }),
    ]
    expect(exhibitionKindSummary(rows)).toBe(
      'Del historial registrado: 2 individuales, 1 colectiva y 1 sin clasificar.',
    )
  })

  /** With a single row, that row's badge already says it: the summary would be a line of phone spent on nothing. */
  it('no resume una sola exposición, ni cuando no hay ninguna legible', () => {
    expect(exhibitionKindSummary([participation()])).toBeNull()
    expect(exhibitionKindSummary([])).toBeNull()
    expect(
      exhibitionKindSummary([
        participation({ id: 'a', exhibition: null }),
        participation({ id: 'b', exhibition: null }),
      ]),
    ).toBeNull()
  })
})

describe('lo que el bloque puede decir mientras carga (RF-218, RF-304)', () => {
  const settled = { rowsLoading: false, rowsError: null, statusLoading: false } as const

  it('si fallan las participaciones no se muestra nada, y se dice cuál fue el fallo', () => {
    const state = historyLoadState({ ...settled, rowsError: 'sin red', status: 'COMPLETE' })
    expect(state).toEqual({ loading: false, error: 'sin red', statusUnknownNotice: null })
  })

  /**
   * The awkward case: the rows are already there and the research state is not. Without
   * the state, the block cannot tell «nobody has looked» from «it has been looked for
   * and there is none», so painting «Ninguna registrada» would be publishing precisely the sentence
   * this block exists not to say.
   */
  it('con el estado de la investigación en vuelo, el rótulo no afirma que no haya ninguna', () => {
    const state = historyLoadState({
      rowsLoading: false,
      rowsError: null,
      status: null,
      statusLoading: true,
    })
    expect(state.loading).toBe(true)
    expect(state.error).toBeNull()
  })

  it('si el estado no llega nunca, el bloque dice que no puede saber si se ha investigado', () => {
    const state = historyLoadState({ ...settled, rowsError: null, status: null })
    expect(state.loading).toBe(false)
    expect(state.statusUnknownNotice).toContain('no significa que la obra no se haya expuesto')
  })

  it('el mensaje crudo de la base acompaña al aviso, entre paréntesis', () => {
    const state = historyLoadState({
      ...settled,
      rowsError: null,
      status: null,
      statusError: 'JWT expired',
    })
    expect(state.statusUnknownNotice).toContain('(JWT expired)')
  })

  it('con todo leído no sobra ningún aviso', () => {
    expect(historyLoadState({ ...settled, rowsError: null, status: 'UNREVIEWED' })).toEqual({
      loading: false,
      error: null,
      statusUnknownNotice: null,
    })
  })
})

describe('el aviso de estado ilegible va donde se lee (RF-304)', () => {
  it('sin aviso, el estado del bloque no se toca', () => {
    const state = blockState(spec, 'UNREVIEWED', 0)
    expect(historyBlockState(state, null)).toBe(state)
  })

  /**
   * `DocumentarySection` paints the rows only when there are any, so in an
   * empty block —precisely the case where the distinction decides how the
   * emptiness reads— a warning placed among the rows would never appear.
   */
  it('en un bloque vacío el aviso ocupa el sitio del texto de vacío', () => {
    const state = historyBlockState(blockState(spec, null, 0), 'No se ha podido leer el estado.')
    expect(state.emptyText).toBe('No se ha podido leer el estado.')
    expect(state.partialText).toBeNull()
  })

  it('con filas, el aviso va por encima de ellas y no las tapa', () => {
    const state = historyBlockState(blockState(spec, null, 3), 'No se ha podido leer el estado.')
    expect(state.emptyText).toBeNull()
    expect(state.partialText).toBe('No se ha podido leer el estado.')
    expect(state.countText).toBe('3 exposiciones')
  })
})
