import { signedUrls } from './images'

/**
 * The signatures of storage paths, kept and reused (RF-110, RNF-106).
 *
 * ── THE PROBLEM IT SOLVES ───────────────────────────────────
 *
 * The bucket is private, so every image is painted with a signed URL. The bytes no
 * longer travel twice —the service worker keeps them by path, trimming the signature
 * out of the key (see `runtimeCaching` in vite.config.ts)— but **the signature did**:
 * the photographs screen signed every thumbnail separately and for one hour, without
 * keeping it. Opening a record with four photos was four signing requests, plus the
 * carousel's derivatives, every time.
 *
 * And what was felt was not the traffic, it was this: **with no coverage, a record
 * already visited showed none of its photographs even though the bytes were on the
 * phone**, because with no signature there is no `src` to look up in the cache. It sat
 * on «Cargando…».
 *
 * ── WHAT IT DOES ────────────────────────────────────────────
 *
 * What the artworks list already did with its thumbnails, which is why this module
 * exists: to do it once. It signs **in one batch**, with a **long** validity, and keeps
 * the result; on the next visit there is no request at all.
 *
 * ── THE THREE DECISIONS THAT MATTER ─────────────────────────
 *
 * **The key is the path, not the image identifier.** Reframing a photograph keeps its
 * identifier and writes new files, so a cache keyed by identifier would go on showing
 * the previous crop. The path is the identity of the content: it is the same thing the
 * byte cache relies on.
 *
 * **A signature that still works is reused as it is.** Signing the same file again
 * produces a different URL, and a different URL is a different image to every cache: it
 * would lose exactly what it set out to gain. Hence the margin — a signature that
 * expires inside the very visit it was handed out for is no good.
 *
 * **It is bounded.** This is catalog data in the browser of a device that may be
 * shared, and `localStorage` has a small limit; so entries expire, are pruned on read,
 * and are capped. And it is wiped on sign out, like the list's mirror and for the same
 * reason.
 */

const KEY = 'catalogador.signed-paths'
const VERSION = 1

/** One week, like the list's thumbnails. */
export const SIGNED_TTL_SECONDS = 7 * 24 * 60 * 60

/**
 * How long before expiry a path is signed again.
 *
 * Six hours: a signature that expires mid-visit leaves broken images on screen, and
 * whoever is cataloging may have the application open all morning.
 */
export const SIGN_MARGIN_MS = 6 * 60 * 60 * 1000

/**
 * Cap on the number of stored paths.
 *
 * Each entry is a signed URL of some 300 characters, so 600 are of the order of 200 kB
 * out of the 5 MB `localStorage` usually gives — and that holds the photographs of more
 * than a hundred records. Over the cap, the ones expiring soonest go, which with a
 * fixed validity are the oldest.
 */
export const MAX_SIGNED_PATHS = 600

export interface SignedPath {
  url: string
  /** Absolute expiry, in ms since the epoch. */
  expiresAt: number
}

export type SignedPathMap = Record<string, SignedPath>

function getStorage(): Storage | undefined {
  try {
    return window.localStorage
  } catch {
    return undefined
  }
}

function isSigned(value: unknown): value is SignedPath {
  const s = value as SignedPath | null
  return typeof s?.url === 'string' && typeof s.expiresAt === 'number'
}

/**
 * Reads what is stored and drops what expired: a lapsed URL is of no use, and painting
 * a broken image is worse than painting the gap while the good one arrives.
 */
