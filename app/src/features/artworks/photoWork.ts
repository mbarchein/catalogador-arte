/**
 * Lo que está pasando con una fotografía, dicho en dos largos (RNF-106).
 *
 * El mismo trabajo se cuenta en dos sitios y no cabe lo mismo en los dos:
 *
 *   · **el distintivo sobre la imagen** es una píldora de una línea sobre la foto,
 *     y lo que de verdad se mira en ella es el porcentaje;
 *   · **la línea de debajo** tiene el ancho de la pantalla y puede explicarse.
 *
 * Con un solo texto para los dos, el largo se recortaba con puntos suspensivos
 * justo por el final — que es donde iba el porcentaje —, así que el distintivo
 * acababa diciendo «Aplicando la corrección y subiendo las c…» y no contaba nada
 * de lo único que se quería saber. De ahí que cada estado traiga sus dos formas y
 * que el porcentaje se pinte aparte, en un elemento que no se recorta nunca.
 */

export interface PhotoWork {
  /** Para el distintivo sobre la imagen. Corto de verdad: ver `WORK_SHORT_MAX`. */
  short: string
  /** Para la línea de debajo, donde hay sitio para decir qué fichero es. */
  long: string
}

/**
 * Lo que puede medir el distintivo, en caracteres.
 *
 * A 390 px y con el porcentaje al lado caben del orden de veinte; el tope está ahí
 * y hay un test que lo vigila, porque el rótulo largo volvió por descuido una vez
 * y el síntoma —un porcentaje que no se ve— no se parece en nada a su causa.
 */
export const WORK_SHORT_MAX = 20

/** Bajando el original del archivo para poder editarlo. */
export const WORK_DOWNLOADING_MASTER: PhotoWork = {
  short: 'Descargando',
  long: 'Descargando el máster…',
}

/** Sin máster: se abre la copia de consulta, que ya está en Supabase. */
export const WORK_OPENING_COPY: PhotoWork = {
  short: 'Abriendo',
  long: 'Abriendo la copia de consulta…',
}

/** Publicando el recorte: las dos copias pequeñas y la de resolución completa. */
export const WORK_UPLOADING: PhotoWork = {
  short: 'Subiendo copias',
  long: 'Aplicando la corrección y subiendo las copias…',
}

/** Anotando una revisión de color que no cambia ningún píxel. */
export const WORK_SAVING_TRACE: PhotoWork = {
  short: 'Guardando',
  long: 'Anotando la revisión del color…',
}
