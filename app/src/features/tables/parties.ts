/**
 * People and institutions on the client side: what the maintenance screen decides
 * before it talks to the database, what it says when the database says no, and —
 * the part that is not like the other master tables — **what it does with a
 * third party's contact details** (RF-508, RF-105, RF-1106, RF-901, ADR-007).
 *
 * ── ONE TABLE FOR PEOPLE AND FOR INSTITUTIONS ───────────────
 *
 * Not two, and the reason is written in the migration: half the attributes are the
 * same — contact, contact status, locality, country — and splitting them would
 * mean querying two places to compose one line of provenance. And a family
 * collection turns into a foundation without stopping being the same link of the
 * chain; with two tables that change would be retiring one record and creating
 * another, which is exactly what this project never does (RF-901).
 *
 * So the screen does not have two lists either. The type is a datum OF the record,
 * shown on its row and changeable in its form, and the whole register is one list
 * sorted by name: the Museo de Bellas Artes de Badajoz has to be findable without
 * first answering «is a museum a person?».
 *
 * ── THE CONTACT, MEASURED AND NOT ASSUMED ───────────────────
 *
 * `parties.contact` is the one datum in this catalogue that belongs to somebody
 * outside it: a private collector's telephone number, a heir's email address.
 * Measured on 4 August 2026 against the local base, through the same REST gateway
 * the application uses, authenticating for real as `lector@local.test` and as
 * `catalogador@local.test`:
 *
 *   · The Reader READS IT. `GET /rest/v1/parties?select=id,name,contact` answers
 *     200 with the column filled in. That is not a leak, it is RF-105 decided out
 *     loud — «el Lector tiene acceso de solo lectura a las nueve tablas, sin
 *     restricción por campo, incluido `contacto`» — and the policy is
 *     `(active and can_read()) or can_edit()`, with no column-level grant behind it.
 *   · Anonymous reads NOTHING: `permission denied for schema public`. The anon key
 *     that ships in this client opens no door on its own.
 *   · A retired record is invisible to the Reader (`active and can_read()`), and
 *     visible to the Cataloger. So the trash of this register — and the contact of
 *     everyone in it — is the editor's alone.
 *
 * **Therefore: hiding the contact on this screen is NOT a security control, and
 * this file does not pretend it is.** The barrier is the policy, and the policy
 * lets any authenticated Reader read the column with one request. What the screen
 * protects against is the other thing, which is the one that actually happens:
 * incidental disclosure. This screen gets opened to correct the spelling of a
 * museum, on a phone, in a storeroom, with the owner of the piece standing next to
 * you; and it gets screenshotted, and shown to whoever asks how the catalogue
 * works. A list of forty rows that paints telephone numbers by default hands out
 * personal data of forty third parties to everybody who ever looks at it, for a
 * job that needed none of them.
 *
 * So the decision, and it is a decision and not a default:
 *
 *   1. **The list does not carry the contact.** `PartyListRow` is `Party` minus
 *      `contact`, so the query cannot select it by accident and the type says why —
 *      the same criterion `useParties` already applied to the record's chooser.
 *   2. **It is fetched one row at a time, on purpose, and only when asked**: by
 *      «Ver contacto» to read it, or by opening the form to write it. Forty
 *      contacts never sit in the browser's memory at once.
 *   3. **The notice is on screen and not in this comment.** `CONTACT_NOTICE` says
 *      whose datum it is and who else can read it, because a cataloger deciding
 *      whether to write a private mobile number into a shared catalogue is
 *      entitled to know that the Reader will see it.
 *   4. **A draft whose contact was not loaded CANNOT erase it.** `contact: null`
 *      means «not loaded», and `partyPayload` then leaves the column out of the
 *      write. Without that rule the cheapest possible protection — not reading the
 *      datum — would become the worst possible bug: saving a corrected name would
 *      blank the telephone number of the person the record is about.
 *
 * ── AND WHAT IS NOT HERE ────────────────────────────────────
 *
 * No rule the database already holds: that the normalized name is unique
 * (`parties_name_unique` over `place_key(name)`), that a name cannot be blank or
 * padded, that a party in use cannot be retired. Those live next to the data, and
 * this module translates the refusal into a sentence with its practical
 * consequence. A second copy would be a rule that drifts.
 *
 * The ONE deliberate exception is the duplicate on edit, marked as such in
 * `planPartyEdit`, for the same reason the venues screen made it: the collision is
 * nearly always with a row on the screen, and «ya hay una ficha con ese nombre»
 * beats the name of an index. The database still has the last word.
 */

