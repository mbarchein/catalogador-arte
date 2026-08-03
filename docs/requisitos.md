# Especificación de requisitos

Aplicación web de inventario y catalogación razonada — fondos de Alberto Rotili y María Ruiz Campins.

Este documento tiene **dos capas, y conviene no confundirlas**.

La primera es el **requisito histórico**: los apartados 5 y 6 recogen lo que los dos documentos de
trabajo originales pedían, consolidado en forma verificable y con un identificador estable por
requisito. Esa lista se escribió antes de construir nada y sin filtro de ingeniería: describe lo que
se quería, no lo que resultó sensato hacer. Tiene mecanismos pensados para un equipo que aquí es una
persona, dimensionados con cifras que después se midieron y salieron otras, y funciones que ninguna
necesidad ha reclamado todavía.

La segunda es **lo que se decidió al construir**: el apartado 8 recoge las decisiones reales, con lo
que cada una cambió respecto al requisito histórico, y el apartado 9 nombra lo que se ha retirado por
sobreingeniería o por sobrar. Donde las dos capas discrepen, **manda la segunda**.

Los identificadores no se reutilizan ni se renumeran, ni siquiera los de un requisito retirado: los
tests los citan, el plan de pruebas los cruza y una tabla de correspondencias solo sirve si sus claves
no se mueven. Un requisito retirado se tacha en su tabla —`~~RF-701~~`— y se explica en el apartado 9.

---

## 1. Propósito y alcance

Una única base de datos que sirve simultáneamente como inventario de trabajo (toma de datos con la
obra físicamente delante y reordenación física del estudio) y como catálogo razonado (investigación
documental, procedencia, historial expositivo y bibliográfico), y que actúa como fuente única de
verdad para dos productos derivados que hoy están aparcados: el catálogo online y el catálogo impreso.

El alcance de esta especificación es **la aplicación de inventario y catalogación**. Los dos productos
derivados quedan fuera (ver apartado 10).

## 2. Documentos de referencia

| Documento | Qué define | Carácter |
|---|---|---|
| [`originales/esquema_campos_inventario_v11.md`](originales/esquema_campos_inventario_v11.md) | Qué datos se guardan: nueve tablas, campos, tipos y convenciones de captura | **Normativo** para el modelo de datos |
| [`originales/diseno_interfaz_y_arquitectura_v4.md`](originales/diseno_interfaz_y_arquitectura_v4.md) | Cómo se construye y se usa la aplicación: stack, roles, páginas, comportamiento | **Normativo** para arquitectura y comportamiento |
| [`decisiones/`](decisiones/) | Decisiones de arquitectura posteriores a los documentos fuente, con su razonamiento y sus consecuencias | **Normativo**, y prevalece sobre los originales |
| [`disenos/`](disenos/) | Maquetas de interfaz | Indicativo |
| [`revision/incidencias-detectadas.md`](revision/incidencias-detectadas.md) | Contradicciones y huecos detectados en los anteriores | Registro de trabajo |
| [`revision/deteccion-de-bordes-medicion.md`](revision/deteccion-de-bordes-medicion.md) | Qué acierta y qué falla la sugerencia de recorte sobre las 44 fotografías reales, y las doce decisiones que abre | Registro de trabajo; sus decisiones **no están tomadas** |

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

