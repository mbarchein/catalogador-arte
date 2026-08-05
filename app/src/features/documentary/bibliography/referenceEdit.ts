/**
 * Correcting a reference of the catalogue from the record of an artwork that
 * cites it (RF-504, RF-1106, ADR-007).
 *
 * The block could already record WHERE an artwork is published and correct the
 * page — which is a fact about this artwork — but not the reference itself. So a
 * title typed with a typo, an author misspelt or a year off by one stayed wrong
 * for every artwork citing it, and the only way out was a screen that does not
 * exist yet (the reference's own record, RF-309). That is why this is here and
 * not there: the correction happens where the mistake is read.
 *
 * **And that is exactly what makes it dangerous, which is the whole subject of
 * this module.** A reference is ONE row shared by every artwork that cites it
 * (ADR-007), so correcting it from one record rewrites what the others show.
 * That has to be said on screen BEFORE saving — `referenceReachNotice` — the
 * same way the master-table screens say it, and it is the reason the panel that
 * writes this is a separate one from the panel that corrects a citation: those
 * are two different scopes and one form with everything in it would hide which
 * is which.
 *
 * What is NOT here is any rule the database already holds — a blank title, the
 * plausible-year window, the shape of a BibTeX key and its uniqueness. Those are
 * enforced next to the data and this module translates the refusal into a
 * sentence with its consequence. The two deliberate exceptions are marked as
 * such: the local checks of `referenceEditProblem` and the duplicate key of
 * `planReferenceEdit`, which answer «esa clave ya es la de otra referencia»
 * instead of the name of an index — and the database still has the last word.
 */

import { placeKey } from '../../../lib/places'
import type { ReferenceRow } from '../documentaryRows'
import { MAX_REFERENCE_YEAR, MIN_REFERENCE_YEAR } from './citationFormat'

// ── The reference as it is being corrected ───────────────────

/**
 * A reference being corrected: everything of it the record of an artwork shows.
 *
 * The list is drawn from what `citationView` paints and not from the table: the
 * point of this panel is that a datum somebody READ on the record can be fixed
 * from where it was read. So the title, who is responsible for the text (authors
 * and editors, both — the record prints «(ed.)» when there are no authors), the
 * publication it came out in, the imprint, the year, the kind of publication and
 * the BibTeX handle, which the record shows as a chip.
 *
 * `note` — the reference's own note — is deliberately absent: the record never
 * shows it, so nobody can be looking at a mistake in it, and a field that is not
 * painted cannot be corrected here without being loaded, shown and saved back.
 * The citation's note, which the record DOES show, belongs to the other panel:
 * it is a fact about this artwork in that publication and not about the
 * publication.
 */
export interface ReferenceEdit {
  title: string
  authors: string
  editors: string
  /** Journal, newspaper or volume containing the text. */
  containerTitle: string
  year: number | null
  publicationTypeId: string | null
  publisher: string
  place: string
  /**
   * The short handle a researcher names the reference by («rotili1985muba»).
   *
   * A string and never null in the draft, because a text field holds text: empty
   * is «no tiene clave», and it travels to the database as null so the unique
   * index ignores it (see `referencePayload`).
   */
  bibtexKey: string
}

/** The draft the panel opens with: the reference exactly as it is stored. */
export function referenceEdit(reference: ReferenceRow): ReferenceEdit {
  return {
    title: reference.title,
    authors: reference.authors,
    editors: reference.editors,
    containerTitle: reference.container_title,
    year: reference.year,
    publicationTypeId: reference.publication_type_id,
    publisher: reference.publisher,
    place: reference.place,
    bibtexKey: reference.bibtex_key ?? '',
  }
}

/** The columns of `bibliography` this panel writes, and no others. */
export interface ReferencePayload {
  title: string
  authors: string
  editors: string
  container_title: string
  publisher: string
  place: string
  year: number | null
  publication_type_id: string | null
  bibtex_key: string | null
}

