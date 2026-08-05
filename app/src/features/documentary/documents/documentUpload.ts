/**
 * Subir el fichero escaneado de un documento de archivo (RF-408, RF-110, RF-517).
 *
 * Two acts, and the whole point of this module is that they are two:
 *
 *   · UPLOAD writes a file into the private bucket and a row into
 *     `archive_documents`. That row belongs to the ARCHIVE, not to an artwork.
 *   · LINK writes a row into `artwork_documents`, the bridge table, and can be
 *     repeated for as many artworks as the document speaks about (RF-516).
 *
 * A press cutting about a joint show is linked to three artworks and the PDF is
 * stored ONCE — which is exactly why the bridge table exists — so a screen that
 * folded the two acts into one «Añadir documento» would teach the cataloger to
 * upload the same scan three times. Uploading from a record does both in one go,
 * because that is what «this paper is about this artwork» means, but the two
 * halves report separately: a document that landed in the archive and failed to
 * link is NOT a failed upload, and saying so is the difference between a retry
 * and a duplicate.
 *
 * ── EL ORIGINAL DE ARCHIVO DE UNA FOTOGRAFÍA NO SE TOCA ──
 * The scanned document goes to its OWN prefix (`archivo/`) with a random suffix
 * and `upsert: false`. A photograph's master, derivatives and corrected copy live
 * under `<CATALOG_ID>/…` and are reached by paths this module cannot even
 * produce: nothing here carries a `catalog_id`, so the two families of names
 * cannot collide by arithmetic and not by care. And nothing is ever overwritten —
 * measured, the store answers 409 to a repeated path (see
 * `describeStorageFailure`), which is a refusal and not a silent replacement.
 *
 * Todo se decide sin navegador: los tres bordes impuros —subir, insertar,
 * vincular— se inyectan, que es la única forma de que la batería, que corre en
 * node, verifique el orden y lo que se dice cuando falla el paso de en medio.
 */

import { fileNameSlug, storedExtension } from '../../artworks/archiveDownloads'
import { randomSuffix } from '../../../lib/images'
import { fileSizeText } from '../documentaryFormat'

/**
 * The prefix of every scanned document inside the private `obras` bucket.
 *
 * Spanish, like the bucket id itself: both are STORED DATA and not identifiers of
 * the code (see CLAUDE.md — `obras` is a row in `storage.buckets` with objects
 * inside and stays as legacy). The prefix already appears in the tests of
 * `documentFile.ts`, written when the download side of this block was built, so
 * changing it now would rename nothing and break the pair.
 *
 * Its real job is separation: a photograph's files hang from `<CATALOG_ID>/`, so
 * no name produced here can ever land on one of them.
 */
export const ARCHIVE_PREFIX = 'archivo'

/**
 * What the bucket accepts per file, measured and not assumed: **62 914 560 bytes,
 * 60 MiB**, read from `storage.buckets` of the running base
 * (`select file_size_limit from storage.buckets where id = 'obras'`), which is
 * what `20260726010000_imagenes.sql` set and no migration has changed since.
 * There is no `allowed_mime_types` restriction, so any type goes up — a PDF, a
 * TIFF scan, a Word file.
 *
 * A scanned expediente in one PDF (RF-408) fits with room to spare in black and
 * white; in colour it gets there from a few dozen pages. So the number is worth
 * knowing BEFORE the store speaks, because what the store says was measured too
 * and it says it in English with no number:
 *
 *   HTTP 400 · {"statusCode":"413","error":"Payload too large",
 *               "message":"The object exceeded the maximum allowed size"}
 *
 * It is a copy of a platform setting, and it is only used to write a sentence —
 * never to authorise anything. The store is still the authority: if the limit is
 * raised in the bucket and not here, the worst that happens is that this refuses
 * a file the store would have taken, which is a nuisance and not a lie.
 */
export const BUCKET_FILE_LIMIT_BYTES = 62_914_560

