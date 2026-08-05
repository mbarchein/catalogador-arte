import { describe, expect, it } from 'vitest'
import { editorExit } from './editorExit'

/**
 * La escalera de salida del editor de fotografías (RF-1205, RNF-106).
 *
 * Reproduce la incidencia que la trajo: con el panel de color abierto, el botón de
 * atrás del móvil salía del editor y se llevaba el encuadre y el color sin
 * aplicar. Escape sí pelaba una capa, porque la escalera estaba escrita dentro de
 * su manejador y el «atrás» tenía la suya. En un teléfono sin barra de navegador
 * el «atrás» es la única salida que hay, así que la que estaba mal era la única.
 */
describe('editorExit, salir del editor pela una capa a la vez (RF-1205)', () => {
  const cerrado = { eyedropper: false, panelOpen: false, leaving: false }

  it('con la botonera en pantalla, se sale del editor', () => {
    expect(editorExit(cerrado)).toBe('LEAVE')
  })

  it('con un panel abierto, cierra el panel y no el editor', () => {
    // La incidencia: aquí el «atrás» salía y perdía el trabajo sin aplicar.
    expect(editorExit({ ...cerrado, panelOpen: true })).toBe('CLOSE_PANEL')
  })

  it('con el cuentagotas armado, lo desarma antes de tocar el panel', () => {
    // Se arma DESDE el panel de color, así que es la capa de dentro: desarmar
    // primero y cerrar el panel en el toque siguiente.
    expect(editorExit({ ...cerrado, eyedropper: true, panelOpen: true })).toBe(
      'DISARM_EYEDROPPER',
    )
  })

  it('el cuentagotas sin panel también se desarma antes de salir', () => {
    expect(editorExit({ ...cerrado, eyedropper: true })).toBe('DISARM_EYEDROPPER')
  })

  it('la salida del editor no pela nada, ni con un panel abierto', () => {
    // La ✕, «Cancelar» y «Aplicar» se ven con el panel abierto. Desde ahí
    // «Aplicar» aplica: pelar primero sería un botón que no hace nada.
    expect(editorExit({ eyedropper: false, panelOpen: true, leaving: true })).toBe('LEAVE')
    expect(editorExit({ eyedropper: true, panelOpen: true, leaving: true })).toBe('LEAVE')
  })
})
