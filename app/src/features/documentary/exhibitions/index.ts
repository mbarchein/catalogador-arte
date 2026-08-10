/**
 * The artwork record's «Historial expositivo» block (RF-303, RF-501, RF-502).
 *
 * It is mounted with the artwork's documentary row, which the record loads ONCE for the
 * five blocks:
 *
 * ```tsx
 * const documentary = useArtworkDocumentary(artwork.catalog_id)
 * <ExhibitionHistorySection
 *   catalogId={artwork.catalog_id}
 *   documentary={documentary.documentary}
 *   documentaryLoading={documentary.loading}
 *   documentaryError={documentary.error}
 *   setResearchStatus={documentary.setResearchStatus}
 * />
 * ```
 *
 * A single export, as in the other four areas: the rest of the folder
 * —the order, the sentences, the exhibition selector— is still reachable by its path
 * for whoever has a reason, the tests do, without looking like a contract.
 */

export { ExhibitionHistorySection } from './ExhibitionHistorySection'