import { placeKey } from '../../lib/places'
import { normalizeForSearch } from '../../lib/vocabulary'
import {
  CONTACT_STATUS_LABEL,
  PARTY_TYPE_LABEL,
  type ContactStatus,
  type Party,
  type PartyType,
} from '../../lib/types'

/**
 * A row of the register as the list carries it: everything except the contact.
 *
 * Written as `Omit<Party, 'contact'>` and not as a fresh interface so that the
 * omission is the type's whole content — adding a column to `Party` adds it here,
 * and the one column that must never arrive by accident is named. See the header.
 */
export type PartyListRow = Omit<Party, 'contact'>

// ── The two enums, as the screen offers them ─────────────────

/**
 * Person or institution (RF-508), in the order the type declares them.
 *
 * Derived from the label map instead of being listed again: the keys of an object
 * literal come out in declaration order, so this is the enum's own order, and a
 * value added to `PARTY_TYPE_LABEL` appears here without anybody remembering to.
 * A second hand-written list is a list that ends up missing a value.
 */
export const PARTY_TYPE_OPTIONS: readonly { value: PartyType; text: string }[] = (
  Object.keys(PARTY_TYPE_LABEL) as PartyType[]
).map((value) => ({ value, text: PARTY_TYPE_LABEL[value] }))

/**
 * How far the conversation has got, in the order of the enum — and the order
 * matters here in a way it does not for a vocabulary: «Sin contactar → Contactada
 * → Ha enviado información → Visitada → Datos verificados» is a progress, not a
 * classification, and the chips read as a track when they keep it.
 */
export const CONTACT_STATUS_OPTIONS: readonly { value: ContactStatus; text: string }[] = (
  Object.keys(CONTACT_STATUS_LABEL) as ContactStatus[]
).map((value) => ({ value, text: CONTACT_STATUS_LABEL[value] }))

// ── Identity, reading order and search ───────────────────────

/**
 * The comparison key of `parties_name_unique`, mirrored on this side:
 * `place_key(name)`.
 *
 * `placeKey` is imported and not rewritten because it is the twin of the SQL
 * `place_key` — lowercase, accents dropped, **ñ left standing** — and if the two
 * drifted this screen would offer to create a record the database then rejects,
 * answering a reasonable request with a unique violation.
 *
 * It is NOT `normalizeForSearch`, which is the trap of this whole batch of
 * screens: that one splits in NFD and drops the combining marks, so it flattens
 * the ñ as well. With it, asking for «Muniz» while «Muñiz» was in the register
 * would have answered «ya está» and added nothing — and the two are two different
 * people, which the database knows and would have accepted.
 */
export function partyKey(name: string): string {
  return placeKey(name)
}

/**
 * The register sorted for reading: by name in es-ES.
 *
 * Sorted on this side and not in the query because the database's own collation
 * may order «Álvarez» past the z, and a list that hides the A's at the bottom is
 * a list nothing gets found in.
 *
 * Retired records are NOT pushed to the bottom: the row greys them out, and moving
 * a name away from where it is looked for hides it twice — this being the only
 * screen a retired record can be brought back from.
 */
export function sortParties<R extends PartyListRow>(parties: readonly R[]): R[] {
  return parties
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }))
}

/**
 * `Badajoz, España`, with whichever half is missing dropped. Empty when both are.
 *
 * The two halves are separate columns and not one address because that is what the
 * provenance line needs: «Colección privada, España» is composed from the country
 * alone, without parsing anything (RF-508, RF-509).
 */
export function partyPlaceText(party: { locality: string; country: string }): string {
  return [party.locality.trim(), party.country.trim()].filter((part) => part).join(', ')
}