/**
 * What travels to `bibliography`, trimmed.
 *
 * The BibTeX key goes as NULL when nothing is written and never as an empty
 * string, and that is not tidiness: the unique index is over
 * `place_key(bibtex_key)`, `place_key` is strict, so nulls are ignored and many
 * references can have no key — while a second empty string would collide with
 * the first one. Measured against the base: patching `bibtex_key` to `''` comes
 * back as 23514 on `bibliography_bibtex_key_shape`.
 *
 * The title is trimmed even though the database does NOT demand it be
 * (`bibliography_title_not_blank` only refuses a blank one, because a title gets
 * pasted from a PDF): a title with a trailing space is invisible on screen and
 * sorts the reference away from where it is looked for.
 *
 * `active` is not here. Retiring or restoring a reference is not a correction of
 * its data, and this panel is opened from a citation — a save that also brought a
 * withdrawn reference back into circulation would be a side effect nobody asked
 * for (see `referenceRetiredNotice`).
 */
export function referencePayload(draft: ReferenceEdit): ReferencePayload {
  const key = draft.bibtexKey.trim()
  return {
    title: draft.title.trim(),
    authors: draft.authors.trim(),
    editors: draft.editors.trim(),
    container_title: draft.containerTitle.trim(),
    publisher: draft.publisher.trim(),
    place: draft.place.trim(),
    year: draft.year,
    publication_type_id: draft.publicationTypeId,
    bibtex_key: key === '' ? null : key,
  }
}

/**
 * What stops the correction from being written, in Spanish, or null.
 *
 * Only what the DATABASE refuses, and with its own limits, so the panel says it
 * before the round trip instead of translating a constraint name afterwards:
 *
 *   · a blank title (`bibliography_title_not_blank`) — and it is the one field
 *     the record cannot do without, because it is what identifies the
 *     publication in a list;
 *   · a year outside the plausible window (`bibliography_plausible_year`);
 *   · a BibTeX key with a space, a comma or braces in it
 *     (`bibliography_bibtex_key_shape`) — those are the characters that break an
 *     entry of a `.bib` file, which is what the handle is for.
 *
 * Nothing else. Demanding an author or a year would invent a requirement the
 * catalogue does not have: an unsigned, undated press cutting is a perfectly
 * good reference, and the record says «s.f.» about it, which is a datum.
 */
export function referenceEditProblem(draft: ReferenceEdit): string | null {
  if (draft.title.trim() === '') {
    return (
      'El título de la referencia no puede quedar en blanco: es lo que se lee en la ficha de cada ' +
      'obra que la cita'
    )
  }
  if (draft.year != null && (draft.year < MIN_REFERENCE_YEAR || draft.year > MAX_REFERENCE_YEAR)) {
    return (
      `El año de publicación tiene que estar entre ${MIN_REFERENCE_YEAR} y ` +
      `${MAX_REFERENCE_YEAR}`
    )
  }
  if (/[\s,{}]/.test(draft.bibtexKey.trim())) {
    return (
      'La clave BibTeX no admite espacios, comas ni llaves: es el asa corta de la referencia ' +
      '(«rotili1985muba»). Déjala vacía si no tiene ninguna'
    )
  }
  return null
}

// ── The kind of publication on offer (RF-514) ────────────────

/** One chip of the publication-type selector. */
export interface ReferenceTypeOption {
  /** The identifier, or the empty string for «Sin clasificar». */
  value: string
  text: string
}

/**
 * The kinds of publication the panel offers, with the one this reference already
 * has ALWAYS among them.
 *
 * Three things have to be true at once and none of them is obvious:
 *
 *   · «Sin clasificar» heads the list, because a null kind is a legitimate answer
 *     — the reference was noted from a photocopy — and not a missing value;
 *   · retired kinds are not OFFERED, since choosing one would put a withdrawn
 *     vocabulary entry back into use through the back door (RF-901);
 *   · and yet the kind this reference already carries stays on the list whatever
 *     its state, marked as retired. **That is the case that would lose data
 *     silently**: a reference classified as «Folleto», the entry retired
 *     afterwards, and this panel opened to fix a typo in the title. With the chip
 *     gone, the selector shows nothing selected on a reference that IS classified,
 *     and the obvious next tap is «Sin clasificar».
 *
 * The last argument covers the same hole from the other side: the panel opens off
 * the citation row, which embeds the reference's own type, so the classification
 * can be shown even when the whole vocabulary failed to load over mobile data.
 * Only then is the embedded row used — the vocabulary is the source when it is
 * there, because it is the one that got corrected if somebody renamed the entry.
 */
