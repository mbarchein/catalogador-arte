# Esquema de campos — Inventario y Catálogo Razonado
## Alberto Rotili / María Ruiz Campins

**Versión 11** — revisado el 22 de julio de 2026, a partir de conversación de trabajo con Claude (Anthropic). Incorpora el campo `archivo_digitalizado` en la tabla "Archivo/Documentación", detectado durante el diseño de interfaz (ver `diseno_interfaz_y_arquitectura_v1.md` y ver historial de cambios).

Este esquema está diseñado para servir simultáneamente como base del inventario de trabajo, del catálogo online y del catálogo impreso (generación automática de fichas vía LaTeX). Base de datos **unificada** para el fondo de Alberto Rotili y el de María Ruiz Campins.

---

## Convención de numeración

Se adopta una numeración **neutra y secuencial por fondo**, sin categoría incluida en el propio código, para no forzar decisiones de clasificación en el momento de catalogar:

- `AR-0001`, `AR-0002`, `AR-0003`… — fondo Alberto Rotili
- `RC-0001`, `RC-0002`… — fondo María Ruiz Campins (firmaba como "Ruiz Campins")

El tipo de objeto (pintura, dibujo, escultura, collage, técnica mixta, etc.) se recoge aparte en el campo `tipo_obra` (ver más abajo), como lista abierta que se puede ampliar libremente sin afectar a la numeración ya asignada.

El código de catalogación (`id_catalogacion`) es a la vez la clave de la base de datos **y** la etiqueta física que se coloca en la obra y en su documentación asociada, sirviendo de eje para reordenar físicamente el estudio.

> **Nota de nomenclatura (v4):** el campo se denomina `id_catalogacion`, y no `id_catalogo`, precisamente para no confundirlo con el catálogo impreso de una exposición (que se gestiona en la tabla "Bibliografía"). El código en sí (`AR-0001`, `RC-0001`...) no cambia de formato, solo el nombre del campo que lo contiene.

---

## Listado de tablas

La base de datos se compone de **nueve tablas**. Se listan aquí en el orden en que se especifican más abajo, con su función y sus relaciones con el resto:

| # | Tabla | Función | Relación con otras tablas |
|---|---|---|---|
| 1 | **Obras** | Tabla principal. Una fila por cada pieza catalogada del fondo Rotili o Ruiz Campins | Referenciada desde todas las tablas relacionadas y puente |
| 2 | **Imágenes** | Documentación fotográfica técnica actual de cada obra (una fila por fotografía) | Relacionada con "Obras" (varias imágenes por obra) |
| 3 | **Series** | Series o ciclos temáticos del artista | Relacionada con "Obras" (una obra pertenece, como mucho, a una serie) |
| 4 | **Exposiciones** | Muestras en las que ha participado obra del artista | Relacionada con "Obras" vía tabla puente "Obra_Exposicion"; enlaza opcionalmente con "Bibliografía" (catálogo de la muestra) |
| 5 | **Obra_Exposicion** | Tabla puente: registra la participación concreta de una obra en una exposición | Une "Obras" y "Exposiciones" |
| 6 | **Bibliografía** | Referencias bibliográficas (libros, artículos, catálogos, prensa) | Relacionada con "Obras" vía tabla puente "Obra_Bibliografia"; referenciada desde "Exposiciones" |
| 7 | **Obra_Bibliografia** | Tabla puente: registra en qué páginas de qué referencia aparece cada obra | Une "Obras" y "Bibliografía" |
| 8 | **Propietarios/Instituciones** | Directorio de personas e instituciones con las que se ha contactado o que poseen obra | Relacionada con "Obras" vía el campo `propietarios_documentados` (relación múltiple, no tabla puente) |
| 9 | **Archivo/Documentación** | Materiales de archivo sobre el artista o sus exposiciones que no son obra en sí misma (fotos históricas, cartas, prensa, carteles...) | Relacionada opcionalmente con "Obras" y con "Exposiciones" |

---

## 1. Tabla principal: "Obras"

### Identificación

