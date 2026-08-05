/**
 * El archivo: su listado con búsqueda y la ficha de un documento
 * (RF-309, RF-515, RF-516, RF-606, RF-609).
 *
 * El hueco que cierra, y es el último de esta clase: un documento del archivo se subía,
 * se enlazaba, se descargaba, se corregía y se digitalizaba, **todo desde la ficha de una
 * obra que lo tuviera enlazado**. A uno que ninguna obra tuviera enlazado no se llegaba
 * desde ningún sitio — el cartel de una muestra que no habla de una pieza concreta, o el
 * documento cuyo vínculo se retiró después—. Es el mismo hueco que tenía la bibliografía
 * y se cierra igual.
 *
 * Dos rutas. Se montan en `App.tsx`:
 *
 * ```tsx
 * import { ArchivePage, DocumentPage } from './features/archive'
 *
 * <Route path="/archive" element={<ArchivePage />} />
 * <Route path="/archive/:id" element={<DocumentPage />} />
 * ```
 *
 * `archive` en la ruta y no `documents`, por lo mismo que el bucket se llama `obras`: lo
 * que se nombra es el fondo documental entero y no una tabla, y el prefijo del almacén
 * ya se llama `archivo`. La pantalla se titula «Archivo».
 *
 * Las lee cualquiera que pueda leer, como la bibliografía y las exposiciones: un
 * documento es contenido del catálogo y no una lista de mantenimiento.
 *
 * **Una sola escritura, y las ausencias son decisiones.** Subir un documento y enlazarlo
 * se hace desde la documentación de una obra, porque así queda subido y enlazado de una
 * vez; corregirlo y digitalizarlo, desde ahí también, donde el aviso cuenta a cuántas
 * fichas afecta el cambio; retirarlo y recuperarlo, desde la papelera. Las tres cosas las
 * dice la ficha en vez de dejar buscar el botón.
 *
 * La excepción razonada es **enlazarlo con una exposición**, y lo es porque no se puede
 * hacer en ningún otro sitio: una exposición no tiene bloque de documentos, así que la
 * ficha del documento es el único sitio donde el papel y la muestra están a la vez
 * (RF-516, RF-517). Lleva su retirada, que un vínculo que se crea y no se quita es una
 * trampa.
 */

export { ArchivePage } from './ArchivePage'
export { DocumentPage } from './DocumentPage'
