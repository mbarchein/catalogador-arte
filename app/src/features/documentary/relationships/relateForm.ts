/**
 * Relating this artwork to another one: which artwork, of what kind, and — the
 * part that matters — WHICH WAY ROUND (RF-212, RF-217, RF-517).
 *
 * A relationship is stored once and read from both ends, so registering one is
 * not «pick an artwork and a kind»: with an asymmetric kind the cataloger has to
 * say whether THIS artwork is the study or the finished work, and the two answers
 * are different rows. Getting it backwards publishes the study as the final
 * piece, and nothing downstream can detect it — both rows are perfectly valid.
 * So the question is asked in words, with both codes in the sentence, and the
 * mapping from the answer to the two columns lives here, verified.
 *
 * Everything in this module is pure. It answers either the exact arguments for
 * `relate_artworks` or the sentence explaining why not, and the component only
 * has to render one or call the other.
 *
 * **The database has the last word, on purpose.** The refusals predicted here —
 * the same artwork twice, a duplicate, the reverse of an asymmetric pair — are
 * all enforced next to the data with their own Spanish message. They are
 * anticipated so the cataloger reads them BEFORE pressing the button, not
 * instead of the check: the copy here works over the relationships this record
 * loaded, and another cataloger can write one in between.
 */

import { displayTitle } from '../../../lib/title'
import { fuzzyRankBy } from '../../../lib/vocabulary'
import type { ArtworkRelationshipType } from '../../../lib/types'
import type { ArtworkRef, RelationshipRow } from '../documentaryRows'
import { artworkByline, predicate, type RelatedArtworkRow } from './relatedArtworks'

/**
 * Which end of the relationship this artwork is on.
 *
 * Meaningless for a symmetric kind — «pareja de» reads the same from both sides
 * and the database canonicalises the row anyway — and decisive for an asymmetric
 * one, where it chooses between two different facts.
 */
export type RelationDirection = 'THIS_TO_OTHER' | 'OTHER_TO_THIS'

export interface DirectionOption {
  value: RelationDirection
  /** The fact, spelled out with both codes: «AR-0001 es estudio previo de AR-0002». */
  text: string
  /** What each record will end up showing, which is the consequence being chosen. */
  hint: string
}

/** Stands in for the other artwork while none has been picked yet. */
const NO_OTHER = 'la otra obra'

/**
 * The ways the chosen kind can be read, as sentences.
 *
 * One for a symmetric kind and two for an asymmetric one, and the difference is
 * not cosmetic: with two options this is a decision the cataloger takes, with one
 * it is an explanation of why she does not have to. The hint says what the OTHER
 * record will show, because that is the half she cannot see from here and the
 * half `inverse_name` exists for.
 */
export function directionOptions(
  type: Pick<ArtworkRelationshipType, 'name' | 'inverse_name' | 'is_symmetric'>,
  catalogId: string,
  otherCatalogId: string,
): DirectionOption[] {
  const other = otherCatalogId.trim() === '' ? NO_OTHER : otherCatalogId.trim()
  const verb = predicate(type.name)

  if (type.is_symmetric) {
    return [
      {
        value: 'THIS_TO_OTHER',
        text: `${catalogId} es ${verb} ${other}`,
        hint: 'Es simétrica: las dos fichas dicen lo mismo y se guarda una sola vez, así que da igual en qué orden se registre.',
      },
    ]
  }

  return [
    {
      value: 'THIS_TO_OTHER',
      text: `${catalogId} es ${verb} ${other}`,
      hint: `La ficha de ${other} mostrará «${type.inverse_name} ${catalogId}» sin registrar nada más.`,
    },
    {
      value: 'OTHER_TO_THIS',
      text: `${other} es ${verb} ${catalogId}`,
      hint: `Esta ficha mostrará «${type.inverse_name} ${other}».`,
    },
  ]
}

/**
 * The two ends as they go into the row.
 *
 * A symmetric kind always goes in as (this, other) and the database swaps them if
 * it has to: the smaller code lands in `from_catalog_id` so that «A pareja de B»
 * and «B pareja de A» are one row. Sending them the other way round is not wrong,
 * it is simply undone downstream.
 */
export function relationEnds(
  catalogId: string,
  otherCatalogId: string,
  direction: RelationDirection,
  type: Pick<ArtworkRelationshipType, 'is_symmetric'> | null,
): { from: string; to: string } {
  const other = otherCatalogId.trim()
  if (type !== null && !type.is_symmetric && direction === 'OTHER_TO_THIS') {
    return { from: other, to: catalogId }
  }
  return { from: catalogId, to: other }
}

/** What the form holds while it is being filled in. */
export interface RelateDraft {
  /** The artwork whose record is open. */
  catalogId: string
  /** The one picked from the catalogue, or '' while none is. */
  otherCatalogId: string
  type: ArtworkRelationshipType | null
  direction: RelationDirection
  note: string
}

/** The arguments of `relate_artworks`, named as the function declares them. */
export interface RelateArgs {
  p_from_catalog_id: string
  p_to_catalog_id: string
  p_relationship_type_id: string
  p_note: string
}

export type RelatePlan =
  /** What is missing or wrong, in Spanish, for the cataloger to read now. */
  | { ok: false; problem: string }
  | { ok: true; args: RelateArgs }

/**
 * Either the call that registers the relationship, or the sentence explaining why
 * it is not ready.
 *
 * `existing` is what this record loaded: the ACTIVE relationships of this
 * artwork, both ends included. Retired ones are deliberately not in it and must
 * not be blocked — `relate_artworks` finds the row in the trash and restores it
 * (RF-517), which is exactly what adding it again means, and refusing it here
 * would turn a working gesture into a dead end.
 */