| Campo | Tipo | Notas |
|---|---|---|
| `id_catalogacion` | Texto | Clave primaria. Formato `AR-0001` / `RC-0001` (ver convención arriba). Antes `id_catalogo`; renombrado en v4 para evitar confusión con el catálogo impreso de una exposición |
| `artista` | Selección | Alberto Rotili / María Ruiz Campins — permite base unificada. **Sin opción "Sin revisar"**: es un dato que se decide obligatoriamente al dar de alta la ficha, ya que de él depende el propio `id_catalogacion` |
| `titulo` | Texto | Título de la obra. **Vacío si la obra no tiene título** (en la ficha se genera automáticamente "[Sin título]" entre corchetes, como referencia visual, no como dato guardado). Si el artista tituló realmente la obra como "Sin título", se escribe así, sin corchetes, en este campo. Ej.: obra sin ningún título → campo vacío; obra que el artista llamó literalmente *Sin título* → `titulo` = "Sin título" |
| `titulo_atribuido` | Selección | **Ampliado en v4** a cuatro valores para cubrir el caso de obra sin título y sin nombre de conveniencia todavía decidido: <br>• **No aplica (sin título)** — `titulo` vacío, nadie ha propuesto aún un nombre de conveniencia. <br>• **No** — el valor de `titulo` es un título auténtico del artista. <br>• **Sí** — el valor de `titulo` es un nombre de conveniencia atribuido por terceros (familia, comisario...). <br>• **Sin revisar** — `titulo` tiene ya un valor pero no se ha confirmado si es auténtico o atribuido. <br>Ej.: `titulo` = "Paisaje de invierno" puesto por el propio Rotili → No; `titulo` = "El jarrón azul" usado por la familia para una obra sin titular → Sí; obra sin título y sin nombre de conveniencia aún → No aplica (sin título) |
| `titulos_alt` | Texto (lista) | Otros nombres con los que se ha conocido o documentado la obra a lo largo del tiempo: títulos usados en exposiciones o catálogos anteriores, traducciones, apodos familiares. No indica autenticidad (para eso está `titulo_atribuido`); es simplemente un histórico de variantes. Ej.: obra titulada "Retrato de M." pero que en el catálogo de una exposición de 1985 apareció como "Retrato de mujer" → se añade "Retrato de mujer" a `titulos_alt` |
| `tipo_obra` | Selección abierta | Pintura, dibujo, escultura, collage, técnica mixta... Lista ampliable: se añade una opción nueva cuando aparece un objeto que no encaja en las existentes, sin renumerar nada |
| `agrupacion` | Texto libre / selección abierta | **Cambiado en v4** desde "Selección" cerrada: aún no se ha definido la taxonomía de agrupaciones (ej. "Obra sobre papel", "Obra tridimensional", "Obra sobre lienzo"). Se deja como texto libre hasta que, con volumen suficiente de obra catalogada, se pueda definir un cierre de opciones con criterio. Opcional; pensada para no coincidir 1:1 con `tipo_obra` |
| `fecha_ejecucion` | Texto | Fecha tal como se documenta o se quiere publicar. Formatos admitidos: exacta (1978), rango (1975-1978), aproximada (c. 1980), o rango aproximado (c. 1975-1978) |
| `fecha_orden` | Número | Campo auxiliar, no visible en la ficha publicada, que existe solo para poder ordenar y filtrar cronológicamente aunque `fecha_ejecucion` sea texto libre y ambiguo. Criterio de relleno: se toma el año de inicio del rango o el año aproximado. Ej.: "1978" → 1978; "1975-1978" → 1975; "c. 1980" → 1980; "c. 1975-1978" → 1975 |
| `tecnica` | Texto | Ej. "Óleo sobre lienzo" |
| `soporte` | Texto | Si se quiere separar de técnica (lienzo, tabla, papel...) |
| `alto_cm` | Número | Separado de ancho para cálculos y generación LaTeX |
| `ancho_cm` | Número | |
| `profundidad_cm` | Número | Si aplica (relieve, escultura) |
| `firmada` | Selección | Sí / No / Sin revisar — indica si la obra está firmada por el artista. "Sin revisar" cubre el caso de que aún no se ha inspeccionado ese dato, distinguiéndolo de "No" (se ha comprobado y no lleva firma) |
| `firma_descripcion` | Texto | Ubicación y forma de la firma (ej. "ángulo inferior derecho, a lápiz"). Solo aplica si `firmada` = Sí |
| `fechada_en_obra` | Selección | Sí / No / Sin revisar — indica si la propia obra lleva una fecha inscrita físicamente, independientemente de si se conoce o se estima la fecha de ejecución por otras vías (`fecha_ejecucion`) |

### Procedencia y localización

| Campo | Tipo | Notas |
|---|---|---|
| `procedencia` | Texto largo | **Fusión en v4** de los antiguos campos `propietario_actual` y `procedencia_historial` en uno solo, siguiendo el formato narrativo habitual en catálogos razonados. Convención acordada: <br>• Se redacta en **orden cronológico**, del primer propietario conocido al actual (el propietario actual es, simplemente, el último eslabón de la cadena). <br>• Rotili no figura como primer propietario, aunque normalmente lo fue. <br>• Se incluye el **año de adquisición** cuando se conozca. <br>• Dato desconocido o no confirmado → se anota con **`[?]`** junto al dato. <br>• Institución pública → se incluyen los créditos según corresponda. <br>• Coleccionista particular → "Colección privada, [país]". <br>• Ubicación actual no confirmada → "colección desconocida". <br>• Obra perdida o destruida → se indica como tal (ver también `estado_existencia`, campo estructurado equivalente para filtrado) |
| `titular_derechos` | Texto/Relación | Titular de los derechos de autor/reproducción — puede NO coincidir con el propietario actual (ej. obra en depósito en una institución, pero derechos reservados a la familia) |
| `estatus_legal` | Selección | Donación / Cesión / Depósito / Propiedad familia / Desconocido |
| `ubicacion_fisica` | Texto | Sala, almacén, dirección. **Convención de notación acordada:** siempre en minúsculas y sin tildes; niveles de la jerarquía de localización separados por comas, de mayor a menor (edificio → habitación/sala → mueble/estantería → balda → carpeta u otro nivel de detalle, según aplique). Ej.: "edificio a, habitacion amarilla, bloque 3" · "edificio b, habitacion 4, estanteria 3, balda 2, carpeta 1" |
| `ubicacion_definitiva` | Sí/No | Marca si la ubicación actual es ya la definitiva o aún provisional (útil durante el reordenamiento del estudio) |
| `nota_procedencia` | Texto largo | **Renombrado y cambiado de tipo en v5** (antes `fuente_informacion`, Selección). Campo de texto libre para anotar, según convenga en cada caso: la fuente o fuentes de las que procede la información de `procedencia` (ej. "inspección directa de la obra"; "dato facilitado por la familia, sin documentar"; "según catálogo de la exposición de 1985"), su grado de fiabilidad, o cualquier otra nota aclaratoria sobre la procedencia misma que no encaje de forma natural en el texto narrativo de `procedencia` |
| `estado_existencia` | Selección | Conservada / Destruida / Perdida (paradero desconocido) / Estado desconocido — las obras destruidas o perdidas se siguen catalogando con la información y documentación gráfica disponible, marcadas con este estatus. Es el campo **estructurado y filtrable** equivalente a la mención narrativa que también puede constar en `procedencia` |
| `propietarios_documentados` | Relación (múltiple) → tabla "Propietarios/Instituciones" | **Nuevo en v10.** Versión estructurada y filtrable de los propietarios/instituciones mencionados en `procedencia` (que sigue siendo el relato narrativo de referencia). Permite responder preguntas como "¿qué obras están vinculadas a esta institución o particular?" sin depender de búsqueda de texto libre. No sustituye a `procedencia`: no registra fechas de adquisición ni orden cronológico de la cadena, solo el vínculo en sí. Se recomienda añadir aquí cualquier propietario, institución o particular mencionado en `procedencia` que ya tenga (o vaya a tener) su propia ficha en "Propietarios/Instituciones" |

