import { describe, expect, it } from 'vitest'
import {
  DownloadFailure,
  downloadFailureKind,
  contracted,
  downloadFailureText,
  downloadSignedFile,
  messageOf,
} from './download'

/**
 * The only path out of the external store (RF-411, RF-420).
 *
 * What is verified here is what the cataloger ends up with: the bytes on the device
 * under the name we chose, or a sentence in Spanish that says what happened and what
 * to do. The two impure edges — the request and the save — are injected, so the flow
 * itself is verified in node and not left to a browser nobody runs in CI.
 */

/** A response the store could plausibly give, without pulling in a whole fetch mock. */
function response(init: { ok?: boolean; status?: number; blob?: () => Promise<Blob> }): Response {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    blob: init.blob ?? (() => Promise.resolve(new Blob([new Uint8Array([1, 2, 3])]))),
  } as unknown as Response
}

describe('el fichero llega con el nombre que se ha pedido (RF-411)', () => {
  it('descarga y guarda: los bytes del almacén y el nombre nuestro', async () => {
    const saved: { blob: Blob; fileName: string }[] = []
    const asked: string[] = []
    await downloadSignedFile('https://s3.local/firmada?X-Amz-Expires=300', 'AR-0001_general_original.jpg', 'el original', {
      fetch: (url) => {
        asked.push(url)
        return Promise.resolve(response({}))
      },
      save: (blob, fileName) => saved.push({ blob, fileName }),
    })
    expect(asked).toEqual(['https://s3.local/firmada?X-Amz-Expires=300'])
    expect(saved).toHaveLength(1)
    expect(saved[0]?.fileName).toBe('AR-0001_general_original.jpg')
    expect(saved[0]?.blob.size).toBe(3)
  })

  it('no guarda nada cuando el almacén no ha dado el fichero', async () => {
    // Half a download saved is worse than none: a truncated JPEG opens and looks like
    // a broken photograph, and whoever receives it believes the artwork is like that.
    const saved: string[] = []
    await expect(
      downloadSignedFile('https://s3.local/firmada', 'AR-0001_general_original.jpg', 'el original', {
        fetch: () => Promise.resolve(response({ ok: false, status: 403 })),
        save: (_blob, fileName) => saved.push(fileName),
      }),
    ).rejects.toBeInstanceOf(DownloadFailure)
    expect(saved).toEqual([])
  })
})

