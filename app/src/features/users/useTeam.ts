import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { UserRole } from '../../lib/types'
import type { TeamMember } from './team'
import { userFailureText, userWriteResult } from './userMessages'

const COLUMNS = 'id, email, name, role, active'

/**
 * El equipo, para la pantalla que lo administra (RF-1107).
 *
 * Sin espejo local, a diferencia del resto de los listados de la aplicación, y es una
 * decisión y no un olvido: son cuatro filas que se abren unas pocas veces al año, y lo que
 * un espejo ahorraría —medio segundo— no compensa dejar en el navegador de un dispositivo
 * compartido la lista de quién entra al catálogo y con qué permisos.
 *
 * Cada escritura contesta null si entró y una frase si no. La comprobación de cuántas
 * filas se tocaron **no es prudencia**: sobre la fila de otra persona, a quien no
 * administra la política le filtra la fila y la base contesta cero filas sin ningún error
 * (medido; ver `userMessages`).
 */
export function useTeam() {
  const [members, setMembers] = useState<TeamMember[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    const { data, error: failure } = await supabase.from('profiles').select(COLUMNS)
    setLoading(false)
    if (failure) {
      setError(userFailureText(failure, 'load'))
      return
    }
    setError(null)
    setMembers((data ?? []) as unknown as TeamMember[])
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  /** Manda un cambio y vuelve a leer. `select('id')` para poder contar lo escrito. */
  const write = useCallback(
    async (
      id: string,
      patch: Record<string, unknown>,
      operation: 'role' | 'access',
    ): Promise<string | null> => {
      const { data, error: failure } = await supabase
        .from('profiles')
        .update(patch)
        .eq('id', id)
        .select('id')
      const said = userWriteResult(operation, {
        failure,
        rows: (data ?? []).length,
      })
      if (said === null) await reload()
      return said
    },
    [reload],
  )

  return {
    members,
    loading,
    error,
    reload,
    setRole: (id: string, role: UserRole) => write(id, { role }, 'role'),
    setAccess: (id: string, active: boolean) => write(id, { active }, 'access'),
  }
}