export function readSignedPaths(
  storage: Storage | undefined = getStorage(),
  now: number = Date.now(),
): SignedPathMap {
  try {
    const raw = storage?.getItem(KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as { v?: unknown; paths?: unknown }
    if (parsed.v !== VERSION || parsed.paths === null || typeof parsed.paths !== 'object') return {}
    const out: SignedPathMap = {}
    for (const [path, value] of Object.entries(parsed.paths as Record<string, unknown>)) {
      if (isSigned(value) && value.expiresAt > now) out[path] = value
    }
    return out
  } catch {
    // Anything not recognized is «there is nothing»: it signs again, which is slow but
    // works. An exception here would leave the record unpainted.
    return {}
  }
}

export function saveSignedPaths(
  map: SignedPathMap,
  storage: Storage | undefined = getStorage(),
): void {
  try {
    storage?.setItem(KEY, JSON.stringify({ v: VERSION, paths: map }))
  } catch {
    // Without storage —quota, private browsing— everything still works: the only thing
    // lost is not having to sign again.
  }
}

/** Wipes the stored signatures. On sign out, like the list's mirror. */
export function clearSignedPaths(storage: Storage | undefined = getStorage()): void {
  try {
    storage?.removeItem(KEY)
  } catch {
    /* nothing to clear */
  }
}

/**
 * Of the paths asked for, the ones that must be signed: those not stored and those
 * expiring within the margin. Without repeats — the same path asked twice is signed once.
 */
export function pathsToSign(
  paths: readonly string[],
  cached: SignedPathMap,
  now: number = Date.now(),
  marginMs: number = SIGN_MARGIN_MS,
): string[] {
  const stale = new Set<string>()
  for (const path of paths) {
    const hit = cached[path]
    if (!hit || hit.expiresAt - marginMs <= now) stale.add(path)
  }
  return [...stale]
}

/**
 * Adds the new signatures, prunes the expired ones and honors the cap.
 *
 * What is dropped when trimming is what expires soonest: with a fixed validity those are
 * the oldest, that is, the records visited longest ago. What was just signed —what is on
 * screen right now— is never what goes.
 */
export function mergeSigned(
  cached: SignedPathMap,
  fresh: Record<string, string>,
  expiresAt: number,
  now: number = Date.now(),
  max: number = MAX_SIGNED_PATHS,
): SignedPathMap {
  const merged: SignedPathMap = {}
  for (const [path, signed] of Object.entries(cached)) {
    if (signed.expiresAt > now) merged[path] = signed
  }
  for (const [path, url] of Object.entries(fresh)) merged[path] = { url, expiresAt }

  const entries = Object.entries(merged)
  if (entries.length <= max) return merged
  entries.sort((a, b) => b[1].expiresAt - a[1].expiresAt)
  return Object.fromEntries(entries.slice(0, max))
}

// ── The access, with a single copy in memory ─────────────────

/**
 * What is stored, read once per session.
 *
 * One copy, **mutated in place**, not one per component: the record asks for its
 * thumbnails and the carousel for its derivatives almost at once, and with a copy each
 * whichever saved second would wipe the first one's signatures.
 */
let memory: SignedPathMap | null = null

function loaded(now: number): SignedPathMap {
  if (memory === null) memory = readSignedPaths(getStorage(), now)
  return memory
}

/** Forgets what was read. For signing out, and so the tests do not infect each other. */
export function forgetSignedPaths(): void {
  memory = null
}

/**
 * Returns a signed URL for each path asked for, signing only what is needed.
 *
 * Paths that cannot be signed are left OUT of the result instead of carrying a useless
 * URL: whoever paints already knows what to do with an image that is not there — it
 * shows the explained gap, never a broken image.
 */
export async function signPaths(
  paths: readonly string[],
  sign: (paths: string[], seconds: number) => Promise<Record<string, string>> = signedUrls,
  now: number = Date.now(),
): Promise<Record<string, string>> {
  if (paths.length === 0) return {}
  const cached = loaded(now)
  const stale = pathsToSign(paths, cached, now)

  if (stale.length > 0) {
    const fresh = await sign(stale, SIGNED_TTL_SECONDS)
    if (Object.keys(fresh).length > 0) {
      memory = mergeSigned(cached, fresh, now + SIGNED_TTL_SECONDS * 1000, now)
      saveSignedPaths(memory)
    }
  }

  const map = memory ?? cached
  const out: Record<string, string> = {}
  for (const path of paths) {
    const hit = map[path]
    if (hit) out[path] = hit.url
  }
  return out
}
