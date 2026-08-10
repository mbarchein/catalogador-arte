/**
 * Writing a link: what is sent, what can be said before sending it, and what
 * sentence in Spanish corresponds to each answer of the base (RF-1401 to RF-1406).
 *
 * ── THE ADDRESS'S RULE IS NOT HERE, AND THAT IS THE POINT ────
 *
 * `is_web_url` is the only line in the system that says NO to an address, it lives
 * in the base and **the client calls it** (`grant execute ... to authenticated`, and
 * checked over HTTP against the local base). This module carries not one URL
 * pattern of its own, and not out of elegance: the base's function closes two attacks a
 * new pattern would let through again —the BACKSLASH in the host, which the
 * browser treats as a slash (`https://evil.example\.ejemplo.es/`), and the
 * zero-width characters inside the site's name, which `[[:space:]]` does not
 * catch— and a second copy of the rule is a copy that falls behind. A `check`
 * that calls a function does not revalidate the old rows when the function
 * changes either, so the day the base gets stricter the screen has nothing to
 * follow.
 *
 * What does belong to this side is **saying why**: PostgreSQL answers
 * `violates check constraint "external_links_url_is_web"`, and that is not shown
 * to anybody. See `describeUrlRefusal`.
 */

import type { ExternalLinkType, LinkCheckStatus } from '../../../lib/types'
import { LINK_CHECK_STATUS_DESCRIPTION, LINK_CHECK_STATUS_LABEL } from '../../../lib/types'
import { linkDomain, linkLabel, type ExternalLinkRow } from './externalLinks'

// ── The draft ────────────────────────────────────────────────

/** Which record the link hangs from. The arc is exclusive: exactly one (RF-1401). */
export type LinkAnchor =
  | { readonly kind: 'ARTWORK'; readonly id: string }
  | { readonly kind: 'IMAGE'; readonly id: string }

export interface LinkDraft {
  readonly anchor: LinkAnchor
  readonly url: string
  readonly title: string
  /** An empty string is «sin clasificar» in the form, and travels as null (RF-1402). */
  readonly linkType: ExternalLinkType | ''
  readonly note: string
  /** The copy that **a person** saved in a public archive. The application archives nothing (RF-1404). */
  readonly archiveUrl: string
}

export function emptyDraft(anchor: LinkAnchor): LinkDraft {
  return { anchor, url: '', title: '', linkType: '', note: '', archiveUrl: '' }
}

/** The draft of a link that already exists, to correct it without writing it again. */
export function draftFrom(link: ExternalLinkRow): LinkDraft {
  return {
    anchor:
      link.artwork_id !== null
        ? { kind: 'ARTWORK', id: link.artwork_id }
        : { kind: 'IMAGE', id: link.image_id ?? '' },
    url: link.url,
    title: link.title,
    linkType: link.link_type ?? '',
    note: link.note,
    archiveUrl: link.archive_url ?? '',
  }
}

/**
 * The draft with the spaces at the ends removed, which is what is validated
 * **and** what is stored.
 *
 * That they be the same text is not a detail. The base REJECTS an address with
 * spaces at the ends instead of trimming it, and its migration says why: «
 * javascript:alert(1)» with a leading space is executed by the browser, which
 * trims, and any naive comparison that does not trim first lets it through. On the
 * client side the trimming belongs to the FIELD —pasting on a phone drags in a line
 * break with astonishing ease— and it is done BEFORE asking the base, so
 * what is validated is exactly what is sent. Nothing slips through here:
 * after trimming, «javascript:alert(1)» is still rejected by the scheme
 * whitelist, which is the base's.
 *
 * The title is trimmed because the base requires it (`external_links_title_trimmed`);
 * the note, because it is what any text field in this project does. Of
 * neither of the two is the interior touched.
 */
export function trimDraft(draft: LinkDraft): LinkDraft {
  return {
    ...draft,
    url: draft.url.trim(),
    title: draft.title.trim(),
    note: draft.note.trim(),
    archiveUrl: draft.archiveUrl.trim(),
  }
}

/** What travels to the `insert`. The three check columns are not sent: the base freezes them (RF-1405). */
export function insertPayload(draft: LinkDraft): Record<string, string | null> {
  const clean = trimDraft(draft)
  return {
    artwork_id: clean.anchor.kind === 'ARTWORK' ? clean.anchor.id : null,
    image_id: clean.anchor.kind === 'IMAGE' ? clean.anchor.id : null,
    url: clean.url,
    title: clean.title,
    link_type: clean.linkType === '' ? null : clean.linkType,
    note: clean.note,
    archive_url: clean.archiveUrl === '' ? null : clean.archiveUrl,
  }
}

