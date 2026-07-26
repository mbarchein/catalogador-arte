import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { FondoArtista, Obra } from '../../lib/tipos'

const CAMPOS = `
  id_catalogacion, artista, titulo, titulo_atribuido, tipo_obra,
  fecha_ejecucion, fecha_orden, tecnica, soporte,
  alto_cm, ancho_cm, profundidad_cm,
  firmada, firma_descripcion, fechada_en_obra,
  estado_conservacion, ubicacion_fisica, estado_existencia,
  fotografiada, medidas_verificadas, fase_inventario_completada, fase_documentacion_completada,
  ficha_catalografica_completa, notas_proceso_inventario,
  fecha_actualizacion, fecha_actualizacion_basica, actualizado_por, activo
`

export function useObras(busqueda: string) {
  const [obras, setObras] = useState<Obra[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const recargar = useCallback(async () => {
    setCargando(true)
    setError(null)

    let consulta = supabase
      .from('obras')
      .select(CAMPOS)
      // RF-609: las fichas dadas de baja no aparecen en el listado. La política
      // RLS ya las oculta al Lector, pero un catalogador sí las ve, así que el
      // filtro explícito hace falta también aquí.
      .eq('activo', true)
      // RF-207: se ordena por el campo auxiliar, no por el texto de la fecha.
      .order('fecha_orden', { ascending: true, nullsFirst: false })
      .order('id_catalogacion', { ascending: true })

    const termino = busqueda.trim()
    if (termino !== '') {
      // RF-602: la búsqueda de texto libre mira identificador y título.
      // `titulos_alt` se añadirá cuando exista el campo.
      const patron = `%${termino}%`
      consulta = consulta.or(`id_catalogacion.ilike.${patron},titulo.ilike.${patron}`)
    }

    const { data, error } = await consulta
    if (error) {
      setError(error.message)
      setObras([])
    } else {
      setObras((data ?? []) as unknown as Obra[])
    }
    setCargando(false)
  }, [busqueda])

  useEffect(() => {
    void recargar()
  }, [recargar])

  return { obras, cargando, error, recargar }
}

export function useObra(id: string | undefined) {
  const [obra, setObra] = useState<Obra | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const recargar = useCallback(async () => {
    if (!id) return
    setCargando(true)
    const { data, error } = await supabase
      .from('obras')
      .select(CAMPOS)
      .eq('id_catalogacion', id)
      .maybeSingle()
    if (error) setError(error.message)
    setObra((data ?? null) as unknown as Obra | null)
    setCargando(false)
  }, [id])

  useEffect(() => {
    void recargar()
  }, [recargar])

  return { obra, cargando, error, recargar }
}

/**
 * Previsualiza el identificador que se asignaría (DP-01). No lo reserva: entre
 * la consulta y el guardado, otro catalogador puede haber creado una ficha. El
 * número definitivo lo pone la base de datos, con un cerrojo por fondo, y es el
 * que devuelve `crearObra`.
 */
export async function previsualizarId(artista: FondoArtista): Promise<string | null> {
  const { data, error } = await supabase.rpc('siguiente_id_catalogacion', { p_artista: artista })
  return error ? null : (data as string)
}