**Capa histórica.** Lo que pedían los documentos originales, con su identificador. Lo que de verdad
gobierna hoy está en el apartado 8, y lo retirado, tachado aquí y explicado en el 9. Un requisito sin
tachar y sin mención en el 8 sigue vigente tal como está escrito.

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
| RF-215 | La ubicación física es un **árbol de lugares** con clave propia, no un texto con convención de notación ([ADR-006](decisiones/ADR-006-ubicacion-como-arbol-de-lugares.md)). El nombre se guarda tal cual se escribe, con mayúsculas y tildes; la comparación se hace normalizada. Dos hermanos no pueden llamarse igual, la jerarquía no admite ciclos, un lugar con contenido no se retira, y `parent_id` es mutable: reorganizar el árbol —incluido colgar de otro sitio lo que hoy es raíz— es una operación normal que no toca ninguna obra. Una obra puede no tener ubicación. |
| RF-216 | La clave primaria de una tabla maestra no es su nombre. Renombrar una entrada del vocabulario es un `update` de una fila y nunca una migración de datos. |

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
| RF-311 | Desde una ficha se pasa a la obra anterior y a la siguiente, con controles visibles y con un gesto de arrastre horizontal. La secuencia es el listado del que se ha llegado —sus filtros, su búsqueda y su orden—, y la ficha dice qué posición ocupa en ella («12 de 87») y de qué cola se trata. No se navega en círculo: en los extremos el control queda inactivo. La secuencia se fija al abrir la ficha y no se reordena mientras se recorre, ni cuando editar la obra cambiaría su sitio. Sobre la galería de imágenes el gesto pasa fotografías, no obras. En modo edición no hay navegación: pasar de obra con el formulario a medias sería perder trabajo. |

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
| RF-411 | La aplicación no muestra nunca un máster en una vista: la ficha ofrece **descargarlo**, con URL firmada por la función Edge, **también para el Lector** — enviar el original a una imprenta o a un comisario es exactamente su caso de uso. Junto al original se ofrece la copia corregida de RF-420, que es la que se manda a imprimir; el fichero se **guarda** con un nombre legible fuera de la aplicación, y no se abre en una pestaña. La subida exige poder editar. |
| RF-412 | Todo acceso a imágenes pasa por una única función del frontend que resuelve la URL de cada nivel, de modo que cambiar de proveedor de almacenamiento sea un cambio en un solo lugar. |
| ~~RF-413~~ | El campo `archivo_digitalizado` de Archivo/Documentación sigue el mismo esquema de tres niveles, con la miniatura correspondiente a la primera página del documento. |
| RF-414 | El ajuste de color de una fotografía se guarda como **dato paramétrico, absoluto sobre el máster y reversible**, igual que el giro y el recorte ([ADR-009](decisiones/ADR-009-ajuste-de-color-como-tabla-de-consulta.md)): un conjunto cerrado de mandos que se aplica por igual a la miniatura y a la derivada de consulta, y que deja el máster intacto. Reeditar reemplaza el ajuste y no lo compone sobre el anterior, de modo que aflojarlo, cambiarlo o quitarlo dentro de un año sea recalcular desde el original. Los tipos de luz se ofrecen como lista de puntos de partida ajustables y se etiquetan como tal, nunca como medición. Cada toma parte del ajuste de la toma general de su obra, se cambia por separado y se devuelve a lo heredado, y la pantalla dice cuándo un ajuste es heredado. Sobre la derivada de consulta, que ya lleva el color cocido, el ajuste no se ofrece: sería componer sin saber sobre qué. |
| RF-415 | **Requisito negativo.** Quedan prohibidos —y no se implementan ni siquiera desactivados por omisión— la saturación, la vibrancia, el contraste global, los ajustes por rango tonal o locales (sombras y altas luces), la nitidez, la reducción de velo y la eliminación de reflejos; el motivo de cada descarte, uno a uno, está en [ADR-009](decisiones/ADR-009-ajuste-de-color-como-tabla-de-consulta.md). El barniz que ha amarilleado y el pigmento que ha perdido intensidad **son el dato**: es lo que el esquema de campos registra en `estado_conservacion` y `descripcion_conservacion`, y es justo lo que la fotografía tiene que testificar. Avivarlos cataloga una obra que no existe, y para las obras con `estado_existencia` Destruida o Perdida esa fotografía es la única prueba que quedará de que existieron (RNF-112). Lo permitido corrige la luz de la sala —dominante, exposición y puntos negro y blanco—; lo prohibido retoca la obra. |
| RF-416 | La fecha de la toma se lee del fichero de la fotografía y **se conserva junto a la fecha de la ficha, sin sustituirla**: son dos datos distintos y pueden discrepar sin que ninguno esté mal. Se distingue la fecha fiable —la que la cámara escribió al disparar— de la aproximada, que es la del fichero cuando la primera falta, y la distinción se guarda con el dato. Hoy las 39 fotografías de la base llevan por fecha la de su subida, así que ninguna ficha tiene la de la toma; leerla no repara hacia atrás lo ya subido. |
| RF-417 | Cada fotografía registra su **procedencia**: propia, tomada de otro catálogo o recibida de un tercero. En las que no son propias el ajuste de color no se ofrece — corregir la dominante de una reproducción ajena es enmendar el revelado de otro sin saber qué luz tenía delante. De los 44 másteres del volcado, 4 son reproducciones tomadas de catálogos en línea y no hay nada en la ficha que hoy lo diga. |
| RF-418 | El ajuste de color registra **de dónde salió la referencia neutra**: testigo de gris detectado, referencia tomada de la escena con el cuentagotas, o corregido a ojo. Del testigo se guarda además si es carta comprada u hoja impresa en casa, porque la tinta doméstica no es neutra y el gris de la hoja sirve para los puntos negro y blanco pero no como referencia de dominante. La aplicación funciona con testigo y sin él, la detección nunca aplica nada por su cuenta —señala el candidato y lo ofrece—, y la propia aplicación genera la hoja imprimible y explica con ilustraciones cómo se coloca. |
| RF-419 | El editor muestra los **datos técnicos que trae el fichero de la fotografía** —fecha de la toma, cámara, aplicación de cámara, tamaño del original, sensibilidad, exposición, diafragma, objetivo y flash— y **explica su ausencia cuando no los trae**, distinguiendo la fotografía que no los tiene de la que los tiene en un máster que no se ha podido descargar. Nunca un hueco. Se dan números y no juicios: la aplicación no opina sobre si una toma está bien expuesta. |
| RF-420 | Al aplicar una corrección se genera y se almacena una **copia a resolución completa con todas las correcciones aplicadas** —giro, recorte, perspectiva y color—, en una ruta propia que nunca es la del máster. Es el cuarto nivel por toma ([ADR-010](decisiones/ADR-010-copia-corregida-a-resolucion-completa.md)). Su caso de uso es el de RF-411, mandar el original a una imprenta o a un comisario, y una copia con el color arreglado y la perspectiva torcida no le sirve a ninguno de los dos. Se regenera al reeditar y reemplaza a la anterior; si no hay ninguna corrección, no hay copia. Cuando el dispositivo no puede generarla queda **pendiente y consta, con su razón**: nunca se sube un fichero en blanco ni se reduce la resolución en silencio. |
| RF-421 | La cola de copias pendientes se vacía con una **herramienta local por lotes**, sin servidor de aplicación (RNF-101, [ADR-010](decisiones/ADR-010-copia-corregida-a-resolucion-completa.md)). Produce **exactamente el mismo resultado** que el navegador, y esa igualdad se verifica con un fichero de casos versionado en el repositorio —parámetros de color contra la tabla de color que producen— que generan los tests del frontend y comprueban los de la herramienta. Sin esa comprobación, la divergencia entre las dos implementaciones se descubre porque la miniatura y la copia a resolución completa de la misma obra salen de distinto color. |

