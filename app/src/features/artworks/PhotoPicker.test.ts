import { describe, expect, it } from 'vitest'
import { stagedGeneralColor, type QueuedShot } from './PhotoPicker'
import type { PreparedShot } from '../../lib/images'
import type { PhotoEdit } from '../../lib/imageEdits'
import type { ShotTypeValue } from '../../lib/types'

/**
 * What the staging list decides on its own (RF-414, RF-417).
 *
 * The component's JSX has no tests here: this project's vitest runs in `node`, with no
 * DOM and no rendering library, and adding one was not this phase's to do. What is
 * testable was pulled out into functions, and the rest is listed as a manual check.
 */

/** A queued shot with only what these functions read. */
function shot(key: string, shotType: ShotTypeValue, edit: PhotoEdit): QueuedShot {
  return {
    key,
    shotType,
    isIndex: false,
    status: 'pending',
    prepared: { edit } as unknown as PreparedShot,
  }
}

const framing = { rotation: 0 as const, crop: null }

describe('stagedGeneralColor: la toma general manda, también antes de subir (RF-414)', () => {
  it('devuelve el color de la primera general de la tira', () => {
    const shots = [
      shot('t1', 'GENERAL', { ...framing, color: { temperature: 16 } }),
      shot('t2', 'GENERAL', { ...framing, color: { temperature: -30 } }),
    ]
    expect(stagedGeneralColor(shots)?.temperature).toBe(16)
  })

  it('no se hereda de uno mismo: la general no hereda de nadie', () => {
    const shots = [
      shot('t1', 'GENERAL', { ...framing, color: { temperature: 16 } }),
      shot('t2', 'GENERAL', { ...framing, color: { temperature: -30 } }),
    ]
    expect(stagedGeneralColor(shots, 't1')?.temperature).toBe(-30)
  })

  it('el color de un reverso o de un detalle no se hereda', () => {
    const shots = [
      shot('t1', 'BACK', { ...framing, color: { temperature: 16 } }),
      shot('t2', 'DAMAGE_DETAIL', { ...framing, color: { temperature: 16 } }),
    ]
    expect(stagedGeneralColor(shots)).toBeUndefined()
  })

  it('sin tomas, sin general, o con la general en neutro, no hay nada que heredar', () => {
    expect(stagedGeneralColor([])).toBeUndefined()
    expect(stagedGeneralColor([shot('t1', 'GENERAL', framing)])).toBeUndefined()
    expect(
      stagedGeneralColor([shot('t1', 'GENERAL', { ...framing, color: null })]),
    ).toBeUndefined()
  })

  it('lo que devuelve es un ajuste completo, no el trozo que llevara la toma', () => {
    // A `PhotoEdit` may carry a partial adjustment — that is what `ColorInput` is for —
    // and what is inherited has to be complete, or the panel would read `undefined`
    // where the row reads an identity.
    const color = stagedGeneralColor([shot('t1', 'GENERAL', { ...framing, color: { tint: 9 } })])
    expect(color?.tint).toBe(9)
    expect(color?.whitePoint).toBe(255)
    expect(color?.gamma).toBe(1)
    expect(color?.gray).toBe(false)
  })
})
