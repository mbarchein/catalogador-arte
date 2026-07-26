# Diseño de interfaz y arquitectura — Aplicación web de inventario y catalogación
## Alberto Rotili / María Ruiz Campins

**Versión 4** — 25 de julio de 2026, a partir de conversación de trabajo con Claude (Anthropic). Añade la sección 16, bitácora del primer arranque real del proyecto (Fase 1 completa y arranque de Fase 2 de la hoja de ruta): entorno instalado y verificado, base de datos creada, esqueleto de Django conectado y funcionando, repositorio Git inicializado. Complementa al esquema de campos v11 (`esquema_campos_inventario_v11.md`): mientras aquel documento define **qué datos** se guardan, este define **cómo se construye y se usa la aplicación** que los gestiona.

---

## 1. Stack técnico

**Django + PostgreSQL**, por los siguientes motivos:

- Cada una de las 9 tablas del esquema se traduce en un modelo de Django con fricción mínima, incluidas las relaciones muchos-a-muchos vía tablas puente.
- El panel de administración de Django cubre de fábrica gran parte del "modo Moodle" buscado: formularios, selectores de relación, adjuntos, permisos por usuario/grupo. Sirve como punto de partida y se puede ir sustituyendo por vistas a medida.
- Mismo ecosistema (Python) que el futuro pipeline de catálogo impreso (BD → script Python/Jinja2 → `.tex` → PDF), evitando aprender dos lenguajes distintos.
- Buen soporte documental para el desarrollo asistido por IA de código (Claude Code), dado el perfil del equipo: una persona con nociones básicas de programación, aprendiendo sobre la marcha, con asesoría puntual de un programador externo para revisiones de arquitectura/seguridad.
- Despliegue inicial sencillo (Railway, Render u opción equivalente) sin gestión manual de servidores.

**Almacenamiento de archivos (imágenes y documentos digitalizados):** todo vive dentro de la propia aplicación (almacenamiento gestionado por Django — disco de servidor o bucket en la nube, indistinguible para el usuario), servido solo a usuarios autenticados según su rol. Se descarta la alternativa de un Drive externo con nomenclatura espejo contemplada en el informe inicial: al tener control total del servidor de ficheros, no aporta ventajas y añade una gestión de permisos paralela. Aplica tanto a la tabla "Imágenes" (obras) como al archivo digitalizado de "Archivo/Documentación".

**Convivencia con el servidor Moodle existente:** el equipo dispone ya de una máquina Ubuntu 24.04 (Intel Pentium G4400T, 8 GB RAM, 500 GB disco) donde tiene instalado Apache + PHP + MySQL/MariaDB para experimentar con Moodle. Se decide **empezar en esa misma máquina**, sin plantear un servidor de mayor capacidad todavía — el hardware es suficiente para desarrollo y para un primer uso real con un equipo pequeño. Aislamiento elegido, sin recurrir a Docker por ahora (para no añadir una capa de aprendizaje adicional antes de tocar Django):

- **PostgreSQL se instala aparte de MySQL/MariaDB**, como servicio de sistema independiente en su propio puerto (5432 por defecto). Ambos motores conviven sin problema en la misma máquina.
- **Django no corre dentro de Apache** (a diferencia de PHP): se ejecuta a través de Gunicorn en un puerto interno propio (ej. 8001). Apache sigue siendo el único punto de entrada público y reenvía las peticiones de una ruta o subdominio concretos hacia ese puerto mediante `mod_proxy`, sin tocar la configuración ya existente de Moodle.
- Docker queda como posible mejora futura (útil sobre todo si se quisiera migrar el proyecto a otro servidor con menos fricción), no como requisito de partida.

Puntos a vigilar con el tiempo, sin ser un problema actual: el volumen de imágenes en alta resolución si crece mucho (disco), y la resolución del acceso remoto seguro (dominio, HTTPS, cortafuegos) cuando el equipo necesite catalogar desde fuera de la red local — este último es un buen candidato para apoyo del asesor técnico externo.

