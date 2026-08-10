/**
 * Choosing the venue of an exhibition (RF-512): what is offered, what each option
 * says, and what is said instead of an empty list.
 *
 * The venue is CHOSEN and never typed, which is the whole reason
 * `exhibition_venues` exists: with the museum's name as free text, correcting it
 * means touching every exhibition it held. Its maintenance screen is «Tablas →
 * Sedes de exposición», and this module only reads that table.
 *
 * What the venue line says once chosen is NOT decided here: `exhibitionVenueLine`
 * already writes it for the artwork's record — venue, institution behind it when
 * saying it adds something, locality and country — and a second redaction of the
 * same line would mean the chooser and the record naming the same museum
 * differently. What is decided here is only what a CHOOSER needs: the ranking, the
 * two-line option, and the sentence for the empty case.
 *
 * Pure and free of React: the battery runs in node.
 */

import type { ExhibitionVenue } from '../../lib/types'
import { fuzzyRankBy } from '../../lib/vocabulary'

/** One option of the chooser. */
export interface VenueChoice {
  venue: ExhibitionVenue
  /** What the option shows, and what the search matches against. */
  text: string
  /** Where the typed letters landed in `text`, for the emphasis. */
  indices: number[]
}

/**
 * What one option reads as: `Museo de Bellas Artes de Badajoz · Badajoz, España`.
 *
 * One string for the label and the search key, and not a pretty label plus a
 * hidden key: a list whose rows match text they do not show looks arbitrary, and
 * the rule is already written down in `SearchableCheckList` and in the exhibition
 * chooser.
 *
 * The locality is in it because it is half the identity — the table is unique by
 * (name, locality) precisely because there is a «Casa de Cultura» in every town —
 * so a chooser that dropped it would show the same option twice with no way to
 * tell which is which. When it is missing the option says so, for the same reason
 * the venues screen does: a blank there reads as «this venue has no town», which
 * is never true.
 */
export function venueChoiceText(venue: ExhibitionVenue): string {
  const place = [venue.locality.trim(), venue.country.trim()].filter((part) => part !== '').join(', ')
  return `${venue.name.trim()} · ${place === '' ? 'sin localidad' : place}`
}

/**
 * The venues to offer, best match first.
 *
 * **Retired venues are dropped and not marked.** This is a list to CHOOSE from, and
 * offering one the catalogue has withdrawn would put it back into use through the
 * back door — the same rule, and the same wording, as the exhibition chooser of the
 * artwork's record. The venue already linked to an exhibition being corrected is a
 * different matter and is handled by `keptVenue`: it is not an offer, it is what the
 * record already says.
 */
export function rankVenues(
  venues: readonly ExhibitionVenue[],
  query: string,
): VenueChoice[] {
  const offered = venues.filter((venue) => venue.active)
  return fuzzyRankBy(offered, venueChoiceText, query).map(({ item, indices }) => ({
    venue: item,
    text: venueChoiceText(item),
    indices,
  }))
}

/**
 * The venue currently chosen, found among the loaded ones — including the retired
 * ones.
 *
 * It has to include them, and this is the case that would otherwise leave a hole
 * where a name used to be: a show whose venue was retired after it was recorded
 * still has that venue, and a chooser that could not find it would show «Sin
 * identificar» over a record that names a museum. The same reasoning
 * `usePhysicalPlaces` wrote down once: what is greyed out is shown and said, never
 * removed.
 *
 * Null both when nothing is chosen and when the chosen identifier is not in the
 * loaded list — which for a Lector is ordinary, since the venues query is a
 * Cataloger's screen. The caller falls back to what the exhibition row itself
 * embeds.
 */
export function keptVenue(
  venues: readonly ExhibitionVenue[],
  venueId: string,
): ExhibitionVenue | null {
  if (venueId.trim() === '') return null
  return venues.find((venue) => venue.id === venueId) ?? null
}

/**
 * What the chooser says instead of an empty list, which it never is (RF-304).
 *
 * Three cases, and confusing the first two costs an afternoon: the catalogue has no
 * venues at all, or it has them and none matches. The first one has to say where
 * a venue is created, because otherwise the cataloger holding a catalogue of the
 * Museo de Bellas Artes finds nothing and concludes the chooser is broken.
 *
 * And both have to say the thing that unblocks her right now: the venue is
 * OPTIONAL. «Una galería de Madrid» is a legitimate datum — it is what the press
 * cutting said — and typing it in «la sede consta así» is the correct answer, not a
 * workaround. Inventing a venue record to be able to save is how a catalogue ends
 * up with two Casas de Cultura.
 */
export function noVenuesText(total: number, query: string): string {
  if (total === 0) {
    return (
      'Todavía no hay ninguna sede registrada. Se dan de alta en «Tablas → Sedes de exposición», y no hace falta ninguna para guardar.'
    )
  }
  const typed = query.trim()
  const about = typed === '' ? '' : ` con «${typed}»`
  return (
    `Ninguna de las sedes registradas coincide${about}. Las sedes nuevas se dan de alta en «Tablas ` +
    '→ Sedes de exposición». Si no se sabe cuál fue, déjala sin identificar.'
  )
}

/**
 * What the closed chooser shows, which is never a gap (RF-304).
 *
 * «Sin identificar» and not an empty button: a control that says nothing looks
 * broken, and here the empty value is a legitimate and common choice rather than a
 * pending one.
 */
export function chosenVenueText(venue: ExhibitionVenue | null): string {
  return venue === null ? 'Sin identificar' : venueChoiceText(venue)
}