export function referenceTypeOptions(
  publicationTypes: readonly { id: string; name: string; active: boolean }[],
  chosenId: string | null,
  chosenType: { id: string; name: string; active: boolean } | null,
): ReferenceTypeOption[] {
  const options: ReferenceTypeOption[] = [{ value: '', text: 'Sin clasificar' }]
  for (const type of publicationTypes) {
    if (!type.active && type.id !== chosenId) continue
    options.push({ value: type.id, text: typeChipText(type) })
  }
  if (
    chosenId !== null &&
    !options.some((option) => option.value === chosenId) &&
    chosenType !== null &&
    chosenType.id === chosenId
  ) {
    options.push({ value: chosenType.id, text: typeChipText(chosenType) })
  }
  return options
}

/** A retired kind says so on its own chip: it is not on offer, it is where it was. */
function typeChipText(type: { name: string; active: boolean }): string {
  const name = type.name.trim() === '' ? 'Tipo sin nombre' : type.name.trim()
  return type.active ? name : `${name} (retirado)`
}

// ── Saving it ────────────────────────────────────────────────

/**
 * What saving the corrected reference has to do.
 *
 * `unchanged` earns its branch here more than anywhere else in the application:
 * this table IS audited (`tg_row_audit` seals `updated_at` and `updated_by`), so
 * opening the panel, reading it and saving would record that somebody corrected
 * a reference that nobody corrected — on a row shared by the whole catalogue.
 *
 * `duplicate` is the BibTeX key, the one rule this module checks that the
 * database also checks. The collision is nearly always with a reference the
 * cataloger has in front of her, and «esa clave ya es la de tal referencia» is
 * an answer she can act on, unlike the name of a unique index. Retired
 * references count, because the index covers them.
 *
 * The database still has the last word: the loaded catalogue can be stale, and
 * 23505 is handled anyway (`referenceFailureText`).
 */
export type ReferenceEditPlan =
  | { action: 'blank'; message: string }
  | { action: 'duplicate'; message: string }
  | { action: 'unchanged' }
  | { action: 'update'; payload: ReferencePayload }

export function planReferenceEdit(
  references: readonly ReferenceRow[],
  id: string,
  draft: ReferenceEdit,
): ReferenceEditPlan {
  const problem = referenceEditProblem(draft)
  if (problem !== null) return { action: 'blank', message: problem }

  const payload = referencePayload(draft)

  if (payload.bibtex_key !== null) {
    // The mirror of the index, `place_key(bibtex_key)`: two keys that differ
    // only in capitals or accents are the same key, and a `.bib` file would not
    // tell them apart. Verified against the base — patching a key to
    // «PRUEBAMEDIDA1990» while another reference holds «pruebamedida1990» comes
    // back as 23505.
    const key = placeKey(payload.bibtex_key)
    const clash = references.find(
      (reference) =>
        reference.id !== id &&
        reference.bibtex_key !== null &&
        placeKey(reference.bibtex_key) === key,
    )
    if (clash !== undefined) {
      return { action: 'duplicate', message: bibtexKeyClashText(payload.bibtex_key, clash) }
    }
  }

  const current = references.find((reference) => reference.id === id)
  if (
    current !== undefined &&
    current.title === payload.title &&
    current.authors === payload.authors &&
    current.editors === payload.editors &&
    current.container_title === payload.container_title &&
    current.publisher === payload.publisher &&
    current.place === payload.place &&
    (current.year ?? null) === payload.year &&
    (current.publication_type_id ?? null) === payload.publication_type_id &&
    (current.bibtex_key ?? null) === payload.bibtex_key
  ) {
    return { action: 'unchanged' }
  }

  return { action: 'update', payload }
}

/** Whose the key already is, and whether that reference is even on offer. */
function bibtexKeyClashText(key: string, clash: ReferenceRow): string {
  const title = referenceTitleText(clash)
  if (clash.active) {
    return (
      `La clave «${key}» ya es la de «${title}», y no puede haber dos iguales. Las claves no ` +
      'distinguen mayúsculas ni tildes: ponle otra.'
    )
  }
  return (
    `La clave «${key}» ya es la de «${title}», que está retirada del catálogo. Aunque no se ` +
    'ofrezca para citar, sigue ocupando la clave: ponle otra.'
  )
}

/** A reference named on screen. Never blank, whatever arrived in the row. */
export function referenceTitleText(reference: Pick<ReferenceRow, 'title'>): string {
  const title = reference.title.trim()
  return title === '' ? 'Referencia sin título' : title
}