> **Campo eliminado en v4:** `localizada_actualmente`. Se detectó redundancia casi total con `estado_existencia`: si la obra está Destruida o Perdida, "¿está localizada?" ya queda respondido por ese mismo campo; si el estado es Desconocido, también. El único caso en que aportaba algo (obra Conservada pero sin ubicación actual confirmada) queda cubierto anotando "colección desconocida" directamente en `procedencia`.

### Estado del proceso de inventario

Campos independientes (no secuenciales), porque en la práctica se puede tener, por ejemplo, fotografía sin localización actual, o descripción sin fotografía:

| Campo | Tipo | Notas |
|---|---|---|
| `fotografiada` | Sí/No | Campo calculado automáticamente: se marca Sí en cuanto existe al menos una fila relacionada en la tabla "Imágenes" (tabla 2, ver más abajo) para este `id_catalogacion`. No requiere confirmación manual |
| `medidas_verificadas` | Sí/No | Campo **manual**, no automático: no basta con que `alto_cm`/`ancho_cm` tengan un valor (pudo venir de un catálogo antiguo o de un tercero, sin verificación física propia). Se marca Sí solo cuando alguien del equipo ha medido físicamente la obra |
| `ficha_catalografica_completa` | Sí/No | Confirmación editorial manual de que la ficha, en su conjunto, está lista para publicar. No es un cálculo automático de `fase_inventario_completada` + `fase_documentacion_completada`: aunque ambas fases estén cerradas, este campo exige una revisión final antes de dar la ficha por publicable |
| `fase_inventario_completada` | Sí/No | Marca si la fase 1 (toma de datos directa sobre la obra: medidas, técnica, soporte, firma, fotografía) se considera cerrada |
| `fase_documentacion_completada` | Sí/No | Marca si la fase 2 (investigación y documentación: procedencia, exposiciones, bibliografía, notas críticas) se considera cerrada |
| `notas_proceso_inventario` | Texto largo | **Nuevo en v4.** Notas operativas del equipo sobre el estado del proceso de catalogación de esta ficha (ej. "pendiente contactar con la familia para confirmar medidas"). No forma parte del contenido publicable del catálogo, a diferencia de `notas_criticas` |

**Convención general de campos pendientes vs. sin datos**, aplicable a todo el esquema, para no confundir "todavía no hemos llegado a este campo" con "ya lo hemos investigado y no hay nada que aportar":

- **Campos de selección**: incluyen por defecto la opción **"Sin revisar"** al crear la ficha, distinta de "Desconocido"/"No" — salvo excepciones justificadas como `artista` (ver nota en Identificación).
- **Campos de texto libre**: se dejan vacíos mientras estén pendientes. Si tras la investigación no hay dato que aportar, se escribe explícitamente **"N/D"** en vez de dejar el campo vacío, para que quede constancia de que sí se revisó.
- **Dato dudoso o sin confirmar** (distinto de pendiente): se anota con el signo **"[?]"** junto al dato en campos de texto libre (ej. "Colección particular, Madrid [?]"); en campos de selección ya existe la opción "Desconocido" para este caso.

**Reparto orientativo de campos por fase** (a título de guía, no como regla rígida):

- *Fase 1 — inventario directo* (con la obra físicamente delante): `tipo_obra`, `tecnica`, `soporte`, `alto_cm`/`ancho_cm`/`profundidad_cm`, `firmada`/`firma_descripcion`/`fechada_en_obra`, imágenes (tabla "Imágenes"), `estado_conservacion`/`tiene_marco`/`tipo_enmarcacion`, `ubicacion_fisica`.
- *Fase 2 — documentación e investigación* (sin necesidad de acceso directo a la obra): `titulo`/`titulo_atribuido`/`titulos_alt`, `procedencia`, exposiciones, bibliografía, `etapa`, `serie`, `obras_relacionadas`, `notas_criticas`, `titular_derechos`, `estatus_legal`.

### Conservación y enmarcación

Campos separados y de tipo selección (no solo texto libre) para poder filtrar y generar listados de trabajo, ej. "todos los cuadros que necesitan reenmarcación":

| Campo | Tipo | Notas |
|---|---|---|
| `estado_conservacion` | Selección | Bueno / Regular / Requiere restauración / Requiere restauración urgente |
| `descripcion_conservacion` | Texto largo | Detalle libre del estado (daños concretos, tipo de deterioro...) |
| `tiene_marco` | Sí/No | Solo aplica a obra que pueda ir enmarcada (pintura, obra sobre papel...) |
| `tipo_enmarcacion` | Texto | Descripción del marco actual (material, estilo, época, si es original de la obra o posterior) |
| `requiere_restauracion` | Sí/No | Filtrable independientemente de `estado_conservacion` |
| `requiere_reenmarcacion` | Sí/No | Filtrable independientemente del estado de conservación de la obra en sí |
| `notas_intervencion` | Texto largo | Recomendaciones, presupuestos recibidos, intervenciones ya realizadas y fecha |

