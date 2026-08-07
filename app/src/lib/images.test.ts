import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CORRECTED_EXTENSION,
  CORRECTED_NOT_GENERATED,
  CORRECTED_NOT_UPLOADED,
  CORRECTED_QUALITY,
  CORRECTED_SUFFIX,
  CORRECTED_CONTENT_TYPE,
  HEAVY_DERIVATIVES_WARNING,
  MAX_BYTES,
  LEVELS,
  NO_CORRECTED_COPY,
  PNG_DERIVATIVE,
  WEBP_DERIVATIVE,
  computeTarget,
  correctedPath,
  derivativeFormat,
  derivativeFormatOf,
  derivativePaths,
  forgetDerivativeFormat,
  isWebpBlob,
  paths,
  probeDerivativeFormat,
  randomSuffix,
  readShotDate,
  saveCorrectedCopy,
  UPLOAD_ATTEMPTS,
  uploadShot,
  validateFile,
  type DerivativeType,
  type PreparedShot,
} from './images'
import { NO_EDIT, normalizeEdit } from './imageEdits'
import type { PhotoTakenDate } from './exif'

/**
 * The one call that talks to the outside world is stubbed, and only that one.
 *
 * `uploadShot` is not pure and cannot be made pure: what has to be pinned is the
 * bytes it puts on the wire and the row it writes, which is exactly what a fake
 * client can record. The alternative — testing only the helpers around it — would
 * leave the master's own body, which is the invariant of §0.1 and ADR-002, verified
 * by nothing at all.
 */
const api = vi.hoisted(() => ({
  /** Uploads to Supabase Storage: the two display levels and nothing else. */
  uploads: [] as { path: string; type?: string; upsert?: boolean }[],
  /** Bodies sent to the signing function, in order. */
  signed: [] as { operation: string; path: string; contentType?: string }[],
  /** PUTs to the signed URLs: the master, and the corrected copy when there is one. */
  puts: [] as { url: string; method?: string; type?: string; body?: unknown }[],
  /** Rows handed to `insert`. */
  rows: [] as Record<string, unknown>[],
  /**
   * True reproduces what `sign-file` does **today**: its `VALID_PATH` only accepts
   * paths shaped like a master, so it answers 400 «ruta no válida para un máster» to
   * the corrected copy. Kept as a switch rather than a fixed behaviour because that
   * is a pending dependency of the Edge function and not a decision of this module.
   */
  signMastersOnly: false,
  /** Set to simulate a PUT the store rejects. */
  putStatus: 200,
  /** Progress reported to the caller, per step (RNF-106). */
  progress: [] as { step: string; loaded: number; total: number | null; attempt?: number }[],
  /** How many PUTs die mid-transfer before one gets through. */
  cutsBeforeSuccess: 0,
}))

vi.mock('./supabase', () => ({
  supabase: {
    storage: {
      from: () => ({
        upload: async (
          path: string,
          _content: Blob,
          options?: { contentType?: string; upsert?: boolean },
        ) => {
          api.uploads.push({ path, type: options?.contentType, upsert: options?.upsert })
          return { error: null }
        },
      }),
    },
    functions: {
      invoke: async (
        name: string,
        init: { body: { operation: string; path: string; contentType?: string } },
      ) => {
        expect(name).toBe('sign-file')
        api.signed.push(init.body)
        if (api.signMastersOnly && !/_master\.[A-Za-z0-9]+$/.test(init.body.path)) {
          return { data: null, error: { message: 'ruta no válida para un máster' } }
        }
        return {
          data: {
            url: `https://b2.example/${init.body.path}?X-Amz-Signature=x`,
            contentType: init.body.contentType ?? null,
          },
          error: null,
        }
      },
    },
    from: () => ({
      insert: (row: Record<string, unknown>) => {
        api.rows.push(row)
        return {
          select: () => ({ single: async () => ({ data: { image_id: 'img-1' }, error: null }) }),
        }
      },
    }),
  },
}))

function resetApi() {
  api.uploads.length = 0
  api.signed.length = 0
  api.puts.length = 0
  api.rows.length = 0
  api.signMastersOnly = false
  api.putStatus = 200
  api.progress.length = 0
  api.cutsBeforeSuccess = 0
  cuts = 0
  // A fake `XMLHttpRequest`, because that is what the signed PUT uses now: `fetch`
  // cannot report upload progress, and a 12 MB original over the connection of a
  // storeroom was two minutes of a screen that said nothing (see signedUpload.ts).
  // It records the same four fields the `fetch` stub recorded, so what these tests
  // pin — above all that the body IS the master and not a copy of it — did not move.
  class FakeXhr {
    upload = { onprogress: null as ((e: ProgressEventLike) => void) | null }
    status = 0
    onload: (() => void) | null = null
    onerror: (() => void) | null = null
    onabort: (() => void) | null = null
    ontimeout: (() => void) | null = null
    private method = ''
    private url = ''
    private headers: Record<string, string> = {}
    open(method: string, url: string) {
      this.method = method
      this.url = url
    }
    setRequestHeader(name: string, value: string) {
      this.headers[name] = value
    }
    send(body: unknown) {
      api.puts.push({ url: this.url, method: this.method, type: this.headers['Content-Type'], body })
      // Half of the body, then the answer: enough for a caller wiring progress through
      // to be exercised by every upload test rather than only by the one that looks.
      const size = (body as Blob | undefined)?.size ?? 0
      this.upload.onprogress?.({ lengthComputable: true, loaded: Math.floor(size / 2), total: size })
      // A cut connection: no status, no answer, which is what `onerror` means.
      if (cuts < api.cutsBeforeSuccess) {
        cuts += 1
        this.onerror?.()
        return
      }
      this.status = api.putStatus
      this.onload?.()
    }
  }
  ;(globalThis as { XMLHttpRequest?: unknown }).XMLHttpRequest = FakeXhr
}

/** Cuts already spent in this test, so `cutsBeforeSuccess` counts down. */
let cuts = 0