/**
 * The second line of a row: «Institución · Badajoz, España».
 *
 * The type goes first because it is what the provenance line depends on, and the
 * place is what tells two homonymous records apart — the register has one row per
 * normalized name, so «Juan Pérez» is disambiguated in the name itself and the
 * locality is the confirmation that the right Juan Pérez is being edited.
 *
 * Never blank (RF-304): with no place written it is just the type, which always
 * exists — this enum has no «Sin revisar», deliberately.
 */
export function partySubtitle(party: { party_type: PartyType; locality: string; country: string }) {
  return [PARTY_TYPE_LABEL[party.party_type], partyPlaceText(party)]
    .filter((bit) => bit !== '')
    .join(' · ')
}

/**
 * The rows the search box reaches, in the order they came in.
 *
 * **Forgiving on purpose, and with the opposite key to `partyKey`.** Search uses
 * `normalizeForSearch`, which also flattens the ñ, so typing «muniz» on a phone
 * keyboard finds «Muñiz»: that is right for looking, and wrong for identity, where
 * flattening it would merge two different people. The two keys answer two
 * different questions and this is the file where both are stated.
 *
 * It matches over the name, the locality and the country, because that is what the
 * row shows. **It does not match over the contact**, and could not: the contact is
 * not loaded (see the header), and loading forty of them to let somebody search by
 * telephone number would spend the protection on a search nobody asked for.
 *
 * This is also the one master table of the six that genuinely grows — the register
 * of owners of a catalogue raisonné reaches hundreds of rows, while the
 * vocabularies stay at a dozen — which is why it is the one with a filter.
 */
export function filterParties<R extends PartyListRow>(parties: readonly R[], query: string): R[] {
  const wanted = normalizeForSearch(query)
  if (wanted === '') return [...parties]
  return parties.filter((party) =>
    normalizeForSearch(`${party.name} ${party.locality} ${party.country}`).includes(wanted),
  )
}

// ── The record as it is being written ────────────────────────

/**
 * A record being created or edited.
 *
 * `contact` is `string | null`, and **null does not mean empty: it means NOT
 * LOADED, and therefore not to be written.** The list does not carry the contact,
 * so a draft opened from a row starts with null, and it only becomes a string once
 * that row's contact has been fetched. Modelling the difference in the type is the
 * cheapest way to make the protection safe: an empty string here would erase a
 * telephone number on the next save of an unrelated field.
 */
export interface PartyDraft {
  party_type: PartyType
  name: string
  locality: string
  country: string
  /** `null` = not loaded, do not write. `''` = loaded and deliberately empty. */
  contact: string | null
  contact_status: ContactStatus
  note: string
}

/**
 * A blank draft for the «Añadir» card.
 *
 * `PERSON` first, and `country` on «España», exactly as `emptyNewParty` already
 * decided for the record's chooser: nearly every party of this catalogue is
 * Spanish, it is one field less with the document in hand, and it is one tap to
 * change.
 *
 * **`contact` starts null, and the add form does not paint it.** What a party's
 * telephone number is gets learnt in the conversation that comes after the record
 * exists, not while typing the name of a museum off a press cutting — the same
 * argument the venues screen made for its note. The consequence is stronger than
 * tidiness: the quick path that gets used forty times cannot write a personal
 * datum at all, because there is no field for it and the payload leaves the column
 * out.
 */
export function emptyPartyDraft(): PartyDraft {
  return {
    party_type: 'PERSON',
    name: '',
    locality: '',
    country: 'España',
    contact: null,
    contact_status: 'NOT_CONTACTED',
    note: '',
  }
}

/**
 * The draft that opens when an existing record is edited.
 *
 * `contact` is handed in separately because it does not come from the list: null
 * while it is on its way or if it could not be fetched, and the form then shows the
 * field disabled and saves without touching the column.
 */
export function partyDraft(party: PartyListRow, contact: string | null): PartyDraft {
  return {
    party_type: party.party_type,
    name: party.name,
    locality: party.locality,
    country: party.country,
    contact,
    contact_status: party.contact_status,
    note: party.note,
  }
}

