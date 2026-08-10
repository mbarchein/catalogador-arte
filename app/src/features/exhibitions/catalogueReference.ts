/**
 * An exhibition's catalogue, which is a bibliography reference and not a table
 * of its own (RF-503, RF-506).
 *
 * Pure and without React, like the rest of this folder's decisions.
 *
 * ── WHAT WAS MISSING, AND IT WAS NOT THE HALF IT LOOKED LIKE ─
 *
 * `exhibitions.catalogue_reference_id` has existed since the first exhibitions
 * migration and **no screen could set it**: the record's draft deliberately left it
 * out —«choosing it needs the bibliography's selector, which is another
 * screen»— so the column was always null. The test plan had it
 * noted as «the exhibition record says whether there was a catalogue but does not name the
 * reference that is it nor link to it, and there is no reference record to go to».
 * Now there is a reference record, and this is the other half: being able to say which it is.
 *
 * ── WHY IT IS A SEPARATE OPERATION AND NOT ONE MORE FIELD ────
 *
 * Because it does not behave like the form's eight fields:
 *
 *   · **The base ties it to another field.** `exhibitions_catalogue_reference_needs_catalogue`
 *     rejects the link while `catalogue_published` is not «Sí», so choosing a
 *     reference depends on an answer given somewhere else on the same screen.
 *     It is said BEFORE, not after a round trip.
 *   · **It is chosen, not written.** It needs the whole reference catalogue loaded and
 *     a finder, which is half a panel; the eight fields are text and dropdowns.
 *   · **And its absence has to be sayable.** Removing the link is an operation with
 *     a meaning of its own —«this was not its catalogue»— and not a field left empty.
 *
 * The form's save still does not send this column, which is what guarantees that
 * correcting a show's title does not erase its catalogue (it is written in
 * `useExhibition`). This operation sends this column and no other.
 */

import type { TriState } from '../../lib/types'
import { referenceOptionHint } from '../documentary/bibliography/referenceChoice'
import { referenceTitleText } from '../documentary/bibliography/referenceEdit'
import type { ReferenceRow } from '../documentary/documentaryRows'

/**
 * Why the catalogue cannot be chosen yet, or null when it can.
 *
 * It is the mirror of `exhibitions_catalogue_reference_needs_catalogue`, measured: the base
 * rejects the link if `catalogue_published` is not «Sí». And the two refusals are
 * different, which is what makes the sentence of any use:
 *
 *   · «Sin revisar» is that **nobody has looked** at whether there was a catalogue. What has to be done
 *     is to research it, and the answer may be yes.
 *   · «No» is that it was researched and **there was no catalogue**. Linking one then is not
 *     completing the record: it is contradicting it, and what has to be corrected is the «No».
 */
export function catalogueChoiceBlockedReason(cataloguePublished: TriState): string | null {
  if (cataloguePublished === 'YES') return null
  if (cataloguePublished === 'NO') {
    return (
      'Consta SIN catálogo, y enlazar uno sería contradecir la ficha. Si lo hubo, pon antes «Sí».'
    )
  }
  return (
    'No consta si publicó catálogo: «sin revisar» no es «no». Responde antes esa pregunta.'
  )
}

/**
 * Is choosing a catalogue even offered?
 *
 * With «No publicó catálogo» on screen, a link saying «Decir cuál es su catálogo»
 * contradicts the line above it: it offers to do something the base is going to
 * reject and that, if accepted, would leave the record saying two opposite things. It is
 * removed — the way to fix it, if there was a catalogue, is to correct «¿Se publicó catálogo?»
 * in the exhibition's data, which is where any other datum of its is corrected.
 *
 * **With «sin revisar» it IS offered**, and the difference is not an oversight: there nobody has
 * looked yet and the answer may end up being yes, so the panel explains what
 * has to be answered first. `catalogueChoiceBlockedReason` says those two refusals
 * separately for the same reason.
 */