### RF-500 · Exposiciones, bibliografía y tablas puente

| Id | Requisito |
|---|---|
| RF-501 | La participación de una obra en una exposición se registra en la tabla puente Obra_Exposicion, con `nota_obra_en_expo` para el número histórico en catálogo y las circunstancias de esa participación concreta. |
| RF-502 | El historial expositivo se presenta en orden cronológico ascendente con el formato `[año], [fecha_inicio–fecha_fin], [titulo_exposicion en cursiva], [institucion], [lugar]`, idéntico en la ficha de obra y en el listado de exposiciones. |
| RF-503 | El catálogo de una exposición no tiene tabla propia: se da de alta en Bibliografía y se enlaza desde `referencia_catalogo` de la exposición. |
| RF-504 | La cita de una obra en una referencia se registra en Obra_Bibliografia, manteniendo `paginas` como campo estructurado independiente de `notas`, por ser dato citable de forma exacta. |
| RF-505 | La ficha de exposición incluye un bloque «Obras participantes» con miniatura, `id_catalogacion` enlazado y `nota_obra_en_expo` de cada fila. |
| RF-506 | La ficha bibliográfica incluye un bloque «Obras citadas» con `id_catalogacion` enlazado y `paginas`/`notas`, sin miniatura. |
| ~~RF-507~~ | La tabla Bibliografía debe poder exportarse a un archivo `.bib` reutilizable por biblatex, con `clave_bibtex`, `autor`, `editor`, `titulo` y `año` como campos independientes. |

### RF-600 · Índices y búsqueda

| Id | Requisito |
|---|---|
| ~~RF-601~~ | Obras dispone de dos índices: índice de identificadores e índice visual en mosaico de imágenes. |
| RF-602 | La búsqueda de obras ofrece filtros combinables entre sí, no un campo por botón. Filtros principales, siempre visibles: texto libre (sobre `id_catalogacion`, `titulo` y `titulos_alt`), `artista`, rango de fechas (solapamiento sobre `anio_inicio`/`anio_fin`), `serie` y `tipo_obra`. |
| ~~RF-603~~ | Filtros avanzados, colapsados por defecto: `tecnica`, `estado_existencia`, `fase_inventario_completada`, `fase_documentacion_completada` y rango mínimo-máximo de medidas. |
| RF-604 | Las columnas de resultados son: `id_catalogacion` (único enlace a la ficha), miniatura, `titulo`, `artista` y `fecha_ejecucion`, con contador «mostrando X–Y de Z resultados» y paginación. |
| RF-605 | Una búsqueda sin resultados devuelve la misma página de búsqueda con el mensaje «No se han encontrado obras con estos criterios» en lugar de la tabla. Nunca una página en blanco. |
| RF-606 | Tienen búsqueda dedicada Obras, Exposiciones, Bibliografía y Documentación. Series y Propietarios/Instituciones no la necesitan por bajo volumen: basta el listado simple. |
| RF-607 | El filtrado de obras por serie o por propietario no duplica la lógica de búsqueda: desde la ficha de la serie o del propietario, un enlace abre el índice de obras ya filtrado, reutilizando listado y columnas. |
| RF-608 | «Volver al listado» conserva los filtros aplicados y la página de origen. |
| RF-609 | Los índices y las búsquedas excluyen las fichas dadas de baja. |
| RF-610 | El texto buscado viaja en la URL del listado, junto a los filtros y el orden: un listado buscado se comparte como enlace, sobrevive a la recarga y vuelve con «atrás». No se recuerda entre sesiones — la vista guardada en el dispositivo son los filtros y el orden, no lo que se buscó. |

### RF-700 · Bloqueo de edición

**Grupo retirado entero** (apartado 9.1). Se conserva escrito porque es la única constancia de por qué
la aplicación no lo tiene y de qué habría que rehacer si algún día hicieran falta dos manos.

| Id | Requisito |
|---|---|
| ~~RF-701~~ | Una ficha solo puede estar en edición por un catalogador a la vez. |
| ~~RF-702~~ | El bloqueo se activa al pulsar «Editar», no al abrir la ficha en modo consulta. |
| ~~RF-703~~ | El bloqueo se libera al guardar o al cancelar explícitamente. |
| ~~RF-704~~ | El bloqueo se libera automáticamente tras un periodo de inactividad configurable (orientativo: 20-30 minutos), para cubrir desconexiones y cierres accidentales. |
| ~~RF-705~~ | Cualquier catalogador puede ver quién tiene una ficha bloqueada y desde cuándo. |
| ~~RF-706~~ | Cualquier catalogador puede forzar el desbloqueo de una ficha antes de que expire el timeout. |
| ~~RF-707~~ | El aviso de bloqueo indica el modo (consulta o edición) y, si aplica, quién tiene la ficha abierta. No se muestra al Lector, para quien carece de utilidad. |
| ~~RF-708~~ | El bloqueo **se impone en la base de datos mediante un *trigger*** que rechaza la escritura si otro usuario mantiene un bloqueo sin caducar. Comprobarlo únicamente en el cliente lo convertiría en una advertencia y no en un bloqueo, porque al no haber servidor propio nada impide escribir directamente contra la API. |

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
| ~~RF-1004~~ | Se implementa como vista de impresión propia con `@media print`, sin intervención del pipeline LaTeX, que queda reservado al catálogo razonado. |
| RF-1005 | Es accesible desde la ficha de obra, sin entrada propia en el menú principal. |

