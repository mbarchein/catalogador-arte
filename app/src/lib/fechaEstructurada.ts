/**
 * La fecha de ejecución vive en campos estructurados (ADR-004): anio_inicio,
 * anio_fin y dos banderas. El texto publicable lo compone la BASE DE DATOS como
 * columna generada; `componerFecha` de aquí produce el mismo texto y solo se usa
 * para previsualizar en la interfaz antes de guardar.
 *
 * Los cuatro formatos, y el sufijo «[?]» sobre cualquiera de ellos:
 *
 *   1978 · 1975-1978 · c. 1980 · c. 1975-1978
 *
 * **`c.` y `[?]` no son lo mismo**, y de ahí que sean dos banderas y no una:
 *
 *   - `c.` — fecha aproximada: la obra es de alrededor de ese año.
 *   - `[?]` — sin confirmar: la fecha se desconoce y el año es una estimación.
 *
 * `descomponerFecha` es la inversa, y desde ADR-004 su papel es el análisis de
 * la fecha escrita a mano (`analizarFechaManual`): lo tecleado acaba en la
 * estructura siempre que sea posible, y solo lo imparseable queda como nota.
 */

import { anioParaBuscar } from './fechas'

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

/**
 * Análisis de la fecha escrita a mano, para que lo tecleado acabe en los campos
 * estructurados de la base siempre que sea posible:
 *
 *  - Texto canónico (los cuatro formatos, con o sin «[?]») → estructura llena y
 *    nota vacía: escribir «c.1975 - 1978» a mano y componerlo con los botones
 *    dejan la ficha EXACTAMENTE igual.
 *  - Cualquier otro texto → se conserva íntegro como nota (es lo que se
 *    publica), y se rescata el primer año plausible hacia `anio` para que la
 *    obra no desaparezca de las búsquedas por época.
 */
export function analizarFechaManual(texto: string): { fecha: FechaEstructurada; nota: string } {
  const limpio = texto.trim()
  const canonica = descomponerFecha(limpio)
  if (canonica) return { fecha: canonica, nota: '' }
  return {
    fecha: { ...FECHA_VACIA, anio: anioParaBuscar(limpio) },
    nota: limpio,
  }
}
