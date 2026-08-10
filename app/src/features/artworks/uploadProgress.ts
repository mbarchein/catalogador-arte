/**
 * What the cataloger reads while a photograph is going up (RNF-106).
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────
 *
 * Adding a photograph said `Subiendo 1 de 1…` and nothing else, for as long as it took.
 * With a correction that is two large files — the archive original and the
 * full-resolution corrected copy, each of the order of 2 to 19 MB — sent one after the
 * other from a storeroom with poor coverage. A screen that says the same thing for two
 * minutes and then fails cannot be told apart from one that is stuck: there is no way to
 * decide whether to wait, and no way to say afterwards what happened.
 *
 * With the bytes on screen the wait is legible. It advances or it does not, and a failure
 * happens at a point that can be named.
 *
 * ── PER FILE, NOT PER PHOTOGRAPH ────────────────────────────
 *
 * Each transfer counts itself and the line says which file it is. A single bar for the
 * whole photograph would have to include the thumbnail and the consultation copy, which
 * go through the storage library and report nothing: their bytes would be missing from
 * the count, so the total would be a number that never arrives. Two honest counts beat
 * one that is short by a few hundred kilobytes.
 *
 * The two files are named with `ARCHIVE_NOUN`, which is where that decision already
 * lived: the download side says «el original» for the same file, and one file with two
 * names on two screens is how a vocabulary comes apart.
 *
 * ── «1 DE 1» ERAN FOTOGRAFÍAS, Y SE LEÍA COMO FICHEROS ──────
 *
 * A photograph is four files: the thumbnail and the consultation copy that the record
 * shows, the untouched original, and the full-resolution corrected copy. The line said
 * «Subiendo 1 de 1» and it was counting photographs — which reads as «one file, and it is
 * this one», so a cataloger who had just cropped with perspective quite reasonably asked
 * where the thumbnail was.
 *
 * Now the count only appears when there is more than one photograph, and it says so; and
 * every step is named, including the two that go through the storage library and cannot
 * report bytes. Silence over them was what made them look missing.
 */

import { formatFileSize } from '../../lib/exif'
import { ARCHIVE_NOUN, type ArchiveKind } from '../../lib/images'

/**
 * Which of a photograph's four files is going.
 *
 * `derivatives` is the thumbnail and the consultation copy together: they travel through
 * the storage library, which reports no bytes, and they are small enough that a count
 * would be over before it was read. They are named anyway — an unnamed step is a step
 * that looks like it did not happen.
 */
export type UploadStep = ArchiveKind | 'derivatives'

export const UPLOAD_STEP_TEXT: Record<UploadStep, string> = {
  derivatives: 'las copias que se ven en la ficha',
  master: ARCHIVE_NOUN.master,
  corrected: ARCHIVE_NOUN.corrected,
}

export interface UploadStatus {
  /** Position within the batch, counting from 1. */
  index: number
  count: number
  /** Absent before the first step starts. */
  step?: UploadStep
  loaded?: number
  /** Null when the browser cannot say how much it is sending. */
  total?: number | null
  /** 1 the first time. Above that, the connection was cut and it is going again. */
  attempt?: number
}

/**
 * Whole percent, floored, or null when there is nothing to divide by.
 *
 * Floored and not rounded: `Math.round` shows «100 %» with kilobytes still in flight, and
 * a hundred per cent that keeps going is exactly the kind of number that stops being
 * read. Clamped at both ends because `loaded` can exceed `total` — some browsers count
 * the request headers into it — and a count past its own end reads as a fault.
 */
export function uploadPercent(loaded: number, total: number | null | undefined): number | null {
  if (total === null || total === undefined) return null
  if (!Number.isFinite(loaded) || !Number.isFinite(total) || total <= 0) return null
  return Math.min(100, Math.max(0, Math.floor((loaded / total) * 100)))
}

/** `4,2 MB`, and `0 kB` at the start — where `formatFileSize` answers null. */
function sent(bytes: number): string {
  return formatFileSize(bytes) ?? '0 kB'
}

/**
 * `Foto 2 de 3 · ` when there is a batch, and nothing at all when there is one photograph.
 *
 * The word «foto» is the whole fix: «1 de 1» does not say what it is counting, and the
 * obvious reading — one file — is wrong four times over.
 */
function position(status: UploadStatus): string {
  return status.count > 1 ? `Foto ${status.index} de ${status.count} · ` : ''
}

