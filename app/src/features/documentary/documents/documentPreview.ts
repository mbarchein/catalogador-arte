/**
 * Seeing an archive document without downloading it, when the format allows it
 * (RF-408, RF-411, RNF-106).
 *
 * ── THE PROBLEM ─────────────────────────────────────────────
 *
 * Until now a digitised document had only one way out: downloading it. And that, with
 * an artwork in front and in a storeroom, is three steps to read a letter —tap, wait,
 * hunt for the file in the phone's downloads— and a stray file on the phone that
 * nobody is going to delete. For an archive photograph or a clipping scanned as JPEG, which
 * the browser paints with nobody's help, it is an absurd path.
 *
 * ── THE BOUNDARY, AND WHY IT IS NOT «WHATEVER THE BROWSER KNOWS» ──
 *
 * Only what **every** browser of the declared range paints in an `<img>` is shown inside
 * the application: JPEG, PNG, WebP, GIF and AVIF. Left out are two that
 * look like images and are not for these purposes:
 *
 *   · **TIFF**, which is the format of a real archive scan and which **no**
 *     browser paints. Offering «Ver» over a TIFF would give a black gap with the
 *     broken-image icon, which is worse than offering nothing.
 *   · **HEIC**, which Safari paints and Chrome does not. A button that works on one phone and not
 *     on the one next to it is a button that stops being used on both.
 *
 * And the **PDF** —which is what there is most of in the archive, because a file of several
 * pages is uploaded as a single PDF (RF-408)— opens **apart**, in the browser's own
 * viewer, and not inside the application. An `<iframe>` with a PDF in an iPhone's
 * Safari shows the first page, scaled and with no way past it: for a
 * twelve-page file that is not seeing it, it is pretending to see it. The system's viewer
 * turns pages, searches text and zooms, and those three things are not going to be reimplemented
 * here.
 *
 * ── THE WEIGHT STILL COUNTS ─────────────────────────────────
 *
 * Seeing it costs the same bytes as downloading it, so the weight warning applies equally to the
 * view button. `weightWarning` decides it, which was already there.
 *
 * Everything is decided with no browser: the suite runs in node.
 */

import { storedExtension } from '../../artworks/archiveDownloads'

/**
 * How this file can be seen without downloading it.
 *
 * - `image`: the application paints it itself, full screen and without leaving the
 *   application — which in the installed PWA is the difference between looking at a document and
 *   losing sight of the record.
 * - `newTab`: the browser's viewer opens it, which for a PDF does three things this
 *   is not going to do.
 */
export type DocumentPreviewKind = 'image' | 'newTab'

/** The types painted in an `<img>` across the whole declared range of browsers. */
const INLINE_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
])

/**
 * The equivalent extensions, for when the declared type is of no use.
 *
 * It is genuinely needed and it is not belt and braces: `mime_type` is what the browser
 * said on uploading the file, and there are paths —some Android file managers, a
 * file arrived over Bluetooth, a forwarded attachment— that declare
 * `application/octet-stream` over a perfectly normal JPEG. With the extension there is an
 * answer; without it, the document would be left with the download button over a datum
 * that is not its own.
 */
const INLINE_IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif'])

/** The declared type, without its parameters and in lower case. Empty string if it says nothing. */
function bareType(mime: string | null | undefined): string {
  if (typeof mime !== 'string') return ''
  return mime.split(';')[0]?.trim().toLowerCase() ?? ''
}

/**
 * How this document can be seen, or null when the only way out is downloading it.
 *
 * The declared type rules, and the extension only comes in when the type does not answer: a
 * file claiming to be `image/tiff` and named `.jpg` is more likely a renamed TIFF
 * than a badly declared JPEG, and painting it would give the broken image.
 */
export function documentPreviewKind(file: {
  file_path: string | null
  mime_type: string | null
}): DocumentPreviewKind | null {
  const path = (file.file_path ?? '').trim()
  if (path === '') return null

  const type = bareType(file.mime_type)
  if (type !== '') {
    if (INLINE_IMAGE_TYPES.has(type)) return 'image'
    if (type === 'application/pdf') return 'newTab'
    // A declared type that is in neither of the two lists is an answer, not
    // a silence: `image/tiff` and `image/heic` arrive here and are left with no «Ver» on
    // purpose.
    return null
  }

  const extension = storedExtension(path)
  if (extension === null) return null
  if (INLINE_IMAGE_EXTENSIONS.has(extension)) return 'image'
  if (extension === 'pdf') return 'newTab'
  return null
}

/**
 * What the view button says, with the weight inside.
 *
 * The weight goes **in the button** for the same reason as in the download one: seeing it brings the
 * whole file, so it costs the same data, and what it costs has to be read in
 * the same glance as what it does (RNF-106).
 */
export function previewLabel(kind: DocumentPreviewKind, sizeText: string | null): string {
  const verb = kind === 'image' ? 'Ver el documento' : 'Abrir el PDF'
  return sizeText === null ? verb : `${verb} (${sizeText})`
}

/**
 * What is read below the view button, or null when there is nothing to warn about.
 *
 * The PDF opens outside, and saying so beforehand avoids the bewilderment of the application
 * disappearing from the screen —in the installed PWA, besides, it goes to another window—. For
 * an image there is nothing to warn about: it opens on top and closes with the back button.
 */
export function previewHint(kind: DocumentPreviewKind): string | null {
  if (kind === 'image') return null
  return 'Se abre en el visor del navegador, fuera de la aplicación.'
}

/**
 * What is said when the browser's viewer has not opened.
 *
 * It really happens: a pop-up blocker can stop it, and the browser gives
 * no warning. Without this sentence the tap looks like it did nothing, and the path that
 * always works —downloading it— is right alongside and not visible.
 */
export const PREVIEW_BLOCKED_TEXT =
  'El navegador no ha dejado abrir el visor: puede tener bloqueadas las ventanas nuevas. ' +
  'Descárgalo con el botón de al lado y se abrirá con el visor del teléfono.'

/**
 * What is said when the image could not be painted, with the permission already granted.
 *
 * It is the genuinely rare case: the file is there, the signature went in and the browser could not
 * cope with the content —a corrupt file, or a declared type that lies—. It sends people to
 * download it, which is the way out that does not depend on the browser knowing how to paint it.
 */
export const PREVIEW_IMAGE_FAILED_TEXT =
  'Esta imagen no se ha podido mostrar aquí. Descárgala y ábrela con el visor del teléfono: ' +
  'puede que el fichero esté dañado o que no sea del formato que dice ser.'
