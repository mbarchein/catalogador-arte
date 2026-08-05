/**
 * La ficha de una exposición y su índice (RF-309, RF-501, RF-502, RF-505, RF-606).
 *
 * El hueco que más estorbaba: desde la ficha de una obra ya se podía AFIRMAR que
 * estuvo en una muestra, pero la muestra no se podía crear —«dar de alta una
 * exposición nueva es otra pantalla», decía el propio código—. Esta es esa
 * pantalla.
 *
 * Tres rutas y ninguna más. Se montan en `App.tsx`:
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
 * El orden importa: `/exhibitions/new` va ANTES de `/exhibitions/:id`, o «new» se
 * lee como el identificador de una ficha y la pantalla contesta que esa exposición
 * no existe.
 *
 * `/exhibitions` lo lee cualquiera que pueda leer —una exposición es una ficha del
 * catálogo, no una lista de mantenimiento—, y crear y corregir son del Catalogador,
 * comprobado dentro de cada pantalla. La edición es una ruta y no un estado local,
 * por lo mismo que en la ficha de obra: sobrevive a una recarga, se comparte como
 * enlace y el botón «atrás» del móvil sale del formulario y no de la ficha.
 *
 * Cuatro exportaciones y el resto de la carpeta —el orden del índice, las frases,
 * el selector de sedes— sigue alcanzable por su ruta para quien tenga un motivo, y
 * los tests lo tienen, sin que parezca contrato.
 */

export { ExhibitionsPage } from './ExhibitionsPage'
export { NewExhibitionPage } from './NewExhibitionPage'
export { ExhibitionPage } from './ExhibitionPage'
