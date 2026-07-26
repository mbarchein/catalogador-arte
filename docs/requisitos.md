# Especificación de requisitos

Aplicación web de inventario y catalogación razonada — fondos de Alberto Rotili y María Ruiz Campins.

Este documento consolida en forma de requisitos verificables las decisiones dispersas en los dos
documentos de trabajo originales. Cada requisito tiene un identificador estable que los tests citan
para dejar constancia de qué está verificado y qué no.

---

## 1. Propósito y alcance

Una única base de datos que sirve simultáneamente como inventario de trabajo (toma de datos con la
obra físicamente delante y reordenación física del estudio) y como catálogo razonado (investigación
documental, procedencia, historial expositivo y bibliográfico), y que actúa como fuente única de
verdad para dos productos derivados que hoy están aparcados: el catálogo online y el catálogo impreso.

El alcance de esta especificación es **la aplicación de inventario y catalogación**. Los dos productos
derivados quedan fuera (ver apartado 8).

## 2. Documentos de referencia

| Documento | Qué define | Carácter |
|---|---|---|
| [`originales/esquema_campos_inventario_v11.md`](originales/esquema_campos_inventario_v11.md) | Qué datos se guardan: nueve tablas, campos, tipos y convenciones de captura | **Normativo** para el modelo de datos |
| [`originales/diseno_interfaz_y_arquitectura_v4.md`](originales/diseno_interfaz_y_arquitectura_v4.md) | Cómo se construye y se usa la aplicación: stack, roles, páginas, comportamiento | **Normativo** para arquitectura y comportamiento |
| [`decisiones/`](decisiones/) | Decisiones de arquitectura posteriores a los documentos fuente, con su razonamiento y sus consecuencias | **Normativo**, y prevalece sobre los originales |
| [`disenos/`](disenos/) | Maquetas de interfaz | Indicativo |
| [`revision/incidencias-detectadas.md`](revision/incidencias-detectadas.md) | Contradicciones y huecos detectados en los anteriores | Registro de trabajo |

Los documentos originales fijaban Django sobre la máquina del equipo.
[ADR-001](decisiones/ADR-001-stack-y-despliegue.md) sustituye esa decisión por una PWA estática sobre
Supabase, y [ADR-002](decisiones/ADR-002-almacenamiento-de-imagenes.md) define el almacenamiento de
imágenes. Donde los originales y los ADR discrepen, mandan los ADR.

Ante discrepancia entre una maqueta y el esquema de campos, manda el esquema.

## 3. Actores

| Actor | Descripción |
|---|---|
| **Superusuario** | Quien mantiene la aplicación. Acceso técnico total, incluida la gestión de usuarios y permisos. |
| **Catalogador** | Quien introduce y edita el contenido del catálogo. Todos los catalogadores comparten permisos idénticos entre sí. |
| **Lector** | Quien consulta el catálogo sin modificarlo. |

No existe actor anónimo: la aplicación no tiene ninguna zona pública.

## 4. Glosario

- **Fondo** — conjunto de la obra de uno de los dos artistas. Determina el prefijo del identificador.
- **Ficha** — registro completo de una entidad (obra, exposición, referencia, documento...).
- **Fase 1** — inventario directo: datos que exigen tener la obra delante.
- **Fase 2** — documentación e investigación: datos que no exigen acceso físico a la obra.
- **Baja lógica** — retirada de una ficha de la circulación conservando la fila en la base de datos.
- **Tabla puente** — tabla que modela un dato que depende de la combinación de dos entidades y no
  pertenece de forma natural a ninguna de las dos por separado.

---

## 5. Requisitos funcionales

### RF-100 · Autenticación, roles y permisos

