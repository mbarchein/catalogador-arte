import type { PhysicalPlace } from './types'

/**
 * The tree of physical places, on the client side (ADR-006).
 *
 * The catalog stores where an artwork is as a node of `physical_places`, not as
 * a text with a notation convention. That moved three problems out of the
 * interface and into the database — no two siblings with the same name, no
 * cycles, and renaming being one row — and left this module with the two jobs
 * the database cannot do: turning a flat list of rows into something a screen
 * can show, and answering "is this artwork inside that place" for the list
 * filter.
 *
 * **The whole tree travels to the client, and that is deliberate.** There are
 * eight nodes today and there will be dozens, not thousands: a storage room has
 * as many shelves as a person can walk. Loading it whole means the record, the
 * filter and the places screen all read from one query, the path of a node is
 * arithmetic instead of a recursive query per row, and the ancestors the filter
 * needs are already here. If this ever grew to the point of hurting, the fix
 * would be a recursive view in the database, not paging this.
 *
 * There is no DOM and no network here, like in imageEdits.ts and for the same
 * reason: this is the part that can be tested for real.
 */

/**
 * The comparison key of a name: lowercase and without accents, keeping the ñ.
 *
 * **This mirrors `public.place_key` character for character on purpose**, with
 * the same list of letters, because the two are used for the same decision on
 * opposite sides of the wire: the database refuses two siblings whose keys match
 * and this decides whether the selector offers to create a place or picks the
 * one that is already there. If the two rules drifted, the interface would
 * offer to create a place the database then rejects — with a unique-violation
 * error where the honest answer was "that one already exists".
 *
 * The ñ is left alone because it is a letter and not an accent: turning
 * «muñeca» into «muneca» would not be normalizing, it would be a spelling
 * mistake. That is also why this cannot be NFD-and-strip-combining-marks, which
 * looks equivalent and is not: it would also flatten the cedilla of «Provença»,
 * which `translate` in SQL leaves standing.
 */
const ACCENTED = 'áàäâãéèëêíìïîóòöôõúùüûýÿÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÝ'
const UNACCENTED = 'aaaaaeeeeiiiiooooouuuuyyAAAAAEEEEIIIIOOOOOUUUUY'

export function placeKey(name: string): string {
  let key = ''
  for (const character of name.trim().toLowerCase()) {
    const at = ACCENTED.indexOf(character)
    key += at < 0 ? character : UNACCENTED[at]!.toLowerCase()
  }
  return key
}

/**
 * The places indexed for reading: by identifier, and by parent.
 *
 * Roots are under the `null` key of `childrenOf`, the same way the database
 * spells them. Siblings come out sorted with es-ES collation, so «Ávila» sits
 * with the a's and not after the z's, and so the order on screen does not
 * depend on the collation the database happened to be created with.
 */
export interface PlaceTree {
  byId: Map<string, PhysicalPlace>
  childrenOf: Map<string | null, PhysicalPlace[]>
}

export function buildPlaceTree(places: readonly PhysicalPlace[]): PlaceTree {
  const byId = new Map<string, PhysicalPlace>()
  for (const place of places) byId.set(place.id, place)

  const childrenOf = new Map<string | null, PhysicalPlace[]>()
  for (const place of places) {
    // A node whose parent is not in the list hangs from nowhere. It happens
    // while the mirror is stale, or if a place were retired out from under a
    // link: treating it as a root shows it instead of hiding it, which is the
    // rule of never leaving a blank space.
    const parent = place.parent_id !== null && byId.has(place.parent_id) ? place.parent_id : null
    const siblings = childrenOf.get(parent)
    if (siblings) siblings.push(place)
    else childrenOf.set(parent, [place])
  }

  for (const siblings of childrenOf.values()) {
    siblings.sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }))
  }

  return { byId, childrenOf }
}

/**
 * Safety belt against a corrupt hierarchy, mirroring the one in the no-cycle
 * trigger. The database already refuses cycles, so reaching this means the data
 * is broken; what matters is that the interface stops instead of hanging with a
 * spinner nobody can explain.
 */
const MAX_DEPTH = 100

/**
 * The branch from the root down to `id`, or an empty array when the place is
 * unknown.
 */
