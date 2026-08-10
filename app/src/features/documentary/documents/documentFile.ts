/**
 * The scanned file of an archive document: what it weighs, what it is called and
 * how it leaves the application (RF-408, RF-411, RF-110).
 *
 * An archive document is a letter, a press cutting, a poster or an archive
 * photograph, and when it is digitised it carries ONE file — for a multi-page
 * expediente, a single PDF with all the pages (RF-408). There is no `digitized`
 * flag anywhere: the answer is `file_path !== null`, and everything this module
 * decides hangs off that one question.
 *
 * ── Se reutiliza el camino de descarga que ya existe ──
 * Nothing here reimplements a download. `downloadSignedFile` from `lib/download.ts`
 * already fetches the bytes and hands them to an `<a download>` — which is what
 * makes the file LAND with a readable name instead of opening in a tab (RF-411) —
 * and already turns every way it can fail into a sentence in Spanish.
 * `fileNameSlug` and `storedExtension` come from `archiveDownloads.ts`, which
 * solved the same problem for photographs a few hours ago and whose two helpers
 * know nothing about photographs. What is new here is only what an ARCHIVE
 * document is called and what its weight has to say before it is touched.
 *
 * ── El peso, antes de tocar ──
 * A scanned expediente weighs, and this is used over mobile data with the artwork
 * in front of you (RNF-106). So the size is on the BUTTON and not in a footnote,
 * and past a threshold the button also says out loud that this is not something to
 * start on the way to the warehouse. A download that cost 30 MB of somebody's data
 * plan without warning is a download that gets cancelled halfway.
 *
 * Everything is decided without a browser: the battery runs in node, and the two
 * impure edges — signing and saving — are injectable for exactly that reason.
 */

import {
  DownloadFailure,
  downloadFailureText,
  downloadSignedFile,
  messageOf,
} from '../../../lib/download'
import { signedUrl } from '../../../lib/images'
import { fileNameSlug, storedExtension } from '../../artworks/archiveDownloads'
import { fileSizeText } from '../documentaryFormat'
import {
  documentPreviewKind,
  previewHint,
  previewLabel,
  type DocumentPreviewKind,
} from './documentPreview'

/**
 * What this module needs of an `archive_documents` row, and no more.
 *
 * A structural subset on purpose, like `CorrectedCopyColumns`: a caller with these
 * six columns can ask about the file, and a test does not have to build a whole
 * document — with its twenty columns of dates, audit and classification — to check
 * what a button says.
 */
export interface DocumentFileColumns {
  /** Signature written on the folder («AR-ARCH-0001»). Optional, and the best name there is. */
  archive_code: string | null
  title: string
  start_year: number | null
  /** Path inside the private `obras` bucket. Null is «sin digitalizar» (RF-408). */
  file_path: string | null
  file_size_bytes: number | null
  mime_type: string | null
}

/** One download on offer, with everything the button needs already decided. */
export interface DocumentFileOffer {
  /** The path inside the private bucket, which is what gets signed (RF-110). */
  path: string
  /** The name the file lands with, chosen here and not by the store. */
  fileName: string
  /**
   * How it can be seen without downloading it, or null when the only way out is downloading it.
   *
   * `documentPreview.ts` decides it, which is where the boundary of what a
   * browser paints and what it does not lives. With this, downloading stops being the primary action of a JPEG
   * or of a PDF: it is still there, because taking the file out of the catalogue is a requirement
   * (RF-411), but one step behind.
   */
  preview: DocumentPreviewKind | null
  /** What the view button says, with the weight inside. Null when there is no button. */
  previewLabel: string | null
  /** What is read below that button, or null. */
  previewHint: string | null
  /** The text of the button, weight included. */
  label: string
  /** What the file is, in one line: «PDF · 3,2 MB». Never a gap (RF-304). */
  kindText: string
  /** How this file is named inside a failure message. */
  noun: string
  bytes: number | null
  /** Said out loud when the file is heavy for a phone with no wifi. Null when it is not. */
  weightWarning: string | null
}

/**
 * From here on a file is «heavy»: 10 MiB.
 *
 * Not a round number of megabytes for elegance — it is where a download stops
 * being instant on the connection of a warehouse and starts being a decision. The
 * bucket accepts up to 60 MiB per file, so a colour-scanned expediente lands well
 * above this and the cataloger has to know before tapping, not after.
 */
export const HEAVY_FILE_BYTES = 10 * 1_048_576

/** How long a slug of the title may be inside a file name. */
const TITLE_SLUG_LIMIT = 48