/**
 * What stops a record from being written, or null.
 *
 * Only the name, and only because the database demands it
 * (`parties_name_not_blank`). Neither the locality nor the type is demanded: the
 * type has a value always — this enum has no «Sin revisar» — and refusing a record
 * over its locality would stop a chain of provenance being written from a document
 * that says «Colección Vargas» and nothing else, which is exactly when these get
 * created.
 */
export function partyDraftProblem(draft: PartyDraft): string | null {
  if (draft.name.trim() === '') return 'Escribe el nombre de la persona o de la institución'
  return null
}

/**
 * What travels to `parties`.
 *
 * Everything trimmed, and the name trimmed because the database demands the name
 * ALREADY IS trimmed (`name = btrim(name)`): measured against the base, « Galeria
 * Nueva » comes back as 23514, the same code as a blank name, naming a check
 * constraint in English.
 *
 * **`contact` is omitted when the draft did not load it**, which is the rule that
 * makes «do not read the personal datum» safe rather than destructive. The
 * property is absent from the object and not set to null — a null would be a write
 * that the column, `not null`, would refuse, and an empty string would be a write
 * that succeeds and erases.
 */
export function partyPayload(draft: PartyDraft): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    party_type: draft.party_type,
    name: draft.name.trim(),
    locality: draft.locality.trim(),
    country: draft.country.trim(),
    contact_status: draft.contact_status,
    note: draft.note.trim(),
  }
  if (draft.contact !== null) payload.contact = draft.contact.trim()
  return payload
}

// ── Adding one ───────────────────────────────────────────────

/**
 * What typing a record into the «Añadir» card has to do.
 *
 * The interesting case is `restore`, and it is why the decision is not left to the
 * database: inserting a name that exists BUT IS RETIRED comes back as 23505,
 * indistinguishable from «somebody added it a second ago». Reporting both as
 * success would say «añadida» and leave the record in the trash. What the cataloger
 * meant by typing a retired name is that she wants it back — and here it matters
 * more than in a vocabulary, because the retired record still holds the provenance
 * of whatever artworks it held.
 *
 * `reuse` is the equivalent-and-active case: «museo de bellas artes de badajoz
 * (muba)» when the record is already there with its capitals. The database refuses
 * that too — measured, 23505 on `parties_name_unique` — so answering «ya está» is
 * the truth and not a shortcut.
 */
export type PartyAdditionPlan =
  | { action: 'blank'; message: string }
  | { action: 'insert'; payload: Record<string, unknown> }
  | { action: 'reuse'; party: PartyListRow }
  | { action: 'restore'; party: PartyListRow }

export function planPartyAddition(
  parties: readonly PartyListRow[],
  draft: PartyDraft,
): PartyAdditionPlan {
  const problem = partyDraftProblem(draft)
  if (problem !== null) return { action: 'blank', message: problem }

  const key = partyKey(draft.name)
  // Retired records included: the unique index covers them, so this is the only
  // way to find the one that has to come back instead of failing.
  const known = parties.find((party) => partyKey(party.name) === key)
  if (known === undefined) return { action: 'insert', payload: partyPayload(draft) }
  return known.active ? { action: 'reuse', party: known } : { action: 'restore', party: known }
}

// ── Editing one ──────────────────────────────────────────────

/**
 * What saving an edited record has to do.
 *
 * `unchanged` is compared against the draft AS IT OPENED and not against the row,
 * because the contact is not on the row: comparing to the row would either ignore a
 * corrected telephone number or report a change every time the form opened. Opening
 * a record, reading it and closing it must not write — it would move `updated_at`
 * and `updated_by` (RF-801, sealed by `tg_row_audit`) and put this session's name
 * on a record nobody touched, which is a small lie in exactly the trail that exists
 * to be believed.
 *
 * `duplicate` is the one rule this module checks that the database checks too, and
 * it is deliberate: the collision is nearly always with a row on the screen, and
 * «ya hay una ficha llamada X» beats a round trip that answers with the name of an
 * index. It excludes the record itself, so correcting «coleccion vargas» into
 * «Colección Vargas» stays possible. A retired clash says so, because the index
 * covers the trash and the honest answer is «recupérala» — that way it keeps the
 * provenance it already holds.
 */
