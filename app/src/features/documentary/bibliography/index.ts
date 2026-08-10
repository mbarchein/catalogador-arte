/**
 * The artwork record's «Bibliografía» block (RF-303, RF-504).
 *
 * It is mounted with the artwork's documentary row, which the record loads ONCE for
 * the five blocks:
 *
 * ```tsx
 * const documentary = useArtworkDocumentary(artwork.catalog_id)
 * <BibliographySection catalogId={artwork.catalog_id} documentary={documentary} />
 * ```
 */

export { BibliographySection } from './BibliographySection'