interface ProgressEventLike {
  lengthComputable: boolean
  loaded: number
  total: number
}

/** The row `insert` received, for the assertions about columns. */
const lastRow = () => api.rows[api.rows.length - 1] as Record<string, unknown>

const masterOf = (name = 'IMG_1234.jpg') =>
  new File([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], name, { type: 'image/jpeg' })

function shotOf(master: File, extra: Partial<PreparedShot> = {}): PreparedShot {
  return {
    master,
    thumbnail: new Blob([new Uint8Array(webpBytes)], { type: 'image/webp' }),
    derivative: new Blob([new Uint8Array(webpBytes)], { type: 'image/webp' }),
    originalWidth: 4000,
    originalHeight: 2252,
    preview: 'blob:previo',
    edit: NO_EDIT,
    ...extra,
  }
}

const masterFile = (name: string, type = 'image/jpeg') =>
  ({ name, type, size: 1000 }) as File

const ascii = (text: string) => Array.from(text, (c) => c.charCodeAt(0))

/** A RIFF container tagged «WEBP», which is how a real WebP file starts. */
const webpBytes = [...ascii('RIFF'), 16, 0, 0, 0, ...ascii('WEBPVP8 ')]
/** The PNG signature, which is what a browser with no WebP encoder hands back. */
const pngBytes = [0x89, ...ascii('PNG'), 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, ...ascii('IHDR')]

const blobOf = (content: number[], type: string) => new Blob([new Uint8Array(content)], { type })

describe('computeTarget', () => {
  it('reduces the long edge to the target keeping the aspect ratio', () => {
    // Typical landscape phone photo.
    expect(computeTarget(4032, 3024, 2000)).toEqual({ width: 2000, height: 1500 })
  })

  it('works the same in portrait', () => {
    expect(computeTarget(3024, 4032, 2000)).toEqual({ width: 1500, height: 2000 })
  })

  it('never upscales a small image', () => {
    // Stretching a 300 px photo to 2000 would only weigh more and fake a
    // quality it does not have, which in a catalog is worse than being small.
    expect(computeTarget(300, 200, 2000)).toEqual({ width: 300, height: 200 })
    expect(computeTarget(1, 1, 400)).toEqual({ width: 1, height: 1 })
  })

  it('leaves untouched the image that already measures exactly the target', () => {
    expect(computeTarget(2000, 1000, 2000)).toEqual({ width: 2000, height: 1000 })
  })

  it('never returns a zero dimension', () => {
    // A very elongated image could round the short side to zero and the
    // canvas would fail to draw.
    const r = computeTarget(8000, 3, 400)
    expect(r.height).toBeGreaterThanOrEqual(1)
    expect(r.width).toBe(400)
  })

  it('produces a thumbnail much lighter than the derivative', () => {
    const thumb = computeTarget(4032, 3024, LEVELS.thumbnail.longEdge)
    const der = computeTarget(4032, 3024, LEVELS.derivative.longEdge)
    // Area is what rules the final weight; the thumbnail must be an order of
    // magnitude smaller for the mosaic index to load on a phone.
    expect(thumb.width * thumb.height).toBeLessThan((der.width * der.height) / 10)
  })
})

describe('validateFile', () => {
  const file = (name: string, type: string, bytes: number) =>
    new File([new Uint8Array(1)], name, { type }) &&
    // File does not allow setting `size` directly: it is simulated with an
    // object that satisfies what the function uses.
    ({ name, type, size: bytes } as File)

  it('accepts a normal image', () => {
    expect(validateFile(file('obra.jpg', 'image/jpeg', 8_000_000))).toBeNull()
  })

  it('rejects what is not an image, naming the file', () => {
    const error = validateFile(file('procedencia.pdf', 'application/pdf', 1000))
    expect(error).toContain('procedencia.pdf')
    expect(error).toContain('no es una imagen')
  })

  it('rejects what exceeds the cap and says how much it weighs', () => {
    const error = validateFile(file('escaneo.tif', 'image/tiff', MAX_BYTES + 1))
    expect(error).toContain('escaneo.tif')
    // Saying "weighs 60.0 MB and the maximum is 60 MB" is more useful than
    // "file too big": one knows how much to trim.
    expect(error).toMatch(/MB/)
  })

  it('accepts exactly the limit size', () => {
    expect(validateFile(file('justo.jpg', 'image/jpeg', MAX_BYTES))).toBeNull()
  })
})

/**
 * The silent substitution: `canvas.toBlob(…, 'image/webp')` does not fail on a
 * browser with no WebP encoder, it answers PNG and says nothing. The declared
 * target is phones from 2020 on and there the codec is universal, but the tail
 * exists, and on it the application was uploading PNG named `.webp`.
 */
describe('isWebpBlob (RF-409, RF-410)', () => {
  it('recognizes real WebP bytes', async () => {
    await expect(isWebpBlob(blobOf(webpBytes, 'image/webp'))).resolves.toBe(true)
  })

  it('does not believe a PNG that declares itself WebP', async () => {
    // The declared type is precisely what lies, so the signature decides.
    await expect(isWebpBlob(blobOf(pngBytes, 'image/webp'))).resolves.toBe(false)
  })

  it('believes the bytes even when the Blob declares no type at all', async () => {
    await expect(isWebpBlob(blobOf(webpBytes, ''))).resolves.toBe(true)
  })

  it('says no, without throwing, when there is nothing to look at', async () => {
    await expect(isWebpBlob(null)).resolves.toBe(false)
    await expect(isWebpBlob(blobOf([0x89, 0x50], 'image/png'))).resolves.toBe(false)
  })
})