---

## 2. Roles y permisos

| Rol | Alcance |
|---|---|
| **Superusuario (administrador del sistema)** | Acceso técnico total: gestión de usuarios, configuración de permisos de grupo, acceso a modelos internos de Django. Incluye automáticamente todos los permisos de contenido (no requiere pertenecer al grupo "Catalogador"). Reservado a quien mantiene la aplicación. |
| **Administrador de contenidos** (grupo "Catalogador") | Alta / edición / borrado en las 9 tablas del esquema. Sin acceso a gestión de usuarios ni a configuración de permisos de otros grupos. Todos los catalogadores comparten los mismos permisos entre sí (cualquiera puede editar o borrar fichas dadas de alta por otro). |
| **Lector** (grupo "Lector") | Solo lectura en las 9 tablas, sin restricción de campo (incluye `contacto` en "Propietarios/Instituciones"). Sin botón de edición visible en ningún caso. Quién ve qué queda configurado únicamente por el superusuario (`Groups` en el panel de administración), no por el administrador de contenidos. |

Implementación: dos `Groups` de Django ("Catalogador", "Lector") con los permisos estándar `add_*`/`change_*`/`delete_*`/`view_*` que Django genera automáticamente por modelo.

---

## 3. Bloqueo de edición

Objetivo: solo un catalogador puede editar una ficha a la vez.

- **Activación**: al pulsar el botón "Editar" de una ficha (no al simplemente abrirla en modo consulta).
- **Liberación normal**: al guardar o cancelar explícitamente.
- **Liberación por timeout**: si la ficha queda abierta sin guardar ni cerrar (desconexión, cierre accidental), el bloqueo se libera automáticamente tras un periodo de inactividad (orientativo: 20-30 minutos).
- **Desbloqueo forzado**: cualquier catalogador puede ver quién tiene la ficha bloqueada y desde cuándo, y forzar el desbloqueo antes de que expire el timeout (solución de confianza mutua, coherente con que todos los catalogadores comparten permisos idénticos).

---

## 4. Trazabilidad de actualización

Tres campos nuevos en la tabla "Obras" (extensibles al resto de tablas si conviene más adelante):

| Campo | Tipo | Notas |
|---|---|---|
| `fecha_actualizacion` | Fecha/hora | Automática (`auto_now` en Django), se actualiza con cualquier cambio en la ficha |
| `fecha_actualizacion_basica` | Fecha/hora | Se actualiza solo cuando cambia algún campo de "Fase 1" (medidas, técnica, soporte, firma, conservación, ubicación física...) |
| `actualizado_por` | Relación → usuario | Usuario que hizo el último cambio. Útil también para el propio bloqueo de edición ("Ana lleva la ficha bloqueada desde hace 3 horas") |

---

## 5. Ficha imprimible

Documento de uso **interno**, pensado para adjuntar físicamente a la obra (ej. en el reverso de un cuadro) y servir de acceso rápido tanto físico como digital.

**Campos incluidos:** `id_catalogacion`, `titulo` (o "[Sin título]"), `artista`, `tecnica`, `alto_cm` × `ancho_cm` (× `profundidad_cm` si aplica), `fecha_ejecucion`, `serie`, `ubicacion_fisica`, imagen marcada como `imagen_indice` (o marcador "Imagen no disponible" si no hay ninguna).

**Código QR** con enlace directo a la ficha completa en la aplicación — permite, con el móvil y teniendo la obra delante, llegar a toda la información digital sin teclear nada.

**Implementación:** vista de impresión propia en Django (plantilla con `@media print`), sin librerías adicionales salvo una de generación de QR en Python. No interviene el pipeline LaTeX, reservado al catálogo razonado final.

---

## 6. Separación de los tres productos

