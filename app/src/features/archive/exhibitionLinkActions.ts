/**
 * The two writes the archive's record does own (RF-516, RF-517).
 *
 * The archive's record was declared read-only, and these are the reasoned exception:
 * they are the only ones that cannot be done anywhere else. Uploading, correcting and
 * digitising live in an artwork's documentation because that is where the artwork the
 * document describes is; an exhibition has no document block, so the only
 * place where the document and the show are together at once is this record.
 *
 * What is said when the base refuses is translated by `describeDocumentRefusal`, which already
 * measures and translates this block's codes; here only the two verbs are added to it.
 */

import { supabase } from '../../lib/supabase'
import { describeDocumentRefusal } from '../documentary/documents/documentDraft'

/**
 * Links a document to an exhibition **through `document_exhibition`**, and not with
 * an insert into the bridge table.
 *
 * It is the same reason as with the link to an artwork: `exhibition_documents_unique` covers
 * the withdrawn links, so an insert of a pair that is in the wastebasket clashes
 * against the index and turns an «Enlazar» into an incomprehensible uniqueness
 * violation. The function restores it instead (RF-517), which is what linking it
 * again means.
 *
 * The function has been in the schema since the archive's migration, with its `grant execute` to the
 * authenticated role and its own test. What was missing was this call.
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
 * Removes the document from an exhibition, or gives it back (RF-517, RF-901): nothing is deleted
 * here either. There is no `delete` privilege over the bridge table nor a policy for
 * one, so this is the only way out.
 *
 * `select('id')` for what the maintenance screens already learnt: an
 * update the policies deny comes back 204 with no error, and zero rows affected
 * means it was not written, whatever the reason.
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