describe('probeDerivativeFormat (RF-409, RF-410)', () => {
  /** A browser that ignores the requested type and always answers PNG. */
  const lyingEncoder = async () => blobOf(pngBytes, 'image/webp')
  /** A browser that does encode WebP. */
  const honestEncoder = async (type: DerivativeType) =>
    blobOf(type === 'image/webp' ? webpBytes : pngBytes, type)

  it('detects the browser that answers PNG when asked for WebP', async () => {
    const format = await probeDerivativeFormat(lyingEncoder)
    expect(format).toEqual(PNG_DERIVATIVE)
    // Name and declared type match the bytes, which is the whole repair.
    expect(format.extension).toBe('png')
    expect(format.type).toBe('image/png')
    expect(format.warning).toBe(HEAVY_DERIVATIVES_WARNING)
  })

  it('does not give a false positive on a browser that does encode WebP', async () => {
    const format = await probeDerivativeFormat(honestEncoder)
    expect(format).toEqual(WEBP_DERIVATIVE)
    expect(format.warning).toBeNull()
  })

  it('warns instead of breaking when the encoder gives nothing or throws', async () => {
    // Cataloging goes on: the photograph is taken with the artwork in front of
    // you and that moment does not come back.
    await expect(probeDerivativeFormat(async () => null)).resolves.toEqual(PNG_DERIVATIVE)
    await expect(
      probeDerivativeFormat(() => Promise.reject(new Error('sin códec'))),
    ).resolves.toEqual(PNG_DERIVATIVE)
  })

  it('tells the consequence and not the name of the format', () => {
    // The cataloger does not choose the encoding, so naming it would only turn a
    // manageable situation into an incomprehensible one.
    expect(HEAVY_DERIVATIVES_WARNING).not.toMatch(/webp|png|jpe?g|codec|códec/i)
    expect(HEAVY_DERIVATIVES_WARNING).toContain('pesarán bastante más')
    expect(HEAVY_DERIVATIVES_WARNING).toContain('original se guarda')
  })
})

describe('derivativeFormat (RF-410)', () => {
  beforeEach(forgetDerivativeFormat)

  it('probes once and lazily, not on loading the module', async () => {
    let calls = 0
    const encode = async () => {
      calls += 1
      return blobOf(webpBytes, 'image/webp')
    }
    // Importing this module has not touched a canvas: several screens import a
    // path helper from here and never encode anything.
    expect(calls).toBe(0)
    await expect(derivativeFormat(encode)).resolves.toEqual(WEBP_DERIVATIVE)
    await expect(derivativeFormat(encode)).resolves.toEqual(WEBP_DERIVATIVE)
    // The answer cannot change while the tab is open.
    expect(calls).toBe(1)
  })
})

describe('derivativeFormatOf (RF-409)', () => {
  it('reads the format of the bytes about to be uploaded', () => {
    // The offline queue keeps the Blobs but not the answer of the probe, so the
    // upload asks the Blob and not the shot.
    expect(derivativeFormatOf(blobOf(pngBytes, 'image/png'))).toEqual(PNG_DERIVATIVE)
    expect(derivativeFormatOf(blobOf(webpBytes, 'image/webp'))).toEqual(WEBP_DERIVATIVE)
    // A row of the queue written before all this has no type: it is WebP, which
    // is what every browser in the declared target produces.
    expect(derivativeFormatOf(blobOf(webpBytes, ''))).toEqual(WEBP_DERIVATIVE)
  })
})

describe('paths', () => {
  it('names the derivatives after the format really encoded (RF-409, RF-410)', () => {
    // Regression: `canvas.toBlob(…, 'image/webp')` returns a PNG in silence on a
    // browser that cannot encode WebP, and the upload used to name those bytes
    // `_min.webp` and declare them `image/webp` anyway.
    const target = paths('AR-0001', masterFile('IMG_1234.jpg'), 'png')
    expect(target.thumbnail).toMatch(/_min\.png$/)
    expect(target.derivative).toMatch(/_der\.png$/)
  })

  it('keeps WebP as the default, which is what the declared target encodes (RF-409)', () => {
    // The default is the format of every browser from 2020 on. It is a default and
    // not an assumption: both upload paths pass the extension explicitly — the
    // first upload from the bytes it is about to send (uploadShot) and the re-edit
    // from what it just encoded (savePhotoEdit in imageRender.ts).
    expect(derivativePaths('AR-0001').thumbnail).toMatch(/_min\.webp$/)
    expect(paths('AR-0001', masterFile('IMG_1234.jpg')).derivative).toMatch(/_der\.webp$/)
  })

  it('never renames the master after the derivatives (ADR-002)', () => {
    // The master is uploaded with its original bytes and its own extension: the
    // encoding of the display copies has nothing to do with it.
    const target = paths('AR-0001', masterFile('IMG_1234.jpg'), 'png')
    expect(target.master).toMatch(/_master\.jpg$/)
    expect(target.master).not.toMatch(/webp|png/)
  })

  it('gives the three levels the same random base (RF-409)', () => {
    const target = paths('AR-0001', masterFile('IMG_1234.jpg'))
    const base = target.master.replace(/_master\..*$/, '')
    expect(target.thumbnail.startsWith(base)).toBe(true)
    expect(target.derivative.startsWith(base)).toBe(true)
  })
})

describe('randomSuffix', () => {
  it('has the requested length and only path-safe characters', () => {
    const s = randomSuffix()
    expect(s).toHaveLength(8)
    expect(s).toMatch(/^[a-z0-9]{8}$/)
    expect(randomSuffix(16)).toHaveLength(16)
  })

  it('does not repeat between calls', () => {
    const samples = new Set(Array.from({ length: 200 }, () => randomSuffix()))
    expect(samples.size).toBeGreaterThan(195)
  })

  it('works without crypto.randomUUID, which is the phone-over-http case', () => {
    // `crypto.randomUUID` is undefined outside a secure context, and the app
    // is used on the local network over http. This test pins that case: it
    // used to blow up the upload with an incomprehensible error, and only from
    // the phone.
    const original = globalThis.crypto
    try {
      Object.defineProperty(globalThis, 'crypto', {
        value: { getRandomValues: original.getRandomValues.bind(original) },
        configurable: true,
      })
      expect(randomSuffix()).toMatch(/^[a-z0-9]{8}$/)
    } finally {
      Object.defineProperty(globalThis, 'crypto', { value: original, configurable: true })
    }
  })

  it('works even with no crypto at all', () => {
    const original = globalThis.crypto
    try {
      Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true })
      expect(randomSuffix()).toMatch(/^[a-z0-9]{8}$/)
    } finally {
      Object.defineProperty(globalThis, 'crypto', { value: original, configurable: true })
    }
  })
})

