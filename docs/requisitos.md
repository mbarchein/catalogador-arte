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
| RF-114 | **Ningún fichero se trae al dispositivo sin que alguien lo pida, y lo que se pide dice de antemano lo que cuesta.** El peso va en el propio control que ofrece el fichero, no en una nota al pie: un máster llega a 19 MB y se descarga de pie en un almacén con datos móviles, así que «nada se descarga sin pedirlo» solo significa algo si al pedirlo se sabe cuánto se va a gastar. Cuando el tamaño no consta se dice que no consta, nunca cero — un fichero de tamaño desconocido y un fichero vacío no son lo mismo. Este requisito se escribió al auditar: el criterio ya lo aplican la descarga de fotografías y la de documentos, y el número lo puso el código antes que este documento, que es de dónde sale que caiga en este grupo y no junto a RF-411. |

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
| RF-217 | **Extiende RF-212.** Una relación entre dos obras lleva **de qué clase es** —pareja, políptico, estudio previo, versión, reverso catalogado aparte, copia de una obra destruida—, porque «AR-0012 relacionada con AR-0013» no se lee igual ni se cita igual en esos seis casos. La clase es vocabulario que la investigación amplía (RF-216), y cada entrada lleva además **su etiqueta inversa y si es simétrica**, que es lo que permite que la ficha de la segunda obra diga «obra final de AR-0012» sin que nadie haya escrito una segunda fila. Una relación simétrica es una sola fila y da igual el orden en que se nombren las dos obras; una asimétrica no admite su pareja al revés, porque «A es estudio previo de B» y «B es estudio previo de A» no pueden ser ciertas a la vez. Ninguna clase en uso cambia de simetría: las simétricas están guardadas en un solo sentido y las asimétricas no, y mezclar las dos convenciones dejaría entrar la misma pareja dos veces. |
| RF-218 | **«Sin revisar» no es «no hay», y de un bloque documental entero tampoco.** Cada bloque que se investiga como bloque —procedencia, bibliografía, historial expositivo y documentación— dice si está pendiente, si se investigó y no hay nada, o si tiene contenido. Una obra sin exposiciones registradas no es una obra que no se expuso: es una obra cuyo archivo nadie ha mirado todavía, y la ficha no puede presentar las dos como el mismo hueco (RF-304). El estado y las filas **no pueden contradecirse**: no se declara un bloque investigado sin resultado cuando ya tiene filas debajo, ni se añade —ni se restaura— una fila en un bloque declarado sin resultado. Las relaciones entre obras **no** son uno de esos bloques y no tienen estado: no se investigan, aparecen mientras se cataloga la pieza de al lado, y «esta obra no tiene relaciones» es algo que ninguna búsqueda cierra nunca. |

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

### RF-500 · Catálogo razonado documental: procedencia, exposiciones, bibliografía y archivo

RF-501 a RF-507 son la capa histórica: lo que los documentos originales pedían de las dos tablas de
exposiciones y bibliografía. **RF-508 a RF-517 se escribieron después del código, al auditarlo**, por
lo mismo que RF-1500: las migraciones `20260804090000` a `20260804140000` y sus seis tests los citaban
y en este documento no existía ninguno. Son el catálogo razonado documental completo —personas e
instituciones, procedencia, exposiciones, bibliografía y archivo—, que es la mitad del propósito del
proyecto (apartado 1) y que hasta el 4 de agosto de 2026 no existía en absoluto.

