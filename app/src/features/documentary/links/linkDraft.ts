/**
 * Escribir un enlace: qué se manda, qué se puede decir antes de mandarlo, y qué
 * frase en español corresponde a cada respuesta de la base (RF-1401 a RF-1406).
 *
 * ── LA REGLA DE LA DIRECCIÓN NO ESTÁ AQUÍ, Y ESO ES EL PUNTO ─
 *
 * `is_web_url` es la única línea del sistema que dice que NO a una dirección, vive
 * en la base y **el cliente la llama** (`grant execute ... to authenticated`, y
 * comprobado por HTTP contra la base local). Este módulo no lleva ni un patrón de
 * URL propio, y no por elegancia: la función de la base cierra dos ataques que un
 * patrón nuevo volvería a dejar pasar —la BARRA INVERTIDA en el anfitrión, que el
 * navegador trata como barra (`https://evil.example\.ejemplo.es/`), y los
 * caracteres de ancho cero dentro del nombre del sitio, que `[[:space:]]` no
 * caza— y una segunda copia de la regla es una copia que se queda atrás. Un `check`
 * que llama a una función tampoco revalida las filas viejas cuando la función
 * cambia, así que el día que la base se endurezca la pantalla no tiene nada que
 * seguir.
 *
 * Lo que sí es de este lado es **contar por qué**: PostgreSQL contesta
 * `violates check constraint "external_links_url_is_web"`, y eso no se le muestra
 * a nadie. Ver `describeUrlRefusal`.
 */

import type { ExternalLinkType, LinkCheckStatus } from '../../../lib/types'
import { LINK_CHECK_STATUS_DESCRIPTION, LINK_CHECK_STATUS_LABEL } from '../../../lib/types'
import { linkDomain, linkLabel, type ExternalLinkRow } from './externalLinks'

// ── El borrador ──────────────────────────────────────────────

/** De qué ficha cuelga el enlace. El arco es exclusivo: exactamente una (RF-1401). */
export type LinkAnchor =
  | { readonly kind: 'ARTWORK'; readonly id: string }
  | { readonly kind: 'IMAGE'; readonly id: string }

export interface LinkDraft {
  readonly anchor: LinkAnchor
  readonly url: string
  readonly title: string
  /** Cadena vacía es «sin clasificar» en el formulario, y viaja como nulo (RF-1402). */
  readonly linkType: ExternalLinkType | ''
  readonly note: string
  /** La copia que **una persona** guardó en un archivo público. La aplicación no archiva nada (RF-1404). */
  readonly archiveUrl: string
}

export function emptyDraft(anchor: LinkAnchor): LinkDraft {
  return { anchor, url: '', title: '', linkType: '', note: '', archiveUrl: '' }
}

/** El borrador de un enlace que ya existe, para corregirlo sin volver a escribirlo. */
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
 * El borrador con los espacios de los extremos quitados, que es lo que se valida
 * **y** lo que se guarda.
 *
 * Que sean el mismo texto no es un detalle. La base RECHAZA una dirección con
 * espacios en los extremos en vez de recortarla, y su migración dice por qué: «
 * javascript:alert(1)» con un espacio delante lo ejecuta el navegador, que
 * recorta, y lo deja pasar cualquier comparación ingenua que no recorte antes. Del
 * lado del cliente el recorte es del CAMPO —pegar en un móvil arrastra un salto de
 * línea con una facilidad asombrosa— y se hace ANTES de preguntar a la base, así
 * que lo que se valida es exactamente lo que se manda. Nada se cuela por aquí:
 * después del recorte, «javascript:alert(1)» sigue siendo rechazado por la lista
 * blanca de esquemas, que es de la base.
 *
 * El título se recorta porque la base lo exige (`external_links_title_trimmed`);
 * la nota, porque es lo que hace cualquier campo de texto de este proyecto. De
 * ninguno de los dos se toca el interior.
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

