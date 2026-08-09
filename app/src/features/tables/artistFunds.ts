/**
 * Los fondos del catálogo, mantenidos desde Tablas (ADR-007, segunda entrega).
 *
 * ── QUÉ ES UN FONDO Y POR QUÉ NO ES UNA MAESTRA MÁS ─────────
 *
 * Un fondo es el conjunto de obra de un artista, y es el dato del que cuelga todo
 * lo demás: la numeración (`AR-0001`), las series, los documentos del archivo. Por
 * eso esta pantalla hace MENOS que las otras cinco maestras y no más:
 *
 *   · **no crea.** Un fondo nuevo trae un prefijo nuevo, y ese prefijo entra en la
 *     generación de identificadores, en la restricción que ata prefijo y fondo, y
 *     en la lista blanca de la función que firma los ficheros del archivo. Es una
 *     decisión de esquema con su migración, no una fila que se teclea;
 *   · **no borra**, como ninguna (RF-901) — y aquí menos que en ninguna: borrar un
 *     fondo dejaría sin nombre a todas sus obras;
 *   · **no cambia el prefijo.** Está impreso en la etiqueta pegada al cuadro.
 *
 * Lo que sí hace: renombrar, retirar y apartar.
 *
 * ── LOS DOS INTERRUPTORES ───────────────────────────────────
 *
 * Son distintos y la pantalla tiene que dejarlo claro, porque el caso que los pidió
 * es el fondo de pruebas y ahí se quieren los dos a la vez — pero no siempre:
 *
 *   · **retirado** es que deja de ofrecerse al dar de alta y en los selectores. Sus
 *     obras siguen donde estaban y su nombre se sigue leyendo en cada una;
 *   · **apartado** es que sus obras no salen en el listado por omisión. No es un
 *     borrado ni una papelera: la obra se abre por su enlace y se encuentra
 *     filtrando por su fondo.
 */

import type { ArtistFund } from '../../lib/types'

/** Un fondo como lo lee y lo corrige esta pantalla. */
export interface ArtistFundEntry {
  id: string
  /** El valor del enumerado. Legado, inmutable, y no se enseña. */
  code: ArtistFund
  /** El prefijo de los identificadores. Se enseña porque explica el fondo; no se edita. */
  prefix: string
  name: string
  active: boolean
  hideArtworks: boolean
}

/** El orden en que se leen: por prefijo, que es como están numeradas las obras. */
export function sortFunds(entries: readonly ArtistFundEntry[]): ArtistFundEntry[] {
  return entries.slice().sort((a, b) => a.prefix.localeCompare(b.prefix, 'es'))
}

/** Lo que se lee bajo el nombre de cada fondo: su prefijo, que es lo que lo identifica. */
export function fundPrefixText(prefix: string): string {
  return `Obras ${prefix}-0001, ${prefix}-0002…`
}

/**
 * Cómo se rotula cada interruptor.
 *
 * Los dos nombran el estado NORMAL, y encendido es ese estado. Así se lee
 * siempre igual —encendido es «esto está como debe»— y no hay que resolver un
 * doble negativo para saber qué pasa al apagar «retirado».
 */
export const OFFERED_LABEL = 'Se ofrece al dar de alta'
export const LISTED_LABEL = 'Sus obras salen en el listado'

/**
 * Lo que se lee bajo cada interruptor: **qué pasa ahora**, no qué pasaría.
 *
 * Antes había una frase fija que describía los dos estados a la vez, y por eso
 * la pantalla no se entendía: había que averiguar cuál de las dos mitades
 * aplicaba mirando el control. Ahora el subtexto solo cuenta el estado en el que
 * se está, y el apagado carga además con la mitad que evita el susto —qué NO se
 * ha hecho—, que es justo cuando hace falta.
 */
export function fundOfferedHint(active: boolean): string {
  return active
    ? 'Aparece entre los fondos al dar de alta una obra.'
    : 'No aparece al dar de alta. Sus obras no se han tocado: siguen en el listado y siguen ' +
        'diciendo que son de este fondo.'
}

export function fundListedHint(listed: boolean): string {
  return listed
    ? 'Sus obras aparecen en el listado, como las de los demás fondos.'
    : 'Sus obras no aparecen en el listado. No se ha borrado ni retirado nada: cada obra se sigue abriendo por su enlace.'
}

/**
 * Por qué no se puede retirar este fondo, o null cuando sí.
 *
 * La base lo niega —y lo dice— pero un control que va a ser rechazado tiene que
 * decirlo ANTES de pulsarse: quien cataloga está de pie, y un viaje de ida y vuelta
 * para que le digan que no es peor que un botón que se explica.
 */
export function retireFundBlockedReason(
  entry: ArtistFundEntry,
  all: readonly ArtistFundEntry[],
): string | null {
  if (!entry.active) return null
  const othersActive = all.filter((f) => f.active && f.id !== entry.id).length
  if (othersActive > 0) return null
  return (
    'Es el último fondo activo: si se retira no queda ninguno, así que activa antes otro.'
  )
}

/** Lo que se dice tras cada cambio, nombrando el fondo. */
export function fundRenamedNotice(name: string): string {
  return `El fondo se llama ahora «${name}». Lo ven todas sus obras.`
}

export function fundActiveNotice(name: string, active: boolean): string {
  return active
    ? `«${name}» vuelve a ofrecerse al dar de alta.`
    : `«${name}» deja de ofrecerse. Sus obras no se han tocado.`
}

export function fundHiddenNotice(name: string, hidden: boolean): string {
  return hidden
    ? `Las obras de «${name}» dejan de salir en el listado. Se siguen abriendo por su enlace.`
    : `Las obras de «${name}» vuelven al listado.`
}

/**
 * El distintivo del fondo apartado, en la lista de fondos del panel de filtros.
 *
 * **Nunca un hueco en silencio**, pero dicho donde se puede hacer algo con ello.
 * Antes era un aviso sobre el listado —«no se muestran las obras de X»— y estaba
 * en el sitio equivocado dos veces: encima de una lista que ya es larga, y lejos
 * del interruptor que lo arregla. Marcarlo en la fila del fondo, dentro del
 * panel donde se filtra, lo pone justo donde se va a actuar: marcar ese fondo es
 * exactamente lo que hace aparecer sus obras.
 */
export const HIDDEN_FUND_BADGE = 'Apartado'

/** Lo que se lee bajo el nombre del fondo apartado, en esa misma fila. */
export const HIDDEN_FUND_FILTER_HINT = 'Sus obras no salen si no lo marcas'

/** Las filas del filtro de fondo, con el apartado señalado. */
export function fundFilterOptions(
  entries: readonly ArtistFundEntry[],
): { value: ArtistFund; text: string; badge?: string; hint?: string }[] {
  return sortFunds(entries).map((entry) => ({
    value: entry.code,
    text: entry.name,
    ...(entry.hideArtworks
      ? { badge: HIDDEN_FUND_BADGE, hint: HIDDEN_FUND_FILTER_HINT }
      : {}),
  }))
}

/** Los fondos que se ofrecen para elegir: los activos, más el que la fila ya tenga. */
export function offeredFunds(
  entries: readonly ArtistFundEntry[],
  current?: ArtistFund | null,
): ArtistFundEntry[] {
  return entries.filter((f) => f.active || f.code === current)
}
