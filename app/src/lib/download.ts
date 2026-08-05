/**
 * Bringing a file OUT of the external store and onto the device (RF-411, RF-420).
 *
 * The store is not Supabase: the master and the full-resolution corrected copy live in
 * an external S3 (B2 in production, MinIO locally) and are reached with a URL the
 * `sign-file` function signs for a few minutes. Getting one is `images.ts`; what
 * happens with it afterwards is this module.
 *
 * ── Por qué se descarga con `fetch` y no abriendo la URL firmada ──
 *
 * The obvious implementation — `window.open(signedUrl)` — is wrong three times over,
 * and every one of them was visible on the phone, which is the primary device:
 *
 *   · it runs AFTER an `await`, outside the window of the user's gesture, so iOS
 *     Safari and Firefox treat it as an unsolicited popup and swallow it. The button
 *     does nothing at all, and nothing on screen says why. «Nunca un botón que no
 *     responde» starts here;
 *   · a signed URL of an `image/jpeg` is DISPLAYED by the browser, not saved: the
 *     function does not sign a `response-content-disposition`, and adding one from the
 *     client is impossible because touching the query of a presigned URL breaks the
 *     signature. So «Descargar» actually meant «abrir el máster en una pestaña», which
 *     is the literal thing RF-411 says not to do;
 *   · once the tab is open nobody can report anything. An expired signature, a 404 or
 *     a connection cut halfway through 19 MB arrive as an XML error page from the
 *     store, in English, in a tab the application does not own.
 *
 * Reading the body here fixes the three: the download is a normal request whose failure
 * is catchable and can be explained in Spanish, and the bytes are handed to an `<a
 * download="…">`, which is the only way the file lands with a name a print shop can
 * make sense of. The price is holding the file in memory — up to about 19 MB for a
 * master — and needing CORS on the bucket, which is already `s3_get` from any origin
 * (`infra/b2.tf`). It is paid once, on an explicit tap, and never on a page load.
 */

/** What went wrong, in the only five ways the cataloger can act differently about. */
export type DownloadFailureKind = 'sign' | 'network' | 'expired' | 'missing' | 'store' | 'unknown'

/**
 * A download that did not happen, carrying its reason already written in Spanish.
 *
 * The `kind` travels next to the message because the screen may want to act on it —
 * an expired signature is worth retrying by itself, a missing file is not — and
 * re-deriving it from the text would be parsing our own prose.
 */
export class DownloadFailure extends Error {
  constructor(
    readonly kind: DownloadFailureKind,
    message: string,
  ) {
    super(message)
    this.name = 'DownloadFailure'
  }
}

/**
 * The store's HTTP status, read as one of the reasons above.
 *
 * 403 is the interesting one and the reason this is a function and not an `if`: S3
 * answers 403 both to a signature that has expired and to one that never was valid,
 * and from the phone those are the same event — the URL was asked for a minute ago, so
 * what happened is that it went stale. Retrying is the right advice for both.
 */
export function downloadFailureKind(status: number): DownloadFailureKind {
  if (status === 401 || status === 403) return 'expired'
  if (status === 404 || status === 410) return 'missing'
  if (status >= 500) return 'store'
  return 'unknown'
}

/**
 * What the cataloger reads when a download fails: what happened and what to do about
 * it, in es-ES, naming the file she asked for and never the machinery.
 *
 * `label` is the file as the interface calls it («el original», «la copia corregida»),
 * so the sentence talks about the thing on the button and not about a bucket, a
 * signature or an Edge function she has never heard of. `detail` is the technical crumb
 * — an HTTP status, the message of the failed invocation — added in brackets: useless
 * to her, decisive when she reads it out over the phone.
 */
/**
 * `a` + `el documento` = `al documento`; `de` + `el original` = `del original`.
 *
 * Los dos artículos contractos del español, que aquí no son un detalle de estilo: los
 * nombres que llegan como `label` son frases —«el original», «la copia corregida», «el
 * documento «Carta de la galería»»— y una de cada dos empieza por «el». Sin esto, el
 * único aviso que lleva preposición delante decía «no se ha podido preparar la descarga
 * de el documento», y una frase mal escrita en un mensaje de error hace dudar del
 * programa entero justo cuando algo acaba de ir mal.
 */
export function contracted(preposition: 'a' | 'de', label: string): string {
  // Solo el artículo masculino singular se contrae: «de la copia» y «de los originales»
  // se quedan como están.
  if (label.startsWith('el ')) return `${preposition === 'a' ? 'al' : 'del'} ${label.slice(3)}`
  return `${preposition} ${label}`
}

