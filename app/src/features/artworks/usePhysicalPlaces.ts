import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { buildPlaceTree, findPlaceByPath, placeKey, type PlaceTree } from '../../lib/places'
import type { PhysicalPlace } from '../../lib/types'

/**
 * The tree of physical places, loaded whole (ADR-006).
 *
 * It replaces the list of distinct `physical_location` strings that used to be
 * scraped out of the artworks table as suggestions. The difference is not the
 * query: it is that a place now has an identity, so renaming one is an update of
 * one row that the whole catalog sees, and moving a shelf does not touch a
 * single artwork.
 *
 * One query serves the four consumers — the record, the capture flow, the list
 * filter and the places screen — for the same reason as in useSeries: there are
 * dozens of nodes, and each of them asking separately would be four requests to
 * paint the same eight rows.
 *
 * **Retired places are loaded too.** They are needed to read the location of an
 * artwork that still points at one, and to un-tick a filter that names one; who
 * hides them is whoever shows a list of options, not this hook. Hiding them here
 * would leave the record with a blank space where a place used to be, which is
 * the one thing this application does not do.
 */
export function usePhysicalPlaces() {
  const [places, setPlaces] = useState<PhysicalPlace[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    const { data, error } = await supabase
      .from('physical_places')
      .select('id, parent_id, name, active')
    setLoading(false)
    if (error) {
      setError(error.message)
      return
    }
    setError(null)
    setPlaces((data ?? []) as PhysicalPlace[])
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  const tree = useMemo(() => buildPlaceTree(places), [places])

  /**
   * Creates the place `levels` names, and whatever is missing above it, and
   * answers its identifier.
   *
   * This is what the selector calls: the cataloger types «Castelar 4, mesa de
   * Mario» with the artwork in front of them, and what has to come out is one
   * node hanging from the other, without a ceremony per level. What already
   * exists is reused — compared with `placeKey`, the same rule the database
   * indexes by — so typing a path that is already there picks it instead of
   * failing.
   *
   * Losing the race against someone else creating the same place is a success:
   * the answer is that place's identifier. That is why a unique violation
   * re-reads instead of complaining, the same way addSeries does.
   */
  const ensurePlace = useCallback(
    async (levels: readonly string[]): Promise<{ id: string } | { error: string }> => {
      if (levels.length === 0) return { error: 'Escribe el nombre del lugar' }

      let known = buildPlaceTree(places)
      let parent: string | null = null

      for (const level of levels) {
        // Annotated because `parent` is reassigned from it, and inference would
        // chase its own tail.
        const existing: PhysicalPlace | undefined = (known.childrenOf.get(parent) ?? []).find(
          (place) => placeKey(place.name) === placeKey(level),
        )
        if (existing) {
          parent = existing.id
          continue
        }

        const { data, error } = await supabase
          .from('physical_places')
          .insert({ parent_id: parent, name: level })
          .select('id, parent_id, name, active')
          .single()

        if (error) {
          // 23505: unique violation. Someone else created it first, which is
          // what was wanted; re-read and keep walking down.
          if (error.code !== '23505') {
            return { error: `No se ha podido crear el lugar: ${error.message}` }
          }
          const { data: rows } = await supabase
            .from('physical_places')
            .select('id, parent_id, name, active')
          known = buildPlaceTree((rows ?? []) as PhysicalPlace[])
          const raced: PhysicalPlace | undefined = (known.childrenOf.get(parent) ?? []).find(
            (place) => placeKey(place.name) === placeKey(level),
          )
          if (!raced) return { error: 'No se ha podido crear el lugar' }
          parent = raced.id
          continue
        }

        const created = data as PhysicalPlace
        known = buildPlaceTree([...known.byId.values(), created])
        parent = created.id
      }

      await reload()
      // Unreachable with a non-empty path: every level either found its place or
      // created it. Narrowing it here beats a non-null assertion.
      return parent === null ? { error: 'No se ha podido crear el lugar' } : { id: parent }
    },
    [places, reload],
  )

  /**
   * Creates ONE place with the name given, verbatim, inside `parentId`.
   *
   * Separate from `ensurePlace` because the name is not a path: it may contain
   * commas — «c/Colón 11-1C, 2ºB» — and going through a path would split it. And
   * the parent travels as an identifier and not as a branch of names, for the
   * same reason: a name is not an identity (ADR-006), and rebuilding the parent
   * by parsing its own path text would reintroduce exactly the ambiguity the
   * decision removed.
   */
  const addPlaceInside = useCallback(
    async (
      parentId: string | null,
      name: string,
    ): Promise<{ id: string } | { error: string }> => {
      const clean = name.trim()
      if (clean === '') return { error: 'Escribe el nombre del lugar' }

      const { data, error } = await supabase
        .from('physical_places')
        .insert({ parent_id: parentId, name: clean })
        .select('id')
        .single()

      if (error) {
        if (error.code === '23505') return { error: 'Ya hay un lugar con ese nombre ahí dentro' }
        return { error: `No se ha podido crear el lugar: ${error.message}` }
      }
      await reload()
      return { id: (data as { id: string }).id }
    },
    [reload],
  )

  /**
   * Renames a place. The name travels as it is written; the database compares it
   * normalized against its siblings and refuses a duplicate, and that rejection
   * is what this turns into a sentence the cataloger can act on.
   */
  const renamePlace = useCallback(
    async (id: string, name: string): Promise<string | null> => {
      const clean = name.trim()
      if (clean === '') return 'El nombre no puede quedar vacío'
      const { error } = await supabase.from('physical_places').update({ name: clean }).eq('id', id)
      if (error) {
        if (error.code === '23505') return 'Ya hay un lugar con ese nombre en el mismo sitio'
        return `No se ha podido renombrar: ${error.message}`
      }
      await reload()
      return null
    },
    [reload],
  )

  /**
   * Hangs a place from another one, or from nothing to make it a root.
   *
   * The database refuses the cycle — a shelf inside its own drawer — with a
   * message in Spanish, and it is that message that gets shown: the check has to
   * live where the data does, and repeating it here would be a second rule to
   * keep in step. What this does do is refuse the obvious case before spending a
   * request on it.
   */
  const movePlace = useCallback(
    async (id: string, parentId: string | null): Promise<string | null> => {
      if (parentId === id) return 'Un lugar no puede estar dentro de sí mismo'
      const { error } = await supabase
        .from('physical_places')
        .update({ parent_id: parentId })
        .eq('id', id)
      if (error) {
        if (error.code === '23505') return 'Ya hay un lugar con ese nombre en el destino'
        return error.message
      }
      await reload()
      return null
    },
    [reload],
  )

  /**
   * Retires a place, or brings it back (RF-901: nothing is ever really
   * deleted). The database refuses to retire one that still has places or
   * artworks inside, and says so with a hint about what to do first.
   */
  const setPlaceActive = useCallback(
    async (id: string, active: boolean): Promise<string | null> => {
      const { error } = await supabase.from('physical_places').update({ active }).eq('id', id)
      if (error) return error.message
      await reload()
      return null
    },
    [reload],
  )

  /** The place a comma-separated path names, or null. For the legacy links. */
  const placeByPath = useCallback(
    (levels: readonly string[]) => findPlaceByPath(tree, levels),
    [tree],
  )

  return {
    places,
    tree: tree as PlaceTree,
    loading,
    error,
    reload,
    ensurePlace,
    addPlaceInside,
    renamePlace,
    movePlace,
    setPlaceActive,
    placeByPath,
  }
}
