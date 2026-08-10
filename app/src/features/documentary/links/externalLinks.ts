/**
 * A record's links to external sites, turned into something that is read and
 * pressed (RF-1401 to RF-1408).
 *
 * This module is the READING half: what is seen of each link, in what order,
 * grouped how, and what the block says when there is none. The WRITING
 * half —validating, storing and explaining a rejection— lives in `linkDraft.ts`.
 *
 * There is no React or network here, and it is not tidiness: the suite runs in node and cannot
 * open a component, so everything that decides something has to be reachable
 * without a DOM. What is left in the JSX is layout.
 *
 * ── WHAT THIS MODULE DOES NOT DO, AND IT IS A REQUIREMENT ───
 *
 * It brings NOTHING from the linked site (RF-1404): no icon, no title, no
 * preview, no automatic check. Each of those things would
 * tell a third party which artwork is being catalogued and from what address. And with no
 * application server a crawler would also lie: what a browser can
 * check from the client is «I have been allowed to request this», not «that page still
 * shows what it documented».
 */

import {
  EXTERNAL_LINK_TYPE_LABEL,
  LINK_CHECK_STATUS_LABEL,
  PHOTO_PROVENANCE_LABEL,
  SHOT_TYPE_LABEL,
  type ExternalLink,
  type ExternalLinkType,
  type PhotoProvenance,
  type ShotTypeValue,
} from '../../../lib/types'

/**
 * A link as the block's query returns it.
 *
 * `created_at` is not in `ExternalLink` because the record does not show it, and here it is
 * needed: the order within a type is the creation order (the table deliberately does not carry
 * `sort_order`, and nobody has asked for reordering by hand).
 */
export interface ExternalLinkRow extends ExternalLink {
  readonly created_at: string
}

/** A photograph of the artwork, with just enough to name it and for RF-1407's pair. */
export interface PhotoRef {
  readonly image_id: string
  readonly shot_type: ShotTypeValue
  readonly sort_order: number
  readonly provenance: PhotoProvenance
  readonly active: boolean
}

// ── The destination, seen before touching (RF-1408) ──────────

/**
 * The site's name, and **the same piece of the address the base looked at**.
 *
 * `is_web_url` extracts the authority with `^https?://([^/?#]*)`, so this
 * function cuts there and not on its own. It matters that it be the same cut: if
 * here a different part from the one the base validated were shown as the domain,
 * the screen would be stating a destination that is not the destination. That is
 * exactly the impersonation the base's whitelist exists to close
 * —`https://macvac.es@evil.example/` reads as MACVA's and goes somewhere else—, and
 * repeating it in the drawing layer would reopen it from the other side.
 *
 * It returns an empty string when it does not recognise a plain site name. It is
 * deliberate and it is the safe side: the caller then shows the whole
 * address, which is long and ugly but true. **This validates nothing** and does not decide
 * whether a link can be stored: only `is_web_url` in the base says that.
 */
export function linkDomain(url: string): string {
  const authority = /^https?:\/\/([^/?#]*)/i.exec(url)?.[1] ?? ''
  const host = authority.toLowerCase()
  // The same shape the base requires: ASCII labels separated by dots, a
  // top-level domain of two letters or more and an optional port. If it does not
  // fit, no invented domain is shown.
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}(:\d{1,5})?$/.test(host)) {
    return ''
  }
  // `www.` is dropped only for reading: it says nothing and takes up four characters of a
  // narrow screen. The address that is stored and travelled to is untouched.
  return host.startsWith('www.') ? host.slice(4) : host
}

/**
 * What is read of the link, and **never a gap** (RF-304, RF-1408).
 *
 * The title if it has one; if not, the domain, which is the only question asked
 * before pressing. The whole address only as a last resort, when not
 * even a domain is recognised: on a phone screen it takes three lines,
 * but it is the truth, and keeping quiet would leave a link with nothing to touch.
 */
export function linkLabel(link: Pick<ExternalLinkRow, 'title' | 'url'>): string {
  const title = link.title.trim()
  if (title !== '') return title
  const domain = linkDomain(link.url)
  return domain !== '' ? domain : link.url
}

/**
 * What is shown BELOW the label so that the destination is visible before
 * touching.
 *
 * It returns null when the label is already the destination —a link with no title is
 * called by its domain— because repeating it twice in two text sizes
 * adds no information and steals a line.
 */
export function linkDestination(link: Pick<ExternalLinkRow, 'title' | 'url'>): string | null {
  const domain = linkDomain(link.url)
  if (domain === '') return null
  return linkLabel(link) === domain ? null : domain
}

