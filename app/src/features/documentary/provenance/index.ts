/**
 * The artwork record's «Procedencia» block (RF-303, RF-509, RF-510).
 *
 * It is mounted with the artwork's documentary row, which the record loads ONCE for the
 * five blocks, and with the year of execution, which is where a provenance starts:
 *
 * ```tsx
 * const documentary = useArtworkDocumentary(artwork.catalog_id)
 * <ProvenanceSection
 *   catalogId={artwork.catalog_id}
 *   documentary={documentary.documentary}
 *   documentaryLoading={documentary.loading}
 *   documentaryError={documentary.error}
 *   setResearchStatus={documentary.setResearchStatus}
 *   originYear={artwork.start_year}
 * />
 * ```
 *
 * `originYear` is optional and it is worth passing: without it the stretch
 * from the artist to the first documented link cannot be told, and nothing is invented in
 * its place. The version that makes the documentary query on its own
 * (`StandaloneProvenanceSection`) is for a screen that only shows the chain,
 * not for the record: five blocks asking for the same row would be four queries
 * too many.
 */

export { ProvenanceSection, StandaloneProvenanceSection } from './ProvenanceSection'
