/**
 * Las secciones de un dossier: qué obras lleva cada una, cómo se mueve una entera,
 * y cómo se agrupan solas por serie (RF-1619, RF-1620, RF-1623).
 *
 * **La pertenencia es implícita y se deduce de la posición**: una sección son su
 * rótulo y todo lo que viene detrás hasta el siguiente rótulo. No hay ninguna
 * columna que lo diga, así que este módulo es el único sitio donde eso se
 * interpreta — y por lo tanto el único que hay que leer para saber qué es una
 * sección en esta aplicación.
 *
 * Puro, como todo lo que decide en esta función.
 */

import type { DossierItemRow } from './dossierItems'
import { sortItems } from './dossierItems'

/** Un grupo de la lista: su rótulo —o ninguno— y los elementos que le pertenecen. */
export interface DossierGroup {
  /** El identificador del elemento SECTION, o null en el grupo de las huérfanas. */
  sectionId: string | null
  /** El rótulo, o null cuando el grupo es el de lo que va antes de la primera sección. */
  heading: string | null
  /** La entradilla de la sección. Vacía cuando no hay. */
  body: string
  /** Si el rótulo se lleva una página propia en el PDF. */
  dividerPage: boolean
  /** Los elementos del grupo, sin contar el propio rótulo, en su orden. */
  items: DossierItemRow[]
  /** Cuántas OBRAS activas lleva, que es lo que se cuenta al lado del rótulo. */
  artworkCount: number
}

/**
 * Los grupos de un dossier, en orden.
 *
 * El primer grupo puede no tener rótulo, y ese caso tiene nombre: son las
 * **huérfanas**, lo que está antes de la primera sección. No es un error —un
 * dossier sin secciones es un solo grupo sin rótulo— pero cuando ya hay secciones
 * conviene que se vea, porque es lo que se manda sin querer en el limbo del
 * principio.
 *
 * Los elementos retirados entran en su grupo: la lista los pinta en gris y siguen
 * perteneciendo a donde estaban.
 */
export function dossierGroups(rows: readonly DossierItemRow[]): DossierGroup[] {
  const groups: DossierGroup[] = []
  let current: DossierGroup | null = null

  for (const row of sortItems(rows)) {
    if (row.kind === 'SECTION') {
      // Una sección retirada deja de agrupar: sus obras pasan a la sección
      // anterior, que es lo que se ve en el PDF —el rótulo no se imprime— y por
      // tanto lo que la pantalla tiene que enseñar.
      if (!row.active) {
        if (current !== null) current.items.push(row)
        continue
      }
      current = {
        sectionId: row.id,
        heading: row.heading.trim(),
        body: row.body.trim(),
        dividerPage: row.divider_page === true,
        items: [],
        artworkCount: 0,
      }
      groups.push(current)
      continue
    }

    if (current === null) {
      current = {
        sectionId: null,
        heading: null,
        body: '',
        dividerPage: false,
        items: [],
        artworkCount: 0,
      }
      groups.push(current)
    }
    current.items.push(row)
    if (row.kind === 'ARTWORK' && row.active) current.artworkCount += 1
  }

  return groups
}

/** `4 obras`, `1 obra`, y «vacía» cuando la sección no lleva ninguna todavía. */
export function groupCountText(group: DossierGroup): string {
  if (group.artworkCount === 0) return 'sin obras'
  return group.artworkCount === 1 ? '1 obra' : `${group.artworkCount} obras`
}

/**
 * El aviso de las obras huérfanas, o null cuando no hay nada que avisar.
 *
 * Solo cuando hay secciones: sin ninguna, «antes de la primera sección» es el
 * dossier entero y decirlo sería ruido. Y no es un error — se puede querer una
 * obra de apertura antes de cualquier rótulo—, así que es un aviso y no una
 * negativa.
 */
export function orphanNotice(groups: readonly DossierGroup[]): string | null {
  const hasSections = groups.some((group) => group.sectionId !== null)
  if (!hasSections) return null
  const first = groups[0]
  if (first === undefined || first.sectionId !== null) return null
  const count = first.artworkCount
  if (count === 0) return null
  return count === 1
    ? '1 obra va antes de la primera sección. Sale en el PDF, pero sin rótulo.'
    : `${count} obras van antes de la primera sección. Salen en el PDF, pero sin rótulo.`
}

