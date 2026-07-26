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
 * Y sobre cualquiera de los cuatro, el sufijo `[?]` de la convención general del
 * esquema: `1978 [?]`, `c. 1975-1978 [?]`.
 *
 * **`c.` y `[?]` no son lo mismo**, y de ahí que sean dos banderas y no una:
 *
 *   - `c.` — **fecha aproximada**: la obra es de alrededor de ese año. El periodo
 *     está establecido; lo que no se conoce con exactitud es el año.
 *   - `[?]` — **fecha sin confirmar**: la fecha se desconoce, y el año que consta
 *     es una estimación.
 *
 * El sufijo se puede aplicar sobre cualquiera de los cuatro formatos, así que
 * tratar `[?]` como un quinto formato en vez de como una bandera dejaría esas
 * combinaciones sin poder expresarse.
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
  /** La obra es de alrededor de ese año. Se representa con el prefijo «c.». */
  aproximada: boolean
  /** Año final del rango, o null si es una fecha única. */
  anioFin: number | null
  /** La fecha se desconoce y el año es una estimación. Sufijo «[?]». */
  sinConfirmar: boolean
}

export const FECHA_VACIA: FechaEstructurada = {
  anio: null,
  aproximada: false,
  anioFin: null,
  sinConfirmar: false,
}

/** Límites plausibles para la obra de los dos fondos. */
export const ANIO_MINIMO = 1900
export function anioMaximo(): number {
  return new Date().getFullYear()
}

export function componerFecha(f: FechaEstructurada): string {
  if (f.anio == null) return ''
  const prefijo = f.aproximada ? 'c. ' : ''
  // El sufijo solo tiene sentido si hay un dato del que dudar: «[?]» a secas no
  // dice nada, y una obra sin fechar ya se representa con el campo vacío.
  const sufijo = f.sinConfirmar ? ' [?]' : ''
  // Un rango que acaba antes de empezar, o en el mismo año, no es un rango.
  if (f.anioFin == null || f.anioFin <= f.anio) return `${prefijo}${f.anio}${sufijo}`
  return `${prefijo}${f.anio}-${f.anioFin}${sufijo}`
}

/**
 * Inversa de `componerFecha`. Devuelve null si el texto no es uno de los formatos
 * representables, para que la interfaz no intente reescribirlo con los controles.
 */
export function descomponerFecha(texto: string): FechaEstructurada | null {
  const limpio = texto.trim()
  if (limpio === '') return FECHA_VACIA

  // Se acepta «c.» y «ca.», con o sin espacio, porque son las dos formas que
  // aparecen en los catálogos. Al componer se emite siempre «c. ».
  const patron = /^(c\.|ca\.)?\s*(\d{4})(?:\s*[-–]\s*(\d{4}))?\s*(\[\?\])?$/i
  const encontrado = limpio.match(patron)
  if (!encontrado) return null

  const anio = Number(encontrado[2])
  const fin = encontrado[3] ? Number(encontrado[3]) : null

  // Un rango invertido es un error de captura, no un formato distinto: se
  // devuelve null para que la interfaz muestre el texto tal cual y alguien lo
  // arregle a conciencia.
  if (fin != null && fin <= anio) return null

  return {
    anio,
    aproximada: Boolean(encontrado[1]),
    anioFin: fin,
    sinConfirmar: Boolean(encontrado[4]),
  }
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