/** The kind of site. Null is «Sin clasificar», which is **not** `OTHER` (RF-1402, RF-205). */
export function linkTypeText(type: ExternalLinkType | null): string {
  return type === null ? 'Sin clasificar' : EXTERNAL_LINK_TYPE_LABEL[type]
}

// ── The count and the empty block ────────────────────────────

/**
 * `3 enlaces`, `1 enlace`, `Ninguno registrado`.
 *
 * The count goes in the folded block's heading, so it is the ONLY thing
 * read before deciding whether to open it, and the empty case is a sentence and not a zero:
 * «0 enlaces» reads as an answer about the artwork, and it is not.
 */
export function linkCountText(count: number): string {
  if (count <= 0) return 'Ninguno registrado'
  return count === 1 ? '1 enlace' : `${count} enlaces`
}

/**
 * What the block says when there is no link at all.
 *
 * Like the related-artworks block, this one **carries no research state**
 * in `artworks`, and the empty text has to bear that: here nobody can
 * declare «investigado, sin resultados», so the sentence cannot imply that
 * the absence means there is nothing on the internet about this artwork.
 */
export const EMPTY_TEXT =
  'Sin enlaces registrados. Este bloque no lleva estado de investigación: que esté vacío no ' +
  'dice si se ha buscado o no, solo que nadie ha pegado todavía una dirección aquí.'

/** And where one is added, so the empty case is not a dead end. */
export const EMPTY_HINT_READONLY =
  'Los enlaces se añaden desde la zona de edición de la ficha.'

// ── The check state (RF-1405) ───────────────────────────────

/** The colour of the check label. The same four tones the record already speaks. */
export type CheckTone = 'unchecked' | 'working' | 'changed' | 'broken'

export interface CheckBadge {
  /** What is read on the label. Never empty. */
  readonly label: string
  readonly tone: CheckTone
  /** When it was checked, or why it is not recorded. Null when there is nothing to add. */
  readonly detail: string | null
  /** The check is old: the label is still what it is, but aged. */
  readonly stale: boolean
}

/**
 * From how many days a check stops saying much.
 *
 * A year, and the number has an argument: a museum page that has gone twelve months
 * without being looked at is not a broken page —saying that would be inventing the datum RF-1405
 * protects— but it is not a «it works» of today either. What is done with the warning is
 * to order the work of whoever reviews, not to state anything about the site.
 */
export const STALE_DAYS = 365

/** Whole days between two moments, or null if the date cannot be read. */
export function daysSince(iso: string | null, now: Date): number | null {
  if (iso === null) return null
  const at = new Date(iso).getTime()
  if (Number.isNaN(at)) return null
  return Math.floor((now.getTime() - at) / 86_400_000)
}

/** «hoy», «ayer», «hace 3 días», «hace 2 meses», «hace más de un año». */
export function agoText(days: number): string {
  if (days <= 0) return 'hoy'
  if (days === 1) return 'ayer'
  if (days < 30) return `hace ${days} días`
  if (days < 365) {
    const months = Math.max(1, Math.round(days / 30))
    return months === 1 ? 'hace un mes' : `hace ${months} meses`
  }
  return days < 730 ? 'hace más de un año' : `hace más de ${Math.floor(days / 365)} años`
}

/**
 * A link's check state, as it is read in the record.
 *
 * **«Sin comprobar» is the fourth state and it is not «broken».** It goes in a neutral tone and not
 * in red, and it says so with words: a freshly pasted link is not broken, it is that
 * nobody has opened it again. Painting red the state every link is born in
 * teaches the eye to skip it, which is how the warning about the one that IS
 * broken gets lost.
 *
 * `CHANGED` is amber and not red for the same reason: the page loads, so the link
 * leads somewhere; what has changed is what it documented, and that is pending
 * work and not an error.
 */
export function checkBadge(
  link: Pick<ExternalLinkRow, 'check_status' | 'checked_at'>,
  now: Date,
): CheckBadge {
  if (link.check_status === null) {
    return {
      label: 'Sin comprobar',
      tone: 'unchecked',
      detail: 'Nadie ha abierto esta página desde la ficha. Sin comprobar no es roto.',
      stale: false,
    }
  }
  const days = daysSince(link.checked_at, now)
  const label = LINK_CHECK_STATUS_LABEL[link.check_status]
  const tone: CheckTone =
    link.check_status === 'WORKING' ? 'working' : link.check_status === 'CHANGED' ? 'changed' : 'broken'
  // The base guarantees the pair —result and date go together or not at all
  // (`external_links_check_pair`)—, so an unreadable date here is corrupt
  // data and not a normal case: it is said instead of kept quiet.
  if (days === null) {
    return { label, tone, detail: 'Comprobado en una fecha que no se ha podido leer.', stale: false }
  }
  const stale = link.check_status === 'WORKING' && days >= STALE_DAYS
  const when = `Comprobado ${agoText(days)}`
  return {
    label,
    tone,
    detail: stale
      ? `${when}: sigue constando que funciona, pero nadie lo ha vuelto a abrir desde entonces.`
      : `${when}.`,
    stale,
  }
}

