// Multipart uploads: what "sign-file" needs to decide and to build, with no Deno
// API in it, for the same reason as `paths.ts` — there is no Deno in this
// environment, so anything left inside the function is covered by nothing. The
// frontend suite imports this module and exercises it.
//
// ── WHY MULTIPART AT ALL ────────────────────────────────────
//
// A single PUT of a 12 MB original over the connection of a storeroom either
// arrives or is lost whole. Retrying resends all 12 MB, so a link that drops
// every few megabytes never finishes, no matter how many attempts are allowed.
// A multipart upload keeps each finished part on the store's side: a cut costs
// the part in flight and nothing else, and the retry picks up from there.
//
// ── WHY THE BROWSER ONLY UPLOADS PARTS ──────────────────────
//
// Of the three S3 calls a multipart upload needs, only `UploadPart` is a PUT.
// Creating and completing are POSTs, and the bucket's CORS rules allow
// `s3_put`, `s3_get` and `s3_head` — not `s3_post` (see infra/b2.tf). So the
// function makes those two calls itself, server to server, where CORS does not
// apply, and hands the browser nothing but part URLs. That keeps the change
// inside this repository: no `terraform apply` by hand, which is a manual step
// by policy and would have to happen before any of this could work.
//
// What the browser DOES need from the store is each part's `ETag` response
// header, and the bucket already exposes it (`expose_headers = ["etag"]`).

/**
 * Smallest part S3 accepts, except for the last one: 5 MiB.
 *
 * Backblaze documents 5 MB and AWS documents 5 MiB; this is the larger of the
 * two, so it satisfies both. It is also the floor on how much a cut connection
 * can cost, which is the whole point — parts cannot be made small enough to
 * make that cost negligible, and pretending otherwise by using a smaller size
 * would produce uploads the store refuses at the very end, on completion,
 * after every byte has already been sent.
 */
export const MULTIPART_MIN_PART_BYTES = 5_242_880

/** S3 allows ten thousand parts. At 5 MiB each that is far past any photograph. */
export const MULTIPART_MAX_PARTS = 10_000

/** A part number S3 will accept: a whole number from 1 to 10 000. */
export function validPartNumber(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= MULTIPART_MAX_PARTS
  )
}

/**
 * An upload id that is safe to put in a URL and in XML.
 *
 * It comes back from the store and goes straight into a query string and into
 * the completion body, so it is checked rather than trusted: this function
 * signs requests with credentials the client never sees, and an id carrying a
 * `&` or a `<` would be a way to shape a request from outside. The real ids are
 * opaque tokens — B2 uses a long base64-ish string — so the allowed set is
 * deliberately narrow and anything else is refused instead of escaped.
 */
export function validUploadId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 512 &&
    /^[A-Za-z0-9._~-]+$/.test(value)
}

export interface CompletedPart {
  partNumber: number
  /** As the store returned it, quotes included or not — both are seen. */
  etag: string
}

/** Every part present exactly once, in ascending order, which is what S3 requires. */
export function partsInOrder(parts: readonly CompletedPart[]): CompletedPart[] | null {
  if (parts.length === 0) return null
  const sorted = [...parts].sort((a, b) => a.partNumber - b.partNumber)
  for (let i = 0; i < sorted.length; i += 1) {
    const part = sorted[i]
    if (!part || !validPartNumber(part.partNumber)) return null
    if (typeof part.etag !== 'string' || part.etag.length === 0) return null
    // Consecutive from 1: a gap means a part was lost and completing anyway
    // would store a truncated file that looks perfectly valid.
    if (part.partNumber !== i + 1) return null
  }
  return sorted
}

/** `&`, `<` and `>` inside an ETag would break the body. They are escaped, not stripped. */
function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** The `CompleteMultipartUpload` body. Built by hand: it is four tags. */
export function completeXml(parts: readonly CompletedPart[]): string {
  const items = parts
    .map(
      (p) =>
        `<Part><PartNumber>${p.partNumber}</PartNumber><ETag>${escapeXml(p.etag)}</ETag></Part>`,
    )
    .join('')
  return `<CompleteMultipartUpload xmlns="http://s3.amazonaws.com/doc/2006-03-01/">${items}</CompleteMultipartUpload>`
}

/**
 * The upload id out of a `CreateMultipartUpload` answer.
 *
 * Read with an expression and not with a parser: the answer has one field this
 * function cares about, and Deno has no DOM. It is validated afterwards by
 * `validUploadId`, so a malformed answer produces a refusal and not a request
 * built out of whatever came back.
 */
export function uploadIdFrom(xml: string): string | null {
  return /<UploadId>([^<]+)<\/UploadId>/.exec(xml)?.[1]?.trim() ?? null
}

/**
 * **`CompleteMultipartUpload` can answer 200 and still have failed.**
 *
 * S3 keeps the connection open while it assembles the object and only then
 * writes the body, so the status line is already sent when the outcome is
 * known: a failure arrives as an `<Error>` document under a 200. Trusting the
 * status here is how a truncated or missing master gets recorded as stored,
 * which for the archive document is the worst outcome this whole path has.
 */
export function completedOk(status: number, xml: string): boolean {
  if (status < 200 || status >= 300) return false
  if (/<Error[\s>]/.test(xml)) return false
  return /<CompleteMultipartUploadResult[\s>]/.test(xml)
}

/**
 * Does the finished object weigh what was sent?
 *
 * **The last line of defence for the archive document.** Everything above refuses the
 * failures it can see — a gap in the list, an `<Error>` under a 200 — but multipart has
 * one more: a part that the store accepted and then lost, or a completion that assembled
 * fewer parts than were handed to it. Both produce a perfectly valid object, shorter than
 * the original, with a path that goes straight onto the row. Nobody would notice until
 * someone opened the file, which for a master could be years.
 *
 * So the size is checked against what the browser said it was sending. A mismatch is
 * reported as a failed upload: the row is never written, the photograph stays staged, and
 * the truncated object is left orphaned in the bucket — which breaks nothing, and is the
 * same trade the rest of this path already makes.
 */
export function sizeMatches(declared: unknown, contentLength: string | null): boolean {
  if (typeof declared !== 'number' || !Number.isInteger(declared) || declared < 0) return false
  if (contentLength === null) return false
  const stored = Number(contentLength)
  return Number.isInteger(stored) && stored === declared
}