/**
 * What travels to the `update`.
 *
 * **The anchor does not go**, and it is not an oversight: moving a link from an artwork to a
 * photograph is changing which record it hangs from, and that is not correcting an address.
 * If it is ever needed, it is withdrawn and added where it belongs, which besides leaves
 * the trace of both things.
 */
export function updatePayload(draft: LinkDraft): Record<string, string | null> {
  const { artwork_id: _artwork, image_id: _image, ...rest } = insertPayload(draft)
  return rest
}

// ── What can be said without asking the base ─────────────────

/**
 * The only problem this side decides on its own: that there is no address.
 *
 * It is not a rule about a URL's shape —there is not one line about that here—,
 * it is that the field is empty. It serves to have the button off instead of sending
 * a request already known to carry nothing.
 */
export function missingUrl(draft: LinkDraft): boolean {
  return trimDraft(draft).url === ''
}

/**
 * The same address, again, in the same record (RF-1406).
 *
 * It is predicted with what the block already has loaded so it can be said on the spot
 * and with what has to be done, instead of waiting for the base's `23505`. The base
 * is still the one in charge —the unique index is the safety net, and there is a
 * real race between two people editing the same record—, so the same
 * clash is told with THE SAME SENTENCE from both sides: see
 * `duplicateMessage`.
 *
 * `exceptId` is the link being corrected: clashing with itself is not
 * clashing.
 */
export function duplicateOf(
  draft: LinkDraft,
  rows: readonly ExternalLinkRow[],
  exceptId: string | null = null,
): ExternalLinkRow | null {
  const clean = trimDraft(draft)
  if (clean.url === '') return null
  const anchored = (row: ExternalLinkRow) =>
    clean.anchor.kind === 'ARTWORK'
      ? row.artwork_id === clean.anchor.id
      : row.image_id === clean.anchor.id
  return (
    rows.find(
      (row) => row.id !== exceptId && row.url === clean.url && anchored(row) && row.active,
    ) ?? null
  )
}

/**
 * The same, but among the WITHDRAWN ones: adding again the one that was withdrawn is a
 * legitimate operation and what it does is give it back (RF-1406).
 *
 * It matters to distinguish them because the unique index is partial on `active`: against
 * a withdrawn one the `insert` does NOT fail, and it would create two rows with the same address in
 * the same record, one active and the other in the wastebasket. Recovering the one that is already there is
 * the right thing —it keeps its note, its history and its check— and it is what
 * `restore` does.
 */
export function retiredTwin(
  draft: LinkDraft,
  rows: readonly ExternalLinkRow[],
): ExternalLinkRow | null {
  const clean = trimDraft(draft)
  if (clean.url === '') return null
  const anchored = (row: ExternalLinkRow) =>
    clean.anchor.kind === 'ARTWORK'
      ? row.artwork_id === clean.anchor.id
      : row.image_id === clean.anchor.id
  return rows.find((row) => row.url === clean.url && anchored(row) && !row.active) ?? null
}

/** The sentence for a repeated address, told with what has to be done. */
export function duplicateMessage(twin: ExternalLinkRow | null): string {
  const collision = 'Esa dirección ya está en esta ficha'
  if (twin === null) {
    // The race: somebody added it while this form was open.
    return `${collision}. Alguien la ha añadido mientras tenías esto abierto: cierra y vuelve a mirar la lista.`
  }
  return `${collision}, como «${linkLabel(twin)}». Si lo que quieres es corregirla, edita ese enlace en vez de añadir otro igual.`
}

// ── Why the base has said no (RF-1403) ───────────────────────

/** What `is_web_url` answers, with the case of nobody answering. */
export type UrlVerdict = 'ACCEPTED' | 'REFUSED' | 'UNKNOWN'

/**
 * A rejection's general sentence. It says what IS accepted, which is the only thing that
 * can be corrected.
 */
export const REFUSAL_GENERAL =
  'La base no acepta esa dirección. Tiene que empezar por http:// o https://, sin espacios.'