/**
 * What kind of file it is, in words the cataloger reads.
 *
 * The stored `mime_type` is what the browser reported on upload and it is not
 * readable: «application/vnd.openxmlformats-officedocument.wordprocessingml.document»
 * says nothing on a phone. The short list covers what an archive actually holds —
 * PDFs and scans — and anything outside it falls back to its family and finally to
 * the raw type, which at least can be read out over the telephone.
 *
 * Null when the row does not say, which by the table's own check means there is no
 * file either.
 */
export function mimeText(mime: string | null | undefined): string | null {
  if (typeof mime !== 'string') return null
  // The parameters of a Content-Type («; charset=utf-8») are not part of what it is.
  const type = mime.split(';')[0]?.trim().toLowerCase() ?? ''
  if (type === '') return null
  const known = MIME_LABEL[type]
  if (known) return known
  const family = type.split('/')[0]
  if (family === 'image') return 'imagen'
  if (family === 'video') return 'vídeo'
  if (family === 'audio') return 'audio'
  if (family === 'text') return 'texto'
  return type
}

const MIME_LABEL: Record<string, string> = {
  'application/pdf': 'PDF',
  'image/jpeg': 'imagen JPEG',
  'image/png': 'imagen PNG',
  'image/tiff': 'imagen TIFF',
  'image/webp': 'imagen WebP',
  'image/heic': 'imagen HEIC',
  'text/plain': 'texto',
  'application/msword': 'documento de Word',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    'documento de Word',
}

/**
 * A file name that survives leaving the application (RF-411).
 *
 * Somebody receives this by e-mail with no context, so it says what identifies the
 * document in the archive: its signature and its title —
 * `AR-ARCH-0001_carta-de-la-galeria.pdf`.
 *
 * What it deliberately does NOT carry is the `catalog_id` of the artwork it was
 * downloaded from, and that is a decision and not an oversight: this file belongs
 * to the archive and not to one artwork. A press cutting about a joint show is
 * linked to three artworks (which is why RF-516 makes it a bridge table), and
 * naming it after whichever record it happened to be opened from would produce
 * three names for one document and a receiver who thinks he has three files.
 *
 * With no signature the year comes in instead, when there is one: a folder full of
 * `recorte-de-prensa.pdf` is a folder nobody can work in, and `1985` is the datum
 * that tells them apart.
 */
export function documentFileName(document: DocumentFileColumns): string {
  const code = fileNameSlug(document.archive_code ?? '')
  const title = limitSlug(fileNameSlug(document.title), TITLE_SLUG_LIMIT)
  const year = code === '' && document.start_year != null ? String(document.start_year) : ''
  // «documento-de-archivo» only happens for a title of nothing but punctuation:
  // the database demands a non-blank title, and a slug of «···» is empty.
  const base = [code, title, year].filter((part) => part !== '').join('_') || 'documento-de-archivo'
  const extension = storedExtension(document.file_path ?? '')
  return extension === null ? base : `${base}.${extension}`
}

/**
 * A slug cut to length at a hyphen, so the name ends on a whole word.
 *
 * Cutting mid-word gives `carta-de-la-galeria-de-arte-contempo`, which reads like a
 * corrupted file. If there is no hyphen to cut at, the hard cut is used: a name
 * that is too long is a nuisance in a mail client, and some stores refuse it.
 */
function limitSlug(slug: string, limit: number): string {
  if (slug.length <= limit) return slug
  const cut = slug.slice(0, limit)
  const lastBreak = cut.lastIndexOf('-')
  return (lastBreak > 0 ? cut.slice(0, lastBreak) : cut).replace(/-+$/, '')
}

/**
 * How the file is named inside a failure message: `el documento «Carta de la
 * galería»`.
 *
 * The title goes in because a record can hold half a dozen of these and every one
 * of them has the same button. «No se ha podido descargar el documento» over a
 * list of six is a sentence that does not say which one failed.
 */
export function documentNoun(title: string): string {
  const clean = title.trim().replace(/\s+/g, ' ')
  return clean === '' ? 'el documento' : `el documento «${clean}»`
}

/**
 * What to say when the file is heavy, or null when there is nothing to warn about.
 *
 * The warning names the number and what to do about it, and it does not forbid
 * anything: somebody in the archive with wifi has every reason to download 30 MB,
 * and a button that refuses would be worse than one that tells the truth.
 */
export function weightWarning(bytes: number | null | undefined): string | null {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes < HEAVY_FILE_BYTES) {
    return null
  }
  return (
    `Pesa ${fileSizeText(bytes) ?? 'bastante'}: con los datos del móvil puede tardar y gastar ` +
    'bastante. Con wifi va sin problema.'
  )
}