/** How long the slug of the file name may be. Same criterion as the download name. */
const SLUG_LIMIT = 48

/**
 * What this module needs of the file the cataloger picked.
 *
 * A structural subset of `File`, so the whole flow is verified without a browser:
 * `File` is a DOM type and the battery runs in node.
 */
export interface PickedFile {
  name: string
  size: number
  /** What the browser reported. Empty for a file the system cannot classify. */
  type: string
}

/**
 * The extension the stored path ends in, or null when nothing believable can be
 * derived.
 *
 * It matters more than it looks: the name the file lands with when somebody
 * downloads it later is built by `documentFileName` out of `storedExtension(file_path)`,
 * so a path with no extension gives a download with no extension — a file that
 * opens in nothing. The uploaded name is tried first because it is what the
 * scanner wrote; the reported type is the fallback; and nothing is invented past
 * that, because an extension that lies is worse than one that is missing.
 */
export function extensionForFile(file: PickedFile): string | null {
  const fromName = storedExtension(file.name)
  if (fromName !== null) return fromName
  const type = file.type.split(';')[0]?.trim().toLowerCase() ?? ''
  return MIME_EXTENSION[type] ?? null
}

/** Only the types an archive actually produces. Anything else keeps no extension. */
const MIME_EXTENSION: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/tiff': 'tif',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'text/plain': 'txt',
}

/**
 * The `mime_type` column, never blank.
 *
 * `archive_documents_mime_type_shape` refuses an empty string and the four file
 * columns travel together, so a file the browser could not classify cannot be
 * stored with «nothing» in that column. `application/octet-stream` is the honest
 * value for it: «bytes, and nobody said what kind», which is what
 * `mimeText` then reads out as the raw type instead of pretending.
 */
export function mimeForFile(file: PickedFile): string {
  const type = file.type.trim()
  return type === '' ? 'application/octet-stream' : type
}

/**
 * Where the file goes inside the bucket.
 *
 * The signature — when there is one — leads, because it is what identifies the
 * folder in the archive and it makes the bucket browsable by hand; the title is
 * the fallback. A random suffix closes it, for the reason the photographs already
 * learned (see `images.ts`): paths in this bucket are immutable, the service
 * worker caches by path, and a name that can repeat is a name that one day
 * overwrites. `suffix` is a parameter so a test reads a fixed path and not a
 * regular expression.
 *
 * Nothing in the name carries the `catalog_id` of the artwork it was uploaded
 * from, and that is the same decision `documentFileName` took for the download:
 * the document belongs to the archive, and one document linked to three artworks
 * must not have three names.
 */
export function documentObjectPath(
  document: { archive_code?: string | null; title: string },
  file: PickedFile,
  suffix: string = randomSuffix(),
): string {
  const code = fileNameSlug(document.archive_code ?? '')
  const named = code !== '' ? code : limitSlug(fileNameSlug(document.title), SLUG_LIMIT)
  // «documento» only for a title of pure punctuation: the database demands a
  // non-blank title and a slug of «···» is empty.
  const base = named === '' ? 'documento' : named
  const extension = extensionForFile(file)
  const tail = extension === null ? '' : `.${extension}`
  return `${ARCHIVE_PREFIX}/${base}_${suffix}${tail}`
}

/** A slug cut to length at a hyphen, so the name ends on a whole word. */
function limitSlug(slug: string, limit: number): string {
  if (slug.length <= limit) return slug
  const cut = slug.slice(0, limit)
  const lastBreak = cut.lastIndexOf('-')
  return (lastBreak > 0 ? cut.slice(0, lastBreak) : cut).replace(/-+$/, '')
}