| Id | Requisito |
|---|---|
| RF-501 | La participación de una obra en una exposición se registra en la tabla puente Obra_Exposicion, con `nota_obra_en_expo` para el número histórico en catálogo y las circunstancias de esa participación concreta. **Revisado por RF-513**: el número de catálogo sale de la nota y pasa a columna propia. |
| RF-502 | El historial expositivo se presenta en orden cronológico ascendente con el formato `[año], [fecha_inicio–fecha_fin], [titulo_exposicion en cursiva], [institucion], [lugar]`, idéntico en la ficha de obra y en el listado de exposiciones. |
| RF-503 | El catálogo de una exposición no tiene tabla propia: se da de alta en Bibliografía y se enlaza desde `referencia_catalogo` de la exposición. |
| RF-504 | La cita de una obra en una referencia se registra en Obra_Bibliografia, manteniendo `paginas` como campo estructurado independiente de `notas`, por ser dato citable de forma exacta. |
| RF-505 | La ficha de exposición incluye un bloque «Obras participantes» con miniatura, `id_catalogacion` enlazado y `nota_obra_en_expo` de cada fila. |
| RF-506 | La ficha bibliográfica incluye un bloque «Obras citadas» con `id_catalogacion` enlazado y `paginas`/`notas`, sin miniatura. |
| ~~RF-507~~ | La tabla Bibliografía debe poder exportarse a un archivo `.bib` reutilizable por biblatex, con `clave_bibtex`, `autor`, `editor`, `titulo` y `año` como campos independientes. |
| RF-508 | Personas e instituciones son **una sola ficha y no dos tablas**. La mitad de los datos son los mismos —contacto, estado del contacto, localidad, país— y partirlos obligaría a consultar dos sitios para componer una línea de procedencia; y una colección familiar se convierte en fundación sin dejar de ser el mismo eslabón de la cadena, mientras que con dos tablas ese cambio sería dar de baja una ficha y crear otra, que es justo lo que este proyecto no hace nunca (RF-901). La distinción entre persona e institución **no admite «Sin revisar»**, y es una excepción consciente a RF-205 con el argumento de RF-203: de ese valor depende cómo se redacta la línea publicable —«Colección privada, España» frente a los créditos de una institución pública—, y un dato del que depende la redacción no puede quedar pendiente. La misma ficha es propietaria de unas obras, depositaria de otras, sede de una exposición y titular de derechos de una tercera, así que su nombre se corrige en un sitio y lo ve el catálogo entero (RF-216, [ADR-007](decisiones/ADR-007-claves-sustitutas-en-las-tablas-maestras.md)). |
| RF-509 | **La procedencia es una cadena de eslabones fechados y ordenados, no un campo.** Cada eslabón dice quién tuvo la obra, en qué calidad la tuvo, cómo llegó a sus manos y entre qué años, y el orden de la cadena lo fija la catalogadora y no las fechas: una procedencia real tiene tramos sin fecha que aun así se saben anteriores a otros. Reordenar la cadena es una operación de todo o nada, para que no quede a medias. No se guarda además un campo de «situación legal» al lado: en qué calidad se tiene la obra es la calidad del último eslabón y cómo llegó es su forma de adquisición, y un campo suelto que puede contradecir a la cadena que tiene al lado sobra. |
| RF-510 | La procedencia tiene además un **relato narrativo que es la redacción publicable**. Cuando tiene texto, es lo que la ficha imprime; cuando está vacío, la ficha compone la línea con los eslabones. Es la misma jerarquía que [ADR-004](decisiones/ADR-004-fecha-estructurada.md) fijó para la fecha: la estructura alimenta la búsqueda y la prosa manda al publicar, porque la prosa de un catálogo razonado no se puede generar. |
| RF-511 | El **titular de los derechos de reproducción** de una obra es una relación con una persona o institución, no un texto, y puede no ser quien posee la obra. Una persona o institución que sostiene una cadena de procedencia activa, que es titular de derechos o que está detrás de una sede de exposición activa **no se retira**: retirarla dejaría eslabones apuntando a un nombre que la aplicación ya no enseña. |
| RF-512 | La **sede de una exposición** es una entrada de vocabulario con clave propia, no los dos textos sueltos —lugar e institución— de los documentos originales: con dos textos, corregir el nombre de un museo es tocar todas sus exposiciones. Y **no es el árbol de lugares** de [ADR-006](decisiones/ADR-006-ubicacion-como-arbol-de-lugares.md), aunque las dos contesten «dónde»: aquel contesta dónde está la obra hoy y sus nodos contienen cosas; una sede contesta dónde ocurrió una muestra en 1985, es histórica —una sala que cerró en 1988 tiene que seguir existiendo para siempre— y no contiene nada. Fundirlas pondría «Balda 2» en el selector de sedes y el Museo del Prado en el árbol del almacén. Tampoco se crea un código visible de exposición: a diferencia de `catalog_id` no está impreso en nada ni pegado a ningún objeto del mundo. |
| RF-513 | El **número con el que la obra apareció en el catálogo o las cartelas de esa muestra** («12 bis», «s/n») es columna aparte de la nota de la participación, con el mismo criterio por el que `paginas` no se fundió en RF-504: es dato citable de forma exacta y de uso recurrente —«cat. 12 bis» se cita en el ensayo del catálogo razonado— y dentro de la prosa no se puede buscar ni filtrar. Revisa RF-501. |
| RF-514 | Los **tipos de publicación son vocabulario abierto** que la usuaria amplía sin desplegar nada, no una lista cerrada de cuatro valores: libro, artículo, catálogo y prensa no aguantan el primer mes de investigación real —tesis doctoral, catálogo de subasta, entrada de blog, programa de radio, folleto—. Es el caso de los tipos de obra sin adaptación ninguna (RF-216, ADR-007). Y la referencia lleva el **nombre de la publicación que contiene el artículo** como dato aparte del título: sin él, el nombre de la revista acaba dentro del título y la cita no se puede componer. |
| RF-515 | Los **tipos de documento son vocabulario abierto** por lo mismo que los de publicación, y la **clasificación archivística es un árbol** —fondo, serie, subserie— y no una jerarquía metida dentro de un texto con una convención que hay que recordar. Es el error que este proyecto ya pagó una vez con la ubicación física y que ADR-006 resolvió; aquí cuesta cero evitarlo porque no hay ni un documento catalogado. Nace opcional: si la clasificación archivística no se adopta nunca, se queda vacía y no estorba. La **ubicación física de un documento es el mismo árbol de lugares que la de las obras**: una caja de cartas está en el mismo edificio que los cuadros y un segundo árbol para lo mismo sería la duplicación que ADR-006 vino a quitar. El artista de un documento **no es obligatorio**: un recorte sobre una colectiva de los dos, o un documento de contexto que no es de ninguno, no puede elegir. |
| RF-516 | La relación de un documento del archivo con las obras y con las exposiciones es **de muchos a muchos**, no una referencia única: un recorte de prensa que menciona tres obras no puede obligar a triplicar la ficha y con ella el PDF subido, que es el caso normal y no el raro. Y no se guarda una marca de «digitalizado» al lado del fichero: digitalizado es que el fichero esté, y una bandera que puede contradecir al fichero que tiene al lado es una bandera que un día miente. |
| RF-517 | **Revisa RF-903.** Nada se borra tampoco en las tablas puente: una participación, una cita, un vínculo de documento y una relación entre obras **se retiran**, y volver a crear la que estuviera retirada la restaura con lo que llevaba dentro en vez de fallar. La premisa de RF-903 —«no tienen etiqueta física ni número citable y basta con volver a crearlas»— deja de sostenerse en cuanto la participación lleva el número de catálogo de RF-513 y la cita lleva sus páginas: volver a crearla no es gratis, es volver a investigarla. Estas filas **no entran en la papelera** de RF-906, que es de las fichas con identificador propio: se restauran desde la ficha de la que cuelgan, y por eso guardan quién y cuándo retiró pero no el último ciclo completo. |

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
| RF-903 | **Revisado por RF-517, y hoy dice lo contrario de lo que se construyó.** Pedía que las tablas puente (Obra_Exposicion, Obra_Bibliografia) no tuvieran papelera y se borraran directamente, «ya que no tienen etiqueta física ni número citable y basta con volver a crearlas». Las cinco tablas puente del esquema se retiran como todo lo demás, y **no puede ser de otra manera**: «nunca un borrado real» es criterio de diseño del proyecto, ninguna tabla tiene política ni privilegio de `delete`, y el test de cierre por omisión lanza excepción ante *cualquier* política de `delete` en el esquema — de modo que construir RF-903 tal como está escrito pondría un fichero en rojo. El argumento está en RF-517. |
| RF-904 | La baja no se propaga hacia arriba: dar de baja una imagen no afecta a la obra, y dar de baja una participación no afecta ni a la obra ni a la exposición. |
| RF-905 | La baja se propaga hacia abajo, a lo que solo existe en función de la ficha dada de baja: al dar de baja una obra dejan de mostrarse sus imágenes y sus filas de participación y de cita; al dar de baja una exposición o una referencia dejan de mostrarse sus filas puente. **La última frase está revisada por lo construido, y conviene saber cómo.** Decía que serie y propietario dados de baja dejan el campo vacío en las obras que los tenían asignados; lo que hace el esquema es **no dejar que se retiren**: ni una serie con obras activas dentro, ni un tipo de obra que usan obras activas, ni una persona o institución que sostiene una cadena de procedencia activa, que es titular de derechos o que está detrás de una sede de exposición activa (RF-511). Es una respuesta más fuerte —vaciar el campo pierde el dato, y quien retiró la serie no quería tocar cincuenta obras—, y deja un caso residual sin resolver: una serie cuyas únicas obras están en la papelera **sí** se retira, y esas obras siguen apuntando a ella. Medido el 4 de agosto de 2026. |
| RF-906 | La página «Papelera» sigue el patrón del resto de índices: filtrable por tabla de origen, por fecha de baja y por usuario que la ejecutó, con buscador de texto libre. Cada fila muestra identificador, resumen mínimo, fecha y usuario de baja, y un botón «Restaurar». Acceso reservado al Catalogador. |
| RF-907 | No hay periodo de gracia ni purga automática: las fichas de baja permanecen indefinidamente hasta que el equipo decida restaurarlas. |
| RF-908 | La reutilización de un identificador retirado se resuelve restaurando la ficha y editando después sus campos, salvo la clave primaria. El sistema no distingue si la restauración corrige un error o recicla el número. |
| RF-909 | La aplicación no detecta altas duplicadas de forma automática: los duplicados se resuelven por revisión del equipo apoyada en las herramientas de búsqueda. |
| RF-910 | Lo que RF-905 propaga es la **visibilidad**, no el dato: la fila que cuelga de la ficha dada de baja no se retira, deja de verse mientras su ficha no se vea. Así, restaurar la ficha devuelve su expediente entero y en el estado en que estaba, y sigue distinguiéndose lo que alguien retiró a mano de lo que se dejó de ver con su ficha. La ocultación no puede depender de que la consulta recuerde filtrar, porque no hay servidor propio: se decide en la base y vale para cualquier forma de preguntar. |
| RF-911 | Una fila que une dos fichas se ve si se ven **las dos**, no una: sin el otro extremo no es un dato, es un hueco —una página sin la referencia a la que pertenece—, y en el caso de dos obras relacionadas enseñarla delata la existencia de la obra oculta. Las dos obras de una relación son extremos intercambiables y ninguno es el principal. |
| RF-912 | Un documento del archivo, que puede documentar varias obras y varias exposiciones a la vez, **conserva su propia ficha visible**: lo que desaparece es su vínculo con la obra dada de baja. Con la obra de baja y la exposición activa, el documento sigue en el expediente de la exposición y deja de nombrar la obra. Lo contrario vaciaría el expediente de una muestra ajena al retirar una obra, y haría depender el estado de una ficha compartida del de su vecina. |
| RF-913 | Nada de lo anterior alcanza al Catalogador: en la papelera ve la ficha y su expediente completo, que es la única forma de restaurar con lo que había dentro (RF-906). |

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