export function planRelation(
  draft: RelateDraft,
  existing: readonly RelationshipRow[] = [],
): RelatePlan {
  const other = draft.otherCatalogId.trim()
  if (other === '') {
    return { ok: false, problem: 'Elige la obra con la que se relaciona.' }
  }
  // The database checks it too (`artwork_relationships_two_artworks`), and it is
  // said here because the honest answer to picking the artwork you are looking at
  // is a sentence, not a constraint name.
  if (other === draft.catalogId) {
    return {
      ok: false,
      problem: 'Una obra no puede relacionarse consigo misma. Elige otra obra del catálogo.',
    }
  }
  const type = draft.type
  if (type === null) {
    return { ok: false, problem: 'Elige el tipo de relación.' }
  }

  const { from, to } = relationEnds(draft.catalogId, other, draft.direction, type)
  const verb = predicate(type.name)

  const duplicate = existing.find(
    (row) =>
      row.relationship_type_id === type.id &&
      (type.is_symmetric
        ? // Symmetric: one fact, whichever order it was written in. The stored
          // row is canonicalised, so the pair is compared as a pair.
          (row.from_catalog_id === from && row.to_catalog_id === to) ||
          (row.from_catalog_id === to && row.to_catalog_id === from)
        : row.from_catalog_id === from && row.to_catalog_id === to),
  )
  if (duplicate) {
    return {
      ok: false,
      problem: type.is_symmetric
        ? `Ya consta que ${from} es ${verb} ${to}. No hace falta registrarlo otra vez.`
        : `Ya consta que ${from} es ${verb} ${to}. Si quieres cambiar la nota, edita la relación que ya está.`,
    }
  }

  // The contradiction the database rejects with its own message
  // (`tg_artwork_relationship_not_reversed`): if A is the study of B, B cannot be
  // the study of A. The record of the other artwork ALREADY reads the inverse
  // label out of the row that exists, which is what makes the second row
  // unnecessary as well as false.
  if (!type.is_symmetric) {
    const reversed = existing.find(
      (row) =>
        row.relationship_type_id === type.id &&
        row.from_catalog_id === to &&
        row.to_catalog_id === from,
    )
    if (reversed) {
      return {
        ok: false,
        problem:
          `Ya consta que ${to} es ${verb} ${from}, y lo contrario no puede ser cierto a la vez. ` +
          `La ficha de ${from} ya muestra «${type.inverse_name} ${to}». Si la relación estaba al ` +
          'revés, retira antes la que consta.',
      }
    }
  }

  return {
    ok: true,
    args: {
      p_from_catalog_id: from,
      p_to_catalog_id: to,
      p_relationship_type_id: type.id,
      // Trimmed, and empty is legitimate: most relationships have no
      // circumstance to record. `relate_artworks` reads an empty note as «do not
      // touch the one that is there», which is what an «Añadir» form arriving
      // blank has to mean.
      p_note: draft.note.trim(),
    },
  }
}

/** One artwork on offer in the picker. */
export interface ArtworkChoice {
  catalogId: string
  /** `[Sin título]` for an untitled one (RF-209), never a blank line. */
  title: string
  byline: string
  /**
   * The kinds already recorded with this artwork.
   *
   * Shown and NOT used to hide the option: two different kinds between the same
   * pair do coexist — the front and the back of a panel can also be part of the
   * same polyptych — so what is needed is that she sees what is already there,
   * not that the catalogue hides an artwork from her.
   */
  existing: string[]
}

/**
 * The artworks that can be picked, best match first.
 *
 * Searching goes over «code + title» together, with the subsequence matching the
 * rest of the application already uses: accent- and case-insensitive, letters
 * counted even apart, so «0042» finds AR-0042 and «retrat mujer» finds «Retrato
 * de mujer».
 *
 * This artwork is never on the list (a piece is not related to itself) and
 * neither are retired ones: relating to an artwork in the trash would build a
 * catalogue entry on top of a record nobody can read. With no query the first
 * few are offered anyway rather than an empty box — the panel says what the field
 * is for, and an empty list under a search field reads as «there is nothing».
 */
export function artworkChoices(
  catalog: readonly ArtworkRef[],
  query: string,
  catalogId: string,
  related: readonly RelatedArtworkRow[] = [],
  limit = 8,
): ArtworkChoice[] {
  const candidates = catalog.filter((row) => row.active && row.catalog_id !== catalogId)
  const ranked = fuzzyRankBy(
    candidates,
    (row) => `${row.catalog_id} ${displayTitle(row.title)}`,
    query,
  )
  return ranked.slice(0, limit).map(({ item }) => ({
    catalogId: item.catalog_id,
    title: displayTitle(item.title),
    byline: artworkByline(item),
    existing: related.filter((row) => row.catalogId === item.catalog_id).map((row) => row.label),
  }))
}

/**
 * What a picked artwork looks like once it is chosen, for the line that replaces
 * the search field. Null when nothing is picked, so the caller has one thing to
 * check instead of a code plus a lookup.
 */
export function chosenArtwork(
  catalog: readonly ArtworkRef[],
  catalogId: string,
): ArtworkChoice | null {
  const row = catalog.find((entry) => entry.catalog_id === catalogId)
  if (!row) return null
  return {
    catalogId: row.catalog_id,
    title: displayTitle(row.title),
    byline: artworkByline(row),
    existing: [],
  }
}
