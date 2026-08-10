/**
 * An exhibition's record and its index (RF-309, RF-501, RF-502, RF-505, RF-606).
 *
 * The gap that got in the way most: from an artwork's record one could already STATE that
 * it was in a show, but the show could not be created —«creating a new
 * exhibition is another screen», the code itself said—. This is that
 * screen.
 *
 * Three routes and no more. They are mounted in `App.tsx`:
 *
 * ```tsx
 * import { ExhibitionsPage, NewExhibitionPage, ExhibitionPage } from './features/exhibitions'
 *
 * <Route path="/exhibitions" element={<ExhibitionsPage />} />
 * <Route path="/exhibitions/new" element={<NewExhibitionPage />} />
 * <Route path="/exhibitions/:id" element={<ExhibitionPage />} />
 * <Route path="/exhibitions/:id/edit" element={<ExhibitionPage />} />
 * ```
 *
 * The order matters: `/exhibitions/new` goes BEFORE `/exhibitions/:id`, or «new» is
 * read as a record's identifier and the screen answers that that exhibition
 * does not exist.
 *
 * `/exhibitions` is read by anybody who can read —an exhibition is a record of the
 * catalogue, not a maintenance list—, and creating and correcting belong to the Cataloguer,
 * checked inside each screen. Editing is a route and not local state,
 * for the same reason as in the artwork record: it survives a reload, it is shared as a
 * link and the phone's «back» button leaves the form and not the record.
 *
 * Four exports and the rest of the folder —the index's order, the sentences,
 * the venue selector— is still reachable by its path for whoever has a reason, and
 * the tests do, without looking like a contract.
 */

export { ExhibitionsPage } from './ExhibitionsPage'
export { NewExhibitionPage } from './NewExhibitionPage'
export { ExhibitionPage } from './ExhibitionPage'
