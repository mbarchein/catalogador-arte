/**
 * The four writes of this block, and nothing else.
 *
 * Each one answers null — or the identifier — when it worked, and a sentence in
 * Spanish when it did not, which is the shape the rest of the feature already uses
 * (`setResearchStatus`, `relateArtworks`, `addType`). The sentences are built by
 * the pure modules next door, with tests, because «which message for which
 * refusal» is the part that has decisions in it and a module that talks to the
 * network cannot be reached by the battery.
 *
 * **The bucket is the same private one the photographs use** (`obras`, RF-110),
 * and it is entered through the same door: `supabase.storage.from(BUCKET)`, whose
 * three policies already cover the whole bucket by `can_read()` / `can_edit()`.
 * No new prefix needs a new policy, which is what the migration of
 * `archive_documents` already said out loud.
 *
 * **`upsert: false`, always.** Not a precaution: the paths of this bucket are
 * immutable — the service worker caches by path — and the measured answer to a
 * repeated name is a 409 that this code turns into a sentence. A file that is up
 * there is never replaced, and the original of a photograph is never even nameable
 * from here (see `documentUpload.ts`).
 */

import { BUCKET } from '../../../lib/images'
import { supabase } from '../../../lib/supabase'
import { describeDocumentRefusal } from './documentDraft'
import type { DocumentLinkArgs } from './documentLink'
import type { PickedFile, StorageRefusal } from './documentUpload'

/**
 * Puts the bytes in the private bucket. Answers null when it worked and the
 * store's own refusal when it did not, for `describeStorageFailure` to translate.
 *
 * `contentType` is sent explicitly and taken from the file: without it the store
 * guesses from the extension, and a scan named `expediente` with no extension
 * would be served back as `application/octet-stream` — which is what the row would
 * then have to claim.
 */
export async function uploadDocumentFile(
  path: string,
  file: Blob & PickedFile,
): Promise<StorageRefusal | null> {
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type === '' ? 'application/octet-stream' : file.type,
    upsert: false,
  })
  if (!error) return null
  // `statusCode` is where the store hides the real status: every one of these
  // arrives as HTTP 400 with «413», «409» or «403» in the body (measured).
  const refusal = error as { message: string; statusCode?: string }
  return { message: refusal.message, statusCode: refusal.statusCode ?? null }
}

/**
 * Writes the row of `archive_documents` and answers its identifier.
 *
 * `select('id').single()` is not decoration: the identifier is what the link needs
 * one line later, and an insert the policies refuse comes back with no rows and no
 * error — which without asking for the row would be reported as «guardado».
 */
export async function createArchiveDocument(
  columns: Record<string, unknown>,
): Promise<{ id: string } | { error: string }> {
  const { data, error } = await supabase
    .from('archive_documents')
    .insert(columns)
    .select('id')
    .single()
  if (error) return { error: describeDocumentRefusal('create', error) }
  const row = data as { id: string } | null
  if (row === null) return { error: describeDocumentRefusal('create', null) }
  return { id: row.id }
}

/**
 * Links a document with an artwork through `document_artwork`, and NOT through an
 * insert into the bridge table.
 *
 * `artwork_documents_unique` covers retired links, so a plain insert of a pair that
 * is in the trash crashes into the index and turns an «Añadir» into an
 * incomprehensible uniqueness violation. The function restores that row instead
 * (RF-517), which is what adding it again means.
 */
export async function linkDocumentToArtwork(args: DocumentLinkArgs): Promise<string | null> {
  const { error } = await supabase.rpc('document_artwork', args)
  return error ? describeDocumentRefusal('link', error) : null
}

/**
 * Takes a document off the record, or brings it back (RF-517, RF-901): nothing is
 * ever really deleted, here either. There is no `delete` privilege on the bridge
 * table and no policy for one, so this is the only way out.
 *
 * The record only lists active links, so from this screen only the retirement is
 * reachable; restoring one happens by linking it again, which `document_artwork`
 * resolves. The parameter is kept because the operation is symmetric and a
 * function that can only turn something off invites a second one to turn it on.
 *
 * `select('id')` for the reason the maintenance screens learned: an update the
 * policies deny comes back 204 with no error, and zero affected rows means the
 * write did not happen whatever the reason.
 */
export async function setDocumentLinkActive(
  id: string,
  active: boolean,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('artwork_documents')
    .update({ active })
    .eq('id', id)
    .select('id')
  if (error) return describeDocumentRefusal('retire', error)
  if ((data ?? []).length === 0) return describeDocumentRefusal('retire', null)
  return null
}

/**
 * Edits what a document says about THIS artwork: «reproducida en la página 3».
 *
 * Its own operation and not part of linking, because `document_artwork` refuses to
 * blank a note — an «Añadir» form arrives empty and must not wipe what somebody
 * wrote. Emptying it is an edit, and it is done here.
 *
 * Only the note travels. The document and the artwork are not editable: a link
 * that names the wrong document is another link, and it is registered as one so
 * that what was on record is retired instead of silently rewritten.
 */
export async function editDocumentLinkNote(id: string, note: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('artwork_documents')
    .update({ note: note.trim() })
    .eq('id', id)
    .select('id')
  if (error) return describeDocumentRefusal('editNote', error)
  if ((data ?? []).length === 0) return describeDocumentRefusal('editNote', null)
  return null
}
