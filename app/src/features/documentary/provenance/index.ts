/**
 * El bloque «Procedencia» de la ficha de obra (RF-303, RF-509, RF-510).
 *
 * Se monta con la fila documental de la obra, que la ficha carga UNA vez para los
 * cinco bloques, y con el año de ejecución, que es donde empieza una procedencia:
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
 * `originYear` es opcional y conviene pasarlo: sin él no se puede contar el tramo
 * que va del artista al primer eslabón documentado, y no se inventa nada en su
 * lugar. La versión que hace la consulta documental por su cuenta
 * (`StandaloneProvenanceSection`) es para una pantalla que solo muestre la cadena,
 * no para la ficha: cinco bloques pidiendo la misma fila serían cuatro consultas
 * de más.
 */

export { ProvenanceSection, StandaloneProvenanceSection } from './ProvenanceSection'
