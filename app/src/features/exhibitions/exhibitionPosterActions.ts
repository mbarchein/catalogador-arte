/**
 * Subir, guardar y quitar el cartel de una exposición (RF-518).
 *
 * Lo que toca la red, y nada más: las rutas, la validación y las frases son puras y
 * están en `exhibitionPoster.ts`. Aquí está el orden de las escrituras, que es lo único
 * que hay que decidir con cuidado.
 *
 * **Primero los ficheros y después la fila**, y no al revés. Si falla la subida no se
 * ha escrito nada y se puede repetir; si fallara la fila, en el bucket quedan dos
 * objetos que nadie referencia — que es un desperdicio de bytes y no un dato roto. El
 * orden contrario deja una exposición apuntando a una imagen que no existe, y eso se ve
 * como un hueco en el listado sin ninguna explicación.
 */

import { supabase } from '../../lib/supabase'
import { BUCKET, derivativeFormat, prepareShot } from '../../lib/images'
import { describeStorageFailure } from '../documentary/documents/documentUpload'
import type { StorageRefusal } from '../documentary/documents/documentUpload'
import { POSTER_CLEARED, posterPatch, posterPaths, type PosterPaths } from './exhibitionPoster'

/** Los dos ficheros del cartel, ya generados en el navegador. */
export interface PreparedPoster {
  thumbnail: Blob
  derivative: Blob
  /** Un `blob:` para pintarlo mientras se sube, y que hay que revocar al terminar. */
  preview: string
  paths: PosterPaths
  contentType: string
}

/**
 * Genera los dos niveles del cartel en el navegador.
 *
 * Reutiliza `prepareShot`, que es lo que ya prepara una fotografía de obra: aplica la
 * orientación EXIF —sin eso, un cartel fotografiado en vertical se guardaría girado—,
 * pregunta una vez por sesión qué sabe comprimir este navegador y genera los dos
 * tamaños en paralelo. Devuelve además un original que aquí **no se sube**, y eso es lo
 * que ahorra los megabytes de la foto de un móvil.
 */
export async function preparePoster(
  exhibitionId: string,
  file: File,
): Promise<PreparedPoster> {
  const shot = await prepareShot(file)
  const format = await derivativeFormat()
  return {
    thumbnail: shot.thumbnail,
    derivative: shot.derivative,
    preview: shot.preview,
    paths: posterPaths(exhibitionId, undefined, format.extension),
    contentType: format.type,
  }
}

/**
 * Sube los dos ficheros. Devuelve la frase del fallo, o null si fueron los dos.
 *
 * En serie y no en paralelo: son dos escrituras a la misma red desde un almacén, y
 * lanzarlas juntas no las hace más rápidas — se reparten el mismo ancho de banda— pero
 * sí hace que un fallo deje la otra a medio camino sin que nadie sepa cuál.
 */
export async function uploadPoster(prepared: PreparedPoster): Promise<string | null> {
  for (const [path, blob] of [
    [prepared.paths.thumbnail, prepared.thumbnail],
    [prepared.paths.derivative, prepared.derivative],
  ] as const) {
    const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
      contentType: prepared.contentType,
      upsert: false,
    })
    if (error) {
      const refusal = error as { message: string; statusCode?: string }
      return describeStorageFailure({
        message: refusal.message,
        statusCode: refusal.statusCode ?? null,
      } satisfies StorageRefusal)
    }
  }
  return null
}

/**
 * Escribe las tres columnas del cartel en la fila, o las borra.
 *
 * Se pide la fila de vuelta —`select('id')`— porque **PostgREST contesta 200 y una
 * lista vacía a un update que no ha tocado nada**: es lo que hace una política que
 * niega, y sin mirar las filas la pantalla diría «guardado» sobre un cartel que no se
 * ha guardado. Es la misma medición que hay escrita en los mensajes del dossier.
 */
export async function savePoster(
  exhibitionId: string,
  paths: PosterPaths | null,
): Promise<{ error: { message: string; code?: string } | null; rows: number }> {
  const patch = paths === null ? POSTER_CLEARED : posterPatch(paths)
  const { data, error } = await supabase
    .from('exhibitions')
    .update(patch)
    .eq('id', exhibitionId)
    .select('id')
  return { error: error ?? null, rows: (data ?? []).length }
}
