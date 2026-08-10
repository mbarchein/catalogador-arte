/**
 * How much space is left, in the three places where the catalogue lives (RF-1202).
 *
 * ── WHY THERE ARE THREE AND NOT ONE ─────────────────────────
 *
 * The catalogue is spread out, and each piece has its own limit and fills at its
 * own rate:
 *
 *   · **the database** stores the records and grows slowly, with the text;
 *   · **Supabase's store** keeps the working photographs —thumbnails,
 *     corrected copies— and grows with every artwork photographed;
 *   · **Backblaze's archive** keeps the masters, which are 2 to 8 MB per
 *     shot and is what really fills up.
 *
 * Adding them into a single figure would hide precisely what has to be seen: running out of
 * base with the archive at 10 % and running out of archive with the base empty are two
 * different problems and are fixed in different ways.
 *
 * ── THE LIMITS ──────────────────────────────────────────────
 *
 * They are each service's free tier's, which is the one the project is on
 * (`infra/variables.tf` says so when talking about Supabase's Pro plan). They are here
 * as constants and do not come from the server because no service publishes them in
 * an API: they are read on their pricing page. If a plan is ever upgraded, this is
 * what has to be changed, and the screen says which plan it is talking about so it shows
 * that the figure has an assumption behind it.
 */

/** Database of Supabase's free tier. */
export const DATABASE_LIMIT_BYTES = 500_000_000

/** File store of Supabase's free tier. */
export const STORAGE_LIMIT_BYTES = 1_000_000_000

/** Storage of Backblaze B2's free tier. */
export const MASTERS_LIMIT_BYTES = 10_000_000_000

/** The plan those limits speak of, said on the screen. */
export const PLAN_NOTICE =
  'Los límites son los del plan gratuito de cada servicio.'

const UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const

/**
 * A size as the user writes it, in Spanish.
 *
 * Multiples of 1000 and not 1024 on purpose: it is what makes this figure
 * comparable with the one Supabase's or Backblaze's panel shows. A
 * number that disagrees with the official panel is not believed, and rightly so.
 */
export function bytesText(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  let value = bytes
  let unit = 0
  while (value >= 1000 && unit < UNITS.length - 1) {
    value /= 1000
    unit += 1
  }
  // No decimals in bytes and kilobytes, where they say nothing; one from there on,
  // which is where the difference between 1.2 and 1.9 GB matters.
  const digits = unit <= 1 ? 0 : 1
  return `${value.toLocaleString('es-ES', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })} ${UNITS[unit]}`
}

/** What part of the limit is used up, from 0 to 100. */
export function usedPercent(used: number, limit: number): number {
  if (!Number.isFinite(used) || !Number.isFinite(limit) || limit <= 0) return 0
  return Math.min(100, Math.max(0, Math.round((used / limit) * 100)))
}

/** How many bytes are left, never negative: going over the limit is not spare room. */
export function freeBytes(used: number, limit: number): number {
  if (!Number.isFinite(used) || !Number.isFinite(limit)) return 0
  return Math.max(0, limit - used)
}

/**
 * What is read under each bar.
 *
 * It is what was asked —how much is left—, so it goes first and in its own
 * words. What is used and the total go afterwards, which is the context that makes
 * the figure understandable without being what was being looked for.
 */
export function freeText(used: number, limit: number): string {
  const free = freeBytes(used, limit)
  if (free === 0) {
    return `Sin espacio libre: ocupa ${bytesText(used)} de ${bytesText(limit)}`
  }
  return `Quedan ${bytesText(free)} libres de ${bytesText(limit)}`
}

/** How tight this is getting, to say it before it becomes a problem. */
export type UsageLevel = 'ok' | 'warning' | 'full'

export function usageLevel(used: number, limit: number): UsageLevel {
  const percent = usedPercent(used, limit)
  if (percent >= 100) return 'full'
  if (percent >= 80) return 'warning'
  return 'ok'
}

/**
 * The warning about a resource that is filling up, or null when there is plenty of room.
 *
 * A permanent warning stops being read, so it only comes up when little is left — and
 * then it says what to do, because «full» with no way out is bad news and nothing
 * else. What can be done is not deleting (RF-901): it is upgrading the plan.
 */
export function usageWarning(name: string, used: number, limit: number): string | null {
  const level = usageLevel(used, limit)
  if (level === 'ok') return null
  if (level === 'full') {
    return `${name} está al límite. Lo siguiente que se guarde puede fallar: hay que subir de plan.`
  }
  return `${name} va por el ${usedPercent(used, limit)}%. Conviene ir mirando el plan.`
}

/**
 * What is said when the archive's count has been left half-done.
 *
 * The Edge function paginates the listing and has a cap. If it reaches it, what it brings
 * is a minimum: it is said that way instead of presented as the total, which is the kind
 * of figure that reassures precisely on the day it should not.
 */
export function truncatedNotice(truncated: boolean): string | null {
  return truncated
    ? 'El archivo tiene demasiados ficheros para contarlos de una vez: ocupa al menos esto.'
    : null
}

/** How many files there are, said without a zero looking like a breakdown. */
export function objectsText(objects: number): string {
  if (!Number.isFinite(objects) || objects <= 0) return 'Todavía sin ficheros'
  return objects === 1 ? '1 fichero' : `${objects.toLocaleString('es-ES')} ficheros`
}

/** When this was last looked at. */
export function measuredText(at: Date | null): string {
  if (at === null) return 'Sin medir todavía'
  return `Medido a las ${at.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`
}