### RF-1100 · Navegación y página de inicio

| Id | Requisito |
|---|---|
| RF-1101 | Barra superior fija con las secciones: Inicio, Obras, Exposiciones, Bibliografía, Documentación, Series y Propietarios. |
| ~~RF-1102~~ | Migas de pan en cada página, con la jerarquía completa (ej. `Inicio > Obras > AR-0001`). |
| RF-1103 | La página de inicio ofrece accesos directos a cada sección e indicadores: número de obras catalogadas, pendientes de fase 1 y de fase 2, y últimas fichas modificadas. |
| RF-1104 | Cada índice presenta en su cabecera un botón «+ Nueva…», visible solo para el Catalogador. |
| RF-1105 | La gestión de usuarios (invitar, asignar rol, revocar) se realiza desde el panel de Supabase, reservado al Superusuario. La aplicación no incluye pantallas de administración de usuarios. |
| RF-1106 | Las tablas maestras se gestionan desde una sección propia, «Tablas», visible solo para el Catalogador. Agrupa lo que hoy vive dentro de los formularios (tipos de obra, series) y lo que necesita pantalla propia (ubicaciones: crear, renombrar, mover y retirar). |

### RF-1200 · Aplicación instalable y captura con el móvil

La captura de datos con el teléfono, de pie y con la obra delante, es el caso de uso principal de la
aplicación, no un añadido.

| Id | Requisito |
|---|---|
| RF-1201 | La aplicación es una PWA instalable: manifiesto, iconos y presentación a pantalla completa una vez añadida a la pantalla de inicio. |
| RF-1202 | El armazón de la aplicación se cachea para que arranque de inmediato en visitas sucesivas. **Los datos no se cachean**: no hay funcionamiento sin conexión. |
| RF-1203 | No existe alta ni edición sin conexión. Es una decisión deliberada: la edición desconectada es incompatible con el bloqueo de edición (RF-701), que no se puede garantizar contra un cliente que no está hablando con la base de datos. **El motivo ha cambiado** al retirarse el bloqueo (9.1): sigue sin haberla porque no hay resolución de conflictos y la copia local del catálogo es de solo lectura. |
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

**Capa histórica**, revisada por [ADR-001](decisiones/ADR-001-stack-y-despliegue.md) y
[ADR-002](decisiones/ADR-002-almacenamiento-de-imagenes.md), que sustituyen las decisiones de stack de
los documentos originales.

Aquí es donde más se nota la falta de filtro de ingeniería: la lista mezcla decisiones de arquitectura
que gobiernan de verdad con cifras de dimensionado inventadas antes de medir nada y con obviedades que
no son requisitos. Lo que cada una es, y lo que la implementación midió, está en la columna «Estado».

