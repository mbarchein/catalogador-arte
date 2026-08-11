import {
  DownloadFailure,
  downloadFailureText,
  downloadSignedFile,
  messageOf,
} from '../../lib/download'
import { type ColorColumns } from '../../lib/imageColor'
import { editedSize, isNoEdit, type EditColumns, type Size } from '../../lib/imageEdits'
import { CORRECTED_EXTENSION, correctedDownloadUrl, masterDownloadUrl } from '../../lib/images'
import { SHOT_TYPE_LABEL, type ShotTypeValue } from '../../lib/types'
import { correctedSize, originalSize, photoEdit, pixelText } from './photoDetails'

/**
 * What a photograph can be handed out as, and what is said when it cannot (RF-411,
 * RF-420).
 *
 * There are two files worth taking out of the application and they answer different
 * questions, which is the whole reason both exist:
 *
 *   · the ORIGINAL is the photograph as it left the camera. It is the archive document
 *     and it is untouchable — that is what makes it a document — so it carries the
 *     yellow cast of the warehouse bulb, the perspective of having shot from one side
 *     and whatever came into the frame;
 *   · the CORRECTED COPY is the same photograph at the same resolution with the turn,
 *     the trim, the perspective and the colour already applied. It is what gets sent
 *     to a print shop or a curator, and until this module existed there was no screen
 *     that could ask for it: the file was generated, uploaded and registered, and
 *     nobody could download it.
 *
 * Everything decided here is decided WITHOUT a browser: which downloads are on offer,
 * what each button says, what the file is going to be called and what sentence
 * explains the copy that is not there. The screen only paints it. That is not tidiness
 * — the battery runs in node, so anything left inside the JSX is verified by nobody.
 */

// The two archive files and what they are called on screen live in `lib/images.ts`,
// next to the paths they name: the upload says those words too now, and lib cannot
// import from features. Re-exported so the download side still reads them from here.
import { ARCHIVE_NOUN, type ArchiveKind } from '../../lib/images'
export { ARCHIVE_NOUN, type ArchiveKind }

/** What each button says, before the size is added. */
const ARCHIVE_ACTION: Record<ArchiveKind, string> = {
  master: 'Descargar el original',
  corrected: 'Descargar la copia corregida',
}

/** The one line that explains the difference, on the button that needs it. */
const ARCHIVE_HINT: Record<ArchiveKind, string> = {
  master:
    'Tal como salió de la cámara: sin girar, sin recortar y con la luz que hubiera en la sala.',
  corrected:
    'Con el giro, el recorte y el color ya aplicados. Es la que se manda a una imprenta o a un ' +
    'comisario.',
}

/** The word that says what the file is, inside its name. */
const ARCHIVE_FILE_WORD: Record<ArchiveKind, string> = {
  master: 'original',
  corrected: 'corregida',
}

/**
 * The columns about the full-resolution copy, as little as this module needs.
 *
 * A structural subset of `PhotoDetailRow` on purpose: what is asked for is the three
 * columns, not the twenty-four of the detail row, so a caller with only these can use
 * it and the tests do not have to build a colour adjustment to ask about a download.
 *
 * The colour columns come along as optional because of ONE decision: telling «esta
 * fotografía no tiene correcciones» from «se corrigió antes de que existieran las
 * copias» needs to know whether the colour was touched, and reading a photograph whose
 * colour was corrected as «sin correcciones» is the one answer that is plainly wrong.
 * A caller that does not pass them gets the geometry's answer, which is the honest
 * degradation and never a claim about colour it never saw.
 */
export interface CorrectedCopyColumns extends Partial<ColorColumns> {
  corrected_path: string | null
  corrected_bytes: number | null
  corrected_pending: boolean
  /** The size of the original, when it is known: it goes on the button, not in a note. */
  master_bytes?: number | null
  /**
   * The original's size in pixels, which is what both buttons measure themselves
   * against: the original's own is this one, and the corrected copy's is what the
   * geometry makes of it.
   *
   * Optional for the same reason as `master_bytes`: a caller with only the three copy
   * columns is a legitimate caller, and what it gets is a button with no pixel size
   * rather than a guessed one.
   */
  original_width?: number | null
  original_height?: number | null
  /** The copy's measured size, which is the one the button prefers to any arithmetic. */
  corrected_width?: number | null
  corrected_height?: number | null
}

