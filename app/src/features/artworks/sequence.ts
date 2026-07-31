import {
  ORDER_LABEL,
  hasNoFilters,
  matchesSearch,
  matchesView,
  sortArtworks,
  type ListedArtwork,
  type ListView,
} from './listView'

/**
 * The sequence the record view walks with «anterior» and «siguiente» (RF-311).
 *
 * **The filtered list IS the sequence.** There is no second ordering concept:
 * the cursor of the record view runs over the same rows, in the same order, that
 * the list was showing — which is why every useful queue already exists without
 * inventing anything. «Recorrer el almacén con las etiquetas delante» is the
 * order by code; «rematar lo pendiente» is the status filter; «estudiar una
 * serie» is the series filter. The list page and this module call the very same
 * predicates, so the two can never disagree about what comes next.
 *
 * Pure logic, like listView.ts: no React and no DOM here. The frozen snapshot,
 * the gesture and the buttons live in useArtworkSequence.ts and ArtworkPage.tsx;
 * what gets tested is this.
 */

/**
 * The artworks of a view, filtered and ordered exactly as the list shows them.
 *
 * `sortArtworks` breaks every tie by `catalog_id`, so the result is a total and
 * stable order: two artworks can never swap places between one «siguiente» and
 * the next.
 */
export function sequenceOf<T extends ListedArtwork>(rows: readonly T[], view: ListView): T[] {
  const matching = rows.filter((a) => matchesView(a, view) && matchesSearch(a, view.search))
  return sortArtworks(matching, view.order)
}

/** Where an artwork sits in a sequence, and what its neighbors are. */
export interface Position {
  /** Identifier of the previous artwork, or null at the start of the sequence. */
  previous: string | null
  /** Identifier of the next one, or null at the end. */
  next: string | null
  /** 1-based place in the sequence, or 0 when the artwork is not in it. */
  index: number
  total: number
}

const NOWHERE: Position = { previous: null, next: null, index: 0, total: 0 }

/**
 * The neighbors of an artwork in a sequence.
 *
 * It does not wrap around: at the ends the corresponding neighbor is null and
 * the control goes inactive. Coming back to the first artwork after the last one
 * would hide the one thing the cataloger needs to know, which is that the queue
 * is finished.
 */
export function positionOf(ids: readonly string[], catalogId: string | undefined): Position {
  if (!catalogId) return NOWHERE
  const at = ids.indexOf(catalogId)
  if (at < 0) return { ...NOWHERE, total: ids.length }
  return {
    previous: at > 0 ? ids[at - 1]! : null,
    next: at < ids.length - 1 ? ids[at + 1]! : null,
    index: at + 1,
    total: ids.length,
  }
}

/** A sequence, and whether it is the one the list was showing. */
export interface Sequence {
  ids: string[]
  /**
   * False when the artwork was not in the list's own sequence and the whole
   * catalog by code is being walked instead.
   */
  fromList: boolean
}

/**
 * The sequence for a record: the list's, or the whole catalog by code when the
 * artwork is not part of the list's.
 *
 * That happens with a shared link whose filters exclude the artwork, or with the
 * QR of a piece that is outside them. Two things get avoided by falling back
 * instead of giving up: a control that is there and does nothing, and a queue
 * that claims to be the list while walking something else — the bar says which
 * one it is (see `fromList`).
 *
 * An artwork that is not even in the mirror — deactivated, or a catalog nobody
 * has downloaded yet — is in no sequence at all: `positionOf` answers 0 and the
 * record view shows no controls.
 */
export function navigationSequence<T extends ListedArtwork>(
  rows: readonly T[],
  view: ListView,
  catalogId: string | undefined,
): Sequence {
  const listed = sequenceOf(rows, view).map((r) => r.catalog_id)
  if (catalogId !== undefined && listed.includes(catalogId)) {
    return { ids: listed, fromList: true }
  }
  return { ids: sortArtworks(rows, 'CATALOG_ID').map((r) => r.catalog_id), fromList: false }
}

/**
 * Name of the queue being walked, for the record's navigation bar.
 *
 * A queue that does not say what it is looks like a catalog with pieces missing:
 * «12 de 87» over three hundred artworks needs the reason why, and the reason is
 * the order plus whatever narrowed it.
 */
export function queueLabel(view: ListView, fromList: boolean): string {
  // The artwork was not in the list one arrived from: see navigationSequence.
  if (!fromList) return 'Todo el catálogo, por código'
  const narrowed = [
    hasNoFilters(view) ? null : 'filtros',
    view.search.trim() === '' ? null : 'búsqueda',
  ].filter((part): part is string => part !== null)
  if (narrowed.length === 0) return ORDER_LABEL[view.order]
  return `${ORDER_LABEL[view.order]} · con ${narrowed.join(' y ')}`
}

// ── The gesture ──────────────────────────────────────────────
// The arithmetic of the swipe lives here, not in the component: a threshold is
// exactly the kind of thing that gets tuned by feel and then silently broken.

/** Movement, in pixels, before the gesture commits to an axis. */
const DEAD_ZONE = 10

/** Farthest a drag travels, as a fraction of the screen, before it counts. */
const COMMIT_FRACTION = 0.22

/** And never more than this, so it works on a tablet as well as on a phone. */
const COMMIT_MAX = 96

/** A flick: short but fast, in pixels and milliseconds. */
const FLICK_DISTANCE = 36
const FLICK_TIME = 260

/**
 * Which axis a gesture belongs to, or null while it is too small to tell.
 *
 * Deciding once and sticking to it is what keeps a diagonal thumb movement from
 * fighting the page: whoever is scrolling down the record must be able to drift
 * sideways without the artwork changing under them.
 */
export function swipeAxis(dx: number, dy: number): 'horizontal' | 'vertical' | null {
  if (Math.abs(dx) < DEAD_ZONE && Math.abs(dy) < DEAD_ZONE) return null
  return Math.abs(dx) > Math.abs(dy) ? 'horizontal' : 'vertical'
}

/**
 * Whether a finished horizontal drag passes to the previous artwork, to the next
 * one, or to neither.
 *
 * Dragging to the right brings in what is on the left, which is the previous
 * artwork — the same direction as turning back a page.
 */
export function decideSwipe(gesture: {
  dx: number
  dy: number
  /** Duration of the gesture in milliseconds. */
  elapsed: number
  /** Width of the area the gesture happened on. */
  width: number
}): 'previous' | 'next' | null {
  if (swipeAxis(gesture.dx, gesture.dy) !== 'horizontal') return null
  const travel = Math.abs(gesture.dx)
  const enough =
    travel >= Math.min(COMMIT_MAX, gesture.width * COMMIT_FRACTION) ||
    (travel >= FLICK_DISTANCE && gesture.elapsed <= FLICK_TIME)
  if (!enough) return null
  return gesture.dx > 0 ? 'previous' : 'next'
}

/**
 * How far the record follows the finger.
 *
 * With a neighbor on that side it follows it exactly; without one it barely
 * moves, so the end of the queue is felt in the hand before it is read on the
 * screen — the same rubber band the system uses at the end of a scroll.
 */
export function dragOffset(dx: number, hasNeighbor: boolean, width: number): number {
  const capped = Math.max(-width, Math.min(width, dx))
  return hasNeighbor ? capped : capped * 0.15
}
