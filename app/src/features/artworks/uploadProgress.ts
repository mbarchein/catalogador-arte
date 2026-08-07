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
 */

import { formatFileSize } from '../../lib/exif'
import { ARCHIVE_NOUN, type ArchiveKind } from '../../lib/images'

export interface UploadStatus {
  /** Position within the batch, counting from 1. */
  index: number
  count: number
  /** Absent before the first large transfer starts. */
  step?: ArchiveKind
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
 * The whole line, ready to paint.
 *
 * The batch position stays even for a single photograph, which is what it already said
 * before this: it answers «how much is left of what I asked for», and the bytes answer
 * «is this moving».
 */
export function uploadStatusText(status: UploadStatus): string {
  const position = `Subiendo ${status.index} de ${status.count}`
  if (!status.step) return `${position}…`

  const name = ARCHIVE_NOUN[status.step]
  const loaded = status.loaded ?? 0
  const percent = uploadPercent(loaded, status.total)

  // A retry restarts the count from zero — an interrupted PUT resumes nothing, so the
  // bytes really do go again — and a counter that silently walks backwards from 80 % to
  // 0 % reads as a fault. Saying it is a retry is what makes the same number honest.
  const again = (status.attempt ?? 1) > 1 ? ` · reintento ${(status.attempt ?? 1) - 1}` : ''

  // No total means the browser did not say how much it was sending. What has gone out is
  // still worth showing: it is the difference between a transfer that advances and one
  // that is stuck, which is the question being asked.
  if (percent === null) return `${position} · ${name}: ${sent(loaded)} enviados${again}`

  return `${position} · ${name}: ${sent(loaded)} de ${sent(status.total ?? 0)} (${percent} %)${again}`
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
