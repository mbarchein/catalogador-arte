// @vitest-environment jsdom
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { draftStorageKey, packDraft } from './draftStore'
import { useFormDraft } from './useFormDraft'

/**
 * The draft that survives closing the sheet, with a real `localStorage`.
 *
 * What decides lives in `draftStore.test.ts`, in node. Here the wiring is checked, which
 * is where this breaks in three concrete ways:
 *
 *   · **reading it more than once**, whereby the draft reappears after being discarded and,
 *     worse, offers itself: what has just been typed is stored, and a later
 *     read finds it and presents it as if it were from another session;
 *   · **not cleaning it up on saving**, whereby on returning a draft identical to
 *     what is already in the catalogue is offered;
 *   · **writing on every keystroke**, which on a modest phone is felt while typing.
 */

const SCOPE = 'prueba:1'
const KEY = draftStorageKey(SCOPE)

function Caso({ inicial = '' }: { inicial?: string }) {
  const [title, setTitle] = useState(inicial)
  const stored = useFormDraft({
    scope: SCOPE,
    draft: { title },
    dirty: title.trim() !== inicial.trim(),
  })
  return (
    <div>
      <input aria-label="título" value={title} onChange={(e) => setTitle(e.target.value)} />
      <p data-oferta>{stored.offer?.text ?? 'sin oferta'}</p>
      <button
        type="button"
        onClick={() => {
          const recovered = stored.accept()
          if (recovered !== null) setTitle(recovered.title)
        }}
      >
        Recuperar
      </button>
      <button type="button" onClick={stored.discard}>
        Descartar
      </button>
      <button type="button" onClick={stored.clear}>
        Guardar
      </button>
    </div>
  )
}

const oferta = () => screen.getByText(/./, { selector: '[data-oferta]' }).textContent

beforeEach(() => {
  window.localStorage.clear()
  vi.useFakeTimers({ shouldAdvanceTime: true })
})

afterEach(() => {
  vi.useRealTimers()
  window.localStorage.clear()
})

describe('useFormDraft, el cableado del borrador', () => {
  it('sin nada guardado no ofrece nada', () => {
    render(<Caso />)
    expect(oferta()).toBe('sin oferta')
  })

  it('lo escrito se guarda, pero con retardo y no en cada tecla', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<Caso />)
    await user.type(screen.getByLabelText('título'), 'Carta')
    // Right after typing there is nothing: a `setItem` per keystroke is synchronous and
    // blocks the interface thread, which on a modest phone is felt while typing.
    expect(window.localStorage.getItem(KEY)).toBeNull()

    await vi.advanceTimersByTimeAsync(600)
    const raw = window.localStorage.getItem(KEY)
    expect(raw).not.toBeNull()
    expect(JSON.parse(raw!).draft).toEqual({ title: 'Carta' })
  })

  it('vaciar el formulario a mano borra el borrador', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<Caso />)
    await user.type(screen.getByLabelText('título'), 'Carta')
    await vi.advanceTimersByTimeAsync(600)
    expect(window.localStorage.getItem(KEY)).not.toBeNull()

    // Leaving it in place would make the sheet offer on return what was just deliberately
    // taken away.
    await user.clear(screen.getByLabelText('título'))
    await waitFor(() => expect(window.localStorage.getItem(KEY)).toBeNull())
  })

  it('lo guardado se ofrece al abrir, con el «hace…» dentro', () => {
    window.localStorage.setItem(
      KEY,
      packDraft({ draft: { title: 'Carta' }, at: new Date(Date.now() - 15 * 60_000), fingerprint: null }),
    )
    render(<Caso />)
    expect(oferta()).toContain('hace 15 minutos')
    expect(oferta()).toContain('¿Lo recuperas?')
  })

  it('y se ofrece ya en el PRIMER pintado, no un instante después', () => {
    // With an effect, the form would paint empty and the offer would appear afterwards: in
    // that gap there is room to start typing over it.
    window.localStorage.setItem(
      KEY,
      packDraft({ draft: { title: 'Carta' }, at: new Date(), fingerprint: null }),
    )
    const { container } = render(<Caso />)
    expect(container.querySelector('[data-oferta]')?.textContent).not.toBe('sin oferta')
  })

  it('recuperarlo lo mete en el formulario y retira la oferta', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    window.localStorage.setItem(
      KEY,
      packDraft({ draft: { title: 'Carta de la galería' }, at: new Date(), fingerprint: null }),
    )
    render(<Caso />)
    await user.click(screen.getByRole('button', { name: 'Recuperar' }))
    expect((screen.getByLabelText('título') as HTMLInputElement).value).toBe('Carta de la galería')
    expect(oferta()).toBe('sin oferta')
  })

  it('descartarlo lo borra, y no reaparece', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    window.localStorage.setItem(
      KEY,
      packDraft({ draft: { title: 'Carta' }, at: new Date(), fingerprint: null }),
    )
    render(<Caso />)
    await user.click(screen.getByRole('button', { name: 'Descartar' }))
    expect(oferta()).toBe('sin oferta')
    expect(window.localStorage.getItem(KEY)).toBeNull()
  })

  it('lo que se acaba de teclear NO se ofrece a sí mismo', async () => {
    // The failure a re-read per render would have: what was typed is stored, read back,
    // and the sheet asks whether to recover what is already on screen.
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<Caso />)
    await user.type(screen.getByLabelText('título'), 'Carta')
    await vi.advanceTimersByTimeAsync(1200)
    expect(oferta()).toBe('sin oferta')
  })

  it('al guardar de verdad se limpia: a la vuelta no se ofrece lo ya guardado', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<Caso />)
    await user.type(screen.getByLabelText('título'), 'Carta')
    await vi.advanceTimersByTimeAsync(600)
    await user.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(window.localStorage.getItem(KEY)).toBeNull()
  })

  it('abrir la hoja limpia NO borra el borrador que acaba de ofrecer', async () => {
    // The failure, found in Chromium: a correction sheet opens with the stored row, that
    // is, clean, and the rule of «clean, so out with the draft» fired in the mount
    // effect. The offer was still read —it is read before the effects— but underneath there
    // was nothing left, so recovering it and reloading, or leaving without saving, lost it.
    window.localStorage.setItem(
      KEY,
      packDraft({ draft: { title: 'Carta a medias' }, at: new Date(), fingerprint: null }),
    )
    render(<Caso inicial="Carta de la galería" />)
    expect(oferta()).toContain('a medio rellenar')
    await vi.advanceTimersByTimeAsync(800)
    expect(window.localStorage.getItem(KEY)).not.toBeNull()
  })

  it('y descartarlo desde ahí sí lo borra, y ya no vuelve', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    window.localStorage.setItem(
      KEY,
      packDraft({ draft: { title: 'Carta a medias' }, at: new Date(), fingerprint: null }),
    )
    render(<Caso inicial="Carta de la galería" />)
    await user.click(screen.getByRole('button', { name: 'Descartar' }))
    await vi.advanceTimersByTimeAsync(800)
    expect(window.localStorage.getItem(KEY)).toBeNull()
  })

  it('un borrador ilegible no impide abrir la hoja, y se limpia lo caducado', () => {
    window.localStorage.setItem(KEY, 'basura')
    render(<Caso />)
    expect(oferta()).toBe('sin oferta')
    expect((screen.getByLabelText('título') as HTMLInputElement).value).toBe('')
  })
})
