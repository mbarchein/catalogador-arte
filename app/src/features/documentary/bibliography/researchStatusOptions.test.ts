import { describe, expect, it } from 'vitest'
import { RESEARCH_STATUS_LABEL } from '../../../lib/types'
import { RESEARCH_STATUSES, researchStatusOptions } from './researchStatusOptions'

/**
 * El selector del estado de la investigación de un bloque (RF-218).
 *
 * Lo único que depende del bloque que se tenga delante es si «Investigado, sin
 * resultados» se puede declarar: la base lo prohíbe sobre un bloque con filas, y
 * ofrecer una opción que va a fallar seguro es un viaje de ida y vuelta perdido
 * en un almacén con una raya de cobertura.
 */

describe('RF-218 · los cuatro estados, siempre los cuatro', () => {
  it('se ofrecen todos, de «nadie ha mirado» a «cerrado»', () => {
    expect(RESEARCH_STATUSES).toEqual(['UNREVIEWED', 'IN_PROGRESS', 'NONE_FOUND', 'COMPLETE'])
    expect(researchStatusOptions('UNREVIEWED', 0)).toHaveLength(4)
  })

  it('cada uno con su etiqueta de types.ts, sin una segunda redacción', () => {
    for (const option of researchStatusOptions('UNREVIEWED', 0)) {
      expect(option.text).toBe(RESEARCH_STATUS_LABEL[option.value])
    }
  })

  it('ninguna opción se queda sin explicación', () => {
    for (const option of researchStatusOptions('IN_PROGRESS', 3)) {
      expect(option.hint.trim()).not.toBe('')
    }
  })

  it('el estado actual va marcado, y solo él', () => {
    const marked = researchStatusOptions('COMPLETE', 0).filter((o) => o.current)
    expect(marked.map((o) => o.value)).toEqual(['COMPLETE'])
  })
})

describe('RF-218 · «Investigado, sin resultados» sobre un bloque con referencias', () => {
  it('con el bloque vacío se puede declarar', () => {
    const none = researchStatusOptions('UNREVIEWED', 0).find((o) => o.value === 'NONE_FOUND')
    expect(none?.available).toBe(true)
  })

  it('con referencias dentro no se puede, y se dice por qué en vez de esconderlo', () => {
    // Hiding it would leave a state nobody can reach and nobody knows
    // exists.
    const none = researchStatusOptions('UNREVIEWED', 2).find((o) => o.value === 'NONE_FOUND')
    expect(none).toBeDefined()
    expect(none?.available).toBe(false)
    expect(none?.hint).toContain('Investigación completa')
  })

  it('los otros tres siguen disponibles con el bloque lleno: retirar una afirmación es tan fácil como hacerla', () => {
    const options = researchStatusOptions('COMPLETE', 5).filter((o) => o.value !== 'NONE_FOUND')
    expect(options.every((o) => o.available)).toBe(true)
  })

  it('la contradicción que la base impide se muestra marcada aunque no esté disponible', () => {
    // This is the case `blockState` paints red: a selector with nothing marked
    // above it would look as if the block had no state at all.
    const none = researchStatusOptions('NONE_FOUND', 3).find((o) => o.value === 'NONE_FOUND')
    expect(none?.current).toBe(true)
    expect(none?.available).toBe(false)
  })
})
