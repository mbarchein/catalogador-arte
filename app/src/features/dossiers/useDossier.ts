/**
 * One dossier and everything it holds, with the writes that arm it (RF-1600).
 *
 * Two queries and not one: the dossier and its items are two lists that change at
 * different rates —the header is edited once, the items move all afternoon— and a
 * single embedded query would reload the whole thing on every move. What they do
 * share is `reload`, because the count in the header comes from the items.
 *
 * **Every add goes through the database's function and not through an insert.**
 * `add_artwork_to_dossier` restores a withdrawn item instead of colliding against
 * the uniqueness (RF-1612), `add_text_to_dossier` refuses an empty text with a
 * sentence, and `add_biography_to_dossier` refuses the second biography of the
 * same fund. Writing the rows from here would be reimplementing those three rules
 * in a client that cannot enforce them.
 *
 * The order is `reorder_dossier_items`, all or nothing: it takes the whole list of
 * active items, so the caller sends what it loaded and the database checks it
 * against what is really there. A stale list is refused whole instead of leaving
 * half an order.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { ArtistFund } from '../../lib/types'
import { DOSSIER_COLUMNS, type DossierRow } from './dossierIndex'
import { DOSSIER_ITEM_COLUMNS, activeOrder, movedOrder, type DossierItemRow } from './dossierItems'
import {
  currentOrder,
  groupedOrder,
  movedSectionOrder,
  seriesGroupPlan,
} from './dossierSections'
import { dossierFailureText, dossierWriteResult } from './dossierMessages'

/** What can be corrected on the header of a dossier. All optional: the panel sends what changed. */
export interface DossierPatch {
  title?: string
  purpose?: string
  note?: string
  cover_text?: string
  recipient_party_id?: string | null
  show_provenance?: boolean
  show_exhibitions?: boolean
  show_bibliography?: boolean
  show_prices?: boolean
  show_index?: boolean
  active?: boolean
}

/** What can be corrected on one item: its price, its note and which shot it fixes. */
export interface ItemPatch {
  price?: number | null
  note?: string
  image_id?: string | null
  heading?: string
  body?: string
  with_cv?: boolean
  divider_page?: boolean
  active?: boolean
}

export interface DossierQuery {
  dossier: DossierRow | null
  items: DossierItemRow[]
  loading: boolean
  error: string | null
  reload: () => Promise<void>
  save: (patch: DossierPatch) => Promise<string | null>
  addArtwork: (catalogId: string) => Promise<string | null>
  addText: (heading: string, body: string) => Promise<string | null>
  addBiography: (fund: ArtistFund, withCv: boolean) => Promise<string | null>
  addSection: (heading: string, body: string, dividerPage: boolean) => Promise<string | null>
  editItem: (id: string, patch: ItemPatch) => Promise<string | null>
  removeItem: (id: string) => Promise<string | null>
  /** One place up or down. Resolves to null when there was nothing to move — no write is spent. */
  moveItem: (id: string, direction: 'up' | 'down') => Promise<string | null>
  /** Una sección ENTERA, con sus obras dentro, un puesto arriba o abajo (RF-1620). */
  moveSection: (sectionId: string, direction: 'up' | 'down') => Promise<string | null>
  /**
   * Agrupa las obras por su serie, de una vez (RF-1623). Resuelve a los rótulos que
   * han salido, o al mensaje de por qué no se ha podido.
   */
  groupBySeries: () => Promise<{ sections: string[] } | { message: string }>
}