export function placeAncestry(tree: PlaceTree, id: string | null): PhysicalPlace[] {
  const branch: PhysicalPlace[] = []
  let current = id
  while (current !== null && branch.length < MAX_DEPTH) {
    const place = tree.byId.get(current)
    if (!place) break
    branch.unshift(place)
    current = place.parent_id
  }
  return branch
}

/**
 * How a place reads on the record and on the printed PDF: the branch from the
 * outside in, separated by commas — «Castelar 4, mesa de Mario».
 *
 * The comma is back to being a comfortable way of writing and not syntax, so it
 * is only a separator HERE, on the way out. Nothing parses this back.
 */
export function placePathText(tree: PlaceTree, id: string | null): string {
  return placeAncestry(tree, id)
    .map((place) => place.name)
    .join(', ')
}

/**
 * The identifiers of `ids` plus everything inside them, at any depth.
 *
 * This is what makes the location filter usable in a storage room: asking for
 * the yellow room has to bring every shelf, folder and box under it. Before the
 * tree this had to be deduced by splitting texts and comparing level by level;
 * now the ancestors ARE the tree, which is one of the reasons for the decision.
 */
export function placesInside(tree: PlaceTree, ids: readonly string[]): Set<string> {
  const inside = new Set<string>()
  const pending = ids.filter((id) => tree.byId.has(id))
  while (pending.length > 0) {
    const id = pending.pop()!
    if (inside.has(id)) continue
    inside.add(id)
    for (const child of tree.childrenOf.get(id) ?? []) pending.push(child.id)
  }
  return inside
}

/** A place and how deep it sits, for a list that shows the hierarchy. */
export interface FlatPlace {
  place: PhysicalPlace
  depth: number
  /** The full branch as text, which is what identifies the place to a person. */
  path: string
}

/**
 * The tree flattened depth first: every node right under its parent, branch by
 * branch. That is the order a hierarchy has to be read in, and the reason this
 * is not a sort of the flat list.
 *
 * `keep` decides which nodes appear. The places screen shows everything; the
 * filter and the selector hide what was retired — except a retired place that
 * is already selected, or a checkbox would be painted that cannot be unticked.
 * A retired node whose PARENT is hidden disappears with it, which is right: a
 * branch nobody can reach is not an option.
 */
export function flattenPlaces(
  tree: PlaceTree,
  keep: (place: PhysicalPlace) => boolean = () => true,
): FlatPlace[] {
  const flat: FlatPlace[] = []

  const walk = (parent: string | null, depth: number, prefix: string) => {
    if (depth > MAX_DEPTH) return
    for (const place of tree.childrenOf.get(parent) ?? []) {
      if (!keep(place)) continue
      const path = prefix === '' ? place.name : `${prefix}, ${place.name}`
      flat.push({ place, depth, path })
      walk(place.id, depth + 1, path)
    }
  }

  walk(null, 0, '')
  return flat
}

/**
 * The place `levels` names, walking down from the roots, or null when the path
 * does not exist. Compared by `placeKey`, so a path written with different
 * capitals or accents finds its place.
 *
 * Two callers, both of them about text that a person wrote rather than picked:
 * the selector, where typing «castelar 4, mesa» must find the shelf instead of
 * creating a second one, and the legacy location links, where the address bar
 * carries the old comma-separated text.
 */
export function findPlaceByPath(
  tree: PlaceTree,
  levels: readonly string[],
): PhysicalPlace | null {
  let parent: string | null = null
  let found: PhysicalPlace | null = null

  for (const level of levels) {
    const key = placeKey(level)
    if (key === '') return null
    // Annotated because `parent` is reassigned from it below, and inference
    // would chase its own tail.
    const next: PhysicalPlace | undefined = (tree.childrenOf.get(parent) ?? []).find(
      (place) => placeKey(place.name) === key,
    )
    if (!next) return null
    found = next
    parent = next.id
  }

  return found
}

/**
 * The levels of a path typed by hand, largest to smallest.
 *
 * Commas close a level, blank levels are dropped, and the surrounding spaces go
 * — they turn up constantly when typing on a phone. What this does NOT do is
 * normalize accents or capitals: the name is stored exactly as it is written,
 * which is the whole point of the decision.
 */
export function splitPlacePath(text: string): string[] {
  return text
    .split(',')
    .map((level) => level.trim())
    .filter((level) => level !== '')
}
