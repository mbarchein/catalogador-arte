/**
 * Que un formulario a medio rellenar sobreviva a cerrarse (RNF-106, RF-304).
 *
 * ── QUÉ CUBRE ESTO QUE NO CUBRE LA PREGUNTA ─────────────────
 *
 * El guardián de `sheetExit.ts` tapa las cinco salidas de la hoja, así que ya no se pierde
 * nada por un roce. Pero quedan las salidas que no son salidas de la hoja y que no se
 * pueden preguntar: **recargar la página, que el teléfono mate la pestaña con la
 * aplicación de fondo, o quedarse sin batería** — y en un almacén, con la obra delante y
 * el móvil abierto media hora, las tres pasan. Contra eso una confirmación no puede hacer
 * nada, y esto sí: lo escrito se apunta, y al volver a abrir la hoja se ofrece.
 *
 * Y cambia lo que significa la propia pregunta. Con esto puesto, «salir sin guardar» deja
 * de ser destructivo: no se guarda en el catálogo, pero lo escrito se queda apuntado y se
 * ofrece a la vuelta. Es la diferencia entre un cartel que da miedo y uno que informa.
 *
 * ── LAS TRES DECISIONES QUE NO SON OBVIAS ───────────────────
 *
 * **Caduca.** Un borrador de hace tres semanas ofrecido sobre una ficha que se ha tocado
 * cinco veces desde entonces no es ayuda, es una trampa: se acepta sin mirar y se
 * sobreescriben cinco correcciones con lo que alguien dejó a medias. Siete días.
 *
 * **Se compara con la fila.** Si lo guardado ha cambiado desde que se apuntó el borrador,
 * aceptarlo revertiría en silencio la corrección de otra sesión — que es justo la clase de
 * pérdida silenciosa que este proyecto no se permite. No se esconde el borrador, que sería
 * perder trabajo por segunda vez: se ofrece **diciéndolo**, y la catalogadora decide.
 *
 * **No guarda ficheros.** Un `File` no cabe en `localStorage` y no se va a inventar un
 * hueco para él: el fichero escaneado hay que volver a elegirlo, y eso se dice donde se
 * ofrece el borrador en vez de dejarlo descubrir con el formulario ya relleno.
 *
 * Todo aquí es puro, `now` incluido: la batería corre en node.
 */

/** The envelope that gets stored. With a version, which is what allows changing it safely. */
interface StoredDraft {
  v: 1
  /** When it was noted down, in ISO. */
  at: string
  /**
   * Cómo estaba lo guardado cuando se apuntó, o null en un formulario de alta —donde no
   * hay fila con la que chocar—.
   */
  fp: string | null
  draft: unknown
}

/**
 * La clave de `localStorage`.
 *
 * Con prefijo del proyecto y versión del formato: la clave de la selección por lotes ya
 * enseñó lo que cuesta renombrar una que está puesta en los navegadores de alguien
 * (`batch.ts` lleva su migración *one-shot*). Con esto, cambiar el formato es cambiar el
 * número: las claves viejas dejan de leerse y se limpian solas al caducar.
 */
export function draftStorageKey(scope: string): string {
  return `catalogador:borrador:v1:${scope}`
}

/** From when a draft is no longer offered: seven days. */
export const DRAFT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

/** What gets stored, already as text. `null` when there is nothing to store. */
export function packDraft(input: {
  draft: unknown
  at: Date
  fingerprint: string | null
}): string {
  const stored: StoredDraft = {
    v: 1,
    at: input.at.toISOString(),
    fp: input.fingerprint,
    draft: input.draft,
  }
  return JSON.stringify(stored)
}

/** En qué estado llega un borrador guardado. */
export type DraftStatus =
  /** There is none, or what is there cannot be read. */
  | 'none'
  /** There is one, but too old. It is thrown away. */
  | 'expired'
  /** There is one, and what is stored has changed since. It is offered, saying so. */
  | 'stale'
  | 'ready'

export interface DraftRead<T> {
  status: DraftStatus
  /** The draft, only when it can be offered (`ready` or `stale`). */
  draft: T | null
  /** When it was noted down, so it can be said. */
  at: Date | null
}

/**
 * Lee lo guardado y dice si se puede ofrecer.
 *
 * Cualquier cosa que no se entienda es `none` y no una excepción: esto corre al abrir una
 * hoja, y un `localStorage` con basura dentro —de una versión anterior, de una extensión
 * del navegador, de un guardado a medias— no puede impedir abrir el formulario.
 */