// ── What has to be said before saving ────────────────────────

/**
 * The first half is the sentence the whole «Tablas» section already says, and it
 * is said here for the same reason: what is being corrected is not a field of
 * this artwork's record.
 */
const SHARED_ROW =
  'Esta referencia es del catálogo compartido, no de esta obra: lo que corrijas aquí se lee igual ' +
  'en la ficha de cualquier obra que la cite.'

/**
 * The warning that goes above the fields, with the reach of the correction
 * MEASURED whenever it can be.
 *
 * «Lo verán las demás obras» is true but abstract, and the number is what
 * changes the decision: correcting a reference nobody else cites is housekeeping,
 * and correcting one that eleven records cite is an edit of eleven records. So
 * the count of OTHER artworks citing it is asked for and shown.
 *
 * `null` is «not counted» and not «zero», and it is the case that must not lie:
 * while the count is in flight, or when it failed — one bar of signal in a
 * warehouse — the notice keeps the part that is certainly true and says out loud
 * that the number is unknown. Printing «ninguna otra obra la cita» on a failed
 * count is how somebody rewrites a title believing it is private.
 */
export function referenceReachNotice(otherArtworks: number | null): string {
  if (otherArtworks === null) {
    return (
      `${SHARED_ROW} No se ha podido contar cuántas la citan, así que cuenta con que no sea solo ` +
      'esta.'
    )
  }
  if (otherArtworks <= 0) {
    return (
      `${SHARED_ROW} Ahora mismo no la cita ninguna otra obra, pero sigue estando en el catálogo ` +
      'para las que la citen mañana.'
    )
  }
  if (otherArtworks === 1) {
    return `${SHARED_ROW} Hay otra obra que la cita: también cambiará lo que se lee en su ficha.`
  }
  return (
    `${SHARED_ROW} Hay otras ${otherArtworks} obras que la citan: también cambiará lo que se lee ` +
    'en sus fichas.'
  )
}

/**
 * What the panel says when the reference being corrected is in the trash
 * (RF-901), or null when it is on offer.
 *
 * A Cataloger sees retired references — the record of an artwork that cites one
 * shows it with its warning — so this panel can perfectly well be opened on one,
 * and correcting it is legitimate: the citation is real and its title is read.
 * What must not happen is a correction that quietly brings it back into
 * circulation, so the panel says that it stays withdrawn and where it is
 * recovered from, which is the same thing `equivalentReferenceNotice` says when
 * citing runs into one.
 */
export function referenceRetiredNotice(reference: Pick<ReferenceRow, 'active'>): string | null {
  if (reference.active) return null
  return (
    'Esta referencia está retirada del catálogo. Se puede corregir, y seguirá retirada: ' +
    'recuperarla se hace desde su propia ficha, no desde aquí.'
  )
}

// ── When the database says no ────────────────────────────────

/** What the Supabase client hands back when a request fails. */
export interface DatabaseFailure {
  code?: string | null
  message: string
  hint?: string | null
  details?: string | null
}

const COULD_NOT_SAVE = 'No se ha podido guardar la referencia'

/**
 * The sentence for a refusal, in Spanish and with the practical consequence.
 *
 * **The codes and the constraint names are the ones the base really returns**,
 * provoked through the same REST gateway the application uses, against two
 * references created for the purpose and then removed:
 *
 *   · `23514` «new row for relation "bibliography" violates check constraint
 *     "…"», and WHICH constraint is the whole message: three different mistakes
 *     arrive under one code — `bibliography_title_not_blank`,
 *     `bibliography_plausible_year` and `bibliography_bibtex_key_shape` — and a
 *     single sentence for the three would name the wrong field. The client
 *     refuses all three itself (`referenceEditProblem`), so arriving here means a
 *     stale field or another session; the advice is the same either way.
 *   · `23505` «duplicate key value violates unique constraint
 *     "bibliography_bibtex_key_unique"» — the BibTeX handle, compared without
 *     capitals or accents. The raw sentence names an index and does not say that
 *     the other reference may be retired, which is exactly when the collision
 *     looks impossible from a list that does not show it.
 *   · `23503` on `bibliography_publication_type_id_fkey` — the kind of
 *     publication chosen is no longer in the vocabulary. Its `details` arrives in
 *     English («Key is not present in table "publication_types".»), so it is not
 *     passed through.
 *   · `42501` «permission denied for schema public» — measured with the anonymous
 *     key. A Cataloger whose session expired mid-edit gets no rows changed
 *     instead (see `referenceWriteResult`), which is the likelier of the two.
 *
 * **A failure with no code is not a refusal: it is nothing answering.** It is
 * the likeliest failure of all in a storeroom, it arrives as the browser's own
 * English («Failed to fetch»), and what it needs to say is that nothing was
 * sent — so the correction is not lost, it is still on the screen.
 *
 * Anything else keeps the raw message, with the database's hint glued to it when
 * there is one: a refusal that hides what the database said is a refusal nobody
 * can diagnose.
 */