| Producto | Descripción | Estado |
|---|---|---|
| **App de inventario/catalogación** | La descrita en este documento. Fuente única de verdad, PostgreSQL + Django | En diseño |
| **Catálogo online** | Web aparte (no la misma base de datos en vivo), alimentada por exportación periódica. Puede ser una web por autor o conjunta — decisión pendiente | Aparcado, a decidir más adelante |
| **Catálogo impreso** | Pipeline BD → script Python/Jinja2 → `.tex` → PDF (biblatex), lanzado bajo demanda, probablemente sobre fichas marcadas como `ficha_catalografica_completa` | Aparcado, se retoma más adelante |

La base de datos unificada (campo `artista`) sirve igual para cualquiera de las opciones que se decidan para el catálogo online.

---

## 7. Mapa de páginas

**Por entidad** (índice/listado + búsqueda + ficha con alta/edición):

| Entidad | Índice(s) | Búsqueda dedicada | Ficha |
|---|---|---|---|
| Obras | Índice de números (IDs) + índice de imágenes (mosaico) | Sí, formulario combinado | Ficha de obra |
| Exposiciones | Listado simple + "listar todas" | Sí, formulario combinado | Ficha de exposición |
| Bibliografía | Listado simple + "listar todas" | Sí, formulario combinado | Ficha bibliográfica |
| Documentación | Listado simple | Sí, formulario combinado | Ficha de documento |
| Series | Listado simple | No necesaria (bajo volumen) | Ficha de serie |
| Propietarios/Instituciones | Listado simple | No necesaria (bajo volumen) | Ficha de propietario/institución |

**Filtrado por Serie o Propietario:** no se duplica la lógica de búsqueda. Desde la ficha de una Serie o de un Propietario, un enlace ("Ver obras de esta serie/Obras vinculadas") abre el índice de obras ya filtrado, reutilizando el mismo listado y sus columnas.

**Páginas transversales:**
- **Inicio (dashboard):** accesos directos a cada sección + indicadores (nº de obras catalogadas, pendientes de fase 1/2, últimas modificadas vía `fecha_actualizacion`/`actualizado_por`).
- **Ficha imprimible:** accesible desde la ficha de obra, sin entrada propia en el menú principal.
- **Gestión de usuarios:** cubierta por el panel de administración estándar de Django, reservada al superusuario.

**Navegación general (inspirada en Moodle):**
- Barra superior fija: Inicio · Obras · Exposiciones · Bibliografía · Documentación · Series · Propietarios.
- Migas de pan en cada página (ej. Inicio > Obras > AR-0001).
- "Volver al listado/búsqueda" conserva filtros aplicados y página de origen (`displayIndex`).
- Botón "Editar" visible solo para Catalogador; botón "+ Nueva obra/exposición/..." en la cabecera de cada índice, también solo para Catalogador.

---

## 8. Búsqueda de obras

**Regla crítica:** nunca devolver una página en blanco sin resultados. Siempre la misma página de búsqueda, con mensaje "No se han encontrado obras con estos criterios" en el lugar de la tabla de resultados.

**Filtros principales** (siempre visibles, combinables entre sí — no un campo-un botón):
- Texto libre (busca en `id_catalogacion`, `titulo`, `titulos_alt`)
- `artista`
- Rango de fechas (usando `fecha_orden` internamente)
- `serie`
- `tipo_obra`

**Filtros avanzados** (colapsados/opcionales):
- `tecnica`
- `estado_existencia`, `fase_inventario_completada`, `fase_documentacion_completada`
- Medidas (`alto_cm`/`ancho_cm`) como rango mín-máx, uso ocasional

**Columnas del listado de resultados:** `id_catalogacion` (enlace único a la ficha completa) · miniatura · `titulo` · `autor` · `fecha_ejecucion`. Con contador "mostrando X–Y de Z resultados" y paginación (siguiente/anterior).

**Campos descartados por no ser relevantes:** `Version` (propio de escultura con múltiples fundiciones), `Inscription`, `Auction Data`, `Cast Number`/`Foundry`.

---

## 9. Formato de historial expositivo

