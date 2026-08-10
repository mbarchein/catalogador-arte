// Reading the store's object listing, to know how much it takes up.
//
// Without Deno and without network, like `multipart.ts` and for the same reason: here there is no
// way of running tests, and the frontend's suite does import this module. What
// can really go wrong —counting badly, or taking as finished a listing
// that continues— is covered there.
//
// ── WHY THE VERSIONS ARE COUNTED ────────────────────────────
//
// The bucket keeps every version on purpose (infra/b2.tf): a master is
// the document, and an overwrite has to be recoverable. That means the
// store charges for what is stored, not for what is visible: a listing of
// ordinary objects would say less than what is being paid, and a figure that says
// less on the screen that serves to avoid running out of room is worse than not
// having it. That is why `?versions` is asked for, which is what also returns the
// previous ones.

/** One stretch of the listing, already summed, and where it continues. */
export interface UsagePage {
  bytes: number
  objects: number
  /** The two markers the next stretch is asked for with, or null if there is none. */
  next: { keyMarker: string; versionIdMarker: string } | null
}

/**
 * How many stretches are asked for at most.
 *
 * Each one is a thousand objects, so this is two hundred thousand files: well
 * above what this catalogue is going to have, and even so a cap, because a loop
 * that paginates against a remote service with no limit is a loop that one day does not
 * finish. When it is reached, the answer SAYS so instead of taking the partial sum
 * as the total: see `truncated` in the Edge function.
 */
export const MAX_USAGE_PAGES = 200

function tag(xml: string, name: string): string | null {
  const found = new RegExp(`<${name}>([^<]*)</${name}>`).exec(xml)
  return found === null ? null : found[1]!
}

/**
 * Sums one stretch of the listing and says where to continue.
 *
 * Delete markers carry no `<Size>` and that is why they do not add: they take up nothing.
 */
export function usagePage(xml: string): UsagePage {
  let bytes = 0
  let objects = 0
  for (const found of xml.matchAll(/<Size>(\d+)<\/Size>/g)) {
    bytes += Number(found[1])
    objects += 1
  }

  const truncated = tag(xml, 'IsTruncated') === 'true'
  const keyMarker = tag(xml, 'NextKeyMarker')
  const versionIdMarker = tag(xml, 'NextVersionIdMarker')

  // Truncated but with no marker is a listing that does not say where it continues: it is
  // treated as finished instead of repeating the same stretch forever.
  const next =
    truncated && keyMarker !== null && versionIdMarker !== null
      ? { keyMarker, versionIdMarker }
      : null

  return { bytes, objects, next }
}
