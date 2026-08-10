/**
 * Making a half-filled form survive being closed (RNF-106, RF-304).
 *
 * ── WHAT THIS COVERS THAT THE QUESTION DOES NOT ─────────────
 *
 * `sheetExit.ts`'s guard covers the sheet's five exits, so nothing is lost
 * to a brush any more. But the exits that are not the sheet's exits remain, and they cannot
 * be asked about: **reloading the page, the phone killing the tab with the
 * application in the background, or the battery running out** — and in a storeroom, with the artwork in front and
 * the phone open for half an hour, all three happen. Against that a confirmation can do
 * nothing, and this can: what was written is noted down, and on reopening the sheet it is offered.
 *
 * And it changes what the question itself means. With this in place, «salir sin guardar» stops
 * being destructive: it is not stored in the catalogue, but what was written stays noted down and is
 * offered on returning. It is the difference between a sign that frightens and one that informs.
 *
 * ── THE THREE DECISIONS THAT ARE NOT OBVIOUS ────────────────
 *
 * **It expires.** A three-week-old draft offered over a record that has been touched
 * five times since is not help, it is a trap: it is accepted without looking and
 * five corrections get overwritten with what somebody left half-done. Seven days.
 *
 * **It is compared with the row.** If what is stored has changed since the draft was noted,
 * accepting it would silently revert another session's correction — which is exactly the kind of
 * silent loss this project does not allow itself. The draft is not hidden, which would be
 * losing work a second time: it is offered **saying so**, and the cataloguer decides.
 *
 * **It does not store files.** A `File` does not fit in `localStorage` and no hole is going to be
 * invented for it: the scanned file has to be chosen again, and that is said where the
 * draft is offered instead of leaving it to be discovered with the form already filled in.
 *
 * Everything here is pure, `now` included: the suite runs in node.
 */

/** The envelope that gets stored. With a version, which is what allows changing it safely. */
interface StoredDraft {
  v: 1
  /** When it was noted down, in ISO. */
  at: string
  /**
   * How what was stored looked when it was noted down, or null in a creation form —where there is no
   * row to clash with—.
   */
  fp: string | null
  draft: unknown
}

/**
 * The `localStorage` key.
 *
 * With the project's prefix and the format's version: the batch-selection key already
 * taught what it costs to rename one that is set in somebody's browser
 * (`batch.ts` carries its *one-shot* migration). With this, changing the format is changing the
 * number: the old keys stop being read and clean themselves up on expiry.
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
 * Reads what is stored and says whether it can be offered.
 *
 * Anything not understood is `none` and not an exception: this runs on opening a
 * sheet, and a `localStorage` with rubbish inside —from an earlier version, from a browser
 * extension, from a half-done save— cannot prevent the form from opening.
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
