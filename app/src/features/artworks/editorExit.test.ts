import { describe, expect, it } from 'vitest'
import { editorExit } from './editorExit'

/**
 * The photograph editor's exit ladder (RF-1205, RNF-106).
 *
 * It reproduces the incident that brought it about: with the colour panel open, the phone's
 * back button left the editor and took the framing and the colour away
 * unapplied. Escape did peel one layer, because the ladder was written inside
 * its handler and «back» had its own. On a phone with no browser bar
 * «back» is the only exit there is, so the one that was wrong was the only one.
 */
describe('editorExit, salir del editor pela una capa a la vez (RF-1205)', () => {
  const cerrado = { eyedropper: false, panelOpen: false, leaving: false }

  it('con la botonera en pantalla, se sale del editor', () => {
    expect(editorExit(cerrado)).toBe('LEAVE')
  })

  it('con un panel abierto, cierra el panel y no el editor', () => {
    // The incident: here «atrás» left and lost the work without applying it.
    expect(editorExit({ ...cerrado, panelOpen: true })).toBe('CLOSE_PANEL')
  })

  it('con el cuentagotas armado, lo desarma antes de tocar el panel', () => {
    // It is armed FROM the colour panel, so it is the inner layer: disarm
    // first and close the panel on the next tap.
    expect(editorExit({ ...cerrado, eyedropper: true, panelOpen: true })).toBe(
      'DISARM_EYEDROPPER',
    )
  })

  it('el cuentagotas sin panel también se desarma antes de salir', () => {
    expect(editorExit({ ...cerrado, eyedropper: true })).toBe('DISARM_EYEDROPPER')
  })

  it('la salida del editor no pela nada, ni con un panel abierto', () => {
    // The ✕, «Cancelar» and «Aplicar» are visible with the panel open. From there
    // «Aplicar» applies: peeling first would be a button that does nothing.
    expect(editorExit({ eyedropper: false, panelOpen: true, leaving: true })).toBe('LEAVE')
    expect(editorExit({ eyedropper: true, panelOpen: true, leaving: true })).toBe('LEAVE')
  })
})