export function downloadFailureText(
  label: string,
  kind: DownloadFailureKind,
  detail?: string | number,
): string {
  const aside = detail === undefined || detail === '' ? '' : ` (${detail})`
  switch (kind) {
    case 'sign':
      // «Acceder» y no «preparar la descarga»: firmar es el paso previo tanto de bajarse
      // el fichero como de VERLO sin bajárselo, y un documento que se abre en el visor
      // decía «no se ha podido preparar la descarga» de algo que nadie había pedido
      // descargar. Lo que ha fallado es el permiso, y eso es lo mismo en los dos casos.
      return (
        `No se ha podido acceder ${contracted('a', label)}: no ha llegado el permiso para ` +
        `entrar en el almacén de originales${aside}. Comprueba la conexión y vuelve a intentarlo.`
      )
    case 'network':
      return (
        `No se ha podido descargar ${label}: la conexión con el almacén se ha cortado antes de ` +
        `terminar${aside}. Comprueba la cobertura y vuelve a intentarlo; no se ha guardado nada ` +
        `a medias.`
      )
    case 'expired':
      return (
        `No se ha podido descargar ${label}: el permiso de descarga había caducado${aside}. ` +
        `Vuelve a tocar el botón y se pide uno nuevo.`
      )
    case 'missing':
      return (
        `No se ha podido descargar ${label}: el fichero ya no está en el almacén${aside}. La ` +
        `ficha lo sigue dando por guardado, así que conviene avisar de esta obra. Lo que se ve ` +
        `en pantalla no se ha tocado.`
      )
    case 'store':
      return (
        `No se ha podido descargar ${label}: el almacén ha contestado con un error${aside}. ` +
        `Espera un momento y vuelve a intentarlo.`
      )
    default:
      return (
        `No se ha podido descargar ${label}${aside}. Vuelve a intentarlo; si sigue pasando, ` +
        `anota el código de la obra y avisa.`
      )
  }
}

/**
 * The two things this module does to the outside world, injectable so the whole flow
 * can be tested without a browser: the battery runs in node, and «no hay DOM» is not a
 * reason to leave the only path out of the store unverified.
 */
export interface DownloadDeps {
  fetch?: (url: string) => Promise<Response>
  save?: (blob: Blob, fileName: string) => void
}

/**
 * Hands the bytes to the device under `fileName`.
 *
 * An object URL and an `<a download>`, clicked from code: the anchor is created,
 * clicked and thrown away without ever being in the document, which every current
 * browser accepts and which — unlike `window.open` — is not a popup, so it survives
 * having happened after an `await`.
 *
 * The object URL is revoked on the next turn and not immediately: revoking it in the
 * same tick has raced the browser's own reading of it. Leaking it would keep the whole
 * file alive in memory, which for a master is exactly the megabytes worth freeing.
 */
function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.rel = 'noopener'
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

/**
 * Downloads a signed URL and saves it with the name we chose (RF-411).
 *
 * Every failure comes out as a `DownloadFailure` whose message is already the sentence
 * to show. Nothing is thrown raw: a `TypeError: Failed to fetch` on the screen of
 * someone cataloging in a warehouse is the same as saying nothing.
 */
export async function downloadSignedFile(
  url: string,
  fileName: string,
  label: string,
  deps: DownloadDeps = {},
): Promise<void> {
  const request = deps.fetch ?? ((target: string) => fetch(target))
  const save = deps.save ?? saveBlob

  let response: Response
  try {
    response = await request(url)
  } catch (cause) {
    // A CORS rejection and a cut cable are indistinguishable here by design of the
    // platform: `fetch` refuses to say which, so the message covers both by talking
    // about the connection and not about a cause we cannot know.
    throw new DownloadFailure('network', downloadFailureText(label, 'network', messageOf(cause)))
  }

  if (!response.ok) {
    const kind = downloadFailureKind(response.status)
    throw new DownloadFailure(kind, downloadFailureText(label, kind, `HTTP ${response.status}`))
  }

  let blob: Blob
  try {
    blob = await response.blob()
  } catch (cause) {
    // The headers arrived and the body did not: the classic 19 MB over mobile data
    // that dies in the middle. It is the same advice as a refused connection.
    throw new DownloadFailure('network', downloadFailureText(label, 'network', messageOf(cause)))
  }

  save(blob, fileName)
}

/** The technical crumb of a thrown value, or nothing when it does not say anything. */
export function messageOf(cause: unknown): string | undefined {
  if (cause instanceof Error && cause.message) return cause.message
  if (typeof cause === 'string' && cause) return cause
  return undefined
}
