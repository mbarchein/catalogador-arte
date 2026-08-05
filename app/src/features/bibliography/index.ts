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
 * import { BibliographyPage, ReferencePage } from './features/bibliography'
 *
 * <Route path="/bibliography" element={<BibliographyPage />} />
 * <Route path="/bibliography/:id" element={<ReferencePage />} />
 * ```
 *
 * La lee cualquiera que pueda leer, como el listado de exposiciones: una referencia
 * es contenido del catálogo y no una lista de mantenimiento. Y **no tiene alta**: una
 * referencia existe porque algo la cita, así que se crea citándola desde una obra.
 *
 * La ficha (RF-506) trae lo que no existía en ningún sitio: **la referencia leída por
 * el otro lado**, con las obras que la citan y la página de cada cita. Se corrige con
 * el mismo panel que abre la ficha de una obra, no con una copia.
 *
 * Lo que sigue sin estar, y no se finge: retirar una referencia o recuperarla se hace
 * desde la papelera, y darla de alta desde la bibliografía de una obra. Las dos cosas
 * las dice la pantalla en vez de dejar buscar el botón.
 */

export { BibliographyPage } from './BibliographyPage'
export { ReferencePage } from './ReferencePage'