### Documentación gráfica (enlace a tabla "Imágenes")

> Desde v4, la documentación fotográfica técnica de la obra ya no vive como campos de esta ficha, sino en la tabla independiente **"Imágenes"** (tabla 2, especificada más abajo), para poder representar correctamente varias fotos con fecha o autoría distintas. Ver especificación completa en esa sección.

| Campo | Tipo | Notas |
|---|---|---|
| `imagenes` | Relación → tabla "Imágenes" | Relación uno a muchos: cada obra puede tener ninguna, una o varias imágenes asociadas, cada una con su propia fecha, autoría y tipo de toma |

### Historial expositivo y bibliográfico

> Los datos de la combinación concreta obra+exposición y obra+referencia bibliográfica no viven en esta ficha, sino en las tablas puente "Obra_Exposicion" y "Obra_Bibliografia" (tablas 5 y 7, especificadas más abajo).

| Campo | Tipo | Notas |
|---|---|---|
| `exposiciones` | Relación → tabla "Obra_Exposicion" | Relación muchos a muchos con "Exposiciones", vía tabla puente. Permite obtener, para cada obra, sus exposiciones ordenadas cronológicamente (usando `fecha_inicio` de "Exposiciones"), tanto individuales como colectivas |
| `bibliografia` | Relación → tabla "Obra_Bibliografia" | Relación muchos a muchos con "Bibliografía", vía tabla puente |
| `documentacion_relacionada` | Relación → tabla "Archivo/Documentación" | Fotografías históricas o contextuales (el artista posando con la obra, la obra en una exposición, reproducida en catálogo o prensa), cartas donde se menciona la obra, etc. — se diferencia de la tabla "Imágenes", que es documentación fotográfica técnica actual generada por el equipo de catalogación |

### Clasificación

| Campo | Tipo | Notas |
|---|---|---|
| `etapa` | Texto libre / selección abierta | **Cambiado en v4** desde "Selección" cerrada: aún no se ha definido la periodización estilística de Rotili ni de Ruiz Campins. Se deja como texto libre hasta consolidar criterio con volumen suficiente de obra catalogada (ej. "Etapa figurativa temprana, 1958-1970"), y entonces migrar a selección cerrada si conviene |
| `serie` | Relación → tabla "Series" | **Cambiado en v4** desde "Texto/Relación" ambiguo a relación explícita con la tabla "Series" (tabla 3, especificada más abajo). Una obra pertenece normalmente a una serie, aunque el campo admite vacío si no pertenece a ninguna identificada |
| `obras_relacionadas` | Relación (múltiple, auto-referencial) → tabla "Obras" | **Tipo aclarado en v4.** Enlaza una obra con **otras obras que también están catalogadas** (tienen su propio `id_catalogacion`): estudios previos catalogados como pieza independiente, versiones de una misma composición, dípticos/parejas. No es un campo de texto libre. Distinción con "Archivo/Documentación": un boceto suelto sin entidad de obra catalogable, o un documento que solo menciona una relación entre obras, va en "Archivo/Documentación" (vía `obra_relacionada`), no aquí |
| `notas_criticas` | Texto largo | Espacio para la investigación crítica/interpretativa de la obra: análisis iconográfico, contexto histórico-artístico, comparación con otras piezas, hipótesis de datación. Es la materia prima del texto final de la ficha del catálogo razonado (contenido publicable, o casi). Se diferencia de `notas_proceso_inventario` (gestión operativa interna, no publicable), `descripcion_conservacion` (estado físico) y `procedencia` (cadena documental de propietarios) |

---

## 2. Tabla relacionada: "Imágenes"

> **Rediseño en v4.** En v3, `imagenes`, `fecha_fotografia` y `autor_fotografia` vivían como campos de la ficha de obra, con `imagenes` como adjunto múltiple pero `fecha_fotografia`/`autor_fotografia` únicos por ficha — lo que no permitía representar correctamente varias fotos con fecha o autoría distintas. Se sustituyó por esta tabla relacionada, siguiendo el mismo patrón que "Exposiciones" y "Bibliografía". **Separada como sección propia en v9** (antes anidada dentro de la ficha de "Obras").

| Campo | Tipo | Notas |
|---|---|---|
| `id_imagen` | Texto | Clave primaria |
| `id_catalogacion` | Relación → "Obras" | |
| `archivo` | Adjunto o enlace | Imágenes en alta resolución almacenadas fuera de la base (ej. Drive propio) con nomenclatura espejo; en la base solo versión ligera de consulta, subida directamente como adjunto mientras el volumen lo permita |
| `tipo_toma` | Selección abierta | General / Detalle-firma / Reverso / Detalle-daño... Nomenclatura recomendada de archivo: `AR-0001_v1_general.jpg`, `AR-0001_v2_detalle-firma.jpg`, `AR-0001_v3_reverso.jpg`… |
| `fecha_fotografia` | Fecha | Específica de esta imagen |
| `autor_fotografia` | Texto | Créditos de esta imagen concreta, relevante para derechos de imagen |
| `imagen_indice` | Sí/No | Marca si esta es la imagen que debe representar a la obra como icono/miniatura en el índice visual del catálogo (ver nota siguiente) |

