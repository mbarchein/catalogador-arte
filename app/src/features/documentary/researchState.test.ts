import { describe, expect, it } from 'vitest'
import { blockState, opensByDefault } from './researchState'
import {
  DOCUMENTARY_SECTIONS,
  countText,
  sectionSpec,
  statusOf,
  type DocumentarySectionId,
} from './sections'
import { RESEARCH_STATUS_LABEL, type ArtworkDocumentary, type ResearchStatus } from '../../lib/types'

/**
 * RF-218 y «sin revisar» no es «no», que es la regla que más pantallas decide en
 * este proyecto.
 *
 * Lo que se verifica es el TEXTO que lee la catalogadora, porque el texto es la
 * regla: un bloque vacío que nadie ha mirado y un bloque vacío que se ha
 * investigado a fondo se ven igual en pantalla y significan lo contrario, y lo
 * único que los separa es la frase.
 */

const IDS: DocumentarySectionId[] = [
  'provenance',
  'bibliography',
  'exhibitions',
  'documents',
  'relationships',
]

const WITH_STATUS = IDS.filter((id) => sectionSpec(id).statusField !== null)

describe('los cinco bloques documentales (RF-303)', () => {
  it('son cinco, y cada identificador encuentra su especificación', () => {
    expect(DOCUMENTARY_SECTIONS).toHaveLength(5)
    for (const id of IDS) expect(sectionSpec(id).id).toBe(id)
  })

  it('cuatro llevan estado de investigación y las obras relacionadas no (RF-217, RF-218)', () => {
    expect(WITH_STATUS).toEqual(['provenance', 'bibliography', 'exhibitions', 'documents'])
    expect(sectionSpec('relationships').statusField).toBeNull()
  })

  it('cada bloque apunta a una columna distinta de la obra (RF-218)', () => {
    const fields = WITH_STATUS.map((id) => sectionSpec(id).statusField)
    expect(new Set(fields).size).toBe(fields.length)
  })

  it('RF-304: los cuatro con estado explican su vacío en los cuatro estados', () => {
    for (const id of WITH_STATUS) {
      const spec = sectionSpec(id)
      for (const text of [
        spec.unreviewedText,
        spec.inProgressText,
        spec.noneFoundText,
        spec.completeText,
      ]) {
        expect(text.trim()).not.toBe('')
      }
    }
  })

  it('RF-304: el recuento nunca es un cero pelado, y concuerda en género', () => {
    expect(countText(sectionSpec('exhibitions'), 0)).toBe('Ninguna registrada')
    expect(countText(sectionSpec('documents'), 0)).toBe('Ninguno registrado')
    expect(countText(sectionSpec('exhibitions'), 1)).toBe('1 exposición')
    expect(countText(sectionSpec('exhibitions'), 3)).toBe('3 exposiciones')
    expect(countText(sectionSpec('provenance'), 2)).toBe('2 eslabones')
  })

  it('el estado de un bloque se lee de la columna que le toca', () => {
    const documentary: Pick<
      ArtworkDocumentary,
      'provenance_status' | 'bibliography_status' | 'exhibition_history_status' | 'documentation_status'
    > = {
      provenance_status: 'NONE_FOUND',
      bibliography_status: 'IN_PROGRESS',
      exhibition_history_status: 'COMPLETE',
      documentation_status: 'UNREVIEWED',
    }
    expect(statusOf(sectionSpec('provenance'), documentary)).toBe('NONE_FOUND')
    expect(statusOf(sectionSpec('exhibitions'), documentary)).toBe('COMPLETE')
    // Sin estado propio, y sin fila cargada todavía: null en los dos casos, que
    // es lo que `blockState` entiende como «este bloque no puede decirlo».
    expect(statusOf(sectionSpec('relationships'), documentary)).toBeNull()
    expect(statusOf(sectionSpec('provenance'), null)).toBeNull()
  })
})