Convención de presentación (no requiere campos nuevos, se genera a partir de los ya existentes en "Exposiciones"):

```
[año], [fecha_inicio–fecha_fin], [titulo_exposicion en cursiva], [institucion], [lugar]
```

Orden cronológico ascendente. Mismo formato en el listado de búsqueda de exposiciones y en el bloque "Historial expositivo" de la ficha de obra.

---

## 10. Diseño de la ficha de obra

Página central de la aplicación. Estructura:

- **Cabecera:** `id_catalogacion` + `titulo`, `artista` como subtítulo, badges de estado (fase 1/fase 2/ficha publicable), botones "Volver al listado", "Imprimir ficha", "Editar" (visible solo para Catalogador, activa el bloqueo).
- **Aviso de bloqueo:** indica modo consulta/edición y quién tiene la ficha abierta, si aplica.
- **Columna de imágenes:** imagen `imagen_indice` en grande + miniaturas de las demás imágenes de la tabla "Imágenes".
- **Bloques apilados**, siguiendo el esquema v10: Identificación, Procedencia y localización, Conservación/Enmarcación, Historial expositivo, Bibliografía, Clasificación (serie, obras relacionadas, notas críticas), Estado del proceso (con `fecha_actualizacion`/`actualizado_por`/`notas_proceso_inventario`).
- Datos con relación (serie, referencias bibliográficas, propietarios) se muestran como enlaces a su propia ficha.

**Fichas análogas** (Exposición, Bibliografía, Documento): mismo patrón de cabecera + bloqueo + bloques apilados, más cortas:
- **Exposición:** bloque de datos propios + bloque "Obras participantes" (vía Obra_Exposicion, con miniaturas).
- **Bibliografía:** bloque de datos propios + bloque "Obras citadas" (vía Obra_Bibliografia, con página de cada mención).
- **Documento:** bloque de datos de archivo + enlaces opcionales a obra/exposición relacionada + miniatura o icono del archivo digitalizado, si existe.

### Gestión de imágenes y archivos adjuntos

- **Imagen índice (recuadro grande):** en modo edición, un icono superpuesto permite elegir cuál de las imágenes ya subidas se usa como icono/miniatura — no sirve para subir un archivo nuevo.
- **Miniaturas existentes:** al pasar el cursor/tocar, iconos de editar metadata (`tipo_toma`, `fecha_fotografia`, `autor_fotografia`) y eliminar.
- **Recuadro "+":** único punto de subida de una imagen nueva — abre selector de archivo (clic o arrastrar y soltar) junto con los campos obligatorios de esa fotografía, y crea una nueva fila en "Imágenes".
- **Archivo digitalizado de "Archivo/Documentación":** mismo patrón sin elección de "índice" (una sola fila = un solo archivo). Para documentos multipágina (cartas, recortes), se recomienda un único PDF con todas las páginas en vez de una fila por página.

**Campo incorporado al esquema en v11:** `archivo_digitalizado` (adjunto: imagen o PDF) en la tabla "Archivo/Documentación", para alojar el propio archivo digitalizado — hasta v10 el esquema solo registraba `digitalizado` (Sí/No) sin campo que contuviera el archivo en sí. Ver `esquema_campos_inventario_v11.md`.

---

## 11. Pendientes de acción del equipo (no de diseño)

Ver detalle y estado actualizado en la sección 15 ("Acciones de equipo aún abiertas").

---

## 12. Fichas análogas: Exposición, Bibliografía, Documento

Mismo patrón que la ficha de obra (cabecera + aviso de bloqueo + botones Volver/Editar + bloques apilados), pero más cortas y sin columna de galería de imágenes técnicas:

- **Ficha de Exposición**: cabecera con `titulo_exposicion`, `tipo_exposicion`, `lugar`, `fecha_inicio`/`fecha_fin`. Bloque "Datos de la exposición" (institución, catálogo publicado —con enlace a la ficha bibliográfica si `referencia_catalogo` tiene valor—, `nota_exposicion`). Bloque "Obras participantes": listado de las filas de la tabla puente Obra_Exposicion, cada una con miniatura, `id_catalogacion` (enlace a la ficha de obra) y `nota_obra_en_expo`.
- **Ficha Bibliográfica**: cabecera con `titulo`, `autor`/`editor`, `tipo`, `año`, `editorial`. Bloque "Datos de la referencia" (incluye `clave_bibtex` y, si aplica, enlace a la exposición asociada cuando la referencia es el catálogo de una muestra). Bloque "Obras citadas": listado de las filas de la tabla puente Obra_Bibliografia, cada una con `id_catalogacion` (enlace) y `paginas`/`notas` — sin miniatura, ya que la página es el dato relevante aquí.
- **Ficha de Documento**: cabecera con `titulo_descripcion`, `artista`, `tipo_documento`, `fecha`. Columna izquierda con un único recuadro para `archivo_digitalizado` (icono según tipo de archivo, botón "Descargar"), sin elección de "índice" — una fila = un archivo. Bloque "Datos de archivo" (`fondo_serie`, `digitalizado`, `ubicacion_fisica`). Bloque "Relacionado con": muestra `obra_relacionada` y/o `exposicion_relacionada` si existen, con `notas`; si no hay ninguna relación marcada, el bloque no aparece o muestra un texto discreto de "sin relación registrada".

---

## 13. Edición de cabecera

Al pulsar "Editar", **toda la ficha entra en modo edición a la vez**, cabecera incluida — no solo los bloques inferiores. No hay distinción entre "campos destacados arriba" y "campos agrupados en tarjetas": son el mismo registro, solo que unos se muestran en la cabecera por legibilidad.

**Única excepción: la clave primaria de cada ficha** (`id_catalogacion` en Obras, `id_exposicion`, `clave_bibtex`, `id_documento`). Estos campos no son editables una vez creada la ficha, ni siquiera en modo edición — se muestran de solo lectura en el formulario. Motivo: son el eje que ata entre sí todas las tablas relacionadas, y en el caso de `id_catalogacion`, también la etiqueta física pegada en la obra real; cambiarlos después de creados rompería esos vínculos o generaría inconsistencia entre la etiqueta física y el dato digital.

---

## 14. Eliminación de fichas: papelera permanente

### Planteamiento

La eliminación de una ficha (Obra, Exposición, Bibliografía, Documento, Serie, Propietario/Institución) nunca es un borrado real de la base de datos, sino una **baja lógica**, con traza completa y sin periodo de gracia ni purga automática. El equipo asume la responsabilidad de revisar y depurar periódicamente el catálogo, incluyendo la decisión de restaurar una ficha dada de baja (para corregirla) o de dejar su identificador retirado de forma indefinida.

**Por qué no un borrado real ni una papelera con caducidad:**
- Los identificadores (`id_catalogacion`, `id_exposicion`, `id_documento`) pueden estar ya citados en etiquetas físicas, fichas impresas o referencias externas — recuperarlos exactamente tal como estaban solo es fiable si la ficha nunca llegó a desaparecer de verdad.
- Es previsible que se produzcan altas duplicadas por error (dos catalogadores dan de alta la misma obra con IDs distintos sin saberlo) — la papelera permanente es donde se resuelven esos casos tras la revisión del equipo, apoyándose en las herramientas de búsqueda ya existentes. La aplicación no detecta duplicados automáticamente.

### Campos nuevos

Aplicables a las tablas con clave primaria propia: Obras, Exposiciones, Bibliografía, Archivo/Documentación, Series, Propietarios/Instituciones.

| Campo | Tipo | Notas |
|---|---|---|
| `activo` | Sí/No | Por defecto Sí. Al dar de baja una ficha, pasa a No — la fila no se borra de la base de datos |
| `fecha_baja` | Fecha/hora | Se rellena automáticamente al dar de baja |
| `dado_de_baja_por` | Relación → usuario | Quién ejecutó la baja |
| `fecha_restauracion` | Fecha/hora | Se rellena si la ficha se restaura después; vacío mientras esté de baja |
| `restaurado_por` | Relación → usuario | Quién la restauró, si aplica |