export type PartyEditPlan =
  | { action: 'blank'; message: string }
  | { action: 'duplicate'; message: string }
  | { action: 'unchanged' }
  | { action: 'update'; payload: Record<string, unknown> }

export function planPartyEdit(
  parties: readonly PartyListRow[],
  id: string,
  opened: PartyDraft,
  draft: PartyDraft,
): PartyEditPlan {
  const problem = partyDraftProblem(draft)
  if (problem !== null) return { action: 'blank', message: problem }

  const payload = partyPayload(draft)
  if (JSON.stringify(payload) === JSON.stringify(partyPayload(opened))) {
    return { action: 'unchanged' }
  }

  const key = partyKey(draft.name)
  const clash = parties.find((party) => party.id !== id && partyKey(party.name) === key)
  if (clash !== undefined) {
    const place = partyPlaceText(clash)
    const where = place === '' ? '' : ` (${place})`
    return {
      action: 'duplicate',
      message: clash.active
        ? `Ya hay una ficha llamada «${clash.name}»${where}, y no puede haber dos con el mismo nombre —` +
          ' las mayúsculas y las tildes no cuentan. Usa esa, o distingue las dos en el propio nombre,' +
          ' como hacen los catálogos: «Juan Pérez (Badajoz)».'
        : `«${clash.name}»${where} ya existe, retirada. Recupérala en vez de crear otra: así conserva` +
          ' las procedencias y las obras que ya sostiene.',
    }
  }

  return { action: 'update', payload }
}

// ── When the database says no ────────────────────────────────

/** What the Supabase client hands back when a request fails. */
export interface DatabaseFailure {
  code?: string | null
  message: string
  hint?: string | null
  details?: string | null
}

/** The operation being attempted, which is what the fallback sentence names. */
export type PartyOperation = 'load' | 'create' | 'save' | 'retire' | 'restore' | 'contact'

const OPERATION_TEXT: Record<PartyOperation, string> = {
  load: 'No se han podido cargar las personas e instituciones',
  create: 'No se ha podido crear la ficha',
  save: 'No se ha podido guardar la ficha',
  retire: 'No se ha podido retirar la ficha',
  restore: 'No se ha podido recuperar la ficha',
  contact: 'No se han podido cargar los datos de contacto',
}

/**
 * The sentence for a refusal, in Spanish and with the practical consequence.
 *
 * **Every code here was provoked against the local base on 4 August 2026**, through
 * the same REST gateway the application uses, and none of them was guessed:
 *
 *   · `23505` «duplicate key value violates unique constraint
 *     "parties_name_unique"», 409. Names an index nobody has heard of, and does not
 *     say the thing that matters: the register holds ONE row per normalized name,
 *     so two homonyms are told apart in the name itself.
 *   · `23514` «new row for relation "parties" violates check constraint
 *     "parties_name_not_blank"», 400 — for a blank name AND for one with spaces
 *     around it, which is why the payload trims.
 *   · `42501` «new row violates row-level security policy for table "parties"»,
 *     403 — a session that is not the Cataloger. The screen already sends a Reader
 *     to the list, so this is the expired-or-changed-role case, and what it needs to
 *     say is «vuelve a entrar».
 *   · `22P02` «invalid input value for enum party_type_value: "COMPANY"», 400 —
 *     unreachable while the chips are the only way to choose, and mapped because
 *     the raw message is the name of a PostgreSQL type.
 *   · `P0001` — the three refusals of `tg_party_deactivation`, each with its own
 *     message and its own hint in a separate field. **Passed through with the hint
 *     glued on**, because the schema wrote them in Spanish FOR THE CATALOGER and the
 *     hint is precisely what to do first. Retiring goes through
 *     `retireRefusalText`, which adds WHERE.
 *
 * A failure with no code is the network: the request never reached the base, so
 * nothing was written, and saying so is more useful than a fetch error.
 *
 * Anything else keeps the raw message after the sentence: an unexpected refusal
 * that hides what the database said is a refusal nobody can diagnose.
 */