| Id | Requisito |
|---|---|
| RF-101 | Ninguna vista es accesible sin sesión autenticada. No existe acceso anónimo a páginas ni a ficheros. |
| RF-102 | La aplicación distingue tres roles: Superusuario, Catalogador y Lector. |
| RF-103 | El Catalogador puede dar de alta, editar y dar de baja fichas en las nueve tablas. Todos los catalogadores comparten los mismos permisos: cualquiera puede editar o dar de baja una ficha creada por otro. |
| RF-104 | El Catalogador no tiene acceso a la gestión de usuarios ni a la configuración de permisos de grupo. |
| RF-105 | El Lector tiene acceso de solo lectura a las nueve tablas, sin restricción por campo — incluido `contacto` de Propietarios/Instituciones. |
| RF-106 | Al Lector no se le muestra ningún control de escritura: ni «Editar», ni «+ Nueva…», ni acceso a la papelera. |
| RF-107 | El Superusuario dispone de todos los permisos de contenido sin necesidad de pertenecer al grupo Catalogador. |
| RF-108 | La asignación de rol a un usuario es competencia exclusiva del Superusuario. Un Catalogador no puede cambiar su propio rol ni el de nadie: la política RLS de la tabla de perfiles debe impedirlo explícitamente. |
| RF-109 | El rol de cada usuario se almacena en una tabla de perfiles vinculada a Supabase Auth, y se aplica mediante **políticas RLS** en PostgreSQL. Cada tabla del esquema tiene política propia para cada operación (`select`, `insert`, `update`, `delete`). |
| RF-110 | Los ficheros no son accesibles por URL pública: el acceso se concede mediante URL firmada de caducidad corta, emitida solo a una sesión válida con el rol adecuado. |
| RF-111 | **No existe ningún camino a los datos que no atraviese RLS.** Al no haber servidor propio, las políticas son el único perímetro de seguridad: una tabla sin política de una operación se considera abierta, no cerrada. La clave `service_role`, que ignora las políticas, no aparece nunca en el cliente ni en el repositorio. |
| RF-112 | No hay registro abierto de usuarios: las cuentas las crea el Superusuario. La aplicación no tiene zona pública ni formulario de alta. |
| RF-113 | Los privilegios de tabla se **revocan primero y se conceden después**, uno a uno. La plataforma concede por omisión todos los privilegios de cada tabla nueva a los roles anónimo y autenticado, de modo que sin revocar explícitamente las políticas RLS quedan como única barrera. Con la revocación, exponer o destruir datos exige dos errores en vez de uno. |

### RF-200 · Modelo de datos y convenciones de captura

| Id | Requisito |
|---|---|
| RF-201 | El modelo consta de nueve tablas: Obras, Imágenes, Series, Exposiciones, Obra_Exposicion, Bibliografía, Obra_Bibliografia, Propietarios/Instituciones y Archivo/Documentación. |
| RF-202 | `id_catalogacion` es la clave primaria de Obras, con formato `AR-nnnn` (Rotili) y `RC-nnnn` (Ruiz Campins), secuencial por fondo y sin categoría de obra incorporada al código. |
| RF-203 | `artista` es obligatorio al dar de alta una obra y no admite «Sin revisar», porque de él depende el prefijo del identificador. |
| RF-204 | Las claves primarias no son editables una vez creada la ficha, tampoco en modo edición: se presentan de solo lectura en el formulario. Afecta a `id_catalogacion`, `id_exposicion`, `clave_bibtex`, `id_documento`, `id_serie` e `id_imagen`. |
| RF-205 | Los campos de selección ofrecen «Sin revisar» como valor inicial, distinto de «Desconocido» y de «No», salvo las excepciones justificadas en el esquema. |
| RF-206 | Los campos de texto libre quedan vacíos mientras el dato esté pendiente. Si tras la investigación no hay dato que aportar, se consigna `N/D`. |
| RF-207 | **Revisado por [ADR-004](decisiones/ADR-004-fecha-estructurada.md).** La fecha vive en campos estructurados (`anio_inicio`, `anio_fin`, `fecha_aproximada`, `fecha_sin_confirmar`, `fecha_nota`); `fecha_ejecucion` es una **columna generada** que compone el texto publicable y no se escribe nunca. La fecha tecleada a mano se analiza hacia la estructura; solo lo imparseable queda como nota, rescatando el año para búsqueda. `fecha_orden` ya no existe. |
| RF-208 | Las dimensiones se almacenan como números sin unidades, en campos separados (`alto_cm`, `ancho_cm`, `profundidad_cm`). |
| RF-209 | `titulo` vacío significa obra sin título. La interfaz muestra «[Sin título]» entre corchetes como referencia visual, sin guardar ese texto como dato. Una obra que el artista tituló literalmente *Sin título* lleva ese valor en el campo, sin corchetes. |
| RF-210 | `fotografiada` es un campo calculado: vale Sí cuando existe al menos una imagen **activa** asociada a la obra. No admite confirmación manual. |
| RF-211 | `medidas_verificadas` y `ficha_catalografica_completa` son manuales y no se derivan del estado de otros campos. |
| RF-212 | `obras_relacionadas` es una relación múltiple autorreferencial dentro de Obras, no un campo de texto. |
| RF-213 | `agrupacion` y `etapa` se implementan como texto libre mientras no exista taxonomía cerrada, sin selección de opciones predefinidas. |
| RF-214 | Un dato dudoso o sin confirmar se marca con `[?]` junto al dato en campos de texto libre; en campos de selección se usa la opción «Desconocido». |

