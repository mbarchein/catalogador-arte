// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Toggle } from './ui'

/**
 * The shared switch, and specifically being turned off entirely (RF-1106).
 *
 * `disabled` was added for the funds screen, where there is a control the
 * base is going to reject anyway —withdrawing the last active fund—. What is
 * pinned down here is what makes a control like that useless if it is half-done: that
 * besides not being pressable **it should not look pressable**, and that a tap should not call
 * anybody. A switch that looks switchable and does nothing when touched reads
 * as a breakdown, and whoever catalogues is on their feet with the artwork in front.
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
    // The normal case, which is what guards against `disabled` getting stuck on by
    // default: it would be a whole screen of dead controls.
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
