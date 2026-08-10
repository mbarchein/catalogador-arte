import { describe, expect, it } from 'vitest'
import type { ExhibitionVenue } from '../../lib/types'
import {
  chosenVenueText,
  keptVenue,
  noVenuesText,
  rankVenues,
  venueChoiceText,
} from './venueChoice'

/**
 * Choosing an exhibition's venue (RF-512, RF-304).
 *
 * The venue is CHOSEN and not typed, which is the reason `exhibition_venues`
 * exists: with the museum's name as free text, correcting it forces one to touch
 * every exhibition it hosted. Here what the selector decides is checked:
 * what is offered, what each option says and what is said instead of an empty list.
 */

function venue(over: Partial<ExhibitionVenue> = {}): ExhibitionVenue {
  return {
    id: 'v-1',
    name: 'Museo de Bellas Artes',
    locality: 'Badajoz',
    country: 'España',
    party_id: null,
    note: '',
    active: true,
    ...over,
  }
}

describe('RF-512: lo que dice una opción', () => {
  /**
   * The locality is half the identity: the table is unique by (name, locality)
   * precisely because there is a «Casa de Cultura» in every town, so a
   * selector that removed it would show the same option twice with no way of
   * telling them apart.
   */
  it('lleva el nombre y la localidad, que es lo que distingue dos Casas de Cultura', () => {
    expect(venueChoiceText(venue())).toBe('Museo de Bellas Artes · Badajoz, España')
  })

  /** Never a gap: a blank there reads as «this venue has no town». */
  it('RF-304: sin localidad ni país lo dice, en vez de dejar el sitio vacío', () => {
    expect(venueChoiceText(venue({ locality: '', country: '' }))).toBe(
      'Museo de Bellas Artes · sin localidad',
    )
  })

  it('con localidad y sin país no deja una coma suelta', () => {
    expect(venueChoiceText(venue({ country: '' }))).toBe('Museo de Bellas Artes · Badajoz')
    expect(venueChoiceText(venue({ country: '' }))).not.toContain(',')
  })

  it('con país y sin localidad tampoco', () => {
    expect(venueChoiceText(venue({ locality: '' }))).toBe('Museo de Bellas Artes · España')
  })

  it('los espacios de sobra al teclear no llegan a la opción', () => {
    expect(venueChoiceText(venue({ name: '  Museo  ', locality: ' Badajoz ', country: ' España ' }))).toBe(
      'Museo · Badajoz, España',
    )
  })
})

describe('RF-512: lo que se ofrece, y lo que no', () => {
  /**
   * THIS IS THE SELECTOR'S SECURITY RULE. It is a list for CHOOSING, and offering
   * a venue the catalogue has withdrawn would put it back into use through the back
   * door. It drops out, and it is not marked.
   */
  it('una sede retirada NO se ofrece, ni marcada', () => {
    const venues = [venue({ id: 'viva' }), venue({ id: 'retirada', name: 'Sala Vieja', active: false })]
    expect(rankVenues(venues, '').map((choice) => choice.venue.id)).toEqual(['viva'])
    expect(rankVenues(venues, 'Vieja')).toEqual([])
  })

  it('filtra por el nombre', () => {
    const venues = [venue({ id: 'museo' }), venue({ id: 'casa', name: 'Casa de Cultura', locality: 'Zafra' })]
    expect(rankVenues(venues, 'Casa').map((choice) => choice.venue.id)).toEqual(['casa'])
  })

  /** And by locality, because that is how a venue one does not remember gets asked about. */
  it('filtra por la localidad', () => {
    const venues = [venue({ id: 'museo' }), venue({ id: 'casa', name: 'Casa de Cultura', locality: 'Zafra' })]
    expect(rankVenues(venues, 'Zafra').map((choice) => choice.venue.id)).toEqual(['casa'])
  })

  it('sin nada teclado se ofrecen todas las activas', () => {
    expect(rankVenues([venue({ id: 'a' }), venue({ id: 'b', name: 'Casa' })], '')).toHaveLength(2)
  })

  it('cada opción trae el texto que muestra y dónde cayeron las letras buscadas', () => {
    const choice = rankVenues([venue()], 'Bellas')[0]
    expect(choice?.text).toBe(venueChoiceText(venue()))
    expect(choice?.indices.length).toBeGreaterThan(0)
  })

  it('sin coincidencias devuelve una lista vacía para que el selector lo explique', () => {
    expect(rankVenues([venue()], 'zzzz')).toEqual([])
  })
})

