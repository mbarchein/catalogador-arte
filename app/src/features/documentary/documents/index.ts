/**
 * The artwork record's «Documentación relacionada» block (RF-515, RF-516).
 *
 * It is mounted with the artwork's documentary row, which the record loads ONCE for the
 * five blocks, and —if the record already has the place tree loaded, which it
 * does— with the function that resolves where the paper is:
 *
 * ```tsx
 * const documentary = useArtworkDocumentary(artwork.catalog_id)
 * <DocumentsSection
 *   catalogId={artwork.catalog_id}
 *   documentary={documentary}
 *   placeText={(id) => placePathText(placeTree, id)}
 *   writable={writable}
 * />
 * ```
 *
 * `placeText` is optional: without it the rows say nothing about where the
 * paper original is, which is preferable to guessing it or to paying for one more query.
 *
 * `writable` is RF-308's mode and by default it is false: the block is read in the
 * record and only written in the editing area. With it true —and with
 * permission— the block offers the TWO actions the archive has, which are two and
 * not one: uploading a new document, and linking to this artwork one that is already in the
 * archive. Everything else it needs for that —the archive, the document types, the
 * series and the places— it asks for itself, and only when one of the two
 * panels is opened: there is no new prop to wire.
 */

export { DocumentsSection } from './DocumentsSection'