### RF-300 · Ficha de obra

| Id | Requisito |
|---|---|
| RF-301 | La ficha de obra se estructura en cabecera, aviso de bloqueo, columna de imágenes y bloques de contenido apilados. |
| RF-302 | La cabecera muestra `id_catalogacion` y `titulo` en una línea, `artista` y `fecha_ejecucion` como subtítulo, los badges de estado (fase 1, fase 2, publicabilidad) y los botones «Volver al listado», «Imprimir ficha» y «Editar». |
| RF-303 | Los bloques de contenido son: Identificación, Procedencia y localización, Conservación y enmarcación, Historial expositivo, Bibliografía, Documentación relacionada, Clasificación y Estado del proceso. Todo campo del esquema tiene asignado exactamente un bloque. |
| RF-304 | Un bloque sin datos se muestra con un texto explícito («Sin referencias registradas» o equivalente), nunca como hueco vacío sin explicación. |
| RF-305 | Los datos que son relación (serie, propietarios, referencias bibliográficas, exposiciones, obras relacionadas) se muestran como enlace a su propia ficha. |
| RF-306 | Un `estado_existencia` distinto de «Conservada» se destaca en la cabecera, junto a los badges de fase, y no solo dentro del bloque de procedencia. |
| RF-307 | `titulo_atribuido` tiene representación visual en la cabecera cuando el título no es auténtico del artista, de modo que la distinción sea perceptible sin abrir el formulario de edición. |
| RF-308 | Al pulsar «Editar», toda la ficha entra en modo edición a la vez, cabecera incluida. No hay edición parcial por bloques. |
| RF-309 | Las fichas de Exposición, Bibliografía, Documento, Serie y Propietario siguen el mismo patrón (cabecera, aviso de bloqueo, botones, bloques apilados), más cortas y sin galería de imágenes técnicas. |
| RF-310 | La ficha de Documento muestra un único recuadro para `archivo_digitalizado`, con icono según tipo de archivo y botón «Descargar». El bloque «Relacionado con» solo aparece si hay obra o exposición vinculada. |

### RF-400 · Imágenes y archivos adjuntos

| Id | Requisito |
|---|---|
| RF-401 | Una obra puede tener cero, una o varias imágenes, cada una con su propio `tipo_toma`, `fecha_fotografia` y `autor_fotografia`. |
| RF-402 | `imagen_indice` marca la imagen representativa de la obra. Como máximo una imagen activa por obra puede tenerlo marcado: marcar una desmarca automáticamente la anterior. |
| RF-403 | Si ninguna imagen de la obra está marcada como índice, se aplica la regla de repliegue: la más reciente de tipo «general». |
| RF-404 | Si la obra no tiene ninguna imagen, en su lugar se muestra el marcador «Imagen no disponible», nunca un hueco vacío. |
| RF-405 | En modo edición, el recuadro grande de la imagen índice permite elegir cuál de las imágenes ya subidas se usa como representativa. No es un punto de subida. |
| RF-406 | El recuadro «+» es el único punto de subida de una imagen nueva: abre selector de archivo (clic o arrastrar y soltar) junto con los campos obligatorios de esa fotografía, y crea una fila nueva en Imágenes. |
| RF-407 | Cada miniatura existente ofrece, al pasar el cursor o al tocar, editar sus metadatos y eliminarla. |
| RF-408 | `archivo_digitalizado` de Archivo/Documentación sigue el mismo patrón de subida, sin elección de índice: una fila es un archivo. Para documentos multipágina se usa un único PDF con todas las páginas, no una fila por página. |
| RF-409 | Cada toma se almacena en **tres niveles**: miniatura (~30 KB) para el índice en mosaico, derivada de consulta (~300 KB) para la ficha, y máster de archivo con el original íntegro. Los tres son derivaciones del mismo `id_imagen`, no tres filas distintas. |
| RF-410 | Las derivadas y la miniatura **se generan en el navegador antes de subir**, no en el servidor. Una fotografía de móvil ronda los 4-12 MB y subirla íntegra tres veces desde un almacén con mala cobertura no es viable. |
| RF-411 | La aplicación no muestra nunca un máster en una vista: la ficha ofrece «Descargar máster» con URL firmada por la función Edge, también para el Lector — enviar el original a una imprenta o un comisario es exactamente su caso de uso. La subida exige poder editar. |
| RF-412 | Todo acceso a imágenes pasa por una única función del frontend que resuelve la URL de cada nivel, de modo que cambiar de proveedor de almacenamiento sea un cambio en un solo lugar. |
| RF-413 | El campo `archivo_digitalizado` de Archivo/Documentación sigue el mismo esquema de tres niveles, con la miniatura correspondiente a la primera página del documento. |