/** Lo que viaja al `insert`. Las tres columnas de comprobación no se mandan: las congela la base (RF-1405). */
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
 * Lo que viaja al `update`.
 *
 * **El ancla no va**, y no es un olvido: mover un enlace de una obra a una
 * fotografía es cambiar de qué ficha cuelga, y eso no es corregir una dirección.
 * Si alguna vez hace falta, se retira y se añade donde toca, que además deja la
 * traza de las dos cosas.
 */
export function updatePayload(draft: LinkDraft): Record<string, string | null> {
  const { artwork_id: _artwork, image_id: _image, ...rest } = insertPayload(draft)
  return rest
}

// ── Lo que se puede decir sin preguntar a la base ────────────

/**
 * El único problema que este lado decide solo: que no hay dirección.
 *
 * No es una regla sobre la forma de una URL —de eso no hay ni una línea aquí—,
 * es que el campo está vacío. Sirve para tener el botón apagado en vez de mandar
 * una petición que ya se sabe que no lleva nada.
 */
export function missingUrl(draft: LinkDraft): boolean {
  return trimDraft(draft).url === ''
}

/**
 * La misma dirección, otra vez, en la misma ficha (RF-1406).
 *
 * Se predice con lo que el bloque ya tiene cargado para poder contarlo en el acto
 * y con lo que hay que hacer, en vez de esperar el `23505` de la base. La base
 * sigue siendo la que manda —el índice único es la red de seguridad, y hay una
 * carrera real entre dos personas editando la misma ficha—, así que el mismo
 * choque se cuenta con LA MISMA FRASE desde los dos lados: ver
 * `duplicateMessage`.
 *
 * `exceptId` es el enlace que se está corrigiendo: chocar consigo mismo no es
 * chocar.
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
 * Lo mismo, pero entre los RETIRADOS: volver a añadir el que se retiró es una
 * operación legítima y lo que hace es devolverlo (RF-1406).
 *
 * Importa distinguirlos porque el índice único es parcial sobre `active`: contra
 * un retirado el `insert` NO falla, y crearía dos filas con la misma dirección en
 * la misma ficha, una activa y otra en la papelera. Recuperar la que ya está es
 * lo correcto —conserva su nota, su historia y su comprobación— y es lo que hace
 * `restore`.
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

/** La frase de una dirección repetida, contada con lo que hay que hacer. */
export function duplicateMessage(twin: ExternalLinkRow | null): string {
  const collision = 'Esa dirección ya está en esta ficha'
  if (twin === null) {
    // La carrera: alguien la añadió mientras este formulario estaba abierto.
    return `${collision}. Alguien la ha añadido mientras tenías esto abierto: cierra y vuelve a mirar la lista.`
  }
  return `${collision}, como «${linkLabel(twin)}». Si lo que quieres es corregirla, edita ese enlace en vez de añadir otro igual.`
}

// ── Por qué la base ha dicho que no (RF-1403) ────────────────

/** Lo que contesta `is_web_url`, con el caso de que no contestara nadie. */
export type UrlVerdict = 'ACCEPTED' | 'REFUSED' | 'UNKNOWN'

/**
 * La frase general de un rechazo. Dice lo que SÍ se admite, que es lo único que
 * se puede corregir.
 */
export const REFUSAL_GENERAL =
  'La base no acepta esa dirección. Tiene que empezar por http:// o https:// y seguir con el ' +
  'nombre de un sitio web —letras, cifras y guiones separados por puntos, como www.macvac.es—, ' +
  'sin espacios y sin nada raro en medio.'

/**
 * Los caracteres que no se ven y que dentro del nombre de un sitio son un ataque:
 * el ancho cero y compañía. `is_web_url` los cierra con su lista blanca ASCII —
 * `[[:space:]]` de PostgreSQL NO caza U+200B—, y aquí solo sirven para elegir el
 * mensaje. Escritos por su código, que es la única forma de poder revisarlos.
 */
const INVISIBLE = /[\u00ad\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]/

/** Caracteres de control: `java<tab>script:` lo han ejecutado navegadores reales. */
const CONTROL = /[\u0000-\u001f\u007f]/

