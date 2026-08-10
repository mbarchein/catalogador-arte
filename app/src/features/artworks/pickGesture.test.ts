import { describe, expect, it } from 'vitest'
import { liftTakesSample, pointerIntent } from './pickGesture'

/**
 * The incident these cases reproduce, told as it was noticed with the finger:
 * «el cuentagotas no me deja arrastrar el dedo para seleccionar otro punto, la imagen se
 * mueve a la par».
 *
 * The original design armed the eyedropper without taking the gesture away from scrolling: a
 * drag still moved the photograph and only a tap that did not travel took the sample.
 * Result: aiming was impossible, because getting close to the grey you want drags the
 * image right under the finger, and correcting your aim forced you to lift, look and touch
 * again blind.
 *
 * The first two cases of each block are the ones that failed before the fix.
 */
describe('el gesto del cuentagotas (RF-414, RF-418)', () => {
  const touch = { pointerType: 'touch', button: 0 }

  describe('un dedo con el cuentagotas armado apunta y NO mueve la foto', () => {
    it('apunta en vez de desplazar', () => {
      const intent = pointerIntent({ ...touch, eyedropper: true, touches: 1 })
      expect(intent.aims).toBe(true)
      // This is the incident's assertion: it used to be `true` and the photo went off with the finger.
      expect(intent.pans).toBe(false)
    })

    it('arrastrar hasta el gris y levantar toma la muestra, por lejos que se haya ido', () => {
      // Before, any travel beyond the slack margin discarded the sample.
      expect(liftTakesSample({ eyedropper: true, aiming: true, pinching: false, touches: 1 })).toBe(
        true,
      )
    })
  })

  describe('sin el cuentagotas armado nada cambia', () => {
    it('un dedo sigue desplazando la fotografía', () => {
      const intent = pointerIntent({ ...touch, eyedropper: false, touches: 1 })
      expect(intent.pans).toBe(true)
      expect(intent.aims).toBe(false)
    })

    it('y levantar el dedo no mide ningún gris', () => {
      expect(liftTakesSample({ eyedropper: false, aiming: true, pinching: false, touches: 1 })).toBe(
        false,
      )
    })
  })

  describe('la pinza manda sobre todo, también sobre el cuentagotas', () => {
    it('un segundo dedo no apunta ni desplaza: es una pinza', () => {
      for (const eyedropper of [true, false]) {
        const intent = pointerIntent({ ...touch, eyedropper, touches: 2 })
        expect(intent.aims).toBe(false)
        expect(intent.pans).toBe(false)
      }
    })

    it('un gris donde cayó el segundo dedo es un gris que nadie eligió', () => {
      expect(liftTakesSample({ eyedropper: true, aiming: true, pinching: true, touches: 1 })).toBe(
        false,
      )
      expect(liftTakesSample({ eyedropper: true, aiming: true, pinching: false, touches: 2 })).toBe(
        false,
      )
    })
  })

  describe('el ratón', () => {
    it('el botón izquierdo apunta con el cuentagotas armado', () => {
      expect(pointerIntent({ pointerType: 'mouse', button: 0, eyedropper: true, touches: 1 }).aims).toBe(
        true,
      )
    })

    it('el derecho y el central no hacen nada: abren el menú y pegan', () => {
      for (const button of [1, 2]) {
        const intent = pointerIntent({ pointerType: 'mouse', button, eyedropper: true, touches: 1 })
        expect(intent.aims).toBe(false)
        expect(intent.pans).toBe(false)
      }
    })
  })

  it('desarmar el modo a media pasada cancela la muestra', () => {
    // Escape disarms the eyedropper before closing the panel: what was half-done is not
    // charged when the finger lifts.
    expect(liftTakesSample({ eyedropper: false, aiming: true, pinching: false, touches: 1 })).toBe(
      false,
    )
  })

  it('un levantamiento que no era el del puntero que apuntaba no mide nada', () => {
    expect(liftTakesSample({ eyedropper: true, aiming: false, pinching: false, touches: 1 })).toBe(
      false,
    )
  })

  it('apuntar y desplazar son excluyentes en cualquier combinación', () => {
    for (const eyedropper of [true, false]) {
      for (const touches of [0, 1, 2, 3]) {
        for (const pointerType of ['touch', 'mouse', 'pen']) {
          const intent = pointerIntent({ eyedropper, touches, pointerType, button: 0 })
          expect(intent.aims && intent.pans).toBe(false)
        }
      }
    }
  })
})
