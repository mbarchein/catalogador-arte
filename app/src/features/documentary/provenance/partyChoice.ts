/**
 * Choosing the person or institution a link of the chain names (RF-508, RF-509).
 *
 * The rules of the chooser are here and not in the sheet, because two of them
 * decide what ends up in the catalogue and one of them protects a person:
 *
 *   · A RETIRED record is not offered. It is in the trash (RF-901) and hanging a
 *     new link on it would put it back in circulation through the side door —
 *     the database will not even let it be retired while a link holds it.
 *   · Unless it is the one already chosen. Dropping it from the list of a link
 *     that already uses it would make the form look like it lost the datum, and
 *     saving would then blank a documented owner.
 *   · `contact` never travels. It is third-party personal data (RF-105) that no
 *     screen of this feature reads, and `PartyRef` does not carry it.
 */

import { fuzzyRankBy } from '../../../lib/vocabulary'
import { PARTY_TYPE_LABEL } from '../../../lib/types'
import { partyPlace, type PartyRef } from '../documentaryFormat'

export interface PartyChoice {
  party: PartyRef
  /** The name, which is what is searched and what is read. */
  text: string
  /** «Institución · Badajoz, España». What tells two «Casa de Cultura» apart. */
  hint: string
  /** In the trash, and on offer only because this link already uses it. */
  retired: boolean
  /** Positions of the letters the search matched, for the emphasis. */
  indices: number[]
}

/**
 * The records on offer for a link, best match first.
 *
 * With no query the order is by name in es-ES — accents in their place, case
 * ignored — because the database's own collation sorts «Álvarez» past the z and
 * a chooser that hides the A's at the bottom is a chooser nobody finds anything
 * in.
 */
export function partyChoices(
  parties: readonly PartyRef[],
  query: string,
  selectedId: string | null = null,
): PartyChoice[] {
  const offered = parties.filter((party) => party.active || party.id === selectedId)
  const byName = offered
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }))
  return fuzzyRankBy(byName, (party) => party.name, query).map(({ item, indices }) => ({
    party: item,
    text: item.name,
    hint: [PARTY_TYPE_LABEL[item.party_type], partyPlace(item)].filter((bit) => bit).join(' · '),
    retired: !item.active,
    indices,
  }))
}

/**
 * What the chooser says when it offers nothing, which is never a blank list
 * (RF-304).
 *
 * Four different reasons, and three of them are NOT «there are none»: the
 * register may still be on its way, it may have failed to load, or the search may
 * simply not match. Printing «todavía no hay ninguna ficha» over any of those is
 * the screen asserting something about the catalogue that it does not know — and
 * it is the assertion that makes a cataloger create a second record for a museum
 * that already has one.
 */
export function noChoicesText(input: {
  loading: boolean
  error: string | null
  query: string
}): string {
  if (input.loading) return 'Cargando las fichas…'
  if (input.error !== null) {
    return (
      'No se han podido cargar las fichas de personas e instituciones, así que no se sabe cuáles ' +
      `hay. Escribe el eslabón a mano por ahora. (${input.error})`
    )
  }
  if (input.query.trim() !== '') return 'Ninguna ficha coincide con la búsqueda.'
  return 'Todavía no hay ninguna ficha de persona o institución.'
}

/** The record a link points at, out of the ones loaded. Null when it points at none. */
export function findParty(
  parties: readonly PartyRef[],
  partyId: string | null,
): PartyRef | null {
  if (partyId === null) return null
  return parties.find((party) => party.id === partyId) ?? null
}

/** A new record being created from the chooser, without leaving the link half written. */
export interface NewPartyDraft {
  name: string
  party_type: PartyRef['party_type']
  locality: string
  country: string
}

/** A blank one. Institution is not the default: see `newPartyProblem`. */
export function emptyNewParty(): NewPartyDraft {
  return { name: '', party_type: 'PERSON', locality: '', country: 'España' }
}

/**
 * What stops a new record from being created, or null.
 *
 * Only the name is demanded, and it is demanded because the database does
 * (`parties_name_not_blank`). The locality is NOT: it is what tells two
 * homonymous records apart and it is worth filling, but refusing a record over
 * it would stop a chain being written with the document in hand, which is when
 * these get written.
 *
 * `party_type` has no «Sin revisar» and needs no check, and that is deliberate in
 * the schema: when the record is opened it is already known whether a person or a
 * museum is being written, and how the provenance line reads depends on it.
 */
export function newPartyProblem(draft: NewPartyDraft): string | null {
  if (draft.name.trim() === '') return 'Escribe el nombre de la persona o de la institución.'
  return null
}

/** What travels to `parties`. Trimmed, because the database demands the name already is. */
export function newPartyPayload(draft: NewPartyDraft): Record<string, unknown> {
  return {
    name: draft.name.trim(),
    party_type: draft.party_type,
    locality: draft.locality.trim(),
    country: draft.country.trim(),
  }
}