export function partyFailureText(failure: DatabaseFailure, operation: PartyOperation): string {
  const code = (failure.code ?? '').trim()
  if (code === '23505') {
    return (
      'Ya hay una ficha con ese nombre; puede estar retirada, búscala y recupérala. Si son dos distintas, distínguelas: «Juan Pérez (Badajoz)».'
    )
  }
  if (code === '23514') {
    return (
      'El nombre no puede quedar en blanco: es lo que imprime cada línea de procedencia.'
    )
  }
  if (code === 'P0001') {
    const hint = (failure.hint ?? '').trim()
    const message = failure.message.trim().replace(/\.$/, '')
    return hint === '' ? `${message}.` : `${message}. ${hint}`
  }
  if (code === '42501') {
    return (
      'Tu sesión no puede mantener las personas e instituciones: solo el Catalogador. Vuelve a ' +
      'entrar y prueba otra vez.'
    )
  }
  if (code === '22P02') {
    return (
      'No se ha entendido si es una persona o una institución. Vuelve a elegirlo.'
    )
  }
  if (code === '') {
    return `${OPERATION_TEXT[operation]}: no hay conexión con el catálogo, así que no se ha guardado nada. Compruébala y vuelve a intentarlo.`
  }
  return `${OPERATION_TEXT[operation]}: ${failure.message}`
}

/**
 * The result of a write, as a sentence to show or null when it worked.
 *
 * `rows` is why this exists, and it is not defensive plumbing: **measured against
 * the base, a PATCH that the policies refuse comes back 200 with `[]` and NO
 * error.** Done with the Reader's own token on a real record. Trusting «no error»
 * there would make this screen report a correction it never made, which is the one
 * failure a maintenance screen cannot have — the cataloger closes it believing the
 * catalogue is fixed.
 *
 * `undefined` means «not counted», not «zero»: an insert without `select` returns
 * no representation and must not be read as a failure.
 */
export function partyWriteResult(
  operation: PartyOperation,
  result: { failure?: DatabaseFailure | null; rows?: number },
): string | null {
  if (result.failure) return partyFailureText(result.failure, operation)
  if (result.rows === 0) {
    return (
      'No se ha guardado nada: o la ficha ya no está, o tu sesión no puede editarla. Vuelve a entrar.'
    )
  }
  return null
}

// ── Where a party is being used, which the refusal does not say ──

/**
 * The three places a party can be in use, exactly as `tg_party_deactivation`
 * counts them.
 *
 * **Read AFTER a refusal and never before it**, and that distinction is the whole
 * design. The other screens of the section keep no count, and rightly: a count kept
 * next to the button would be a second copy of the rule, out of step with the next
 * artwork saved from a phone. What is here is not a copy of the rule — it is the
 * EXPLANATION of a refusal the database has already given, asked for at the moment
 * the answer is needed, so it cannot be stale.
 *
 * And it is needed, because of how the trigger is written: it checks provenance,
 * then rights holder, then venue, and raises on the FIRST one it finds. A party that
 * is all three says only «sostiene un eslabón de procedencia», and «no se puede
 * retirar» without saying where forces a hand search through the whole catalogue —
 * which for a register of owners means opening every record.
 *
 * The conditions mirror the trigger and not something similar:
 *   · provenance — link ACTIVE and artwork ACTIVE (the trigger joins `artworks`);
 *   · rights — artwork ACTIVE;
 *   · venues — venue ACTIVE.
 * A link on a retired artwork does not block, and saying it did would send the
 * cataloger looking for something she cannot find.
 */
export interface PartyUsage {
  /** `catalog_id` of the artworks whose chain of provenance names it. */
  provenance: string[]
  /** `catalog_id` of the artworks it is the rights holder of. */
  rights: string[]
  /** The venues it is the institution behind. */
  venues: { name: string; locality: string }[]
}

export function emptyPartyUsage(): PartyUsage {
  return { provenance: [], rights: [], venues: [] }
}

export function partyUsageIsEmpty(usage: PartyUsage): boolean {
  return usage.provenance.length === 0 && usage.rights.length === 0 && usage.venues.length === 0
}