### RF-500 · Exposiciones, bibliografía y tablas puente

| Id | Requisito |
|---|---|
| RF-501 | La participación de una obra en una exposición se registra en la tabla puente Obra_Exposicion, con `nota_obra_en_expo` para el número histórico en catálogo y las circunstancias de esa participación concreta. |
| RF-502 | El historial expositivo se presenta en orden cronológico ascendente con el formato `[año], [fecha_inicio–fecha_fin], [titulo_exposicion en cursiva], [institucion], [lugar]`, idéntico en la ficha de obra y en el listado de exposiciones. |
| RF-503 | El catálogo de una exposición no tiene tabla propia: se da de alta en Bibliografía y se enlaza desde `referencia_catalogo` de la exposición. |
| RF-504 | La cita de una obra en una referencia se registra en Obra_Bibliografia, manteniendo `paginas` como campo estructurado independiente de `notas`, por ser dato citable de forma exacta. |
| RF-505 | La ficha de exposición incluye un bloque «Obras participantes» con miniatura, `id_catalogacion` enlazado y `nota_obra_en_expo` de cada fila. |
| RF-506 | La ficha bibliográfica incluye un bloque «Obras citadas» con `id_catalogacion` enlazado y `paginas`/`notas`, sin miniatura. |
| RF-507 | La tabla Bibliografía debe poder exportarse a un archivo `.bib` reutilizable por biblatex, con `clave_bibtex`, `autor`, `editor`, `titulo` y `año` como campos independientes. |

### RF-600 · Índices y búsqueda

| Id | Requisito |
|---|---|
| RF-601 | Obras dispone de dos índices: índice de identificadores e índice visual en mosaico de imágenes. |
| RF-602 | La búsqueda de obras ofrece filtros combinables entre sí, no un campo por botón. Filtros principales, siempre visibles: texto libre (sobre `id_catalogacion`, `titulo` y `titulos_alt`), `artista`, rango de fechas (solapamiento sobre `anio_inicio`/`anio_fin`), `serie` y `tipo_obra`. |
| RF-603 | Filtros avanzados, colapsados por defecto: `tecnica`, `estado_existencia`, `fase_inventario_completada`, `fase_documentacion_completada` y rango mínimo-máximo de medidas. |
| RF-604 | Las columnas de resultados son: `id_catalogacion` (único enlace a la ficha), miniatura, `titulo`, `artista` y `fecha_ejecucion`, con contador «mostrando X–Y de Z resultados» y paginación. |
| RF-605 | Una búsqueda sin resultados devuelve la misma página de búsqueda con el mensaje «No se han encontrado obras con estos criterios» en lugar de la tabla. Nunca una página en blanco. |
| RF-606 | Tienen búsqueda dedicada Obras, Exposiciones, Bibliografía y Documentación. Series y Propietarios/Instituciones no la necesitan por bajo volumen: basta el listado simple. |
| RF-607 | El filtrado de obras por serie o por propietario no duplica la lógica de búsqueda: desde la ficha de la serie o del propietario, un enlace abre el índice de obras ya filtrado, reutilizando listado y columnas. |
| RF-608 | «Volver al listado» conserva los filtros aplicados y la página de origen. |
| RF-609 | Los índices y las búsquedas excluyen las fichas dadas de baja. |

