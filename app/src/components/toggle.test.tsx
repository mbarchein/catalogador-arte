// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Toggle } from './ui'

/**
 * El interruptor compartido, y en concreto el apagado del todo (RF-1106).
 *
 * `disabled` se le añadió para la pantalla de fondos, donde hay un control que la
 * base va a rechazar de todas formas —retirar el último fondo activo—. Lo que se
 * fija aquí es lo que hace inútil a un control así si se hace a medias: que
 * además de no pulsarse **no lo parezca**, y que un toque no llegue a llamar a
 * nadie. Un interruptor que se ve encendible y no hace nada al tocarlo se lee
 * como una avería, y quien cataloga está de pie con la obra delante.
 */
describe('el interruptor apagado del todo', () => {
  it('no llama a nadie al tocarlo', async () => {
    const onChange = vi.fn()
    render(<Toggle label="Se ofrece al dar de alta" active onChange={onChange} disabled />)

    await userEvent.click(screen.getByRole('switch'))

    expect(onChange).not.toHaveBeenCalled()
  })

  it('y lo dice, en vez de aparentar que se puede', () => {
    render(<Toggle label="Se ofrece al dar de alta" active onChange={vi.fn()} disabled />)

    expect((screen.getByRole('switch') as HTMLButtonElement).disabled).toBe(true)
  })

  it('sin pedirlo se pulsa y contesta lo contrario de lo que está', async () => {
    // El caso normal, que es el que protege de que `disabled` se quede pegado
    // por omisión: sería una pantalla entera de controles muertos.
    const onChange = vi.fn()
    render(<Toggle label="Sus obras salen en el listado" active onChange={onChange} />)

    await userEvent.click(screen.getByRole('switch'))

    expect(onChange).toHaveBeenCalledWith(false)
  })

  it('el estado se anuncia a quien no ve la pantalla', () => {
    render(<Toggle label="Sus obras salen en el listado" active={false} onChange={vi.fn()} />)

    expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('false')
  })
})