describe('RF-218: «sin revisar» no es «no»', () => {
  const exhibitions = sectionSpec('exhibitions')

  it('un bloque vacío sin revisar no dice nada sobre la obra, y lo dice', () => {
    const state = blockState(exhibitions, 'UNREVIEWED', 0)
    expect(state.emptyText).toBe(exhibitions.unreviewedText)
    expect(state.emptyText).toContain('no es una obra que no se haya expuesto')
    expect(state.statusLabel).toBe(RESEARCH_STATUS_LABEL.UNREVIEWED)
    expect(state.tone).toBe('unreviewed')
  })

  it('un bloque vacío investigado sin resultados SÍ dice algo sobre la obra', () => {
    const state = blockState(exhibitions, 'NONE_FOUND', 0)
    expect(state.emptyText).toBe(exhibitions.noneFoundText)
    expect(state.emptyText).toContain('no consta')
    expect(state.tone).toBe('settled')
  })

  it('los dos vacíos no dicen lo mismo, que es el motivo de que exista la columna', () => {
    expect(blockState(exhibitions, 'UNREVIEWED', 0).emptyText).not.toBe(
      blockState(exhibitions, 'NONE_FOUND', 0).emptyText,
    )
  })

  it('en curso y cerrado sin nada son un tercer y un cuarto caso, no un vacío cualquiera', () => {
    expect(blockState(exhibitions, 'IN_PROGRESS', 0).emptyText).toBe(exhibitions.inProgressText)
    expect(blockState(exhibitions, 'IN_PROGRESS', 0).tone).toBe('progress')
    expect(blockState(exhibitions, 'COMPLETE', 0).emptyText).toBe(exhibitions.completeText)
    expect(blockState(exhibitions, 'COMPLETE', 0).tone).toBe('settled')
  })

  it('RF-304: ninguno de los cuatro bloques deja un vacío sin explicar', () => {
    const statuses: ResearchStatus[] = ['UNREVIEWED', 'IN_PROGRESS', 'NONE_FOUND', 'COMPLETE']
    for (const id of WITH_STATUS) {
      for (const status of statuses) {
        const state = blockState(sectionSpec(id), status, 0)
        expect(state.emptyText?.trim()).toBeTruthy()
        expect(state.countText).toBe(sectionSpec(id).none)
      }
    }
  })
})

describe('un bloque con datos', () => {
  const bibliography = sectionSpec('bibliography')

  it('no muestra texto de vacío, y avisa de que puede no estar todo', () => {
    const state = blockState(bibliography, 'UNREVIEWED', 2)
    expect(state.emptyText).toBeNull()
    expect(state.countText).toBe('2 referencias')
    expect(state.partialText).toContain('Sin revisar')
  })

  it('en curso avisa de que falta por registrar', () => {
    expect(blockState(bibliography, 'IN_PROGRESS', 1).partialText).toContain('sigue en curso')
  })

  it('cerrado no avisa de nada: lo que hay es todo lo que hay', () => {
    const state = blockState(bibliography, 'COMPLETE', 4)
    expect(state.partialText).toBeNull()
    expect(state.tone).toBe('settled')
  })

  /**
   * La base lo impide con un *trigger* —no se puede declarar «Investigado, sin
   * resultados» sobre un bloque con filas, ni añadir filas a uno declarado así—,
   * pero la pantalla no da por hecho que el *trigger* siga ahí: si la
   * contradicción llega, se dice, en vez de enseñar citas bajo un rótulo que
   * afirma que no hay ninguna.
   */
  it('la contradicción que la base no debería permitir se dice en voz alta', () => {
    const state = blockState(bibliography, 'NONE_FOUND', 3)
    expect(state.tone).toBe('conflict')
    expect(state.partialText).toContain('contradicción')
    expect(state.partialText).toContain('3 referencias')
    expect(state.emptyText).toBeNull()
  })
})

describe('el bloque sin estado de investigación (RF-217)', () => {
  const relationships = sectionSpec('relationships')

  it('vacío, dice que no puede decir si se ha buscado', () => {
    const state = blockState(relationships, null, 0)
    expect(state.tone).toBe('plain')
    expect(state.statusLabel).toBeNull()
    expect(state.emptyText).toBe(relationships.plainText)
    expect(state.emptyText).toContain('no dice si se ha buscado')
  })

  it('con datos, no inventa ningún aviso de investigación', () => {
    const state = blockState(relationships, null, 2)
    expect(state.emptyText).toBeNull()
    expect(state.partialText).toBeNull()
    expect(state.countText).toBe('2 obras relacionadas')
  })
})

describe('el pliegue del bloque', () => {
  it('los bloques empiezan cerrados: cinco abiertos son un rollo de papel en el móvil', () => {
    expect(opensByDefault(blockState(sectionSpec('provenance'), 'UNREVIEWED', 0))).toBe(false)
    expect(opensByDefault(blockState(sectionSpec('provenance'), 'COMPLETE', 5))).toBe(false)
    expect(opensByDefault(blockState(sectionSpec('relationships'), null, 3))).toBe(false)
  })

  it('la contradicción no se esconde detrás de un pliegue', () => {
    expect(opensByDefault(blockState(sectionSpec('documents'), 'NONE_FOUND', 1))).toBe(true)
  })
})

describe('recuentos imposibles', () => {
  it('un recuento negativo o roto se lee como vacío, no como «-1 referencias»', () => {
    expect(blockState(sectionSpec('bibliography'), 'UNREVIEWED', -3).countText).toBe(
      'Ninguna registrada',
    )
    expect(blockState(sectionSpec('bibliography'), 'UNREVIEWED', 1.7).count).toBe(1)
  })
})