// ---------------------------------------------------------------------------
// The path of the corrected copy (RF-420, ADR-010)
// ---------------------------------------------------------------------------

describe('la ruta de la copia corregida (RF-420)', () => {
  it('lleva su propio sufijo y su propia extensión, al lado de los otros niveles', () => {
    const target = paths('AR-0001', masterFile('IMG_1234.jpg'))
    const base = target.master.replace(/_master\..*$/, '')
    expect(target.corrected).toBe(`${base}${CORRECTED_SUFFIX}.${CORRECTED_EXTENSION}`)
    expect(target.corrected).toMatch(/_corrected\.jpg$/)
    // Los cuatro ficheros de una toma quedan juntos en el almacén y se pueden leer
    // a mano.
    expect(target.corrected.startsWith(base)).toBe(true)
  })

  it('nunca coincide con la ruta del máster, ni cuando el máster es un .jpg (ADR-002, §0.1)', () => {
    // La forma realista de reescribir un máster no es un update malicioso: es derivar
    // esta ruta de la del máster hasta que un día coincidan. Con el sufijo propio la
    // colisión es aritméticamente imposible.
    for (const name of ['IMG_1234.jpg', 'obra.JPG', 'escaneo.tif', 'sinextension']) {
      const target = paths('AR-0001', masterFile(name))
      expect(target.corrected).not.toBe(target.master)
      expect(target.corrected).not.toMatch(/_master\./)
    }
  })

  it('reeditar escribe una ruta nueva y no reutiliza la anterior', () => {
    // El service worker cachea por ruta con CacheFirst: sobrescribir serviría los
    // bytes viejos desde el teléfono para siempre.
    const first = correctedPath('AR-0001')
    const second = correctedPath('AR-0001')
    expect(first).not.toBe(second)
    expect(first.startsWith('AR-0001/AR-0001_')).toBe(true)
  })

  it('la codificación es un conjunto emparejado, y es la misma que la de la herramienta por lotes (RF-421)', () => {
    // Dos productores del mismo fichero: el navegador y `scripts/copias-corregidas`.
    // Un sufijo distinto en cada lado da dos familias de rutas; un formato distinto,
    // dos copias de imprenta que pesan y se ven distinto según quién las hizo.
    expect(CORRECTED_SUFFIX).toBe('_corrected')
    expect(CORRECTED_EXTENSION).toBe('jpg')
    expect(CORRECTED_CONTENT_TYPE).toBe('image/jpeg')
    expect(CORRECTED_QUALITY).toBeCloseTo(0.92, 5)
  })
})

// ---------------------------------------------------------------------------
// La subida de una toma nueva
// ---------------------------------------------------------------------------