Guardan el último evento de baja/restauración, no el historial completo de todos los ciclos si una ficha se da de baja y se restaura varias veces. Si en el futuro hiciera falta ese historial completo, se puede sustituir por una tabla de registro aparte (mismo patrón que las tablas puente ya existentes).

**Tablas puente (Obra_Exposicion, Obra_Bibliografia):** sin papelera propia — no tienen etiqueta física ni número citable, por lo que un borrado directo es suficiente; si se elimina una participación por error, basta con volver a crearla.

### Comportamiento del borrado en cascada

El borrado (baja) nunca se propaga "hacia arriba": dar de baja una imagen no afecta a la obra; dar de baja la participación de una obra en una exposición no afecta ni a la obra ni a la exposición. Sí se propaga "hacia abajo", a lo que solo existe en función de esa ficha:

| Se da de baja... | Qué ocurre |
|---|---|
| **Obra** | Sus imágenes y sus filas en Obra_Exposicion/Obra_Bibliografia dejan de mostrarse (cascada). La Exposición o referencia Bibliográfica vinculada no se ve afectada, solo pierde esa obra de su listado de participantes/citadas. |
| **Exposición** | Sus filas en Obra_Exposicion dejan de mostrarse. Las obras no se ven afectadas. Documentos con `exposicion_relacionada` quedan huérfanos de esa relación, pero no se dan de baja. |
| **Referencia bibliográfica** | Sus filas en Obra_Bibliografia dejan de mostrarse. Si era `referencia_catalogo` de una exposición, esta pierde el enlace pero no se da de baja. |
| **Serie / Propietario** | Las obras que la tenían asignada quedan con ese campo vacío; no se dan de baja. |

### Página "Papelera"

Listado con el mismo patrón que el resto de índices de la aplicación: filtrable por tabla de origen (Obra/Exposición/Bibliografía/Documento/Serie/Propietario), por fecha de baja y por usuario que la dio de baja, con buscador de texto libre. Cada fila muestra el identificador, un resumen mínimo (título/nombre, autor si aplica), fecha y usuario de baja, y un botón "Restaurar". Acceso reservado al rol Catalogador — el Lector no la ve.

### Reutilización de un identificador retirado

No es una restricción técnica del sistema: se resuelve restaurando la ficha desde la papelera y editando después sus campos (salvo la clave primaria, que nunca es editable). El sistema no distingue si esa restauración es "corregir un error de baja accidental" o "reciclar el número para una pieza físicamente distinta" — esa distinción y su idoneidad quedan en manos del criterio del equipo, apoyado en la traza visible (`fecha_baja`/`dado_de_baja_por`/`fecha_restauracion`/`restaurado_por`).

### Fuera de alcance por ahora

Eliminación definitiva desde la papelera (purga real de la base de datos) — ni siquiera para el superusuario. Sin periodo de gracia ni purga automática: las fichas dadas de baja permanecen indefinidamente hasta que el equipo decida restaurarlas. Se podría añadir en el futuro (por ejemplo, por protección de datos de `contacto` en Propietarios/Instituciones a muy largo plazo) si se viera la necesidad.

---

## 15. Entorno de desarrollo, hoja de ruta y modo de trabajo

### Software necesario

