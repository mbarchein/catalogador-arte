// Which storage keys "sign-file" is allowed to sign.
//
// This lives in its own module, with NO Deno API in it, for one reason: there is
// no Deno in this environment and the Edge function therefore had no tests at
// all — while being the only place that decides what the storage credentials get
// used for. A plain module is importable both by the function (Deno) and by the
// frontend test runner (vitest), so the perimeter gets covered by the suite that
// actually runs.
//
// Signing any key would turn the function into a universal signer for the
// bucket, which is why this is an allow-list and not a sanity check.

/**
 * The catalog prefixes, which are those of the `artworks_id_format` constraint.
 *
 * **When a new fund is added it must be added here too**, or its photographs
 * will not upload: it already happened once with `TS-`. These are legacy data —
 * `AR` is Rotili and `RC` is Ruiz Campins, both surnames, and `TS` is the test
 * fund — so they are not translated and not renamed.
 */
export const CATALOG_PREFIXES = ['AR', 'RC', 'TS'] as const

/**
 * The two file kinds this catalog keeps outside Supabase, and the whole reason
 * there are two:
 *
 * - `master` is the untouched original. It is written exactly once and never
 *   rewritten (ADR-002). The storage key has no delete capability, so the worst
 *   an overwrite could do is put the same bytes back.
 * - `corrected` is the full-resolution copy carrying every correction —
 *   rotation, crop, perspective and colour — and it is what actually gets sent
 *   to a print shop or a curator (RF-420, RF-411, ADR-010). Sending the master
 *   would send the photograph with the warehouse bulb's cast and the perspective
 *   still skewed.
 *
 * `corrected` is deliberately rewritable and the master is not: re-editing
 * replaces the copy, because what the database stores is parameters that are
 * absolute over the master. The master staying untouched is exactly what makes
 * regenerating the copy safe.
 */
export const SIGNABLE_KINDS = ['master', 'corrected'] as const

export type SignableKind = (typeof SIGNABLE_KINDS)[number]

/**
 * `AR-0001/<base>_master.jpg` and `AR-0001/<base>_corrected.jpg`, and nothing
 * else. The base is the random suffix the client builds so two photographs of
 * the same artwork never collide; it is matched loosely on purpose, because it
 * validates paths of files **already uploaded** and tightening it would strand
 * them.
 */
export const VALID_PATH = new RegExp(
  `^(${CATALOG_PREFIXES.join('|')})-\\d{4}/[A-Za-z0-9._-]+_(${SIGNABLE_KINDS.join('|')})\\.[A-Za-z0-9]+$`,
)

/** Whether "sign-file" may sign this key at all. */
export function isSignablePath(path: unknown): path is string {
  return typeof path === 'string' && VALID_PATH.test(path)
}

/**
 * Which of the two kinds a signable path is, or `null` when it is not signable.
 *
 * The caller needs this to decide policy, not to decide whether to sign: a
 * Reader may download either kind — delivering an original to a print shop is
 * precisely their use case (RF-411) — while uploading either kind requires edit
 * rights.
 */
export function signableKind(path: unknown): SignableKind | null {
  if (!isSignablePath(path)) return null
  const match = VALID_PATH.exec(path)
  return (match?.[2] as SignableKind) ?? null
}