/**
 * Por qué la base ha rechazado ESTA dirección, en español.
 *
 * ── ESTO NO ES UNA SEGUNDA COPIA DE LA REGLA, Y LA DIFERENCIA
 *    ES DE VERDAD Y NO DE MATIZ ────────────────────────────────
 *
 * Esta función **solo se llama sobre una dirección que la base YA ha rechazado**
 * —`is_web_url` ha contestado `false`, o el `check` ha contestado `23514`— y lo
 * único que hace es mirar el texto para elegir cuál de varias frases explica
 * mejor el rechazo. No puede aceptar nada: no tiene rama que devuelva «vale».
 * Si ninguna pista encaja, devuelve la frase general, así que una dirección
 * rechazada por un motivo que aquí no se ha previsto se sigue explicando —peor,
 * pero se explica—. Y si un día `is_web_url` se endurece, lo que pasa es que
 * alguna pista se queda genérica: nunca que algo prohibido pase.
 *
 * Cada pista está medida contra la base local, y las dos que importan son las que
 * un patrón nuevo habría dejado pasar:
 *
 *   select is_web_url('https://evil.example\.ejemplo.es/')  → false
 *   select is_web_url('https://macvac​.es/')           → false
 */
export function describeUrlRefusal(url: string): string {
  const text = url.trim()

  if (text === '') return 'Pega la dirección de la página, empezando por https://'

  // El esquema, primero, porque es el rechazo que más veces se ve: se pega el
  // texto de un correo, o una dirección relativa al protocolo.
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
    return 'La dirección tiene que empezar por http:// o https://. Pégala tal como la copia el navegador.'
  }

  // Caracteres invisibles ANTES que «no es ASCII»: un ancho cero no se ve, así
  // que decir «letras que no son ASCII» mandaría a buscar una eñe que no existe.
  // Escritos con su código y no con el carácter: un fichero fuente con un ancho
  // cero dentro de una expresión regular es justo lo que este mensaje denuncia,
  // algo invisible que nadie puede revisar en una diferencia.
  if (INVISIBLE.test(text)) {
    return (
      'La dirección lleva caracteres invisibles dentro. Se cuelan al copiar de un PDF o de un ' +
      'correo, no se ven y llevan a otro sitio del que parece: bórrala y vuelve a escribirla a mano.'
    )
  }
  if (/\s/.test(text)) {
    return 'La dirección lleva un espacio o un salto de línea. Quítalo: ninguna dirección legítima los lleva sin escapar.'
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
      'La dirección lleva una barra invertida en el nombre del sitio. El navegador la trata como ' +
      'una barra normal, así que el sitio real es lo que hay antes de ella y no lo que parece el ' +
      'dominio. Cámbiala por una barra normal si es parte de la ruta.'
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

/** Lo mismo para la copia archivada, que se rechaza por la misma función de la base. */
export function describeArchiveRefusal(url: string): string {
  return `La dirección de la copia archivada tampoco vale. ${describeUrlRefusal(url)}`
}

// ── Las respuestas de la base, traducidas ────────────────────

/** Lo que se estaba intentando, que es lo que una respuesta inesperada tiene que decir. */
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
 * La forma de una escritura fallida, tal como la entrega supabase-js. Declarada
 * estrecha para poder traducir sin cliente: un `PostgrestError` encaja.
 */
export interface WriteFailure {
  code?: string | null
  message: string
  hint?: string | null
  details?: string | null
}

/**
 * La frase en español de una respuesta de la base.
 *
 * Todos los códigos están MEDIDOS contra la base local por HTTP, con la sesión de
 * un catalogador y con la de un lector, y no imaginados:
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
 * Los `P0001` llegan ESCRITOS EN ESPAÑOL por la propia función para la usuaria y
 * se muestran tal cual: reescribirlos aquí sería una segunda redacción de una
 * frase que ya dice la consecuencia.
 */
export function describeLinkFailure(
  action: LinkAction,
  failure: WriteFailure,
  /**
   * La dirección que se intentaba guardar, cuando la hay. PostgreSQL **no la
   * devuelve** en el mensaje del `check`, así que sin ella el rechazo solo se
   * puede explicar en general; con ella se explica el motivo concreto.
   */
  url = '',
): string {
  const code = failure.code ?? ''
  const message = failure.message ?? ''

  // Escrito en español por la base para quien cataloga, con su pista si la trae.
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
      // No debería llegar: el borrador recorta antes de mandar. Si llega, algo se
      // saltó `trimDraft`, y decirlo así es lo que permite encontrarlo.
      return 'El título llevaba espacios al principio o al final y la base no los admite. Vuelve a escribirlo.'
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

  // Un Catalogador que lo era hace un minuto y ya no lo es: la sesión ha caducado
  // o su papel cambió con la pantalla abierta.
  if (code === '42501') {
    return `${ATTEMPT[action]}: tu sesión no tiene permiso para escribir en el catálogo. Puede que haya caducado; vuelve a entrar.`
  }

  if (code === '22P02') {
    return `${ATTEMPT[action]}: la base no ha entendido uno de los valores enviados. Ha contestado: ${message}`
  }

  // Ningún código no es una regla diciendo que no, es que nadie ha contestado: la
  // petición no llegó. Decirlo importa porque el cambio NO se guardó, y en un
  // almacén sin cobertura es el fallo más probable de la pantalla.
  if (code === '') {
    return `${ATTEMPT[action]}: no hay conexión con el catálogo. Compruébala y vuelve a intentarlo.`
  }

  return `${ATTEMPT[action]}. La base de datos ha contestado: ${message}`
}

/**
 * Una escritura que no ha fallado y tampoco ha tocado ninguna fila.
 *
 * No es hipotético y está medido: con la sesión de un Lector, `PATCH
 * external_links?id=eq.…` contesta `200 []` y **no** un error, porque la política
 * de UPDATE simplemente no deja ver la fila que se quería cambiar. Un formulario
 * que trate eso como éxito le dice a la usuaria que ha guardado algo que no se ha
 * guardado, que es la peor de las mentiras posibles en un catálogo.
 */
export const NOTHING_CHANGED =
  'La base ha aceptado la petición pero no ha cambiado nada, así que el enlace sigue como estaba. ' +
  'Lo normal es que tu sesión ya no tenga permiso para editar: vuelve a entrar y compruébalo.'

// ── Los textos de las dos confirmaciones ─────────────────────

/** Retirar no es borrar (RF-901, RF-1406), y la frase lo dice antes del segundo toque. */
export function retireConfirmText(link: ExternalLinkRow): string {
  const domain = linkDomain(link.url)
  const where = domain === '' ? 'esa dirección' : domain
  return (
    `¿Retirar «${linkLabel(link)}» (${where})? No se borra: deja de verse en la ficha, se conserva ` +
    'con su nota y su comprobación, y volver a añadir la misma dirección lo devuelve.'
  )
}

/** Y la pregunta de la comprobación, que es sobre lo que la persona acaba de ver. */
export const CHECK_QUESTION =
  'Abre el enlace y vuelve. ¿Qué has visto?'

/** Las tres respuestas, con lo que significa cada una (RF-1405). */
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
 * Y la cuarta respuesta, que no es una de las tres: devolver el enlace a «sin
 * comprobar».
 *
 * Existe porque equivocarse al pulsar es normal y porque «vuelve a estar sin
 * comprobar» es una corrección legítima —la RPC pone las tres columnas a nulo
 * cuando el estado es nulo, y así está en su test—. Sin esto, un toque en «Ya no
 * está» sería irreversible y el catálogo tendría un dato falso para siempre.
 */
export const CHECK_CLEAR_TEXT = 'Volver a «sin comprobar»'
export const CHECK_CLEAR_HINT = 'Borra el resultado, la fecha y el autor de la comprobación'