/** One download on offer, with everything the button needs already decided. */
export interface ArchiveOffer {
  kind: ArchiveKind
  /** The path inside the store, which is what gets signed. */
  path: string
  /** The name the file lands with, chosen here and not by the store. */
  fileName: string
  /** The text of the button, size included when it is known. */
  label: string
  /** The line under the button: what this file is, in words, without jargon. */
  hint: string
  /** How this file is named in a message when something fails. */
  noun: string
}

/** What the record offers for one photograph, and what it has to say beyond that. */
export interface ArchiveDownloads {
  offers: ArchiveOffer[]
  /**
   * The sentences that do not fit on a button: why there is no corrected copy, why
   * there is no original, or that it is still being checked. Never a gap — a missing
   * button cannot tell «no hace falta» from «falta».
   */
  notes: string[]
}

/**
 * A file name that survives leaving the application.
 *
 * Somebody is going to receive this by e-mail with no context whatsoever, so it says
 * the three things that identify it: the catalogue identifier that is stuck on the
 * physical artwork, which shot it is, and which of the two files it is —
 * `AR-0001_general_original.jpg`, `AR-0001_firma_corregida.jpg`.
 *
 * What it deliberately does NOT carry is the eight random characters of the stored
 * path (`AR-0001_ab12cd34_master.jpg`): they exist so that re-editing never overwrites
 * a path, they mean nothing to a print shop, and they are exactly the part that makes
 * the current name unreadable.
 *
 * The shot slug is derived from the label the interface already shows instead of being
 * a second table to keep in step — a shot type without a label cannot exist, and this
 * way a new one cannot arrive nameless.
 */
export function archiveFileName(input: {
  catalogId: string
  shotType: ShotTypeValue
  kind: ArchiveKind
  storedPath: string
  /** Which one it is among the shots of its own type, when there is more than one. */
  ordinal?: number
}): string {
  const shot = fileNameSlug(SHOT_TYPE_LABEL[input.shotType] ?? '') || 'toma'
  const numbered = input.ordinal && input.ordinal > 1 ? `${shot}-${input.ordinal}` : shot
  // The extension is the stored file's own and not a guess: a master keeps whatever the
  // camera produced (jpg, heic, png…) and renaming it to `.jpg` would be a file that
  // lies about its content. The corrected copy is always JPEG, and says so if the path
  // ever arrives without an extension.
  const extension =
    storedExtension(input.storedPath) ?? (input.kind === 'corrected' ? CORRECTED_EXTENSION : null)
  const word = ARCHIVE_FILE_WORD[input.kind]
  return `${input.catalogId}_${numbered}_${word}${extension ? `.${extension}` : ''}`
}

/**
 * A piece of a file name that any machine will accept: no accents, no spaces, no
 * capitals. «Daño» becomes `dano`, and a receiver on Windows, on a mail server or in a
 * print shop's job queue gets something none of them will mangle.
 */
