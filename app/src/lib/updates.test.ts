import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CHECK_INTERVAL_MS,
  scheduleChecks,
  type VisibilitySource,
} from './updates'

/** A fake `document` whose visibility we control. */
function fakeDocument() {
  const handlers: Array<() => void> = []
  const doc: VisibilitySource = {
    visibilityState: 'hidden',
    addEventListener: (_type, handler) => handlers.push(handler),
  }
  return {
    doc,
    setTo(state: DocumentVisibilityState) {
      doc.visibilityState = state
      handlers.forEach((h) => h())
    },
  }
}

// Complement of RF-1202: the cached shell starts instantly, but the open
// application must find out that a new version was published.
describe('new version check', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('checks periodically while the application stays open', () => {
    const check = vi.fn()
    scheduleChecks(check, fakeDocument().doc)

    expect(check).not.toHaveBeenCalled()
    vi.advanceTimersByTime(CHECK_INTERVAL_MS)
    expect(check).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(CHECK_INTERVAL_MS * 2)
    expect(check).toHaveBeenCalledTimes(3)
  })

  it('checks when the application returns to the foreground', () => {
    const check = vi.fn()
    const { doc, setTo } = fakeDocument()
    scheduleChecks(check, doc)

    setTo('visible')
    expect(check).toHaveBeenCalledTimes(1)
  })

  it('does not check when going to the background', () => {
    const check = vi.fn()
    const { doc, setTo } = fakeDocument()
    scheduleChecks(check, doc)

    setTo('hidden')
    expect(check).not.toHaveBeenCalled()
  })
})
