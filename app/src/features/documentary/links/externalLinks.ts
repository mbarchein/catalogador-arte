/**
 * Los enlaces a sitios externos de una ficha, convertidos en algo que se lee y
 * se pulsa (RF-1401 a RF-1408).
 *
 * Este módulo es la mitad de LECTURA: qué se ve de cada enlace, en qué orden,
 * agrupado cómo, y qué dice el bloque cuando no hay ninguno. La mitad de
 * ESCRITURA —validar, guardar y explicar un rechazo— vive en `linkDraft.ts`.
 *
 * Aquí no hay React ni red, y no es aseo: la batería corre en node y no puede
 * abrir un componente, así que todo lo que decide algo tiene que ser alcanzable
 * sin DOM. Lo que queda en el JSX es maquetación.
 *
 * ── LO QUE ESTE MÓDULO NO HACE, Y ES UN REQUISITO ───────────
 *
 * No trae NADA del sitio enlazado (RF-1404): ni icono, ni título, ni
 * previsualización, ni comprobación automática. Cada una de esas cosas le
 * contaría a un tercero qué obra se está catalogando y desde qué dirección. Y sin
 * servidor de aplicación un rastreador además mentiría: lo que un navegador puede
 * comprobar desde el cliente es «me han dejado pedir esto», no «esa página sigue
 * mostrando lo que documentaba».
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
 * Un enlace tal como lo devuelve la consulta del bloque.
 *
 * `created_at` no está en `ExternalLink` porque la ficha no lo enseña, y aquí sí
 * hace falta: el orden dentro de un tipo es el de alta (la tabla no lleva
 * `sort_order` a propósito, y reordenar a mano no lo ha pedido nadie).
 */
export interface ExternalLinkRow extends ExternalLink {
  readonly created_at: string
}

/** Una fotografía de la obra, con lo justo para nombrarla y para el par de RF-1407. */
export interface PhotoRef {
  readonly image_id: string
  readonly shot_type: ShotTypeValue
  readonly sort_order: number
  readonly provenance: PhotoProvenance
  readonly active: boolean
}

// ── El destino, que se ve antes de tocar (RF-1408) ───────────

/**
 * El nombre del sitio, y **el mismo trozo de la dirección que miró la base**.
 *
 * `is_web_url` extrae la autoridad con `^https?://([^/?#]*)`, así que esta
 * función corta por ahí y no por su cuenta. Importa que sea el mismo corte: si
 * aquí se enseñara como dominio una parte distinta de la que la base validó,
 * la pantalla estaría afirmando un destino que no es el destino. Esa es
 * exactamente la suplantación que la lista blanca de la base existe para cerrar
 * —`https://macvac.es@evil.example/` se lee como del MACVA y va a otro sitio—, y
 * repetirla en la capa de dibujo la reabriría por el otro lado.
 *
 * Devuelve cadena vacía cuando no reconoce un nombre de sitio llano. Es
 * deliberado y es el lado seguro: quien llama enseña entonces la dirección
 * entera, que es larga y fea pero verdadera. **Esto no valida nada** y no decide
 * si un enlace se puede guardar: eso solo lo dice `is_web_url` en la base.
 */
export function linkDomain(url: string): string {
  const authority = /^https?:\/\/([^/?#]*)/i.exec(url)?.[1] ?? ''
  const host = authority.toLowerCase()
  // La misma forma que exige la base: etiquetas ASCII separadas por puntos, un
  // dominio de primer nivel de dos letras o más y un puerto opcional. Si no
  // encaja, no se enseña un dominio inventado.
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}(:\d{1,5})?$/.test(host)) {
    return ''
  }
  // `www.` se quita solo para leer: no dice nada y ocupa cuatro caracteres de una
  // pantalla estrecha. La dirección que se guarda y a la que se va no se toca.
  return host.startsWith('www.') ? host.slice(4) : host
}