describe('uploadShot: el máster se sube tal cual (§0.1, ADR-002)', () => {
  beforeEach(resetApi)

  it('manda exactamente el File recibido, sin envolverlo ni recodificarlo', async () => {
    const master = masterOf()
    await uploadShot('AR-0001', shotOf(master), { shotType: 'GENERAL', isIndex: false })

    const puts = api.puts.filter((p) => p.url.includes('_master'))
    // Un solo PUT, a una ruta nueva, con el objeto que se recibió: la MISMA
    // referencia. Un `new Blob([master])` pasaría un `toEqual` y ya sería otro
    // fichero; un canvas por medio lo recomprimiría; «arreglarle» el EXIF o
    // normalizarle la orientación cambiaría los bytes del documento de archivo.
    expect(puts).toHaveLength(1)
    expect(puts[0]?.body).toBe(master)
    expect(puts[0]?.method).toBe('PUT')
    // El Content-Type firmado se repite exacto o la firma no valida, y es el del
    // fichero de la cámara: no el de las derivadas.
    expect(puts[0]?.type).toBe('image/jpeg')
    expect(api.signed[0]).toMatchObject({ operation: 'upload', contentType: 'image/jpeg' })
  })

  it('reintenta un envío que se corta, y vuelve a firmar cada vez', async () => {
    // La incidencia que esto arregla, con su mensaje: «La conexión se ha cortado durante
    // el envío», a mitad de un original de varios megas. No es una avería que reportar,
    // es lo normal en un almacén — y sin reintento se pierde la fotografía entera,
    // incluidos los doce segundos de generar la copia corregida.
    api.cutsBeforeSuccess = 2
    const master = masterOf()
    // Reloj falso: entre intentos se espera 2 s y luego 6 s, que es lo correcto en un
    // almacén con cobertura intermitente y una eternidad en una batería de tests.
    vi.useFakeTimers()
    const upload = uploadShot('AR-0001', shotOf(master), {
      shotType: 'GENERAL',
      isIndex: false,
      onProgress: (step, event, attempt) => api.progress.push({ step, ...event, attempt }),
    })
    await vi.advanceTimersByTimeAsync(30_000)
    await upload
    vi.useRealTimers()

    const masterPuts = api.puts.filter((p) => p.url.includes('_master'))
    expect(masterPuts).toHaveLength(3)
    // El MISMO objeto en los tres: un reintento no puede recodificar el documento de
    // archivo por el camino (ADR-002).
    expect(masterPuts.every((p) => p.body === master)).toBe(true)
    // Y una firma nueva por intento. La de subida vale diez minutos desde que se emite,
    // y el intento que acaba de fallar ha podido gastarse tres: reutilizar la URL haría
    // que el reintento con más posibilidades de funcionar fuera el más propenso a que se
    // lo rechacen por firma caducada, que se lee como un problema de permisos y no lo es.
    expect(api.signed.filter((s) => s.path.includes('_master'))).toHaveLength(3)
    // La pantalla se entera de en qué intento va, o el contador baja de 80 % a 0 % solo.
    expect(api.progress.map((p) => p.attempt)).toEqual([1, 2, 3])
  })

  it('se rinde con el mensaje del corte cuando no hay manera', async () => {
    api.cutsBeforeSuccess = 99
    vi.useFakeTimers()
    const upload = uploadShot('AR-0001', shotOf(masterOf()), {
      shotType: 'GENERAL',
      isIndex: false,
    })
    const settled = expect(upload).rejects.toThrow('La conexión se ha cortado durante el envío.')
    await vi.advanceTimersByTimeAsync(30_000)
    await settled
    vi.useRealTimers()
    // Tres intentos y ni uno más: pasado eso ya no es un tropiezo, es que no hay
    // cobertura, y una pantalla reintentando diez minutos es peor que una que lo diga.
    expect(api.puts.filter((p) => p.url.includes('_master'))).toHaveLength(UPLOAD_ATTEMPTS)
  })

  it('no reintenta lo que el almacén ha contestado', async () => {
    // Un 5xx es el almacén diciendo algo. Repetir tres veces una petición rechazada solo
    // alarga la espera antes del mismo mensaje.
    api.putStatus = 503
    await expect(
      uploadShot('AR-0001', shotOf(masterOf()), { shotType: 'GENERAL', isIndex: false }),
    ).rejects.toThrow('HTTP 503')
    expect(api.puts.filter((p) => p.url.includes('_master'))).toHaveLength(1)
  })

  it('cuenta lo enviado de cada fichero grande, diciendo de cuál (RNF-106)', async () => {
    // La avería que esto tapa: subir una foto con transformación son DOS ficheros de
    // megabytes seguidos —el original y la copia corregida—, y la pantalla decía
    // «Subiendo 1 de 1…» durante los dos. Sin saber por cuál iba, un envío que se corta
    // a los dos minutos no se distingue de uno atascado, ni se puede contar después.
    const master = masterOf()
    await uploadShot(
      'AR-0001',
      shotOf(master),
      {
        shotType: 'GENERAL',
        isIndex: false,
        correctedCopy: { status: 'READY', blob: new Blob([new Uint8Array(64)]) },
        onProgress: (step, event) => api.progress.push({ step, ...event }),
      },
    )

    // Los dos ficheros informan, y por separado: la miniatura y la copia de consulta
    // van por la biblioteca de almacenamiento, que no dice nada, y meterlas en un total
    // único daría una barra que nunca llega a su propio final.
    expect(api.progress.map((p) => p.step)).toEqual(['master', 'corrected'])
    expect(api.progress[0]?.total).toBe(master.size)
    expect(api.progress[1]?.total).toBe(64)
  })

  it('sube sin informar de nada cuando nadie pregunta', async () => {
    // `onProgress` es opcional: el resto de la aplicación sube sin pintar progreso y no
    // debe romperse por no pasarlo.
    await uploadShot('AR-0001', shotOf(masterOf()), { shotType: 'GENERAL', isIndex: false })
    expect(api.progress).toEqual([])
    expect(api.puts.filter((p) => p.url.includes('_master'))).toHaveLength(1)
  })

  it('no pasa el máster por Supabase Storage ni le cambia la extensión', async () => {
    const master = masterOf('escaneo.tif')
    await uploadShot('AR-0001', shotOf(master), { shotType: 'GENERAL', isIndex: false })
    // A Storage van la miniatura y la derivada, y solo ellas.
    expect(api.uploads).toHaveLength(2)
    expect(api.uploads.every((u) => !u.path.includes('_master'))).toBe(true)
    expect(lastRow().master_path).toMatch(/_master\.tif$/)
    expect(lastRow().master_bytes).toBe(master.size)
  })

  it('cada subida estrena ruta de máster: nunca un PUT sobre una que ya existe', async () => {
    const master = masterOf()
    await uploadShot('AR-0001', shotOf(master), { shotType: 'GENERAL', isIndex: false })
    const first = lastRow().master_path
    await uploadShot('AR-0001', shotOf(master), { shotType: 'GENERAL', isIndex: false })
    expect(lastRow().master_path).not.toBe(first)
  })
})

