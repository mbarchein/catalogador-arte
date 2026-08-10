/**
 * The archive: its listing with search and an document's record
 * (RF-309, RF-515, RF-516, RF-606, RF-609).
 *
 * The gap it closes, and it is the last of this kind: an archive document could be uploaded,
 * linked, downloaded, corrected and digitised, **all from the record of an
 * artwork that had it linked**. One that no artwork had linked was not reachable
 * from anywhere — the poster of a show that does not speak of a particular piece, or the
 * document whose link was withdrawn afterwards—. It is the same gap the bibliography had
 * and it is closed the same way.
 *
 * Two routes. They are mounted in `App.tsx`:
 *
 * ```tsx
 * import { ArchivePage, DocumentPage } from './features/archive'
 *
 * <Route path="/archive" element={<ArchivePage />} />
 * <Route path="/archive/:id" element={<DocumentPage />} />
 * ```
 *
 * `archive` in the route and not `documents`, for the same reason the bucket is called `obras`: what
 * is being named is the whole documentary holding and not a table, and the store's prefix
 * is already called `archivo`. The screen is titled «Archivo».
 *
 * They are read by anybody who can read, like the bibliography and the exhibitions: a
 * document is catalogue content and not a maintenance list.
 *
 * **A single write, and the absences are decisions.** Uploading a document and linking it
 * is done from an artwork's documentation, because that way it ends up uploaded and linked in one
 * go; correcting it and digitising it, from there too, where the warning says how many
 * records the change affects; withdrawing it and recovering it, from the wastebasket. The record says all three
 * things instead of letting the button be hunted for.
 *
 * The reasoned exception is **linking it to an exhibition**, and it is so because it cannot be
 * done anywhere else: an exhibition has no document block, so the
 * document's record is the only place where the paper and the show are together at once
 * (RF-516, RF-517). It carries its withdrawal, since a link that is created and not removed is a
 * trap.
 */

export { ArchivePage } from './ArchivePage'
export { DocumentPage } from './DocumentPage'