### RF-700 · Bloqueo de edición

| Id | Requisito |
|---|---|
| RF-701 | Una ficha solo puede estar en edición por un catalogador a la vez. |
| RF-702 | El bloqueo se activa al pulsar «Editar», no al abrir la ficha en modo consulta. |
| RF-703 | El bloqueo se libera al guardar o al cancelar explícitamente. |
| RF-704 | El bloqueo se libera automáticamente tras un periodo de inactividad configurable (orientativo: 20-30 minutos), para cubrir desconexiones y cierres accidentales. |
| RF-705 | Cualquier catalogador puede ver quién tiene una ficha bloqueada y desde cuándo. |
| RF-706 | Cualquier catalogador puede forzar el desbloqueo de una ficha antes de que expire el timeout. |
| RF-707 | El aviso de bloqueo indica el modo (consulta o edición) y, si aplica, quién tiene la ficha abierta. No se muestra al Lector, para quien carece de utilidad. |
| RF-708 | El bloqueo **se impone en la base de datos mediante un *trigger*** que rechaza la escritura si otro usuario mantiene un bloqueo sin caducar. Comprobarlo únicamente en el cliente lo convertiría en una advertencia y no en un bloqueo, porque al no haber servidor propio nada impide escribir directamente contra la API. |

### RF-800 · Trazabilidad de actualización

| Id | Requisito |
|---|---|
| RF-801 | `fecha_actualizacion` se actualiza automáticamente con cualquier cambio en la ficha. |
| RF-802 | `fecha_actualizacion_basica` se actualiza únicamente cuando cambia un campo de fase 1 (medidas, técnica, soporte, firma, conservación, ubicación física…). |
| RF-803 | `actualizado_por` registra el usuario que hizo el último cambio, y alimenta también el aviso de bloqueo de edición. |
| RF-804 | La trazabilidad se define como base común reutilizable por todas las tablas con clave primaria propia, no solo por Obras. |

### RF-900 · Eliminación de fichas: papelera permanente

| Id | Requisito |
|---|---|
| RF-901 | La eliminación de una ficha nunca es un borrado real de la base de datos, sino una baja lógica. Aplica a Obras, Exposiciones, Bibliografía, Archivo/Documentación, Series y Propietarios/Instituciones. |
| RF-902 | La baja registra `activo`, `fecha_baja`, `dado_de_baja_por`, `fecha_restauracion` y `restaurado_por`. Se guarda el último evento de baja o restauración, no el historial completo de ciclos. |
| RF-903 | Las tablas puente (Obra_Exposicion, Obra_Bibliografia) no tienen papelera: se borran directamente, ya que no tienen etiqueta física ni número citable y basta con volver a crearlas. |
| RF-904 | La baja no se propaga hacia arriba: dar de baja una imagen no afecta a la obra, y dar de baja una participación no afecta ni a la obra ni a la exposición. |
| RF-905 | La baja se propaga hacia abajo, a lo que solo existe en función de la ficha dada de baja: al dar de baja una obra dejan de mostrarse sus imágenes y sus filas de participación y de cita; al dar de baja una exposición o una referencia dejan de mostrarse sus filas puente. Serie y Propietario dados de baja dejan el campo vacío en las obras que los tenían asignados, sin darlas de baja. |
| RF-906 | La página «Papelera» sigue el patrón del resto de índices: filtrable por tabla de origen, por fecha de baja y por usuario que la ejecutó, con buscador de texto libre. Cada fila muestra identificador, resumen mínimo, fecha y usuario de baja, y un botón «Restaurar». Acceso reservado al Catalogador. |
| RF-907 | No hay periodo de gracia ni purga automática: las fichas de baja permanecen indefinidamente hasta que el equipo decida restaurarlas. |
| RF-908 | La reutilización de un identificador retirado se resuelve restaurando la ficha y editando después sus campos, salvo la clave primaria. El sistema no distingue si la restauración corrige un error o recicla el número. |
| RF-909 | La aplicación no detecta altas duplicadas de forma automática: los duplicados se resuelven por revisión del equipo apoyada en las herramientas de búsqueda. |

