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
| [`disenos/`](disenos/) | Maquetas de interfaz | Indicativo |
| [`revision/incidencias-detectadas.md`](revision/incidencias-detectadas.md) | Contradicciones y huecos detectados en los anteriores | Registro de trabajo |

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
| RF-108 | La asignación de usuarios a grupos es competencia exclusiva del Superusuario, mediante el panel de administración de Django. |
| RF-109 | Los roles se implementan como dos grupos de Django («Catalogador», «Lector») con los permisos estándar `add`/`change`/`delete`/`view` que Django genera por modelo. |
| RF-110 | Los ficheros subidos no se sirven por URL pública directa: toda descarga pasa por una vista que comprueba sesión y rol. |

### RF-200 · Modelo de datos y convenciones de captura

| Id | Requisito |
|---|---|
| RF-201 | El modelo consta de nueve tablas: Obras, Imágenes, Series, Exposiciones, Obra_Exposicion, Bibliografía, Obra_Bibliografia, Propietarios/Instituciones y Archivo/Documentación. |
| RF-202 | `id_catalogacion` es la clave primaria de Obras, con formato `AR-nnnn` (Rotili) y `RC-nnnn` (Ruiz Campins), secuencial por fondo y sin categoría de obra incorporada al código. |
| RF-203 | `artista` es obligatorio al dar de alta una obra y no admite «Sin revisar», porque de él depende el prefijo del identificador. |
| RF-204 | Las claves primarias no son editables una vez creada la ficha, tampoco en modo edición: se presentan de solo lectura en el formulario. Afecta a `id_catalogacion`, `id_exposicion`, `clave_bibtex`, `id_documento`, `id_serie` e `id_imagen`. |
| RF-205 | Los campos de selección ofrecen «Sin revisar» como valor inicial, distinto de «Desconocido» y de «No», salvo las excepciones justificadas en el esquema. |
| RF-206 | Los campos de texto libre quedan vacíos mientras el dato esté pendiente. Si tras la investigación no hay dato que aportar, se consigna `N/D`. |
| RF-207 | `fecha_ejecucion` es texto y admite fecha exacta, rango, aproximación y rango aproximado. `fecha_orden` es el número auxiliar que permite ordenar y filtrar cronológicamente, y no se muestra en la ficha publicada. |
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
| RF-409 | Los ficheros se almacenan dentro del almacenamiento gestionado por la aplicación. No se emplea un servicio externo de almacenamiento con nomenclatura espejo. |

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
| RF-602 | La búsqueda de obras ofrece filtros combinables entre sí, no un campo por botón. Filtros principales, siempre visibles: texto libre (sobre `id_catalogacion`, `titulo` y `titulos_alt`), `artista`, rango de fechas (por `fecha_orden`), `serie` y `tipo_obra`. |
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
| RF-1105 | La gestión de usuarios se cubre con el panel de administración estándar de Django, reservado al Superusuario. |

---

## 6. Requisitos no funcionales

| Id | Requisito |
|---|---|
| RNF-101 | La aplicación se construye con Django sobre PostgreSQL. |
| RNF-102 | Se mantiene el ecosistema Python en todo el proyecto, para compartir lenguaje con el futuro pipeline del catálogo impreso. |
| RNF-103 | Django se ejecuta con Gunicorn en un puerto interno propio. Apache es el único punto de entrada público y reenvía mediante `mod_proxy`, sin alterar la configuración existente de Moodle. |
| RNF-104 | PostgreSQL se instala como servicio de sistema independiente en su propio puerto, conviviendo con el MySQL/MariaDB ya presente en la máquina. |
| RNF-105 | La aplicación se presenta en español de España, con zona horaria `Europe/Madrid`. |
| RNF-106 | La interfaz es utilizable desde móvil: el acceso por QR con la obra delante es un caso de uso previsto, no accesorio. |
| RNF-107 | No se emplea Node.js, npm ni build de frontend: plantillas de Django y una librería CSS ligera. |
| RNF-108 | El diseño asume un volumen de hasta unas 500 obras por fondo, más la documentación de archivo. |
| RNF-109 | El entorno de ejecución inicial es la máquina Ubuntu ya disponible, considerada suficiente para desarrollo y primer uso real por un equipo pequeño. |
| RNF-110 | No se emplea Docker en la fase inicial, para no añadir una capa de aprendizaje antes de dominar Django. Queda como posible mejora futura. |
| RNF-111 | Los ficheros subidos se sirven exclusivamente a usuarios autenticados, según su rol. |
| RNF-112 | El crecimiento en disco por imágenes en alta resolución es un punto a vigilar, sin ser una restricción actual. |
| RNF-113 | La exposición segura del servicio fuera de la red local (dominio, HTTPS, cortafuegos) se aborda en una fase posterior y con apoyo del asesor técnico externo. |
| RNF-114 | Todo el código vive bajo control de versiones con Git desde el primer día, para poder deshacer cambios con seguridad. |

