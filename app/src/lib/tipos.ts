// Tipos del dominio, con los nombres del esquema de campos sin traducir: el
// esquema es el vocabulario del proyecto (ver CLAUDE.md).
//
// Escritos a mano por ahora. RNF-102 prevé generarlos desde el esquema con la
// CLI de Supabase (`supabase gen types typescript`), que necesita el proyecto
// remoto ya creado. Hasta entonces, cualquier cambio en la migración obliga a
// tocar este fichero: es el punto donde el esquema y el frontend pueden
// desincronizarse sin que nadie avise.

export type FondoArtista = 'ROTILI' | 'RUIZ_CAMPINS'
export type RolUsuario = 'SUPERUSUARIO' | 'CATALOGADOR' | 'LECTOR'
export type TriEstado = 'SI' | 'NO' | 'SIN_REVISAR'
export type ValorTituloAtribuido = 'NO_APLICA' | 'NO' | 'SI' | 'SIN_REVISAR'

export type ValorTipoToma =
  | 'GENERAL'
  | 'DETALLE_FIRMA'
  | 'REVERSO'
  | 'DETALLE_DANO'
  | 'MARCO'
  | 'OTRO'

export type ValorEstadoConservacion =
  | 'BUENO'
  | 'REGULAR'
  | 'REQUIERE_RESTAURACION'
  | 'REQUIERE_RESTAURACION_URGENTE'
  | 'SIN_REVISAR'

export type ValorEstadoExistencia =
  | 'CONSERVADA'
  | 'DESTRUIDA'
  | 'PERDIDA'
  | 'DESCONOCIDO'
  | 'SIN_REVISAR'

export interface Perfil {
  id: string
  email: string
  nombre: string
  rol: RolUsuario
}

export interface Obra {
  id_catalogacion: string
  artista: FondoArtista
  titulo: string
  titulo_atribuido: ValorTituloAtribuido
  tipo_obra: string
  /** Generada por la base desde los campos estructurados. Solo lectura. */
  fecha_ejecucion: string
  anio_inicio: number | null
  anio_fin: number | null
  fecha_aproximada: boolean
  fecha_sin_confirmar: boolean
  fecha_nota: string
  tecnica: string
  soporte: string
  alto_cm: number | null
  ancho_cm: number | null
  profundidad_cm: number | null
  firmada: TriEstado
  firma_descripcion: string
  fechada_en_obra: TriEstado
  estado_conservacion: ValorEstadoConservacion
  ubicacion_fisica: string
  estado_existencia: ValorEstadoExistencia
  fotografiada: boolean
  medidas_verificadas: boolean
  fase_inventario_completada: boolean
  fase_documentacion_completada: boolean
  ficha_catalografica_completa: boolean
  notas_proceso_inventario: string
  fecha_actualizacion: string
  fecha_actualizacion_basica: string | null
  actualizado_por: string | null
  activo: boolean
}

/** Lo mínimo que la captura rápida necesita para crear una ficha (RF-1204). */
export type ObraNueva = Pick<Obra, 'artista'> & Partial<Omit<Obra, 'artista'>>

// ── Etiquetas para la interfaz ───────────────────────────────
// El valor guardado es un código estable; lo que se lee en pantalla se decide
// aquí. Así, renombrar una etiqueta no obliga a migrar datos.

export const ETIQUETA_ARTISTA: Record<FondoArtista, string> = {
  ROTILI: 'Alberto Rotili',
  RUIZ_CAMPINS: 'María Ruiz Campins',
}

export const ETIQUETA_TRI_ESTADO: Record<TriEstado, string> = {
  SI: 'Sí',
  NO: 'No',
  SIN_REVISAR: 'Sin revisar',
}

export const ETIQUETA_TITULO_ATRIBUIDO: Record<ValorTituloAtribuido, string> = {
  NO_APLICA: 'No aplica (sin título)',
  NO: 'No, es título del artista',
  SI: 'Sí, nombre de conveniencia',
  SIN_REVISAR: 'Sin revisar',
}

export const ETIQUETA_CONSERVACION: Record<ValorEstadoConservacion, string> = {
  BUENO: 'Bueno',
  REGULAR: 'Regular',
  REQUIERE_RESTAURACION: 'Requiere restauración',
  REQUIERE_RESTAURACION_URGENTE: 'Requiere restauración urgente',
  SIN_REVISAR: 'Sin revisar',
}

export const ETIQUETA_EXISTENCIA: Record<ValorEstadoExistencia, string> = {
  CONSERVADA: 'Conservada',
  DESTRUIDA: 'Destruida',
  PERDIDA: 'Perdida (paradero desconocido)',
  DESCONOCIDO: 'Estado desconocido',
  SIN_REVISAR: 'Sin revisar',
}

/**
 * Lista abierta de tipos de obra (RF-213 y esquema v11): sugerencias, no un
 * cierre. El campo es texto libre y admite cualquier valor nuevo sin migrar nada.
 */
export const TIPOS_OBRA_SUGERIDOS = [
  'Pintura',
  'Dibujo',
  'Escultura',
  'Collage',
  'Grabado',
  'Técnica mixta',
]


/**
 * Tipos de toma fotográfica. Lista corta y a propósito: en la captura hay que
 * poder elegir de un toque, y el esquema la deja abierta con «Otro» para lo que no
 * encaje en vez de obligar a decidir la taxonomía completa por adelantado.
 */
export const ETIQUETA_TIPO_TOMA: Record<ValorTipoToma, string> = {
  GENERAL: 'General',
  DETALLE_FIRMA: 'Firma',
  REVERSO: 'Reverso',
  DETALLE_DANO: 'Daño',
  MARCO: 'Marco',
  OTRO: 'Otro',
}
