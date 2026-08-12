// @vitest-environment jsdom
import { useState } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { MarkupField } from './MarkupField'
import { MarkupText } from './MarkupText'

/**
 * RF-1616: pegar una biografía de una web y que conserve su forma.
 *
 * Lo que aquí se comprueba es lo único que no puede comprobar el intérprete: **que el
 * pegado pasa por él**. `markupPaste` tiene su propia batería con el HTML de una web
 * real; esto verifica el cable — que el campo lee el `text/html` del portapapeles, y que
 * cuando no hay HTML no estorba, que es lo que pasa en un teléfono.
 */

function Caso({ initial = '' }: { initial?: string }) {
  const [value, setValue] = useState(initial)
  return (
    <>
      <MarkupField label="Biografía" value={value} onChange={setValue} />
      <pre data-testid="valor">{value}</pre>
    </>
  )
}

/** Un portapapeles con lo que se le ponga: jsdom no trae `DataTransfer` usable. */
const clipboard = (data: { html?: string; text?: string }) => ({
  clipboardData: {
    getData: (type: string) => (type === 'text/html' ? data.html ?? '' : data.text ?? ''),
  },
})

const written = () => screen.getByTestId('valor').textContent

afterEach(() => {
  Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true })
})

describe('el campo de un texto con marcas', () => {
  it('al pegar HTML guarda marcas, no HTML', () => {
    render(<Caso />)
    fireEvent.paste(
      screen.getByLabelText('Biografía'),
      clipboard({ html: '<h2>Biografía</h2><ul><li>1985 · Badajoz</li></ul>', text: 'Biografía 1985' }),
    )
    expect(written()).toContain('## Biografía')
    expect(written()).toContain('- 1985 · Badajoz')
    expect(written()).not.toContain('<')
  })

  it('sin HTML pega el texto tal cual, que es lo que llega de un teléfono', () => {
    render(<Caso />)
    fireEvent.paste(screen.getByLabelText('Biografía'), clipboard({ text: 'Nació en Badajoz.' }))
    expect(written()).toBe('Nació en Badajoz.')
  })

  it('pega DONDE está el cursor y no al final', () => {
    render(<Caso initial="Antes. Después." />)
    const area = screen.getByLabelText('Biografía') as HTMLTextAreaElement
    area.setSelectionRange(7, 7)
    fireEvent.paste(area, clipboard({ text: 'EN MEDIO ' }))
    expect(written()).toBe('Antes. EN MEDIO Después.')
  })

  it('«Pegar con formato» lee el portapapeles del sistema, que en el móvil es la única vía al HTML', async () => {
    // Medido en un teléfono: el evento de pegar da solo texto plano. La API asíncrona sí
    // trae el HTML, pero exige un toque, así que va en un botón.
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        read: async () => [
          {
            types: ['text/html'],
            getType: async () => new Blob(['<h2>Biografía</h2><ul><li>1985</li></ul>'], { type: 'text/html' }),
          },
        ],
      },
    })
    render(<Caso />)
    fireEvent.click(screen.getByText('Pegar con formato'))
    await waitFor(() => expect(written()).toContain('## Biografía'))
    expect(written()).toContain('- 1985')
  })

  it('y si el portapapeles no trae formato, lo dice con la salida', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { readText: async () => 'Nació en Badajoz.\nSe formó en Madrid.' },
    })
    render(<Caso />)
    fireEvent.click(screen.getByText('Pegar con formato'))
    await waitFor(() => expect(written()).toContain('Nació en Badajoz.'))
    expect(screen.getByRole('status').textContent).toContain('sin formato')
  })

  it('un pegado normal sin formato avisa también, que es el caso del móvil', () => {
    render(<Caso />)
    fireEvent.paste(
      screen.getByLabelText('Biografía'),
      clipboard({ text: 'Nació en Badajoz.\nSe formó en Madrid.' }),
    )
    expect(screen.getByRole('status').textContent).toContain('Pegar con formato')
  })

  it('los botones ponen la marca alrededor de lo seleccionado', () => {
    render(<Caso initial="Nació en Badajoz." />)
    const area = screen.getByLabelText('Biografía') as HTMLTextAreaElement
    area.setSelectionRange(9, 16)
    fireEvent.click(screen.getByLabelText('Negrita'))
    expect(written()).toBe('Nació en **Badajoz**.')
  })

  it('la vista previa enseña los bloques, y no el texto con los símbolos', () => {
    render(<Caso initial={'## Exposiciones\n- 1985 · Badajoz'} />)
    fireEvent.click(screen.getByText('Ver cómo queda'))
    // La caja desaparece mientras se mira: es la misma pantalla, no dos.
    expect(screen.queryByLabelText('Biografía')).toBeNull()
    expect(screen.getByRole('listitem').textContent).toBe('1985 · Badajoz')
    expect(screen.getByText('Exposiciones')).not.toBeNull()
  })
})

describe('el texto pintado', () => {
  it('las marcas salen como elementos, y nunca como HTML de una cadena', () => {
    // Es medio motivo de que el catálogo guarde marcas: aquí no hay ningún camino por el
    // que lo escrito en una biografía se convierta en una etiqueta.
    render(<MarkupText text={'## Título\nNació en **Badajoz** y *volvió*.\n\n- Uno\n- Dos'} />)
    expect(screen.getByText('Título').tagName).toBe('P')
    expect(screen.getByText('Badajoz').tagName).toBe('STRONG')
    expect(screen.getByText('volvió').tagName).toBe('EM')
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
  })

  it('un intento de meter HTML se lee como texto', () => {
    render(<MarkupText text={'<img src=x onerror="alert(1)">'} />)
    expect(screen.getByText('<img src=x onerror="alert(1)">')).not.toBeNull()
    expect(document.querySelector('img')).toBeNull()
  })

  it('un texto vacío no pinta nada', () => {
    const { container } = render(<MarkupText text="   " />)
    expect(container.textContent).toBe('')
  })
})