export function referenceFailureText(failure: DatabaseFailure): string {
  const code = failure.code ?? ''
  const message = failure.message ?? ''

  if (code === '23514') {
    if (message.includes('bibliography_title_not_blank')) {
      return (
        'El título de la referencia no puede quedar en blanco: es lo que se lee en la ficha de ' +
        'cada obra que la cita.'
      )
    }
    if (message.includes('bibliography_plausible_year')) {
      return (
        `El año de publicación tiene que estar entre ${MIN_REFERENCE_YEAR} y ` +
        `${MAX_REFERENCE_YEAR}: fuera de ahí es una errata y no una fecha.`
      )
    }
    if (message.includes('bibliography_bibtex_key_shape')) {
      return (
        'La clave BibTeX no admite espacios, comas ni llaves, y tampoco puede quedar vacía por ' +
        'dentro: bórrala del todo si la referencia no tiene clave.'
      )
    }
    return `${COULD_NOT_SAVE}: el catálogo ha rechazado alguno de los datos. ${message}`
  }
  if (code === '23505') {
    return (
      'Ya hay otra referencia con esa clave BibTeX, y no puede haber dos iguales. Puede estar ' +
      'retirada del catálogo y seguir ocupándola: ponle otra clave.'
    )
  }
  if (code === '23503') {
    return (
      'El tipo de publicación que le has puesto ya no está en el catálogo. Guárdala sin ' +
      'clasificar y vuelve a elegirlo.'
    )
  }
  if (code === '42501') {
    return (
      'Tu sesión no puede corregir las referencias del catálogo: solo el Catalogador. Vuelve a ' +
      'entrar y prueba otra vez.'
    )
  }
  if (isNothingAnswering(message)) {
    return (
      `${COULD_NOT_SAVE}: la aplicación no ha podido hablar con el catálogo. La corrección no se ` +
      'ha enviado, así que no se ha perdido: comprueba la conexión y vuelve a intentarlo.'
    )
  }
  const hint = (failure.hint ?? '').trim()
  return `${COULD_NOT_SAVE}: ${message}${hint === '' ? '' : ` ${hint}`}`
}

/**
 * Nothing answered: no message at all, or the browser's own English about
 * fetch. The same test the «Tablas» screens use (`isNetworkFailure`), written
 * here because this module is not one of them and importing a maintenance
 * screen's internals from a block of the record would tie the two together.
 */
function isNothingAnswering(message: string): boolean {
  return (
    message.trim() === '' || /failed to fetch|networkerror|network error|load failed/i.test(message)
  )
}

/**
 * The result of the write, as a sentence to show or null when it worked.
 *
 * `rows` is the reason this exists and it is not defensive plumbing: **PostgREST
 * answers an update that matched nothing with 204 and no error.** Measured — a
 * Reader patching a reference gets 204 and zero rows changed, NOT 42501, and so
 * does a correction sent for a reference that is no longer there. Trusting «no
 * error» would close the panel telling the cataloger that the catalogue was
 * corrected while it was not, which on a row shared by every citing artwork is
 * the worst outcome this panel can have.
 *
 * `undefined` is «not counted» and not «zero».
 */
export function referenceWriteResult(result: {
  failure?: DatabaseFailure | null
  rows?: number
}): string | null {
  if (result.failure) return referenceFailureText(result.failure)
  if (result.rows === 0) {
    return (
      'La referencia no se ha tocado: o ya no está en el catálogo, o tu sesión ha dejado de poder ' +
      'corregirla. Vuelve a cargar la ficha y compruébalo antes de escribirla otra vez.'
    )
  }
  return null
}
