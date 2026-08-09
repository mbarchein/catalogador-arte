/**
 * Las notas de texto libre, con las direcciones que traen dentro (RF-1408).
 *
 * ── EL PROBLEMA QUE RESUELVE ────────────────────────────────
 *
 * En una nota se pegan direcciones web, y una dirección no tiene espacios: es
 * una sola palabra de ochenta caracteres. En la columna estrecha de una lista de
 * campos no cabe, y el navegador la saca fuera de la pantalla en vez de partirla.
 * Se arregla por los dos lados: **el contenido de la nota va a ancho completo**
 * —eso lo hace el componente— y **la dirección se enseña acortada**, que es lo de
 * aquí.
 *
 * ── QUÉ SE ACORTA Y QUÉ NO ──────────────────────────────────
 *
 * El dominio **entero, siempre**, y se recorta por el final. El motivo no es de
 * estilo: enseñar un trozo de dirección que se lea como otro sitio del que de
 * verdad es sería suplantación, que es lo mismo que `linkDomain` existe para
 * evitar en el bloque de enlaces —`https://macvac.es@evil.example/` se lee como
 * del MACVA y va a otra parte—. Por eso se usa esa misma función, y por eso una
 * dirección que no reconozca **se enseña entera**: larga y fea, pero verdadera.
 */

import { linkDomain } from './links/externalLinks'

/** Cuántos caracteres de dirección se enseñan antes de cortar. */
export const NOTE_LINK_MAX = 34

/** Un trozo de nota: texto corriente, o una dirección con su destino. */
export interface NoteSegment {
  text: string
  /** La dirección completa a la que va, o null si es texto corriente. */
  href: string | null
}

/**
 * Signos que suelen cerrar una frase y no formar parte de la dirección.
 *
 * «Véase https://ejemplo.es/obra.» acaba en punto, y el punto es de la frase. Se
 * quitan del final, uno a uno, para que el enlace vaya a donde se escribió.
 */
const TRAILING = /[.,;:!?)\]}»"']+$/

const URL_IN_TEXT = /https?:\/\/[^\s<>"']+/gi

/**
 * Cómo se lee una dirección dentro de una nota.
 *
 * Sin `https://` ni `www.`, que no dicen nada y ocupan; el dominio entero y
 * después tanto camino como quepa. Una dirección cuyo dominio no se reconoce
 * vuelve tal cual: cortarla podría enseñar como destino algo que no lo es.
 */
export function shortLinkText(url: string, max: number = NOTE_LINK_MAX): string {
  const domain = linkDomain(url)
  if (domain === '') return url

  const authority = /^https?:\/\/[^/?#]*/i.exec(url)?.[0] ?? ''
  const rest = url.slice(authority.length)
  const whole = domain + rest
  if (whole.length <= max) return whole

  // El dominio nunca se recorta: es la parte que contesta «¿de quién es esto?».
  const room = Math.max(0, max - domain.length - 1)
  return `${domain}${rest.slice(0, room)}…`
}

/**
 * La nota partida en texto y direcciones, en orden y sin perder nada.
 *
 * Lo que se devuelve, concatenando los `text`, **no** es la nota original: las
 * direcciones salen acortadas, que es el objetivo. La original viaja en `href`.
 */
export function noteSegments(note: string): NoteSegment[] {
  const segments: NoteSegment[] = []
  let at = 0

  for (const found of note.matchAll(URL_IN_TEXT)) {
    const raw = found[0]
    const start = found.index
    // El signo de cierre pegado a la dirección es de la frase, no del enlace.
    const trailing = TRAILING.exec(raw)?.[0] ?? ''
    const url = raw.slice(0, raw.length - trailing.length)
    if (url === '') continue

    if (start > at) segments.push({ text: note.slice(at, start), href: null })
    segments.push({ text: shortLinkText(url), href: url })
    if (trailing !== '') segments.push({ text: trailing, href: null })
    at = start + raw.length
  }

  if (at < note.length) segments.push({ text: note.slice(at), href: null })
  return segments
}
