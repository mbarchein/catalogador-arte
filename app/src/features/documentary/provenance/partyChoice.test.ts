import { describe, expect, it } from 'vitest'
import {
  emptyNewParty,
  findParty,
  newPartyPayload,
  newPartyProblem,
  noChoicesText,
  partyChoices,
} from './partyChoice'
import type { PartyRef } from '../documentaryFormat'

/** RF-508: choosing the person or the institution a link speaks of. */

function party(over: Partial<PartyRef> = {}): PartyRef {
  return {
    id: 'p1',
    party_type: 'INSTITUTION',
    name: 'Museo de Bellas Artes de Badajoz',
    locality: 'Badajoz',
    country: 'España',
    active: true,
    ...over,
  }
}

describe('las fichas que se ofrecen para un eslabón', () => {
  it('se ordenan por nombre en es-ES, con las tildes en su sitio', () => {
    const rows = [
      party({ id: 'c', name: 'Zabala, Juan' }),
      party({ id: 'a', name: 'Álvarez, Ana' }),
      party({ id: 'b', name: 'Beltrán, Luis' }),
    ]
    expect(partyChoices(rows, '').map((choice) => choice.party.id)).toEqual(['a', 'b', 'c'])
  })

  it('la búsqueda encuentra por letras sueltas, sin tildes ni mayúsculas', () => {
    const rows = [party({ id: 'a', name: 'Museo de Bellas Artes de Badajoz' }), party({ id: 'b', name: 'Casa de Cultura' })]
    expect(partyChoices(rows, 'badajoz').map((choice) => choice.party.id)).toEqual(['a'])
  })

  it('cada ficha se distingue por su tipo y su sitio: hay una Casa de Cultura en cada pueblo', () => {
    const [choice] = partyChoices([party({ name: 'Casa de Cultura', locality: 'Zafra' })], '')
    expect(choice?.hint).toBe('Institución · Zafra, España')
  })

  it('una ficha sin localidad no deja una coma suelta', () => {
    const [choice] = partyChoices(
      [party({ party_type: 'PERSON', locality: '', country: '' })],
      '',
    )
    expect(choice?.hint).toBe('Persona')
  })

  /** RF-901: a withdrawn record is in the wastebasket and is not hung from a new link. */
  it('una ficha retirada no se ofrece', () => {
    const rows = [party({ id: 'a' }), party({ id: 'b', name: 'Galería cerrada', active: false })]
    expect(partyChoices(rows, '').map((choice) => choice.party.id)).toEqual(['a'])
  })

  /**
   * Salvo la que el eslabón ya usa: quitarla de la lista haría que el formulario
   * pareciera haber perdido el dato, y guardar borraría un propietario
   * documentado.
   */
  it('la retirada que el eslabón ya usa sigue ahí, marcada como retirada', () => {
    const retired = party({ id: 'b', name: 'Galería cerrada', active: false })
    const choices = partyChoices([party({ id: 'a' }), retired], '', 'b')
    expect(choices.map((choice) => choice.party.id).sort()).toEqual(['a', 'b'])
    expect(choices.find((choice) => choice.party.id === 'b')?.retired).toBe(true)
  })

  it('la ficha de un eslabón se localiza por su identificador', () => {
    const rows = [party({ id: 'a' }), party({ id: 'b' })]
    expect(findParty(rows, 'b')?.id).toBe('b')
    expect(findParty(rows, null)).toBeNull()
    expect(findParty(rows, 'z')).toBeNull()
  })
})

describe('cuando el buscador no ofrece nada (RF-304)', () => {
  /**
   * «No hay ninguna ficha» es una afirmación sobre el catálogo. Dicha mientras la
   * consulta viaja, es falsa, y es justo lo que hace que se cree una segunda
   * ficha de un museo que ya la tiene.
   */
  it('mientras las fichas llegan no dice que no haya ninguna', () => {
    expect(noChoicesText({ loading: true, error: null, query: '' })).toBe('Cargando las fichas…')
    expect(noChoicesText({ loading: true, error: null, query: 'muba' })).toBe(
      'Cargando las fichas…',
    )
  })

  it('si no han podido cargar, lo dice y ofrece la salida legítima', () => {
    const text = noChoicesText({ loading: false, error: 'network error', query: '' })
    expect(text).toContain('no se sabe cuáles hay')
    expect(text).toContain('a mano')
    expect(text).toContain('network error')
  })

  it('con búsqueda escrita, lo que no hay es coincidencias', () => {
    expect(noChoicesText({ loading: false, error: null, query: ' zzz ' })).toBe(
      'Ninguna ficha coincide con la búsqueda.',
    )
  })

  it('cargadas, sin fallo y sin búsqueda: entonces sí, no hay ninguna', () => {
    expect(noChoicesText({ loading: false, error: null, query: '   ' })).toBe(
      'Todavía no hay ninguna ficha de persona o institución.',
    )
  })
})

describe('crear una ficha sin salir del eslabón (RF-508)', () => {
  it('empieza en «Persona» y en España, que es de donde son casi todas', () => {
    expect(emptyNewParty()).toEqual({
      name: '',
      party_type: 'PERSON',
      locality: '',
      country: 'España',
    })
  })

  it('solo exige el nombre, que es lo único que exige la base', () => {
    expect(newPartyProblem({ ...emptyNewParty(), name: '  ' })).toContain('Escribe el nombre')
    expect(newPartyProblem({ ...emptyNewParty(), name: 'Familia Hormeño' })).toBeNull()
    // With no locality it is created all the same: refusing over that would stop a chain
    // being written with the document in front.
    expect(
      newPartyProblem({ name: 'Familia Hormeño', party_type: 'PERSON', locality: '', country: '' }),
    ).toBeNull()
  })

  it('lo que viaja va recortado, como la base exige el nombre', () => {
    expect(
      newPartyPayload({
        name: '  Familia Hormeño  ',
        party_type: 'PERSON',
        locality: ' Badajoz ',
        country: ' España ',
      }),
    ).toEqual({
      name: 'Familia Hormeño',
      party_type: 'PERSON',
      locality: 'Badajoz',
      country: 'España',
    })
  })
})
