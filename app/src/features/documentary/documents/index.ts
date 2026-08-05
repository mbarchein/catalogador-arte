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
 *   writable={writable}
 * />
 * ```
 *
 * `placeText` es opcional: sin él las filas no dicen nada de dónde está el
 * original en papel, que es preferible a adivinarlo o a pagar una consulta más.
 *
 * `writable` es el modo de RF-308 y por omisión es falso: el bloque se lee en la
 * ficha y solo se escribe en la zona de edición. Con él en verdadero —y con
 * permiso— el bloque ofrece las DOS acciones que el archivo tiene, que son dos y
 * no una: subir un documento nuevo, y enlazar con esta obra uno que ya está en el
 * archivo. Lo demás que necesita para eso —el archivo, los tipos de documento, las
 * series y los lugares— lo pide él solo, y solo cuando se abre uno de los dos
 * paneles: no hay ninguna prop nueva que cablear.
 */

export { DocumentsSection } from './DocumentsSection'
