/**
 * The bibliography's listing and its search (RF-506, RF-606, RF-609).
 *
 * The gap: a reference was created and corrected **only from an artwork that
 * cited it**, so a reference with no citations left was still in the
 * catalogue —taking up its BibTeX key— and could not be found from anywhere. The
 * artwork record declared it in its «what still cannot be done here» card.
 *
 * One route and no more. It is mounted in `App.tsx`:
 *
 * ```tsx
 * import { BibliographyPage, ReferencePage } from './features/bibliography'
 *
 * <Route path="/bibliography" element={<BibliographyPage />} />
 * <Route path="/bibliography/:id" element={<ReferencePage />} />
 * ```
 *
 * It is read by anybody who can read, like the exhibition listing: a reference
 * is catalogue content and not a maintenance list. And **it has no creation**: a
 * reference exists because something cites it, so it is created by citing it from an artwork.
 *
 * The record (RF-506) brings what did not exist anywhere: **the reference read from
 * the other side**, with the artworks that cite it and each citation's page. It is corrected with
 * the same panel an artwork's record opens, not with a copy.
 *
 * What is still missing, and is not pretended: withdrawing a reference or recovering it is done
 * from the wastebasket, and creating it from an artwork's bibliography. The screen says both
 * things instead of letting the button be hunted for.
 */

export { BibliographyPage } from './BibliographyPage'
export { ReferencePage } from './ReferencePage'