describe('uploadShot: la fecha del fichero, el tamaño y la procedencia (RF-416, RF-417)', () => {
  beforeEach(resetApi)

  const EXACT: PhotoTakenDate = {
    when: { year: 2024, month: 3, day: 14, hour: 9, minute: 5, second: 1 },
    source: 'DATE_TIME_ORIGINAL',
    exact: true,
    date: '2024-03-14',
  }
  const APPROXIMATE: PhotoTakenDate = {
    when: { year: 2022, month: 10, day: 9, hour: 17, minute: 10, second: 33 },
    source: 'IFD0_DATE_TIME',
    exact: false,
    date: '2022-10-09',
  }

  it('escribe la fecha del fichero junto a la de la ficha, sin sustituirla (RF-416)', async () => {
    await uploadShot('AR-0001', shotOf(masterOf(), { fileDate: EXACT }), {
      shotType: 'GENERAL',
      isIndex: false,
    })
    const row = lastRow()
    expect(row.file_photo_date).toBe('2024-03-14')
    expect(row.file_photo_date_exact).toBe(true)
    // Las dos columnas, y la de la ficha sigue siendo la de hoy: son dos datos
    // distintos y pueden discrepar sin que ninguno esté mal.
    expect(row.photo_date).toBe(new Date().toISOString().slice(0, 10))
    expect(row.photo_date).not.toBe(row.file_photo_date)
  })

  it('marca como aproximada la fecha del IFD0, que es la de las 14 tomas de 2022 (RF-416)', async () => {
    await uploadShot('AR-0001', shotOf(masterOf(), { fileDate: APPROXIMATE }), {
      shotType: 'GENERAL',
      isIndex: false,
    })
    expect(lastRow().file_photo_date).toBe('2022-10-09')
    // Sin la marca, una fecha aproximada se leería como medida.
    expect(lastRow().file_photo_date_exact).toBe(false)
  })

  it('deja las dos columnas a nulo cuando la fotografía no dice cuándo se tomó (RF-416)', async () => {
    await uploadShot('AR-0001', shotOf(masterOf()), { shotType: 'GENERAL', isIndex: false })
    expect(lastRow().file_photo_date).toBeNull()
    // La restricción de la base pide precisión solo cuando hay fecha; escribir un
    // «exacta» sin fecha describiría una fecha que no existe.
    expect(lastRow().file_photo_date_exact).toBeNull()
  })

  it('escribe el tamaño del original tal como lo dio el decodificador', async () => {
    await uploadShot('AR-0001', shotOf(masterOf()), { shotType: 'GENERAL', isIndex: false })
    expect(lastRow().original_width).toBe(4000)
    expect(lastRow().original_height).toBe(2252)
  })

  it('escribe la procedencia que eligió la catalogadora y por omisión propia (RF-417)', async () => {
    await uploadShot('AR-0001', shotOf(masterOf()), { shotType: 'GENERAL', isIndex: false })
    expect(lastRow().provenance).toBe('OWN')

    await uploadShot('AR-0001', shotOf(masterOf(), { provenance: 'OTHER_CATALOG' }), {
      shotType: 'GENERAL',
      isIndex: false,
    })
    expect(lastRow().provenance).toBe('OTHER_CATALOG')

    // Lo que diga la subida manda sobre lo que quedó guardado en la cola.
    await uploadShot('AR-0001', shotOf(masterOf(), { provenance: 'OTHER_CATALOG' }), {
      shotType: 'GENERAL',
      isIndex: false,
      provenance: 'THIRD_PARTY',
    })
    expect(lastRow().provenance).toBe('THIRD_PARTY')
  })

  it('no deduce la procedencia de las dimensiones (RF-417)', async () => {
    // 1080×2400 sin datos de cámara es lo que parece una captura de pantalla de un
    // catálogo en línea, y parecerlo no es serlo: el proyecto ya decidió con
    // `crop_source` no inventar el dato.
    await uploadShot('AR-0001', shotOf(masterOf(), { originalWidth: 1080, originalHeight: 2400 }), {
      shotType: 'GENERAL',
      isIndex: false,
    })
    expect(lastRow().provenance).toBe('OWN')
  })
})

describe('uploadShot: la copia corregida a resolución completa (RF-420)', () => {
  beforeEach(resetApi)

  const edited = normalizeEdit({ rotation: 90, crop: null })

  it('sin correcciones no hay copia, y no queda pendiente', async () => {
    const result = await uploadShot('AR-0001', shotOf(masterOf()), {
      shotType: 'GENERAL',
      isIndex: false,
    })
    expect(lastRow()).toMatchObject(NO_CORRECTED_COPY)
    expect(result.correctedPending).toBeNull()
    // Nulo y no un duplicado del máster: para eso ya está el máster (RF-411).
    expect(api.puts.filter((p) => p.url.includes('_corrected'))).toHaveLength(0)
  })

  it('con correcciones y sin copia generada la fila queda pendiente, con su razón', async () => {
    const result = await uploadShot('AR-0001', shotOf(masterOf(), { edit: edited }), {
      shotType: 'GENERAL',
      isIndex: false,
    })
    // «No hace falta» y «no se ha podido» no pueden ser la misma fila: la segunda
    // quedaría invisible y nadie volvería a intentarlo.
    expect(lastRow().corrected_pending).toBe(true)
    expect(lastRow().corrected_path).toBeNull()
    expect(lastRow().corrected_bytes).toBeNull()
    expect(result.correctedPending).toBe(CORRECTED_NOT_GENERATED)
  })

  it('sube la copia generada a su propia ruta y la anota con su tamaño', async () => {
    const blob = new Blob([new Uint8Array(1024)], { type: CORRECTED_CONTENT_TYPE })
    const result = await uploadShot('AR-0001', shotOf(masterOf(), { edit: edited }), {
      shotType: 'GENERAL',
      isIndex: false,
      correctedCopy: { status: 'READY', blob },
    })
    const row = lastRow()
    expect(row.corrected_path).toMatch(/_corrected\.jpg$/)
    expect(row.corrected_bytes).toBe(1024)
    expect(row.corrected_pending).toBe(false)
    expect(result.correctedPending).toBeNull()

    // Va a B2 por el camino de firma que ya existe, no a Supabase Storage, y con el
    // Content-Type que se firmó.
    expect(api.signed).toContainEqual({
      operation: 'upload',
      path: row.corrected_path,
      contentType: CORRECTED_CONTENT_TYPE,
    })
    const put = api.puts.find((p) => p.url.includes('_corrected'))
    expect(put?.method).toBe('PUT')
    expect(put?.type).toBe(CORRECTED_CONTENT_TYPE)
    expect(put?.body).toBe(blob)
    // Y nunca sobre el máster: son dos ficheros distintos y los dos existen.
    expect(row.corrected_path).not.toBe(row.master_path)
    expect(api.puts.filter((p) => p.url.includes('_master'))).toHaveLength(1)
  })

  it('registra la toma igualmente cuando la firma de la copia se rechaza', async () => {
    // Es lo que pasa HOY: `sign-file` solo acepta rutas de máster y responde 400
    // «ruta no válida para un máster». La corrección es el trabajo; la copia es un
    // fichero derivado que se puede regenerar desde un ordenador, así que perder el
    // trabajo para avisar de la pérdida del fichero sería el peor de los cambios.
    api.signMastersOnly = true
    const result = await uploadShot('AR-0001', shotOf(masterOf(), { edit: edited }), {
      shotType: 'GENERAL',
      isIndex: false,
      correctedCopy: { status: 'READY', blob: new Blob([new Uint8Array(8)]) },
    })
    expect(result.image_id).toBe('img-1')
    expect(lastRow().corrected_pending).toBe(true)
    expect(result.correctedPending).toBe(CORRECTED_NOT_UPLOADED)
  })
})