| Id | Requisito | Estado |
|---|---|---|
| RNF-101 | La aplicación es una PWA estática que habla directamente con Supabase: PostgreSQL gestionado, PostgREST como API, Supabase Auth y Supabase Storage. No hay servidor de aplicación propio. | Vigente. Es ADR-001 y lo sostiene todo lo demás. |
| RNF-102 | El frontend se construye con Vite, React y **TypeScript**. Los tipos de las nueve tablas se generan desde el esquema con la CLI de Supabase, no se mantienen a mano: es lo que compensa la pérdida de las validaciones que aportaba un ORM. | **Revisado.** Vite, React y TypeScript, sí. Los tipos **se escriben a mano** en `app/src/lib/types.ts`: generarlos exige que el proyecto remoto exista y una CLI en el pipeline, y con nueve tablas previstas —tres construidas— el coste no se paga. El fichero avisa de que cualquier cambio en una migración obliga a tocarlo, que es el precio real de la decisión. |
| RNF-103 | **Revisado por [ADR-005](decisiones/ADR-005-vercel-repo-publico-y-vivo.md).** El frontend se aloja en Vercel, con despliegue desde GitHub Actions al fusionar en `main`. Cloudflare quedó descartado para tráfico de usuarios por los bloqueos de LaLiga en España. | Vigente (ADR-005). |
| RNF-104 | La plataforma se gestiona como código con Terraform en `infra/`. El esquema de la base de datos y las políticas RLS **no** son Terraform: viven en SQL versionado que aplica la CLI de Supabase. | Vigente, y la frontera se ha respetado: `infra/` no contiene ni una política RLS. |
| RNF-105 | La aplicación se presenta en español de España, con zona horaria `Europe/Madrid`. | Vigente. |
| RNF-106 | La interfaz se diseña **partiendo del móvil**, no adaptándose a él: es el dispositivo del caso de uso principal. | Vigente, y es el criterio que más veces ha decidido un diseño: el menú al pie, el editor a pantalla completa, las asas grandes del recorte, la lupa de la esquina. |
| ~~RNF-107~~ | El pipeline del catálogo impreso sigue siendo Python: un script local que se conecta por `psycopg2` directamente a PostgreSQL, ya que Supabase es PostgreSQL. La elección de TypeScript en el frontend no lo afecta. | **Retirado** (9.2): es un requisito de un producto que está fuera de alcance. |
| RNF-108 | El diseño asume hasta unas 500 obras por fondo: del orden de 5000 tomas, con másters de **2-8 MB como mínimo** cada uno (10-40 GB en total). | **Revisado** con datos medidos (9.2). El sobre de 2-8 MB por toma no se cumple: los másters reales van de 0,2 a 19 MB. Las 500 obras por fondo siguen siendo una estimación sin comprobar; hoy hay 21 obras, 15 de ellas con fotografía, y 44 másters. **Revisado otra vez** por la copia corregida a resolución completa (RF-420): cada fotografía con alguna corrección guarda un segundo fichero del tamaño de su máster, así que el consumo proyectado en Backblaze llega a duplicarse —de 10-40 GB a 20-80 GB si acaban corregidas todas— y cada «Aplicar» sube hasta 19 MB por la cola desde un almacén con mala cobertura. Es una decisión tomada con estos números delante y no se reabre: lo que cambia es el supuesto de dimensionado, no el requisito. |
| RNF-109 | Los datos residen en la Unión Europea: región europea en Supabase, donde vive todo dato personal y de catálogo. Los activos estáticos del frontend (sin datos) se sirven desde la red global de Vercel. | Vigente. |
| RNF-110 | **Revisado por ADR-005 y la actualización de ADR-002.** Derivadas y miniaturas en Supabase Storage (bucket privado). Los másters van a Backblaze B2 **desde el inicio de la captura real** —con 2-8 MB por toma, el gratuito de Supabase se agota entre la toma 125 y la 500— mediante una función Edge que firma subidas y descargas, porque las credenciales de B2 no pueden viajar en el cliente. | Vigente (ADR-002 y ADR-005). |
| RNF-111 | El acceso a ficheros se concede mediante URL firmada de caducidad corta. Ningún bucket es públicamente legible. | **Revisado.** Toda URL se firma y ningún bucket es legible sin firma, pero «corta» no vale para las miniaturas: se firman a siete días porque la URL es la clave de caché del navegador y refirmarlas en cada visita tiraría todas las imágenes ya descargadas. El motivo está escrito junto a la constante. |
| RNF-112 | Los másters se conservan según la regla **3-2-1**: tres copias, dos medios distintos, una fuera del lugar de trabajo. Para las obras con `estado_existencia` Destruida o Perdida, la fotografía es la única prueba que quedará de que existieron. | **Revisado** (9.2). Es criterio archivístico, no requisito verificable de la aplicación. Hoy hay dos copias en dos medios —B2 y el espejo local que baja `make db-clone`— y la tercera fuera del lugar de trabajo no existe. |
| RNF-113 | Existe un volcado periódico de la base de datos en almacenamiento propio. El tramo gratuito de Supabase no incluye copias de seguridad, y sin ficha las imágenes dejan de ser un catálogo. | Pendiente. Hoy el volcado se lanza a mano (`make db-pull`); automatizarlo sigue en pie. |
| ~~RNF-114~~ | Todo el código y toda la infraestructura viven bajo control de versiones con Git desde el primer día. | **Retirado** (9.2): no es un requisito, es cómo se trabaja. |
| RNF-115 | La rama `main` está protegida: no se fusiona sin que la verificación automática pase. `terraform apply` no se ejecuta desde integración continua. | Vigente y verificado: la protección de rama está en `infra/github.tf` y exige el check «verificar». |

---

## 7. Estado real de construcción

La hoja de ruta original quedaba obsoleta por dos motivos: sus fases 1 y 2 construían un entorno de
Django que no se usa, y las siguientes se marcaron pendientes y nunca se volvieron a mirar mientras se
construían. Lo que sigue es el estado, no un plan.

| Área | Estado |
|---|---|
| Plataforma como código (Terraform), dominio, alojamiento y almacén de másters | Construido |
| Verificación automática y despliegue en integración continua | Construido, con filtros de rutas por bloque de trabajo |
| Políticas RLS, privilegios y su batería de tests | Construido: dieciocho ficheros de test de SQL en verde, y el cierre por omisión avisa si alguien añade una tabla sin política |
| Esquema: Obras, Imágenes y las tres tablas maestras (tipos de obra, series, lugares) | Construido |
| Esquema: Exposiciones, Bibliografía, sus dos tablas puente, Propietarios/Instituciones y Archivo/Documentación | **No construido.** Son cuatro de las nueve tablas y las dos puente; nada del catálogo razonado documental existe todavía |
| Frontend: acceso, listado con filtros y búsqueda, ficha, edición, captura rápida en móvil | Construido |
| Fotografías: tres niveles generados en el navegador, orden, imagen índice, giro y recorte como dato | Construido |
| Ficha imprimible en PDF con QR | Construido |
| Vistas en vivo por WebSocket | Construido para obras e imágenes |
| Sección «Tablas»: ubicaciones | Construido. Tipos de obra y series, pendientes de pantalla |
| Papelera | **No construida.** La baja lógica sí está en el esquema y en los *triggers*; lo que falta es la pantalla desde la que ver y restaurar |
| Bloqueo de edición | **Retirado** (9.1) |
| Volcados automáticos de la base de datos | Pendiente. Hoy se lanzan a mano |

