import { describe, expect, it } from 'vitest'
import { liftTakesSample, pointerIntent } from './pickGesture'

/**
 * La incidencia que estos casos reproducen, contada tal como se notó con el dedo:
 * «el cuentagotas no me deja arrastrar el dedo para seleccionar otro punto, la imagen se
 * mueve a la par».
 *
 * El diseño original armaba el cuentagotas sin quitarle el gesto al desplazamiento: un
 * arrastre seguía moviendo la fotografía y solo un toque que no viajaba tomaba la muestra.
 * Resultado: apuntar era imposible, porque acercarse al gris que se quiere arrastra la
 * imagen justo debajo del dedo, y corregir la puntería obligaba a levantar, mirar y volver
 * a tocar a ciegas.
 *
 * Los dos primeros casos de cada bloque son los que fallaban antes del arreglo.
 */
describe('el gesto del cuentagotas (RF-414, RF-418)', () => {
  const touch = { pointerType: 'touch', button: 0 }

  describe('un dedo con el cuentagotas armado apunta y NO mueve la foto', () => {
    it('apunta en vez de desplazar', () => {
      const intent = pointerIntent({ ...touch, eyedropper: true, touches: 1 })
      expect(intent.aims).toBe(true)
      // Este es el aserto de la incidencia: antes valía `true` y la foto se iba con el dedo.
      expect(intent.pans).toBe(false)
    })

    it('arrastrar hasta el gris y levantar toma la muestra, por lejos que se haya ido', () => {
      // Antes, cualquier recorrido por encima del margen de holgura descartaba la muestra.
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
    // Escape desarma el cuentagotas antes de cerrar el panel: lo que estaba a medias no
    // se cobra al levantar el dedo.
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