**Nota sobre el índice visual del catálogo:** se prevé una vista de índice con un icono o imagen por obra junto a su `id_catalogacion`. Si una obra tiene una o más imágenes en esta tabla, se muestra la marcada con `imagen_indice` = Sí (regla de repliegue si ninguna está marcada: usar la más reciente de tipo `general`). Si la obra no tiene ninguna imagen todavía, el icono se sustituye por un marcador con el texto **"Imagen no disponible"** (o "Imagen no disponible actualmente" si se quiere remarcar el carácter provisional), en vez de dejar el hueco vacío sin explicación.

Esta tabla también resuelve de forma natural la gestión de altas/bajas/ediciones de fotos desde la futura aplicación web: cada imagen es una fila independiente, editable o eliminable sin afectar al resto de la ficha de la obra.

---

## 3. Tabla relacionada: "Series"

> **Nueva en v4**, como destino de la relación explícita del campo `serie` de "Obras". **Separada como sección propia en v9** (antes anidada dentro de la ficha de "Obras").

| Campo | Tipo | Notas |
|---|---|---|
| `id_serie` | Texto | Clave primaria |
| `artista` | Selección | Alberto Rotili / María Ruiz Campins |
| `nombre_serie` | Texto | |
| `descripcion` | Texto largo | |
| `fecha_inicio` | Texto o número | Rango de desarrollo de la serie |
| `fecha_fin` | Texto o número | |
| `notas_criticas_serie` | Texto largo | Comentario crítico sobre el ciclo o serie como conjunto (distinto de `notas_criticas` a nivel de cada obra individual) |

---

## 4. Tabla relacionada: "Exposiciones"

> **Ampliada en v4** con clave primaria propia (no existía en v3), tipo de exposición y enlace opcional al catálogo publicado como referencia bibliográfica.

| Campo | Tipo | Notas |
|---|---|---|
| `id_exposicion` | Texto | **Nuevo en v4.** Clave primaria. Propuesta de formato: `EXPO-0001` |
| `titulo_exposicion` | Texto | |
| `tipo_exposicion` | Selección | **Nuevo en v4.** Individual / Colectiva |
| `lugar` | Texto | |
| `institucion` | Texto | |
| `fecha_inicio` | Fecha | |
| `fecha_fin` | Fecha | |
| `catalogo_publicado` | Sí/No | Indica si la exposición generó catálogo propio |
| `referencia_catalogo` | Relación → "Bibliografía" | **Nuevo en v4.** Enlaza con la ficha bibliográfica completa del catálogo de la exposición, si se ha dado de alta. El catálogo de una exposición **no tiene tabla propia**: es una publicación como cualquier otra y se gestiona en "Bibliografía" (tabla 6) |
| `nota_exposicion` | Texto largo | **Nuevo en v6.** Cualquier nota aclaratoria sobre la exposición en sí (comisariado, contexto, circunstancias generales de la muestra...) que complemente al resto de campos de esta tabla. Distinto de `nota_obra_en_expo` en la tabla puente "Obra_Exposicion" (tabla 5), que recoge las circunstancias de una obra concreta dentro de esa exposición, no de la exposición como conjunto |

---

## 5. Tabla puente: "Obra_Exposicion"

Registra el **hecho** de que una obra concreta participó en una exposición concreta — independientemente de si esa exposición tuvo o no catálogo impreso. Une la tabla "Obras" (1) con la tabla "Exposiciones" (4).

| Campo | Tipo | Notas |
|---|---|---|
| `id` | (técnico, autogenerado) | Clave interna de la fila, sin significado catalográfico; no requiere que el equipo lo rellene a mano (lo gestiona la propia herramienta, ej. Airtable/Notion) |
| `id_catalogacion` | Relación → "Obras" | |
| `id_exposicion` | Relación → "Exposiciones" | |
| `nota_obra_en_expo` | Texto largo | **Fusión en v7** de los antiguos campos `numero_en_expo` y `notas_participacion` en uno solo, por simplicidad. Recoge tanto el número o referencia con que la obra apareció en el catálogo/cartelas de esa exposición concreta, si lo tuvo (ej. "12 bis", "s/n"), como cualquier otra circunstancia específica de esa participación (préstamo por un tercero distinto del propietario habitual, estado en el momento de la exposición, diferencias respecto a la ficha actual...) |

*(Campo `seccion` descartado tras revisión: no se consideró necesario.)*

---

## 6. Tabla relacionada: "Bibliografía"

| Campo | Tipo | Notas |
|---|---|---|
| `clave_bibtex` | Texto | Clave única para exportación directa a `.bib` |
| `autor` | Texto | Autor(es) del texto/artículo concreto citado |
| `editor` | Texto | **Nuevo en v4.** Editor/coordinador de la publicación, si aplica y es distinto del autor (frecuente en catálogos colectivos o volúmenes de estudios). Permite búsqueda específica por editor |
| `titulo` | Texto | |
| `tipo` | Selección | Libro / Artículo / Catálogo / Prensa |
| `año` | Número | |
| `editorial` | Texto | |

*(Campo `paginas_referencia` eliminado de esta tabla en v4: se traslada a la tabla puente "Obra_Bibliografia" (tabla 7), porque una misma referencia suele mencionar varias obras en páginas distintas.)*

---

## 7. Tabla puente: "Obra_Bibliografia"

Registra en qué página de qué referencia bibliográfica aparece mencionada o reproducida cada obra — incluyendo, cuando aplica, el catálogo de una exposición (enlazado desde `Exposiciones.referencia_catalogo`). Une la tabla "Obras" (1) con la tabla "Bibliografía" (6).

