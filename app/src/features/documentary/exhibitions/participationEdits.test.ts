import { describe, expect, it } from 'vitest'
import type { ExhibitionRow, ParticipationRow, PartyRef, VenueRow } from '../documentaryRows'
import {
  addBlockedReason,
  EXHIBITION_OPTION_COLUMNS,
  exhibitionOptionText,
  noOptionsText,
  participatingExhibitionIds,
  participationPayload,
  rankExhibitionOptions,
  retireConfirmText,
} from './participationEdits'

/**
 * Adding and withdrawing an artwork's participation in an exhibition (RF-501,
 * RF-517).
 *
 * What is checked is what the cataloguer SEES when the answer is
 * no: an empty list explaining nothing and a button that does nothing are the
 * same failure, and in this block there are three ways of getting there — the catalogue with no
 * exhibitions, the search with no matches and the «Investigado, sin
 * resultados» state the base is going to reject.
 *
 * And the column list: a field the query forgets arrives as `undefined`
 * with the type promising a value.
 */

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

describe('las columnas de las exposiciones que se pueden elegir', () => {
  it('pide todos los campos de la exposición, su sede y la institución de la sede', () => {
    const row = exhibition()
    const embeds: Record<string, string> = {
      venue: 'venue:exhibition_venues(',
      party: 'party:parties(',
    }
    const check = (fields: object) => {
      for (const field of Object.keys(fields)) {
        const embed = embeds[field]
        if (embed !== undefined) {
          expect(EXHIBITION_OPTION_COLUMNS, `la incrustación de ${field}`).toContain(embed)
          continue
        }
        expect(EXHIBITION_OPTION_COLUMNS, `la columna ${field}`).toMatch(
          new RegExp(`\\b${field}\\b`),
        )
      }
    }
    check(row)
    check(row.venue!)
    check(row.venue!.party!)
  })

  /** Third parties' personal data that the record never prints (RF-105). */
  it('no pide el contacto de la institución', () => {
    expect(EXHIBITION_OPTION_COLUMNS).not.toMatch(/\bcontact\b/)
  })
})

describe('lo que se lee de cada exposición en el selector', () => {
  /**
   * A single string for reading and for searching: a list whose rows match a
   * text they do not show looks arbitrary, which is the rule
   * `SearchableCheckList` already wrote.
   */
  it('lleva título, año y sede, porque dos itinerancias comparten título', () => {
    expect(exhibitionOptionText(exhibition())).toBe(
      'Rotili. Obra reciente · 1985 · Museo de Bellas Artes (Diputación de Badajoz), Badajoz, España',
    )
  })

  it('una exposición sin año lo dice en vez de dejar el hueco', () => {
    const row = exhibition({ year: null, start_date: null, end_date: null })
    expect(exhibitionOptionText(row)).toContain('· sin año ·')
  })
})

describe('las exposiciones que se ofrecen (RF-501)', () => {
  const other = exhibition({
    id: 'ex-2',
    title: 'Arte extremeño contemporáneo',
    exhibition_type: 'COLLECTIVE',
    year: 1990,
    start_date: '1990-01-10',
    end_date: null,
    venue: venue({ id: 'v-2', name: 'Casa de Cultura', locality: 'Zafra', party: null, party_id: null }),
    venue_id: 'v-2',
  })

  it('sin búsqueda las ofrece todas, en el orden en que llegaron', () => {
    const choices = rankExhibitionOptions([exhibition(), other], '', new Set())
    expect(choices.map((choice) => choice.option.id)).toEqual(['ex-1', 'ex-2'])
  })

  it('se busca también por la sede, sin tildes ni mayúsculas', () => {
    const choices = rankExhibitionOptions([exhibition(), other], 'zafra', new Set())
    expect(choices.map((choice) => choice.option.id)).toEqual(['ex-2'])
    expect(choices[0]?.indices.length).toBeGreaterThan(0)
  })

  /**
   * They are listed and marked, not hidden: an exhibition that disappears from the
   * selector reads as not being registered, and that is how the same show ends up being
   * created twice.
   */
  it('la que ya está en el historial se ofrece marcada, no desaparece', () => {
    const choices = rankExhibitionOptions([exhibition(), other], '', new Set(['ex-1']))
    expect(choices.map((choice) => choice.alreadyInHistory)).toEqual([true, false])
  })

  /**
   * The other way round from the record: here one chooses, and offering something the catalogue has
   * withdrawn would be putting it back into use through the back door (RF-901).
   */
  it('una exposición retirada no se ofrece', () => {
    const choices = rankExhibitionOptions(
      [exhibition({ active: false }), other],
      '',
      new Set(),
    )
    expect(choices.map((choice) => choice.option.id)).toEqual(['ex-2'])
  })

  it('las exposiciones en las que ya participa la obra salen de sus participaciones', () => {
    const ids = participatingExhibitionIds([
      participation(),
      participation({ id: 'ae-2', exhibition_id: 'ex-9' }),
    ])
    expect([...ids].sort()).toEqual(['ex-1', 'ex-9'])
  })
})