Un aviso sobre las cifras de este documento y del plan de pruebas: la cabecera del plan sigue diciendo
«44 asertos en verde» y hoy son cientos. Esa clase de número se queda atrás en cuanto se escribe, y lo
que vale es la salida de `make verificar`.

## 8. Decisiones tomadas al construir

Lo que gobierna hoy y no estaba en los documentos originales, o estaba de otra manera. Cada decisión
con consecuencia de arquitectura tiene su ADR; las demás viven comentadas donde se aplican, que es
donde se leen.

### 8.1 Arquitectura, con ADR propio

| Decisión | Qué cambió |
|---|---|
| [ADR-001](decisiones/ADR-001-stack-y-despliegue.md) · PWA estática sobre Supabase | Sustituye Django en la máquina del equipo. Consecuencia que ordena todo lo demás: sin servidor propio, las políticas RLS son el único perímetro |
| [ADR-002](decisiones/ADR-002-almacenamiento-de-imagenes.md) · Tres niveles por toma, máster fuera de Supabase | El máster nunca se modifica: es el documento de archivo |
| [ADR-003](decisiones/ADR-003-asignacion-del-identificador.md) · El identificador lo asigna la base | Resuelve DP-01. *Trigger* con cerrojo por fondo: dos catalogadores a la vez no obtienen el mismo número |
| [ADR-004](decisiones/ADR-004-fecha-estructurada.md) · La fecha vive estructurada | `fecha_ejecucion` pasa a columna generada. Revisa RF-207 y elimina `fecha_orden` |
| [ADR-005](decisiones/ADR-005-vercel-repo-publico-y-vivo.md) · Vercel, repositorio público | Cloudflare descartado por los bloqueos de LaLiga en España |
| [ADR-006](decisiones/ADR-006-ubicacion-como-arbol-de-lugares.md) · La ubicación es un árbol de lugares | Revisa la convención de notación del esquema de campos. Establece que la clave de una tabla maestra no es su nombre |
| [ADR-007](decisiones/ADR-007-claves-sustitutas-en-las-tablas-maestras.md) · Clave sustituta en toda tabla maestra | Retira la deuda que ADR-006 dejó escrita: tipos de obra y series ya la tienen; el fondo, que hoy es un enumerado, va en una segunda entrega |
| [ADR-008](decisiones/ADR-008-perspectiva-como-cuatro-esquinas.md) · La perspectiva se guarda como cuatro esquinas | Revisa el «fuera de alcance» que el detector declaraba y la forma del encuadre de ADR-002. El máster sigue intacto y el rectificado se recalcula |
| [ADR-009](decisiones/ADR-009-ajuste-de-color-como-tabla-de-consulta.md) · El ajuste de color se guarda como una tabla de consulta | Extiende a la luz la frontera que el giro y el recorte abrieron: la tabla de 256 entradas por canal es la definición del color, y la previsualización, la exportación y la lupa la traducen. Sostiene RF-414, RF-415, RF-417 y RF-418 |
| [ADR-010](decisiones/ADR-010-copia-corregida-a-resolucion-completa.md) · La copia corregida a resolución completa | Añade un cuarto nivel a los tres de ADR-002, para que lo que se manda a imprenta no sea la fotografía sin corregir. La genera el navegador cuando puede y una herramienta local por lotes cuando no, sin servidor. Sostiene RF-420 y RF-421, y revisa el dimensionado de RNF-108 |

### 8.2 Decisiones de interfaz que revisan un requisito

| Requisito histórico | Lo que se construyó, y por qué |
|---|---|
| RF-1101 · barra superior fija con siete secciones | **Menú al pie con cuatro pestañas** (Obras, Añadir, Tablas, Mi perfil). Siete secciones eran las nueve tablas del esquema, y cuatro de ellas no existen. Al pie porque el pulgar llega, que es RNF-106 aplicado en vez de citado |
| RF-601 · dos índices, de identificadores y visual en mosaico | **Un solo listado**, con la miniatura en cada fila. Dos índices sobre los mismos datos son dos sitios donde arreglar el mismo fallo |
| RF-602, RF-603 · filtros principales visibles y avanzados colapsados | **Una sola hoja con todos**, y un botón de embudo que dice cuántos están activos. La distinción principal/avanzado era una jerarquía inventada; lo que de verdad hacía falta era ver de un vistazo que el listado está filtrado |
| RF-604 · paginación y contador «mostrando X–Y de Z» | **El catálogo entero viaja al dispositivo** y se filtra en local, así que no hay páginas que numerar. El contador se queda («5 obras»), porque un listado reducido que parece completo es cómo se pierde una ficha |
| RF-1004 · vista de impresión con `@media print` | **PDF generado en el navegador** con pdf-lib, tamaño A5. `@media print` deja el resultado a merced del diálogo de impresión de cada móvil; un PDF se adjunta a la obra, se envía y se archiva igual en todas partes |
| RF-1002 · la ficha imprimible lleva `ubicacion_fisica` | Lleva la rama del árbol de lugares, que es lo que ese campo ha pasado a ser (ADR-006) |
| RF-311 | No estaba en los originales: la ficha se recorre como cola del listado del que se llegó. Salió de usar la aplicación, no de especificarla |

