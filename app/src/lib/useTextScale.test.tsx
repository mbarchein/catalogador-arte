// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TEXT_SCALE_KEY, textScaleFontSize } from './textScale'
import { setTextScale, useBaseTextScaleHere, useTextScale } from './useTextScale'

/**
 * El tamaño de letra aplicado de verdad.
 *
 * Lo que decide está en `textScale.test.ts`, en node. Aquí se comprueba lo que ningún test
 * de lógica alcanza: que la raíz cambia —que es lo que mueve el `rem` de toda la
 * aplicación—, que se recuerda, y sobre todo **que el editor de fotografía se queda al
 * tamaño normal y lo restituye al salir**. Esa exención es la parte que puede romperse en
 * silencio: si no restituyera, agrandar la letra y abrir una fotografía la dejaría pequeña
 * para el resto de la sesión.
 */

function Muestra() {
  const scale = useTextScale()
  return (
    <div>
      <p data-actual>{scale}</p>
      <button type="button" onClick={() => setTextScale('LARGE')}>
        Grande
      </button>
      <button type="button" onClick={() => setTextScale('LARGER')}>
        Más grande
      </button>
      <button type="button" onClick={() => setTextScale('NORMAL')}>
        Normal
      </button>
    </div>
  )
}

/** El editor de fotografía: mientras vive, la raíz vuelve al tamaño base. */
function Editor() {
  useBaseTextScaleHere()
  return <p>editor</p>
}

const raiz = () => document.documentElement.style.fontSize
const actual = () => screen.getByText(/./, { selector: '[data-actual]' }).textContent

beforeEach(() => {
  window.localStorage.clear()
  document.documentElement.style.removeProperty('font-size')
  setTextScale('NORMAL')
  window.localStorage.clear()
})

afterEach(() => {
  document.documentElement.style.removeProperty('font-size')
})

describe('useTextScale, el tamaño aplicado a la raíz', () => {
  it('el escalón normal no deja nada puesto en la raíz', async () => {
    // Fijar 16px clavaría el tamaño contra quien lo haya agrandado desde el sistema, y eso
    // el navegador ya sabía hacerlo antes de que existiera este ajuste.
    render(<Muestra />)
    expect(raiz()).toBe('')
    expect(actual()).toBe('NORMAL')
  })

  it('elegir un escalón mueve la raíz y se recuerda', async () => {
    const user = userEvent.setup()
    render(<Muestra />)
    await user.click(screen.getByRole('button', { name: 'Grande' }))
    expect(raiz()).toBe(textScaleFontSize('LARGE'))
    expect(window.localStorage.getItem(TEXT_SCALE_KEY)).toBe('LARGE')
    expect(actual()).toBe('LARGE')
  })

  it('y volver al normal lo quita, no lo fija', async () => {
    const user = userEvent.setup()
    render(<Muestra />)
    await user.click(screen.getByRole('button', { name: 'Más grande' }))
    expect(raiz()).toBe(textScaleFontSize('LARGER'))
    await user.click(screen.getByRole('button', { name: 'Normal' }))
    expect(raiz()).toBe('')
    expect(window.localStorage.getItem(TEXT_SCALE_KEY)).toBe('NORMAL')
  })

  it('lo ven a la vez todos los que lo miran, y no solo quien lo tocó', async () => {
    // El perfil lo cambia y el editor lo suspende: son dos sitios tocando el mismo dato, y
    // sin almacén compartido el segundo se quedaría con un valor viejo.
    const user = userEvent.setup()
    render(
      <>
        <Muestra />
        <Muestra />
      </>,
    )
    await user.click(screen.getAllByRole('button', { name: 'Grande' })[0]!)
    const vistos = screen.getAllByText(/./, { selector: '[data-actual]' }).map((n) => n.textContent)
    expect(vistos).toEqual(['LARGE', 'LARGE'])
  })
})

describe('useBaseTextScaleHere, la exención del editor de fotografía', () => {
  it('devuelve la raíz al tamaño base mientras está abierto', async () => {
    const user = userEvent.setup()
    render(<Muestra />)
    await user.click(screen.getByRole('button', { name: 'Más grande' }))
    expect(raiz()).toBe(textScaleFontSize('LARGER'))

    const editor = render(<Editor />)
    expect(raiz()).toBe('16px')
    editor.unmount()
  })

  it('y lo RESTITUYE al cerrarlo', async () => {
    // Lo que se rompería en silencio: agrandar la letra, abrir una fotografía y quedarse con
    // la interfaz pequeña el resto de la sesión, sin saber por qué.
    const user = userEvent.setup()
    render(<Muestra />)
    await user.click(screen.getByRole('button', { name: 'Grande' }))

    const editor = render(<Editor />)
    expect(raiz()).toBe('16px')
    editor.unmount()
    expect(raiz()).toBe(textScaleFontSize('LARGE'))
  })

  it('y restituye el tamaño de AHORA, no el que había al abrirlo', async () => {
    // Cambiar el ajuste con el editor abierto es raro, pero capturar el valor al montar
    // dejaría el editor deshaciendo el cambio al salir, que es peor que raro: es
    // inexplicable.
    const user = userEvent.setup()
    render(<Muestra />)
    const editor = render(<Editor />)
    expect(raiz()).toBe('16px')
    await user.click(screen.getByRole('button', { name: 'Más grande' }))
    editor.unmount()
    expect(raiz()).toBe(textScaleFontSize('LARGER'))
  })

  it('desde el tamaño normal, cerrarlo tampoco deja nada puesto', async () => {
    render(<Muestra />)
    const editor = render(<Editor />)
    expect(raiz()).toBe('16px')
    editor.unmount()
    expect(raiz()).toBe('')
  })
})
