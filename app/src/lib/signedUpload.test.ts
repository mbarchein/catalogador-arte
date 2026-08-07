import { afterEach, describe, expect, it, vi } from 'vitest'
import { putSignedFile } from './signedUpload'

/**
 * RNF-106 (the wait is legible) and ADR-002 (the master travels untouched).
 *
 * Driven against a fake `XMLHttpRequest` installed on `globalThis`, which is what lets
 * the interesting cases be checked at all: a progress event mid-flight, a transfer that
 * is cut, and a browser that will not say how much it is sending. None of the three can
 * be produced by making a real request.
 */

interface Sent {
  method: string
  url: string
  headers: Record<string, string>
  body: Blob
}

/** The last fake created, so a test can drive its callbacks. */
let last: FakeXhr | null = null

class FakeXhr {
  upload: { onprogress: ((e: { lengthComputable: boolean; loaded: number; total: number }) => void) | null } = {
    onprogress: null,
  }
  status = 0
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  onabort: (() => void) | null = null
  ontimeout: (() => void) | null = null
  sent: Sent | null = null
  private method = ''
  private url = ''
  private headers: Record<string, string> = {}

  constructor() {
    last = this
  }
  open(method: string, url: string) {
    this.method = method
    this.url = url
  }
  setRequestHeader(name: string, value: string) {
    this.headers[name] = value
  }
  send(body: Blob) {
    this.sent = { method: this.method, url: this.url, headers: this.headers, body }
  }
  /** The transfer arrives with this status. */
  finish(status: number) {
    this.status = status
    this.onload?.()
  }
}

function installFake() {
  last = null
  ;(globalThis as { XMLHttpRequest?: unknown }).XMLHttpRequest = FakeXhr
  return () => last as FakeXhr
}

afterEach(() => {
  delete (globalThis as { XMLHttpRequest?: unknown }).XMLHttpRequest
})

const blob = () => new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' })

describe('putSignedFile', () => {
  it('sends the body straight through, PUT and with the signed content type (ADR-002)', async () => {
    const xhr = installFake()
    const body = blob()
    const promise = putSignedFile('https://b2.example/x?sig=1', body, 'image/jpeg')
    const sent = xhr().sent
    expect(sent?.method).toBe('PUT')
    expect(sent?.url).toBe('https://b2.example/x?sig=1')
    // Not wrapped, not re-encoded, not copied: the very same object. This is the archive
    // document, and what makes it one is that nobody touched it on the way out.
    expect(sent?.body).toBe(body)
    // Repeating the signed type exactly is what makes S3 accept the signature.
    expect(sent?.headers['Content-Type']).toBe('image/jpeg')
    xhr().finish(200)
    await expect(promise).resolves.toEqual({ ok: true, status: 200 })
  })

  it('reports how much has gone out while it goes (RNF-106)', async () => {
    const xhr = installFake()
    const seen: { loaded: number; total: number | null }[] = []
    const promise = putSignedFile('https://b2.example/x', blob(), 'image/jpeg', (e) => seen.push(e))
    xhr().upload.onprogress?.({ lengthComputable: true, loaded: 1_048_576, total: 12_000_000 })
    xhr().upload.onprogress?.({ lengthComputable: true, loaded: 6_000_000, total: 12_000_000 })
    xhr().finish(200)
    await promise
    expect(seen).toEqual([
      { loaded: 1_048_576, total: 12_000_000 },
      { loaded: 6_000_000, total: 12_000_000 },
    ])
  })

  it('says «no lo sé» instead of inventing a total', async () => {
    // `lengthComputable` false. Passing the blob's own size here would turn a guess into
    // a measurement, and the percentage on screen would be fiction.
    const xhr = installFake()
    const seen: { loaded: number; total: number | null }[] = []
    const promise = putSignedFile('https://b2.example/x', blob(), 'image/jpeg', (e) => seen.push(e))
    xhr().upload.onprogress?.({ lengthComputable: false, loaded: 4_096, total: 0 })
    xhr().finish(200)
    await promise
    expect(seen).toEqual([{ loaded: 4_096, total: null }])
  })

  it('resolves on a refusal, because that is an answer', async () => {
    // A 4xx/5xx is information the caller acts on — the master aborts the shot, the
    // corrected copy leaves the row pending. Rejecting here would flatten the two.
    const xhr = installFake()
    const promise = putSignedFile('https://b2.example/x', blob(), 'image/jpeg')
    xhr().finish(503)
    await expect(promise).resolves.toEqual({ ok: false, status: 503 })
  })

  it('rejects when the transfer never got an answer, and says which way it went', async () => {
    // The failure this whole change is about: two minutes of a big file over a storeroom
    // connection and then nothing. «Failed to fetch» is what it used to say.
    const cut = installFake()
    const cutPromise = putSignedFile('https://b2.example/x', blob(), 'image/jpeg')
    cut().onerror?.()
    await expect(cutPromise).rejects.toThrow('La conexión se ha cortado durante el envío.')

    const slow = installFake()
    const slowPromise = putSignedFile('https://b2.example/x', blob(), 'image/jpeg')
    slow().ontimeout?.()
    await expect(slowPromise).rejects.toThrow('El envío ha tardado demasiado')

    const stopped = installFake()
    const stoppedPromise = putSignedFile('https://b2.example/x', blob(), 'image/jpeg')
    stopped().onabort?.()
    await expect(stoppedPromise).rejects.toThrow('El envío se ha interrumpido.')
  })

  it('does not attach a progress listener when nobody asked for one', async () => {
    const xhr = installFake()
    const promise = putSignedFile('https://b2.example/x', blob(), 'image/jpeg')
    expect(xhr().upload.onprogress).toBeNull()
    xhr().finish(200)
    await promise
  })

  it('fails with a sentence and not a crash where there is no XMLHttpRequest', async () => {
    delete (globalThis as { XMLHttpRequest?: unknown }).XMLHttpRequest
    await expect(putSignedFile('https://b2.example/x', blob(), 'image/jpeg')).rejects.toThrow(
      'Este navegador no puede subir ficheros.',
    )
  })

  it('never touches the network by itself', async () => {
    // Belt and braces: if this module ever fell back to `fetch` the progress would go
    // silently missing and the screen would be back to saying nothing for two minutes.
    const spy = vi.fn()
    const previous = globalThis.fetch
    globalThis.fetch = spy as unknown as typeof fetch
    const xhr = installFake()
    const promise = putSignedFile('https://b2.example/x', blob(), 'image/jpeg')
    xhr().finish(200)
    await promise
    expect(spy).not.toHaveBeenCalled()
    globalThis.fetch = previous
  })
})