/**
 * Why this file cannot be uploaded, or null when it can.
 *
 * Two refusals, both of them measured against the store and both of them said
 * BEFORE the upload starts — which over mobile data is the whole point: pushing
 * 61 MB up a phone connection in order to be told «Payload too large» in English
 * costs a quarter of an hour and somebody's data plan.
 *
 *   · **A file of zero bytes.** `archive_documents_file_size_positive` refuses it
 *     next to the data, and it is worth catching here because it is not a typo:
 *     it is a scan that failed, and the honest thing to say is that there is
 *     nothing to upload rather than to register an empty document.
 *   · **Over the bucket's limit**, with both numbers in the sentence: what it
 *     weighs and what fits. And with what to DO about it, which for a scanned
 *     expediente is real advice — RF-408 asks for one PDF per document, and
 *     splitting a 300-page colour scan into two documents of the same folder is
 *     the way through.
 *
 * The type is deliberately NOT checked. The bucket declares no
 * `allowed_mime_types` (measured), the archive holds letters, cuttings, posters,
 * cassettes and whatever else, and a whitelist here would refuse the one format
 * nobody thought of.
 */
export function documentFileProblem(file: PickedFile | null | undefined): string | null {
  if (!file) return null
  if (file.size <= 0) {
    return (
      `«${file.name}» está vacío: 0 bytes. Suele ser un escaneo que se cortó a medias. ` +
      'Vuelve a generar el fichero y súbelo otra vez.'
    )
  }
  if (file.size > BUCKET_FILE_LIMIT_BYTES) {
    return (
      `«${file.name}» pesa ${fileSizeText(file.size) ?? 'demasiado'} y el almacén acepta como ` +
      `mucho ${fileSizeText(BUCKET_FILE_LIMIT_BYTES)} por fichero. Si es un expediente escaneado ` +
      'en color, vuelve a escanearlo en blanco y negro o pártelo en dos documentos de la misma ' +
      'carpeta; y si no cabe de ninguna manera, registra el documento sin fichero y anótalo.'
    )
  }
  return null
}

/**
 * The four file columns of `archive_documents`, together or not at all.
 *
 * `archive_documents_file_all_or_nothing` demands exactly that — measured, it
 * answers «new row for relation "archive_documents" violates check constraint
 * "archive_documents_file_all_or_nothing"» — and building them in one function is
 * what stops a form from ever sending three of the four. There is no `digitized`
 * flag to keep in step: the answer to «is it scanned?» is this path.
 *
 * `uploaded_at` is the client's clock, which is what the column is for: the row's
 * `created_at` is sealed by `tg_row_audit` and would say the same thing today, but
 * these two drift the day a document uploaded from the phone gets its row written
 * by a retry.
 */
export function fileColumns(
  path: string,
  file: PickedFile,
  now: Date = new Date(),
): { file_path: string; file_size_bytes: number; mime_type: string; uploaded_at: string } {
  return {
    file_path: path,
    file_size_bytes: file.size,
    mime_type: mimeForFile(file),
    uploaded_at: now.toISOString(),
  }
}

// ── Cuando el almacén dice no ─────────────────────────────────

/**
 * A storage refusal as `@supabase/storage-js` hands it over: the message, and the
 * store's own code as a string.
 *
 * Declared here instead of importing `StorageError` so this module stays free of
 * the client. A `StorageError` fits the shape.
 */
export interface StorageRefusal {
  message: string
  /** «413», «409», «403»… The HTTP status the store meant, inside a 400. */
  statusCode?: string | null
}

/**
 * What the cataloger reads when the upload fails, in es-ES.
 *
 * **Every case was provoked against the local store and read, not imagined** —
 * over the same HTTP the application uses, with a real Cataloger's token. All
 * three arrive as HTTP 400 with the real status buried in the body, which is why
 * the mapping keys on `statusCode` and not on `status`:
 *
 *   · `413` · «The object exceeded the maximum allowed size». Should never get
 *     here — `documentFileProblem` says the number first — and it is mapped
 *     because the bucket's limit can be lowered without this file knowing.
 *   · `409` · «The resource already exists». Also should never get here: the path
 *     carries a random suffix and `upsert` is false. If it does, something is
 *     retrying, and the file that is up there is NOT to be overwritten.
 *   · `403` · «new row violates row-level security policy», which is what a
 *     Reader's token gets. The message is the database's, in English, naming RLS.
 *
 * Anything else falls back to the connection, which is what actually happens in a
 * warehouse: 40 MB up a phone line that drops.
 */