### RF-1400 · Enlaces a sitios externos

Hoy una dirección web que documenta una obra solo tiene un sitio donde caber: dentro de una nota. Ahí
no se puede pulsar, no se puede buscar, no se puede comprobar y no se puede atribuir a la fotografía
que salió de ella. Y no es hipotético: **dos notas de inventario del catálogo real llevan dentro la
dirección de la ficha de museo de la que se tomaron todos los datos, imagen incluida.**

Estos requisitos también se escribieron **después** del código, al auditarlo: las migraciones
`20260805100000` y `20260805110000` y sus dos tests citaban RF-1401 a RF-1408 y este documento no
tenía el grupo.

| Id | Requisito |
|---|---|
| RF-1401 | Una dirección web que documenta una ficha es **un dato propio y no un trozo de prosa**: se pulsa, se busca, se clasifica, se comenta y se comprueba. Cada enlace cuelga de **exactamente una** ficha —hoy una obra o una fotografía—, ni de ninguna ni de dos: un enlace sin ficha no es un enlace pendiente de colocar, es basura invisible que nadie volverá a ver. Y no es un documento del archivo: de un documento somos custodios —vive en el almacén privado, se sirve firmado (RF-110) y se le aplica la regla 3-2-1 (RNF-112)—, mientras que un enlace es contenido de un tercero que puede cambiar, mudarse o desaparecer sin avisar, del que no se puede hacer copia de seguridad y cuyo ciclo de vida es la caducidad. |
| RF-1402 | Un enlace lleva **la clase de sitio al que apunta** —museo, catálogo en línea, base de datos de arte, prensa, vídeo, sitio del artista, de dónde salió una reproducción, u otro— y **«sin clasificar» no es «se miró y no encaja»**: es la misma distinción de RF-205 aplicada aquí. El título es opcional: exigirlo al pegar una dirección rompe la captura de una mano (RNF-106). |
| RF-1403 | La dirección **se valida**, y con una lista de lo permitido y no de lo prohibido: los esquemas admitidos y la forma del nombre del sitio. La regla vive **en un solo lugar, la base de datos**, y la interfaz la usa para explicar el rechazo en español en vez de escribir su propia copia — una segunda copia de la regla en el cliente es una regla que se queda atrás. Validar no es comprobar que el sitio exista: eso no se puede hacer desde una restricción. |
| RF-1404 | **Requisito negativo.** La aplicación no trae nada del sitio enlazado: ni rastreador que compruebe enlaces por su cuenta, ni icono, ni título, ni previsualización, ni instantánea propia guardada en el almacén, ni acortadores generados ni resueltos. Cada una de esas cosas le contaría a un tercero qué obra se está catalogando y desde qué dirección, y convertiría un enlace en contenido incrustado. Un acortador además esconde a dónde lleva el enlace, que es lo contrario de RF-1408. Si de verdad hace falta conservar una página, la respuesta del esquema ya existe: imprimirla a PDF y darla de alta como documento de archivo. Sí se puede anotar la dirección de una copia que **una persona** guardó en un archivo público. |
| RF-1405 | **La comprobación de un enlace la hace una persona, y la sella la base de datos.** Tres resultados y no dos: funciona, **ha cambiado** —la página carga pero ya no muestra lo que documentaba, que es justo lo que ningún rastreador detectaría— y ya no está. El cuarto estado es la ausencia: **sin comprobar no es roto.** La fecha y el autor de la comprobación los pone la base y no el cliente: una fecha que llegara del teléfono valdría lo que su reloj. El resultado y su fecha van juntos o no van —una fecha sin resultado no dice nada y un resultado sin fecha no se puede envejecer en pantalla—, y volver a «sin comprobar» limpia las tres cosas a la vez. Un formulario que reenvía la fila entera no mueve la comprobación por accidente. |
| RF-1406 | Un enlace **se retira, no se borra** (RF-901), y volver a añadir el mismo que se retiró es una operación legítima que lo devuelve. La misma dirección no se repite dos veces activa en la misma ficha, y sí puede estar en otra ficha: dos obras documentadas por la misma página son dos enlaces, cada uno con su nota. No entra en la papelera de RF-906: es una fila subordinada, como una fotografía, y se restaura desde la ficha de la que cuelga. |
| RF-1407 | **Una reproducción dice de dónde salió.** El enlace puede colgar de una fotografía y no solo de una obra, que es lo que cierra el par con RF-417: una toma registrada como tomada de otro catálogo *y* la dirección de la página de la que se tomó. Sin las dos mitades, «esta fotografía no es nuestra» es una advertencia sin destino. |
| RF-1408 | Cuando un enlace no tiene título, la interfaz muestra **el dominio y nunca la dirección entera**: en la pantalla de un móvil una dirección larga ocupa tres líneas y no dice nada, y el dominio dice a dónde lleva, que es la única pregunta que se hace antes de pulsar. Nunca un hueco (RF-304). |

