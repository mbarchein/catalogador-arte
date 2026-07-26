/**
 * RF-207: `fecha_ejecucion` es texto libre porque la fecha de una obra rara vez
 * es un dato limpio — puede ser exacta, un rango, una aproximación o un rango
 * aproximado. `fecha_orden` es el número auxiliar que permite ordenar y filtrar
 * ese texto ambiguo, y no se publica nunca.
 *
 * Criterio del esquema: se toma el año de inicio del rango, o el año aproximado.
 *   "1978"          → 1978
 *   "1975-1978"     → 1975
 *   "c. 1980"       → 1980
 *   "c. 1975-1978"  → 1975
 */
export function derivarFechaOrden(fechaEjecucion: string): number | null {
  const encontrado = fechaEjecucion.match(/\d{4}/)
  if (!encontrado) return null

  const anio = Number(encontrado[0])
  // Un año fuera de rango plausible es una errata de teclado, no una fecha. El
  // fondo más antiguo posible es del siglo XX, así que cualquier cosa anterior a
  // 1800 o posterior al año que viene es sospechosa y es mejor no ordenar por
  // ella que ordenar mal y en silencio.
  const limiteSuperior = new Date().getFullYear() + 1
  if (anio < 1800 || anio > limiteSuperior) return null

  return anio
}

/**
 * Texto de la fecha para mostrar. Si no hay dato, se dice explícitamente en vez
 * de dejar un hueco (criterio general: nunca un blanco sin explicación).
 */
export function mostrarFecha(fechaEjecucion: string): string {
  return fechaEjecucion.trim() === '' ? 'Sin fecha' : fechaEjecucion
}
