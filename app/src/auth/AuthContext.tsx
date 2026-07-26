import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { Perfil } from '../lib/tipos'

interface ContextoAuth {
  sesion: Session | null
  perfil: Perfil | null
  cargando: boolean
  /** RF-103: solo Catalogador y Superusuario escriben. */
  puedeEditar: boolean
  salir: () => Promise<void>
}

const Contexto = createContext<ContextoAuth | null>(null)

export function ProveedorAuth({ children }: { children: ReactNode }) {
  const [sesion, setSesion] = useState<Session | null>(null)
  const [perfil, setPerfil] = useState<Perfil | null>(null)
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSesion(data.session)
      setCargando(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_evento, nuevaSesion) => {
      setSesion(nuevaSesion)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!sesion) {
      setPerfil(null)
      return
    }
    supabase
      .from('perfiles')
      .select('id, email, nombre, rol')
      .eq('id', sesion.user.id)
      .single()
      .then(({ data }) => setPerfil(data as Perfil | null))
  }, [sesion])

  // El rol se lee del perfil, pero es la base de datos la que decide de verdad.
  // Esto solo sirve para no mostrar controles que van a fallar (RF-106): la
  // protección real son las políticas RLS, no este booleano.
  const puedeEditar = perfil?.rol === 'CATALOGADOR' || perfil?.rol === 'SUPERUSUARIO'

  return (
    <Contexto.Provider
      value={{
        sesion,
        perfil,
        cargando,
        puedeEditar,
        salir: async () => {
          await supabase.auth.signOut()
        },
      }}
    >
      {children}
    </Contexto.Provider>
  )
}

export function useAuth(): ContextoAuth {
  const ctx = useContext(Contexto)
  if (!ctx) throw new Error('useAuth debe usarse dentro de ProveedorAuth')
  return ctx
}