/** A withdrawn link is still read, and it is said that it is (RF-901, RF-1406). */
export function retiredNotice(link: Pick<ExternalLinkRow, 'active'>): string | null {
  return link.active
    ? null
    : 'Retirado del catálogo. Se sigue viendo porque puedes editar; quien solo consulta no lo ve.'
}

// ── The order and the groups ─────────────────────────────────

/**
 * The order of the types on screen, which is the base's enum's and not
 * Spanish alphabetical: it groups by closeness —museum, catalogue, database—
 * rather than by the letter the translation starts with.
 *
 * «Sin clasificar» goes last, after `OTHER`: they are the ones waiting for
 * somebody to look at them, and that is the place of a pending task in a list
 * read from top to bottom.
 */
export const TYPE_ORDER: readonly ExternalLinkType[] = [
  'MUSEUM_PAGE',
  'ONLINE_CATALOG',
  'ART_DATABASE',
  'PRESS',
  'VIDEO',
  'ARTIST_SITE',
  'PHOTO_SOURCE',
  'OTHER',
]

/**
 * The nine kind options offered on saving, and the first one is the
 * absence.
 *
 * «Sin clasificar» IS an option and goes FIRST because it is the value a link pasted
 * with one hand is born with: requiring classification on pasting breaks capture
 * (RNF-106, RF-1408). And it is not «Otro»: `OTHER` means somebody looked at it and it
 * did not fit, which is a datum (RF-1402, and the exception to RF-205 the requirements
 * document already records).
 */
export function linkTypeChoices(): readonly { value: ExternalLinkType | ''; text: string }[] {
  return [
    { value: '', text: 'Sin clasificar' },
    ...TYPE_ORDER.map((type) => ({ value: type, text: EXTERNAL_LINK_TYPE_LABEL[type] })),
  ]
}

function typeRank(type: ExternalLinkType | null): number {
  if (type === null) return TYPE_ORDER.length
  const at = TYPE_ORDER.indexOf(type)
  return at === -1 ? TYPE_ORDER.length : at
}

/**
 * The links sorted: **the active before the withdrawn**, then by type and
 * then by creation date.
 *
 * The withdrawn last and not interleaved, even though only whoever edits sees it: a
 * list where the current and the withdrawn alternate forces one to read every line's
 * label to know what is recorded today.
 */
export function sortLinks(rows: readonly ExternalLinkRow[]): readonly ExternalLinkRow[] {
  return [...rows].sort((a, b) => {
    if (a.active !== b.active) return a.active ? -1 : 1
    const rank = typeRank(a.link_type) - typeRank(b.link_type)
    if (rank !== 0) return rank
    if (a.created_at !== b.created_at) return a.created_at < b.created_at ? -1 : 1
    // Empate exacto de fecha —las dos filas que trasladó la migración de notas
    // comparten `now()`—: la dirección decide, para que el orden no dependa de lo
    // que la base devuelva primero.
    return a.url < b.url ? -1 : a.url > b.url ? 1 : 0
  })
}

/** A photograph's links, with the photograph named. */
export interface PhotoLinkGroup {
  readonly imageId: string
  /** «General», «Reverso»… and the position, which is how a shot is named in the gallery. */
  readonly title: string
  /** That the shot is withdrawn, or that it comes from another catalogue. Null if there is nothing to say. */
  readonly notice: string | null
  readonly links: readonly ExternalLinkRow[]
}

export interface LinkGroups {
  /** The ones hanging from the artwork. */
  readonly artwork: readonly ExternalLinkRow[]
  /** The ones hanging from a photograph of this artwork, grouped by shot. */
  readonly photos: readonly PhotoLinkGroup[]
  /** Total of ACTIVE links, which is what the heading counts. */
  readonly activeCount: number
}

/**
 * Cómo se nombra una fotografía en este bloque: «Foto 2 · Reverso».
 *
 * El número es el de la galería (`sort_order`) y no el identificador del fichero:
 * `RC-0004_v7` no le dice nada a quien está mirando la obra, y el orden en el que
 * se ven las fotos sí.
 */
export function photoTitle(photo: PhotoRef): string {
  return `Foto ${photo.sort_order} · ${SHOT_TYPE_LABEL[photo.shot_type]}`
}

