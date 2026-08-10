import { describe, expect, it } from 'vitest'
import { RESEARCH_STATUS_ORDER, researchStatusOptions, statusUnknownNotice } from './researchStatusChoice'
import { sectionSpec } from '../sections'
import { RESEARCH_STATUS_DESCRIPTION } from '../../../lib/types'

/** RF-218 from the declarer's side: what can be said about the provenance. */

const spec = sectionSpec('provenance')

describe('declarar el estado de la investigación (RF-218)', () => {
  it('ofrece los cuatro estados, del que nadie ha mirado al cerrado', () => {
    const options = researchStatusOptions(spec, 0)
    expect(options.map((option) => option.value)).toEqual([...RESEARCH_STATUS_ORDER])
    expect(options.every((option) => option.disabled)).toBe(false)
  })

  it('con el bloque vacío, cada estado se explica con lo que significa', () => {
    const options = researchStatusOptions(spec, 0)
    expect(options.find((option) => option.value === 'NONE_FOUND')?.hint).toBe(
      RESEARCH_STATUS_DESCRIPTION.NONE_FOUND,
    )
  })

  /**
   * The base rejects it with a *trigger*. Here the rule is not reimplemented: what
   * is going to be rejected stops being offered, and the reason is said in the same
   * place where the option was.
   */
  it('con eslabones registrados, «investigado sin resultados» se apaga y dice por qué', () => {
    const option = researchStatusOptions(spec, 3).find((one) => one.value === 'NONE_FOUND')
    expect(option?.disabled).toBe(true)
    expect(option?.hint).toContain('3 eslabones')
    expect(option?.hint).toContain('Retíralos antes')
  })

  it('la opción apagada se enseña, no se esconde: es la que se viene a buscar', () => {
    expect(researchStatusOptions(spec, 3)).toHaveLength(4)
    expect(researchStatusOptions(spec, 1).find((one) => one.value === 'NONE_FOUND')?.hint).toContain(
      '1 eslabón',
    )
  })

  it('los otros tres estados nunca se apagan, haya lo que haya en el bloque', () => {
    for (const option of researchStatusOptions(spec, 5)) {
      if (option.value !== 'NONE_FOUND') expect(option.disabled).toBe(false)
    }
  })
})

describe('cuando no se ha podido leer el estado (RF-304)', () => {
  it('avisa de que el bloque no dice si alguien ha buscado', () => {
    const notice = statusUnknownNotice(spec, { status: null, loading: false, error: 'sin red' })
    expect(notice).toContain('no dice si la cadena está completa')
    expect(notice).toContain('sin red')
  })

  it('no avisa mientras carga ni cuando el estado se conoce', () => {
    expect(statusUnknownNotice(spec, { status: null, loading: true })).toBeNull()
    expect(statusUnknownNotice(spec, { status: 'UNREVIEWED', loading: false })).toBeNull()
  })

  it('el bloque sin estado propio no tiene nada que avisar (RF-217)', () => {
    expect(
      statusUnknownNotice(sectionSpec('relationships'), { status: null, loading: false }),
    ).toBeNull()
  })
})