describe('saveCorrectedCopy (RF-420, ADR-010)', () => {
  beforeEach(resetApi)

  it('distingue los tres estados de la fila y nunca calla el pendiente', async () => {
    const none = await saveCorrectedCopy({ catalogId: 'AR-0001', copy: { status: 'NOT_NEEDED' } })
    expect(none).toEqual({ columns: NO_CORRECTED_COPY, reason: null })

    const razon = 'Esta fotografía es demasiado grande para el lienzo de este dispositivo.'
    const stuck = await saveCorrectedCopy({
      catalogId: 'AR-0001',
      copy: { status: 'PENDING', reason: razon },
    })
    expect(stuck.columns.corrected_pending).toBe(true)
    expect(stuck.columns.corrected_path).toBeNull()
    // La razón la sabe quien genera —el techo del lienzo, un máster que no se
    // descargó— y llega a la pantalla tal cual.
    expect(stuck.reason).toBe(razon)

    const ready = await saveCorrectedCopy({
      catalogId: 'AR-0001',
      copy: { status: 'READY', blob: new Blob([new Uint8Array(64)]) },
    })
    expect(ready.columns.corrected_pending).toBe(false)
    expect(ready.columns.corrected_bytes).toBe(64)
    expect(ready.reason).toBeNull()
  })

  it('no sube un fichero vacío: lo deja pendiente', async () => {
    // Un fichero de cero bytes es la misma clase de fallo que el lienzo en blanco:
    // una fila con ruta y tamaño plausibles y una imprenta que no abre nada.
    const outcome = await saveCorrectedCopy({
      catalogId: 'AR-0001',
      copy: { status: 'READY', blob: new Blob([]) },
    })
    expect(outcome.columns.corrected_pending).toBe(true)
    expect(outcome.reason).toBe(CORRECTED_NOT_UPLOADED)
    expect(api.puts).toHaveLength(0)
    expect(api.signed).toHaveLength(0)
  })

  it('deja pendiente, sin lanzar, cuando el almacén rechaza el PUT', async () => {
    api.putStatus = 503
    const outcome = await saveCorrectedCopy({
      catalogId: 'AR-0001',
      copy: { status: 'READY', blob: new Blob([new Uint8Array(4)]) },
    })
    expect(outcome.columns.corrected_pending).toBe(true)
    expect(outcome.columns.corrected_path).toBeNull()
    expect(outcome.reason).toBe(CORRECTED_NOT_UPLOADED)
  })

  it('se niega a escribir en la ruta del máster, y en cualquier ruta con forma de máster (§0.1)', async () => {
    const copy = { status: 'READY' as const, blob: new Blob([new Uint8Array(4)]) }
    // La restricción de la base también lo prohíbe, pero cuando la base dice no, el
    // fichero ya se ha subido: aquí se para antes de firmar.
    await expect(
      saveCorrectedCopy({
        catalogId: 'AR-0001',
        copy,
        masterPath: 'AR-0001/AR-0001_abcd1234_master.jpg',
        path: 'AR-0001/AR-0001_abcd1234_master.jpg',
      }),
    ).rejects.toThrow(/máster/)
    await expect(
      saveCorrectedCopy({
        catalogId: 'AR-0001',
        copy,
        masterPath: 'AR-0001/AR-0001_abcd1234_master.jpg',
        // Otra fila, mismo desastre: un máster que no es el de esta imagen.
        path: 'AR-0002/AR-0002_ffff0000_master.jpeg',
      }),
    ).rejects.toThrow(/máster/)
    expect(api.puts).toHaveLength(0)
    expect(api.signed).toHaveLength(0)
  })

  it('los dos mensajes de pendiente dicen que la corrección no se ha perdido', async () => {
    // Lo que la catalogadora necesita saber es que su media hora de trabajo está
    // guardada y que el fichero se puede generar después, no cómo funciona un lienzo.
    for (const message of [CORRECTED_NOT_GENERATED, CORRECTED_NOT_UPLOADED]) {
      expect(message).toContain('pendiente')
      expect(message).toMatch(/corrección está guardada/)
      expect(message).not.toMatch(/canvas|lienzo|PUT|HTTP|B2/)
    }
  })
})

// ---------------------------------------------------------------------------
// La fecha que el fichero trae dentro (RF-416)
// ---------------------------------------------------------------------------

/**
 * Los ficheros se construyen en bytes, aquí, por lo mismo que en exif.test.ts: el
 * repositorio es público y los másteres que motivan esto están fuera. Cada caso monta
 * un JPEG de verdad —SOI, APP1 con `Exif\0\0`, cabecera TIFF y uno o dos
 * directorios— alrededor de la única etiqueta de la que habla.
 */
const asciiZ = (text: string): Uint8Array => {
  const bytes = new Uint8Array(text.length + 1)
  for (let i = 0; i < text.length; i += 1) bytes[i] = text.charCodeAt(i) & 0xff
  return bytes
}

interface Entry {
  tag: number
  type: number
  text?: string
  long?: number
}

/** Un directorio colocado en `start` del bloque TIFF, en little endian. */
function ifdBytes(entries: Entry[], start: number): Uint8Array {
  const table = 2 + entries.length * 12 + 4
  const payloads = entries.map((e) => (e.text === undefined ? null : asciiZ(e.text)))
  const total = table + payloads.reduce((sum, p) => sum + (p?.length ?? 0), 0)
  const bytes = new Uint8Array(total)
  const view = new DataView(bytes.buffer)
  view.setUint16(0, entries.length, true)
  let dataAt = table
  entries.forEach((entry, i) => {
    const at = 2 + i * 12
    view.setUint16(at, entry.tag, true)
    view.setUint16(at + 2, entry.type, true)
    const payload = payloads[i]
    if (payload) {
      // Una fecha son 20 bytes, así que siempre vive fuera de la entrada y esta
      // guarda un desplazamiento relativo al inicio del bloque TIFF.
      view.setUint32(at + 4, payload.length, true)
      view.setUint32(at + 8, start + dataAt, true)
      bytes.set(payload, dataAt)
      dataAt += payload.length
    } else {
      view.setUint32(at + 4, 1, true)
      view.setUint32(at + 8, entry.long ?? 0, true)
    }
  })
  return bytes
}

