import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { UserRole } from '../../lib/types'
import type { TeamMember } from './team'
import { invitedNotice } from '../../../../supabase/functions/invite-user/invite'
import { userFailureText, userWriteResult } from './userMessages'

const COLUMNS = 'id, email, name, role, active'

/**
 * La frase que la función Edge puso en el cuerpo de su respuesta.
 *
 * `supabase.functions.invoke` envuelve el fallo en un error genérico —«Edge Function
 * returned a non-2xx status code»— y deja la respuesta dentro. Sin leerla, quien invita
 * vería esa frase en inglés en vez de «esa dirección ya tiene cuenta», que es lo único
 * que le sirve.
 */
async function readFunctionError(failure: unknown): Promise<string | null> {
  const response = (failure as { context?: Response } | null)?.context
  if (!(response instanceof Response)) return null
  try {
    const body = (await response.json()) as { error?: unknown }
    return typeof body.error === 'string' ? body.error : null
  } catch {
    return null
  }
}

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

  /**
   * Invita a una cuenta nueva (RF-112).
   *
   * Por la función Edge y no contra la base, porque crear una cuenta exige la clave de
   * servicio y esa clave no puede viajar en el cliente. La función vuelve a comprobar el
   * rol con el token de quien llama antes de usarla; aquí no hay ningún permiso.
   *
   * El enlace del correo lleva a «Nueva contraseña» con una marca, para que quien entra
   * por primera vez elija su clave en vez de aterrizar dentro del catálogo sin haberla
   * puesto nunca — que es lo que RF-112 no quiere de un enlace que vive en un buzón.
   */
  const invite = useCallback(
    async (email: string, name: string): Promise<string | null> => {
      const { error: failure } = await supabase.functions.invoke('invite-user', {
        body: {
          email,
          name,
          redirectTo: `${window.location.origin}/reset-password?invitacion=1`,
        },
      })
      if (failure) {
        // La función contesta su propia frase en español dentro del cuerpo; el cliente de
        // Supabase la envuelve y solo deja el estado a la vista, así que se lee de ahí.
        const said = await readFunctionError(failure)
        return said ?? 'No se ha podido mandar la invitación. Vuelve a intentarlo en un momento.'
      }
      await reload()
      return null
    },
    [reload],
  )

  return {
    members,
    loading,
    error,
    reload,
    invite,
    invitedNotice,
    setRole: (id: string, role: UserRole) => write(id, { role }, 'role'),
    setAccess: (id: string, active: boolean) => write(id, { active }, 'access'),
  }
}