### RF-1500 · Registro de cambios de obras y fotografías

Hoy una ficha dice **cuándo** se tocó por última vez y **quién** la tocó (RF-800), y nada más. No
dice qué cambió, ni desde qué valor, ni cuántas veces. Con dos personas catalogando durante años,
«¿esta obra siempre midió 45 cm o alguien la corrigió?» es una pregunta que hoy no tiene respuesta y
que dentro de cinco años la va a tener alguien que no estaba.

Estos requisitos se escribieron **después** del código, al auditarlo: las migraciones
`20260805120000` y `20260805140000` y sus tests citaban RF-1501 a RF-1508 y en este documento no
existía ninguno de los dos bloques. La numeración arranca en 1500 y no en 1400 porque los
identificadores no se renumeran y así se conservan las citas ya escritas en el SQL; RF-1509 a
RF-1512 son los cuatro criterios que estaban implícitos en el código y no tenían requisito.

| Id | Requisito |
|---|---|
| RF-1501 | Existe un **registro de cambios** de las obras y de sus fotografías, para auditoría. Es informativo: contesta qué cambió, desde qué valor y quién lo hizo. |
| RF-1502 | La granularidad es **por campo**: una fila por cada columna que cambia, con su valor anterior y su valor nuevo en la representación **almacenada** (el código del enumerado, no su etiqueta; `54.00`, no «54 cm»). Los campos cambiados en un mismo guardado comparten un identificador de operación, para que la interfaz reconstruya la acción del usuario. Nulo significa que la columna valía nulo, que es un dato y no una ausencia de dato. |
| RF-1503 | Se anota el **alta** de la ficha (una sola línea, sin campo), el **cambio**, la **retirada** y la **restauración**, cada uno con su verbo. Se anota siempre **quién**, tomado de la sesión y no de lo que manda el cliente; sin sesión de aplicación —una migración, un acceso administrativo— el autor es nulo, que es la verdad. |
| RF-1504 | **El registro no lo escribe nadie salvo la base de datos, y no se modifica ni se borra nunca.** Ni el Lector, ni el Catalogador, ni el Superusuario, ni la clave de servicio tienen `insert`, `update` o `delete`. Un registro de auditoría que el auditado puede editar no es un registro de auditoría, y uno al que se le pueden **añadir** líneas inventadas está tan roto como uno al que se le pueden quitar las verdaderas. La protección es de dos capas en serie (RF-113): el privilegio revocado y, para los roles que se saltan la RLS, un candado que rechaza `update`, `delete`, `truncate` y toda inserción que no venga del propio mecanismo de la base. |
| RF-1505 | **El registro no es reversible y no se construye ningún «deshacer».** Ni función, ni pantalla, ni botón, ni nada que sea el sustrato cómodo de una: nada que lea el registro y escriba en el catálogo. La copia de seguridad es el volcado periódico (RNF-113), no el registro — que por diseño no guarda las columnas derivadas ni los ficheros del almacén, así que una restauración a partir de él dejaría la ficha a medias. Si algún día aparece un camino de vuelta, es un error y no una mejora. |
| RF-1506 | La lectura del registro **hereda la visibilidad de la ficha auditada**, y no la copia: el Lector ve la historia de las obras y las fotografías activas, y no sabe siquiera que existe la de una ficha retirada (RF-609); el Catalogador ve la de todo, papelera incluida (RF-913). |
| RF-1507 | **No se purga ni caduca nada**, y no hay ningún interruptor para silenciar el registro, ni siquiera durante una migración. Si algún día el volumen lo exigiera, la respuesta prevista no es borrar, sino trasladar lo más antiguo a un archivo con exactamente los mismos privilegios y los mismos candados. |
| RF-1508 | La traducción al español de los nombres de campo y de los valores es tarea de la **interfaz**. El registro guarda el nombre de la columna tal como está en el esquema. |
| RF-1509 | El registro anota **lo que cambió una persona**, no las consecuencias automáticas de que algo cambiara: quedan fuera las marcas de traza de RF-800 y RF-902 —fecha y autor de actualización, fecha básica, y el sello de retirada y restauración— y las columnas derivadas de otras. Anotarlas convertiría cada corrección de una errata en varias líneas, la mayoría sin información, y el historial de una ficha con doscientos cambios tendría más ruido que contenido. **La retirada y la restauración sí se anotan**: lo que se descarta es el sello redundante que las acompaña, no el cambio. |
| RF-1510 | **Un guardado que no cambia nada no escribe ninguna línea.** Es el caso normal de un formulario que se guarda sin haber tocado nada, y del envío del objeto entero desde el cliente. Un registro lleno de cambios vacíos es un registro que nadie lee, y uno que nadie lee no sirve para auditar. |
| RF-1511 | El registro **empieza donde empieza el registro**: las fichas anteriores no reciben líneas retroactivas. Lo único que se podría escribir con verdad sería un autor desconocido y la fecha de hoy, o sea una línea que afirma algo falso. Inventar historia para que un historial no empiece vacío es la clase de falsificación que este registro existe para impedir, y da igual que la escriba una migración de buena fe. |
| RF-1512 | El registro captura **todos los caminos de escritura**, no solo el de la aplicación: da igual que el cambio venga de la PWA, de un cliente que se salte la interfaz, de un acceso administrativo, de una función que se salte las políticas o **de otro mecanismo automático de la base**. Un cambio que la base se hace a sí misma sobre una ficha —recalcular si una obra tiene fotografías, por ejemplo— es un cambio de la ficha para quien lea la historia, y se anota con el autor de la sesión que lo provocó. Por eso el registro no lo escribe el cliente: si lo escribiera, la historia sería «lo que el cliente quiso contar» y no habría forma de distinguirla de la verdad. |

