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

/** Base de datos del tramo gratuito de Supabase. */
export const DATABASE_LIMIT_BYTES = 500_000_000

/** Almacén de ficheros del tramo gratuito de Supabase. */
export const STORAGE_LIMIT_BYTES = 1_000_000_000

/** Almacenamiento del tramo gratuito de Backblaze B2. */
export const MASTERS_LIMIT_BYTES = 10_000_000_000

/** El plan del que hablan esos límites, dicho en la pantalla. */
export const PLAN_NOTICE =
  'Los límites son los del plan gratuito de cada servicio. Si algún día se sube de plan, aquí ' +
  'seguirán saliendo los de ahora hasta que se cambien.'

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
  // Sin decimales en bytes y kilobytes, donde no dicen nada; uno a partir de ahí,
  // que es donde la diferencia entre 1,2 y 1,9 GB importa.
  const digits = unit <= 1 ? 0 : 1
  return `${value.toLocaleString('es-ES', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })} ${UNITS[unit]}`
}

/** Qué parte del límite se lleva usada, de 0 a 100. */
export function usedPercent(used: number, limit: number): number {
  if (!Number.isFinite(used) || !Number.isFinite(limit) || limit <= 0) return 0
  return Math.min(100, Math.max(0, Math.round((used / limit) * 100)))
}

/** Cuántos bytes quedan, nunca negativo: pasarse del límite no es espacio de sobra. */
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

/** Cómo de apurado va esto, para decirlo antes de que sea un problema. */
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
  return `${name} va por el ${usedPercent(used, limit)} %. Conviene ir mirando el plan.`
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

/** Cuántos ficheros hay, dicho sin que un cero parezca una avería. */
export function objectsText(objects: number): string {
  if (!Number.isFinite(objects) || objects <= 0) return 'Todavía sin ficheros'
  return objects === 1 ? '1 fichero' : `${objects.toLocaleString('es-ES')} ficheros`
}

/** Cuándo se miró esto por última vez. */
export function measuredText(at: Date | null): string {
  if (at === null) return 'Sin medir todavía'
  return `Medido a las ${at.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`
}
