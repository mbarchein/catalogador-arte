import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { ArtistFund } from '../../lib/types'
import { sortFunds, type ArtistFundEntry } from './artistFunds'

const COLUMNS = 'id, code, prefix, name, active, hide_artworks'

interface FundRow {
  id: string
  code: ArtistFund
  prefix: string
  name: string
  active: boolean
  hide_artworks: boolean
}

const shape = (row: FundRow): ArtistFundEntry => ({
  id: row.id,
  code: row.code,
  prefix: row.prefix,
  name: row.name,
  active: row.active,
  hideArtworks: row.hide_artworks,
})

/**
 * Lo que la base contesta cuando se niega, en español.
 *
 * Los dos disparadores de esta tabla —el que protege el código y el prefijo, y el
 * que impide quedarse sin fondos— hablan español y dicen qué hacer, así que su
 * mensaje se enseña tal cual. Reescribirlo aquí sería una segunda copia de una
 * regla que vive al lado del dato.
 */
function describeFailure(action: 'load' | 'save', failure: { message?: string }): string {
  const said = (failure.message ?? '').trim()
  if (action === 'load') {
    return said === ''
      ? 'No se han podido leer los fondos.'
      : `No se han podido leer los fondos: ${said}`
  }
  return said === '' ? 'No se ha podido guardar el cambio.' : said
}

/**
 * Los fondos del catálogo (ADR-007, segunda entrega).
 *
 * **Se leen todos, activos y retirados, y eso no es una excepción de esta pantalla
 * sino de la tabla**: el fondo lo lleva toda obra, así que la fila retirada tiene
 * que seguir llegando o la ficha de una obra de ese fondo se quedaría sin nombre.
 * La política de lectura de la base dice lo mismo, y hay un test que lo fija.
 *
 * Sin `addFund` y sin borrado: un fondo nuevo es una migración —trae prefijo, y el
 * prefijo entra en la numeración y en la firma de los ficheros del archivo— y
 * ninguno se borra. La base tampoco concede esos privilegios, así que esto no es
 * solo una omisión de la interfaz.
 */
export function useArtistFunds() {
  const [entries, setEntries] = useState<ArtistFundEntry[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    const { data, error: failure } = await supabase.from('artist_funds').select(COLUMNS)
    setLoading(false)
    if (failure) {
      setError(describeFailure('load', failure))
      return
    }
    setError(null)
    setEntries(sortFunds(((data ?? []) as FundRow[]).map(shape)))
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  /** Manda un solo campo y recarga. Responde null cuando entró. */
  const write = useCallback(
    async (id: string, patch: Record<string, unknown>): Promise<string | null> => {
      // `select('id')` por lo que ya aprendieron las otras pantallas de
      // mantenimiento: una actualización que las políticas deniegan vuelve 204 sin
      // error, y cero filas afectadas significa que no se escribió.
      const { data, error: failure } = await supabase
        .from('artist_funds')
        .update(patch)
        .eq('id', id)
        .select('id')
      if (failure) return describeFailure('save', failure)
      if ((data ?? []).length === 0) {
        return 'No se ha podido guardar el cambio: tu cuenta es de solo consulta.'
      }
      await reload()
      return null
    },
    [reload],
  )

  return {
    entries,
    loading,
    error,
    reload,
    renameFund: (id: string, name: string) => write(id, { name: name.trim() }),
    setFundActive: (id: string, active: boolean) => write(id, { active }),
    setFundHidesArtworks: (id: string, hide: boolean) => write(id, { hide_artworks: hide }),
  }
}
