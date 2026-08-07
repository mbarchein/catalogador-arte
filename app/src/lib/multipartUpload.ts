/**
 * Sending a large file in parts, so a cut connection does not cost the whole file.
 *
 * ── THE FAILURE THIS IS FOR ─────────────────────────────────
 *
 * «La conexión se ha cortado durante el envío», halfway through an original of several
 * megabytes, in a storeroom. Retrying helps only if the link stays up long enough for one
 * whole file to get through: a single PUT resends everything, so a connection that drops
 * every few megabytes never finishes a 19 MB copy no matter how many attempts it is given.
 *
 * A multipart upload leaves each finished part on the store's side. A cut costs the part
 * in flight and nothing else, and the retry starts from there. That turns «never» into
 * «eventually», which is the whole difference.
 *
 * ── WHY THE PARTS ARE SO BIG ────────────────────────────────
 *
 * 5 MiB, because that is the smallest part S3 accepts for anything but the last one, and
 * it is a floor this code cannot get under. So an 8 MB original is two parts and a 19 MB
 * corrected copy is four: the granularity is coarse, and saying so is better than
 * implying that a cut now costs nothing. It is still the difference between losing 5 MiB
 * and losing all of it.
 *
 * Below one part there is nothing to divide, and the plain PUT — one round trip instead
 * of three — stays the better answer.
 */

import { MULTIPART_MIN_PART_BYTES } from '../../../supabase/functions/sign-file/multipart'

export { MULTIPART_MIN_PART_BYTES }

/** One part: its number and the slice of the file it carries. */
export interface PartPlan {
  partNumber: number
  start: number
  /** Exclusive, as `Blob.slice` takes it. */
  end: number
}

/**
 * Whether splitting this file buys anything.
 *
 * Strictly more than one part's worth. At exactly the minimum there is one part, which is
 * a plain PUT with two extra round trips and a way to fail that a plain PUT does not have.
 */
export function useMultipart(size: number, partSize = MULTIPART_MIN_PART_BYTES): boolean {
  return Number.isFinite(size) && size > partSize
}

/**
 * The parts, in order and covering the file exactly once.
 *
 * `Blob.slice` does not copy: each part is a view over the same bytes, so a 19 MB file
 * split into four does not become 38 MB of phone memory. That matters here more than
 * anywhere — this runs on a phone that is already holding a decoded master.
 */
export function planParts(size: number, partSize = MULTIPART_MIN_PART_BYTES): PartPlan[] {
  if (!Number.isFinite(size) || size <= 0 || partSize <= 0) return []
  const parts: PartPlan[] = []
  for (let start = 0; start < size; start += partSize) {
    parts.push({
      partNumber: parts.length + 1,
      start,
      end: Math.min(start + partSize, size),
    })
  }
  return parts
}

/**
 * Bytes already accepted by the store, before the part now in flight.
 *
 * This is what makes the progress line keep meaning something across a retry: a part that
 * is resent drops the count by that part only, and not to zero, because everything before
 * it is already on the other side. Without this the bar would restart from nothing at
 * every hiccup and the number would stop being worth reading.
 */
export function bytesBefore(parts: readonly PartPlan[], partNumber: number): number {
  return parts
    .filter((p) => p.partNumber < partNumber)
    .reduce((total, p) => total + (p.end - p.start), 0)
}
