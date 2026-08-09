import { describe, expect, it } from 'vitest'
import {
  photoStage,
  WORK_DOWNLOADING_MASTER,
  WORK_FINISHING,
  WORK_OPENING_COPY,
  WORK_SAVING_TRACE,
  WORK_SHORT_MAX,
  WORK_UPLOADING,
  type PhotoWork,
} from './photoWork'

/**
 * Lo que está pasando con una fotografía, en dos largos (RNF-106).
 *
 * El distintivo sobre la imagen es una píldora de una línea, y **lo único que de
 * verdad se mira en ella es el porcentaje**. Con un solo texto para el distintivo
 * y para la línea de debajo, el largo se recortaba por el final —que es donde va
 * el porcentaje— y el distintivo acababa diciendo «Aplicando la corrección y
 * subiendo las c…»: mucho texto y ni un dato.
 */

const TODOS: PhotoWork[] = [
  WORK_DOWNLOADING_MASTER,
  WORK_OPENING_COPY,
  WORK_UPLOADING,
  WORK_SAVING_TRACE,
  WORK_FINISHING,
]

describe('el texto del distintivo cabe', () => {
  it('ninguno pasa del tope', () => {
    // El rótulo largo volvió por descuido una vez, y el síntoma —un porcentaje
    // que no se ve— no se parece en nada a su causa. Por eso hay un tope y no
    // solo buena intención.
    for (const work of TODOS) {
      expect(work.short.length, work.short).toBeLessThanOrEqual(WORK_SHORT_MAX)
    }
  })

  it('y ninguno lleva puntos suspensivos: los pone el porcentaje al lado', () => {
    for (const work of TODOS) {
      expect(work.short).not.toContain('…')
    }
  })

  it('el más largo de todos sigue siendo el de subir, que es el que se pasaba', () => {
    expect(WORK_UPLOADING.short).toBe('Subiendo copias')
    expect(WORK_UPLOADING.long).toContain('Aplicando la corrección')
  })
})

describe('el texto de la línea de debajo explica', () => {
  it('dice de qué fichero se trata, que en el distintivo no cabe', () => {
    expect(WORK_DOWNLOADING_MASTER.long).toContain('máster')
    expect(WORK_OPENING_COPY.long).toContain('copia de consulta')
  })

  it('y todos son más largos que su versión corta', () => {
    for (const work of TODOS) {
      expect(work.long.length).toBeGreaterThan(work.short.length)
    }
  })
})

/**
 * El 100 % no es el final (RNF-106).
 *
 * El porcentaje cuenta bytes que salen, y salir no es haber llegado: después del
 * último trozo queda el almacén contestando y la ficha anotando. Con una copia de
 * 19 MB eso dura, y lo que se veía era «Subiendo copias 100 %» con el anillo entero
 * y quieto durante un rato largo, que es exactamente el aspecto de una pantalla
 * colgada.
 */
describe('el tramo final', () => {
  it('al llegar al 100 % deja de dar número, para que el anillo vuelva a girar', () => {
    expect(photoStage(WORK_UPLOADING, 100)).toEqual({ work: WORK_FINISHING, percent: null })
  })

  it('y lo mismo al terminar de bajar el máster, que después se descodifica', () => {
    expect(photoStage(WORK_DOWNLOADING_MASTER, 100).percent).toBeNull()
  })

  it('mientras viaja, el número se respeta tal cual', () => {
    expect(photoStage(WORK_UPLOADING, 42)).toEqual({ work: WORK_UPLOADING, percent: 42 })
  })

  it('sin medida, el trabajo se dice y el anillo gira', () => {
    expect(photoStage(WORK_SAVING_TRACE, null)).toEqual({ work: WORK_SAVING_TRACE, percent: null })
  })

  it('sin trabajo no hay ni distintivo ni número', () => {
    expect(photoStage(null, 70)).toEqual({ work: null, percent: null })
  })
})
