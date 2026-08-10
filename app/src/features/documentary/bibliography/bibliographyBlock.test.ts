import { describe, expect, it } from 'vitest'
import { blockState } from '../researchState'
import { sectionSpec } from '../sections'
import {
  bibliographyBlockState,
  bibliographyLoadState,
  citeBlockedReason,
  type BibliographyLoadInput,
} from './bibliographyBlock'

/**
 * Las dos consultas del bloque de bibliografía y lo que pasa cuando solo llega
 * una (RF-218, RF-304, RF-504).
 *
 * El caso que hay que decidir es el incómodo: las citas cargan y el estado de la
 * investigación no. Pintar «Ninguna registrada» ahí sería publicar justo la frase
 * que toda esta parte del catálogo existe para evitar.
 */

const spec = sectionSpec('bibliography')

function load(over: Partial<BibliographyLoadInput> = {}): BibliographyLoadInput {
  return {
    rowsLoading: false,
    rowsError: null,
    status: 'UNREVIEWED',
    statusLoading: false,
    statusError: null,
    ...over,
  }
}

describe('RF-304 · qué se muestra mientras llegan las dos consultas', () => {
  it('con las dos resueltas, ni carga, ni error, ni aviso', () => {
    expect(bibliographyLoadState(load())).toEqual({
      loading: false,
      error: null,
      statusUnknownNotice: null,
    })
  })

  it('carga mientras falte cualquiera de las dos', () => {
    expect(bibliographyLoadState(load({ rowsLoading: true })).loading).toBe(true)
    expect(bibliographyLoadState(load({ statusLoading: true, status: null })).loading).toBe(true)
  })

  it('mientras carga no se avisa de nada: la cabecera ya dice «Cargando…»', () => {
    const state = bibliographyLoadState(load({ statusLoading: true, status: null }))
    expect(state.statusUnknownNotice).toBeNull()
  })

  it('si fallan las citas no se muestra nada: una bibliografía a la que le falta una fila es peor que ninguna', () => {
    const state = bibliographyLoadState(load({ rowsError: 'timeout' }))
    expect(state.error).toBe('timeout')
    expect(state.loading).toBe(false)
    expect(state.statusUnknownNotice).toBeNull()
  })
})

describe('RF-218 · cuando no se sabe si alguien ha buscado', () => {
  it('las citas sí se muestran: fallar la segunda consulta no borra lo que llegó bien', () => {
    const state = bibliographyLoadState(load({ status: null, statusError: 'sin red' }))
    expect(state.error).toBeNull()
    expect(state.loading).toBe(false)
    expect(state.statusUnknownNotice).not.toBeNull()
  })

  it('el aviso dice que un bloque vacío NO afirma que la obra sea inédita', () => {
    const notice = bibliographyLoadState(load({ status: null })).statusUnknownNotice ?? ''
    expect(notice).toContain('inédita')
  })

  it('el mensaje de la base se cita entre paréntesis cuando lo hay, y no se inventa cuando no', () => {
    expect(bibliographyLoadState(load({ status: null, statusError: 'JWT expired' })).statusUnknownNotice).toContain(
      '(JWT expired)',
    )
    expect(bibliographyLoadState(load({ status: null, statusError: '   ' })).statusUnknownNotice).not.toContain(
      '(',
    )
    expect(bibliographyLoadState(load({ status: null })).statusUnknownNotice).not.toContain('(')
  })
})

describe('RF-304 · el aviso va donde se va a leer', () => {
  it('sin aviso, el estado del bloque no se toca', () => {
    const state = blockState(spec, 'UNREVIEWED', 0)
    expect(bibliographyBlockState(state, null)).toBe(state)
  })

  it('con el bloque VACÍO se añade a la frase del hueco, que es lo único que se pinta', () => {
    // `DocumentarySection` paints the empty text INSTEAD OF the rows: a warning
    // among the rows would not be seen in precisely the case that matters.
    const state = bibliographyBlockState(blockState(spec, null, 0), 'AVISO')
    expect(state.emptyText).toContain('AVISO')
    expect(state.emptyText).toContain('Sin referencias bibliográficas registradas')
  })

  it('con filas dentro, el aviso va encima de ellas', () => {
    const state = bibliographyBlockState(blockState(spec, null, 3), 'AVISO')
    expect(state.emptyText).toBeNull()
    expect(state.partialText).toBe('AVISO')
  })

  it('no tapa el aviso que ya traía el bloque: se suman', () => {
    // «There is data and the block is still unreviewed» is another warning, and losing
    // it would be swapping one datum for another.
    const partial = blockState(spec, 'UNREVIEWED', 2)
    expect(partial.partialText).not.toBeNull()
    const state = bibliographyBlockState(partial, 'AVISO')
    expect(state.partialText).toContain(partial.partialText ?? '')
    expect(state.partialText).toContain('AVISO')
  })

  it('el recuento y el estado siguen siendo los mismos', () => {
    const state = bibliographyBlockState(blockState(spec, 'COMPLETE', 2), 'AVISO')
    expect(state.count).toBe(2)
    expect(state.countText).toBe('2 referencias')
    expect(state.status).toBe('COMPLETE')
  })
})

describe('RF-218 · citar sobre un bloque investigado sin resultados', () => {
  it('se dice antes de pulsar, no después del viaje de ida y vuelta', () => {
    const reason = citeBlockedReason('NONE_FOUND')
    expect(reason).not.toBeNull()
    // It follows the lead the base gives, without writing a second version of the rule.
    expect(reason).toContain('Investigación en curso')
    expect(reason).toContain('Investigación completa')
  })

  it('con los otros tres estados se puede citar', () => {
    expect(citeBlockedReason('UNREVIEWED')).toBeNull()
    expect(citeBlockedReason('IN_PROGRESS')).toBeNull()
    expect(citeBlockedReason('COMPLETE')).toBeNull()
  })

  it('sin estado leído no se bloquea: no se sabe, y la base tiene la última palabra', () => {
    expect(citeBlockedReason(null)).toBeNull()
  })
})