/**
 * The download this document offers, or null when there is nothing to offer
 * because it is not digitised (RF-408).
 *
 * Null and not an offer with an empty path: «no hay fichero» is a state of the
 * document that the section explains in words, and a button that cannot work is
 * the failure this whole family of modules exists to avoid.
 */
export function documentFileOffer(
  document: DocumentFileColumns | null | undefined,
): DocumentFileOffer | null {
  const path = document?.file_path?.trim()
  if (!document || !path) return null
  const size = fileSizeText(document.file_size_bytes)
  const kind = mimeText(document.mime_type)
  const preview = documentPreviewKind(document)
  return {
    path,
    fileName: documentFileName(document),
    preview,
    previewLabel: preview === null ? null : previewLabel(preview, size),
    previewHint: preview === null ? null : previewHint(preview),
    // The weight is ON the button. What it costs has to be readable in the same
    // glance as what it does, or «nada se descarga sin pedirlo» is only half true.
    label: size === null ? 'Descargar el documento' : `Descargar el documento (${size})`,
    kindText: [kind, size ?? 'tamaño sin registrar'].filter((part) => part).join(' · '),
    noun: documentNoun(document.title),
    bytes: document.file_size_bytes ?? null,
    weightWarning: weightWarning(document.file_size_bytes),
  }
}

// ── Bringing the file out ────────────────────────────────────

/** Where the download is: the two waits have different lengths and both are silent. */
export type DocumentDownloadStep = 'signing' | 'downloading'

/** What the button says while each step lasts, so it is never just stuck. */
export const DOCUMENT_STEP_TEXT: Record<DocumentDownloadStep, string> = {
  signing: 'Pidiendo permiso…',
  downloading: 'Descargando…',
}

/**
 * Signs the private bucket's file, and translates the refusal (RF-110).
 *
 * Taken out of `runDocumentDownload`'s body when **seeing** a document became
 * the second thing that needed signing. It is a single door on purpose: two paths that
 * sign the same thing end up saying two different sentences for the same refusal, and a
 * permission refusal is precisely the one that cannot afford the luxury of being ambiguous.
 *
 * It throws `DownloadFailure` with the sentence already in Spanish. That `signedUrl` answers null without
 * the store's message is a known and accepted loss; see `runDocumentDownload`'s
 * comment.
 */
export async function signDocumentFile(
  offer: Pick<DocumentFileOffer, 'path' | 'noun'>,
  sign: ((path: string) => Promise<string | null>) | undefined = undefined,
): Promise<string> {
  const signer = sign ?? ((path: string) => signedUrl(path))
  let url: string | null
  try {
    url = await signer(offer.path)
  } catch (cause) {
    throw new DownloadFailure('sign', downloadFailureText(offer.noun, 'sign', messageOf(cause)))
  }
  if (url === null || url === '') {
    throw new DownloadFailure('sign', downloadFailureText(offer.noun, 'sign'))
  }
  return url
}

/** The two impure edges, injectable so the flow itself is verified without a browser. */
export interface DocumentDownloadDeps {
  /** Signs a path of the private bucket. Answers null when it could not. */
  sign?: (path: string) => Promise<string | null>
  save?: (url: string, fileName: string, noun: string) => Promise<void>
  onStep?: (step: DocumentDownloadStep) => void
}

/**
 * Sign, download, save — and turn anything that goes wrong into a sentence in
 * Spanish (RF-411, RF-110).
 *
 * The default signature is `signedUrl` from `images.ts`, which is the single door
 * to the private `obras` bucket (RF-412) and where the scanned documents live too.
 * It answers null on failure and swallows the store's own message, so the sentence
 * about a refused signature arrives without its technical crumb — worth saying,
 * and not worth a second path into the bucket to fix.
 *
 * Returns the sentence to show when it worked. Saying nothing on success is a real
 * failure of this button: on a phone the file lands wherever the browser decides
 * and the page does not move, so with no message the tap looks like it did nothing.
 */
export async function runDocumentDownload(
  offer: DocumentFileOffer,
  deps: DocumentDownloadDeps = {},
): Promise<string> {
  const save =
    deps.save ??
    ((url: string, fileName: string, noun: string) => downloadSignedFile(url, fileName, noun))

  deps.onStep?.('signing')
  const url = await signDocumentFile(offer, deps.sign)

  deps.onStep?.('downloading')
  await save(url, offer.fileName, offer.noun)
  return `Descargado «${offer.fileName}». Está donde el navegador guarde las descargas.`
}