### RF-1000 · Ficha imprimible

| Id | Requisito |
|---|---|
| RF-1001 | La ficha imprimible es un documento de uso interno, pensado para adjuntarse físicamente a la obra. |
| RF-1002 | Incluye `id_catalogacion`, `titulo` (o «[Sin título]»), `artista`, `tecnica`, dimensiones, `fecha_ejecucion`, `serie`, `ubicacion_fisica` y la imagen índice (o el marcador «Imagen no disponible»). |
| RF-1003 | Incluye un código QR con enlace directo a la ficha completa en la aplicación, para llegar a toda la información digital con el móvil y la obra delante. |
| RF-1004 | Se implementa como vista de impresión propia con `@media print`, sin intervención del pipeline LaTeX, que queda reservado al catálogo razonado. |
| RF-1005 | Es accesible desde la ficha de obra, sin entrada propia en el menú principal. |

### RF-1100 · Navegación y página de inicio

| Id | Requisito |
|---|---|
| RF-1101 | Barra superior fija con las secciones: Inicio, Obras, Exposiciones, Bibliografía, Documentación, Series y Propietarios. |
| RF-1102 | Migas de pan en cada página, con la jerarquía completa (ej. `Inicio > Obras > AR-0001`). |
| RF-1103 | La página de inicio ofrece accesos directos a cada sección e indicadores: número de obras catalogadas, pendientes de fase 1 y de fase 2, y últimas fichas modificadas. |
| RF-1104 | Cada índice presenta en su cabecera un botón «+ Nueva…», visible solo para el Catalogador. |
| RF-1105 | La gestión de usuarios (invitar, asignar rol, revocar) se realiza desde el panel de Supabase, reservado al Superusuario. La aplicación no incluye pantallas de administración de usuarios. |

### RF-1200 · Aplicación instalable y captura con el móvil

La captura de datos con el teléfono, de pie y con la obra delante, es el caso de uso principal de la
aplicación, no un añadido.

| Id | Requisito |
|---|---|
| RF-1201 | La aplicación es una PWA instalable: manifiesto, iconos y presentación a pantalla completa una vez añadida a la pantalla de inicio. |
| RF-1202 | El armazón de la aplicación se cachea para que arranque de inmediato en visitas sucesivas. **Los datos no se cachean**: no hay funcionamiento sin conexión. |
| RF-1203 | No existe alta ni edición sin conexión. Es una decisión deliberada: la edición desconectada es incompatible con el bloqueo de edición (RF-701), que no se puede garantizar contra un cliente que no está hablando con la base de datos. |
| RF-1204 | Existe un flujo de **captura rápida** distinto del formulario completo: fotografiar, y rellenar solo el mínimo imprescindible para que la ficha exista (`artista`, `id_catalogacion`, `tipo_obra`, medidas). El resto se completa después desde cualquier dispositivo. |
| RF-1205 | El flujo de captura rápida es operable con una sola mano y sin teclado físico: campos numéricos con teclado numérico, selecciones con objetivos táctiles amplios y ninguna interacción que dependa de pasar el cursor por encima. |
| RF-1206 | La cámara se invoca directamente desde el formulario, sin obligar a salir a la aplicación de fotos y volver a elegir el archivo. |
| RF-1207 | La subida informa de su progreso y sobrevive a una conexión intermitente: si falla, se puede reintentar sin volver a rellenar los campos. |

### RF-1300 · Vistas en vivo

| Id | Requisito |
|---|---|
| RF-1301 | El listado de obras, la ficha en consulta y la galería se actualizan por WebSocket cuando otro usuario cambia los datos, sin recargar la página. |
| RF-1302 | La entrega en vivo respeta RLS: nadie recibe por el canal una fila que no podría leer con una consulta. |
| RF-1303 | Un formulario en edición no se refresca por eventos ajenos: el borrador del operador no se pisa. El conflicto de edición concurrente se resuelve con el bloqueo de edición (RF-700), no con el canal. |

---

