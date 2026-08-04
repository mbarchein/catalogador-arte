/**
 * El bloque «Bibliografía» de la ficha de obra (RF-303, RF-504).
 *
 * Se monta con la fila documental de la obra, que la ficha carga UNA vez para
 * los cinco bloques:
 *
 * ```tsx
 * const documentary = useArtworkDocumentary(artwork.catalog_id)
 * <BibliographySection catalogId={artwork.catalog_id} documentary={documentary} />
 * ```
 */

export { BibliographySection } from './BibliographySection'
