// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TEXT_SCALE_KEY, textScaleFontSize } from './textScale'
import { setTextScale, useBaseTextScaleHere, useTextScale } from './useTextScale'

/**
 * The text size really applied.
 *
 * What decides is in `textScale.test.ts`, in node. Here what no logic test
 * reaches is checked: that the root changes —which is what moves the `rem` of the whole
 * application—, that it is remembered, and above all **that the photograph editor stays at the
 * normal size and restores it on leaving**. That exemption is the part that can break in
 * silence: if it did not restore, enlarging the text and opening a photograph would leave it small
 * for the rest of the session.
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

/** The photograph editor: while it lives, the root goes back to the base size. */
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
    // Pinning 16px would nail the size against whoever has enlarged it from the system, and that
    // the browser already knew how to do before this setting existed.
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
    // The profile changes it and the editor suspends it: they are two places touching the same datum, and
    // without a shared store the second would be left with an old value.
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
    // What would break in silence: enlarging the text, opening a photograph and being left with
    // the interface small for the rest of the session, without knowing why.
    const user = userEvent.setup()
    render(<Muestra />)
    await user.click(screen.getByRole('button', { name: 'Grande' }))

    const editor = render(<Editor />)
    expect(raiz()).toBe('16px')
    editor.unmount()
    expect(raiz()).toBe(textScaleFontSize('LARGE'))
  })

  it('y restituye el tamaño de AHORA, no el que había al abrirlo', async () => {
    // Changing the setting with the editor open is rare, but capturing the value on mounting
    // would leave the editor undoing the change on leaving, which is worse than rare: it is
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