export function offersCatalogueChoice(cataloguePublished: TriState): boolean {
  return cataloguePublished !== 'NO'
}

/**
 * What the record reads about its catalogue, in one line, and **never a gap** (RF-304).
 *
 * The four answers are different and confusing them costs a morning in the library:
 * that it is not recorded, that there was none, that there was one and we know which it is, and that there was one and it is not
 * linked — which is what has to be done and not an error.
 */
export function catalogueReferenceLine(input: {
  cataloguePublished: TriState
  reference: ReferenceRow | null
  /** True when the column points to a reference this session cannot read. */
  unreadable?: boolean
}): string {
  const { cataloguePublished, reference, unreadable = false } = input
  if (cataloguePublished === 'UNREVIEWED') return 'No consta si publicó catálogo.'
  if (cataloguePublished === 'NO') return 'No publicó catálogo.'
  if (unreadable) {
    return (
      'Publicó catálogo y consta cuál, pero no se puede leer: puede estar retirada.'
    )
  }
  if (reference === null) {
    return 'Publicó catálogo, y todavía no consta cuál de las referencias de la bibliografía lo es.'
  }
  return `Publicó catálogo: ${referenceTitleText(reference)}.`
}

/** The second line of the linked catalogue: who, when and where it came out. */
export function catalogueReferenceHint(reference: ReferenceRow): string {
  return referenceOptionHint(reference)
}

export type CatalogueReferencePlan =
  | { action: 'blocked'; message: string }
  /** Nothing to send: it is not an error and it is not presented as one. */
  | { action: 'unchanged' }
  | { action: 'set'; referenceId: string }
  | { action: 'clear' }

/**
 * What to do with the choice.
 *
 * `unchanged` matters for the same reason as in the rest of the project: writing the row moves
 * `updated_at` and leaves a history line for a change nobody has made
 * (RF-1501). And removing the link of an exhibition that did not have one is also nothing.
 */
export function planCatalogueReference(input: {
  cataloguePublished: TriState
  current: string | null
  /** Null is «remove the link». */
  chosen: string | null
}): CatalogueReferencePlan {
  const { cataloguePublished, current, chosen } = input
  if (chosen === current) return { action: 'unchanged' }
  if (chosen === null) return { action: 'clear' }
  // Removing the link is ALWAYS allowed, also with the record on «No» or «sin revisar»:
  // it is the only way out of an inconsistent row that had arrived through SQL, and refusing it
  // would leave the screen with no way of fixing it.
  const blocked = catalogueChoiceBlockedReason(cataloguePublished)
  if (blocked !== null) return { action: 'blocked', message: blocked }
  return { action: 'set', referenceId: chosen }
}

/** What is said when the choice has gone in. */
export function catalogueReferenceNotice(plan: CatalogueReferencePlan, title: string): string {
  if (plan.action === 'clear') {
    return 'Ya no consta cuál es su catálogo. La referencia sigue en la bibliografía.'
  }
  const clean = title.trim()
  return `${clean === '' ? 'La referencia' : `«${clean}»`} queda como el catálogo de esta exposición.`
}

/**
 * What the selector says instead of an empty list, which it never is (RF-304).
 *
 * The two cases are different: the bibliography is empty, or it has references and none
 * matches. The second has to say **where a new reference comes from**, because otherwise
 * the title of the catalogue held in hand gets typed, nothing turns up and the conclusion
 * is that the finder is broken.
 */
export function noCatalogueOptionsText(total: number, query: string): string {
  if (total === 0) {
    return (
      'Todavía no hay ninguna referencia. El catálogo se da de alta citándolo desde una obra.'
    )
  }
  if (query.trim() === '') {
    return 'Escribe para buscar entre las referencias de la bibliografía.'
  }
  return (
    'Ninguna referencia coincide. Si el catálogo no está, cítalo antes desde una obra.'
  )
}