### RF-1600 · Dossier

Mandar obras a una galería es un trabajo que ya se hace fuera de la aplicación: se descargan fotos a una
carpeta, se pegan en un documento y se escriben las medidas a mano. Rehacerlo quitando dos obras es
volver a empezar, y del documento que se mandó en marzo no queda constancia de qué llevaba.

El bloque arranca en 1600 y no en 1513 porque es una función nueva y no un añadido al registro de
cambios. El modelo, y por qué no es una búsqueda guardada ni un precio en la ficha de la obra, está en
[ADR-011](decisiones/ADR-011-el-dossier.md).

| Id | Requisito |
|---|---|
| RF-1601 | Un **dossier** es una ficha con nombre propio que reúne obras del catálogo en un orden elegido, para mandarla a una galería o para cualquier otro uso. Tiene título, para qué es y una nota, y opcionalmente a quién va, tomado de la tabla de personas y entidades que ya existe. Hay tantos como haga falta y a la vez. |
| RF-1602 | El dossier es **una lista ordenada de elementos**, y un elemento es **una obra o un texto libre**. Las obras se **enumeran, no se consultan**: lo que se guarda son las obras elegidas, no el criterio con el que se encontraron. Buscar y filtrar es la manera de llegar a ellas; dar de alta una obra nueva después no la mete en ningún dossier. |
| RF-1603 | El **orden lo decide la usuaria** y es parte del dossier. Es **un solo orden** para las obras y los textos, porque un párrafo va entre dos obras concretas. Se reordena moviendo elementos y se guarda **la lista entera de una vez o ninguna**, como el orden de las fotografías de una obra: dos elementos no pueden ocupar la misma posición. |
| RF-1604 | Cada obra del dossier lleva su **nota** y, opcionalmente, su **precio con moneda**. El precio es **del dossier y no de la obra**: el catálogo no afirma ningún precio, y la misma obra puede ofrecerse distinto en dos sitios. Cada dossier decide si los precios se enseñan. |
| RF-1605 | Cada obra del dossier usa **la fotografía representativa de la obra** salvo que se fije una toma concreta. Sin fijar, cambiar la fotografía principal de la obra cambia también lo que enseña el dossier, que es lo que se quiere. |
| RF-1606 | El dossier decide **qué bloques enseña**: procedencia, historial expositivo, bibliografía y precios. Una galería quiere el historial; un seguro, las medidas y el estado. |
| RF-1607 | Del dossier se **emite un PDF**, que se genera en el dispositivo y se guarda en el catálogo con su **versión** —la primera, la segunda…—, su fecha y quién la emitió. Una versión emitida **no se reescribe ni se borra nunca**: el fichero ya está en el correo de otra persona. Corregir es emitir la siguiente. |
| RF-1608 | El dossier guarda **referencias vivas a las obras**, de modo que emitir otra vez lo hace con los datos de hoy: corregir una medida en la ficha corrige el dossier sin tocarlo. Las dos preguntas que se hacen —«mándalo otra vez al día» y «qué le mandé en marzo»— las contestan las referencias vivas y los PDF emitidos, cada una la suya. |
| RF-1609 | El PDF lleva la **imagen de consulta ya corregida**, no la copia a resolución completa: es la imagen buena a un tamaño que imprime bien en una página y que cabe en un correo. Doce copias a resolución completa son cientos de megabytes y no se pueden mandar. |
| RF-1610 | El dossier es **del equipo**: lo ve quien puede consultar el catálogo y lo cambia quien puede editarlo. No hay dossieres privados de una persona, porque un dossier que solo ve quien lo hizo se rehace cuando esa persona no está. |
| RF-1611 | **No hay enlace público.** Lo que sale de la aplicación es un fichero, y quien lo manda decide a quién (RF-101). |
| RF-1612 | Un dossier se **retira y se recupera** como cualquier ficha, con su traza (RF-901, RF-902), y quitar una obra de un dossier también: volver a añadir la misma obra **recupera** su nota y su precio en vez de crear una línea nueva. |
| RF-1613 | Una obra **retirada del catálogo** no desaparece en silencio de los dossieres que la llevaban: aparece dicha como retirada a quien edita, no se le muestra a quien solo consulta (RF-609) y no sale en el PDF. Estuvo en el documento que se mandó, y eso es un dato. |
| RF-1614 | El dossier admite **textos libres** en cualquier punto de la lista: un **rótulo** que abre sección, un **párrafo**, o los dos. Además tiene un texto de **portada**, que es una página y no algo que fluya entre obras. Un texto sin rótulo ni párrafo es un hueco y no se guarda. El texto es texto: no hay lenguaje de marcado, negritas ni editor con formato — lo que hace legible la página es la maqueta. |
| RF-1615 | Se distingue lo que **va al PDF** de lo que es **recado del equipo**: la portada y los textos libres se imprimen; la nota del dossier y la nota de cada obra no. Poder anotar lo que no se le dice a la galería es la mitad del valor de tener las dos. |

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
| Políticas RLS, privilegios y su batería de tests | Construido: **33 ficheros de test de SQL en verde**, medidos uno a uno el 4 de agosto de 2026, y el cierre por omisión avisa si alguien añade una tabla sin política |
| Esquema: Obras, Imágenes y las tres tablas maestras (tipos de obra, series, lugares) | Construido |
| Esquema: el catálogo razonado documental — personas e instituciones, procedencia, exposiciones y sus sedes, bibliografía, archivo y su clasificación, y las cinco tablas puente | **Construido** el 4 de agosto de 2026 (RF-508 a RF-517). Deja de ser el hueco grande de este documento: las nueve tablas de los originales son hoy **23 tablas y una vista** en el esquema del catálogo |
| Esquema: enlaces a sitios externos | Construido (RF-1400), con las dos direcciones que vivían dentro de una nota ya trasladadas |
| Esquema: registro de cambios de obras y fotografías | Construido (RF-1500), las dos mitades — la tabla inviolable y el mecanismo que la escribe |
| Frontend: acceso, listado con filtros y búsqueda, ficha, edición, captura rápida en móvil | Construido |
| Frontend: los bloques documentales dentro de la ficha de obra (procedencia, bibliografía, historial expositivo, documentación y obras relacionadas) | Construido, con su estado de investigación (RF-218) |
| Frontend: ficha propia de Exposición y su búsqueda (RF-309, RF-606) | **Construida** el 4 de agosto de 2026: listado con buscador, alta, ficha y zona de edición, en la quinta pestaña del menú de abajo. Es la primera de las cuatro fichas propias que existe |
| Frontend: fichas propias de Bibliografía, Documento y Propietario (RF-309), y sus búsquedas dedicadas (RF-606) | **No construido.** Las tablas existen y se leen desde la ficha de obra; lo que falta es la ficha de cada una y su índice. Un documento del archivo, además, no tiene forma de corregir sus datos desde ninguna pantalla |
| Frontend: enlaces a sitios externos | **Construido** (RF-1400): es el sexto bloque de la ficha de obra, se lee en la vista y se escribe en la zona de edición, con la comprobación sellada a mano |
| Frontend: la papelera (RF-901, RF-902) | **Construida** el 4 de agosto de 2026, con su puerta al final de «Tablas». Ver y restaurar; no hay ni habrá borrado definitivo |
| Frontend: pantalla del historial de cambios (RF-1508) | **Construida** como bloque de la ficha de obra: el historial de una obra se lee desde su propia ficha. Lo que no hay es una pantalla del registro entero |
| Fotografías: tres niveles generados en el navegador, orden, imagen índice, giro, recorte, perspectiva y color como dato, y la copia corregida a resolución completa | Construido |
| Ficha imprimible en PDF con QR | Construido |
| Esquema: dossier, sus obras ordenadas y sus emisiones (RF-1600) | **Construido** el 11 de agosto de 2026 ([ADR-011](decisiones/ADR-011-el-dossier.md)), con sus políticas y sus diecinueve comprobaciones. Lo que falta es la pantalla: hoy un dossier solo se puede armar desde la base |
| Vistas en vivo por WebSocket | Construido para obras e imágenes. Las tablas documentales, los enlaces y el registro no se publican |
| Sección «Tablas»: ubicaciones, tipos de obra, series y los vocabularios documentales | Construido. A las tres primeras se sumaron las seis pantallas de los vocabularios nuevos —personas e instituciones, sedes de exposición, tipos de publicación, tipos de documento, tipos de relación y clasificación archivística—, y al final la puerta de la papelera |
| Papelera | **No construida.** La baja lógica está en el esquema, en los *triggers* y en las políticas, y desde el 4 de agosto de 2026 también la visibilidad heredada del expediente (RF-910 a RF-913); lo que falta es la pantalla desde la que ver y restaurar |
| Bloqueo de edición | **Retirado** (9.1) |
| Volcados automáticos de la base de datos | Pendiente. Hoy se lanzan a mano |

