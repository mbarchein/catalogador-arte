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
 * What is happening to a photograph, at two lengths (RNF-106).
 *
 * The badge over the image is a one-line pill, and **the only thing really looked at in it
 * is the percentage**. With a single text for the badge and for the line below, the long
 * one was truncated at the end —which is where the percentage goes— and the badge ended up
 * saying «Aplicando la corrección y subiendo las c…»: plenty of text and not one datum.
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
    // The long label came back by carelessness once, and the symptom —a percentage that
    // cannot be seen— looks nothing like its cause. Hence a cap and not just good
    // intentions.
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
 * 100 % is not the end (RNF-106).
 *
 * The percentage counts bytes going out, and going out is not having arrived: after the
 * last chunk the store is still answering and the row still recording. With a 19 MB copy
 * that lasts, and what was shown was «Subiendo copias 100 %» with the ring whole and still
 * for a long while, which is exactly what a hung screen looks like.
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
