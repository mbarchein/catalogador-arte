import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { ChangeLogRow } from './changeEntry'

/**
 * Cuántas filas se piden de una vez.
 *
 * Son FILAS y no guardados, y la diferencia importa: un guardado que tocó ocho
 * campos son ocho filas y una sola línea en pantalla. Doscientas filas dan del
 * orden de treinta o cuarenta líneas, que es más de lo que nadie lee de un tirón
 * y suficiente para que «ver más» casi nunca haga falta.
 *
 * El índice `change_log_by_artwork_idx` es exactamente `(catalog_id, changed_at
 * desc, id desc)`, así que esta consulta lo recorre sin ordenar nada en memoria.
 */
export const CHANGE_PAGE = 200

/**
 * El registro **no tiene clave ajena a `profiles`**, y no es un olvido: está
 * argumentado en su migración. `profiles.id` cae en cascada desde `auth.users`, y
 * borrar una cuenta desde el panel es un clic; con clave ajena ese clic o falla
 * —y el registro tiene secuestrada a una persona que se fue— o alguien lo resuelve
 * borrando filas de auditoría, que es justo lo que ese diseño existe para impedir.
 *
 * La consecuencia aquí es concreta: **PostgREST no puede incrustar el perfil**, no
 * hay relación que seguir. Así que los nombres se resuelven en una segunda consulta
 * acotada a los autores que de verdad aparecen en las filas leídas, que son unos
 * pocos y no todo el equipo. Y un autor cuya cuenta ya no existe no rompe nada: se
 * queda sin nombre y la línea sigue contando qué pasó, que es lo que se quería.
 */
const COLUMNS =
  'id, change_id, entity, row_key, operation, column_name, old_value, new_value, ' +
  'changed_at, changed_by'

export interface ChangeLogState {
  readonly rows: readonly ChangeLogRow[]
  readonly loading: boolean
  readonly error: string | null
  /** Whether the base had more rows than fit on one page. */
  readonly hasMore: boolean
  readonly loadMore: () => void
  readonly reload: () => void
}

/**
 * El historial de una obra: sus cambios y los de sus fotografías, en una consulta.
 *
 * La columna `catalog_id` del registro está en las dos clases de fila —también en
 * las de una fotografía— precisamente para que el historial de una ficha sea una
 * consulta y no dos con una unión después.
 *
 * **No se pide nada hasta que `enabled` es verdadero.** El bloque de la ficha
 * llega plegado y el historial es la parte más pesada de la página: cargarlo al
 * abrir la ficha sería pagar una consulta que nadie ha pedido, con datos del
 * móvil, en la pantalla que más se abre de toda la aplicación.
 *
 * Quién puede leerlo lo decide la política de la tabla, no este código: se lee con
 * la sesión de quien mira, y una obra que no se ve no muestra su historial.
 */
export function useChangeLog(catalogId: string | undefined, enabled: boolean): ChangeLogState {
  const [rows, setRows] = useState<readonly ChangeLogRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [limit, setLimit] = useState(CHANGE_PAGE)
  const [hasMore, setHasMore] = useState(false)

  const load = useCallback(
    async (take: number) => {
      if (!catalogId) return
      setLoading(true)
      setError(null)
      // ONE row more than will be shown is asked for: it is how having more is known
      // without paying for an exact `count` over a table that only grows.
      const { data, error: failure } = await supabase
        .from('change_log')
        .select(COLUMNS)
        .eq('catalog_id', catalogId)
        .order('changed_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(take + 1)
      if (failure) {
        setError('No se ha podido leer el historial de esta obra.')
        setLoading(false)
        return
      }
      const all = (data ?? []) as unknown as ChangeLogRow[]
      const page = all.slice(0, take)

      // The authors who really appear on this page, and only those.
      const ids = [...new Set(page.map((r) => r.changed_by).filter((v): v is string => v !== null))]
      let authors = new Map<string, { name: string | null; email: string | null }>()
      if (ids.length > 0) {
        const { data: people } = await supabase
          .from('profiles')
          .select('id, name, email')
          .in('id', ids)
        // Si esta consulta falla, el historial se muestra igual sin nombres: perder
        // los nombres es peor que perder el historial, pero mucho menos malo que no
        // mostrar nada. No se convierte en un error de la pantalla.
        authors = new Map(
          ((people ?? []) as { id: string; name: string | null; email: string | null }[]).map(
            (p) => [p.id, { name: p.name, email: p.email }],
          ),
        )
      }

      setHasMore(all.length > take)
      setRows(page.map((r) => ({ ...r, author: r.changed_by ? (authors.get(r.changed_by) ?? null) : null })))
      setLoading(false)
    },
    [catalogId],
  )

  useEffect(() => {
    if (!enabled) return
    void load(limit)
  }, [enabled, limit, load])

  return {
    rows,
    loading,
    error,
    hasMore,
    loadMore: () => setLimit((n) => n + CHANGE_PAGE),
    reload: () => void load(limit),
  }
}