/**
 * The characters that are not visible and that inside a site's name are an attack:
 * zero width and company. `is_web_url` closes them with its ASCII whitelist —
 * PostgreSQL's `[[:space:]]` does NOT catch U+200B—, and here they only serve to choose the
 * message. Written by their code, which is the only way of being able to review them.
 */
const INVISIBLE = /[\u00ad\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]/

/** Control characters: `java<tab>script:` has been run by real browsers. */
const CONTROL = /[\u0000-\u001f\u007f]/

/**
 * Why the base has rejected THIS address, in Spanish.
 *
 * ── THIS IS NOT A SECOND COPY OF THE RULE, AND THE DIFFERENCE
 *    IS REAL AND NOT A NUANCE ──────────────────────────────────
 *
 * This function **is only called over an address the base has ALREADY rejected**
 * —`is_web_url` has answered `false`, or the `check` has answered `23514`— and the
 * only thing it does is look at the text to choose which of several sentences explains
 * the rejection best. It cannot accept anything: it has no branch that returns «fine».
 * If no hint fits, it returns the general sentence, so an address
 * rejected for a reason not foreseen here is still explained —worse,
 * but explained—. And if one day `is_web_url` gets stricter, what happens is that
 * some hint stays generic: never that something forbidden gets through.
 *
 * Every hint is measured against the local base, and the two that matter are the ones
 * a new pattern would have let through:
 *
 *   select is_web_url('https://evil.example\.ejemplo.es/')  → false
 *   select is_web_url('https://macvac​.es/')           → false
 */