const TAG_DATE_TIME = 0x0132
const TAG_EXIF_IFD = 0x8769
const TAG_DATE_TIME_ORIGINAL = 0x9003

/** Un JPEG con las etiquetas de fecha que se le pidan y nada más. */
function jpegWithDates(dates: { original?: string; file?: string }): File {
  const ifd0: Entry[] = []
  if (dates.file) ifd0.push({ tag: TAG_DATE_TIME, type: 2, text: dates.file })
  let block0 = ifdBytes(ifd0, 8)
  // Anotado: `ifdBytes` devuelve un `Uint8Array` sobre cualquier búfer y el inferido
  // de `new Uint8Array(0)` es más estrecho.
  let blockExif: Uint8Array = new Uint8Array(0)
  if (dates.original) {
    ifd0.push({ tag: TAG_EXIF_IFD, type: 4, long: 0 })
    // El valor del puntero depende de lo que mida el IFD0 con el puntero dentro, así
    // que se mide primero y se rellena después.
    const exifStart = 8 + ifdBytes(ifd0, 8).length
    ifd0[ifd0.length - 1] = { tag: TAG_EXIF_IFD, type: 4, long: exifStart }
    block0 = ifdBytes(ifd0, 8)
    const original: Entry = { tag: TAG_DATE_TIME_ORIGINAL, type: 2, text: dates.original }
    blockExif = ifdBytes([original], exifStart)
  }

  const tiff = new Uint8Array(8 + block0.length + blockExif.length)
  const tiffView = new DataView(tiff.buffer)
  tiffView.setUint16(0, 0x4949) // «II»: little endian
  tiffView.setUint16(2, 42, true)
  tiffView.setUint32(4, 8, true)
  tiff.set(block0, 8)
  tiff.set(blockExif, 8 + block0.length)

  const payload = new Uint8Array(6 + tiff.length)
  payload.set(ascii('Exif'), 0)
  payload.set(tiff, 6)
  const app1 = new Uint8Array(payload.length + 4)
  const app1View = new DataView(app1.buffer)
  app1View.setUint16(0, 0xffe1)
  app1View.setUint16(2, payload.length + 2)
  app1.set(payload, 4)

  const file = new Uint8Array(2 + app1.length + 2)
  file.set([0xff, 0xd8], 0)
  file.set(app1, 2)
  file.set([0xff, 0xd9], 2 + app1.length)
  return new File([file], 'IMG_1234.jpg', { type: 'image/jpeg', lastModified: Date.now() })
}

describe('readShotDate (RF-416)', () => {
  it('lee la fecha fiable de la toma y la marca como exacta', async () => {
    const taken = await readShotDate(jpegWithDates({ original: '2024:03:14 09:05:01' }))
    expect(taken?.date).toBe('2024-03-14')
    expect(taken?.exact).toBe(true)
    expect(taken?.source).toBe('DATE_TIME_ORIGINAL')
  })

  it('cae al respaldo del IFD0 marcándolo como aproximado: las 14 tomas de 2022', async () => {
    // Sin este respaldo obligatorio no se corrige ninguna de las catorce, que llevan
    // por fecha la de su subida.
    const taken = await readShotDate(jpegWithDates({ file: '2022:10:09 17:10:33' }))
    expect(taken?.date).toBe('2022-10-09')
    expect(taken?.exact).toBe(false)
    expect(taken?.source).toBe('IFD0_DATE_TIME')
  })

  it('prefiere la fecha del disparo cuando el fichero trae las dos', async () => {
    const taken = await readShotDate(
      jpegWithDates({ original: '2024:03:14 09:05:01', file: '2025:01:02 03:04:05' }),
    )
    expect(taken?.date).toBe('2024-03-14')
    expect(taken?.exact).toBe(true)
  })

  it('devuelve nulo sin lanzar cuando no hay fecha que leer', async () => {
    // Un JPEG sin EXIF, algo que no es un JPEG, y un fichero vacío. Los tres son
    // «esta fotografía no dice cuándo se tomó», que la fila anota como nulo y la
    // interfaz explica: nunca un hueco y nunca una fecha inventada.
    const bare = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])])
    await expect(readShotDate(bare)).resolves.toBeNull()
    await expect(readShotDate(blobOf(pngBytes, 'image/png'))).resolves.toBeNull()
    await expect(readShotDate(new Blob([]))).resolves.toBeNull()
  })

  it('no confunde la fecha de modificación del fichero con la de la toma', async () => {
    // `File.lastModified` es la fecha en que se escribió el fichero; el teléfono la
    // reescribe al copiar, descargar o compartir, y una toma rehidratada de la cola
    // la trae del instante de la rehidratación.
    const file = new File([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], 'IMG_9.jpg', {
      type: 'image/jpeg',
      lastModified: Date.parse('2026-08-03T12:00:00Z'),
    })
    expect(file.lastModified).toBeGreaterThan(0)
    await expect(readShotDate(file)).resolves.toBeNull()
  })

  it('solo lee el prefijo del fichero, no los megabytes de píxeles', async () => {
    // Lo importante es que no se pida el fichero entero: son 8 MB en el mismo efecto
    // que crea el object URL, en un teléfono.
    const jpeg = jpegWithDates({ original: '2024:03:14 09:05:01' })
    const padded = new Blob([jpeg, new Uint8Array(300_000)], { type: 'image/jpeg' })
    let asked = 0
    const spy = new Proxy(padded, {
      get(target, prop, receiver) {
        if (prop === 'slice') {
          return (start?: number, end?: number) => {
            asked = (end ?? padded.size) - (start ?? 0)
            return padded.slice(start, end)
          }
        }
        return Reflect.get(target, prop, receiver) as unknown
      },
    })
    await expect(readShotDate(spy as Blob)).resolves.toMatchObject({ date: '2024-03-14' })
    expect(asked).toBe(131072)
  })
})
