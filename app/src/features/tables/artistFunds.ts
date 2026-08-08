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
 * El estado del fondo en una frase, o null cuando no hay nada que decir.
 *
 * Un fondo activo y con sus obras a la vista es lo normal y no lleva etiqueta: un
 * cartel sobre lo que está en su sitio es ruido que hace que no se lean los que sí
 * dicen algo.
 */
export function fundStateText(entry: ArtistFundEntry): string | null {
  if (!entry.active && entry.hideArtworks) {
    return 'Retirado y con sus obras apartadas del listado.'
  }
  if (!entry.active) {
    return 'Retirado: no se ofrece al dar de alta, pero sus obras siguen en el listado.'
  }
  if (entry.hideArtworks) {
    return 'Sus obras no salen en el listado, aunque el fondo se sigue ofreciendo.'
  }
  return null
}

/** Lo que explica cada interruptor, junto a él y no en una ayuda aparte. */
export const RETIRE_FUND_HINT =
  'Deja de ofrecerse al dar de alta una obra y en los selectores. Lo que ya está catalogado en ' +
  'este fondo no se toca: sigue en el listado y sigue diciendo de qué fondo es.'

export const HIDE_ARTWORKS_HINT =
  'Sus obras dejan de salir en el listado. No se borra ni se retira nada: cada obra se sigue ' +
  'abriendo por su enlace, y filtrando por este fondo vuelven a verse todas.'

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
    'Es el último fondo activo. Si se retira no queda ninguno que elegir al dar de alta una obra, ' +
    'así que la base lo rechaza: activa antes otro.'
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
 * Lo que el listado dice cuando está apartando obras.
 *
 * **Nunca un hueco en silencio.** Un listado que se calla que está escondiendo
 * cuarenta obras es un listado en el que no se puede confiar para contar, y contar
 * es media catalogación. Null cuando no aparta nada.
 */
export function hiddenFundsNotice(hidden: readonly ArtistFundEntry[]): string | null {
  if (hidden.length === 0) return null
  const names = hidden.map((f) => f.name).join(', ')
  return hidden.length === 1
    ? `No se muestran las obras de ${names}. Filtra por ese fondo para verlas.`
    : `No se muestran las obras de estos fondos: ${names}. Filtra por uno para verlas.`
}

/** Los fondos que se ofrecen para elegir: los activos, más el que la fila ya tenga. */
export function offeredFunds(
  entries: readonly ArtistFundEntry[],
  current?: ArtistFund | null,
): ArtistFundEntry[] {
  return entries.filter((f) => f.active || f.code === current)
}