/**
 * El orden después de mover una sección ENTERA un puesto arriba o abajo, o null
 * cuando no hay nada que mover.
 *
 * «Un puesto» aquí es **otra sección**, no un elemento: subir «Obra sobre papel»
 * es ponerla, con sus cuatro obras, delante de «Óleos» y sus seis. Mover el rótulo
 * solo —lo que hacen los botones de una fila— es la otra operación y también existe;
 * ésta es la que ahorra los diez toques.
 *
 * El grupo de las huérfanas no se mueve: no es una sección, es el principio del
 * dossier, y «subir lo que va antes de todo» no significa nada.
 */
export function movedSectionOrder(
  rows: readonly DossierItemRow[],
  sectionId: string,
  direction: 'up' | 'down',
): string[] | null {
  const groups = dossierGroups(rows).filter(
    (group) => group.sectionId !== null || group.items.length > 0,
  )
  const index = groups.findIndex((group) => group.sectionId === sectionId)
  if (index === -1) return null

  // Solo se intercambia con otra SECCIÓN: el grupo de las huérfanas se queda donde
  // está, así que subir la primera sección real no tiene con quién cambiarse.
  const target =
    direction === 'up'
      ? lastIndexBefore(groups, index)
      : firstIndexAfter(groups, index)
  if (target === null) return null

  const next = groups.slice()
  const moved = next[index]
  const displaced = next[target]
  if (moved === undefined || displaced === undefined) return null
  next[index] = displaced
  next[target] = moved

  return flattenOrder(next)
}

function lastIndexBefore(groups: readonly DossierGroup[], index: number): number | null {
  for (let i = index - 1; i >= 0; i -= 1) {
    if (groups[i]?.sectionId !== null) return i
  }
  return null
}

function firstIndexAfter(groups: readonly DossierGroup[], index: number): number | null {
  for (let i = index + 1; i < groups.length; i += 1) {
    if (groups[i]?.sectionId !== null) return i
  }
  return null
}

/**
 * Los identificadores de los elementos ACTIVOS de una lista de grupos, en orden.
 *
 * Es lo que `reorder_dossier_items` acepta: exactamente los activos del dossier.
 * Los retirados quedan fuera, conservando el número muerto que tuvieran.
 */
function flattenOrder(groups: readonly DossierGroup[]): string[] {
  const order: string[] = []
  for (const group of groups) {
    if (group.sectionId !== null) order.push(group.sectionId)
    for (const row of group.items) {
      if (row.active) order.push(row.id)
    }
  }
  return order
}

/** El orden actual de los activos, tal como la base lo espera. */
export function currentOrder(rows: readonly DossierItemRow[]): string[] {
  return flattenOrder(dossierGroups(rows))
}

// ── Agrupar por serie, de una vez (RF-1623) ──────────────────

/**
 * El plan de agrupar las obras de un dossier por la serie del catálogo.
 *
 * **De una vez y no como criterio vivo**, y ésa es la decisión: si la sección
 * fuera «todas las obras de la serie tal», dar de alta una obra nueva la metería
 * en un documento ya mandado, y el orden dentro del bloque no se podría elegir. Es
 * el mismo error que la búsqueda guardada, un nivel más abajo. Así que esto es un
 * ayudante: crea los rótulos, coloca las obras debajo, y a partir de ahí todo se
 * corrige a mano.
 *
 * Lo que respeta:
 *
 *   · **las secciones que ya existen se conservan** con su rótulo y su entradilla,
 *     y las obras vuelven a la sección cuyo nombre coincide con su serie. Agrupar
 *     dos veces no duplica nada;
 *   · **el orden dentro de cada serie es el que ya tenía el dossier**, no el del
 *     catálogo: si alguien colocó tres obras en un orden concreto, agrupar no se lo
 *     deshace;
 *   · **las obras sin serie van al final**, en una sección propia y nombrada, en vez
 *     de quedarse huérfanas al principio donde saldrían sin rótulo;
 *   · **los textos y las biografías no se mueven de sección**: siguen donde estaban
 *     respecto a las obras que tenían delante.
 */
export interface GroupPlan {
  /** Los rótulos que hay que crear, en el orden en el que deben quedar. */
  create: string[]
  /** Por qué no hay nada que hacer, o null cuando sí lo hay. */
  blocked: string | null
}

/** El nombre de la sección de las obras sin serie. Nombrada y no vacía: un rótulo en blanco no es un rótulo. */
export const NO_SERIES_SECTION = 'Sin serie'