### 8.3 Decisiones que los originales no contemplaban

- **El catálogo se copia al dispositivo** y el listado se pinta desde esa copia, así que filtrar,
  ordenar y buscar son inmediatos y el listado abre sin esperar. La copia se borra al cerrar sesión:
  el móvil puede ser compartido.
- **El giro y el recorte de una fotografía se guardan como dato**, no como fichero nuevo, y el máster
  no se toca. Lleva a que la sugerencia de recorte sea posible, y a que volver al original completo
  sea siempre posible.
- **Los errores de regla los redacta la base de datos**, en español y con su pista de qué hacer antes,
  y la interfaz los muestra tal cual. Una segunda copia de la regla en el cliente es una regla que se
  queda atrás.
- **El despliegue de un cambio de esquema es en dos fases** cuando retira una columna en uso: el
  frontend viejo corre unos segundos contra el esquema nuevo. Por eso las columnas de texto que
  sustituyen ADR-006 y ADR-007 siguen ahí.
- **Los identificadores de catalogación y las rutas ya impresas son legado y no se tocan**: `/obra/:id`
  se mantiene para siempre como redirección porque está en códigos QR pegados a obras reales.
- **El color de una fotografía se corrige como dato, no como fichero nuevo** (RF-414 a RF-421), por lo
  mismo que el giro y el recorte. Los documentos originales no lo contemplaban: lo ha pedido la luz de
  los almacenes, que tiñe las obras y no se puede cambiar. Lo que va escrito con el ajuste es su límite
  (RF-415), porque añadir un deslizador de saturación cuesta una línea y falsea el documento de
  catalogación para siempre. De esta decisión salen el cuarto nivel de fichero —la copia corregida a
  resolución completa— y el consumo de almacenamiento que revisa RNF-108.

## 9. Retirado: sobreingeniería y requisitos superfluos

Los requisitos históricos se escribieron para un equipo, con nueve tablas y un volumen que todavía no
existe. Lo que sigue se retira: sigue escrito y tachado en su tabla, porque la única constancia de por
qué la aplicación no lo tiene es el propio requisito.

### 9.1 Sobreingeniería

| Requisito | Qué pedía | Por qué se retira |
|---|---|---|
| ~~RF-701~~ a ~~RF-708~~ · bloqueo de edición | Bloqueo por ficha, con caducidad por inactividad, quién la tiene abierta, desbloqueo forzado y un *trigger* que rechaza la escritura ajena | Ocho requisitos, una tabla o unas columnas, un *trigger* y una pantalla, para un catálogo que edita una persona. El conflicto que evita se resuelve hoy con que un formulario en edición no se refresca por eventos ajenos (RF-1303), y si algún día hay dos manos, lo honesto es avisar de que el dato ha cambiado bajo el formulario, no impedir abrirlo. Arrastraba además una consecuencia grande: RF-1203 prohibía la edición sin conexión *por el bloqueo*. La prohibición se mantiene, por otro motivo — no hay resolución de conflictos y la copia local es de lectura |
| ~~RF-601~~ · dos índices de obras | Un índice de identificadores y otro visual en mosaico | Un listado con miniatura cubre los dos. Ver 8.2 |
| ~~RF-603~~ · filtros avanzados colapsados | Segunda fila de filtros, plegada | La jerarquía entre filtros era inventada. Ver 8.2 |
| ~~RF-1102~~ · migas de pan con jerarquía completa | `Inicio > Obras > AR-0001` en cada página | En una pantalla de móvil, tres niveles de migas gastan la línea que necesita el título de la obra. Se navega con el botón «atrás», que además vuelve al listado con sus filtros puestos (RF-608) |
| ~~RF-1004~~ · `@media print` | Vista de impresión con CSS | Sustituido por un PDF. Ver 8.2 |
| ~~RF-413~~ · tres niveles para el archivo digitalizado | Miniatura de la primera página del PDF, derivada y máster para cada documento | Generar la miniatura de la primera página de un PDF en el navegador es trabajo real, para una tabla que no existe y un caso que nadie ha pedido. Cuando exista Archivo/Documentación se decidirá con el caso delante |
| ~~RF-507~~ · exportación a `.bib` | La tabla Bibliografía exportable a biblatex | Requisito del catálogo impreso, que está fuera de alcance, sobre una tabla que no existe |

### 9.2 Requisitos no funcionales superfluos o mal planteados

| Requisito | Por qué |
|---|---|
| ~~RNF-107~~ · el pipeline del catálogo impreso es Python | Es un requisito de un producto aparcado y fuera de alcance. Pasa al apartado 10, donde ya está el producto |
| ~~RNF-114~~ · todo bajo control de versiones desde el primer día | No es un requisito verificable, es cómo se trabaja. Ningún test puede fallar por esto y ninguna decisión depende de ello |
| RNF-108 · 500 obras por fondo, másters de 2-8 MB | Se conserva **como supuesto de dimensionado y no como requisito**, y con la cifra corregida: los másters reales van de 0,2 a 19 MB, así que el sobre estaba mal por los dos extremos. Importa porque de él salió la decisión de llevar los másters a B2 desde el principio, y esa sigue siendo buena por el extremo alto |
| RNF-112 · regla 3-2-1 | Se conserva **como criterio archivístico**. Hoy hay dos copias en dos medios; la tercera fuera del lugar de trabajo no existe, y decir que el requisito está cumplido sería falso |