| Componente | Qué es | Por qué hace falta |
|---|---|---|
| Python 3 | Lenguaje de Django | Sustituye al rol que jugaría Java en este stack |
| pip + venv | Gestor de paquetes y entornos virtuales de Python | Aísla las librerías de este proyecto de cualquier otro (equivalente a un `WEB-INF/lib` propio por proyecto) |
| Django | Framework web | Se instala con `pip`, no con `apt` |
| PostgreSQL | Motor de base de datos | Independiente del MySQL/MariaDB ya instalado para Moodle |
| psycopg2 | Conector Python↔Postgres | Equivalente al driver JDBC |
| Pillow | Manejo de imágenes en Python | Necesario para miniaturas de la tabla "Imágenes" |
| qrcode | Generación de códigos QR en Python | Para la ficha imprimible |
| Gunicorn | Servidor de aplicación Python | Ejecuta Django; Apache no interpreta Python de forma nativa |
| Apache (ya instalado) | Servidor web / proxy inverso | Sigue siendo el único punto de entrada público; reenvía a Gunicorn vía `mod_proxy` |
| Git | Control de versiones | Necesario para trabajar con seguridad y poder deshacer cambios |

No se requiere Node.js/npm ni build de frontend: plantillas propias de Django + una librería CSS ligera (ej. Bootstrap, con buen soporte de diseño responsive para móvil) es suficiente.

### Hardware disponible

Máquina Ubuntu 24.04 (Pentium G4400T, 8 GB RAM, 500 GB disco), ya usada para experimentar con Moodle. Se valora como **suficiente** para la fase de desarrollo y para un primer uso real por un equipo pequeño. No se plantea, de momento, migrar a un servidor de mayor capacidad.

### Hoja de ruta por fases

1. **Preparar el entorno**: Python venv, Django y dependencias, base de datos Postgres propia del proyecto (separada de la de Moodle).
2. **Esqueleto del proyecto Django**: estructura de carpetas, conexión a la base de datos, primer arranque en local.
3. **Modelos**: traducir las 9 tablas del esquema v11 (más trazabilidad y papelera) a modelos de Django.
4. **Grupos y permisos**: crear los grupos Catalogador/Lector; usar el panel de administración de Django tal cual viene como primer prototipo funcional — permite empezar a validar el esquema con datos reales de Rotili sin esperar a tener vistas a medida.
5. **Vistas a medida**: índice de IDs, índice de imágenes, búsqueda, ficha de obra con bloqueo de edición — sustituyendo progresivamente al admin genérico.
6. **Resto de piezas ya diseñadas**: almacenamiento de archivos, ficha imprimible con QR, papelera.
7. **Acceso desde red local / público**, cuando el prototipo esté maduro.

### Modo de trabajo acordado

El equipo no dispone de una cuenta con acceso a Claude Code (requiere plan Pro/Max/Team/Enterprise o API con facturación), por lo que se opta por avanzar de forma **guiada paso a paso** en esta misma conversación: se entregan bloques pequeños de comandos o código, el equipo los ejecuta en su máquina, y trae de vuelta la salida (resultado o error) antes de continuar con el siguiente bloque. Si en algún punto surge una dificultad de sistema/red más delicada (ej. exposición segura a internet, HTTPS, cortafuegos), se recurre al asesor técnico externo.

### Acciones de equipo aún abiertas (heredadas de versiones anteriores)

1. Validar el esquema de campos con datos reales de Rotili (15-20 obras catalogadas a mano) — en curso.
2. Cerrar la convención de nomenclatura de archivos de imagen — en curso.
3. Decidir si el catálogo online será una web por autor o conjunta — aún sin decidir, no urgente.

---

## 16. Bitácora de instalación (Fase 1 completa, arranque de Fase 2)

**25 de julio de 2026.** Primer arranque real del proyecto, ejecutado paso a paso por Pedro en la máquina de trabajo (Ubuntu 24.04, la misma donde convive Moodle), con guía de Claude en modo "un bloque pequeño de comandos por vez", tal como se acordó en la sección 15.

### Entorno instalado y verificado

- **Python**: 3.12.3 (ya incluido en Ubuntu 24.04).
- **PostgreSQL**: versión 16.14, instalado junto con `postgresql-contrib`. Servicio de sistema activo y verificado (`postgresql@16-main.service`, estado `active (running)`). Convive con el MySQL/MariaDB ya existente para Moodle sin conflicto, en su propio puerto (5432).
- **Git**: instalado y configurado con identidad de autor (`user.name`, `user.email`).
- **Herramientas de compilación** (`build-essential`, `gcc`, `g++`, etc.): instaladas automáticamente como dependencias, necesarias para ciertas librerías de Python.