Un aviso sobre las cifras de este documento y del plan de pruebas: cualquier número de tests se queda
atrás en cuanto se escribe, así que en el plan van **con la fecha en que se midieron** y lo que vale es
la salida de `make verificar`. Y una trampa medida el 4 de agosto de 2026 que conviene conocer antes de
fiarse de esa salida: `make test` y `make typecheck` se ejecutan **dentro del contenedor de la
aplicación, que solo tiene montado `app/`**, así que el único test que cubre el perímetro de firma de la
función Edge no se puede ni cargar desde ahí y `make typecheck` da error. En integración continua y en
la máquina, con el repositorio entero delante, los dos pasan.

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
| [ADR-011](decisiones/ADR-011-el-dossier.md) · El dossier | Una selección de obras enumerada y ordenada, con el precio en la línea y no en la obra, y un PDF emitido por versión que no se reescribe. Ni búsqueda guardada ni enlace público. Sostiene RF-1600 |

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

### 8.3 Decisiones de esquema que revisan un requisito

Todas del 4 y 5 de agosto de 2026, al construir el catálogo razonado documental. Van aquí y no en el
apartado 9 porque no retiran nada: cambian lo que el requisito decía.

| Requisito histórico | Lo que se construyó, y por qué |
|---|---|
| RF-201 · el modelo consta de nueve tablas | **23 tablas y una vista.** Las nueve de los originales fusionaban en una sola entidad cosas que son varias: la procedencia era un campo y es una cadena de eslabones (RF-509), los vocabularios que la usuaria amplía son tablas maestras con clave propia y no listas cerradas (RF-514, RF-515, RF-217), la sede de una exposición no son dos textos (RF-512) y las dos claves ajenas del documento son dos tablas puente (RF-516). Ninguna tabla nueva es una entidad nueva: son las mismas nueve dichas de forma que se pueda consultar |
| RF-903 · las tablas puente se borran directamente | **Se retiran, como todo lo demás** (RF-517). El argumento completo está en RF-517 y en RF-903; en corto: en cuanto la participación lleva su número de catálogo y la cita sus páginas, «basta con volver a crearlas» deja de ser verdad, y «nunca un borrado real» no admite excepciones que un test tenga que aprender |
| RF-501 · la nota de la participación lleva el número de catálogo | **Columna aparte** (RF-513). Es la fusión que el propio esquema de campos hizo en una versión y deshizo en la siguiente para las páginas, con el mismo argumento: un dato citable de forma exacta no se busca dentro de la prosa |
| RF-205 · todo campo de selección ofrece «Sin revisar» | **Dos excepciones más, con el argumento de RF-203**: la distinción entre persona e institución (RF-508) y la clase de un sitio enlazado, donde «sin clasificar» y «se miró y no encaja» son dos valores distintos y ninguno es «sin revisar» (RF-1402). La regla general no se toca; lo que se añade es que un dato del que depende una redacción no puede quedar pendiente |
| RF-212 · `obras_relacionadas` es una relación múltiple autorreferencial | **Lleva de qué clase es la relación** (RF-217), con su etiqueta inversa y su simetría. Las propias notas de implementación de los originales anticipaban el caso por escrito; aparecieron los seis tipos que decían que podrían aparecer |
| RF-105, RF-103 · el acceso es a las nueve tablas | Sigue valiendo tal cual, y hoy son 23. La frase se lee como «a todo el catálogo», que es lo que decidía |
| RF-905 · serie y propietario de baja dejan el campo vacío | **No se vacía el campo: no se deja retirar** la serie, el tipo de obra o la parte que están en uso (RF-511). Vaciar el campo pierde el dato, y quien retira una serie no está pidiendo tocar las cincuenta obras que la tenían. El caso residual está anotado en RF-905 |

