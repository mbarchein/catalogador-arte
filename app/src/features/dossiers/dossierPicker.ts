/**
 * Choosing the artworks that go into a dossier (RF-1602).
 *
 * The starting point of arming one is searching the catalogue — «las doce que
 * pidieron» are found by looking— but what gets saved are the twelve, not the
 * search. So this is a chooser and not a filter: it ranks the whole catalogue by
 * what is typed and hands back rows to tap.
 *
 * **What is already in the dossier is not offered again.** The database would
 * handle it —`add_artwork_to_dossier` restores instead of colliding— but offering
 * a row whose only effect is «ya estaba» is a tap that teaches nothing. It is not
 * hidden in silence either: the count of what was left out is part of the answer,
 * because a catalogue that seems to be missing artworks is how somebody concludes
 * one was never catalogued.
 *
 * Pure, like every decision of this feature.
 */

import { displayDate } from '../../lib/dates'
import { displayTitle } from '../../lib/title'
import { ARTIST_LABEL, type ArtistFund } from '../../lib/types'
import { fuzzyRankBy } from '../../lib/vocabulary'

/** The artwork as the chooser needs it: the same shape the catalogue mirror keeps. */
export interface PickableArtwork {
  catalog_id: string
  title: string
  artist: ArtistFund
  execution_date: string
  active: boolean
}

/** One row of the chooser, ready to paint. */
export interface PickerEntry {
  catalogId: string
  /** `AR-0042 · Figura sentada · Rotili · 1965`. What the search matched and what the row shows. */
  text: string
  /** Where the typed letters landed, for the emphasis. */
  indices: number[]
}

/**
 * What the chooser matches, which is also what its rows show.
 *
 * The code first because that is how an artwork is asked for out loud, and the
 * date last because it is what tells two versions of one composition apart. A list
 * whose rows match text they do not show looks arbitrary — the rule this project
 * already wrote down for the other choosers.
 */
export function pickerText(artwork: PickableArtwork): string {
  return [
    artwork.catalog_id,
    displayTitle(artwork.title),
    ARTIST_LABEL[artwork.artist],
    displayDate(artwork.execution_date),
  ]
    .filter((part) => part.trim() !== '')
    .join(' · ')
}

export interface PickerResult {
  entries: PickerEntry[]
  /** How many were left out for being in the dossier already. Said, never silent. */
  alreadyIn: number
}

/**
 * The rows to offer, best match first, capped.
 *
 * **An empty query offers nothing, on purpose.** It used to show the head of the
 * catalogue, and that was wrong for the job: opening «Añadir» dumped the whole
 * catalogue under the search box, so the panel read as a listing of everything
 * instead of a chooser, and the artwork wanted was never among the first twenty
 * anyway. A chooser with nothing in it and a legible sentence above is shorter to
 * read and says what to do.
 *
 * **The cap is not a detail either.** The mirror holds every artwork, and painting
 * hundreds of rows under a search box on a phone is a list nobody scrolls; twenty
 * is what fits a thumb's reach with the keyboard open. The answer to «no está en
 * los veinte» is to type another letter.
 *
 * Retired artworks are not offered: a dossier is a document that goes outside, and
 * an artwork in the wastebasket has no place in one. The ones already in the
 * dossier are counted out (see `alreadyIn`).
 */
export function pickableArtworks(
  catalog: readonly PickableArtwork[],
  inDossier: readonly string[],
  query: string,
  options: { limit?: number } = {},
): PickerResult {
  const taken = new Set(inDossier)
  const live = catalog.filter((artwork) => artwork.active)
  const free = live.filter((artwork) => !taken.has(artwork.catalog_id))
  // Sin nada escrito no se ofrece nada, pero el recuento de las que ya están SÍ se
  // calcula: es un dato del dossier y no del resultado de una búsqueda.
  if (query.trim() === '') return { entries: [], alreadyIn: live.length - free.length }
  const ordered = free
    .slice()
    // By code and descending: the newest catalogued is the likeliest to be the one
    // being looked for, the same reasoning the exhibitions index wrote down for its
    // chronology.
    .sort((a, b) => b.catalog_id.localeCompare(a.catalog_id, 'es'))
  const limit = options.limit ?? 20
  const ranked = fuzzyRankBy(ordered, pickerText, query)
    .slice(0, limit)
    .map(({ item, indices }) => ({
      catalogId: item.catalog_id,
      text: pickerText(item),
      indices,
    }))
  return { entries: ranked, alreadyIn: live.length - free.length }
}

/**
 * What the chooser says instead of rows, or null when there are rows.
 *
 * Four different answers and none of them is an empty panel: the mirror still
 * filling —which happens on a device that has never opened the list—, nothing typed
 * yet, a search that matches nothing, and the one that reads like a bug unless it is
 * explained: every artwork of the catalogue is already in this dossier.
 *
 * The order of the branches is the order of the questions. «Ya lleva todas» goes
 * BEFORE «busca la obra», because telling somebody to search a catalogue they have
 * already exhausted is sending them after nothing.
 */
export function pickerNotice(state: {
  loading: boolean
  shown: number
  alreadyIn: number
  catalogSize: number
  query: string
}): string | null {
  if (state.shown > 0) return null
  if (state.loading) return 'Cargando el catálogo…'
  if (state.catalogSize === 0) return 'No se ha podido leer el catálogo de obras.'
  if (state.alreadyIn >= state.catalogSize) {
    return 'Este dossier ya lleva todas las obras del catálogo.'
  }
  // Antes de escribir nada, lo que hace falta es saber qué se puede escribir. Sin
  // esta frase el panel se abre con un hueco y parece que está cargando.
  if (state.query.trim() === '') return 'Busca la obra por su código, su título, su artista o su año.'
  return 'Ninguna obra coincide con lo que buscas.'
}