/**
 * Lo que se lee del enlace, y **nunca un hueco** (RF-304, RF-1408).
 *
 * El título si lo tiene; si no, el dominio, que es la única pregunta que se hace
 * antes de pulsar. La dirección entera solo como último recurso, cuando ni
 * siquiera se reconoce un dominio: en la pantalla de un móvil ocupa tres líneas,
 * pero es la verdad, y callarse dejaría un enlace sin nada que tocar.
 */
export function linkLabel(link: Pick<ExternalLinkRow, 'title' | 'url'>): string {
  const title = link.title.trim()
  if (title !== '') return title
  const domain = linkDomain(link.url)
  return domain !== '' ? domain : link.url
}

/**
 * Lo que se enseña DEBAJO de la etiqueta para que el destino se vea antes de
 * tocar.
 *
 * Devuelve null cuando la etiqueta ya es el destino —un enlace sin título se
 * llama por su dominio— porque repetirlo dos veces en dos tamaños de letra no
 * añade información y roba una línea.
 */
export function linkDestination(link: Pick<ExternalLinkRow, 'title' | 'url'>): string | null {
  const domain = linkDomain(link.url)
  if (domain === '') return null
  return linkLabel(link) === domain ? null : domain
}

/** La clase de sitio. Nulo es «Sin clasificar», que **no** es `OTHER` (RF-1402, RF-205). */
export function linkTypeText(type: ExternalLinkType | null): string {
  return type === null ? 'Sin clasificar' : EXTERNAL_LINK_TYPE_LABEL[type]
}

// ── El recuento y el bloque vacío ────────────────────────────

/**
 * `3 enlaces`, `1 enlace`, `Ninguno registrado`.
 *
 * El recuento va en la cabecera del bloque plegado, así que es lo ÚNICO que se
 * lee antes de decidir si abrirlo, y el caso vacío es una frase y no un cero:
 * «0 enlaces» se lee como una respuesta sobre la obra, y no lo es.
 */
export function linkCountText(count: number): string {
  if (count <= 0) return 'Ninguno registrado'
  return count === 1 ? '1 enlace' : `${count} enlaces`
}

/**
 * Lo que dice el bloque cuando no hay ningún enlace.
 *
 * Como el bloque de obras relacionadas, este **no lleva estado de investigación**
 * en `artworks`, y el texto del vacío tiene que cargar con eso: aquí nadie puede
 * declarar «investigado, sin resultados», así que la frase no puede insinuar que
 * la ausencia signifique que no hay nada en internet sobre esta obra.
 */
export const EMPTY_TEXT =
  'Sin enlaces registrados. Este bloque no lleva estado de investigación: que esté vacío no ' +
  'dice si se ha buscado o no, solo que nadie ha pegado todavía una dirección aquí.'

/** Y dónde se añade uno, para que el vacío no sea un callejón sin salida. */
export const EMPTY_HINT_READONLY =
  'Los enlaces se añaden desde la zona de edición de la ficha.'

// ── El estado de comprobación (RF-1405) ─────────────────────

/** El color de la etiqueta de comprobación. Los mismos cuatro tonos que ya habla la ficha. */
export type CheckTone = 'unchecked' | 'working' | 'changed' | 'broken'

export interface CheckBadge {
  /** Lo que se lee en la etiqueta. Nunca vacío. */
  readonly label: string
  readonly tone: CheckTone
  /** Cuándo se comprobó, o por qué no consta. Null cuando no hay nada que añadir. */
  readonly detail: string | null
  /** La comprobación es vieja: la etiqueta sigue siendo la que es, pero envejecida. */
  readonly stale: boolean
}

/**
 * A partir de cuántos días una comprobación deja de decir mucho.
 *
 * Un año, y el número tiene argumento: una página de museo que lleva doce meses
 * sin mirarse no es una página rota —decir eso sería inventar el dato que RF-1405
 * protege— pero tampoco es un «funciona» de hoy. Lo que se hace con el aviso es
 * ordenar el trabajo de quien revisa, no afirmar nada sobre el sitio.
 */