### 8.4 Decisiones que los originales no contemplaban

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

Para que la distinción quede clara: lo que falta **no es sobreingeniería**. Está sin construir, que es
distinto de estar de más.

Las cuatro tablas que este apartado defendía —Exposiciones, Bibliografía, Propietarios/Instituciones y
Archivo/Documentación— **ya están construidas** desde el 4 de agosto de 2026, con su procedencia, sus
vocabularios y sus cinco tablas puente (RF-508 a RF-517), y sus bloques ya se ven y se editan dentro de
la ficha de obra. De las **fichas propias** (RF-309, RF-606), la de **Exposición ya está** desde el 4 de
agosto de 2026, con su índice y su buscador. Lo que sigue sin construir de ese frente son las de
Bibliografía, Documento y Propietario: hoy una referencia se lee desde la obra y no tiene página adonde
llegar, y un documento del archivo no tiene ninguna pantalla que corrija sus datos.

Y de la **papelera**, que era la contrapartida de que nada se borre nunca y el pendiente más viejo de
este documento, **ya está la pantalla**: se abre desde «Tablas», enseña lo retirado con la traza de
quién y cuándo, y lo devuelve a su sitio. Sigue sin haber borrado definitivo, y eso no es un hueco sino
la decisión. De la **pantalla del historial de cambios** (RF-1508) está la mitad que se usa a diario: el
historial de una obra se lee desde su ficha. Lo que no hay es una pantalla del registro completo, que
sería por dónde mirar «qué se ha tocado hoy en el catálogo» sin partir de una obra concreta.

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