---

## 7. Orden de construcción

Heredado de la hoja de ruta del documento de diseño. Las dos primeras fases están completadas.

| Fase | Contenido | Estado |
|---|---|---|
| 1 | Entorno: Python, entorno virtual, Django y dependencias, base de datos propia | Completada |
| 2 | Esqueleto de Django: estructura, conexión a base de datos, arranque en local | Completada |
| 3 | Modelos: las nueve tablas más trazabilidad y papelera | **Siguiente** |
| 4 | Grupos y permisos, con el panel de administración de Django como primer prototipo funcional para validar el esquema con datos reales | Pendiente |
| 5 | Vistas a medida: índices, búsqueda y ficha de obra con bloqueo de edición | Pendiente |
| 6 | Almacenamiento de ficheros, ficha imprimible con QR, papelera | Pendiente |
| 7 | Acceso desde red local y, después, público | Pendiente |

## 8. Fuera de alcance

- **Catálogo online.** Web aparte, alimentada por exportación periódica, no conectada a esta base de
  datos en vivo. Aparcado.
- **Catálogo impreso.** Pipeline base de datos → script Python/Jinja2 → `.tex` → PDF con biblatex,
  lanzado bajo demanda sobre fichas marcadas como publicables. Aparcado.
- **Purga real desde la papelera**, ni siquiera para el Superusuario (RF-907).
- **Detección automática de duplicados** (RF-909).
- **Restricción de visibilidad por campo** según rol: el Lector ve todos los campos (RF-105).
- **Contenedorización con Docker** (RNF-110).

## 9. Decisiones pendientes

Cuestiones que los documentos originales no resuelven y que bloquean o condicionan la construcción.
El detalle del razonamiento está en
[`revision/incidencias-detectadas.md`](revision/incidencias-detectadas.md).

| Id | Decisión | Bloquea |
|---|---|---|
| DP-01 | Quién asigna `id_catalogacion` y cómo: generación automática por la aplicación o introducción manual por el catalogador | Fase 3 (modelos) y formulario de alta |
| DP-02 | Formato de `id_imagen`, que el esquema no especifica | Fase 3 |
| DP-03 | Si `clave_bibtex` debe seguir siendo clave primaria inmutable o pasar a campo único editable con clave técnica detrás | Fase 3 |
| DP-04 | Taxonomía cerrada de `agrupacion` y de `etapa`, cuando haya volumen suficiente de obra catalogada | Nada por ahora: texto libre hasta entonces |
| DP-05 | Si el catálogo online será una web por autor o conjunta | Nada: producto aparcado |
| DP-06 | Convención definitiva de nomenclatura de archivos de imagen | Fase 6 |
| DP-07 | Dónde se almacena el estado del bloqueo de edición: campos en la propia ficha o tabla aparte | Fase 5 |
| DP-08 | Si los campos Sí/No de fase 1 (`tiene_marco`, `requiere_restauracion`, `requiere_reenmarcacion`) necesitan un tercer valor «Sin revisar», por coherencia con RF-205 | Fase 3 |