| Campo | Tipo | Notas |
|---|---|---|
| `id` | (técnico, autogenerado) | Clave interna de la fila |
| `id_catalogacion` | Relación → "Obras" | |
| `clave_bibtex` | Relación → "Bibliografía" | |
| `paginas` | Texto | Páginas concretas donde se menciona/reproduce esta obra en esta referencia |
| `notas` | Texto largo | Ej. "reproducida en color, p. 34"; "mencionada en pie de foto, sin reproducir" |

> **Nota v9:** en la revisión anterior se propuso fundir `paginas` y `notas` en un único campo `nota_obra_en_bibliografia`, análogamente a lo hecho en "Obra_Exposicion" (v7). Se ha decidido **no aplicar esta fusión**: a diferencia de `numero_en_expo` (un dato histórico puntual, de uso más ocasional), `paginas` es un dato con valor de uso recurrente — citar la página exacta en el ensayo del catálogo razonado o en la generación automática de referencias LaTeX/biblatex — por lo que conviene mantenerlo como campo aislado y estructurado. Ambos campos se mantienen, por tanto, separados.

---

## 8. Tabla relacionada: "Propietarios/Instituciones"

> **Conectada con "Obras" en v10** mediante el campo `propietarios_documentados` (ver especificación de "Obras", bloque "Procedencia y localización"). Antes de v10, esta tabla no tenía relación estructurada con el resto del esquema: solo era alcanzable narrativamente desde el texto de `procedencia`.

| Campo | Tipo | Notas |
|---|---|---|
| `nombre` | Texto | |
| `tipo` | Selección | Institución / Particular |
| `contacto` | Texto | |
| `estado_contacto` | Selección | Sin contactar / Contactado / Info recibida / Visita realizada / Verificada |
| `notas` | Texto largo | |

---

## 9. Tabla: "Archivo/Documentación"

Pensada con lógica archivística (no de catálogo de obra), para libros, publicaciones, fotografías, cartas, recortes de prensa y demás documentación sobre el artista que no es "obra" en sí misma. Incluye también materiales propios de una exposición (cartel, díptico, folleto...) cuando no documentan una obra concreta sino la muestra en su conjunto.

| Campo | Tipo | Notas |
|---|---|---|
| `id_documento` | Texto | Clave primaria propia, ej. `AR-ARCH-0001` |
| `artista` | Selección | Alberto Rotili / María Ruiz Campins |
| `tipo_documento` | Selección abierta | Libro, publicación, fotografía, carta, recorte de prensa, manuscrito, cartel, díptico, folleto, nota de prensa... |
| `titulo_descripcion` | Texto | Título o descripción breve |
| `fecha` | Texto | Exacta, rango o aproximada |
| `fondo_serie` | Texto | Agrupación archivística (fondo → serie → subserie, si aplica) |
| `digitalizado` | Sí/No | |
| `archivo_digitalizado` | Adjunto (imagen o PDF) | **Nuevo en v11.** Aloja el propio archivo digitalizado, dentro del almacenamiento gestionado por la aplicación (sin depender de un Drive externo), servido solo a usuarios autenticados según su rol. Distinto de `digitalizado` (Sí/No), que solo indica el estado sin contener el archivo en sí. Para documentos multipágina (cartas, recortes de prensa), se recomienda un único PDF con todas las páginas en vez de una fila por página |
| `ubicacion_fisica` | Texto | |
| `obra_relacionada` | Relación → tabla "Obras" | Opcional: cuando el documento se refiere a una pieza concreta |
| `exposicion_relacionada` | Relación → tabla "Exposiciones" | **Nuevo en v4.** Opcional: cuando el documento se refiere a la exposición en su conjunto (cartel, díptico...) y no a una obra concreta. Un mismo documento puede tener rellenos `obra_relacionada`, `exposicion_relacionada`, ambos, o ninguno |
| `notas` | Texto largo | |

---

## Notas de implementación

- Los campos numéricos de dimensiones (`alto_cm`, `ancho_cm`, `profundidad_cm`) deben mantenerse separados y limpios (sin unidades como texto) para facilitar tanto cálculos como la generación automática de fichas en LaTeX.
- El campo `fecha_orden` permite ordenar cronológicamente obras cuya fecha real es aproximada o un rango.
- La tabla "Bibliografía" está pensada para exportarse directamente a un archivo `.bib`, reutilizable tanto en el catálogo impreso (biblatex) como en la web. Con `autor`, `editor`, `titulo` y `año` como campos independientes, la búsqueda por cualquiera de ellos queda cubierta de forma nativa.
- Base **unificada** para Alberto Rotili y María Ruiz Campins mediante el campo `artista`, dado el volumen esperado (obra artística: hasta ~500 piezas por fondo, más documentación de archivo) y el solapamiento previsible de instituciones y coleccionistas.
- La tabla "Archivo/Documentación" es independiente de "Obras" para no forzar campos de ficha de obra (técnica, dimensiones...) sobre materiales que no son piezas artísticas.
- El proceso de inventario se concibe como el mismo proceso que permite reordenar físicamente el estudio: el `id_catalogacion`/`id_documento` es la etiqueta que se usa tanto en la base de datos como en la organización física.
- **Patrón de tablas puente:** cuando un dato depende de la combinación de dos entidades (obra+imagen, obra+exposición, obra+referencia bibliográfica) y no pertenece de forma natural a ninguna de las dos por separado, se modela como tabla relacionada independiente en vez de como campo de adjunto/relación múltiple con metadatos a nivel de ficha. Este criterio se ha aplicado a "Imágenes", "Obra_Exposicion" y "Obra_Bibliografia", y puede reutilizarse en el futuro si aparecen casos similares (por ejemplo, si `obras_relacionadas` necesitara en algún momento especificar el *tipo* de relación entre cada par de obras).
- **Campos de selección sin taxonomía cerrada aún** (`agrupacion`, `etapa`): se dejan deliberadamente como texto libre / selección abierta hasta que el volumen de obra catalogada permita definir un cierre de opciones con criterio real, evitando imponer categorías prematuras que luego haya que migrar.
- **Criterio de fusión de campos en tablas puente:** se funden dos campos en uno de texto libre cuando el dato es principalmente narrativo y de consulta ocasional (ej. `nota_obra_en_expo`); se mantienen separados cuando uno de los campos tiene valor como dato estructurado de uso recurrente, filtrable o citable de forma exacta (ej. `paginas` en "Obra_Bibliografia").