### 9.3 Lo que NO se retira, aunque no esté construido

Para que la distinción quede clara: las cuatro tablas que faltan —Exposiciones, Bibliografía,
Propietarios/Instituciones, Archivo/Documentación— y la papelera **no son sobreingeniería**. Son el
catálogo razonado, que es la mitad del propósito del proyecto (apartado 1), y la papelera es la
contrapartida de que nada se borre nunca. Están sin construir, que es distinto de estar de más.

## 10. Fuera de alcance

- **Catálogo online.** Web aparte, alimentada por exportación periódica, no conectada a esta base de
  datos en vivo. Aparcado.
- **Catálogo impreso.** Pipeline base de datos → script Python/Jinja2 → `.tex` → PDF con biblatex,
  lanzado bajo demanda sobre fichas marcadas como publicables. Aparcado. Con él quedan fuera su
  elección de lenguaje (~~RNF-107~~) y la exportación a `.bib` (~~RF-507~~), que eran requisitos de
  este producto colados en la especificación de la aplicación.
- **Purga real desde la papelera**, ni siquiera para el Superusuario (RF-907).
- **Detección automática de duplicados** (RF-909).
- **Restricción de visibilidad por campo** según rol: el Lector ve todos los campos (RF-105).
- **Funcionamiento sin conexión.** La PWA es instalable y cachea su armazón, pero no los datos, y no
  admite alta ni edición desconectada (RF-1202, RF-1203).
- **Pantallas de administración de usuarios.** Se usa el panel de Supabase (RF-1105).
- **Bloqueo de edición.** Retirado por sobreingeniería, no aparcado: ver 9.1. Si algún día editan dos
  personas a la vez, la respuesta prevista es avisar de que el dato ha cambiado bajo el formulario.

## 11. Decisiones pendientes

Cuestiones que los documentos originales no resuelven. Varias se resolvieron al construir sin
necesidad de un ADR —una decisión que no tiene alternativas defendibles no necesita documento— y otras
han quedado sin objeto porque lo que condicionaban se ha retirado. Se dejan tachadas en vez de
borradas, por lo mismo que los requisitos. El detalle del razonamiento original está en
[`revision/incidencias-detectadas.md`](revision/incidencias-detectadas.md).

| Id | Decisión | Estado |
|---|---|---|
| ~~DP-01~~ | Quién asigna `id_catalogacion` | **Resuelta** en [ADR-003](decisiones/ADR-003-asignacion-del-identificador.md): la base, con un *trigger* y un cerrojo por fondo |
| ~~DP-02~~ | Formato de `id_imagen` | **Resuelta al construir**, sin ADR porque no lo necesitaba: `<id_catalogacion>_v<n>`, correlativo por obra, asignado por la base con su cerrojo igual que `id_catalogacion` y con una restricción que comprueba el formato |
| ~~DP-06~~ | Nomenclatura de los ficheros de imagen con tres niveles | **Resuelta al construir**: `<id_catalogacion>/<id_catalogacion>_<sufijo>_<nivel>.webp`, con `min`, `der` y `master` como niveles. El sufijo aleatorio evita que sustituir una toma reutilice una ruta que algún caché ya tiene |
| ~~DP-07~~ | Dónde vive el estado del bloqueo de edición | **Sin objeto**: el bloqueo se retira (9.1) |
| ~~DP-10~~ | Licencia | **Resuelta**: MIT (`LICENSE`), la misma que la otra aplicación del equipo. Las obras del catálogo quedan explícitamente fuera, y la distinción está escrita en el README |
| DP-08 | Si los campos Sí/No de fase 1 (`tiene_marco`, `requiere_restauracion`, `requiere_reenmarcacion`) necesitan un tercer valor «Sin revisar», por coherencia con RF-205 | Abierta, y **decidible cuando esos campos se construyan**: hoy no existen |
| DP-09 | **Formato del máster fotográfico**: JPEG a máxima calidad, RAW o TIFF. Criterio archivístico, no de infraestructura. Debe decidirse **antes de fotografiar en serie**: reconvertir miles de archivos después no recupera lo que el JPEG ya descartó | Abierta, y es la única que bloquea trabajo de campo |
| DP-03 | Si `clave_bibtex` sigue siendo clave primaria o pasa a campo único con clave técnica detrás | **Ya decidida por ADR-007** en lo esencial: toda tabla maestra lleva clave sustituta. Queda por decidir solo cuando exista Bibliografía |
| DP-04 | Taxonomía cerrada de `agrupacion` y de `etapa` | Abierta y sin prisa: texto libre hasta que haya volumen. Los campos todavía no existen |
| DP-05 | Si el catálogo online será una web por autor o conjunta | **Retirada de esta lista**: es una decisión de un producto fuera de alcance, y no bloquea nada de la aplicación |
