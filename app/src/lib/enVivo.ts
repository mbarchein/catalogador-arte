import { useEffect, useRef } from 'react'
import { supabase } from './supabase'

/**
 * Vistas en vivo: ejecuta `alCambiar` cuando cambian filas de una tabla, por
 * WebSocket (Supabase Realtime). La entrega ya viene filtrada por RLS con el
 * JWT del usuario: nadie recibe por el canal lo que no podría consultar.
 *
 * El patrón es el de la otra aplicación del equipo: el evento no trae la verdad,
 * dispara una recarga. Reconstruir el estado desde el payload del evento parece
 * más eficiente y es la fuente clásica de vistas desincronizadas — la recarga
 * pide los datos con la misma consulta de siempre, políticas incluidas.
 */
export function useCambiosEnVivo(
  tabla: 'obras' | 'imagenes',
  alCambiar: () => void,
  filtro?: string,
) {
  // El callback vive en una ref para no resuscribir el canal en cada render:
  // abrir y cerrar WebSockets al ritmo de React es ruido para el servidor y
  // pierde eventos en las ventanas entre canal y canal.
  const ref = useRef(alCambiar)
  ref.current = alCambiar

  useEffect(() => {
    const canal = supabase
      .channel(`en-vivo:${tabla}:${filtro ?? 'todo'}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: tabla, ...(filtro ? { filter: filtro } : {}) },
        () => ref.current(),
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(canal)
    }
  }, [tabla, filtro])
}
