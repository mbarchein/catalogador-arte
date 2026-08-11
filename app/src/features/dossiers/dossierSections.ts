/**
 * Las secciones de un dossier: qué obras lleva cada una, cómo se mueve una entera,
 * y cómo se agrupan solas por serie (RF-1619, RF-1620, RF-1623).
 *
 * **La pertenencia es una columna, `section_item_id`**, y esto fue lo segundo: era
 * la posición —una sección eran su rótulo y todo lo que viniera detrás— y se vino
 * abajo al usarla. Una sección no se podía mover entre obras sueltas: al ponerla
 * delante, esas obras quedaban detrás del rótulo y pasaban a ser suyas, así que el
 * único movimiento posible era apropiarse del dossier entero. «Obra suelta detrás de
 * una sección» no era un estado que el modelo pudiera escribir.
 *
 * Con la columna, este módulo sigue siendo el único sitio donde se interpreta qué es
 * una sección, y lo que interpreta es distinto:
 *
 *   · una sección son su rótulo y **los elementos que la señalan**;
 *   · **los bloques van seguidos** —lo comprueba `reorder_dossier_items`, porque la
 *     portadilla y el índice lo prometen impreso—, así que un grupo es un tramo
 *     contiguo y la pantalla puede pintarlo como una banda;
 *   · **una sección se mueve con el bloque de al lado, y una obra suelta es un
 *     bloque de una**: por eso la sección se desliza entre las sueltas de una en una
 *     sin quedarse con ninguna.
 *
 * Puro, como todo lo que decide en esta función.
 */

import type { DossierItemRow } from './dossierItems'
import { sortItems } from './dossierItems'