export function readDraft<T>(
  raw: string | null,
  options: { now: Date; fingerprint: string | null },
): DraftRead<T> {
  const empty: DraftRead<T> = { status: 'none', draft: null, at: null }
  if (raw === null || raw.trim() === '') return empty

  let stored: StoredDraft
  try {
    stored = JSON.parse(raw) as StoredDraft
  } catch {
    return empty
  }
  if (stored === null || typeof stored !== 'object' || stored.v !== 1) return empty
  if (stored.draft === null || typeof stored.draft !== 'object') return empty

  const at = new Date(stored.at)
  if (Number.isNaN(at.getTime())) return empty
  const age = options.now.getTime() - at.getTime()
  // A draft dated in the future is a clock set wrong, not a draft from the future: it is
  // accepted, since throwing it away would lose work over an hour of time-zone difference.
  if (age > DRAFT_MAX_AGE_MS) return { status: 'expired', draft: null, at }

  const stale = stored.fp !== null && options.fingerprint !== null && stored.fp !== options.fingerprint
  return { status: stale ? 'stale' : 'ready', draft: stored.draft as T, at }
}

/**
 * Un resumen de la fila guardada, para saber si ha cambiado desde que se apuntó el
 * borrador.
 *
 * Los valores en orden y separados por una barra vertical: no es criptografía, es una
 * cadena que cambia cuando cambia cualquiera de los campos. Se le pasan los MISMOS campos
 * que el formulario edita, y no la fila entera: si otra sesión ha tocado algo que este
 * formulario no escribe, el borrador sigue siendo válido y avisar sería avisar de nada.
 */
export function draftFingerprint(values: readonly (string | number | boolean | null | undefined)[]): string {
  return values.map((value) => (value == null ? '' : String(value).trim())).join('|')
}

// ── What is read when offering it ────────────────────────────

/**
 * «hace un momento», «hace 20 minutos», «ayer»…
 *
 * En palabras y no con la hora exacta porque la pregunta que contesta es «¿esto es de
 * ahora mismo o de otro día?», y para eso «hace 20 minutos» dice más que «15:42». A partir
 * de dos días entra la fecha, que es cuando la cuenta de días deja de significar nada.
 */
export function draftAgeText(at: Date, now: Date): string {
  const ms = Math.max(0, now.getTime() - at.getTime())
  const minutes = Math.floor(ms / 60_000)
  if (minutes < 2) return 'hace un momento'
  if (minutes < 60) return `hace ${minutes} minutos`
  const hours = Math.floor(minutes / 60)
  if (hours === 1) return 'hace una hora'
  if (hours < 24) return `hace ${hours} horas`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'ayer'
  return `el ${at.toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })}`
}

/**
 * Lo que se lee al ofrecer el borrador, o null cuando no hay ninguno que ofrecer.
 *
 * El caso `stale` **no se calla y no esconde el borrador**: decir solo «tenías esto a
 * medio escribir» sobre una ficha que otra sesión ha corregido llevaría a aceptarlo sin
 * mirar y a revertir esa corrección en silencio. Y esconderlo sería perder el trabajo por
 * segunda vez. Así que se ofrece, se dice lo que ha pasado, y decide quien mira.
 *
 * @param filesLost El formulario llevaba un fichero, que no se ha podido apuntar.
 */
export function draftOfferText(input: {
  status: DraftStatus
  at: Date | null
  now: Date
  filesLost?: boolean
}): string | null {
  const { status, at, now } = input
  if (at === null || (status !== 'ready' && status !== 'stale')) return null
  const when = draftAgeText(at, now)
  const files = input.filesLost
    ? ' El fichero no se ha podido guardar: habría que volver a elegirlo.'
    : ''
  if (status === 'stale') {
    return (
      `Dejaste esto a medio rellenar ${when}, y desde entonces los datos guardados han cambiado ` +
      '—los habrá corregido otra sesión—. Si recuperas lo tuyo, esa corrección se perdería: ' +
      `míralo antes de guardar.${files}`
    )
  }
  return `Dejaste esto a medio rellenar ${when}. ¿Lo recuperas?${files}`
}

export const DRAFT_RESTORE_LABEL = 'Recuperar lo que escribí'
export const DRAFT_DISCARD_LABEL = 'Empezar de cero'
