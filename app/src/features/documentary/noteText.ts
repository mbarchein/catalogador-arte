/**
 * Free-text notes, with the addresses they carry inside (RF-1408).
 *
 * ── THE PROBLEM IT SOLVES ───────────────────────────────────
 *
 * Web addresses get pasted into a note, and an address has no spaces: it is
 * a single word of eighty characters. In the narrow column of a field
 * list it does not fit, and the browser pushes it off the screen instead of breaking it.
 * It is fixed from both sides: **the note's content goes at full width**
 * —the component does that— and **the address is shown shortened**, which is what belongs
 * here.
 *
 * ── WHAT IS SHORTENED AND WHAT IS NOT ───────────────────────
 *
 * The domain **whole, always**, and it is trimmed at the end. The reason is not one of
 * style: showing a piece of an address that reads as a different site from the one it
 * really is would be impersonation, which is the same thing `linkDomain` exists to
 * avoid in the links block —`https://macvac.es@evil.example/` reads as
 * MACVA's and goes elsewhere—. That is why that same function is used, and why an
 * address it does not recognise **is shown whole**: long and ugly, but true.
 */

import { linkDomain } from './links/externalLinks'

/** How many characters of an address are shown before cutting. */
export const NOTE_LINK_MAX = 34

/** A piece of a note: plain text, or an address with its destination. */
export interface NoteSegment {
  text: string
  /** The full address it goes to, or null if it is plain text. */
  href: string | null
}

/**
 * Marks that usually close a sentence and are not part of the address.
 *
 * «Véase https://ejemplo.es/obra.» ends in a full stop, and the stop belongs to the sentence. They
 * are removed from the end, one by one, so the link goes where it was written.
 */
const TRAILING = /[.,;:!?)\]}»"']+$/

const URL_IN_TEXT = /https?:\/\/[^\s<>"']+/gi

/**
 * How an address reads inside a note.
 *
 * Without `https://` or `www.`, which say nothing and take up room; the whole domain and
 * then as much path as fits. An address whose domain is not recognised
 * comes back as is: cutting it could show as the destination something that is not.
 */
export function shortLinkText(url: string, max: number = NOTE_LINK_MAX): string {
  const domain = linkDomain(url)
  if (domain === '') return url

  const authority = /^https?:\/\/[^/?#]*/i.exec(url)?.[0] ?? ''
  const rest = url.slice(authority.length)
  const whole = domain + rest
  if (whole.length <= max) return whole

  // The domain is never trimmed: it is the part that answers «whose is this?».
  const room = Math.max(0, max - domain.length - 1)
  return `${domain}${rest.slice(0, room)}…`
}

/**
 * The note split into text and addresses, in order and without losing anything.
 *
 * What is returned, concatenating the `text`s, is **not** the original note: the
 * addresses come out shortened, which is the point. The original travels in `href`.
 */
export function noteSegments(note: string): NoteSegment[] {
  const segments: NoteSegment[] = []
  let at = 0

  for (const found of note.matchAll(URL_IN_TEXT)) {
    const raw = found[0]
    const start = found.index
    // The closing mark stuck to the address belongs to the sentence, not to the link.
    const trailing = TRAILING.exec(raw)?.[0] ?? ''
    const url = raw.slice(0, raw.length - trailing.length)
    if (url === '') continue

    if (start > at) segments.push({ text: note.slice(at, start), href: null })
    segments.push({ text: shortLinkText(url), href: url })
    if (trailing !== '') segments.push({ text: trailing, href: null })
    at = start + raw.length
  }

  if (at < note.length) segments.push({ text: note.slice(at), href: null })
  return segments
}
