/**
 * El cartel de una exposición: dónde va el fichero, qué se escribe en la fila y qué
 * se lee en pantalla (RF-518).
 *
 * Un listado de exposiciones es una lista de títulos y años, y se recorre leyendo. El
 * cartel es lo que la hace reconocible de un vistazo: quien montó la exposición se
 * acuerda del cartel antes que del año.
 *
 * **Dos ficheros y no tres**, al contrario que una fotografía de obra (ADR-002): la
 * miniatura que pinta el listado y la copia de consulta que se abre al tocarla. No se
 * guarda el original, y no es por ahorrar sitio — el original de una fotografía de obra
 * es el documento de conservación del que sale la copia para una imprenta (RF-420), y
 * un cartel no es eso. Subir los megabytes de la foto de un móvil tres veces desde un
 * almacén con mala cobertura es lo que se evita.
 *
 * Puro: aquí no se sube nada ni se firma nada. Las rutas, la validación y las frases
 * se verifican en node, y lo que toca la red vive en `exhibitionPosterActions.ts`.
 */

import { LEVELS, randomSuffix, validateFile, type DerivativeExtension } from '../../lib/images'
import type { Exhibition } from '../../lib/types'

/**
 * El prefijo del cartel dentro del bucket privado `obras`.
 *
 * En español, como el `archivo/` de los documentos escaneados y como el propio
 * identificador del bucket: los dos son **datos guardados** y no identificadores del
 * código (ver CLAUDE.md). Cambiarlo mañana dejaría huérfano lo subido hoy.
 */
export const POSTER_PREFIX = 'carteles'

/** Las dos rutas de un cartel, que se escriben juntas o no se escriben (RF-518). */
export interface PosterPaths {
  thumbnail: string
  derivative: string
}

/**
 * Dónde van los dos ficheros de un cartel.
 *
 * Una carpeta por exposición y un sufijo aleatorio por subida, con la misma razón que
 * las derivadas de una obra: **una ruta nunca se sobrescribe**. Las miniaturas se
 * sirven con una firma de una semana y el navegador las cachea, así que reescribir una
 * ruta dejaría al teléfono enseñando el cartel viejo hasta que caducara. El fichero
 * anterior se queda en el bucket, como todo lo que este catálogo sube.
 */
export function posterPaths(
  exhibitionId: string,
  suffix = randomSuffix(),
  extension: DerivativeExtension = 'webp',
): PosterPaths {
  const base = `${POSTER_PREFIX}/${exhibitionId}/cartel_${suffix}`
  return { thumbnail: `${base}_min.${extension}`, derivative: `${base}_der.${extension}` }
}

/** Lo que se escribe en la fila al subir un cartel. Las tres columnas, juntas. */
export function posterPatch(
  paths: PosterPaths,
  now = new Date(),
): Pick<Exhibition, 'poster_thumbnail_path' | 'poster_derivative_path' | 'poster_uploaded_at'> {
  return {
    poster_thumbnail_path: paths.thumbnail,
    poster_derivative_path: paths.derivative,
    // El reloj del cliente, que es de lo que va la columna: cuándo se subió el
    // fichero, no cuándo llegó la fila.
    poster_uploaded_at: now.toISOString(),
  }
}

/** Y lo que se escribe al quitarlo: las tres a nulo, que es lo que la base exige. */
export const POSTER_CLEARED: Pick<
  Exhibition,
  'poster_thumbnail_path' | 'poster_derivative_path' | 'poster_uploaded_at'
> = {
  poster_thumbnail_path: null,
  poster_derivative_path: null,
  poster_uploaded_at: null,
}

/** Si esta exposición tiene cartel. La respuesta es la fila y no una bandera aparte. */
export function hasPoster(row: Pick<Exhibition, 'poster_thumbnail_path'>): boolean {
  return row.poster_thumbnail_path !== null && row.poster_thumbnail_path.trim() !== ''
}

/**
 * Por qué este fichero no puede ser un cartel, o null cuando puede.
 *
 * Es `validateFile` de las fotografías —una imagen, y por debajo del límite del
 * bucket— y no una segunda lista de formatos: el cartel se pinta con el mismo `<img>`
 * y se genera con el mismo `canvas`, así que lo que valga para una foto de obra vale
 * aquí. Se comprueba ANTES de empezar a subir, que sobre datos móviles es el punto.
 */
export function posterFileRefusal(file: File): string | null {
  return validateFile(file)
}

/** El rótulo del botón, que no dice lo mismo con cartel y sin él. */
export function posterButtonLabel(row: Pick<Exhibition, 'poster_thumbnail_path'>): string {
  return hasPoster(row) ? 'Cambiar el cartel' : 'Subir el cartel'
}

/**
 * El texto alternativo de la imagen.
 *
 * Nombra la exposición porque es lo que un lector de pantalla necesita para saber de
 * qué es el cartel; decir «cartel» a secas en una lista de veinte carteles no dice
 * nada.
 */
export function posterAlt(title: string): string {
  const named = title.trim()
  return named === '' ? 'Cartel de la exposición' : `Cartel de ${named}`
}

/**
 * La confirmación de quitar el cartel.
 *
 * Dice lo que de verdad pasa: la fila deja de apuntar al fichero y el fichero se queda
 * donde está. En este catálogo no se borra nada (RF-901), y saberlo es lo que quita el
 * miedo a probar otra imagen.
 */
export function removePosterConfirmText(title: string): string {
  const named = title.trim() === '' ? 'esta exposición' : `«${title.trim()}»`
  return (
    `Se quitará el cartel de ${named}. El fichero no se borra del almacén, así que se puede volver ` +
    'a subir el mismo.'
  )
}

/** Lo que se dice mientras se sube, que son tres esperas de distinta duración. */
export type PosterStep = 'preparing' | 'uploading' | 'saving'

export const POSTER_STEP_TEXT: Record<PosterStep, string> = {
  preparing: 'Preparando la imagen…',
  uploading: 'Subiendo el cartel…',
  saving: 'Guardando…',
}

/**
 * Qué miniaturas hay que pintar en un listado, y de qué exposición es cada una.
 *
 * Las exposiciones sin cartel **no entran**: firmar una ruta nula es una petición que
 * el almacén rechaza, y en un listado de doscientas exposiciones con tres carteles serían
 * ciento noventa y siete rechazos por pantalla.
 */
export function postersToSign(
  rows: readonly Pick<Exhibition, 'id' | 'poster_thumbnail_path'>[],
): { id: string; path: string }[] {
  return rows.flatMap((row) => {
    const path = row.poster_thumbnail_path
    return path === null || path.trim() === '' ? [] : [{ id: row.id, path }]
  })
}

/**
 * El tamaño con el que se sube cada nivel, dicho una vez.
 *
 * Sale de `LEVELS`, que es de donde salen las derivadas de una obra: dos maquetas del
 * mismo número acabarían con una miniatura de un tamaño en la obra y de otro en la
 * exposición, y las dos se pintan en listas del mismo ancho.
 */
export const POSTER_LEVELS = LEVELS
