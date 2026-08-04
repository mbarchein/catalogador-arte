/**
 * The three writes of this block. Each answers null when it worked and the
 * database's own message when it did not, which is the shape the rest of the
 * feature already uses (`setResearchStatus`, `addType`).
 *
 * The messages are shown VERBATIM and not rewritten: the rules that can refuse
 * these calls live next to the data — a relationship of an artwork with itself,
 * the reverse of an asymmetric pair, a kind that cannot be read — and every one
 * of them raises in Spanish, with a hint about what to do first. A second copy
 * here would be a rule that drifts from the one that is actually enforced.
 */

import { supabase } from '../../../lib/supabase'
import type { RelateArgs } from './relateForm'

/**
 * Relates two artworks (RF-217) through the `relate_artworks` function, and NOT
 * through an insert.
 *
 * The unique constraint covers retired relationships too, so a plain insert of a
 * pair that is in the trash crashes into the index and the interface turns an
 * «Añadir» into an incomprehensible uniqueness violation. The function finds that
 * row and restores it (RF-517), which is what adding it again means — and it
 * finds it whichever order the two artworks were written in, because the
 * canonicalisation has already run by then.
 */
export async function relateArtworks(args: RelateArgs): Promise<string | null> {
  const { error } = await supabase.rpc('relate_artworks', args)
  return error ? error.message : null
}

/**
 * Retires a relationship, or brings it back (RF-517, RF-901): nothing is ever
 * really deleted, here either. There is no `delete` privilege on the table and no
 * policy for one, so this is the only way out.
 *
 * The record only lists active relationships, so from this screen only the
 * retirement is reachable; restoring one happens by adding it again, which
 * `relate_artworks` resolves. The parameter is kept because the operation is
 * symmetric and a function that can only turn something off invites a second one
 * to turn it on.
 */
export async function setRelationshipActive(
  id: string,
  active: boolean,
): Promise<string | null> {
  const { error } = await supabase.from('artwork_relationships').update({ active }).eq('id', id)
  return error ? error.message : null
}

/**
 * Edits the circumstance of a relationship: «el reverso se separó del soporte en
 * la restauración de 1998».
 *
 * Its own operation and not part of adding, because `relate_artworks` refuses to
 * blank a note — an «Añadir» form arrives empty and must not wipe what somebody
 * wrote. Emptying a note is an edit, and it is done here.
 *
 * Only the note travels. The two ends and the kind are not editable: changing
 * them is a different relationship, and it is registered as one so that what was
 * on record is retired instead of silently rewritten.
 */
export async function editRelationshipNote(id: string, note: string): Promise<string | null> {
  const { error } = await supabase
    .from('artwork_relationships')
    .update({ note: note.trim() })
    .eq('id', id)
  return error ? error.message : null
}