---

## Historial de cambios

- **v1** (informe inicial): esquema base con tablas Obras, Exposiciones, Bibliografía, Propietarios/Instituciones.
- **v2** (17/07/2026): numeración neutra sin categoría incluida; campo `tipo_obra` como lista abierta; estado de proceso desagregado en checklist independiente (no secuencial); campo `artista` para base unificada; campo `titular_derechos` separado de `propietario_actual`; nueva tabla "Archivo/Documentación"; campos `ubicacion_definitiva`, `fuente_informacion` y `estado_contacto`.
- **v2.1** (17/07/2026): notación de María Ruiz Campins cambiada de `MRC-` a `RC-` (firma habitual "Ruiz Campins"); nueva sección "Conservación y enmarcación" con campos filtrables, separando el antiguo campo único `estado_conservacion` en varios campos específicos.
- **v2.2** (18/07/2026): nuevo campo `titulo_atribuido` para distinguir título auténtico del artista frente a nombre de conveniencia asignado después; notas ampliadas con ejemplos.
- **v2.3** (18/07/2026): `fecha_ejecucion` ampliado para admitir rango aproximado; nota de `fecha_orden` ampliada con criterio de relleno.
- **v2.4** (18/07/2026): campo único `firma` sustituido por `firmada`, `firma_descripcion` y `fechada_en_obra`, con valor "Sin revisar".
- **v2.5** (18/07/2026): `ubicacion_fisica` con convención de notación acordada (minúsculas, sin tildes, niveles jerárquicos separados por comas).
- **v2.6** (18/07/2026): nuevo campo `estado_existencia`; nueva convención general "Sin revisar"/"N/D"/"[?]"; nuevos campos-resumen `fase_inventario_completada` y `fase_documentacion_completada`.
- **v2.7** (18/07/2026): `fotografiada` pasa a ser campo calculado; `medidas_verificadas` aclarado como manual; eliminado `descripcion_completa`; `ficha_catalografica_completa` aclarado como confirmación editorial manual; nomenclatura de `imagenes` ampliada; frontera aclarada entre `imagenes` y `documentacion_relacionada`.
- **v3** (18/07/2026): versión de cierre de ronda que consolida v2.1-v2.7, sin cambios de contenido adicionales.
- **v4** (20/07/2026): revisión completa tras discusión de campos. Cambios principales:
  - `id_catalogo` renombrado a **`id_catalogacion`** en todo el esquema, para no confundirlo con el catálogo impreso de una exposición.
  - `artista`: eliminada la opción "Sin revisar" (es un dato obligatorio al dar de alta la ficha).
  - `titulo_atribuido`: convertido de Sí/No a **selección de cuatro valores** (No aplica / No / Sí / Sin revisar), para cubrir el caso de obra sin título y sin nombre de conveniencia aún decidido.
  - `agrupacion` y `etapa`: cambiados de "Selección" cerrada a **texto libre / selección abierta**, por no tener aún taxonomía definida.
  - `propietario_actual` y `procedencia_historial` **fusionados** en un único campo `procedencia` (texto largo narrativo), con convención de redacción acordada (orden cronológico, año de adquisición, `[?]` para dudas, créditos institucionales, "Colección privada, [país]", "colección desconocida", Rotili nunca como primer propietario explícito).
  - Nuevo campo `notas_proceso_inventario` en el bloque "Estado del proceso de inventario", para anotaciones operativas del equipo (distinto de `notas_criticas`).
  - Eliminado el campo `localizada_actualmente`, redundante con `estado_existencia`.
  - **Documentación gráfica rediseñada**: `imagenes`/`fecha_fotografia`/`autor_fotografia` sustituidos por nueva tabla relacionada **"Imágenes"**, con metadatos por fotografía individual y campo `imagen_indice` para elegir la imagen representativa en el índice del catálogo; regla de repliegue automático y marcador "Imagen no disponible" cuando no hay ninguna.
  - **Tabla "Exposiciones" ampliada**: nueva clave primaria `id_exposicion`, nuevo campo `tipo_exposicion` (Individual/Colectiva), y `referencia_catalogo` para enlazar con la ficha bibliográfica del catálogo de la muestra (que se gestiona en "Bibliografía", no en una tabla propia).
  - Nueva **tabla puente "Obra_Exposicion"**, para registrar la participación de cada obra en cada exposición (`numero_en_expo`, `notas_participacion`).
  - **Tabla "Bibliografía"**: nuevo campo `editor`, separado de `autor`, para permitir búsqueda por editor/coordinador; campo `paginas_referencia` trasladado a la nueva tabla puente.
  - Nueva **tabla puente "Obra_Bibliografia"**, para registrar en qué páginas de qué referencia aparece cada obra.
  - **Tabla "Archivo/Documentación"**: nuevo campo `exposicion_relacionada`, para materiales que documentan una exposición en su conjunto (cartel, díptico, folleto) y no una obra concreta.
  - `serie`: cambiado de "Texto/Relación" ambiguo a **relación con nueva tabla "Series"** (con descripción, rango de fechas y notas críticas propias del ciclo).
  - `obras_relacionadas`: aclarado explícitamente como relación múltiple auto-referencial dentro de "Obras" (no texto libre), con distinción frente a "Archivo/Documentación".
  - `notas_criticas`: aclarada su naturaleza (interpretación académica publicable) frente a otros campos de texto largo del esquema (`notas_proceso_inventario`, `descripcion_conservacion`, `procedencia`).