Desde DP-11 la lista recoge también **discrepancias descubiertas al construir**: un sitio donde el
esquema hace dos cosas distintas con la misma pregunta es una decisión pendiente aunque nadie la
plantease, y escribirla aquí es más barato que volver a encontrarla.

| Id | Decisión | Estado |
|---|---|---|
| ~~DP-01~~ | Quién asigna `id_catalogacion` | **Resuelta** en [ADR-003](decisiones/ADR-003-asignacion-del-identificador.md): la base, con un *trigger* y un cerrojo por fondo |
| ~~DP-02~~ | Formato de `id_imagen` | **Resuelta al construir**, sin ADR porque no lo necesitaba: `<id_catalogacion>_v<n>`, correlativo por obra, asignado por la base con su cerrojo igual que `id_catalogacion` y con una restricción que comprueba el formato |
| ~~DP-06~~ | Nomenclatura de los ficheros de imagen con tres niveles | **Resuelta al construir**: `<id_catalogacion>/<id_catalogacion>_<sufijo>_<nivel>.webp`, con `min`, `der` y `master` como niveles. El sufijo aleatorio evita que sustituir una toma reutilice una ruta que algún caché ya tiene |
| ~~DP-07~~ | Dónde vive el estado del bloqueo de edición | **Sin objeto**: el bloqueo se retira (9.1) |
| ~~DP-10~~ | Licencia | **Resuelta**: MIT (`LICENSE`), la misma que la otra aplicación del equipo. Las obras del catálogo quedan explícitamente fuera, y la distinción está escrita en el README |
| DP-08 | Si los campos Sí/No de fase 1 (`tiene_marco`, `requiere_restauracion`, `requiere_reenmarcacion`) necesitan un tercer valor «Sin revisar», por coherencia con RF-205 | Abierta, y **decidible cuando esos campos se construyan**: hoy no existen |
| DP-09 | **Formato del máster fotográfico**: JPEG a máxima calidad, RAW o TIFF. Criterio archivístico, no de infraestructura. Debe decidirse **antes de fotografiar en serie**: reconvertir miles de archivos después no recupera lo que el JPEG ya descartó | Abierta, y es la única que bloquea trabajo de campo |
| ~~DP-03~~ | Si `clave_bibtex` sigue siendo clave primaria o pasa a campo único con clave técnica detrás | **Resuelta al construir Bibliografía** el 4 de agosto de 2026, ejecutando lo que ADR-007 ya había decidido: la clave es sustituta y la clave BibTeX es una columna única, **opcional y editable**. Opcional porque una referencia se da de alta mientras se investiga y la clave de cita se inventa al publicar, y editable porque una clave de cita se corrige |
| DP-11 | **Conviven dos formas de política de lectura, y hay que decidir si se unifican.** Las tablas construidas desde agosto de 2026 esconden al Lector lo retirado —«está activa y puede leer, o puede editar»— y las tres maestras más antiguas (tipos de obra, series y lugares) solo preguntan si puede leer, así que el Lector ve también sus entradas retiradas. No es una fuga de datos de nadie: son nombres de vocabulario del propio estudio, no el dato personal de un tercero de RF-105. Lo que sí hace es **contradecir RF-609** y, sobre todo, responder la misma pregunta de dos maneras según la antigüedad de la tabla, que es exactamente cómo esto se vuelve a descubrir desde cero dentro de un año | Abierta, y **no urgente: no se cambia el comportamiento de las tres viejas**, que llevan meses desplegadas y funcionando. Medido el 4 de agosto de 2026 con la sesión de un Lector de verdad: ve los **22** lugares, **2 de ellos retirados**, y los 6 tipos de obra y las 9 series, hoy ninguno retirado. Si se decide unificar, hace falta una migración propia que reescriba las tres políticas y sus tests, y **antes de nada** mirar qué pantallas leen esos vocabularios al editar una obra que sí usa una entrada retirada: cambiarlo a ciegas puede dejar sin nombre el tipo de obra de una ficha vieja, que es un fallo peor que el que arregla |
| DP-04 | Taxonomía cerrada de `agrupacion` y de `etapa` | Abierta y sin prisa: texto libre hasta que haya volumen. Los campos todavía no existen |
| DP-05 | Si el catálogo online será una web por autor o conjunta | **Retirada de esta lista**: es una decisión de un producto fuera de alcance, y no bloquea nada de la aplicación |