/** What has to be warned about the shot a link hangs from. */
export function photoNotice(photo: PhotoRef): string | null {
  const parts: string[] = []
  if (!photo.active) parts.push('Fotografía retirada de la ficha')
  if (photo.provenance !== 'OWN') parts.push(PHOTO_PROVENANCE_LABEL[photo.provenance])
  return parts.length === 0 ? null : parts.join(' · ')
}

/**
 * Reparte los enlaces de la ficha entre la obra y sus fotografías.
 *
 * Las dos anclas que existen HOY en la base son `artwork_id` e `image_id`, y el
 * arco es exclusivo: exactamente una de las dos. Las demás —exposición,
 * publicación, parte, documento de archivo— llegan en su propia migración, y
 * cuando lleguen esto crece por aquí.
 *
 * Un enlace cuya fotografía no está en la lista de tomas **no se pierde**: se
 * agrupa igualmente y se nombra por su identificador. Pasa de verdad —la política
 * de `images` esconde al Lector las tomas retiradas mientras la de los enlaces
 * puede seguir dejando ver el enlace— y tirar la fila sería que un dato del
 * catálogo desapareciera de la pantalla sin que nadie lo retirara.
 */
export function groupLinks(
  rows: readonly ExternalLinkRow[],
  photos: readonly PhotoRef[],
): LinkGroups {
  const ordered = sortLinks(rows)
  const artwork = ordered.filter((row) => row.artwork_id !== null)

  const byPhoto = new Map<string, ExternalLinkRow[]>()
  for (const row of ordered) {
    if (row.image_id === null) continue
    const list = byPhoto.get(row.image_id)
    if (list) list.push(row)
    else byPhoto.set(row.image_id, [row])
  }

  // The groups' order is the gallery's, and shots that are not known go
  // last: what has no position cannot be placed in the sequence.
  const known = [...photos].sort((a, b) => a.sort_order - b.sort_order)
  const groups: PhotoLinkGroup[] = []
  for (const photo of known) {
    const links = byPhoto.get(photo.image_id)
    if (!links) continue
    groups.push({
      imageId: photo.image_id,
      title: photoTitle(photo),
      notice: photoNotice(photo),
      links,
    })
    byPhoto.delete(photo.image_id)
  }
  for (const [imageId, links] of byPhoto) {
    groups.push({
      imageId,
      title: imageId,
      notice:
        'No se ha podido leer esta fotografía de la ficha, así que el enlace se muestra por el ' +
        'identificador de la toma.',
      links,
    })
  }

  return {
    artwork,
    photos: groups,
    activeCount: ordered.filter((row) => row.active).length,
  }
}

// ── The pair that closes RF-1407 ─────────────────────────────

/**
 * Las reproducciones que no dicen de dónde salieron.
 *
 * Es la mitad que faltaba de RF-417: `provenance` podía decir que una fotografía
 * venía de otro catálogo, pero no DE CUÁL, y una procedencia sin origen es media
 * respuesta —justo la mitad que se necesita para volver a la fuente o para pedir
 * permiso de reproducción—. Con el ancla de fotografía ya se puede cerrar, y esta
 * función es la que lo pone delante de los ojos en vez de esperar a que alguien
 * se acuerde.
 *
 * Solo cuenta el enlace ACTIVO: uno retirado no documenta nada.
 */
export function reproductionsWithoutSource(
  photos: readonly PhotoRef[],
  rows: readonly ExternalLinkRow[],
): readonly PhotoRef[] {
  const withSource = new Set(
    rows
      .filter((row) => row.active && row.link_type === 'PHOTO_SOURCE' && row.image_id !== null)
      .map((row) => row.image_id as string),
  )
  return [...photos]
    .filter((photo) => photo.provenance !== 'OWN' && !withSource.has(photo.image_id))
    .sort((a, b) => a.sort_order - b.sort_order)
}

/**
 * El aviso de las reproducciones sin origen, o null si no hay ninguna.
 *
 * Se nombra cada toma, porque la acción que sigue es abrir esa foto y buscar de
 * dónde salió, y «hay 2 reproducciones sin origen» obliga a averiguar cuáles.
 */
export function missingSourceNotice(photos: readonly PhotoRef[]): string | null {
  if (photos.length === 0) return null
  const names = photos.map((photo) => photoTitle(photo)).join(', ')
  const one = photos.length === 1
  return (
    `${one ? 'Esta reproducción no dice' : 'Estas reproducciones no dicen'} de dónde ` +
    `${one ? 'salió' : 'salieron'}: ${names}. Consta que ${one ? 'no es una toma propia' : 'no son tomas propias'}, ` +
    `y sin la dirección de la página de la que ${one ? 'se tomó' : 'se tomaron'} el aviso no lleva a ninguna parte.`
  )
}
