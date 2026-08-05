// @vitest-environment jsdom
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BottomSheet } from './ui'
import { useSheetGuard } from './useSheetGuard'

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

/**
 * El guardián de la hoja: no perder lo escrito por un roce (RNF-106).
 *
 * Esta batería existe por una incidencia contada dos veces: un toque involuntario en el
 * fondo oscuro —que con la hoja a tres cuartos de pantalla cae justo donde se apoya el
 * pulgar al desplazarse por un formulario largo— cerraba el panel y se perdían diez
 * minutos de tecleo, sin preguntar.
 *
 * Lo que decide qué hacer con cada salida es puro y está en `sheetExit.test.ts`. Aquí se
 * comprueba lo que ningún test de lógica alcanza: que las CUATRO salidas de la hoja pasan
 * de verdad por ese guardián, incluido el botón de atrás del móvil, que es el que lleva
 * historia detrás y el que ya se ha roto dos veces en este proyecto.
 */
describe('BottomSheet, no perder lo escrito por un roce', () => {
  it('en un formulario, el fondo deja de ser un botón: ni cierra ni se anuncia', () => {
    const onClose = vi.fn()
    render(<Guarded onClose={onClose} />)
    // Un solo «Cerrar», el de la cabecera: el fondo no se anuncia como salida a un
    // lector de pantalla porque ya no lo es.
    expect(screen.getAllByRole('button', { name: 'Cerrar' })).toHaveLength(1)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('con algo escrito, la ✕ pregunta en vez de cerrar', async () => {
    const onClose = vi.fn()
    render(<Guarded onClose={onClose} />)
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar' }))
    expect(onClose).not.toHaveBeenCalled()
    // Y lo escrito sigue ahí detrás: preguntar no desmonta el formulario.
    expect(screen.getByText('contenido')).not.toBeNull()
    expect(screen.getByRole('alertdialog')).not.toBeNull()
  })

  it('«Seguir rellenando» devuelve al formulario, y «Salir y perderlo» cierra', async () => {
    const onClose = vi.fn()
    render(<Guarded onClose={onClose} />)
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar' }))
    await userEvent.click(screen.getByRole('button', { name: 'Seguir rellenando' }))
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.queryByRole('alertdialog')).toBeNull()

    await userEvent.click(screen.getByRole('button', { name: 'Cerrar' }))
    await userEvent.click(screen.getByRole('button', { name: 'Salir y perderlo' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('en blanco no pregunta: una pregunta que sale siempre se despacha sin leerla', async () => {
    const onClose = vi.fn()
    render(<Guarded onClose={onClose} dirty={false} />)
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar' }))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })

  it('Escape pregunta, y con la pregunta delante Escape la retira sin salir', async () => {
    const onClose = vi.fn()
    render(<Guarded onClose={onClose} />)
    await userEvent.keyboard('{Escape}')
    expect(screen.getByRole('alertdialog')).not.toBeNull()
    expect(onClose).not.toHaveBeenCalled()

    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('alertdialog')).toBeNull()
    // Lo importante: el segundo Escape NO ha salido. Un atrás de más con el cartel
    // delante no puede ser la pulsación que pierde los datos.
    expect(onClose).not.toHaveBeenCalled()
  })

  it('el botón de atrás pregunta, y su entrada de historia se vuelve a empujar', async () => {
    // El caso que de verdad importa en un móvil, y el que tiene historia detrás: si la
    // entrada no se repusiera, el siguiente atrás se saldría de la ficha con los datos
    // dentro. `useCloseOnBack` sabe volver a empujarla cuando el cierre se niega.
    const onClose = vi.fn()
    window.history.pushState({ screen: 'ficha' }, '')
    render(<Guarded onClose={onClose} />)
    await waitFor(() => expect(window.history.state?.modalKey).toBeTruthy())

    window.history.back()
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeNull())
    expect(onClose).not.toHaveBeenCalled()
    // Repuesta: la hoja sigue tapando una entrada propia, así que el atrás siguiente
    // vuelve aquí y no a la pantalla anterior.
    await waitFor(() => expect(window.history.state?.modalKey).toBeTruthy())

    window.history.back()
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    expect(onClose).not.toHaveBeenCalled()
  })

  it('el «Cancelar» del pie es la quinta salida, y también pregunta', async () => {
    // Es la que no controla `BottomSheet`: la pinta el formulario, en el mismo componente
    // que pinta la hoja. Dejarla fuera del guardián sería dejar un camino que pierde los
    // datos, y encima el más fácil de pulsar — está pegado a «Guardar».
    const onClose = vi.fn()
    render(<Guarded onClose={onClose} />)
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByRole('alertdialog')).not.toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Salir y perderlo' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('si lo escrito desaparece, la pregunta no se queda hablando de nada', async () => {
    // Pasa cuando el guardado termina y limpia el borrador con la pregunta en pantalla:
    // un cartel que dice «vas a perder lo escrito» sobre un formulario vacío es ruido.
    function Caso() {
      const [dirty, setDirty] = useState(true)
      return (
        <>
          <button type="button" onClick={() => setDirty(false)}>
            Vaciar
          </button>
          <Guarded onClose={() => {}} dirty={dirty} />
        </>
      )
    }
    render(<Caso />)
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar' }))
    expect(screen.getByRole('alertdialog')).not.toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Vaciar' }))
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })

  it('la hoja puede añadir a la pregunta lo que la frase general no sabe', async () => {
    render(
      <Guarded
        onClose={() => {}}
        discardNotice="El fichero elegido habría que volver a elegirlo."
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar' }))
    expect(screen.getByRole('alertdialog').textContent).toContain('volver a elegirlo')
  })

  it('cerrada la hoja, la pregunta no espera a la siguiente que se abra', async () => {
    function Caso() {
      const [open, setOpen] = useState(true)
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Abrir
          </button>
          <Guarded open={open} onClose={() => setOpen(false)} />
        </>
      )
    }
    render(<Caso />)
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar' }))
    await userEvent.click(screen.getByRole('button', { name: 'Salir y perderlo' }))
    await userEvent.click(screen.getByRole('button', { name: 'Abrir' }))
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })
})

/**
 * Una hoja con guardián, como la monta cualquier formulario de la aplicación: el hook lo
 * llama el componente que pinta la hoja, que es donde vive el «Cancelar» del pie.
 */
function Guarded({
  onClose,
  dirty = true,
  backdropCloses = false,
  discardNotice,
  open = true,
}: {
  onClose: () => void
  dirty?: boolean
  backdropCloses?: boolean
  discardNotice?: string | null
  open?: boolean
}) {
  const guard = useSheetGuard({ onClose, dirty, backdropCloses, discardNotice })
  return (
    <BottomSheet open={open} onClose={onClose} title="Corregir" guard={guard}>
      <p>contenido</p>
      <button type="button" onClick={guard.cancel}>
        Cancelar
      </button>
    </BottomSheet>
  )
}