/** Un grupo de la lista: su rótulo —o ninguno— y los elementos que le pertenecen. */
export interface DossierGroup {
  /** El identificador del elemento SECTION, o null en el grupo de lo que va suelto. */
  sectionId: string | null
  /** El rótulo, o null cuando el grupo es de elementos sueltos. */
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

/** Los rótulos de las secciones ACTIVAS, por identificador. Una retirada no agrupa. */
export function activeSections(rows: readonly DossierItemRow[]): Map<string, DossierItemRow> {
  const sections = new Map<string, DossierItemRow>()
  for (const row of rows) {
    if (row.kind === 'SECTION' && row.active) sections.set(row.id, row)
  }
  return sections
}

/**
 * La sección de un elemento, o null si va suelto.
 *
 * Una pertenencia a una sección retirada se lee como «suelta»: el rótulo no se
 * imprime, así que no agrupa. La base la borra al retirar la sección, y esto es el
 * cinturón para las filas que ya estuvieran cargadas en pantalla.
 */
export function sectionOf(
  row: DossierItemRow,
  sections: Map<string, DossierItemRow>,
): string | null {
  if (row.kind === 'SECTION') return row.active ? row.id : null
  const id = row.section_item_id
  return id !== null && sections.has(id) ? id : null
}

/**
 * Los grupos de un dossier, en orden.
 *
 * Un grupo sin rótulo es un tramo de elementos sueltos, y puede haber más de uno:
 * al principio, entre dos secciones o al final. No es un error —una obra de apertura
 * antes del primer rótulo es una decisión— pero sale en el PDF sin rótulo, y la
 * pantalla avisa de la del principio, que es la que se manda sin querer.
 *
 * Los elementos retirados entran en el grupo en el que estén: la lista los pinta en
 * gris, y una fila en gris con su fotografía sigue diciendo qué obra era.
 */
export function dossierGroups(rows: readonly DossierItemRow[]): DossierGroup[] {
  const ordered = sortItems(rows)
  const sections = activeSections(ordered)
  const groups: DossierGroup[] = []
  let current: DossierGroup | null = null

  const loose = (): DossierGroup => ({
    sectionId: null,
    heading: null,
    body: '',
    dividerPage: false,
    items: [],
    artworkCount: 0,
  })

  for (const row of ordered) {
    if (row.kind === 'SECTION' && row.active) {
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

    // Un rótulo retirado se queda en el grupo que haya en curso, como cualquier otra
    // fila en gris: forzar un grupo nuevo partiría en dos la banda de la sección en
    // la que hubiera caído su número muerto.
    const key: string | null =
      row.kind === 'SECTION' ? current?.sectionId ?? null : sectionOf(row, sections)

    if (current === null || current.sectionId !== key) {
      if (key === null) {
        current = loose()
      } else {
        const section = sections.get(key)
        current = {
          sectionId: key,
          heading: section?.heading.trim() ?? null,
          body: section?.body.trim() ?? '',
          dividerPage: section?.divider_page === true,
          items: [],
          artworkCount: 0,
        }
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
 * El aviso de las obras sueltas, o null cuando no hay nada que avisar.
 *
 * Solo cuando hay secciones: sin ninguna, «suelta» es el dossier entero y decirlo
 * sería ruido. Y no es un error —una obra de apertura antes del primer rótulo es una
 * decisión—, así que es un aviso y no una negativa: lo único que dice es que en el
 * PDF esas páginas van sin rótulo.
 */
export function orphanNotice(groups: readonly DossierGroup[]): string | null {
  const hasSections = groups.some((group) => group.sectionId !== null)
  if (!hasSections) return null
  const count = groups
    .filter((group) => group.sectionId === null)
    .reduce((total, group) => total + group.artworkCount, 0)
  if (count === 0) return null
  return count === 1
    ? '1 obra va suelta, sin sección. Sale en el PDF, pero sin rótulo.'
    : `${count} obras van sueltas, sin sección. Salen en el PDF, pero sin rótulo.`
}

/**
 * **Un bloque de los que se mueven**: una sección con sus elementos dentro, o un
 * elemento suelto, que es un bloque de uno.
 *
 * Es la unidad de todo movimiento de esta pantalla, y por eso está escrita una sola
 * vez: mover una sección es cambiarla con el bloque de al lado, y mover una obra
 * suelta es exactamente lo mismo. Que una obra suelta sea un bloque es lo que hace
 * que una sección se deslice entre las sueltas **de una en una** en vez de saltárselas
 * todas de golpe.
 *
 * Solo los activos: es lo que `reorder_dossier_items` numera. Un retirado conserva el
 * número muerto que tuviera.
 */
interface DossierBlock {
  /** El rótulo, si el bloque es una sección. Null en un elemento suelto. */
  sectionId: string | null
  /** Los identificadores activos del bloque, en orden, con el rótulo primero. */
  ids: string[]
}

function dossierBlocks(rows: readonly DossierItemRow[]): DossierBlock[] {
  const blocks: DossierBlock[] = []
  for (const group of dossierGroups(rows)) {
    const items = group.items.filter((row) => row.active).map((row) => row.id)
    if (group.sectionId !== null) {
      blocks.push({ sectionId: group.sectionId, ids: [group.sectionId, ...items] })
      continue
    }
    // Un tramo suelto no es un bloque: son tantos bloques como elementos tenga.
    for (const id of items) blocks.push({ sectionId: null, ids: [id] })
  }
  return blocks
}

const flatten = (blocks: readonly DossierBlock[]): string[] =>
  blocks.flatMap((block) => block.ids)

/** El orden después de cambiar un bloque por el de al lado, o null en los extremos. */
function swapped(blocks: DossierBlock[], index: number, direction: 'up' | 'down'): string[] | null {
  const target = direction === 'up' ? index - 1 : index + 1
  const moved = blocks[index]
  const displaced = blocks[target]
  // En los extremos no hay con quién cambiarse: el acceso da `undefined`, que es lo
  // que apaga el botón.
  if (moved === undefined || displaced === undefined) return null
  const next = blocks.slice()
  next[index] = displaced
  next[target] = moved
  return flatten(next)
}

/**
 * El orden después de mover una sección ENTERA un puesto arriba o abajo, o null
 * cuando no hay nada que mover.
 *
 * «Un puesto» es el bloque de al lado, y **no cambia la pertenencia de nada**: la
 * sección pasa por delante de una obra suelta y la obra sigue suelta. Eso es lo que
 * antes no se podía escribir, y por lo que había que elegir entre no moverla o
 * quedarse con todo lo que tenía delante.
 */
export function movedSectionOrder(
  rows: readonly DossierItemRow[],
  sectionId: string,
  direction: 'up' | 'down',
): string[] | null {
  const blocks = dossierBlocks(rows)
  const index = blocks.findIndex((block) => block.sectionId === sectionId)
  if (index === -1) return null
  return swapped(blocks, index, direction)
}

/**
 * El orden después de mover UN elemento un puesto arriba o abajo, o null cuando no
 * hay nada que mover.
 *
 * Dos casos, y el mismo botón:
 *
 *   · un elemento **dentro de una sección** se mueve entre los de su sección. No se
 *     sale de ella con una flecha, porque salir es cambiar de sección y eso se dice
 *     con el selector de su fila — una flecha que cambiara la pertenencia sin decirlo
 *     es justo lo que hacía imposible mover una sección;
 *   · un elemento **suelto** cambia con el bloque de al lado, así que pasa por encima
 *     de una sección entera de un toque en vez de recorrerla obra por obra.
 */
export function movedItemOrder(
  rows: readonly DossierItemRow[],
  id: string,
  direction: 'up' | 'down',
): string[] | null {
  const ordered = sortItems(rows)
  const row = ordered.find((candidate) => candidate.id === id)
  if (row === undefined || !row.active) return null
  if (row.kind === 'SECTION') return movedSectionOrder(rows, id, direction)

  const sections = activeSections(ordered)
  const section = sectionOf(row, sections)

  if (section === null) {
    const blocks = dossierBlocks(rows)
    const index = blocks.findIndex((block) => block.sectionId === null && block.ids[0] === id)
    if (index === -1) return null
    return swapped(blocks, index, direction)
  }

  // Dentro de su sección: el orden entero se rehace cambiando dos elementos del
  // bloque, que es lo único que se mueve.
  const blocks = dossierBlocks(rows)
  const index = blocks.findIndex((block) => block.sectionId === section)
  const block = blocks[index]
  if (block === undefined) return null
  // El rótulo ocupa la posición 0 del bloque y no se mueve con estas flechas.
  const at = block.ids.indexOf(id)
  const to = direction === 'up' ? at - 1 : at + 1
  if (at < 1 || to < 1 || to >= block.ids.length) return null
  const ids = block.ids.slice()
  const moved = ids[at]
  const displaced = ids[to]
  if (moved === undefined || displaced === undefined) return null
  ids[at] = displaced
  ids[to] = moved
  const next = blocks.slice()
  next[index] = { sectionId: section, ids }
  return flatten(next)
}

/** El orden actual de los activos, tal como la base lo espera. */
export function currentOrder(rows: readonly DossierItemRow[]): string[] {
  return flatten(dossierBlocks(rows))
}

/**
 * La pertenencia actual de cada elemento activo, en el orden de `currentOrder`.
 *
 * **Un rótulo lleva null**, y no su propio identificador: `sectionOf` le devuelve el
 * suyo porque para agrupar una sección abre su propio grupo, pero la columna de una
 * sección es nula —no hay subsecciones— y la base rechaza la lista entera si llega de
 * otra forma.
 */
export function currentSections(rows: readonly DossierItemRow[]): (string | null)[] {
  const ordered = sortItems(rows)
  const sections = activeSections(ordered)
  const byId = new Map(ordered.map((row) => [row.id, row]))
  return currentOrder(rows).map((id) => {
    const row = byId.get(id)
    if (row === undefined || row.kind === 'SECTION') return null
    return sectionOf(row, sections)
  })
}

/**
 * El plan de meter un elemento en una sección o de sacarlo, o null cuando no hay nada
 * que hacer (RF-1619).
 *
 * **El orden y la pertenencia van en la misma escritura**, y no es una optimización:
 * son dos mitades de lo mismo. Cambiar la columna y colocar después dejaría un
 * instante con el elemento dentro de una sección y puesto fuera de su bloque, y si la
 * segunda escritura fallara el dossier se quedaría sin poder reordenarse — la base
 * exige que los bloques vayan seguidos.
 *
 * Dónde cae: **al final del bloque al que se une**. Al sacarlo, justo detrás del
 * bloque del que sale, que es donde estaba mirando quien lo saca.
 */
export function itemSectionPlan(
  rows: readonly DossierItemRow[],
  id: string,
  sectionId: string | null,
): { order: string[]; sections: (string | null)[] } | null {
  const ordered = sortItems(rows)
  const row = ordered.find((candidate) => candidate.id === id)
  if (row === undefined || !row.active || row.kind === 'SECTION') return null

  const sections = activeSections(ordered)
  const from = sectionOf(row, sections)
  if (from === sectionId) return null
  if (sectionId !== null && !sections.has(sectionId)) return null

  const current = currentOrder(rows)
  const held = currentSections(rows)
  const currentSection = new Map(current.map((each, index) => [each, held[index] ?? null]))

  // El ancla es el bloque al que se une, o el que abandona: en los dos casos el
  // elemento cae justo detrás de ese bloque.
  const anchor = sectionId ?? from
  const rest = current.filter((each) => each !== id)
  const lastOfAnchor = rest.reduce(
    (last, each, index) =>
      each === anchor || currentSection.get(each) === anchor ? index : last,
    -1,
  )

  const order = [...rest.slice(0, lastOfAnchor + 1), id, ...rest.slice(lastOfAnchor + 1)]
  return {
    order,
    sections: order.map((each) =>
      each === id ? sectionId : currentSection.get(each) ?? null,
    ),
  }
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
 * El orden final después de agrupar, y la pertenencia de cada elemento.
 *
 * Se calcula aparte de crear los rótulos porque son dos escrituras distintas y la
 * segunda es la que tiene que ser todo-o-nada: si algo falla al crearlos, quedan al
 * final del dossier —visibles y arreglables a mano— y el orden no se toca. Un fallo
 * así se dice; lo que no puede pasar es que el dossier quede a medias sin que nadie
 * lo sepa.
 *
 * Las dos listas viajan juntas a la base por lo mismo que en `itemSectionPlan`:
 * colocar sin asignar dejaría cada obra debajo de un rótulo que no es el suyo.
 *
 * @param sectionIdByHeading Los identificadores de las secciones, por rótulo: las
 *   que ya existían y las recién creadas.
 */
export function groupedOrder(
  rows: readonly DossierItemRow[],
  sectionIdByHeading: Record<string, string>,
): { order: string[]; sections: (string | null)[] } {
  const ordered = sortItems(rows).filter((row) => row.active)
  const artworks = ordered.filter((row) => row.kind === 'ARTWORK')
  const names = seriesNames(artworks)

  const order: string[] = []
  const sections: (string | null)[] = []
  const place = (id: string, section: string | null) => {
    order.push(id)
    sections.push(section)
  }

  // Lo que no es obra ni sección —textos y biografías— se queda al principio y
  // suelto, en el orden que tenía: no pertenece a ninguna serie, y meterlo en una
  // sería inventar una pertenencia que nadie ha decidido.
  for (const row of ordered) {
    if (row.kind === 'TEXT' || row.kind === 'BIOGRAPHY') place(row.id, null)
  }

  for (const name of names) {
    const sectionId = sectionIdByHeading[name]
    if (sectionId !== undefined) place(sectionId, null)
    for (const row of artworks) {
      if (row.catalog_id === null) continue
      const series = (row.artwork?.series ?? '').trim()
      const belongs = name === NO_SERIES_SECTION ? series === '' : series === name
      // Sin rótulo creado la obra se queda suelta en su sitio: es lo que pasa cuando
      // el rótulo no se pudo crear, y se dice en pantalla.
      if (belongs) place(row.id, sectionId ?? null)
    }
  }

  // Las secciones que no salen del criterio —un rótulo escrito a mano que no es
  // ninguna serie— se conservan al final con lo que no haya entrado ya. Perderlas
  // sería borrar un rótulo que alguien escribió, y el reordenar exige la lista
  // completa de todas formas. Van sueltas: al quedar al final, cualquier pertenencia
  // que arrastraran las dejaría fuera del bloque de su sección.
  const placed = new Set(order)
  for (const row of ordered) {
    if (!placed.has(row.id)) place(row.id, null)
  }
  return { order, sections }
}

/** Lo que se dice después de agrupar, con las secciones que han salido. */
export function groupedNotice(sections: readonly string[]): string {
  if (sections.length === 0) return 'Las obras ya estaban agrupadas por serie.'
  const list = sections.join(', ')
  return sections.length === 1
    ? `Agrupado en una sección: ${list}. Muévela y renómbrala a mano si hace falta.`
    : `Agrupado en ${sections.length} secciones: ${list}. Se mueven y se renombran a mano.`
}