export function describeStorageFailure(refusal: StorageRefusal | null): string {
  if (refusal === null) {
    return (
      'No se ha subido el fichero y el almacén no ha dicho por qué. No se ha registrado nada: ' +
      'vuelve a intentarlo donde haya cobertura.'
    )
  }
  const code = (refusal.statusCode ?? '').trim()
  const message = refusal.message.trim()

  if (code === '413') {
    return (
      `El almacén ha rechazado el fichero por tamaño: acepta como mucho ` +
      `${fileSizeText(BUCKET_FILE_LIMIT_BYTES)} por fichero. No se ha registrado nada.`
    )
  }
  if (code === '409') {
    return (
      'Ya hay un fichero guardado con ese nombre y no se sobrescribe nunca: los ficheros del ' +
      'almacén no se tocan una vez subidos. Vuelve a intentarlo; el nombre se genera otra vez.'
    )
  }
  if (code === '403' || code === '401') {
    return (
      'Tu sesión no tiene permiso para subir ficheros al almacén. Vuelve a entrar en la ' +
      'aplicación; si sigue igual, es que tu cuenta ya no es de catalogación. No se ha ' +
      'registrado nada.'
    )
  }
  if (message === '' || /failed to fetch|networkerror|network error|load failed/i.test(message)) {
    return (
      'No se ha podido subir el fichero: la conexión con el almacén se ha cortado antes de ' +
      'terminar. No se ha registrado nada, así que puedes volver a intentarlo sin duplicar nada.'
    )
  }
  return `No se ha podido subir el fichero: ${message}. No se ha registrado nada.`
}

// ── Subir, registrar, enlazar ─────────────────────────────────

/** Where the upload is. Three waits of very different lengths, and all silent. */
export type UploadStep = 'uploading' | 'registering' | 'linking'

/** What the button says while each step lasts, so it is never just stuck. */
export const UPLOAD_STEP_TEXT: Record<UploadStep, string> = {
  uploading: 'Subiendo el fichero…',
  registering: 'Registrando el documento…',
  linking: 'Enlazando con la obra…',
}

/** Everything decided before the first request. */
export interface UploadDocumentPlan {
  /** The artwork this paper is about. */
  catalogId: string
  /** The columns of `archive_documents` except the four of the file. */
  document: Record<string, unknown> & { title: string; archive_code?: string | null }
  /** Null registers the document «sin digitalizar», which is legitimate (RF-408). */
  file: PickedFile | null
  /** What this document says about THIS artwork. Goes on the bridge row, not on the document. */
  linkNote: string
}

export interface UploadDocumentDeps {
  /** Puts the bytes in the bucket. Answers null when it worked. */
  upload: (path: string, file: PickedFile) => Promise<StorageRefusal | null>
  /** Writes the row and answers its identifier, or the sentence to show. */
  insert: (
    columns: Record<string, unknown>,
  ) => Promise<{ id: string } | { error: string }>
  /** `document_artwork(catalog_id, document_id, note)`. Answers null when it worked. */
  link: (documentId: string, note: string) => Promise<string | null>
  onStep?: (step: UploadStep) => void
  /** Injected so `uploaded_at` is readable in a test. */
  now?: () => Date
  /** Injected so the stored path is readable in a test. */
  suffix?: () => string
}

export type UploadDocumentOutcome =
  | { ok: true; documentId: string; notice: string }
  /**
   * `documentId` present means the document IS in the archive — with its file —
   * and only the link failed. It is the outcome that must never read as «no se ha
   * subido», because retrying the upload would put a second copy of the same PDF
   * in the bucket and a second row in the archive.
   */
  | { ok: false; problem: string; documentId?: string }