/** The whole line, ready to paint. */
export function uploadStatusText(status: UploadStatus): string {
  if (!status.step) return `${position(status)}Subiendo…`

  const name = UPLOAD_STEP_TEXT[status.step]
  // The derivatives report nothing: the library that sends them does not say, and a
  // percentage invented for them would be the only fictional number on the screen.
  if (status.step === 'derivatives') return `${position(status)}Subiendo ${name}…`

  const loaded = status.loaded ?? 0
  const percent = uploadPercent(loaded, status.total)

  // A retry restarts the count from zero — an interrupted PUT resumes nothing, so the
  // bytes really do go again — and a counter that silently walks backwards from 80 % to
  // 0 % reads as a fault. Saying it is a retry is what makes the same number honest.
  const again = (status.attempt ?? 1) > 1 ? ` · reintento ${(status.attempt ?? 1) - 1}` : ''

  // No total means the browser did not say how much it was sending. What has gone out is
  // still worth showing: it is the difference between a transfer that advances and one
  // that is stuck, which is the question being asked.
  if (percent === null) return `${position(status)}Subiendo ${name}: ${sent(loaded)} enviados${again}`

  return `${position(status)}Subiendo ${name}: ${sent(loaded)} de ${sent(status.total ?? 0)} (${percent}%)${again}`
}

/**
 * Why it failed, and **where it got to**.
 *
 * «No se han podido subir 1 de 1: La conexión se ha cortado durante el envío» says what
 * broke and nothing about the shape of the break. The same sentence covers a link that
 * died on the first kilobyte and one that dies at the same 2 MB of the same file on every
 * attempt — and those are different problems, one of them a bad connection and the other
 * something deterministic. Reading it off the screen while it happens is not the same as
 * having it written down afterwards.
 */
export function uploadFailureText(params: {
  failed: number
  total: number
  message: string
  /** The last thing the counter said before it stopped, when there was one. */
  at?: { step: UploadStep; loaded: number; total: number | null; attempt: number }
  /**
   * Seconds from pressing the button to the failure.
   *
   * This is the number that tells the two failures apart. Bad coverage dies at a
   * different moment every time; something that dies at the same forty seconds on every
   * attempt is a timeout somewhere in the path, and no amount of retrying fixes it. The
   * bytes alone do not separate them — a browser hands several megabytes to the socket
   * before the network has sent any of them, so the counter can stall at the same place
   * for reasons that have nothing to do with why it ends.
   */
  seconds?: number
}): string {
  const what =
    params.total === 1
      ? 'No se ha podido subir la fotografía'
      : `No se han podido subir ${params.failed} de ${params.total}`
  const took =
    params.seconds === undefined || !Number.isFinite(params.seconds)
      ? ''
      : ` Tardó ${Math.round(params.seconds)} s en fallar.`

  const { at } = params
  if (!at || at.step === 'derivatives') return `${what}: ${params.message}${took}`

  const howFar =
    at.total === null
      ? `${sent(at.loaded)} enviados`
      : `${sent(at.loaded)} de ${sent(at.total)}`
  return `${what}: ${params.message} Se quedó en ${UPLOAD_STEP_TEXT[at.step]}, ${howFar}, en el intento ${at.attempt}.${took}`
}

/**
 * The message for the step BEFORE any of this: building the corrected copy.
 *
 * On a 9248 px original this is around twelve seconds with nothing going over the
 * network, so it is said out loud. It lives next to the other one because both are
 * readings of the same screen and they have to agree.
 */
export function preparingCopyText(index: number, count: number): string {
  return `Preparando la copia a tamaño completo de la ${index} de ${count}…`
}

/**
 * What the button in the footer bar says while photographs are waiting to go up.
 *
 * It lives in a bar stuck to the bottom of the screen, like the record's edit form, and
 * that is the point: the button used to sit inside the card at the top, so adding four
 * photographs — each one a thumbnail in a strip, each one with its shot type to choose —
 * scrolled it off the screen. Photographs staged and never sent is the one failure this
 * screen can produce silently, and «no lo he subido» does not look any different from
 * «no lo he hecho».
 *
 * It counts, because the count is the thing being forgotten.
 */
export function pendingUploadText(count: number): string {
  return count === 1 ? 'Subir la foto' : `Subir ${count} fotos`
}

/**
 * The reminder next to it, or null when there is nothing pending.
 *
 * Said as a fact and not as a warning: nothing is wrong yet, and a red alarm over four
 * photographs waiting fifteen seconds is the kind of thing that gets dismissed by reflex
 * and then ignored on the day it matters.
 */
export function pendingUploadNotice(count: number): string | null {
  if (count <= 0) return null
  return count === 1
    ? 'Hay una fotografía sin subir.'
    : `Hay ${count} fotografías sin subir.`
}