## 6. Requisitos no funcionales

Revisados por [ADR-001](decisiones/ADR-001-stack-y-despliegue.md) y
[ADR-002](decisiones/ADR-002-almacenamiento-de-imagenes.md), que sustituyen las decisiones de stack de
los documentos originales.

| Id | Requisito |
|---|---|
| RNF-101 | La aplicación es una PWA estática que habla directamente con Supabase: PostgreSQL gestionado, PostgREST como API, Supabase Auth y Supabase Storage. No hay servidor de aplicación propio. |
| RNF-102 | El frontend se construye con Vite, React y **TypeScript**. Los tipos de las nueve tablas se generan desde el esquema con la CLI de Supabase, no se mantienen a mano: es lo que compensa la pérdida de las validaciones que aportaba un ORM. |
| RNF-103 | **Revisado por [ADR-005](decisiones/ADR-005-vercel-repo-publico-y-vivo.md).** El frontend se aloja en Vercel, con despliegue desde GitHub Actions al fusionar en `main`. Cloudflare quedó descartado para tráfico de usuarios por los bloqueos de LaLiga en España. |
| RNF-104 | La plataforma se gestiona como código con Terraform en `infra/`. El esquema de la base de datos y las políticas RLS **no** son Terraform: viven en SQL versionado que aplica la CLI de Supabase. |
| RNF-105 | La aplicación se presenta en español de España, con zona horaria `Europe/Madrid`. |
| RNF-106 | La interfaz se diseña **partiendo del móvil**, no adaptándose a él: es el dispositivo del caso de uso principal. |
| RNF-107 | El pipeline del catálogo impreso sigue siendo Python: un script local que se conecta por `psycopg2` directamente a PostgreSQL, ya que Supabase es PostgreSQL. La elección de TypeScript en el frontend no lo afecta. |
| RNF-108 | El diseño asume hasta unas 500 obras por fondo: del orden de 5000 tomas, con másters de **2-8 MB como mínimo** cada uno (10-40 GB en total). |
| RNF-109 | Los datos residen en la Unión Europea: región europea en Supabase, donde vive todo dato personal y de catálogo. Los activos estáticos del frontend (sin datos) se sirven desde la red global de Vercel. |
| RNF-110 | **Revisado por ADR-005 y la actualización de ADR-002.** Derivadas y miniaturas en Supabase Storage (bucket privado). Los másters van a Backblaze B2 **desde el inicio de la captura real** —con 2-8 MB por toma, el gratuito de Supabase se agota entre la toma 125 y la 500— mediante una función Edge que firma subidas y descargas, porque las credenciales de B2 no pueden viajar en el cliente. |
| RNF-111 | El acceso a ficheros se concede mediante URL firmada de caducidad corta. Ningún bucket es públicamente legible. |
| RNF-112 | Los másters se conservan según la regla **3-2-1**: tres copias, dos medios distintos, una fuera del lugar de trabajo. Para las obras con `estado_existencia` Destruida o Perdida, la fotografía es la única prueba que quedará de que existieron. |
| RNF-113 | Existe un volcado periódico de la base de datos en almacenamiento propio. El tramo gratuito de Supabase no incluye copias de seguridad, y sin ficha las imágenes dejan de ser un catálogo. |
| RNF-114 | Todo el código y toda la infraestructura viven bajo control de versiones con Git desde el primer día. |
| RNF-115 | La rama `main` está protegida: no se fusiona sin que la verificación automática pase. `terraform apply` no se ejecuta desde integración continua. |

---

## 7. Orden de construcción

La hoja de ruta original queda obsoleta: sus fases 1 y 2 construían un entorno de Django que ya no se
usa. Ese trabajo no se pierde del todo — la máquina Ubuntu pasa a ser el almacén de los másters y el
lugar desde el que se lanzará el pipeline del catálogo impreso.