/**
 * Upload the file, register the document, link it to the artwork — in that order,
 * and stopping at the first failure.
 *
 * **The order is the same one `uploadShot` argues for and for the same reason:**
 * a file in the bucket that no row points at breaks nothing and can be cleaned up
 * later; a row that claims a file which never arrived is a download button that
 * fails for ever, and the record has no way to know. So the bytes go first.
 *
 * The three outcomes are three different sentences, which is the whole reason
 * this is a function and not three awaits in a component:
 *
 *   · the file did not go up → nothing was registered, retry freely;
 *   · the row did not go in → the file is orphaned in the store, which is
 *     harmless, and retrying is safe (the path is generated again);
 *   · the LINK did not go in → the document is in the archive, scanned, and only
 *     the bridge row is missing. Uploading again would duplicate the PDF, so what
 *     is said is «enlázalo», not «vuelve a subirlo».
 */
export async function runDocumentUpload(
  plan: UploadDocumentPlan,
  deps: UploadDocumentDeps,
): Promise<UploadDocumentOutcome> {
  const problem = documentFileProblem(plan.file)
  if (problem !== null) return { ok: false, problem }

  let columns: Record<string, unknown> = { ...plan.document }

  if (plan.file !== null) {
    const path = documentObjectPath(plan.document, plan.file, deps.suffix?.())
    deps.onStep?.('uploading')
    const refusal = await deps.upload(path, plan.file)
    if (refusal !== null) return { ok: false, problem: describeStorageFailure(refusal) }
    columns = { ...columns, ...fileColumns(path, plan.file, deps.now?.()) }
  }

  deps.onStep?.('registering')
  const written = await deps.insert(columns)
  if ('error' in written) {
    return {
      ok: false,
      problem:
        plan.file === null
          ? written.error
          : // Said out loud rather than hidden: the bytes are up there and nobody
            // is going to find them. It is harmless, and a cataloger who is not
            // told will wonder whether she has to clean something up.
            `${written.error} El fichero sí había subido y se queda suelto en el almacén, ` +
            'que no estorba a nadie. Vuelve a intentarlo: se sube otra vez con otro nombre.',
    }
  }

  deps.onStep?.('linking')
  // Trimmed here, once: the bridge row stores what it is given, and a note of
  // nothing but spaces would make `document_artwork` think there is something to
  // write over what somebody already put there.
  const failure = await deps.link(written.id, plan.linkNote.trim())
  if (failure !== null) {
    return {
      ok: false,
      documentId: written.id,
      problem:
        `El documento ya está en el archivo${plan.file === null ? '' : ' con su fichero'}, pero ` +
        `no se ha podido enlazar con esta obra: ${failure} NO vuelvas a subirlo, que se ` +
        'duplicaría: enlázalo con «Enlazar un documento del archivo».',
    }
  }

  return {
    ok: true,
    documentId: written.id,
    notice: uploadedNotice(plan),
  }
}

/**
 * What is said when it worked.
 *
 * Saying nothing on success is a real failure of a button on a phone: the sheet
 * closes, the page does not move, and the tap looks like it did nothing. And it
 * says the two things that were done separately, because that is the distinction
 * the whole screen is built on: the document is in the archive, AND it is linked
 * here. A document with no file gets the sentence that matters to it instead —
 * that it counts as «sin digitalizar» — so nobody goes looking for a download
 * button that is not there.
 */
export function uploadedNotice(plan: Pick<UploadDocumentPlan, 'document' | 'file'>): string {
  const title = plan.document.title.trim()
  const named = title === '' ? 'El documento' : `«${title}»`
  if (plan.file === null) {
    return (
      `${named} queda registrado en el archivo y enlazado con esta obra, sin digitalizar: ` +
      'consta que el original solo está en papel.'
    )
  }
  const weight = fileSizeText(plan.file.size)
  const size = weight === null ? '' : ` (${weight})`
  return `${named} queda en el archivo con su fichero${size} y enlazado con esta obra.`
}