export function describeUrlRefusal(url: string): string {
  const text = url.trim()

  if (text === '') return 'Pega la dirección de la página, empezando por https://'

  // The scheme first, because it is the rejection seen most often: the text of an
  // e-mail gets pasted, or a protocol-relative address.
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(text)
  if (scheme && !/^https?$/i.test(scheme[1] ?? '')) {
    return (
      `«${scheme[1]}:» no es una dirección de un sitio web y no se guarda en el catálogo. ` +
      'Solo se admiten http:// y https://, y es una lista de lo permitido a propósito: lo que ' +
      'entra aquí acaba siendo un enlace que alguien pulsa.'
    )
  }
  if (text.startsWith('//')) {
    return 'Falta el principio de la dirección: escribe https:// delante del nombre del sitio.'
  }
  if (!/^https?:\/\//i.test(text)) {
    return 'La dirección tiene que empezar por http:// o https://.'
  }

  // Invisible characters BEFORE «it is not ASCII»: a zero width is not visible, so
  // saying «letters that are not ASCII» would send people looking for an ñ that does not exist.
  // Written with their code and not with the character: a source file with a zero
  // width inside a regular expression is precisely what this message denounces,
  // something invisible nobody can review in a diff.
  if (INVISIBLE.test(text)) {
    return (
      'La dirección lleva caracteres invisibles y puede llevar a otro sitio. Escríbela a mano.'
    )
  }
  if (/\s/.test(text)) {
    return 'La dirección lleva un espacio o un salto de línea. Quítalo.'
  }
  if (CONTROL.test(text)) {
    return 'La dirección lleva caracteres de control. Bórrala y vuelve a escribirla a mano.'
  }

  const authority = /^https?:\/\/([^/?#]*)/i.exec(text)?.[1] ?? ''

  if (authority.includes('@')) {
    return (
      'La dirección lleva un @ antes del nombre del sitio, y eso hace que parezca de un sitio y ' +
      'lleve a otro: en «https://www.macvac.es@otro.example/» el sitio real es otro.example. ' +
      'Quédate solo con el nombre del sitio al que quieres ir.'
    )
  }
  if (authority.includes('\\')) {
    return (
      'La dirección lleva una barra invertida en el nombre del sitio, así que el sitio real es lo que hay antes de ella. Cámbiala por una normal.'
    )
  }
  if (/[^\x20-\x7e]/.test(authority)) {
    return (
      'El nombre del sitio lleva letras que no son ASCII. Se guarda en la forma que copia el ' +
      'navegador al pegar: münchen.example se escribe xn--mnchen-3ya.example.'
    )
  }
  if (/^\d{1,3}(\.\d{1,3}){3}(:\d+)?$/.test(authority) || authority.startsWith('[')) {
    return (
      'Una dirección IP no es una fuente que un catálogo pueda citar: mañana es otra máquina. ' +
      'Usa el nombre del sitio.'
    )
  }
  if (authority !== '' && !authority.includes('.')) {
    return (
      `«${authority}» no es el nombre de un sitio de internet: le falta el dominio, como ` +
      '.es o .org. Una dirección de tu propio ordenador no la puede abrir nadie más.'
    )
  }
  if (authority.startsWith('.') || authority.endsWith('.') || authority.includes('..')) {
    return `«${authority}» tiene un punto de más o de menos: revisa el nombre del sitio.`
  }
  if (authority.includes('_')) {
    return `«${authority}» lleva un guion bajo, y el nombre de un sitio no puede llevarlo. Suele ser una errata por un guion normal.`
  }
  if (text.length > 2048) {
    return (
      `La dirección tiene ${text.length} caracteres. Más de 2048 no lo abre ningún navegador: ` +
      'lo más probable es que se haya pegado de más.'
    )
  }
  if (text.length < 11) {
    return 'La dirección está incompleta: falta el nombre del sitio después de https://'
  }

  return REFUSAL_GENERAL
}

/** The same for the archived copy, rejected by the same function of the base. */
export function describeArchiveRefusal(url: string): string {
  return `La dirección de la copia archivada tampoco vale. ${describeUrlRefusal(url)}`
}

// ── The base's answers, translated ───────────────────────────

/** What was being attempted, which is what an unexpected answer has to say. */
export type LinkAction = 'load' | 'add' | 'save' | 'retire' | 'restore' | 'check'

const ATTEMPT: Record<LinkAction, string> = {
  load: 'No se han podido cargar los enlaces de esta obra',
  add: 'No se ha podido añadir el enlace',
  save: 'No se han podido guardar los cambios del enlace',
  retire: 'No se ha podido retirar el enlace',
  restore: 'No se ha podido recuperar el enlace',
  check: 'No se ha podido anotar la comprobación',
}

/**
 * The shape of a failed write, as supabase-js delivers it. Declared
 * narrow so it can be translated with no client: a `PostgrestError` fits.
 */
export interface WriteFailure {
  code?: string | null
  message: string
  hint?: string | null
  details?: string | null
}

/**
 * The Spanish sentence for an answer of the base.
 *
 * Every code is MEASURED against the local base over HTTP, with a cataloguer's
 * session and with a reader's, and not imagined:
 *
 *   {"code":"23514","message":"new row for relation \"external_links\" violates
 *     check constraint \"external_links_url_is_web\""}
 *   {"code":"23514", … \"external_links_title_trimmed\""}
 *   {"code":"23514", … \"external_links_exactly_one_owner\""}
 *   {"code":"23505","message":"duplicate key value violates unique constraint
 *     \"external_links_artwork_url_unique\""}
 *   {"code":"23503","message":"insert or update on table \"external_links\"
 *     violates foreign key constraint \"external_links_artwork_id_fkey\"",
 *    "details":"Key is not present in table \"artworks\"."}
 *   {"code":"42501","message":"new row violates row-level security policy for
 *     table \"external_links\""}
 *   {"code":"P0001","message":"No tienes permiso para comprobar enlaces"}
 *   {"code":"P0001","message":"No existe el enlace que se intenta comprobar"}
 *   {"code":"22P02","message":"invalid input value for enum link_check_status: …"}
 *
 * The `P0001`s arrive WRITTEN IN SPANISH by the function itself for the user and
 * are shown as is: rewriting them here would be a second wording of a
 * sentence that already says the consequence.
 */
export function describeLinkFailure(
  action: LinkAction,
  failure: WriteFailure,
  /**
   * The address that was being stored, when there is one. PostgreSQL **does not
   * return it** in the `check`'s message, so without it the rejection can only
   * be explained in general; with it the specific reason is explained.
   */
  url = '',
): string {
  const code = failure.code ?? ''
  const message = failure.message ?? ''

  // Written in Spanish by the base for whoever catalogues, with its hint if it carries one.
  if (code === 'P0001') {
    const hint = (failure.hint ?? '').trim()
    const sentence = message.trim().replace(/\.$/, '')
    return hint === '' ? `${sentence}.` : `${sentence}. ${hint}`
  }

  if (code === '23514') {
    if (message.includes('external_links_url_is_web')) {
      return url.trim() === '' ? REFUSAL_GENERAL : describeUrlRefusal(url)
    }
    if (message.includes('external_links_archive_url_is_web')) {
      return 'La dirección de la copia archivada no la acepta la base. Revísala o déjala vacía.'
    }
    if (message.includes('external_links_title_trimmed')) {
      // It should not arrive: the draft trims before sending. If it arrives, something
      // skipped `trimDraft`, and saying so is what makes it findable.
      return 'El título llevaba espacios al principio o al final. Vuelve a escribirlo.'
    }
    if (message.includes('external_links_exactly_one_owner')) {
      return (
        'Un enlace tiene que colgar de una sola cosa: de la obra o de una de sus fotografías. ' +
        'Vuelve a elegir de cuál.'
      )
    }
    if (message.includes('external_links_check_pair')) {
      return 'El resultado de la comprobación y su fecha van juntos, y la base ha recibido solo uno.'
    }
    return `${ATTEMPT[action]}: la base ha rechazado el dato. Ha contestado: ${message}`
  }

  if (code === '23505') return duplicateMessage(null)

  if (code === '23503') {
    const of = message.includes('image_id')
      ? 'la fotografía de la que cuelga este enlace ya no está en el catálogo'
      : 'la obra de la que cuelga este enlace ya no está en el catálogo'
    return `${ATTEMPT[action]}: ${of}. Vuelve a cargar la ficha.`
  }

  // A Cataloguer who was one a minute ago and is not any more: the session has expired
  // or their role changed with the screen open.
  if (code === '42501') {
    return `${ATTEMPT[action]}: tu sesión no tiene permiso para escribir en el catálogo. Puede que haya caducado; vuelve a entrar.`
  }

  if (code === '22P02') {
    return `${ATTEMPT[action]}: la base no ha entendido uno de los valores enviados. Ha contestado: ${message}`
  }

  // No code is not a rule saying no, it is that nobody has answered: the
  // request never arrived. Saying so matters because the change was NOT stored, and in a
  // storeroom with no coverage it is the screen's most likely failure.
  if (code === '') {
    return `${ATTEMPT[action]}: no hay conexión con el catálogo. Compruébala y vuelve a intentarlo.`
  }

  return `${ATTEMPT[action]}. La base de datos ha contestado: ${message}`
}

/**
 * A write that has not failed and has not touched any row either.
 *
 * It is not hypothetical and it is measured: with a Reader's session, `PATCH
 * external_links?id=eq.…` answers `200 []` and **not** an error, because the UPDATE
 * policy simply does not let the row that was to be changed be seen. A form
 * that treats that as success tells the user she has stored something that has not been
 * stored, which is the worst possible lie in a catalogue.
 */
export const NOTHING_CHANGED =
  'La base no ha cambiado nada: el enlace sigue igual. Lo normal es que tu sesión no tenga permiso.'

// ── The texts of the two confirmations ───────────────────────

/** Withdrawing is not deleting (RF-901, RF-1406), and the sentence says so before the second tap. */
export function retireConfirmText(link: ExternalLinkRow): string {
  const domain = linkDomain(link.url)
  const where = domain === '' ? 'esa dirección' : domain
  return (
    `¿Retirar «${linkLabel(link)}» (${where})? No se borra: deja de verse en la ficha, se conserva ` +
    'con su nota y su comprobación, y volver a añadir la misma dirección lo devuelve.'
  )
}

/** And the check's question, which is about what the person has just seen. */
export const CHECK_QUESTION =
  'Abre el enlace y vuelve. ¿Qué has visto?'

/** The three answers, with what each one means (RF-1405). */
export const CHECK_OPTIONS: readonly {
  value: LinkCheckStatus
  text: string
  hint: string
}[] = (['WORKING', 'CHANGED', 'BROKEN'] as const).map((value) => ({
  value,
  text: LINK_CHECK_STATUS_LABEL[value],
  hint: LINK_CHECK_STATUS_DESCRIPTION[value],
}))

/**
 * And the fourth answer, which is not one of the three: putting the link back to «sin
 * comprobar».
 *
 * It exists because pressing by mistake is normal and because «it is unchecked
 * again» is a legitimate correction —the RPC sets the three columns to null
 * when the state is null, and so it is in its test—. Without this, a tap on «Ya no
 * está» would be irreversible and the catalogue would have a false datum forever.
 */
export const CHECK_CLEAR_TEXT = 'Volver a «sin comprobar»'
export const CHECK_CLEAR_HINT = 'Borra el resultado, la fecha y el autor de la comprobación'
