/**
 * Cuánto espacio queda, en los tres sitios donde vive el catálogo (RF-1202).
 *
 * ── POR QUÉ SON TRES Y NO UNO ───────────────────────────────
 *
 * El catálogo está repartido, y cada trozo tiene su propio límite y se llena a su
 * propio ritmo:
 *
 *   · **la base de datos** guarda las fichas y crece despacio, con el texto;
 *   · **el almacén de Supabase** guarda las fotografías de trabajo —miniaturas,
 *     copias corregidas— y crece con cada obra fotografiada;
 *   · **el archivo de Backblaze** guarda los másters, que son de 2 a 8 MB cada
 *     toma y es lo que se llena de verdad.
 *
 * Sumarlos en una sola cifra escondería justo lo que hay que ver: quedarse sin
 * base con el archivo al 10 % y quedarse sin archivo con la base vacía son dos
 * problemas distintos y se arreglan de forma distinta.
 *
 * ── LOS LÍMITES ─────────────────────────────────────────────
 *
 * Son los del tramo gratuito de cada servicio, que es en el que está el proyecto
 * (`infra/variables.tf` lo dice al hablar del plan Pro de Supabase). Están aquí
 * como constantes y no vienen del servidor porque ningún servicio los publica en
 * una API: se leen en su página de precios. Si algún día se sube de plan, esto es
 * lo que hay que cambiar, y la pantalla dice de qué plan habla para que se note
 * que la cifra tiene un supuesto detrás.
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
 * Un tamaño como lo escribe la usuaria, en español.
 *
 * Múltiplos de 1000 y no de 1024 a propósito: es lo que hace que esta cifra se
 * pueda comparar con la que enseña el panel de Supabase o el de Backblaze. Un
 * número que discrepa del panel oficial no se cree, y con razón.
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
 * Lo que se lee bajo cada barra.
 *
 * Es lo que se preguntó —cuánto queda—, así que va primero y en sus propias
 * palabras. Lo ocupado y el total van detrás, que es el contexto que hace
 * entender la cifra sin ser lo que se buscaba.
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
 * El aviso de un recurso que se está llenando, o null cuando va holgado.
 *
 * Un aviso permanente se deja de leer, así que solo sale cuando queda poco — y
 * entonces dice qué hacer, porque «lleno» sin salida es una mala noticia y nada
 * más. Lo que se puede hacer no es borrar (RF-901): es subir de plan.
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
 * Lo que se dice cuando el recuento del archivo se ha quedado a medias.
 *
 * La función Edge pagina el listado y tiene un tope. Si lo alcanza, lo que trae
 * es un mínimo: se dice así en vez de presentarlo como el total, que es la clase
 * de cifra que tranquiliza justo el día que no debería.
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