export function fileNameSlug(text: string): string {
  return text
    .normalize('NFD')
    // The combining marks that `NFD` split off: «ñ» is now «n» + U+0303, and dropping
    // the second gives the letter a file system will not argue about.
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * The extension of a stored path, or nothing when it does not have a believable one.
 *
 * Nothing rather than a default: a name without an extension is a nuisance, a name
 * with the wrong extension is a file that opens in the wrong program and gets reported
 * as broken. Only the last segment is looked at, because the directory of the path is
 * the catalogue identifier and can carry dashes and dots of its own.
 */
export function storedExtension(path: string): string | null {
  const name = path.slice(path.lastIndexOf('/') + 1)
  const dot = name.lastIndexOf('.')
  if (dot <= 0) return null
  const extension = name.slice(dot + 1).toLowerCase()
  return /^[a-z0-9]{1,5}$/.test(extension) ? extension : null
}

/**
 * Which one this photograph is among the shots of its own type, or nothing when it is
 * the only one.
 *
 * Two general shots of the same artwork would otherwise produce the same file name
 * twice, and two attachments called `AR-0001_general_original.jpg` in the same e-mail
 * is precisely the confusion the name exists to prevent. The number follows the order
 * the cataloger arranged (RF-401), which is the order she is looking at.
 */
export function shotOrdinal(
  rows: readonly { image_id: string; shot_type: ShotTypeValue }[],
  imageId: string,
): number | undefined {
  const row = rows.find((r) => r.image_id === imageId)
  if (!row) return undefined
  const sameType = rows.filter((r) => r.shot_type === row.shot_type)
  if (sameType.length < 2) return undefined
  const at = sameType.findIndex((r) => r.image_id === imageId)
  return at < 0 ? undefined : at + 1
}

/**
 * A size the cataloger can decide with, in es-ES with its decimal comma.
 *
 * It goes on the button and not in a note because of RF-114 and the warehouse: a
 * master is up to 19 MB over mobile data, and «nada se descarga sin pedirlo» only
 * means something if what is being asked for says how much it costs.
 */
export function sizeText(bytes: number | null | undefined): string | null {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes <= 0) return null
  if (bytes < 1_048_576) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / 1_048_576).toFixed(1).replace('.', ',')} MB`
}

/**
 * What the record offers for one photograph and what it says about the rest (RF-411,
 * RF-420).
 *
 * No role is looked at anywhere in here, and that is the requirement and not an
 * oversight: RF-411 gives the download to the Reader too, because handing an original
 * to a print shop or a curator is exactly what a Reader is for. The signing function
 * agrees — it demands an editing role to upload and only a valid session to download.
 *
 * The corrected copy is offered ONLY when it exists, and each of the other three
 * states gets its own sentence:
 *
 *   · pending, because the device that applied the correction could not generate or
 *     upload it — said out loud, because a missing button would read as «no hacía
 *     falta» when in fact something is owed;
 *   · corrected before the copies existed, which is what most of the database is
 *     today: the correction is real, the copy was never made and nothing is repaired
 *     backwards (ADR-010), so what is owed is saying it;
 *   · no corrections at all, and then there is nothing missing: the original IS what
 *     you send, and the sentence says so with no apology in it.
 */
export function archiveDownloads(input: {
  catalogId: string
  row:
    | (Partial<EditColumns> & {
        image_id: string
        master_path: string | null
        shot_type: ShotTypeValue
      })
    | null
    | undefined
  /** The row with the copy's state, `undefined` while it is being read. */
  detail: CorrectedCopyColumns | null | undefined
  /** True when reading that row failed: not knowing is not the same as knowing there is none. */
  detailsFailed?: boolean
  ordinal?: number
}): ArchiveDownloads {
  const { catalogId, row, detail, detailsFailed = false, ordinal } = input
  if (!row) {
    return { offers: [], notes: ['No hay ninguna fotografía seleccionada que descargar.'] }
  }

  const offers: ArchiveOffer[] = []
  const notes: string[] = []

  // The original's size, and what the geometry makes of it. The original's is the one
  // the decoder gave with the orientation already applied, which is what any viewer
  // shows and therefore what the cataloger will measure.
  const original = originalSize(detail)

  // ── The corrected copy goes FIRST when it exists ──────────────
  // It is the one that gets sent, so it is the one under the thumb. The original stays
  // right below it, because the archive document is never hidden.
  if (detail?.corrected_path) {
    offers.push(
      offerOf({
        kind: 'corrected',
        catalogId,
        shotType: row.shot_type,
        path: detail.corrected_path,
        bytes: detail.corrected_bytes,
        // What the file MEASURED when it was written, and the geometry only as a
        // fallback. The measurement is preferred because it is the file itself talking;
        // the arithmetic is what answers for the copies written before those columns
        // existed, and it is exact — `editedSize` is the same function that decided the
        // canvas in `renderCorrectedCopy`. It cannot describe an older file either: a
        // path only ever coexists with the edit that produced it, because
        // `correctedColumns` clears the path on both PENDING and NOT_NEEDED.
        pixels:
          correctedSize(detail) ?? (original ? editedSize(original, photoEdit(row, detail)) : null),
        ordinal,
      }),
    )
  } else if (!detail) {
    // Not knowing yet and knowing there is none are different things, and the second
    // sentence over the first second of a load would be a false alarm on every visit.
    notes.push(
      detailsFailed
        ? 'No se ha podido comprobar si hay una copia con las correcciones aplicadas. Vuelve a ' +
          'cargar la ficha; el original sí se puede descargar.'
        : 'Comprobando si hay una copia con las correcciones aplicadas…',
    )
  } else if (detail.corrected_pending) {
    notes.push(
      'La copia corregida está pendiente: se hace después desde un ordenador. Mientras tanto se puede descargar el original, sin corregir.',
    )
  } else if (!isNoEdit(photoEdit(row, detail))) {
    notes.push(
      'Esta corrección es anterior a las copias a resolución completa: se hará en la próxima. Mientras tanto se puede descargar el original.',
    )
  } else {
    notes.push(
      'Esta fotografía no tiene correcciones, así que no hay copia corregida ni hace falta: para ' +
        'una imprenta, el original ya es lo que hay que mandar.',
    )
  }

  // ── The original ──────────────────────────────────────────────
  if (row.master_path) {
    offers.push(
      offerOf({
        kind: 'master',
        catalogId,
        shotType: row.shot_type,
        path: row.master_path,
        bytes: detail?.master_bytes,
        pixels: original,
        ordinal,
      }),
    )
  } else {
    // Nullable column, and today no row in the database has it empty. Said anyway: the
    // alternative is a footer with a counter and nothing to its right, which is the
    // gap the rule is about.
    notes.push(
      'De esta fotografía no consta el original de archivo, así que no se puede descargar.',
    )
  }

  return { offers, notes }
}

function offerOf(input: {
  kind: ArchiveKind
  catalogId: string
  shotType: ShotTypeValue
  path: string
  bytes: number | null | undefined
  pixels: Size | null
  ordinal?: number
}): ArchiveOffer {
  // Pixels first and weight second: the pixels say whether the file is any use for what
  // it is being asked for, and the weight says what it costs to fetch it (RF-114). Each
  // one appears only when it is known, so a row that knows neither keeps the plain verb
  // instead of an empty pair of brackets.
  const facts = [pixelText(input.pixels), sizeText(input.bytes)].filter(Boolean).join(' · ')
  return {
    kind: input.kind,
    path: input.path,
    fileName: archiveFileName({
      catalogId: input.catalogId,
      shotType: input.shotType,
      kind: input.kind,
      storedPath: input.path,
      ordinal: input.ordinal,
    }),
    label: facts ? `${ARCHIVE_ACTION[input.kind]} (${facts})` : ARCHIVE_ACTION[input.kind],
    hint: ARCHIVE_HINT[input.kind],
    noun: ARCHIVE_NOUN[input.kind],
  }
}

/** Where the download is: the two waits are different lengths and both are silent. */
export type ArchiveDownloadStep = 'signing' | 'downloading'

/** What the screen says while each step lasts, so the button is never just stuck. */
export const ARCHIVE_STEP_TEXT: Record<ArchiveDownloadStep, string> = {
  signing: 'Pidiendo permiso…',
  downloading: 'Descargando…',
}

/** The two impure edges of the flow, injectable so the flow itself can be tested. */
export interface ArchiveDownloadDeps {
  sign?: (kind: ArchiveKind, path: string) => Promise<string>
  save?: (url: string, fileName: string, noun: string) => Promise<void>
  onStep?: (step: ArchiveDownloadStep) => void
}

/**
 * Sign, download, save — and turn anything that goes wrong along the way into a
 * sentence in Spanish (RF-411, RF-420).
 *
 * The signing failure is wrapped here and not left to travel raw because what comes
 * out of the function invocation is «Firmando el original de archivo: Failed to fetch»:
 * true, useless, and half of it in English. What the cataloger gets instead says which
 * file it was about and what to try.
 *
 * Returns the sentence to show when it worked. Saying nothing on success is a real
 * failure mode of this button: on a phone the file lands somewhere the browser decides
 * and the page does not move, so with no message the tap looks like it did nothing.
 */
export async function runArchiveDownload(
  offer: ArchiveOffer,
  deps: ArchiveDownloadDeps = {},
): Promise<string> {
  const sign = deps.sign ?? defaultSign
  const save =
    deps.save ?? ((url: string, fileName: string, noun: string) =>
      downloadSignedFile(url, fileName, noun))

  deps.onStep?.('signing')
  let url: string
  try {
    url = await sign(offer.kind, offer.path)
  } catch (cause) {
    throw new DownloadFailure('sign', downloadFailureText(offer.noun, 'sign', messageOf(cause)))
  }

  deps.onStep?.('downloading')
  await save(url, offer.fileName, offer.noun)
  return `Descargado «${offer.fileName}». Está donde el navegador guarde las descargas.`
}

/** The real signature: the same Edge function for both files, because it is one store. */
function defaultSign(kind: ArchiveKind, path: string): Promise<string> {
  return kind === 'master' ? masterDownloadUrl(path) : correctedDownloadUrl(path)
}
