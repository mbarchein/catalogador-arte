// @vitest-environment jsdom
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
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
 * cierre, que tocar fuera cierre, que el «atrás» del móvil cierre la hoja y no la
 * pantalla, y que lo que se le cuelga de la cabecera se pinte donde se espera. Si
 * esto se rompe, se rompe en varias pantallas a la vez.
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

  it('el «atrás» del móvil la cierra, y no sale de la pantalla', async () => {
    // La salida que el pulgar encuentra sin apuntar, y la única que hay en la
    // aplicación instalada, donde no queda barra del navegador. Lo que hace que
    // funcione está en `useCloseOnBack` y tiene sus propios tests; aquí se
    // comprueba que la hoja —el modal que comparten catorce pantallas— lo usa.
    window.history.pushState({ screen: 'ficha' }, '')
    const onClose = vi.fn()
    // Con su estado, como la usa cualquier pantalla: cerrar la hoja es dejar de
    // pasarle `open`, y sin eso el test no probaría el caso real.
    function Ficha() {
      const [open, setOpen] = useState(true)
      return (
        <BottomSheet
          open={open}
          onClose={() => {
            onClose()
            setOpen(false)
          }}
          title="Filtros"
        >
          <p>contenido</p>
        </BottomSheet>
      )
    }
    render(<Ficha />)

    window.history.back()

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    expect(screen.queryByText('contenido')).toBeNull()
    // Y no se ha salido de la ficha: lo que el «atrás» ha consumido es la entrada
    // de la hoja.
    expect(window.history.state).toEqual({ screen: 'ficha' })
  })

  it('cerrada por otro camino no deja la hoja fuera del historial', async () => {
    // Escape, la ✕ y tocar fuera pasan por `onClose`, y quien lo recibe cierra la
    // hoja: la entrada que se empujó al abrir tiene que consumirse ahí, o el
    // «atrás» siguiente no haría nada y parecería averiado.
    window.history.pushState({ screen: 'listado' }, '')
    window.history.pushState({ screen: 'ficha' }, '')
    const { unmount } = render(
      <BottomSheet open onClose={() => {}} title="Filtros">
        <p>contenido</p>
      </BottomSheet>,
    )

    unmount()

    await waitFor(() => expect(window.history.state).toEqual({ screen: 'ficha' }))
    window.history.back()
    await waitFor(() => expect(window.history.state).toEqual({ screen: 'listado' }))
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