/**
 * «RC-0012, RC-0013 y RC-0014»: a list read out loud, in Spanish.
 *
 * The last separator is «y» and not a comma because this ends up inside a sentence
 * a person reads on a phone, and a comma-separated tail reads as one more item.
 */
export function spanishList(items: readonly string[]): string {
  if (items.length === 0) return ''
  if (items.length === 1) return items[0] as string
  return `${items.slice(0, -1).join(', ')} y ${items[items.length - 1] as string}`
}

/** «Casa de Cultura» (Zafra), or just the name when there is no locality. */
function venueText(venue: { name: string; locality: string }): string {
  const locality = venue.locality.trim()
  return locality === '' ? `«${venue.name}»` : `«${venue.name}» (${locality})`
}

/**
 * Where the party is in use, spelled out, or null when nowhere.
 *
 * Written as the sentences the refusal needs after it, with singular and plural,
 * because «Sostiene la procedencia de las obras RC-0012» is the kind of sentence
 * that makes a screen look machine-written and gets read as noise.
 *
 * The identifiers are the ones printed on the labels stuck to the pieces, so they
 * are the answer to «which artworks»: no title is needed to go and look, and
 * fetching one would make this a bigger query for a longer sentence.
 */
export function describePartyUsage(usage: PartyUsage): string | null {
  const parts: string[] = []
  if (usage.provenance.length > 0) {
    parts.push(
      usage.provenance.length === 1
        ? `Sostiene la procedencia de la obra ${usage.provenance[0] as string}.`
        : `Sostiene la procedencia de las obras ${spanishList(usage.provenance)}.`,
    )
  }
  if (usage.rights.length > 0) {
    parts.push(
      usage.rights.length === 1
        ? `Es titular de derechos de la obra ${usage.rights[0] as string}.`
        : `Es titular de derechos de las obras ${spanishList(usage.rights)}.`,
    )
  }
  if (usage.venues.length > 0) {
    const named = usage.venues.map(venueText)
    parts.push(
      named.length === 1
        ? `Es la institución de la sede ${named[0] as string}.`
        : `Es la institución de las sedes ${spanishList(named)}.`,
    )
  }
  return parts.length === 0 ? null : parts.join(' ')
}

/**
 * The whole answer to a refused retirement: what the database said, and where.
 *
 * The database's own sentence comes first and untouched, hint included — it was
 * written in Spanish for the cataloger and it is the one that says what to do
 * first. What this adds is the part no message can carry, because the trigger stops
 * at the first thing it finds: the list of artworks and venues to go and change.
 *
 * The three cases that are not «here is where»:
 *   · a refusal that is not P0001 — a lost session, no connection — is not a usage
 *     problem, and looking for uses would answer a question nobody asked;
 *   · the usage query itself failed: say so, and say where to look by hand, instead
 *     of silently dropping the half that was the point;
 *   · the base refused and nothing shows up. It is a real case — somebody linked
 *     the party a second ago, or the link hangs off something this session cannot
 *     see — and the honest answer is that the screen is out of date, not a
 *     contradiction dressed up as a list.
 */
export function retireRefusalText(
  failure: DatabaseFailure,
  usage: PartyUsage | null,
): string {
  const said = partyFailureText(failure, 'retire')
  if ((failure.code ?? '').trim() !== 'P0001') return said
  if (usage === null) {
    return (
      `${said} No se ha podido consultar dónde se usa: míralo a mano en la procedencia de las ` +
      'obras, en el titular de derechos y en las sedes de exposición.'
    )
  }
  const where = describePartyUsage(usage)
  if (where === null) {
    return (
      `${said} La pantalla no ve dónde se usa, así que está desfasada: puede que alguien la haya ` +
      'usado hace un segundo. Vuelve a cargarla y mira otra vez.'
    )
  }
  return `${said} ${where}`
}

// ── The contact, on screen ───────────────────────────────────

/**
 * The notice that goes with the contact, once and at the top.
 *
 * It says the two things the cataloger cannot see from the screen and needs in
 * order to decide what to write in the field: whose datum it is, and that the
 * Reader reads it. The second half is measured, not assumed (see the header): the
 * policy is `(active and can_read()) or can_edit()` and RF-105 decided out loud
 * that there is no restriction by field.
 */