/**
 * Qué secciones hacen falta para agrupar por serie, y en qué orden.
 *
 * Devuelve **solo lo que hay que crear**: las que ya existen se reutilizan. El
 * orden es alfabético en español, con «Sin serie» siempre al final — es la papelera
 * del criterio y no un bloque más.
 */
export function seriesGroupPlan(rows: readonly DossierItemRow[]): GroupPlan {
  const artworks = sortItems(rows).filter((row) => row.kind === 'ARTWORK' && row.active)
  if (artworks.length === 0) {
    return { create: [], blocked: 'No hay obras que agrupar en este dossier.' }
  }

  const names = seriesNames(artworks)
  if (names.length === 1) {
    // Una sola serie no es una agrupación: sería un rótulo para todo el dossier, y
    // eso ya lo dice su título.
    return {
      create: [],
      blocked: `Todas las obras son de la misma serie (${names[0]}): no hay nada que agrupar.`,
    }
  }

  const existing = new Set(
    sortItems(rows)
      .filter((row) => row.kind === 'SECTION' && row.active)
      .map((row) => row.heading.trim()),
  )
  return { create: names.filter((name) => !existing.has(name)), blocked: null }
}

/** Los nombres de sección que salen de las series, ordenados y con «Sin serie» al final. */
export function seriesNames(artworks: readonly DossierItemRow[]): string[] {
  const named = new Set<string>()
  let anyWithout = false
  for (const row of artworks) {
    if (row.catalog_id === null) continue
    // La serie llega en el join de la propia fila: agrupar no cuesta una consulta.
    // Una obra cuya ficha no se puede leer cuenta como «sin serie», que es lo único
    // que se puede afirmar de ella.
    const series = (row.artwork?.series ?? '').trim()
    if (series === '') anyWithout = true
    else named.add(series)
  }
  const ordered = [...named].sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }))
  return anyWithout ? [...ordered, NO_SERIES_SECTION] : ordered
}

/**
 * El orden final después de agrupar, con las secciones ya creadas.
 *
 * Se calcula aparte de crearlas porque son dos escrituras distintas y la segunda
 * es la que tiene que ser todo-o-nada: si algo falla al crear los rótulos, quedan
 * al final del dossier —visibles y arreglables a mano— y el orden no se toca. Un
 * fallo así se dice; lo que no puede pasar es que el dossier quede a medias sin que
 * nadie lo sepa.
 *
 * @param sectionIdByHeading Los identificadores de las secciones, por rótulo: las
 *   que ya existían y las recién creadas.
 */
export function groupedOrder(
  rows: readonly DossierItemRow[],
  sectionIdByHeading: Record<string, string>,
): string[] {
  const ordered = sortItems(rows).filter((row) => row.active)
  const artworks = ordered.filter((row) => row.kind === 'ARTWORK')
  const names = seriesNames(artworks)

  const order: string[] = []
  // Lo que no es obra ni sección —textos y biografías— se queda al principio, en el
  // orden que tenía: no pertenece a ninguna serie y moverlo a una sería inventar
  // una pertenencia que nadie ha decidido.
  for (const row of ordered) {
    if (row.kind === 'TEXT' || row.kind === 'BIOGRAPHY') order.push(row.id)
  }

  for (const name of names) {
    const sectionId = sectionIdByHeading[name]
    if (sectionId !== undefined) order.push(sectionId)
    for (const row of artworks) {
      if (row.catalog_id === null) continue
      const series = (row.artwork?.series ?? '').trim()
      const belongs = name === NO_SERIES_SECTION ? series === '' : series === name
      if (belongs) order.push(row.id)
    }
  }

  // Las secciones que no salen del criterio —un rótulo escrito a mano que no es
  // ninguna serie— se conservan al final con lo que no haya entrado ya. Perderlas
  // sería borrar un rótulo que alguien escribió, y el reordenar exige la lista
  // completa de todas formas.
  const placed = new Set(order)
  for (const row of ordered) {
    if (!placed.has(row.id)) order.push(row.id)
  }
  return order
}

/** Lo que se dice después de agrupar, con las secciones que han salido. */
export function groupedNotice(sections: readonly string[]): string {
  if (sections.length === 0) return 'Las obras ya estaban agrupadas por serie.'
  const list = sections.join(', ')
  return sections.length === 1
    ? `Agrupado en una sección: ${list}. Muévela y renómbrala a mano si hace falta.`
    : `Agrupado en ${sections.length} secciones: ${list}. Se mueven y se renombran a mano.`
}