describe('RF-304: el selector nunca se queda en blanco', () => {
  it('sin ninguna exposición en el catálogo, dice que no hay y dónde se dan de alta', () => {
    const text = noOptionsText(0, 'rotili')
    expect(text).toContain('Todavía no hay ninguna exposición registrada')
    // And since the screen exists and is mounted, it is named instead of
    // calling it «pending in this delivery»: a warning that sends people nowhere is
    // worse than not giving one.
    expect(text).toContain('en la pantalla Exposiciones')
    expect(text).not.toContain('pendiente')
  })

  /** Otherwise the title of the catalogue held in hand gets typed, nothing comes out, and the conclusion is that the search is broken. */
  it('sin coincidencias, repite lo buscado y dice dónde se crean las exposiciones', () => {
    const text = noOptionsText(12, ' Antológica ')
    expect(text).toContain('«Antológica»')
    expect(text).toContain('dar de alta una exposición nueva se hace en la pantalla Exposiciones')
    expect(text).not.toContain('pendiente')
  })

  it('sin nada tecleado no inventa unas comillas vacías', () => {
    expect(noOptionsText(12, '   ')).not.toContain('«')
  })
})

describe('cuando la base va a decir que no (RF-218)', () => {
  /**
   * `tg_artwork_exhibition_status_coherent` rejects the participation and explains it
   * in Spanish. That the base says so when it happens is fine; that the button says it
   * before being pressed is what avoids the round trip standing up in a
   * storeroom.
   */
  it('un historial investigado sin resultados no admite participaciones, y se dice antes', () => {
    const reason = addBlockedReason('NONE_FOUND')
    expect(reason).toContain('Investigado, sin resultados')
    expect(reason).toContain('Investigación en curso')
  })

  it('los otros tres estados no bloquean nada, tampoco el estado ilegible', () => {
    expect(addBlockedReason('UNREVIEWED')).toBeNull()
    expect(addBlockedReason('IN_PROGRESS')).toBeNull()
    expect(addBlockedReason('COMPLETE')).toBeNull()
    expect(addBlockedReason(null)).toBeNull()
  })
})

describe('lo que se manda a la base', () => {
  it('RF-517: los argumentos de exhibit_artwork, con el texto recortado', () => {
    expect(participationPayload('AR-0001', 'ex-1', '  12 bis ', ' sin marco ')).toEqual({
      p_catalog_id: 'AR-0001',
      p_exhibition_id: 'ex-1',
      p_catalogue_number: '12 bis',
      p_note: 'sin marco',
    })
  })

  /** What is not sent is not erased: the RPC keeps whatever was already there. */
  it('un formulario en blanco manda cadenas vacías, no nulos', () => {
    expect(participationPayload('AR-0001', 'ex-1', '', '')).toMatchObject({
      p_catalogue_number: '',
      p_note: '',
    })
  })
})

describe('retirar una participación (RF-901)', () => {
  it('dice qué se retira y, sobre todo, qué NO se pierde', () => {
    const text = retireConfirmText(participation())
    expect(text).toContain('«Rotili. Obra reciente»')
    expect(text).toContain('La exposición sigue en el catálogo')
    expect(text).toContain('se puede volver a añadir')
  })

  it('sin exposición legible, la frase sigue teniendo sujeto', () => {
    expect(retireConfirmText(participation({ exhibition: null }))).toContain(
      'participación de esta obra en esta exposición',
    )
  })
})
