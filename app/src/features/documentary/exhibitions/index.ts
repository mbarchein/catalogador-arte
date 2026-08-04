/**
 * El bloque «Historial expositivo» de la ficha de obra (RF-303, RF-501, RF-502).
 *
 * Se monta con la fila documental de la obra, que la ficha carga UNA vez para los
 * cinco bloques:
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
 * Una sola exportación, como en las otras cuatro áreas: el resto de la carpeta
 * —el orden, las frases, el selector de exposiciones— sigue alcanzable por su ruta
 * para quien tenga un motivo, los tests lo tienen, sin que parezca contrato.
 */

export { ExhibitionHistorySection } from './ExhibitionHistorySection'