describe('la sede que la ficha ya nombra sí se encuentra, aunque esté retirada', () => {
  /**
   * THE CASE THAT WOULD LEAVE A GAP WHERE THERE WAS A NAME. A show whose venue was
   * withdrawn after registering it still has that venue, and a selector that
   * could not find it would paint «Sin identificar» over a record that names a
   * museum. What is withdrawn is shown and said, never removed.
   */
  it('encuentra la sede elegida incluso retirada', () => {
    const venues = [venue({ id: 'retirada', active: false })]
    expect(keptVenue(venues, 'retirada')?.id).toBe('retirada')
  })

  it('sin nada elegido es null, y un identificador en blanco no busca nada', () => {
    expect(keptVenue([venue()], '')).toBeNull()
    expect(keptVenue([venue()], '   ')).toBeNull()
  })

  /**
   * For a Reader this is the norm: the venues query belongs to a Cataloguer's
   * screen. The caller falls back on what the exhibition's own row brings
   * embedded.
   */
  it('un identificador que no está en la lista cargada es null y no una invención', () => {
    expect(keptVenue([venue({ id: 'v-1' })], 'v-9')).toBeNull()
    expect(keptVenue([], 'v-1')).toBeNull()
  })
})

describe('RF-304: el selector nunca se queda en blanco', () => {
  /**
   * Confusing the first two cases costs an afternoon: the catalogue has no
   * venue, or it has some and none matches.
   */
  it('sin ninguna sede registrada dice dónde se dan de alta', () => {
    const text = noVenuesText(0, '')
    expect(text).toContain('Todavía no hay ninguna sede registrada')
    expect(text).toContain('Sedes de exposición')
  })

  /**
   * And WHAT IT UNBLOCKS RIGHT NOW, which is the half most often forgotten: the
   * venue is OPTIONAL. «Una galería de Madrid» is a legitimate datum —it is what
   * the clipping said— and writing it is the right answer, not a workaround. Inventing a
   * venue in order to be able to save is how a catalogue ends up with two Casas de Cultura.
   */
  it('las dos frases dicen que la sede no hace falta para guardar', () => {
    expect(noVenuesText(0, '')).toContain('no hace falta')
    expect(noVenuesText(12, 'museo')).toContain('sin identificar')
  })

  it('sin coincidencias repite lo buscado', () => {
    expect(noVenuesText(12, '  Zafra  ')).toContain('«Zafra»')
  })

  /** With nothing typed, no empty quotation marks are invented. */
  it('sin nada teclado no pinta unas comillas con nada dentro', () => {
    const text = noVenuesText(12, '   ')
    expect(text).not.toContain('«»')
    expect(text).toContain('Ninguna de las sedes registradas coincide.')
  })
})

describe('RF-304: el selector cerrado tampoco', () => {
  /**
   * «Sin identificar» y no un botón vacío: un control que no dice nada parece roto, y
   * aquí el valor vacío es una elección legítima y frecuente, no una pendiente.
   */
  it('sin sede elegida dice «Sin identificar» y no deja el botón mudo', () => {
    expect(chosenVenueText(null)).toBe('Sin identificar')
  })

  it('con sede elegida dice lo mismo que la opción, para no nombrarla de dos formas', () => {
    expect(chosenVenueText(venue())).toBe(venueChoiceText(venue()))
  })
})
