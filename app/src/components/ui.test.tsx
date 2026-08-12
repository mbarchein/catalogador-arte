// @vitest-environment jsdom
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BottomSheet, ConfirmSheet } from './ui'
import { useSheetGuard } from './useSheetGuard'

/**
 * The project's first screen test, and it is here on purpose.
 *
 * Until today there were sixty-six `.tsx` files and no test of any of them: for each
 * screen the compiler and whatever pure functions lay behind answered, and
 * nothing else. Everything that was gesture, focus or «visible or not» stayed out.
 *
 * It starts with `BottomSheet` because it is the component shared by the most
 * screens —the list's filters, the record's panels— and because what it
 * does is exactly what a pure-logic test cannot reach: that Escape
 * closes, that touching outside closes, that the phone's «back» closes the sheet and not the
 * screen, and that whatever is hung from its heading is painted where expected. If
 * this breaks, it breaks in several screens at once.
 *
 * A note on method for whoever adds more: **the first line's `@vitest-environment jsdom` mark
 * is compulsory**. Without it the file runs in node and fails with
 * «document is not defined», which does not say what is happening. The pure-logic tests do not
 * carry it and stay in node, which is what keeps the suite fast.
 */
describe('BottomSheet, la hoja que comparten los paneles (RNF-106)', () => {
  it('no pinta nada cuando está cerrada', () => {
    render(
      <BottomSheet open={false} onClose={() => {}} title="Filtros">
        <p>contenido</p>
      </BottomSheet>,
    )
    // Really closed and not hidden with CSS: the content is not in the document, so a
    // screen reader does not read it and the tab key does not reach it.
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
    // The listener is registered only while it is open. If it were left in place, Escape
    // would close a sheet that is not open and, worse, it would take away the Escape of whoever
    // was expecting it: the photograph editor depends on that key.
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
    // The exit the thumb finds without aiming, and the only one there is in the
    // installed application, where there is no browser bar left. What makes it
    // work is in `useCloseOnBack` and has its own tests; here it is
    // checked that the sheet —the modal fourteen screens share— uses it.
    window.history.pushState({ screen: 'ficha' }, '')
    const onClose = vi.fn()
    // With its state, the way any screen uses it: closing the sheet is stopping passing
    // `open`, and without that the test would not exercise the real case.
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
    // And the record was not left: what «back» consumed is the sheet's entry.
    expect(window.history.state).toEqual({ screen: 'ficha' })
  })

  it('cerrada por otro camino no deja la hoja fuera del historial', async () => {
    // Escape, the ✕ and touching outside go through `onClose`, and whoever receives it closes the
    // sheet: the entry pushed on opening has to be consumed there, or the
    // next «back» would do nothing and would look broken.
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
    // There are two «Cerrar»: the backdrop and the header button. The backdrop is first.
    const [fondo] = screen.getAllByRole('button', { name: 'Cerrar' })
    await userEvent.click(fondo!)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('la acción de la cabecera se pinta, y el cierre sigue siendo el último', () => {
    // The position matters and is reasoned in the component: the close stays
    // stuck to the edge so the thumb learns where the exit is, and whatever is
    // added goes to its left. A test only checking «it is painted» would let through
    // the change that moves the exit.
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
    // Both hang off the same container and the action goes before the close.
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
    // The backdrop and the close, and nothing else: that is what guarantees the empty slot
    // leaves no pressable gap.
    expect(screen.getAllByRole('button')).toHaveLength(2)
  })
})

/**
 * The sheet's guard: not losing what was written to a brush (RNF-106).
 *
 * This suite exists because of an incident reported twice: an involuntary tap on the
 * dark backdrop —which with the sheet at three quarters of the screen falls exactly where the
 * thumb rests when scrolling through a long form— closed the panel and ten
 * minutes of typing were lost, with no question asked.
 *
 * What decides what to do with each exit is pure and lives in `sheetExit.test.ts`. Here it is
 * checked what no logic test reaches: that ALL FOUR exits of the sheet really go
 * through that guard, including the phone's back button, which is the one that carries
 * history behind it and the one that has already broken twice in this project.
 */
describe('BottomSheet, no perder lo escrito por un roce', () => {
  it('en un formulario, el fondo deja de ser un botón: ni cierra ni se anuncia', () => {
    const onClose = vi.fn()
    render(<Guarded onClose={onClose} />)
    // A single «Cerrar», the header one: the backdrop is not announced as an exit to a
    // screen reader because it no longer is one.
    expect(screen.getAllByRole('button', { name: 'Cerrar' })).toHaveLength(1)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('con algo escrito, la ✕ pregunta en vez de cerrar', async () => {
    const onClose = vi.fn()
    render(<Guarded onClose={onClose} />)
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar' }))
    expect(onClose).not.toHaveBeenCalled()
    // And what was typed is still there behind: asking does not unmount the form.
    expect(screen.getByText('contenido')).not.toBeNull()
    expect(screen.getByRole('alertdialog')).not.toBeNull()
  })

  it('«Seguir rellenando» devuelve al formulario, y «Salir sin guardar» cierra', async () => {
    const onClose = vi.fn()
    render(<Guarded onClose={onClose} />)
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar' }))
    await userEvent.click(screen.getByRole('button', { name: 'Seguir rellenando' }))
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.queryByRole('alertdialog')).toBeNull()

    await userEvent.click(screen.getByRole('button', { name: 'Cerrar' }))
    await userEvent.click(screen.getByRole('button', { name: 'Salir sin guardar' }))
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
    // The point: the second Escape did NOT leave. One back too many with the dialog in
    // front cannot be the press that loses the data.
    expect(onClose).not.toHaveBeenCalled()
  })

  it('el botón de atrás pregunta, y su entrada de historia se vuelve a empujar', async () => {
    // The case that really matters on a phone, and the one with history behind it: if the
    // entry were not put back, the next back would leave the record with the data
    // inside. `useCloseOnBack` knows how to push it again when the close is refused.
    const onClose = vi.fn()
    window.history.pushState({ screen: 'ficha' }, '')
    render(<Guarded onClose={onClose} />)
    await waitFor(() => expect(window.history.state?.modalKey).toBeTruthy())

    window.history.back()
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeNull())
    expect(onClose).not.toHaveBeenCalled()
    // Restored: the sheet still covers an entry of its own, so the next back returns here
    // and not to the previous screen.
    await waitFor(() => expect(window.history.state?.modalKey).toBeTruthy())

    window.history.back()
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    expect(onClose).not.toHaveBeenCalled()
  })

  it('el «Cancelar» del pie es la quinta salida, y también pregunta', async () => {
    // It is the one `BottomSheet` does not control: the form paints it, in the same component
    // that paints the sheet. Leaving it outside the guard would be leaving a path that loses the
    // data, and the easiest one to press at that — it is right next to «Guardar».
    const onClose = vi.fn()
    render(<Guarded onClose={onClose} />)
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByRole('alertdialog')).not.toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Salir sin guardar' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('si lo escrito desaparece, la pregunta no se queda hablando de nada', async () => {
    // It happens when the save finishes and clears the draft with the question on screen:
    // a dialog saying «vas a perder lo escrito» over an empty form is noise.
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
    await userEvent.click(screen.getByRole('button', { name: 'Salir sin guardar' }))
    await userEvent.click(screen.getByRole('button', { name: 'Abrir' }))
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })
})

describe('ConfirmSheet, la pregunta de lo que no se deshace', () => {
  const sheet = (props: Partial<Parameters<typeof ConfirmSheet>[0]> = {}) => {
    const onConfirm = vi.fn()
    const onClose = vi.fn()
    render(
      <ConfirmSheet
        open
        title="¿Quitar la obra?"
        text="Se quitará del dossier. No se borra nada del catálogo."
        confirmLabel="Sí, quitar"
        onConfirm={onConfirm}
        onClose={onClose}
        {...props}
      />,
    )
    return { onConfirm, onClose }
  }

  it('es la hoja de siempre: un diálogo con la pregunta por título', () => {
    // La hoja y no el `confirm` del navegador: sale por abajo, donde está el pulgar, y
    // se cierra por las cuatro puertas de cualquier panel.
    sheet()
    expect(screen.getByRole('dialog', { name: '¿Quitar la obra?' })).not.toBeNull()
    expect(screen.getByText(/No se borra nada del catálogo/)).not.toBeNull()
  })

  it('el botón dice qué hace, y confirmar no cierra por su cuenta', () => {
    // Cerrar es de quien la abre: la escritura puede fallar y entonces lo que hay que
    // pintar es el fallo, no una hoja cerrada como si hubiera ido bien.
    const { onConfirm, onClose } = sheet()
    screen.getByRole('button', { name: 'Sí, quitar' }).click()
    expect(onConfirm).toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('cancelar y Escape salen por la misma puerta', async () => {
    const { onClose, onConfirm } = sheet()
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(2)
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('mientras se escribe, los dos botones se apagan', () => {
    // Un segundo toque en «Sí, quitar» mandaría la misma escritura dos veces.
    sheet({ busy: true })
    expect((screen.getByRole('button', { name: 'Sí, quitar' }) as HTMLButtonElement).disabled).toBe(
      true,
    )
    expect((screen.getByRole('button', { name: 'Cancelar' }) as HTMLButtonElement).disabled).toBe(
      true,
    )
  })
})

/**
 * A sheet with a guard, as any form in the application assembles it: the hook is
 * called by the component that paints the sheet, which is where the footer's «Cancelar» lives.
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
