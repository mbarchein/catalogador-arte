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
 * Elegir la sede de una exposición (RF-512, RF-304).
 *
 * La sede se ELIGE y no se teclea, que es la razón de que `exhibition_venues`
 * exista: con el nombre del museo como texto libre, corregirlo obliga a tocar
 * todas las exposiciones que albergó. Aquí se comprueba lo que decide el selector:
 * qué se ofrece, qué dice cada opción y qué se dice en vez de una lista vacía.
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
   * La localidad es media identidad: la tabla es única por (nombre, localidad)
   * precisamente porque hay una «Casa de Cultura» en cada pueblo, así que un
   * selector que la quitara enseñaría la misma opción dos veces sin forma de
   * distinguirlas.
   */
  it('lleva el nombre y la localidad, que es lo que distingue dos Casas de Cultura', () => {
    expect(venueChoiceText(venue())).toBe('Museo de Bellas Artes · Badajoz, España')
  })

  /** Nunca un hueco: un blanco ahí se lee como «esta sede no tiene pueblo». */
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
   * ESTA ES LA REGLA DE SEGURIDAD DEL SELECTOR. Es una lista para ELEGIR, y ofrecer
   * una sede que el catálogo ha retirado la devolvería al uso por la puerta de
   * atrás. Se cae, y no se marca.
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

  /** Y por la localidad, porque es como se pregunta por una sede que no se recuerda. */
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
   * EL CASO QUE DEJARÍA UN HUECO DONDE HABÍA UN NOMBRE. Una muestra cuya sede se
   * retiró después de registrarla sigue teniendo esa sede, y un selector que no
   * pudiera encontrarla pintaría «Sin identificar» encima de una ficha que nombra un
   * museo. Lo retirado se muestra y se dice, nunca se quita.
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
   * Para un Lector esto es lo normal: la consulta de sedes es de una pantalla del
   * Catalogador. Quien llama recurre a lo que la propia fila de la exposición trae
   * incrustado.
   */
  it('un identificador que no está en la lista cargada es null y no una invención', () => {
    expect(keptVenue([venue({ id: 'v-1' })], 'v-9')).toBeNull()
    expect(keptVenue([], 'v-1')).toBeNull()
  })
})

describe('RF-304: el selector nunca se queda en blanco', () => {
  /**
   * Confundir los dos primeros casos cuesta una tarde: el catálogo no tiene ninguna
   * sede, o las tiene y ninguna coincide.
   */
  it('sin ninguna sede registrada dice dónde se dan de alta', () => {
    const text = noVenuesText(0, '')
    expect(text).toContain('Todavía no hay ninguna sede registrada')
    expect(text).toContain('Sedes de exposición')
  })

  /**
   * Y LO QUE DESBLOQUEA AHORA MISMO, que es la mitad que más veces se olvida: la
   * sede es OPCIONAL. «Una galería de Madrid» es un dato legítimo —es lo que decía
   * el recorte— y escribirlo es la respuesta correcta, no un apaño. Inventarse una
   * sede para poder guardar es como un catálogo acaba con dos Casas de Cultura.
   */
  it('las dos frases dicen que la sede no hace falta para guardar', () => {
    expect(noVenuesText(0, '')).toContain('no hace falta')
    expect(noVenuesText(12, 'museo')).toContain('sin identificar')
  })

  it('sin coincidencias repite lo buscado', () => {
    expect(noVenuesText(12, '  Zafra  ')).toContain('«Zafra»')
  })

  /** Sin nada teclado no se inventan unas comillas vacías. */
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
