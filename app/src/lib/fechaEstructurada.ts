/**
 * `fecha_ejecucion` es y sigue siendo texto libre (RF-207): el esquema lo quiso
 * así porque la fecha de una obra rara vez es un dato limpio. Pero los cuatro
 * formatos acordados se pueden componer con controles táctiles, sin teclear:
 *
 *   1978            año exacto
 *   1975-1978       rango
 *   c. 1980         aproximado
 *   c. 1975-1978    rango aproximado
 *
 * Componer en vez de escribir tiene dos ventajas que importan en el almacén: no
 * hay que sacar el teclado, y es imposible producir un formato inválido.
 *
 * El precio es que hay textos legítimos que estos controles no representan
 * («finales de los setenta», «1978 [?]»). Para eso existe `descomponerFecha`: si
 * devuelve null, la interfaz debe ofrecer un campo de texto y NO reescribir lo
 * que ya había. Perder un matiz que alguien escribió a mano sería peor que
 * obligarle a teclear.
 */

export interface FechaEstructurada {
  anio: number | null
  aproximada: boolean
  /** Año final del rango, o null si es una fecha única. */
  anioFin: number | null
}

export const FECHA_VACIA: FechaEstructurada = {
  anio: null,
  aproximada: false,
  anioFin: null,
}

/** Límites plausibles para la obra de los dos fondos. */
export const ANIO_MINIMO = 1900
export function anioMaximo(): number {
  return new Date().getFullYear()
}

export function componerFecha(f: FechaEstructurada): string {
  if (f.anio == null) return ''
  const prefijo = f.aproximada ? 'c. ' : ''
  // Un rango que acaba antes de empezar, o en el mismo año, no es un rango.
  if (f.anioFin == null || f.anioFin <= f.anio) return `${prefijo}${f.anio}`
  return `${prefijo}${f.anio}-${f.anioFin}`
}

/**
 * Inversa de `componerFecha`. Devuelve null si el texto no es uno de los cuatro
 * formatos, para que la interfaz no intente representarlo con los controles.
 */
export function descomponerFecha(texto: string): FechaEstructurada | null {
  const limpio = texto.trim()
  if (limpio === '') return FECHA_VACIA

  // Se acepta «c.» y «ca.», con o sin espacio, porque son las dos formas que
  // aparecen en los catálogos. Al componer se emite siempre «c. ».
  const patron = /^(c\.|ca\.)?\s*(\d{4})(?:\s*[-–]\s*(\d{4}))?$/i
  const encontrado = limpio.match(patron)
  if (!encontrado) return null

  const anio = Number(encontrado[2])
  const fin = encontrado[3] ? Number(encontrado[3]) : null

  // Un rango invertido es un error de captura, no un formato distinto: se
  // devuelve null para que la interfaz muestre el texto tal cual y alguien lo
  // arregle a conciencia.
  if (fin != null && fin <= anio) return null

  return { anio, aproximada: Boolean(encontrado[1]), anioFin: fin }
}

/** Ajusta el año dentro de los límites plausibles, para los botones + y −. */
export function ajustarAnio(anio: number | null, delta: number): number {
  const partida = anio ?? anioMaximo()
  return Math.min(anioMaximo(), Math.max(ANIO_MINIMO, partida + delta))
}

/**
 * Lo que se arrastra de una obra a la siguiente dentro de un lote. La fecha se
 * hereda porque un lote suele ser una etapa o una carpeta, no obra dispersa en
 * cincuenta años; el título y las medidas nunca, porque son de la pieza concreta
 * y heredarlos sería inventarse datos.
 */
export function fechaArrastrada(anterior: FechaEstructurada): FechaEstructurada {
  return { ...anterior }
}