export const STALE_DAYS = 365

/** Días enteros entre dos momentos, o null si la fecha no se puede leer. */
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
 * El estado de comprobación de un enlace, tal como se lee en la ficha.
 *
 * **«Sin comprobar» es el cuarto estado y no es «roto».** Va en tono neutro y no
 * en rojo, y lo dice con palabras: un enlace recién pegado no está roto, es que
 * nadie ha vuelto a abrirlo. Pintar de rojo el estado en el que nace todo enlace
 * enseña al ojo a saltárselo, que es como se pierde el aviso del que sí está
 * roto.
 *
 * `CHANGED` es ámbar y no rojo por lo mismo: la página carga, así que el enlace
 * lleva a algún sitio; lo que ha cambiado es lo que documentaba, y eso es trabajo
 * pendiente y no un error.
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
  // La base garantiza el par —resultado y fecha van juntos o no van
  // (`external_links_check_pair`)—, así que una fecha ilegible aquí es un dato
  // corrupto y no un caso normal: se dice en vez de callarlo.
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

/** Un enlace retirado sigue leyéndose, y se dice que lo está (RF-901, RF-1406). */
export function retiredNotice(link: Pick<ExternalLinkRow, 'active'>): string | null {
  return link.active
    ? null
    : 'Retirado del catálogo. Se sigue viendo porque puedes editar; quien solo consulta no lo ve.'
}

// ── El orden y los grupos ────────────────────────────────────

/**
 * El orden de los tipos en pantalla, que es el del enumerado de la base y no el
 * alfabético del español: agrupa por cercanía —museo, catálogo, base de datos—
 * antes que por la letra con la que empieza la traducción.
 *
 * «Sin clasificar» va al final, después de `OTHER`: son los que están esperando
 * que alguien los mire, y ese es el sitio de una tarea pendiente en una lista que
 * se lee de arriba abajo.
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
 * Las nueve opciones de clase que se ofrecen al guardar, y la primera es la
 * ausencia.
 *
 * «Sin clasificar» ES una opción y va PRIMERA porque es el valor con el que nace
 * un enlace pegado con una mano: exigir clasificar al pegar rompe la captura
 * (RNF-106, RF-1408). Y no es «Otro»: `OTHER` significa que alguien lo miró y no
 * encajaba, que es un dato (RF-1402, y la excepción a RF-205 que el documento de
 * requisitos ya recoge).
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
 * Los enlaces ordenados: **lo activo antes que lo retirado**, luego por tipo y
 * luego por fecha de alta.
 *
 * Lo retirado al final y no intercalado, aunque solo lo vea quien edita: una
 * lista donde lo vigente y lo retirado se alternan obliga a leer la etiqueta de
 * cada línea para saber qué consta hoy.
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

/** Los enlaces de una fotografía, con la fotografía nombrada. */
export interface PhotoLinkGroup {
  readonly imageId: string
  /** «General», «Reverso»… y la posición, que es como se nombra una toma en la galería. */
  readonly title: string
  /** Que la toma esté retirada, o que venga de otro catálogo. Null si no hay nada que decir. */
  readonly notice: string | null
  readonly links: readonly ExternalLinkRow[]
}

export interface LinkGroups {
  /** Los que cuelgan de la obra. */
  readonly artwork: readonly ExternalLinkRow[]
  /** Los que cuelgan de una fotografía de esta obra, agrupados por toma. */
  readonly photos: readonly PhotoLinkGroup[]
  /** Total de enlaces ACTIVOS, que es lo que cuenta la cabecera. */
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

/** Lo que hay que advertir de la toma de la que cuelga un enlace. */
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

  // El orden de los grupos es el de la galería, y las tomas que no se conocen van
  // al final: no se puede colocar en la secuencia lo que no tiene posición.
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

// ── El par que cierra RF-1407 ────────────────────────────────

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