export const CONTACT_NOTICE =
  'El teléfono y el correo son datos personales de un tercero: se piden ficha a ficha.'

/**
 * El resto del aviso, detrás del icono de información.
 *
 * Va aparte porque **son dos cosas distintas**: la de fuera dice qué está pasando en
 * esta pantalla —por qué la lista no los enseña—, que se ve de un vistazo y no hay que
 * volver a leerla; la de dentro es la regla que cambia lo que se escribe, y esa hace
 * falta entera la primera vez que alguien va a teclear un teléfono aquí. Juntas eran
 * tres líneas de gris pequeño encima de la lista, que es la forma más segura de que no
 * se lea ninguna de las dos.
 */
export const CONTACT_DETAIL =
  'No se pintan en la lista, y quien tenga acceso de consulta al catálogo también los ve. ' +
  'Escribe lo que haga falta para la investigación y nada más.'

/**
 * What the row shows once the contact has been asked for.
 *
 * An empty contact is a real answer and not a hole (RF-304): «Sin datos de
 * contacto» means the conversation has not started, which next to «Sin contactar»
 * is the record saying the same thing twice on purpose — the alternative is a blank
 * space that reads as a screen that failed.
 */
export function contactText(contact: string): string {
  return contact.trim() === '' ? 'Sin datos de contacto registrados' : contact.trim()
}

/**
 * What the contact field of the form says under itself.
 *
 * The disabled case is the one that matters: if the fetch failed, the field cannot
 * be edited AND the save leaves the column alone, and the row has to say so. A
 * greyed-out field with no explanation looks like the screen forbidding something.
 */
export function contactFieldNotice(loaded: boolean): string {
  return loaded
    ? 'Lo verá cualquiera que pueda consultar el catálogo.'
    : 'No se han podido cargar los datos de contacto, así que no se pueden editar. Al guardar se ' +
        'quedan como estaban: se puede corregir el resto sin miedo.'
}

// ── What the list says when it has nothing to show ───────────

/**
 * The notice that goes where the rows would be, or null when there are rows.
 *
 * Five situations and only ONE of them is «there is nobody in the register», which
 * is the point: printing «todavía no hay ninguna ficha» while the query is in the
 * air, or after it failed, is the screen asserting something about the catalogue
 * that it does not know — and it is the assertion that makes a cataloger create a
 * second record for a museum that already has one.
 *
 * The search-with-no-match case is separate from both, and it is the one that
 * happens daily: with a filter over a register of hundreds, «no hay ninguna ficha»
 * on a mistyped surname is a lie about the catalogue.
 *
 * The empty case explains what the register IS, because at that moment there is
 * room to say it and it is the only moment it gets read.
 */
export function partyListNotice(state: {
  loading: boolean
  error: string | null
  total: number
  shown: number
  query: string
}): string | null {
  if (state.shown > 0) return null
  if (state.loading) return 'Cargando las personas e instituciones…'
  // The error already has its own paragraph at the top: repeating it here would say
  // it twice, and claiming the register is empty would say it wrong.
  if (state.error !== null) return null
  if (state.total > 0) {
    return `Ninguna ficha coincide con «${state.query.trim()}». Se busca por nombre, localidad y país.`
  }
  return (
    'Todavía no hay ninguna persona ni institución: los eslabones de la cadena de procedencia. La primera se crea aquí arriba.'
  )
}

/**
 * The count under the title, with singular and plural, or null when there is
 * nothing to count.
 *
 * Both numbers, because this is the only screen where a retired record is visible
 * and «14 fichas» while one of them is in the trash is a count that does not match
 * the list underneath it.
 */
export function summarizeParties(parties: readonly PartyListRow[]): string | null {
  const active = parties.filter((party) => party.active).length
  const retired = parties.length - active
  if (parties.length === 0) return null
  const head = active === 1 ? '1 ficha' : `${active} fichas`
  if (retired === 0) return head
  return `${head} y ${retired === 1 ? '1 retirada' : `${retired} retiradas`}`
}