describe('cada fallo se cuenta, y se cuenta en español (RF-411)', () => {
  it('la red que se corta antes de pedir: se nombra el fichero y qué hacer', async () => {
    const failure = await downloadSignedFile('https://s3.local/x', 'f.jpg', 'la copia corregida', {
      fetch: () => Promise.reject(new TypeError('Failed to fetch')),
      save: () => undefined,
    }).catch((e: unknown) => e)
    expect(failure).toBeInstanceOf(DownloadFailure)
    const error = failure as DownloadFailure
    expect(error.kind).toBe('network')
    expect(error.message).toContain('la copia corregida')
    expect(error.message).toContain('conexión')
    expect(error.message).toContain('vuelve a intentarlo')
    // The technical crumb travels in brackets: useless to her, decisive when she reads
    // it out over the phone.
    expect(error.message).toContain('Failed to fetch')
  })

  it('la red que se corta a mitad de los 19 MB también se cuenta', async () => {
    // The headers arrived and the body did not. Without this branch the failure came
    // out as an unhandled rejection and the button just stopped.
    const failure = await downloadSignedFile('https://s3.local/x', 'f.jpg', 'el original', {
      fetch: () => Promise.resolve(response({ blob: () => Promise.reject(new Error('aborted')) })),
      save: () => undefined,
    }).catch((e: unknown) => e)
    expect((failure as DownloadFailure).kind).toBe('network')
    expect((failure as DownloadFailure).message).toContain('el original')
  })

  it('la firma caducada invita a volver a tocar el botón, que es lo que la arregla', async () => {
    const failure = await downloadSignedFile('https://s3.local/x', 'f.jpg', 'el original', {
      fetch: () => Promise.resolve(response({ ok: false, status: 403 })),
      save: () => undefined,
    }).catch((e: unknown) => e)
    const error = failure as DownloadFailure
    expect(error.kind).toBe('expired')
    expect(error.message).toContain('caducado')
    expect(error.message).toContain('HTTP 403')
  })

  it('un fichero que ya no está no se confunde con un permiso caducado', async () => {
    // Tapping the button again does not fix a 404, and saying it would means sending somebody
    // to repeat a gesture forever. This has to be warned about.
    const failure = await downloadSignedFile('https://s3.local/x', 'f.jpg', 'el original', {
      fetch: () => Promise.resolve(response({ ok: false, status: 404 })),
      save: () => undefined,
    }).catch((e: unknown) => e)
    const error = failure as DownloadFailure
    expect(error.kind).toBe('missing')
    expect(error.message).toContain('ya no está')
    expect(error.message).toContain('avisar')
  })

  it('clasifica los estados del almacén', () => {
    expect(downloadFailureKind(401)).toBe('expired')
    expect(downloadFailureKind(403)).toBe('expired')
    expect(downloadFailureKind(404)).toBe('missing')
    expect(downloadFailureKind(410)).toBe('missing')
    expect(downloadFailureKind(500)).toBe('store')
    expect(downloadFailureKind(503)).toBe('store')
    expect(downloadFailureKind(418)).toBe('unknown')
  })

  it('ningún mensaje deja a la usuaria sin saber de qué fichero se habla', () => {
    const kinds = ['sign', 'network', 'expired', 'missing', 'store', 'unknown'] as const
    for (const kind of kinds) {
      const text = downloadFailureText('la copia corregida', kind)
      expect(text).toContain('la copia corregida')
      // Neither jargon nor the name of any piece of the machine.
      expect(text).not.toMatch(/bucket|fetch|Edge|CORS|S3/i)
      // And it always ends in something to do.
      expect(text).toMatch(/intentarlo|avisar|Vuelve|Espera/)
    }
  })

  it('sin detalle técnico no aparece un paréntesis vacío', () => {
    expect(downloadFailureText('el original', 'store')).not.toContain('()')
    expect(downloadFailureText('el original', 'store', '')).not.toContain('()')
    expect(downloadFailureText('el original', 'store', 'HTTP 502')).toContain('(HTTP 502)')
  })

  it('los artículos contractos, que en un aviso mal escrito se leen y hacen dudar', () => {
    // The signature warning is the only one carrying a preposition before the file's
    // name, and one in every two labels in the project starts with «el»: it said «no se
    // ha podido preparar la descarga DE EL documento».
    expect(contracted('a', 'el documento «Carta»')).toBe('al documento «Carta»')
    expect(contracted('de', 'el original')).toBe('del original')
    // Only the masculine singular contracts.
    expect(contracted('a', 'la copia corregida')).toBe('a la copia corregida')
    expect(contracted('de', 'los originales')).toBe('de los originales')
    // And a label starting with «el» without it being an article is not wrecked.
    expect(contracted('a', 'elementos sueltos')).toBe('a elementos sueltos')
  })

  it('y el aviso de la firma vale igual para ver que para descargar', () => {
    // Signing is the step before both things. Saying «no se ha podido preparar la
    // descarga» to somebody who has touched «Ver el documento» tells them about a failure of something they
    // had not asked for.
    const text = downloadFailureText('el documento «Carta»', 'sign')
    expect(text).toContain('No se ha podido acceder al documento «Carta»')
    expect(text).not.toContain('descarga')
  })

  it('la miga técnica sale de cualquier cosa que se haya lanzado', () => {
    expect(messageOf(new Error('sin red'))).toBe('sin red')
    expect(messageOf('sin red')).toBe('sin red')
    expect(messageOf(new Error(''))).toBeUndefined()
    expect(messageOf(undefined)).toBeUndefined()
    expect(messageOf({ raro: true })).toBeUndefined()
  })
})