Comando útil para consultar en el futuro qué instancias de PostgreSQL existen en la máquina (nombre de cluster, versión, puerto, estado): `pg_lsclusters`.

### Base de datos del proyecto

- **Nombre de la base de datos**: `inventario`.
- **Usuario de PostgreSQL**: `protilir01`, creado sin privilegios de superusuario ni permiso para crear más bases de datos o roles (acceso acotado a su propia base de datos, según el criterio de aislamiento ya fijado en la sección 1). Contraseña establecida y guardada de forma segura por el equipo (no se documenta aquí).
- Se creó por error una base de datos intermedia (`inventario_rotili`, de una prueba con un nombre de usuario anterior) y se eliminó (`dropdb`) una vez confirmado el nombre definitivo.

### Proyecto Django

- **Ubicación**: `~/proyectos/inventario` (carpeta local del usuario `pedro` en la máquina Ubuntu).
- **Entorno virtual de Python**: `venv/`, dentro de la carpeta del proyecto — aísla las librerías de este proyecto del resto del sistema.
- **Librerías instaladas dentro del entorno virtual**: `django` (6.0.7), `psycopg2-binary` (conector PostgreSQL), `pillow` (manejo de imágenes), `qrcode` (generación de QR para la ficha imprimible), `gunicorn` (servidor de aplicación para producción, instalado pero aún sin usar).
- **Nombre interno del proyecto Django**: `config` (carpeta de configuración global, no confundir con las apps de contenido que se crearán en la Fase 3).
- **`settings.py`** modificado respecto al valor por defecto: `DATABASES` apuntando a PostgreSQL (`inventario` / `protilir01` / `localhost:5432`), `LANGUAGE_CODE = 'es-es'`, `TIME_ZONE = 'Europe/Madrid'`.
- **Migraciones internas de Django** (`admin`, `auth`, `contenttypes`, `sessions`) aplicadas correctamente sobre `inventario` — confirma que la conexión a PostgreSQL funciona de extremo a extremo.
- **Primer superusuario** creado con `createsuperuser`, con acceso verificado al panel de administración en `http://127.0.0.1:8000/admin`.
- **Servidor de desarrollo** (`python manage.py runserver`) probado con éxito en local: página de bienvenida de Django y acceso al panel de administración confirmados en el navegador.

### Control de versiones

- Repositorio Git inicializado (`git init`) dentro de la carpeta del proyecto, con rama principal renombrada de `master` a `main`.
- **`.gitignore`** creado, excluyendo `venv/`, `__pycache__/`, `*.pyc` y `db.sqlite3` (este último ya no aplica al usar PostgreSQL, pero se deja por si acaso en el futuro se usara SQLite para alguna prueba puntual).
- **Primer commit** (`c02900a`): "Esqueleto inicial de Django conectado a PostgreSQL" — 7 archivos, esqueleto completo del proyecto ya funcional. Punto de partida seguro al que volver si algo se rompe más adelante.

### Estado respecto a la hoja de ruta (sección 15)

- ✅ Fase 1 (preparar el entorno) — completada.
- ✅ Fase 2 (esqueleto del proyecto Django) — completada: estructura de carpetas, conexión a base de datos y primer arranque en local, todo verificado.
- ⬜ Fase 3 (modelos): traducir las 9 tablas del esquema v11, más trazabilidad y papelera, a modelos de Django — siguiente paso pendiente.

---

_Este documento resume las decisiones de interfaz y arquitectura tomadas en conversación de trabajo con Claude (Anthropic) y puede procesarse en Claude por otros miembros del equipo para su revisión. Complementa a `informe_inicial_proyecto_inventario_y_catalogo_Alberto_Rotili.md` y `esquema_campos_inventario_v11.md`._