- **v5** (21/07/2026): `fuente_informacion` renombrado a **`nota_procedencia`** y cambiado de Selección cerrada a **texto libre**. Se detectó que un único valor de selección no podía representar la fiabilidad de un bloque de datos con orígenes potencialmente distintos entre sí (ej. ubicación verificada por inspección directa, pero cadena de propietarios conocida solo por testimonio familiar). El campo queda acotado explícitamente a `procedencia` y su nota aclara que puede recoger tanto la fuente o fuentes de la información como cualquier otra aclaración sobre la procedencia misma. Se elimina la referencia cruzada desde `medidas_verificadas`, que ya no aplica al quedar el campo acotado a procedencia.
- **v6** (21/07/2026): nuevo campo `nota_exposicion` (Texto largo) en la tabla "Exposiciones", para notas aclaratorias sobre la exposición en sí (comisariado, contexto, incidencias generales) que complementen al resto de campos de esa tabla. Se distingue explícitamente de `notas_participacion` (tabla puente "Obra_Exposicion"), que recoge las circunstancias de una obra concreta dentro de la exposición, no de la muestra como conjunto.
- **v7** (21/07/2026): en la tabla puente "Obra_Exposicion", los campos `numero_en_expo` y `notas_participacion` se funden en uno solo, `nota_obra_en_expo` (Texto largo), por simplicidad. Recoge tanto el número/referencia histórico de la obra en esa exposición como cualquier otra circunstancia de su participación. Se pierde la posibilidad de buscar o filtrar por número de catálogo de exposición como campo aislado y estructurado, a cambio de un esquema más simple; se puede revisar si en el futuro resulta necesario ese tipo de búsqueda. Actualizada la referencia cruzada en `nota_exposicion` (tabla "Exposiciones") al nuevo nombre del campo.
- **v8** (21/07/2026, **revertida en v9**): se propuso fundir `paginas` y `notas` en "Obra_Bibliografia" en un único campo `nota_obra_en_bibliografia`. Tras valorar que `paginas` es un dato estructurado de uso recurrente (citas exactas en el ensayo del catálogo, generación automática de referencias), se decidió no aplicar esta fusión.
- **v9** (21/07/2026): versión de cierre de ronda. Cambios:
  - **Revertida** la fusión propuesta en v8 para "Obra_Bibliografia": `paginas` y `notas` se mantienen como campos separados (ver nota en la especificación de esa tabla).
  - **Reestructuración documental**: se añade un "Listado de tablas" previo a la especificación de campos, con las nueve tablas del esquema, su función y sus relaciones. Se numeran las tablas de forma correlativa (1 a 9) para facilitar referencias cruzadas entre secciones.
  - Las tablas **"Imágenes"** y **"Series"**, que hasta ahora vivían anidadas como sub-especificaciones dentro de la ficha de "Obras", pasan a ser secciones de nivel superior, separadas y delimitadas igual que el resto de tablas relacionadas y puente. La ficha de "Obras" mantiene únicamente el campo de relación que enlaza con cada una.
  - Añadida nota de criterio general en "Notas de implementación" sobre cuándo fundir campos en tablas puente (dato narrativo, uso ocasional) y cuándo mantenerlos separados (dato estructurado, uso recurrente o citable).
- **v10** (21/07/2026): nuevo campo `propietarios_documentados` (Relación múltiple → "Propietarios/Instituciones") en la ficha de "Obras", bloque "Procedencia y localización". Resuelve la desconexión detectada: desde v4, la tabla "Propietarios/Instituciones" no tenía ninguna relación estructurada con el resto del esquema, al haberse fusionado `propietario_actual` dentro del texto narrativo de `procedencia`. Se optó por un campo de relación simple en vez de una tabla puente (`Obra_Propietario`): cubre el caso de uso principal (filtrar obras por propietario/institución) sin añadir una tabla más ni duplicar la captura de fechas y orden cronológico, que sigue viviendo únicamente en `procedencia`. `procedencia` se mantiene como el relato de referencia; `propietarios_documentados` es su versión estructurada y filtrable, no un sustituto.
- **v11** (22/07/2026): nuevo campo `archivo_digitalizado` (Adjunto: imagen o PDF) en la tabla "Archivo/Documentación". Detectado durante la sesión de diseño de interfaz: el esquema solo registraba `digitalizado` (Sí/No) sin ningún campo que contuviera el archivo en sí. Se resuelve con el mismo criterio de almacenamiento acordado para la tabla "Imágenes" — archivo alojado dentro de la propia aplicación, sin depender de un Drive externo, servido solo a usuarios autenticados — y con la recomendación de un único PDF por documento multipágina en vez de una fila por página, evitando así replicar el patrón de tabla relacionada usado en "Imágenes" para un caso de volumen mucho menor.