export function useDossier(id: string | undefined): DossierQuery {
  const [dossier, setDossier] = useState<DossierRow | null>(null)
  const [items, setItems] = useState<DossierItemRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  // The items are read from a ref as well as from state: a move computes the order
  // from the rows that are loaded RIGHT NOW, and two taps in a row must not both
  // compute from the same stale render.
  const loaded = useRef<DossierItemRow[]>([])

  const reload = useCallback(async () => {
    if (id === undefined) {
      setLoading(false)
      return
    }
    setLoading(true)
    const [head, list] = await Promise.all([
      supabase
        .from('dossiers')
        .select(`${DOSSIER_COLUMNS}, recipient:parties(id, name)`)
        .eq('id', id)
        .single(),
      supabase.from('dossier_items').select(DOSSIER_ITEM_COLUMNS).eq('dossier_id', id),
    ])
    if (!alive.current) return
    setLoading(false)

    if (head.error) {
      setError(dossierFailureText(head.error, 'loadOne'))
      return
    }
    if (list.error) {
      // The header did load, so it is painted: half a screen that says what is
      // missing beats an error page over a dossier that is perfectly readable.
      setDossier(head.data as unknown as DossierRow)
      setError(dossierFailureText(list.error, 'loadItems'))
      return
    }
    setError(null)
    setDossier(head.data as unknown as DossierRow)
    const rows = (list.data ?? []) as unknown as DossierItemRow[]
    loaded.current = rows
    setItems(rows)
  }, [id])

  useEffect(() => {
    void reload()
  }, [reload])

  const save = useCallback(
    async (patch: DossierPatch): Promise<string | null> => {
      if (id === undefined) return null
      const { data, error: failure } = await supabase
        .from('dossiers')
        .update(patch)
        .eq('id', id)
        .select('id')
      const message = dossierWriteResult(
        patch.active === undefined ? 'save' : patch.active ? 'restore' : 'retire',
        { failure, rows: (data ?? []).length },
      )
      await reload()
      return message
    },
    [id, reload],
  )

  const addArtwork = useCallback(
    async (catalogId: string): Promise<string | null> => {
      if (id === undefined) return null
      const { error: failure } = await supabase.rpc('add_artwork_to_dossier', {
        p_dossier_id: id,
        p_catalog_id: catalogId,
      })
      const message = dossierWriteResult('addArtwork', { failure })
      await reload()
      return message
    },
    [id, reload],
  )

  const addText = useCallback(
    async (heading: string, body: string): Promise<string | null> => {
      if (id === undefined) return null
      const { error: failure } = await supabase.rpc('add_text_to_dossier', {
        p_dossier_id: id,
        p_heading: heading,
        p_body: body,
      })
      const message = dossierWriteResult('addText', { failure })
      await reload()
      return message
    },
    [id, reload],
  )

  const addBiography = useCallback(
    async (fund: ArtistFund, withCv: boolean): Promise<string | null> => {
      if (id === undefined) return null
      const { error: failure } = await supabase.rpc('add_biography_to_dossier', {
        p_dossier_id: id,
        p_artist_fund: fund,
        p_with_cv: withCv,
      })
      const message = dossierWriteResult('addBiography', { failure })
      await reload()
      return message
    },
    [id, reload],
  )

  const addSection = useCallback(
    async (heading: string, body: string, dividerPage: boolean): Promise<string | null> => {
      if (id === undefined) return null
      const { error: failure } = await supabase.rpc('add_section_to_dossier', {
        p_dossier_id: id,
        p_heading: heading,
        p_body: body,
        p_divider_page: dividerPage,
      })
      const message = dossierWriteResult('addSection', { failure })
      await reload()
      return message
    },
    [id, reload],
  )

  const editItem = useCallback(
    async (itemId: string, patch: ItemPatch): Promise<string | null> => {
      const { data, error: failure } = await supabase
        .from('dossier_items')
        .update(patch)
        .eq('id', itemId)
        .select('id')
      const message = dossierWriteResult(
        patch.active === false ? 'removeItem' : 'editItem',
        { failure, rows: (data ?? []).length },
      )
      await reload()
      return message
    },
    [reload],
  )

  /**
   * Quitting an item is a logical deletion and nothing else (RF-901): `active` to
   * false, with the database stamping who and when.
   *
   * The position it held is deliberately left alone. It is dead while the item is
   * out — nothing reads it — and the next `reorder` rewrites 1..n over the active
   * ones anyway, so touching it here would be a write with no reader.
   */
  const removeItem = useCallback(
    (itemId: string): Promise<string | null> => editItem(itemId, { active: false }),
    [editItem],
  )

  const moveItem = useCallback(
    async (itemId: string, direction: 'up' | 'down'): Promise<string | null> => {
      if (id === undefined) return null
      const order = movedOrder(activeOrder(loaded.current), itemId, direction)
      // Nothing to move: the first item going up, or an item that is not in the
      // live list. No write, and no message — the buttons are already disabled at
      // the ends, so this is the race, not a mistake to report.
      if (order === null) return null
      const { error: failure } = await supabase.rpc('reorder_dossier_items', {
        p_dossier_id: id,
        p_line_ids: order,
      })
      const message = dossierWriteResult('reorder', { failure })
      await reload()
      return message
    },
    [id, reload],
  )

  const moveSection = useCallback(
    async (sectionId: string, direction: 'up' | 'down'): Promise<string | null> => {
      if (id === undefined) return null
      const order = movedSectionOrder(loaded.current, sectionId, direction)
      // Nada que mover: la primera sección hacia arriba, o la última hacia abajo. Sin
      // escritura y sin mensaje — los botones ya están apagados en los extremos.
      if (order === null) return null
      const { error: failure } = await supabase.rpc('reorder_dossier_items', {
        p_dossier_id: id,
        p_line_ids: order,
      })
      const message = dossierWriteResult('reorder', { failure })
      await reload()
      return message
    },
    [id, reload],
  )

  /**
   * Agrupar por serie: crear los rótulos que falten y colocar todo debajo (RF-1623).
   *
   * **Dos escrituras y en este orden**, y el orden es la garantía: primero se crean
   * las secciones —que caen al final del dossier— y solo después se reordena, que es
   * todo-o-nada. Si algo falla creando un rótulo, lo que queda es un dossier con
   * rótulos al final, **visible y arreglable a mano**; nunca uno reordenado a medias.
   * Se dice, además, en vez de dejarlo callado.
   */
  const groupBySeries = useCallback(async (): Promise<
    { sections: string[] } | { message: string }
  > => {
    if (id === undefined) return { sections: [] }
    const plan = seriesGroupPlan(loaded.current)
    if (plan.blocked !== null) return { message: plan.blocked }

    const created: Record<string, string> = {}
    for (const heading of plan.create) {
      const { data, error: failure } = await supabase
        .rpc('add_section_to_dossier', {
          p_dossier_id: id,
          p_heading: heading,
          p_body: '',
          p_divider_page: false,
        })
        .select('id, heading')
      const rows = (data ?? []) as { id: string; heading: string }[]
      const row = rows[0]
      if (failure || row === undefined) {
        await reload()
        return {
          message: `${dossierFailureText(failure ?? { message: 'sin respuesta' }, 'addSection')} Los rótulos que se hayan creado están al final del dossier.`,
        }
      }
      created[heading] = row.id
    }

    // Las que ya existían, por su rótulo: agrupar dos veces no duplica nada.
    for (const row of loaded.current) {
      if (row.kind === 'SECTION' && row.active) created[row.heading.trim()] ??= row.id
    }

    // Se releen las filas antes de calcular el orden: las secciones recién creadas no
    // están en `loaded.current`, y `reorder_dossier_items` exige la lista COMPLETA de
    // los activos — mandar una a la que le faltan cuatro rótulos se rechaza entera.
    const { data: fresh } = await supabase
      .from('dossier_items')
      .select(DOSSIER_ITEM_COLUMNS)
      .eq('dossier_id', id)
    const rows = (fresh ?? []) as unknown as DossierItemRow[]
    const order = groupedOrder(rows, created)
    // Cinturón: si el orden calculado no cubre exactamente los activos, no se manda.
    // La base lo rechazaría de todas formas, y así el mensaje es una frase.
    if (order.length !== currentOrder(rows).length) {
      await reload()
      return {
        message:
          'Los rótulos se han creado pero no se han podido colocar. Están al final del dossier: ' +
          'muévelos a mano o vuelve a agrupar.',
      }
    }

    const { error: failure } = await supabase.rpc('reorder_dossier_items', {
      p_dossier_id: id,
      p_line_ids: order,
    })
    await reload()
    if (failure) {
      return {
        message: `${dossierFailureText(failure, 'reorder')} Los rótulos están al final del dossier.`,
      }
    }
    return { sections: plan.create }
  }, [id, reload])

  return {
    dossier,
    items,
    loading,
    error,
    reload,
    save,
    addArtwork,
    addText,
    addBiography,
    addSection,
    editItem,
    removeItem,
    moveItem,
    moveSection,
    groupBySeries,
  }
}
