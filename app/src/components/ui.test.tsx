// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BottomSheet } from './ui'

/**
 * El primer test de pantalla del proyecto, y está aquí a propósito.
 *
 * Hasta hoy había sesenta y seis ficheros `.tsx` y ningún test de ninguno: de cada
 * pantalla respondían el compilador y las funciones puras que hubiera detrás, y
 * nada más. Todo lo que era gesto, foco o «se ve o no se ve» quedaba fuera.
 *
 * Se empieza por `BottomSheet` porque es el componente compartido por más
 * pantallas —los filtros de la lista, los paneles de la ficha— y porque lo que
 * hace es exactamente lo que un test de lógica pura no puede alcanzar: que Escape
 * cierre, que tocar fuera cierre, y que lo que se le cuelga de la cabecera se
 * pinte donde se espera. Si esto se rompe, se rompe en varias pantallas a la vez.
 *
 * Nota de método para quien añada más: **la marca `@vitest-environment jsdom` de la
 * primera línea es obligatoria**. Sin ella el fichero corre en node y falla con
 * «document is not defined», que no dice lo que pasa. Los tests de lógica pura no
 * la llevan y siguen en node, que es lo que mantiene rápida la batería.
 */
describe('BottomSheet, la hoja que comparten los paneles (RNF-106)', () => {
  it('no pinta nada cuando está cerrada', () => {
    render(
      <BottomSheet open={false} onClose={() => {}} title="Filtros">
        <p>contenido</p>
      </BottomSheet>,
    )
    // Cerrada de verdad y no escondida con CSS: el contenido no está en el
    // documento, así que no lo lee un lector de pantalla ni lo alcanza el tabulador.
    expect(screen.queryByText('contenido')).toBeNull()
  })

  it('abierta es un diálogo con su título accesible', () => {
    render(
      <BottomSheet open onClose={() => {}} title="Filtros y orden">
        <p>contenido</p>
      </BottomSheet>,
    )
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveProperty('ariaModal', 'true')
    expect(screen.getByRole('dialog', { name: 'Filtros y orden' })).toBe(dialog)
    expect(screen.getByText('contenido')).not.toBeNull()
  })

  it('Escape la cierra', async () => {
    const onClose = vi.fn()
    render(
      <BottomSheet open onClose={onClose} title="Filtros">
        <p>contenido</p>
      </BottomSheet>,
    )
    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('Escape no hace nada cuando está cerrada', async () => {
    // El listener se registra solo mientras está abierta. Si quedara puesto, Escape
    // cerraría una hoja que no está abierta y, peor, se llevaría el Escape de quien
    // sí lo esperaba: el editor de fotografías depende de esa tecla.
    const onClose = vi.fn()
    render(
      <BottomSheet open={false} onClose={onClose} title="Filtros">
        <p>contenido</p>
      </BottomSheet>,
    )
    await userEvent.keyboard('{Escape}')
    expect(onClose).not.toHaveBeenCalled()
  })

  it('tocar fuera la cierra', async () => {
    const onClose = vi.fn()
    render(
      <BottomSheet open onClose={onClose} title="Filtros">
        <p>contenido</p>
      </BottomSheet>,
    )
    // Hay dos «Cerrar»: el fondo y el botón de la cabecera. El fondo es el primero.
    const [fondo] = screen.getAllByRole('button', { name: 'Cerrar' })
    await userEvent.click(fondo!)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('la acción de la cabecera se pinta, y el cierre sigue siendo el último', () => {
    // La posición importa y está razonada en el componente: el cierre se queda
    // pegado al borde para que el pulgar aprenda dónde está la salida, y lo que se
    // añada va a su izquierda. Un test que solo comprobara «se pinta» dejaría pasar
    // el cambio que mueve la salida.
    render(
      <BottomSheet
        open
        onClose={() => {}}
        title="Filtros"
        headerAction={<button type="button">Quitar filtros</button>}
      >
        <p>contenido</p>
      </BottomSheet>,
    )
    const accion = screen.getByRole('button', { name: 'Quitar filtros' })
    const cierre = screen.getAllByRole('button', { name: 'Cerrar' }).at(-1)!
    expect(accion).not.toBeNull()
    // Ambos cuelgan del mismo contenedor y la acción va antes que el cierre.
    expect(accion.parentElement).toBe(cierre.parentElement)
    expect(
      accion.compareDocumentPosition(cierre) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it('sin acción de cabecera no aparece ningún control de más', () => {
    render(
      <BottomSheet open onClose={() => {}} title="Filtros">
        <p>contenido</p>
      </BottomSheet>,
    )
    // El fondo y el cierre, y nada más: es lo que garantiza que la ranura vacía no
    // deja un hueco pulsable.
    expect(screen.getAllByRole('button')).toHaveLength(2)
  })
})
