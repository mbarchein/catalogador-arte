import { ARTIST_FUNDS, type ArtistFund } from '../../lib/types'

/**
 * Which funds set their artworks aside from the listing, remembered on the device
 * (ADR-007 second delivery, RNF-106).
 *
 * ── WHAT WAS SEEN ───────────────────────────────────────────
 *
 * Switching to «Obras» showed **the whole catalogue for a moment and then took the test
 * fund's artworks away**. The listing paints instantly from its mirror, but which funds
 * are set aside came from a query of its own, and until it answered nothing was set
 * aside: so the rows appeared, the list recomposed itself and the count changed under
 * the eye.
 *
 * The listing already knew how to wait for something like this: the place filter passes
 * `null` while the tree is on its way so a filtered list does not flash empty. The funds
 * took the opposite default — an empty set means «hide nothing» — and an empty set is
 * exactly what «I do not know yet» looked like.
 *
 * ── ONLY THE CODES ──────────────────────────────────────────
 *
 * Not the names, not the prefixes and above all **not the biography and the CV**: those
 * are read live by every dossier that carries them (RF-1616), and a text of theirs
 * remembered here would be a second truth about them — one that could reach a PDF as
 * empty or out of date, which is a far worse bug than the blink. This holds a handful of
 * codes and nothing else.
 *
 * It is a decision of the catalogue on a device that may be shared, so it goes with the
 * mirrors on sign out.
 */

const KEY = 'catalogador.hidden-funds'
const VERSION = 1

function getStorage(): Storage | undefined {
  try {
    return window.localStorage
  } catch {
    return undefined
  }
}

/**
 * The remembered codes, or **null when nothing is remembered**.
 *
 * Null and not the empty set, and the difference is the whole point: «no fund is set
 * aside» is an answer, and «I have never asked» is not. Only the codes the enum knows
 * are returned — a code invented in storage could never match an artwork's fund, but
 * dropping it keeps whatever reads this from carrying a value the types promise.
 */
export function readHiddenFunds(
  storage: Storage | undefined = getStorage(),
): Set<ArtistFund> | null {
  try {
    const raw = storage?.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { v?: unknown; hidden?: unknown }
    if (parsed.v !== VERSION || !Array.isArray(parsed.hidden)) return null
    const known = parsed.hidden.filter((code): code is ArtistFund =>
      (ARTIST_FUNDS as readonly string[]).includes(code as string),
    )
    return new Set(known)
  } catch {
    // Anything unrecognized is «nothing is remembered»: the listing behaves as it did
    // before this module existed, which is to say it blinks once.
    return null
  }
}

export function saveHiddenFunds(
  codes: Iterable<ArtistFund>,
  storage: Storage | undefined = getStorage(),
): void {
  try {
    storage?.setItem(KEY, JSON.stringify({ v: VERSION, hidden: [...codes] }))
  } catch {
    // Without storage —quota, private browsing— everything still works.
  }
}

/** Forgets them. On sign out, with the mirrors of the catalogue. */
export function clearHiddenFunds(storage: Storage | undefined = getStorage()): void {
  try {
    storage?.removeItem(KEY)
  } catch {
    /* nothing to clear */
  }
}
