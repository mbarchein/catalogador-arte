import type { PhotoProvenance, ShotTypeValue } from '../../lib/types'
import { cleanPhotoSource, photoSourceField } from './photoSource'

/**
 * A shot's data, as a form (RF-417, RF-405).
 *
 * ── WHY THIS IS A FORM AND NOT THREE LOOSE CONTROLS ─────────
 *
 * A photograph's panel had nine things stacked in a box with not a single
 * title, and each control saved on its own: the chips on being touched and the text
 * field on leaving it. That last one is half invisible on a phone —you touch
 * outside and you do not know whether it went in, or you close the screen and it is lost—, and
 * two ways of saving coexist in the same block, which is what makes it impossible to know
 * when anything is pending.
 *
 * Now all three are a form with «Guardar»: **nothing is written until it is
 * pressed** and the screen can say whether anything is unsaved. It is the same as
 * the record's form does, so the two screens behave alike.
 *
 * ── THE TWO TEXTS TRAVEL TOGETHER ───────────────────────────
 *
 * The draft stores **both** text columns and not only the one being
 * shown, because the provenance can be changed without saving: whoever marks
 * «tomada de otro catálogo» has to see the source field empty and get their
 * authorship back intact if they go back. With a single text in the draft, that round
 * trip would run over whatever had been written.
 */

export interface PhotoDataDraft {
  shotType: ShotTypeValue
  provenance: PhotoProvenance
  /** Who took it. Shown when the provenance is our own. */
  credit: string
  /** Where it came from. Shown when it is not. */
  origin: string
}

/** What is stored, as the starting draft. */
export function photoDataDraft(saved: {
  shot_type: ShotTypeValue
  provenance: PhotoProvenance
  photo_credit: string
  provenance_source: string
}): PhotoDataDraft {
  return {
    shotType: saved.shot_type,
    provenance: saved.provenance,
    credit: saved.photo_credit,
    origin: saved.provenance_source,
  }
}

/** The text to show with the provenance chosen right now. */
export function draftSourceText(draft: PhotoDataDraft): string {
  return photoSourceField(draft.provenance) === 'credit' ? draft.credit : draft.origin
}

/** The draft with that text changed, without touching the other one. */
export function withSourceText(draft: PhotoDataDraft, value: string): PhotoDataDraft {
  return photoSourceField(draft.provenance) === 'credit'
    ? { ...draft, credit: value }
    : { ...draft, origin: value }
}

/**
 * Whether there is anything to save.
 *
 * The texts are compared trimmed: a few extra spaces are not a change, and without
 * this opening the field and closing it would leave the button lit forever.
 */
export function photoDataDirty(draft: PhotoDataDraft, saved: PhotoDataDraft): boolean {
  return (
    draft.shotType !== saved.shotType ||
    draft.provenance !== saved.provenance ||
    cleanPhotoSource(draft.credit) !== cleanPhotoSource(saved.credit) ||
    cleanPhotoSource(draft.origin) !== cleanPhotoSource(saved.origin)
  )
}

/** What is sent to the base: the four columns, with the texts trimmed. */
export function photoDataColumns(draft: PhotoDataDraft): {
  shot_type: ShotTypeValue
  provenance: PhotoProvenance
  photo_credit: string
  provenance_source: string
} {
  return {
    shot_type: draft.shotType,
    provenance: draft.provenance,
    photo_credit: cleanPhotoSource(draft.credit),
    provenance_source: cleanPhotoSource(draft.origin),
  }
}

/**
 * The titles of the panel's sections, in the order they are read.
 *
 * There were four and one is left. The other three went the same way and for the
 * same reason: rotating and cropping, the cover, the order and removing **act on the
 * shot being looked at**, so they are now icons over the photograph itself
 * and their state is read below it. What is left here is the only thing that is
 * written, and that is why it is the only thing with a «Guardar».
 *
 * It is still an object with a single title, and not a loose constant: the
 * section may have company again, and the place where the name of a block of this panel
 * is decided should not move house for that.
 */
export const PHOTO_SECTIONS = {
  data: 'Qué es esta toma',
} as const

/** What is read under the save button, or null when nothing is pending. */
export function pendingDataNotice(dirty: boolean): string | null {
  return dirty ? 'Hay cambios sin guardar en esta toma.' : null
}
