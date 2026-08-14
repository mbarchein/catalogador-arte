import { ARTIST_FUNDS, type ArtistFund } from '../../lib/types'

/**
 * Which identifier comes next, without the batch screen having to wait for the answer
 * (DP-01, RNF-106).
 *
 * ── WHAT WAS SEEN ───────────────────────────────────────────
 *
 * The batch header says «· siguiente AR-0043», and it is read: it is what tells whoever
 * is labelling which number to write on the physical tag. It came from a round trip, so
 * it appeared a moment after the screen —the line growing under the thumb— and after
 * saving each artwork it showed **the number just used** until the next answer arrived,
 * which is the worst version of a blink: not a gap, a wrong datum in the place where the
 * right one goes.
 *
 * ── THE TWO HALVES ──────────────────────────────────────────
 *
 * What the device remembers **per fund**, so opening the screen already has a number; and
 * `nextCatalogIdAfter`, which advances it the moment an identifier is assigned instead of
 * leaving the used one on screen.
 *
 * Both are a preview and neither reserves anything, exactly like the query they stand in
 * for: `next_catalog_id` says so in its own comment, and the number that counts is the one
 * the insert returns, assigned with a per-fund lock. The query still runs behind and
 * corrects this — another cataloger creating an artwork at the same time is precisely what
 * it cannot know.
 */

/** `AR-0043`: two letters of the fund's prefix, a dash, and the number padded to four. */
const ID_SHAPE = /^[A-Z]{2}-\d{4,}$/

/**
 * The identifier after this one, or null if it does not have the shape of one.
 *
 * The same rule the database applies —`max(number) + 1`, padded to four figures— said in
 * the client so the header does not go on showing the number that has just been used.
 * Beyond 9999 the padding stops adding zeros, as `lpad` does.
 */
export function nextCatalogIdAfter(id: string): string | null {
  if (!ID_SHAPE.test(id)) return null
  const prefix = id.slice(0, 3)
  const next = Number(id.slice(3)) + 1
  return `${prefix}${String(next).padStart(4, '0')}`
}

const KEY = 'catalogador.next-catalog-id'
const VERSION = 1

function getStorage(): Storage | undefined {
  try {
    return window.localStorage
  } catch {
    return undefined
  }
}

/**
 * The remembered preview of each fund, by code.
 *
 * By fund and not one alone: the batch is closed and reopened with another fund, and one
 * shared number would show ROTILI's next identifier over a batch of the test fund — a
 * wrong number in the one place where it gets copied onto a physical label.
 *
 * Anything not recognized is left out instead of invalidating the rest: what is lost is
 * that fund's instant paint, and the query fills it in.
 */
export function readNextIds(storage: Storage | undefined = getStorage()): Record<string, string> {
  try {
    const raw = storage?.getItem(KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as { v?: unknown; ids?: unknown }
    if (parsed.v !== VERSION || parsed.ids === null || typeof parsed.ids !== 'object') return {}
    const out: Record<string, string> = {}
    for (const [fund, id] of Object.entries(parsed.ids as Record<string, unknown>)) {
      if (!(ARTIST_FUNDS as readonly string[]).includes(fund)) continue
      if (typeof id === 'string' && ID_SHAPE.test(id)) out[fund] = id
    }
    return out
  } catch {
    return {}
  }
}

export function saveNextIds(
  ids: Record<string, string>,
  storage: Storage | undefined = getStorage(),
): void {
  try {
    storage?.setItem(KEY, JSON.stringify({ v: VERSION, ids }))
  } catch {
    // Without storage —quota, private browsing— the number goes back to appearing a
    // moment late.
  }
}

/** Forgets them. On sign out, with the mirrors of the catalogue. */
export function clearNextIds(storage: Storage | undefined = getStorage()): void {
  try {
    storage?.removeItem(KEY)
  } catch {
    /* nothing to clear */
  }
}

/** The remembered preview of one fund, or null. */
export function rememberedNextId(
  ids: Record<string, string>,
  fund: ArtistFund,
): string | null {
  return ids[fund] ?? null
}
