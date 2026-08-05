/**
 * El listado de la bibliografía y su búsqueda (RF-506, RF-606, RF-609).
 *
 * El hueco: una referencia se creaba y se corregía **solo desde una obra que la
 * citara**, así que una referencia a la que no le quedaba ninguna cita seguía en el
 * catálogo —ocupando su clave BibTeX— y no se podía encontrar desde ningún sitio. La
 * ficha de obra lo declaraba en su tarjeta de «lo que aún no se puede hacer aquí».
 *
 * Una ruta y ninguna más. Se monta en `App.tsx`:
 *
 * ```tsx
 * import { BibliographyPage } from './features/bibliography'
 *
 * <Route path="/bibliography" element={<BibliographyPage />} />
 * ```
 *
 * La lee cualquiera que pueda leer, como el listado de exposiciones: una referencia
 * es contenido del catálogo y no una lista de mantenimiento. Y **no tiene alta**: una
 * referencia existe porque algo la cita, así que se crea citándola desde una obra.
 *
 * Lo que falta y no se finge: la ficha propia con su bloque «Obras citadas»
 * (RF-506, RF-309). Cuando exista, este listado es su puerta y las filas pasan a ser
 * enlaces; hasta entonces la fila no es pulsable a propósito.
 */

export { BibliographyPage } from './BibliographyPage'
