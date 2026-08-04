/**
 * El bloque «Documentación relacionada» de la ficha de obra (RF-515, RF-516).
 *
 * Se monta con la fila documental de la obra, que la ficha carga UNA vez para los
 * cinco bloques, y —si la ficha ya tiene el árbol de lugares cargado, que lo
 * tiene— con la función que resuelve dónde está el papel:
 *
 * ```tsx
 * const documentary = useArtworkDocumentary(artwork.catalog_id)
 * <DocumentsSection
 *   catalogId={artwork.catalog_id}
 *   documentary={documentary}
 *   placeText={(id) => placePathText(placeTree, id)}
 * />
 * ```
 *
 * `placeText` es opcional: sin él las filas no dicen nada de dónde está el
 * original en papel, que es preferible a adivinarlo o a pagar una consulta más.
 */

export { DocumentsSection } from './DocumentsSection'
