/**
 * The PUT of a signed file, reporting how much has gone out (RNF-106).
 *
 * ── WHY NOT `fetch` ─────────────────────────────────────────
 *
 * `fetch` cannot report upload progress. A request body can be a stream, but no browser
 * in the declared target reports how much of it has been sent, and the promise resolves
 * only once the response comes back — which for a 12 MB original over the connection of a
 * storeroom is two minutes of nothing. `XMLHttpRequest` has `upload.onprogress` and has
 * had it for fifteen years; it is the older API and it is the one that answers the
 * question.
 *
 * ── WHAT MUST NOT CHANGE ────────────────────────────────────
 *
 * The body is passed straight through, untouched. For the master that object is the
 * `File` the camera produced, and what makes it an archive document is that nobody has
 * touched it (ADR-002): not wrapped, not re-encoded, not stripped of its EXIF. XHR sends
 * a `Blob` as-is, the same as `fetch` did, and there is a test pinning the identity of
 * the object that arrives here.
 *
 * The `Content-Type` header has to repeat the signed one exactly or S3 rejects the
 * signature — the same rule as before, now in one place instead of three.
 */

/** How much of the body has gone out. `total` is null when the browser will not say. */
export interface UploadProgressEvent {
  loaded: number
  total: number | null
}

export interface SignedPutResult {
  ok: boolean
  status: number
}

/**
 * What a browser gives us, narrowed to what is used here.
 *
 * Declared rather than imported from the DOM types so this module can be exercised
 * without a browser: the tests install a fake on `globalThis` and drive the callbacks by
 * hand, which is the only way to check that a progress event mid-flight reaches the
 * screen and that an aborted transfer rejects instead of resolving.
 */
interface MinimalXhrUpload {
  onprogress: ((event: { lengthComputable: boolean; loaded: number; total: number }) => void) | null
}
interface MinimalXhr {
  upload: MinimalXhrUpload
  status: number
  onload: (() => void) | null
  onerror: (() => void) | null
  onabort: (() => void) | null
  ontimeout: (() => void) | null
  open: (method: string, url: string) => void
  setRequestHeader: (name: string, value: string) => void
  send: (body: Blob) => void
}

type XhrConstructor = new () => MinimalXhr

/**
 * PUTs `body` to a signed URL and resolves with the status, whatever it is.
 *
 * A 4xx or 5xx resolves — it is an answer, and each caller decides what a refused upload
 * means for it. Only a transfer that never got an answer rejects: no network, a cut
 * halfway, a browser that gave up. That is the same split `fetch` makes, so the callers
 * did not have to change how they read the outcome.
 */
export function putSignedFile(
  url: string,
  body: Blob,
  contentType: string,
  onProgress?: (event: UploadProgressEvent) => void,
): Promise<SignedPutResult> {
  const Xhr = (globalThis as { XMLHttpRequest?: XhrConstructor }).XMLHttpRequest
  if (!Xhr) {
    return Promise.reject(new Error('Este navegador no puede subir ficheros.'))
  }

  return new Promise<SignedPutResult>((resolve, reject) => {
    const xhr = new Xhr()
    xhr.open('PUT', url)
    xhr.setRequestHeader('Content-Type', contentType)

    if (onProgress) {
      xhr.upload.onprogress = (event) => {
        // `lengthComputable` false is the honest «I do not know»: reporting `total: 0`
        // instead would make the percentage divide by zero somewhere downstream, and
        // reporting the blob's own size would be inventing a measurement.
        onProgress({ loaded: event.loaded, total: event.lengthComputable ? event.total : null })
      }
    }

    xhr.onload = () => resolve({ ok: xhr.status >= 200 && xhr.status < 300, status: xhr.status })
    // The three ways there is no answer. Distinguished in the message because they are
    // distinguishable from the outside: a cut mid-file and a browser that never got out
    // of the building are different problems for whoever is standing in the storeroom.
    xhr.onerror = () => reject(new Error('La conexión se ha cortado durante el envío.'))
    xhr.onabort = () => reject(new Error('El envío se ha interrumpido.'))
    xhr.ontimeout = () => reject(new Error('El envío ha tardado demasiado y se ha cancelado.'))

    xhr.send(body)
  })
}