| Fase | Contenido | Estado |
|---|---|---|
| 1 | Infraestructura como código: proyecto de Supabase, buckets, Pages y repositorio | Completada |
| 2 | Verificación automática en integración continua | Completada |
| 3 | Esquema en SQL: las nueve tablas, más trazabilidad y papelera, como migraciones versionadas | **Siguiente** |
| 4 | **Políticas RLS y sus tests.** Antes de cualquier interfaz: es el perímetro de seguridad | Pendiente |
| 5 | Armazón del frontend, autenticación y flujo de captura rápida en móvil | Pendiente |
| 6 | Ficha de obra completa, índices y búsqueda | Pendiente |
| 7 | Subida de imágenes en tres niveles y ficha imprimible con QR | Pendiente |
| 8 | Papelera y bloqueo de edición con su *trigger* | Pendiente |
| 9 | **Másters a Backblaze B2**: función Edge de firmas, bucket y flujo de subida | **Completada** — bucket y clave sin borrado en Terraform; MinIO como B2 local |
| 10 | Dominio propio (`catalogo.ruizcampins.com`, solo-DNS hacia Vercel) | **Completada** en Terraform; se activa con el `apply` |
| 11 | Volcados automáticos de la base de datos | Pendiente |

La fase 4 va deliberadamente antes que cualquier pantalla. En el stack anterior los permisos podían
dejarse para después porque el servidor negaba por omisión; aquí, una tabla sin política es una tabla
abierta.

## 8. Fuera de alcance

- **Catálogo online.** Web aparte, alimentada por exportación periódica, no conectada a esta base de
  datos en vivo. Aparcado.
- **Catálogo impreso.** Pipeline base de datos → script Python/Jinja2 → `.tex` → PDF con biblatex,
  lanzado bajo demanda sobre fichas marcadas como publicables. Aparcado.
- **Purga real desde la papelera**, ni siquiera para el Superusuario (RF-907).
- **Detección automática de duplicados** (RF-909).
- **Restricción de visibilidad por campo** según rol: el Lector ve todos los campos (RF-105).
- **Funcionamiento sin conexión.** La PWA es instalable y cachea su armazón, pero no los datos, y no
  admite alta ni edición desconectada (RF-1202, RF-1203).
- **Pantallas de administración de usuarios.** Se usa el panel de Supabase (RF-1105).

## 9. Decisiones pendientes

Cuestiones que los documentos originales no resuelven y que bloquean o condicionan la construcción.
El detalle del razonamiento está en
[`revision/incidencias-detectadas.md`](revision/incidencias-detectadas.md).

| Id | Decisión | Bloquea |
|---|---|---|
| ~~DP-01~~ | **Resuelta** en [ADR-003](decisiones/ADR-003-asignacion-del-identificador.md): lo asigna la base de datos con un *trigger* y un cerrojo por fondo | — |
| DP-02 | Formato de `id_imagen`, que el esquema no especifica | Fase 3 |
| DP-03 | Si `clave_bibtex` debe seguir siendo clave primaria inmutable o pasar a campo único editable con clave técnica detrás | Fase 3 |
| DP-04 | Taxonomía cerrada de `agrupacion` y de `etapa`, cuando haya volumen suficiente de obra catalogada | Nada por ahora: texto libre hasta entonces |
| DP-05 | Si el catálogo online será una web por autor o conjunta | Nada: producto aparcado |
| DP-06 | Convención definitiva de nomenclatura de archivos de imagen, ahora con tres niveles por toma | Fase 7 |
| DP-07 | Dónde se almacena el estado del bloqueo de edición: columnas en la propia tabla o tabla aparte. La imposición mediante *trigger* ya está decidida (RF-708); lo que falta es dónde vive el dato | Fase 8 |
| DP-08 | Si los campos Sí/No de fase 1 (`tiene_marco`, `requiere_restauracion`, `requiere_reenmarcacion`) necesitan un tercer valor «Sin revisar», por coherencia con RF-205 | Fase 3 |
| ~~DP-10~~ | **Resuelta**: código bajo licencia MIT (`LICENSE`), la misma que la otra aplicación del equipo. Las obras del catálogo quedan explícitamente fuera de la licencia — la distinción está escrita en el README | — |
| DP-09 | **Formato del máster fotográfico**: JPEG a máxima calidad, RAW o TIFF, dentro del sobre fijado de 2-8 MB mínimo por toma. Criterio archivístico, no de infraestructura. Debe decidirse **antes de fotografiar en serie**: reconvertir 5000 archivos después no recupera lo que el JPEG ya descartó | El trabajo de campo, y dimensiona B2 |
