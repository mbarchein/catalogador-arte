import { describe, expect, it } from 'vitest'
import { RESEARCH_STATUS_DESCRIPTION, RESEARCH_STATUS_LABEL } from '../../../lib/types'
import { sectionSpec } from '../sections'
import { blockState } from '../researchState'
import {
  RESEARCH_STATUS_ORDER,
  researchStatusOptions,
  statusUnknownNotice,
  withStatusUnknown,
} from './researchStatusChoice'

/**
 * Declarar hasta dónde ha llegado la investigación de un bloque (RF-218).
 *
 * El valor solo significa algo si se puede cambiar desde la ficha: un estado que
 * nadie puede tocar se queda en «Sin revisar» para siempre y enseña al ojo a
 * ignorarlo, que es justo lo contrario de lo que la columna existe para conseguir.
 */

const documents = sectionSpec('documents')
const relationships = sectionSpec('relationships')

describe('las cuatro opciones que se ofrecen (RF-218)', () => {
  it('están las cuatro, en orden y con las etiquetas del esquema', () => {
    const options = researchStatusOptions(documents, 0)
    expect(options.map((option) => option.value)).toEqual([...RESEARCH_STATUS_ORDER])
    expect(options.map((option) => option.text)).toEqual([
      RESEARCH_STATUS_LABEL.UNREVIEWED,
      RESEARCH_STATUS_LABEL.IN_PROGRESS,
      RESEARCH_STATUS_LABEL.NONE_FOUND,
      RESEARCH_STATUS_LABEL.COMPLETE,
    ])
  })

  it('con el bloque vacío se puede declarar cualquiera de las cuatro', () => {
    const options = researchStatusOptions(documents, 0)
    expect(options.every((option) => !option.disabled)).toBe(true)
    expect(options[2]?.hint).toBe(RESEARCH_STATUS_DESCRIPTION.NONE_FOUND)
  })

  /**
   * La base se niega a declarar «Investigado, sin resultados» sobre un bloque con
   * filas. Lo que se hace aquí es no ofrecer lo que va a ser rechazado y decir por
   * qué en el mismo sitio: ofrecerlo sería un botón que existe para contestar que no.
   */
  it('con documentos dentro, «Investigado, sin resultados» se apaga y explica por qué', () => {
    const options = researchStatusOptions(documents, 3)
    const noneFound = options.find((option) => option.value === 'NONE_FOUND')!
    expect(noneFound.disabled).toBe(true)
    expect(noneFound.hint).toContain('3 documentos')
    expect(options.filter((option) => option.disabled)).toHaveLength(1)
  })

  it('concuerda en singular con un solo documento', () => {
    const noneFound = researchStatusOptions(documents, 1).find((o) => o.value === 'NONE_FOUND')!
    expect(noneFound.hint).toContain('1 documento')
    expect(noneFound.hint).not.toContain('1 documentos')
  })

  /**
   * Apagada y NO escondida: un menú al que le falta una opción parece una aplicación
   * que no la tiene, y «Investigado, sin resultados» es justo el valor que se busca
   * después de una tarde de archivo.
   */
  it('la opción imposible se sigue viendo, que es como se sabe que existe', () => {
    expect(researchStatusOptions(documents, 3).map((option) => option.value)).toEqual([
      ...RESEARCH_STATUS_ORDER,
    ])
  })

  it('un recuento absurdo se trata como ninguno, sin apagar nada por un negativo', () => {
    expect(researchStatusOptions(documents, -2).every((option) => !option.disabled)).toBe(true)
  })
})

describe('cuando no se ha podido leer el estado (RF-304)', () => {
  it('mientras carga no se avisa de nada: el rótulo ya dice «Cargando…»', () => {
    expect(statusUnknownNotice(documents, { status: null, loading: true })).toBeNull()
  })

  it('con el estado leído tampoco', () => {
    expect(statusUnknownNotice(documents, { status: 'UNREVIEWED', loading: false })).toBeNull()
  })

  /**
   * Las filas pueden cargar y la fila de la obra no. Sin este aviso, un bloque vacío
   * se leería como «no hay nada» cuando lo que pasa es que nadie sabe si alguien ha
   * buscado, que es la confusión que toda esta carpeta existe para evitar.
   */
  it('sin estado y sin estar cargando, se dice que no se sabe si alguien ha buscado', () => {
    const notice = statusUnknownNotice(documents, {
      status: null,
      loading: false,
      error: 'JWT expired',
    })
    expect(notice).toContain('No se ha podido leer')
    expect(notice).toContain('JWT expired')
  })

  it('sin mensaje de la base, la frase no deja unos paréntesis vacíos', () => {
    const notice = statusUnknownNotice(documents, { status: null, loading: false })
    expect(notice).not.toContain('()')
  })

  it('el bloque que no lleva estado de investigación no avisa de que le falte', () => {
    expect(statusUnknownNotice(relationships, { status: null, loading: false })).toBeNull()
  })
})

describe('dónde acaba el aviso, que es lo que decide si se lee', () => {
  const notice = statusUnknownNotice(documents, { status: null, loading: false })!

  /**
   * El caso peligroso y el más difícil de colocar: el bloque pinta el texto de
   * vacío EN LUGAR del cuerpo, así que un aviso puesto entre las filas sería
   * invisible justo cuando hace falta. Sin esto, un bloque vacío se leería como
   * «no hay documentación» sin decir que nadie sabe si alguien ha buscado.
   */
  it('con el bloque vacío, el aviso va pegado al texto de vacío', () => {
    const state = withStatusUnknown(blockState(documents, null, 0), notice)
    expect(state.emptyText).toContain('Sin documentos de archivo relacionados.')
    expect(state.emptyText).toContain('No se ha podido leer')
  })

  it('con filas dentro, va por encima de ellas', () => {
    const state = withStatusUnknown(blockState(documents, null, 3), notice)
    expect(state.emptyText).toBeNull()
    expect(state.partialText).toBe(notice)
  })

  it('sin nada que avisar, el estado se devuelve intacto', () => {
    const state = blockState(documents, 'COMPLETE', 2)
    expect(withStatusUnknown(state, null)).toBe(state)
  })

  it('no se come el aviso de bloque incompleto que ya hubiera', () => {
    const partial = blockState(documents, 'IN_PROGRESS', 2)
    const state = withStatusUnknown(partial, notice)
    expect(state.partialText).toContain('sigue en curso')
    expect(state.partialText).toContain('No se ha podido leer')
  })
})
