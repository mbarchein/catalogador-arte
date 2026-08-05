/**
 * Las dos escrituras que la ficha del archivo sí posee (RF-516, RF-517).
 *
 * La ficha del archivo se declaró de solo lectura, y estas son la excepción razonada:
 * son las únicas que no se pueden hacer en ningún otro sitio. Subir, corregir y
 * digitalizar viven en la documentación de una obra porque allí está la obra que el
 * documento describe; una exposición no tiene bloque de documentos, así que el único
 * sitio donde el documento y la muestra están a la vez es esta ficha.
 *
 * Lo que se dice cuando la base se niega lo traduce `describeDocumentRefusal`, que ya
 * mide y traduce los códigos de este bloque; aquí solo se le añaden los dos verbos.
 */

import { supabase } from '../../lib/supabase'
import { describeDocumentRefusal } from '../documentary/documents/documentDraft'

/**
 * Enlaza un documento con una exposición **a través de `document_exhibition`**, y no con
 * un insert en la tabla puente.
 *
 * Es el mismo motivo que en el vínculo con una obra: `exhibition_documents_unique` cubre
 * los vínculos retirados, así que un insert de un par que está en la papelera choca
 * contra el índice y convierte un «Enlazar» en una violación de unicidad
 * incomprensible. La función lo restaura en su lugar (RF-517), que es lo que volver a
 * enlazarlo significa.
 *
 * La función está en el esquema desde la migración del archivo, con su `grant execute` al
 * rol autenticado y su propio test. Lo que faltaba era esta llamada.
 */
export async function linkDocumentToExhibition(args: {
  p_exhibition_id: string
  p_document_id: string
  p_note: string
}): Promise<string | null> {
  const { error } = await supabase.rpc('document_exhibition', args)
  return error ? describeDocumentRefusal('linkExhibition', error) : null
}

/**
 * Quita el documento de una exposición, o lo devuelve (RF-517, RF-901): nada se borra
 * tampoco aquí. No hay privilegio de `delete` sobre la tabla puente ni política para
 * uno, así que esta es la única salida.
 *
 * `select('id')` por lo que ya aprendieron las pantallas de mantenimiento: una
 * actualización que las políticas deniegan vuelve 204 sin error, y cero filas afectadas
 * significa que no se escribió, sea por lo que sea.
 */
export async function setExhibitionLinkActive(
  id: string,
  active: boolean,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('exhibition_documents')
    .update({ active })
    .eq('id', id)
    .select('id')
  if (error) return describeDocumentRefusal('retireExhibition', error)
  if ((data ?? []).length === 0) return describeDocumentRefusal('retireExhibition', null)
  return null
}
