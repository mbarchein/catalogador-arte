/**
 * Rescata un año buscable de un texto libre de fecha.
 *
 * Desde ADR-004 la fecha vive en campos estructurados y esta función solo actúa
 * sobre `fecha_nota` —la redacción a mano que la estructura no representa—:
 * «hacia 1972, quizá» sigue apareciendo al buscar los setenta porque de aquí
 * sale su `anio_inicio`. Criterio heredado del esquema: el primer año plausible
 * del texto.
 */
export function anioParaBuscar(texto: string): number | null {
  const encontrado = texto.match(/\d{4}/)
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
