// Lectura del listado de objetos del almacén, para saber cuánto ocupa.
//
// Sin Deno y sin red, como `multipart.ts` y por el mismo motivo: aquí no hay
// forma de ejecutar tests, y la suite del frontend sí importa este módulo. Lo
// que se puede equivocar de verdad —contar mal, o dar por terminado un listado
// que sigue— queda cubierto ahí.
//
// ── POR QUÉ SE CUENTAN LAS VERSIONES ────────────────────────
//
// El bucket conserva todas las versiones a propósito (infra/b2.tf): un máster es
// el documento, y una sobrescritura tiene que ser recuperable. Eso significa que
// el almacén cobra por lo que hay guardado, no por lo que se ve: un listado de
// objetos corrientes diría menos de lo que se está pagando, y una cifra que dice
// de menos en la pantalla que sirve para no quedarse sin sitio es peor que no
// tenerla. Por eso se pide `?versions`, que es lo que devuelve también las
// anteriores.

/** Un tramo del listado, ya sumado, y por dónde sigue. */
export interface UsagePage {
  bytes: number
  objects: number
  /** Los dos marcadores con los que se pide el tramo siguiente, o null si no hay. */
  next: { keyMarker: string; versionIdMarker: string } | null
}

/**
 * Cuántos tramos se piden como mucho.
 *
 * Cada uno son mil objetos, así que esto son doscientos mil ficheros: muy por
 * encima de lo que este catálogo va a tener, y aun así un tope, porque un bucle
 * que pagina contra un servicio remoto sin límite es un bucle que un día no
 * termina. Cuando se alcanza, la respuesta lo DICE en vez de dar la suma parcial
 * por total: ver `truncated` en la función Edge.
 */
export const MAX_USAGE_PAGES = 200

function tag(xml: string, name: string): string | null {
  const found = new RegExp(`<${name}>([^<]*)</${name}>`).exec(xml)
  return found === null ? null : found[1]!
}

/**
 * Suma un tramo del listado y dice por dónde continuar.
 *
 * Las marcas de borrado no traen `<Size>` y por eso no suman: no ocupan.
 */
export function usagePage(xml: string): UsagePage {
  let bytes = 0
  let objects = 0
  for (const found of xml.matchAll(/<Size>(\d+)<\/Size>/g)) {
    bytes += Number(found[1])
    objects += 1
  }

  const truncated = tag(xml, 'IsTruncated') === 'true'
  const keyMarker = tag(xml, 'NextKeyMarker')
  const versionIdMarker = tag(xml, 'NextVersionIdMarker')

  // Truncado pero sin marcador es un listado que no dice por dónde sigue: se
  // trata como terminado en vez de repetir el mismo tramo para siempre.
  const next =
    truncated && keyMarker !== null && versionIdMarker !== null
      ? { keyMarker, versionIdMarker }
      : null

  return { bytes, objects, next }
}
