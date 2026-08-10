import { describe, expect, it } from 'vitest'
import { sectionSpec } from '../sections'
import {
  RESEARCH_STATUSES,
  researchStatusButtonText,
  researchStatusOptions,
  statusChangeBlocked,
} from './researchStatusChoice'

/**
 * Declaring how far a block's research has got (RF-218).
 *
 * Without this control, every block of every artwork stays in the state
 * it was born in and the distinction the whole schema pays for is never used. What
 * is verified here is that the one impossible combination is offered
 * explained instead of being hidden, which is the difference between a cataloguer
 * who knows the catalogue distinguishes and one who writes «no se ha expuesto» in a
 * notes field where nothing will be able to query it.
 */

const exhibitions = sectionSpec('exhibitions')
const bibliography = sectionSpec('bibliography')

describe('los cuatro estados que se ofrecen (RF-218)', () => {
  it('están los cuatro, en orden, con la etiqueta del catálogo', () => {
    const options = researchStatusOptions(exhibitions, 0)
    expect(options.map((option) => option.value)).toEqual([...RESEARCH_STATUSES])
    expect(options.map((option) => option.text)).toEqual([
      'Sin revisar',
      'Investigación en curso',
      'Investigado, sin resultados',
      'Investigación completa',
    ])
  })

  it('con el bloque vacío ninguno está bloqueado, y cada uno explica qué significa', () => {
    const options = researchStatusOptions(exhibitions, 0)
    expect(options.every((option) => option.blocked === null)).toBe(true)
    expect(options[0]?.hint).toContain('Nadie ha buscado todavía')
  })

  /**
   * Hiding it would be worse and it is the tempting shortcut: whoever does not see «Investigado, sin
   * resultados» concludes that the catalogue cannot say it.
   */
  it('con filas debajo, el estado imposible se ofrece y lleva su negativa como explicación', () => {
    const options = researchStatusOptions(exhibitions, 3)
    const noneFound = options.find((option) => option.value === 'NONE_FOUND')
    expect(noneFound).toBeDefined()
    expect(noneFound?.blocked).not.toBeNull()
    expect(noneFound?.hint).toBe(noneFound?.blocked)
    expect(options.filter((option) => option.blocked !== null)).toHaveLength(1)
  })
})

describe('la única combinación que la base prohíbe (RF-218)', () => {
  it('no se declara «investigado sin resultados» sobre un bloque con exposiciones', () => {
    const blocked = statusChangeBlocked(exhibitions, 'NONE_FOUND', 3)
    expect(blocked).toContain('3 exposiciones')
    expect(blocked).toContain('Investigación en curso')
    expect(blocked).toContain('Investigación completa')
  })

  it('sobre el bloque vacío sí se declara: en eso consiste el estado', () => {
    expect(statusChangeBlocked(exhibitions, 'NONE_FOUND', 0)).toBeNull()
  })

  it('los otros tres estados no dependen de cuántas filas haya', () => {
    for (const value of ['UNREVIEWED', 'IN_PROGRESS', 'COMPLETE'] as const) {
      expect(statusChangeBlocked(exhibitions, value, 7)).toBeNull()
    }
  })

  /** The same sentence serves links, references, exhibitions and documents: that is why it has no gender. */
  it('la negativa se adapta al bloque y no arrastra el género de otro', () => {
    const text = statusChangeBlocked(bibliography, 'NONE_FOUND', 1)
    expect(text).toContain('1 referencia')
    expect(text).toContain('Retira antes lo que hay')
  })
})

describe('el botón que abre el selector', () => {
  it('lleva el estado actual, porque el estado es el dato', () => {
    expect(researchStatusButtonText('NONE_FOUND')).toBe(
      'Estado de la investigación: investigado, sin resultados',
    )
  })

  /** A state that could not be read cannot be changed: it would say it could and would overwrite an afternoon in the archive. */
  it('sin poder leer el estado, lo dice en vez de fingir «sin revisar»', () => {
    expect(researchStatusButtonText(null)).toBe('Estado de la investigación: sin leer')
  })
})
