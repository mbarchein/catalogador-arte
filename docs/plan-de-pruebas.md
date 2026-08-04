# Plan de pruebas

Correspondencia entre los requisitos de [`requisitos.md`](requisitos.md) y los tests que los verifican.

**Estado medido el 4 de agosto de 2026, todo en verde:**

| Qué | Cuánto | Cómo se midió |
|---|---|---|
| Tests SQL | **33 ficheros**, 0 rojos | Uno a uno, porque `make db-test` aborta en el primero que falle y esconde el resto |
| Tests del frontend | **1395 casos en 59 ficheros** | `vitest run` con el repositorio entero delante. Dentro del contenedor son 1387 en 58: ver el aviso de abajo |
| Herramienta local en Python | **28 casos** | `make copias-corregidas-test` |
| Comprobación de tipos | limpia | `tsc -b --noEmit` con el repositorio entero delante. Ver el aviso |

Cada número lleva su fecha a propósito: un recuento de tests envejece en cuanto se escribe, y un número
sin fecha en el documento que sirve para saber qué está verificado es el error que este documento existe
para evitar. Lo que vale siempre es la salida de `make verificar`.

**Aviso sobre `make test` y `make typecheck`, medido el 4 de agosto de 2026.** Los dos se ejecutan
dentro del contenedor de la aplicación, y ese contenedor **solo tiene montado `app/`**. Por eso
`app/src/lib/signFilePaths.test.ts` —el único test que cubre el perímetro de firma de la función Edge,
que vive en `supabase/functions/sign-file/`— no se puede ni cargar desde ahí: `make test` da «Cannot
find module» y deja el fichero fuera, y `make typecheck` **falla** con `TS2307`. Fuera del contenedor
los dos pasan, y en integración continua también, porque el paso se ejecuta en `app/` con el
repositorio completo descargado. No es un test roto: es un test que la orden que este documento nombra
no ejecuta, y por eso queda escrito aquí en vez de descubrirse cuando haga falta.

El resto del documento define lo que falta, para que ningún requisito se dé por implementado sin
verificación. La columna «Estado» se actualiza a medida que los tests existen.

Todo se ejecuta con `make verificar`, y en cada *push* con el mismo orden de prioridades.

## Herramientas

| Capa | Herramienta | Estado |
|---|---|---|
| Políticas RLS, *triggers* y restricciones | SQL contra el stack local, en transacciones que se deshacen | En uso · `make db-test` |
| Lógica del frontend | Vitest | En uso · `make test` |
| Tipos | `tsc --noEmit` | En uso · `make typecheck` |
| Infraestructura | `terraform fmt -check` y `terraform validate` | En uso · `make infra-check` |
| Recorridos completos, con perfil de móvil | Playwright | **Sin montar** |

Los tests de SQL son SQL corriente, sin pgTAP: cada fichero abre una transacción,
crea sus propios datos, comprueba con bloques `do` que lanzan excepción al fallar, y termina en
`rollback`. No dejan rastro en la base y no hace falta instalar nada. La razón de no usar pgTAP es que
la parte difícil de estos tests es autenticarse como cada rol, y eso no lo simplifica ninguna librería.

### Lo que «Pendiente en navegador» significa exactamente

Conviene decirlo una vez y de frente, porque afecta a la mitad de la aplicación y es fácil leer un
número grande de tests y suponer lo contrario.

**No hay entorno de DOM.** Vitest corre en Node y el proyecto no tiene `jsdom`, ni `happy-dom`, ni
`@testing-library`, ni el modo navegador de Vitest — comprobado el 4 de agosto de 2026 en
`app/package.json` y en la configuración de Vitest, donde el entorno ni se declara. La consecuencia,
medida: hay **46 ficheros `.tsx` y ningún `.test.tsx`**. Ni uno.

Así que de todo lo que es JSX —cada pantalla, cada hoja, cada botonera, los 15 componentes de los
bloques documentales incluidos— lo que está verificado es:

1. **El compilador**, que garantiza que los tipos encajan y nada más.
2. **Sus partes puras**, extraídas del componente a un módulo aparte precisamente para poder probarlas:
   la aritmética de los mandos, el formato de una línea de historial expositivo, qué opciones ofrece un
   selector, qué texto se muestra cuando no hay dato. Esos módulos sí tienen cientos de casos.
3. **Nada más.** Que el componente monte, que el gesto llegue, que el foco vaya donde debe, que el
   lector de pantalla anuncie el error, que el panel no tape el botón: de eso no hay ni un aserto.

Por eso «Pendiente en navegador» **no es un adorno de una fila ya cubierta**: es la mitad que falta, y
se cierra con una sesión fechada y el navegador dicho, como las filas de «Comprobado a mano», no
marcando la fila como hecha porque su lógica pura esté probada.

## Convenciones

- Un test cita el identificador del requisito que verifica, en su nombre o en su descripción:
  `RF-402: marcar una imagen como índice desmarca la anterior`.
- El fichero de tests acompaña a lo que prueba: los de RLS junto a las migraciones, los de componentes
  junto a los componentes.
- **Un requisito sin test es un requisito no implementado**, por muy escrito que esté el código.
- Toda incidencia corregida deja antes un test que la reproduce, nombrado con su identificador
  (`inc_14_fotografiada_ignora_imagenes_de_baja`).

## Prioridad de cobertura

Por orden, según la consecuencia de un fallo silencioso:

1. **Políticas RLS.** No hay backend: las políticas son el único perímetro de seguridad y la clave
   anónima viaja en el cliente. Un fallo aquí no corrompe datos, los **expone** — incluidos los datos
   personales de coleccionistas particulares en `contacto`. Es la única categoría cuyo fallo afecta a
   terceros ajenos al proyecto.
2. **Reglas con consecuencia sobre los datos** — cascada de la baja lógica, campos calculados,
   inmutabilidad de claves primarias, unicidad de la imagen índice, *trigger* del bloqueo. Un fallo aquí
   corrompe el catálogo sin avisar.
3. **Captura en móvil** — es el caso de uso principal; si falla, no hay inventario.
4. **Validación y convenciones de captura.**
5. **Renderizado de vistas.**

Esta ordenación es la diferencia práctica más importante respecto al stack anterior. Con un servidor
propio, los permisos podían dejarse para después porque negaba por omisión. Aquí, **una tabla sin
política de una operación está abierta**, y el orden de construcción lo refleja: la fase 4 son las
políticas y sus tests, antes de escribir una sola pantalla.

---

## Cobertura por grupo de requisitos

### Políticas RLS — prioridad absoluta

La verificación se hace **autenticándose de verdad** como un usuario de cada rol y ejecutando consultas
reales contra la base, no comprobando que el fichero de política existe.

| Requisito | Qué debe verificar el test | Estado |
|---|---|---|
| RF-109 | Matriz completa: para cada una de las nueve tablas y cada operación (`select`, `insert`, `update`, `delete`), qué puede hacer cada rol. Son 9 × 4 × 3 casos y se generan, no se escriben a mano | Pendiente |
| RF-111 | Test de cierre por omisión: **toda** tabla del esquema tiene RLS activado, y ninguna política permite DELETE. Falla automáticamente cuando alguien añade una tabla sin RLS — es la red que impide el olvido | **Hecho** |
| RF-111, RF-113 | Un cliente con la clave anónima y **sin sesión** no lee ni una fila de ninguna tabla. Este aserto destapó que la plataforma concede las tablas nuevas al rol anónimo por privilegios por omisión | **Hecho** |
| RF-111 | Ninguna función del esquema público es ejecutable por PUBLIC ni deja su `search_path` al azar; las de trigger no son invocables desde la API y aun así disparan; el esquema está cerrado a PUBLIC y abierto a quien la API necesita; y un usuario con sesión sigue evaluando las políticas. Cubierto en `function_privileges.test.sql` | **Hecho** |
| RF-105 | Un Lector lee las obras activas y no puede modificarlas, y lee `contact` de las partes que sí puede ver —RF-105 lo decide expresamente y por eso se ejerce en vez de suponerse—, pero **no** el de las partes a las que solo llegaba por la procedencia de una obra retirada. Cubierto en `rls_role_matrix.test.sql` y `documentary_visibility.test.sql` | **Hecho** |
| RF-108 | Un Catalogador no puede modificar su propio rol en la tabla de perfiles, ni el de otro usuario. Y el acceso administrativo directo sí puede: sin eso no habría forma de promover al primer superusuario | **Hecho** |
| RF-112 | El registro está deshabilitado: un intento de alta de cuenta desde el cliente es rechazado | Pendiente |
| RF-609 | Las políticas o las vistas excluyen las fichas de baja para el Lector, de modo que la exclusión no dependa solo de que el frontend recuerde filtrar | **Hecho** para la obra y su expediente documental |
| RF-609, RF-905, RF-910, RF-911, RF-912, RF-913, RF-511 | **La fuga que este bloque existía para cazar, y que estuvo abierta.** Medido el 4 de agosto de 2026 con la sesión de un Lector: de una obra dada de baja veía 0 filas de la obra y **1 fila de su eslabón de procedencia, de su cita, de su participación, de su documento y de su relación** — y, siguiendo el eslabón, el nombre y el **contacto** del coleccionista particular que la tuvo. La baja de una obra no cae en cascada sobre sus filas documentales, y la política no exigía que el ancla se viera. Cerrado en `20260805130000_documentary_visibility.sql`: seis políticas de select que heredan la visibilidad de sus anclas, los dos extremos de cada puente incluidos. Cubierto en `documentary_visibility.test.sql` —la fuga, el control con todo activo, los dos extremos uno por uno, el documento compartido con una exposición activa y la papelera del Catalogador intacta— y en `rls_role_matrix.test.sql`, que añade la celda. Comprobado al revés el 4 de agosto de 2026, deshaciendo las seis políticas a mano y devolviéndolas: 12 asertos funcionales y 21 estructurales en rojo, y los tres bloques de control en verde. Y otra vez mirando un solo extremo de la relación: exactamente dos asertos en rojo, los dos que hablan de `to_catalog_id` | **Hecho** |
| RF-905 | **Sigue abierto, medido y no escondido:** el Lector ve la fila —y con ella la ruta del fichero— de la **fotografía** de una obra retirada. Es el mismo hueco de la cascada y le toca su propia migración: la política de `images` es de la primera migración, está en producción y la tocan las pantallas de fotografía, y no lleva dato personal de tercero, que es lo que hacía del expediente documental una urgencia. Medido en 1 fila y **fijado con un aserto al revés** en `documentary_visibility.test.sql`, que afirma que el hueco sigue ahí y se pondrá rojo el día que se cierre, para que nadie tenga que acordarse de venir a borrar el comentario | Pendiente |
| RF-110 | Una URL firmada caducada deja de dar acceso al fichero; una ruta de bucket sin firmar no responde | Pendiente |

### Interfaz según rol (RF-100)

Complementan a los tests de RLS de arriba: aquí se comprueba lo que **se ve**, allí lo que se **puede
hacer**. Un botón oculto no es una protección, y una política correcta con un botón visible es una
interfaz que promete lo que no cumple.

| Requisito | Qué debe verificar el test | Estado |
|---|---|---|
| RF-101 | Un visitante sin sesión acaba en la pantalla de acceso desde cualquier ruta, recorridas de forma exhaustiva y no por muestreo | Pendiente |
| RF-103 | Un Catalogador puede crear, editar y dar de baja en las nueve tablas | Pendiente |
| RF-103 | Un Catalogador puede editar una ficha creada por otro Catalogador | Pendiente |
| RF-106 | La interfaz de un Lector no contiene ningún control de escritura ni el enlace a la papelera | Pendiente |
| RF-106 | Un Lector que ataca la API directamente, saltándose la interfaz, recibe 403 al intentar dar de alta | **Hecho** |
| RF-107 | Un Superusuario conserva acceso completo al contenido sin necesidad de tener el rol de Catalogador | Pendiente |

### Modelo de datos (RF-200)

| Requisito | Qué debe verificar el test | Estado |
|---|---|---|
| RF-202 | Formato validado, numeración secuencial e independiente por fondo, prefijo coherente con el fondo, y ningún identificador retirado se recicla | **Hecho** |
| RF-203 | No se puede guardar una obra sin `artista`, y `artista` no ofrece «Sin revisar» | Pendiente |
| RF-204 | Intentar cambiar `id_catalogacion` o el fondo falla contra la base, no solo en el formulario. Faltan las otras cinco claves, cuyas tablas aún no existen | Parcial |
| RF-205 | Cada campo de selección afectado tiene «Sin revisar» como valor inicial | Pendiente |
| RF-207 | La columna generada compone los ocho formatos; no se puede escribir directamente; la nota manda en la ficha conservando el año de búsqueda; rango invertido, año implausible y bandera sin año se rechazan; la consulta de época funciona por solapamiento | **Hecho** |
| RF-207 | La fecha escrita a mano se estructura si es canónica (con variantes de catálogo) y solo lo imparseable queda como nota, con el año rescatado | **Hecho** |
| RF-209 | Obra con `titulo` vacío se representa como «[Sin título]» sin guardar el dato; obra titulada literalmente «Sin título» se muestra sin corchetes | **Hecho** |
| RF-210 | `fotografiada` es No sin imágenes, Sí con una imagen activa, y **No cuando su única imagen está de baja** (INC-14) | Pendiente |
| RF-211 | `medidas_verificadas` sigue en No aunque `alto_cm` y `ancho_cm` tengan valor | Pendiente |
| RF-212 | `obras_relacionadas` acepta varias obras y no admite texto | Pendiente |
| RF-215 | El nombre se guarda como se escribe; dos hermanos —o dos raíces— con el mismo nombre normalizado se rechazan; el árbol no admite ciclos; renombrar y mover son un `update`; un lugar con contenido no se retira; la baja se sella y se deshace; y el Lector ve el árbol sin poder tocarlo. Cubierto en `physical_places.test.sql` | **Hecho** |
| RF-213, RF-901 | Los tipos de obra y las series tienen clave sustituta (ADR-007): la clave primaria es `id`, el nombre sigue siendo único —por fondo en las series—, renombrar es un `update` de una fila que el catálogo ve sin mover las fechas de ninguna obra, cambiar el tipo de una obra mueve la fecha básica y cambiar su serie no, una serie de otro fondo se rechaza al insertar y al mover, no se retira lo que tiene obras activas dentro, una obra en la papelera no lo impide, la baja se sella y se deshace, nadie tiene DELETE y renombrar es del Catalogador. Cubierto en `master_table_keys.test.sql` | **Hecho** |
| RF-213, RF-901 | Lo que decide el alta de un nombre en el vocabulario: un nombre nuevo se inserta recortado, uno equivalente salvo mayúsculas o tildes se reutiliza en vez de duplicarse, y **uno retirado se recupera** en vez de fallar con una violación de unicidad que la interfaz llamaba «añadido». Con el orden `es-ES` de las dos listas y la agrupación de las series por fondo. Cubierto en `masterTables.test.ts` | **Hecho** |
| RF-215 | La obra apunta a un nodo, o a ninguno, que también es legítimo; renombrar el lugar lo ve el catálogo entero sin mover las fechas de la obra; un lugar con obras activas dentro no se retira, y una obra en la papelera no lo impide; la clave ajena rechaza apuntar a un lugar inexistente; y el traslado de los textos no dejó obras sin nodo ni la auditoría apagada. Cubierto en `artwork_physical_place.test.sql` | **Hecho** |
| RF-212, RF-217 | Contra la base: los seis tipos de relación nacen sembrados con su inversa y su simetría, un tipo asimétrico sin inversa se rechaza, un tipo en uso no cambia de simetría ni se retira, una relación simétrica se guarda **una sola vez** en el orden canónico —da igual el orden en que se nombren las dos obras—, la pareja inversa de una asimétrica se rechaza, y una obra no se relaciona consigo misma. Cubierto en `artwork_relationships.test.sql` | **Hecho** |
| RF-217 | Lo que la ficha decide sobre las relaciones sin píxeles: qué etiqueta se lee en cada extremo —la directa o la inversa, según de qué lado se mire— , la obra sin título representada como «[Sin título]», el enlace a la ficha de la otra obra y la miniatura que la acompaña, y el formulario que relaciona: qué obras ofrece, cuál excluye y qué hace con una relación que estaba retirada. Cubierto en `relatedArtworks.test.ts`, `relatedThumbnails.test.ts` y `relateForm.test.ts` | **Hecho** |
| RF-218 | Contra la base, y en las cuatro migraciones que van añadiendo un bloque: no se declara un bloque «investigado sin resultado» cuando ya tiene filas debajo, y no se añade **ni se restaura** una fila en un bloque ya declarado sin resultado. Las dos puertas, para los cuatro bloques: procedencia, bibliografía, historial expositivo y documentación. Cubierto en `provenance.test.sql`, `bibliography.test.sql`, `exhibitions.test.sql` y `archive_documents.test.sql` | **Hecho** |
| RF-218 | Lo que la ficha decide: los tres estados de cada bloque se distinguen en pantalla —pendiente, investigado sin resultado y con contenido—, un bloque sin filas **no** se presenta como el mismo hueco que uno investigado (RF-304), y el selector de estado no ofrece el valor que la base va a rechazar. Cubierto en `researchState.test.ts`, `researchStatusOptions.test.ts` y los tres `researchStatusChoice.test.ts` de los bloques | **Hecho** |
| RF-217, RF-218 | Que la pantalla de esos bloques monte, que la hoja de estado se abra y se cierre, y que el formulario de relacionar se opere con el pulgar. Es JSX: lo verifican el compilador y las partes puras de arriba, y **nada más** | Pendiente en navegador |

### Ficha de obra (RF-300)

| Requisito | Qué debe verificar el test | Estado |
|---|---|---|
| RF-303 | La ficha renderiza los ocho bloques. Test de completitud: todo campo del esquema aparece en exactamente un bloque (cubre INC-06 e INC-16) | Pendiente |
| RF-304 | Un bloque sin datos muestra su texto explícito y no queda vacío | Pendiente |
| RF-305 | Los datos de relación se renderizan como enlace a la ficha correspondiente | Pendiente |
| RF-306 | Una obra con `estado_existencia` distinto de «Conservada» muestra el aviso en cabecera (INC-18) | **Hecho** |
| RF-307 | Un título atribuido se distingue visualmente de un título auténtico (INC-17) | **Hecho** |
| RF-308 | En modo edición, los campos de cabecera son editables salvo la clave primaria | Pendiente |
| RF-311 | La secuencia de anterior y siguiente es el listado de origen: respeta filtros, búsqueda y orden, desempata igual que el listado, y en los extremos no hay vecino. Cubierto en `sequence.test.ts`, con el repliegue al catálogo por código cuando la obra no está en el listado | **Hecho** |
| RF-311 | El umbral del gesto: un arrastre corto no pasa de obra, un movimiento vertical no la pasa nunca, y un golpe rápido sí. Cubierto en `sequence.test.ts` | **Hecho** |

### Imágenes y adjuntos (RF-400)

| Requisito | Qué debe verificar el test | Estado |
|---|---|---|
| RF-402 | Marcar una segunda imagen como índice desmarca la primera; nunca hay dos activas marcadas (INC-15) | Pendiente |
| RF-403 | Sin ninguna marcada, se elige la más reciente de tipo «general»; se comprueba también el caso de que no haya ninguna «general» | Pendiente |
| RF-404 | Una obra sin imágenes muestra el marcador «Imagen no disponible» | Pendiente |
| RF-406 | La subida crea una fila nueva en Imágenes con sus metadatos, y se rechaza sin los campos obligatorios | Pendiente |
| RF-408 | Un documento admite un único `archivo_digitalizado` y acepta imagen y PDF | Pendiente |
| RF-409 | Una subida produce los tres niveles asociados al mismo `id_imagen`, sin crear tres filas | Pendiente |
| RF-410 | El redimensionado en el navegador respeta el borde largo previsto y no supera el tamaño objetivo; se verifica con una imagen de partida del tamaño real de una foto de móvil | Pendiente |
| RF-410 | La orientación EXIF se aplica al redimensionar: una foto tomada en vertical no acaba girada. **Sigue Pendiente a propósito:** la aplicación no lee esa etiqueta, la aplica el navegador al decodificar, así que un test que demuestre que nuestro lector de EXIF ve `Orientation = 6` no ejecutaría ni una línea del camino de redimensionado — sería la variante EXIF de comprobar que el fichero de política existe. Esta fila se cierra con una prueba en navegador sobre una foto vertical de verdad, y con nada menos que eso | Pendiente |
| RF-411 | Ninguna vista incluye la URL de un máster; la descarga se obtiene solo por URL firmada | Pendiente |
| RF-412 | Todo acceso a imágenes pasa por la función única de resolución de URL: un test estático que falla si algún componente construye una URL de bucket por su cuenta | Pendiente |
| RF-409, RF-410 | El encuadre guardado como dato solo admite giros de 0, 90, 180 y 270, y un recorte normalizado que es todo o nada y cae dentro de la imagen; una fotografía nueva nace sin giro ni recorte | **Hecho** |
| RF-409, RF-410 | El encuadre lo cambia quien puede editar; un Lector no, sin política nueva: las de «Imágenes» ya lo cubren | **Hecho** |
| RF-410 | Geometría de la edición: rotación acumulada, recorte de recorte, giro de 90° con recorte, rectángulo degenerado y arrastre de esquina que no invierte el rectángulo ni se sale de la imagen | **Hecho** |
| RF-410 | La región que amplía la lupa al ajustar una esquina: centrada en la esquina, cuadrada en píxeles con cualquier giro, siguiendo la esquina a través de la rotación y sin desplazarse hacia dentro cuando la esquina cae en el borde de la fotografía | **Hecho** |
| RF-410 | Sugerencia de recorte por perfiles de proyección, con fotografías sintéticas: cuadro centrado y descentrado detectado con precisión de pocos píxeles, cuadro más oscuro que la pared, marco y tela como dos candidatos anidados, y un solo candidato cuando el segundo rectángulo no está claramente dentro | **Hecho** |
| RF-410 | La sugerencia se niega antes que inventarse: pared sin cuadro, pared con ruido, cuadro oscuro sobre pared oscura sin contraste, proporción absurda, rectángulo demasiado pequeño, rectángulo que es casi todo el fotograma, bordes en una sola dirección e imagen demasiado pequeña | **Hecho** |

#### Color, procedencia y datos del fichero de una fotografía (RF-414 a RF-421)

El color se guarda como parámetros y se aplica en dos sitios: el navegador, al generar los ficheros, y
una herramienta local por lotes, para los másteres con los que el móvil no puede. Son dos implementaciones
del mismo criterio, y la forma en que se descubre que han divergido es que la miniatura y la copia a
resolución completa de la misma obra salen de distinto color; de ahí que la tabla de color sea la
definición normativa y que haya un fichero de casos compartido que una batería genera y la otra
comprueba. El resto es lo de siempre: que la base rechaza lo que el cliente no debe volver a
comprobar, que un Lector no escribe ninguna de las columnas nuevas, y que lo que el dispositivo no
puede hacer consta en vez de callarse.

La verificación completa de este bloque se pasó el 3 de agosto de 2026: comprobación de tipos limpia,
868 casos del frontend en verde, los 21 ficheros de tests SQL en verde y los 28 casos de la herramienta
local en Python. Las filas que estaban «En curso» pasan a **Hecho** con esa fecha. Tres de ellas se
comprobaron además al revés, deshaciendo a mano lo que verifican para ver el test rojo: el fichero de
casos compartido, la copia que sale en blanco y el color dentro de la comparación de dos ediciones. Un
test que pasa hagas lo que hagas no verifica nada, y estos tres son los que sostienen la entrega.

**«Pendiente en navegador»** es lo que Vitest no puede afirmar —píxeles, gestos y el techo de área del
lienzo, que solo existe en el dispositivo—: se cierra como las filas de esquinas de más abajo, con una
sesión fechada y el navegador dicho, no con un aserto. Nada de este bloque se ha abierto todavía en un
navegador, así que esas tres filas siguen enteras.

| Requisito | Qué debe verificar el test | Estado |
|---|---|---|
| RF-414 | La cadena canónica de la tabla de color: el ajuste neutro es la identidad exacta en los 256 códigos y los tres canales —es lo que impide que abrir una fotografía, mirarla y aplicar reescriba sus ficheros—, la tabla nunca decrece, el punto negro sale a 0 y el blanco a 255, el balance de blancos no lleva a 255 un canal que no lo estaba, +1 EV duplica la luz lineal dentro del error de cuantización, y `NaN`, infinito y fuera de rango vuelven a la identidad. Con la previsualización comparada por **igualdad literal**, el espacio de interpolación del filtro incluido: olvidarlo es el fallo silencioso número uno de esta entrega. Cubierto en `imageColor.test.ts` | **Hecho** |
| RF-415 | **Requisito negativo, y por eso tiene test:** ningún nombre exportado por el modelo de color, ni ninguna clave de sus parámetros, de sus rangos o de sus columnas, se llama saturación, vibrancia, contraste, sombras, altas luces, nitidez, velo, sepia ni giro de tono, y la previsualización no cuela ninguna de esas operaciones por el filtro. Es el test que contesta dentro de seis meses a «si total es una línea». Cubierto en `imageColor.test.ts` | **Hecho** |
| RF-414, RF-418 | El cuentagotas y el ajuste automático: una muestra teñida deja un gris de verdad —con la mediana del parche y no la media, que un especular arruina—, una muestra con un canal quemado o apagado se rechaza, el automático respeta sus cuatro topes, no mueve los puntos ante un histograma que ya llega a los extremos y **calla** en el balance de blancos cuando no hay grises creíbles suficientes, porque una sugerencia equivocada es peor que ninguna. Cubierto en `imageColor.test.ts` y `imageHistogram.test.ts` | **Hecho** |
| RF-414 | El histograma se mide sobre el **encuadre elegido** y no sobre la fotografía entera —el gotelé de la pared queda fuera—, deshaciendo el giro, dentro del cuadrilátero de las esquinas y no de su caja; y el recuento de píxeles empastados y quemados sale de aplicar la misma tabla que se va a guardar, que es lo que hace fiable el aviso. Cubierto en `imageHistogram.test.ts` y `imagePixels.test.ts` | **Hecho** |
| RF-416, RF-419 | Los datos técnicos del fichero, con fixtures **construidos en bytes** porque el repositorio es público y el volcado de másteres no está en él: la fecha fiable cuando la cámara la escribió al disparar, la del fichero **marcada como aproximada** cuando esa falta —el caso de los 14 másteres de 2022—, los dos órdenes de byte, el relleno de NUL recortado y la cadena que solo es relleno como ausencia, una orientación fuera de 1..8 como ausente, y un fichero sin EXIF, un PNG, un HEIC, un IFD vacío y un marcador truncado en el límite de los 128 KB devolviendo nada sin lanzar. Con las dimensiones declaradas en EXIF que **no** producen aviso de recorte previo: compararlas con el ancho decodificado marcaría 23 ficheros de 31 cuando solo 7 lo están. Cubierto en `exif.test.ts` | **Hecho** |
| RF-414, RF-416, RF-417, RF-418 | Contra la base: cada mando rechazado fuera de su escala y **por el nombre de la restricción que lo rechaza**, la curva que no se puede invertir ni colapsar, medio punto neutro y medio tamaño que no existen, una fecha del fichero que no dice si es exacta y no entra —en esa columna la duda es el dato—, cada enumerado rechazando texto libre, y una fila escrita **sin ninguna columna nueva** que sigue siendo válida, que es lo que hace el frontend viejo durante los segundos del despliegue. Cubierto en `image_color.test.sql` | **Hecho** |
| RF-420, RF-411 | Contra la base, la copia corregida: no entra un tamaño que no es un tamaño, media descripción de un fichero no existe, «la copia está» y «la copia falta» no pueden ser verdad en la misma fila, y **la ruta de la copia nunca es la del máster** — la forma realista de reescribir un máster no es un `update` malicioso, es derivar su ruta y que un día coincida. Cubierto en `image_corrected_copy.test.sql` | **Hecho** |
| RF-106, RF-414, RF-417, RF-418 | Las columnas nuevas son superficie nueva de escritura y **no** llevan política propia a propósito —quien puede editar una fotografía puede editar su color—, así que lo que hay que demostrar es que la política de imágenes ya las cubre: **autenticándose de verdad**, un Catalogador las escribe todas de una vez y un Lector no escribe ninguna, atacando la base directamente y comprobando después el contenido de la fila fuera de su sesión, porque un `update` que la política esconde no falla, no afecta a ninguna fila, y ese silencio es lo que hay que afirmar. Cubierto en `rls_role_matrix.test.sql` | **Hecho** |
| RF-414 | Ida y vuelta del color por las columnas de la edición, junto al giro, el recorte y las esquinas; una fila anterior a la migración se lee como neutra; **dos ediciones que solo difieren en el color se distinguen**, porque si no «Aplicar» no regeneraría los ficheros y la corrección se perdería en silencio; la vía degradada rechaza el color con su mensaje en español, como ya hace con las esquinas; y el resumen del editor nombra el color. En `imageEdits.test.ts`. Comprobado al revés el 3 de agosto de 2026: sacando el color de la comparación, dos tests se ponen rojos —el de `sameEdit` y el que distingue una corrección de una simple anotación— | **Hecho** |
| RF-420 | Con el fallo del lienzo simulado: cuando el dispositivo no puede con el máster, la copia queda **pendiente y consta**, y no se sube un fichero en blanco ni una resolución recortada en silencio. El techo de área del lienzo no lanza ningún error —devuelve un lienzo blanco—, así que este es el test del fallo silencioso que persigue toda la entrega. En `imageRender.test.ts`, sobre una superficie de dibujo que falla como falla un móvil de verdad. Comprobado al revés el 3 de agosto de 2026: quitando el sondeo previo y la comprobación posterior, tres tests se ponen rojos, y cada una de las dos comprobaciones cubre un modo de fallo distinto | **Hecho** |
| RF-421 | El fichero de casos compartido: los tests del frontend lo generan a partir de los parámetros y los de la herramienta local lo verifican entrada por entrada, de modo que una divergencia entre las dos cadenas de color sea un test rojo y no dos colores distintos en la misma obra. 24 casos por tres canales por 256 códigos, más 12 muestras del paso a blanco y negro, que no viaja en las tablas y por eso tiene sección propia. Comprobado al revés el 3 de agosto de 2026: cambiando el redondeo de la tabla en un solo sitio, el test del fichero se pone rojo y dice cómo regenerarlo | **Hecho** |
| RF-410 | Una toma con esquinas y con la procedencia de su encuadre sobrevive al ciclo de guardar y rehidratar la cola de fotografías pendientes de subir. Era pérdida de datos y no una molestia: la corrección de perspectiva quedaba cocida en las derivadas y se perdía **como dato** al recargar la pestaña. En `photoQueue.test.ts`, con la fila de la versión anterior del almacén —sin ninguno de los campos nuevos— leída sin lanzar | **Hecho** |
| RF-410 | Un rectángulo real **ladeado 5°** sobre un fotograma 16:9 se endereza a su proporción —salía un 1,08 % estirado—, y el tamaño enderezado devuelve ancho y alto sin intercambiarlos con giro de 90° y 270°, que es una regresión ya sufrida. Los tres tests anteriores solo miraban lados horizontales o verticales, y por eso no lo pillaban. En `perspective.test.ts` | **Hecho** |
| RF-418 | La detección del testigo de gris sobre imágenes sintéticas: una escalera de parches acromáticos contiguos y alineados se reconoce por sus escalones, una pared gris lisa no —un gris liso es indistinguible de una pared—, y no se codifica ningún producto concreto. En `grayTarget.test.ts` | **Hecho** |
| RF-406, ADR-002 | **La invariante que prevalece sobre todo lo demás: el máster se sube tal cual.** El envío del original manda exactamente el fichero que la cámara dio, comparando la **identidad** del objeto y no su contenido —envolverlo en otra cosa pasaría una comparación por valor y ya sería otro fichero—, con un solo envío a la ruta del máster, sin pasar por el almacén de la aplicación, conservando su propia extensión y con una ruta nueva en cada subida. En `images.test.ts` | **Hecho** |
| RF-409 | El navegador que contesta PNG cuando se le pide WebP: el formato de las copias se lee de los **bytes** que se van a subir y no de lo que se pidió, así que ya no se sube un PNG con nombre y tipo de WebP; un fichero rehidratado de la cola, que no recuerda la respuesta de la sonda, se resuelve igual. En `images.test.ts` | **Hecho** |
| RF-416, RF-417, RF-420 | La fila de una fotografía nueva: las dos fechas siempre juntas —y la aproximada marcada como tal, o la columna mentiría—, el tamaño del original, la procedencia **elegida y nunca deducida** (una fotografía con pinta de captura de catálogo se registra como propia si nadie dijo otra cosa), y los tres estados de la copia a resolución completa, incluido el de la firma rechazada y el del envío fallido, que dejan la copia pendiente con su razón en vez de perder el trabajo. En `images.test.ts` y `photoQueue.test.ts` | **Hecho** |
| RF-414, RF-417 | Lo que la pantalla de fotografías decide sin píxeles: el color y el encuadre se leen **juntos** —con la fila corta sola, el resumen diría «sin ajuste» sobre una foto que lo lleva puesto—, revisar y dejar igual cambia la fila sin reescribir ningún fichero, la herencia sale de la toma general del orden colocado, la oferta de repetir la luz de la toma anterior pasa por las dos puertas (procedencia y tipo de toma), el estado de la copia se cuenta en cuatro casos y nunca como un hueco, y el color de la tanda sobrevive a la recarga sin que guardar la tanda lo pise. En `photoDetails.test.ts`, `batchColor.test.ts` y `PhotoPicker.test.ts` | **Hecho** |
| RF-414, RF-418, RF-419 | La aritmética de los mandos, extraída del componente para poder probarla sin navegador: la frase de cada tira coincide letra por letra con el resumen que guarda la fila, **toda muesca de las siete tiras sobrevive al redondeo de la base** —el dedo no puede producir un valor que la columna cambie—, el teclado completo con Escape llegando al editor, el cuentagotas deshaciendo el giro sobre rásteres sintéticos y rechazando un gris quemado, la hoja impresa que se **anota** sin mover un píxel frente a la carta comprada que sí mueve el balance, y el filtro puesto antes del primer arrastre. En `ColorControls.test.ts` y `PhotoDataPanel.test.ts` | **Hecho** |
| RF-418 | La hoja imprimible del testigo, cerrando el bucle: se pinta una fotografía sintética de la propia hoja y se le da al detector, que encuentra los cinco parches con los tonos exactos que la hoja imprime. Y el marco oscuro alrededor de la tira está medido: sin él, el blanco del papel se encadena a la escalera y el detector descarta la cadena entera — la hoja saldría perfecta de la impresora y sería invisible. En `grayTargetSheet.test.ts` | **Hecho** |
| RF-410, RF-420 | El enderezado por franjas, que es la parte del rectificado que por fin tiene tests: en franjas sale exactamente lo mismo que de una vez, lo que cae fuera del encuadre sale blanco y opaco, las franjas cubren todas las filas sin huecos —una franja que falta es una banda blanca en una reproducción impresa— y el trozo de máster de cada franja contiene todas las muestras que esa franja pide, comprobado por fuerza bruta. En `imageRender.test.ts` | **Hecho** |
| RF-414, RF-418 | La lupa aplica la tabla de color antes de pintar su fondo y su retícula —aplicada después, un punto negro alto se comería la cruz— y **no** la aplica con el cuentagotas, donde se apunta a los píxeles crudos: un gris ya corregido mide la corrección y no la luz de la sala. En `imageLoupe.test.ts` | **Hecho** |
| RF-411, RF-420 | Sacar una fotografía de la aplicación, decidido sin navegador: el nombre con el que llega el fichero —clave de catalogación, tipo de toma y cuál de los dos es, sin el sufijo aleatorio del almacén, con la extensión real del original y numerando dos tomas del mismo tipo—, qué se ofrece según la fila —la copia solo cuando está, y los cuatro estados en que no está dichos uno a uno, incluido el color como corrección y el «todavía no lo sé» mientras se lee—, el original ausente explicado en vez de escondido, el tamaño prometido solo cuando se sabe, y **ninguna condición que mire el rol**: el Lector descarga las dos. En `archiveDownloads.test.ts`. Comprobado al revés el 4 de agosto de 2026: devolviendo el nombre interno del almacén se ponen rojos ocho tests, y ofreciendo la copia pendiente, dos | **Hecho** |
| RF-411 | La única puerta del almacén hacia fuera: los bytes llegan al dispositivo con el nombre nuestro y no con el del almacén, no se guarda nada a medias cuando el almacén contesta error, y los seis fallos —firma que no llega, red cortada antes de pedir, red cortada a mitad del fichero, permiso caducado, fichero que ya no está y error del almacén— salen como una frase en español que nombra el fichero, no lleva jerga y termina en algo que hacer; un 404 no invita a repetir el gesto, porque repetirlo no lo arregla nunca. En `download.test.ts` | **Hecho** |
| RF-411, RF-420 | El apartado «Descargar esta fotografía» de la ficha, que es JSX y no se finge: que el desplegable se abre sin pelearse con el gesto de pasar fotografías, que el botón se deshabilita mientras dura y no dispara dos descargas, que el aviso de error y el de éxito se anuncian con lector de pantalla, y **que el fichero se guarda en vez de abrirse en una pestaña** en Safari de iOS y en Firefox, que es la razón entera del cambio. Y el precio conocido de la decisión: un original de veinte megas pasa entero por memoria en un teléfono modesto | Pendiente en navegador |
| RF-414, RF-419, RF-1205 | Los mandos de color en la pantalla de la catalogadora: los dos botones redondos de la cabecera, el panel al pie intercambiando la fila de herramientas, la tabla aplicada a la fotografía y **no** al contenedor de las asas —teñiría las asas y rompería el apilamiento—, la lupa aplicando la tabla antes de pintar su retícula, la tira de valor operable con las flechas y con Inicio/Fin sin depender de ningún gesto, y Escape cerrando el panel en vez del editor, que hoy volvería atrás y perdería el trabajo. Son píxeles y gestos, como el resto del editor | Pendiente en navegador |
| RF-418 | La página de explicación del testigo y su hoja imprimible: el PDF sale a A5 con los parches en la disposición que el detector espera, y las ilustraciones se entienden sin leer el texto | Pendiente en navegador |
| RF-420 | Que la copia a resolución completa se genera de verdad en un móvil: por bandas, sin leer nunca la imagen entera de una vez, con la sonda de capacidad del lienzo decidiendo **antes** de intentarlo. El entorno de test no tiene `canvas`, así que el techo real solo se ve en el dispositivo | Pendiente en navegador |
| RF-420, RF-421 | **Sin verificar de punta a punta:** guardar de verdad la copia a resolución completa y vaciar la cola de pendientes. El permiso de subida ya acepta las dos clases de ruta desde el 3 de agosto de 2026 —`SIGNABLE_KINDS` en `supabase/functions/sign-file/paths.ts`, con tests en los dos sentidos en `signFilePaths.test.ts`—, pero ni el navegador ni la herramienta local han guardado todavía una copia contra el almacén real, y no hay ninguna fila pendiente en la base con la que probarlo. Lo que sí está cubierto es todo lo que llega hasta ese borde: los tres estados de la fila, el rechazo de la firma convertido en «pendiente» con su razón, y la negativa a guardar en una ruta con forma de máster. Se cierra corrigiendo una fotografía en un dispositivo y bajando después su copia | Pendiente en navegador |
| RF-421 | La herramienta local, contra una fila real de la base y un fichero real en el almacén. Hoy solo se ha ejercitado contra una API falsa y sobre el máster más grande del espejo local, comprobando que el original queda **byte a byte igual**. La igualdad que RF-421 exige de verdad —la tabla de color de las dos implementaciones— sí está cerrada, en la fila del fichero de casos compartido | Pendiente |

#### Detección de bordes de la fotografía (RF-410)

La aritmética se verifica con imágenes sintéticas en `edgeDetection.test.ts` —es lo único con verdad
de referencia— y el acierto sobre fotografías reales se mide con el banco de `scripts/bordes/` contra
las 44 tomas del volcado, comparando con el recorte que la catalogadora guardó. Las dos cosas hacen
falta: los tests sintéticos no vieron que la función sugería mal en dieciséis de treinta y seis
fotografías reales, y el banco no puede decir si un recorte es exacto porque no hay verdad que
comparar, solo un criterio. El estado medido está en
[`revision/deteccion-de-bordes-medicion.md`](revision/deteccion-de-bordes-medicion.md).

| Requisito | Qué debe verificar el test | Estado |
|---|---|---|
| RF-410 | La sugerencia encuentra un cuadro centrado, descentrado, más oscuro que la pared y con ruido; ofrece marco y lienzo cuando están claramente anidados y uno solo cuando no; y viaja al fotograma girado | **Hecho** |
| RF-410 | **No** sugiere cuando faltan lados en el encuadre, cuando los lados son una textura que alterna de dirección, cuando la proporción es imposible o cuando no hay contraste. Y sí cuando un objeto interrumpe un borde un tercio de su longitud, dejando el lado en su sitio | **Hecho** |
| RF-410 | El detector dice POR QUÉ declina, con los números de la decisión: nueve motivos distinguidos, que es lo que permite saber si un silencio es un acierto o una regla llevándose un borde por delante | **Hecho** |
| RF-410 | Límite escrito y no promesa: el soporte de línea impide que una textura pase por borde, pero no sabe decidir cuál de dos bordes reales es el de la obra | **Hecho** |
| RF-410 | Sobre las 44 fotografías reales: 16 sugerencias, ninguna mala, IoU mediana 0,986. Se mide con `node scripts/bordes/medir.mjs`, no con un test automático: depende de un volcado que no está en el repositorio | Medido a mano |
| RF-409, RF-410 | Las cuatro esquinas: las ocho columnas o ninguna, una esquina puede salirse del encuadre pero no irse, un cuadrilátero cruzado o degenerado se rechaza —rectificar un lazo da una imagen doblada—, y el recorte y las esquinas conviven, que es lo que permite desplegar en una fase. Y la procedencia del encuadre nace desconocida y no «a mano». Cubierto en `image_perspective.test.sql` | **Hecho** |
| RF-410 | La geometría de la homografía: lleva el cuadrado unidad a las cuatro esquinas, mantiene rectas las rectas, no manda el centro al centroide, un paralelogramo devuelve tercera fila exactamente cero, la inversa la deshace, y el `matrix3d` de CSS es por columnas. Cubierto en `perspective.test.ts` | **Hecho** |
| RF-410 | El encuadre por esquinas: mandan sobre el recorte, unas esquinas que son un rectángulo se guardan como recorte, ida y vuelta por las columnas, una fila con esquinas a medias o cruzadas se lee sin enderezar, y la vía degradada lanza en vez de componer. Cubierto en `imageEdits.test.ts` | **Hecho** |
| RF-410, RF-1205 | Acercar y desplazar la foto al colocar esquinas: rueda del ratón, pinza y desplazamiento con dos dedos, dos toques para volver, las asas conservan su tamaño en pantalla y arrastrar una asa con zoom sigue al dedo píxel a píxel. Y la vista previa se arrastra y se queda donde se deja. Comprobado a mano en el navegador con eventos de puntero táctiles el 1 de agosto de 2026 | Comprobado a mano |
| RF-410, RF-1205 | Los gestos del editor, con toques reales del navegador y no sintéticos: un dedo o el ratón desplazan la foto desde el fondo y desde dentro del recorte, sobre un asa la arrastran, el asa central mueve el recuadro entero y responde a las flechas, la rueda y los dos toques siguen funcionando, y al levantar un dedo de la pinza el que queda toma el desplazamiento. **La pinza tiene precedencia**: con un dedo sobre un asa acerca sin moverla, y el segundo dedo cancela un arrastre ya empezado. Comprobado en los dos modos, rectángulo y perspectiva. Diecinueve comprobaciones sobre el editor montado aparte, dirigidas con Playwright sobre Chromium el 1 de agosto de 2026, con el andamio fuera del repositorio | Comprobado a mano |
| RF-410, RF-1205 | La botonera del editor en la pantalla de la catalogadora (390×844): el encuadre es un eje de tres estados y la ida y vuelta rectángulo → perspectiva → rectángulo deja el encuadre intacto; la botonera mide 176 px en los tres estados —antes 356, 440 y 472— y la fotografía gana 264 px recortando y 296 corrigiendo perspectiva; la ayuda baja de dos párrafos y 474 caracteres a una línea que nombra el encuadre puesto, porque los seis botones son iconos sin texto. «Volver al original» aparece solo con un giro que deshacer —sin él hacía lo mismo que «sin recorte»— y sobre la copia de consulta se muestra apagado con el motivo. Medido con Playwright sobre Chromium el 1 de agosto de 2026 | Comprobado a mano |
| RF-410 | La foto girada un cuarto de vuelta se dibujaba achatada —el `max-width: 100%` del preflight recortaba el ancho pedido, 720×540 pedidos y 540×540 dibujados— y de ahí salían el trapecio descolocado y la lupa apuntando a otro sitio. Comprobado en los cuatro giros sobre una imagen de control con un cuadro torcido y cuatro parches de color: la foto conserva su proporción y llena el área, el trapecio sugerido cae sobre el cuadro con menos de un 1 % de error y la lupa pinta el color exacto del parche que hay bajo la esquina. Trece comprobaciones con Playwright sobre Chromium el 1 de agosto de 2026 | Comprobado a mano |
| RF-410 | La vista previa del enderezado gira con la fotografía y sale recta en los cuatro giros. Comprobado sobre una imagen de control cuyo cuadro torcido lleva un cuadrante de color en cada esquina: se captura el panel tal como lo pinta el navegador, con la homografía ya aplicada, y se leen sus cuatro esquinas. Con el fallo delante, la previa contestaba «rojo, verde, azul, magenta» dieran las vueltas que dieran. Comprobado con Playwright sobre Chromium el 1 de agosto de 2026 | Comprobado a mano |
| RF-410 | Que el giro se lleve TODO lo dibujado sobre la foto —recorte, esquinas y sugerencia guardada— y que cuatro cuartos de vuelta devuelvan el encuadre intacto. La incidencia era que las esquinas se quedaban en el marco anterior. Cubierto en `imageEdits.test.ts` (`rotateEdit`) | **Hecho** |
| RF-410 | El rectificado en el navegador y las cuatro asas del editor: son canvas e interfaz, y se comprueban a mano en el navegador hasta que Playwright esté montado. Comprobado el 1 de agosto de 2026: las cuatro asas, el rechazo del cuadrilátero cruzado en el dedo, la previsualización rectificada y el botón deshabilitado sobre la copia de consulta | Comprobado a mano |

### Catálogo razonado documental (RF-500)

Este grupo estaba entero en «Pendiente» porque **ninguna de sus tablas existía**. Se construyó el 4 de
agosto de 2026 y aquí está la correspondencia, seis ficheros de SQL —`parties`, `provenance`,
`bibliography`, `exhibitions`, `archive_documents` y `documentary_policies`— más los dos de visibilidad
que ya tienen sus filas en los bloques de RLS y de papelera.

Lo que **sigue Pendiente de este grupo, y conviene no perderlo de vista**, es la mitad de interfaz: no
hay ficha propia ni búsqueda dedicada de Exposición, Bibliografía, Documento ni Propietario (RF-309,
RF-606). Los bloques se ven y se editan desde la ficha de obra, y desde ahí no se llega a ninguna
página de la exposición.

| Requisito | Qué debe verificar el test | Estado |
|---|---|---|
| RF-501 | La misma obra participa en varias exposiciones y la misma exposición contiene varias obras; una obra participa **una sola vez** en cada muestra; volver a añadir una participación retirada la **restaura** con su número y su nota; y un Lector no expone. Cubierto en `exhibitions.test.sql` | **Hecho** |
| RF-502 | El historial expositivo se ordena de forma ascendente contra la base, y el formato de la línea —año, fechas, título en cursiva, institución y lugar— se compone en `exhibitionHistory.test.ts` y `documentaryFormat.test.ts`, con la fecha incompleta y la sede sin localidad resueltas sin dejar hueco | **Hecho** |
| RF-503 | El catálogo de la muestra vive en la bibliografía y no en una tabla propia: la clave ajena existe, apunta a una referencia y rechaza una inexistente. Cubierto en `exhibitions.test.sql`. **Falta** que la navegación en ambos sentidos exista: no hay ficha de exposición ni de referencia adonde ir | Parcial |
| RF-504 | `pages` y `note` son dos columnas y no una, consultables sin analizar prosa; una obra se cita una vez en cada referencia; volver a añadir una cita retirada la restaura **con sus páginas**. Cubierto en `bibliography.test.sql`, y la composición de la cita en `citationFormat.test.ts` y `citationGroups.test.ts` | **Hecho** |
| RF-507 | La exportación produce un `.bib` procesable, con todas las entradas y claves únicas | ~~Retirado~~ (9.1): es del catálogo impreso, fuera de alcance |
| RF-508 | Una ficha mínima de persona o institución entra; el tipo y el estado de contacto son enumerados cerrados que no admiten texto libre; **el tipo no ofrece «Sin revisar»**, que es la excepción consciente a RF-205; un nombre en blanco no identifica a nadie; la traza de autoría la sella la base; la papelera sella y se deshace; y nadie borra de verdad. Cubierto en `parties.test.sql`, y la elección de parte y su línea publicable en `partyChoice.test.ts` y `documentaryFormat.test.ts` | **Hecho** |
| RF-509 | La cadena: un eslabón dice de quién habla; **el orden lo pone la catalogadora y no las fechas**; rehacer el orden es todo o nada; un Lector no reordena; los tres enumerados son cerrados; la fecha tiene la forma de ADR-004 y el caso de comprada y vendida el mismo año entra. Cubierto en `provenance.test.sql`, y lo que la pantalla decide en `provenanceChain.test.ts` (73 casos) y `provenanceDraft.test.ts` | **Hecho** |
| RF-510 | El relato narrativo y la cadena conviven: con texto, el relato es lo que se imprime; vacío, la ficha compone la línea con los eslabones. Cubierto en `provenance.test.sql` y `provenanceChain.test.ts` | **Hecho** |
| RF-511 | Una persona o institución que sostiene una cadena activa, que es titular de derechos o que está detrás de una sede activa **no se retira**, y las tres puertas se comprueban una por una a medida que cada migración añade la suya. Cubierto en `provenance.test.sql` y `exhibitions.test.sql`. La otra mitad de RF-511 —que el Lector no llega al contacto de un tercero por la procedencia de una obra retirada— está en el bloque de RLS | **Hecho** |
| RF-512 | Una sede se distingue por nombre **y** localidad, no solo por nombre; una sede en uso no se retira; la institución detrás de la sede es una relación; y **la sede no es el árbol de lugares**, comprobado con un aserto propio para que nadie las funda dentro de un año. Cubierto en `exhibitions.test.sql` | **Hecho** |
| RF-513 | El número de catálogo de la muestra es columna aparte de la nota: se puede consultar sin analizar prosa, y «12 bis» y «s/n» entran tal cual. Cubierto en `exhibitions.test.sql`, y su lugar en la línea impresa en `exhibitionHistory.test.ts` | **Hecho** |
| RF-514 | El vocabulario de tipos de publicación nace sembrado y **la usuaria lo amplía sin migración**; un tipo en uso no se retira; un tipo es único por clave de comparación; y el nombre de la publicación que contiene el artículo es dato aparte del título. Cubierto en `bibliography.test.sql`, `citationFormat.test.ts` y `referenceChoice.test.ts` | **Hecho** |
| RF-515 | Los tipos de documento como vocabulario abierto, y el **árbol archivístico** con las mismas tres reglas que los lugares: hermanos y raíces homónimas rechazadas, el árbol no se cierra sobre sí mismo, y una serie con subseries o documentos dentro no se retira. Más el fichero digitalizado de todo o nada, la signatura única y editable, la fecha de ADR-004, y **el límite de tamaño del bucket comprobado y no supuesto**. Cubierto en `archive_documents.test.sql` (57 asertos) y `documentView.test.ts` | **Hecho** |
| RF-516 | Un documento se cuelga de **varias** obras y de varias exposiciones sin duplicar el fichero; se vincula una vez con cada una; volver a vincularlo lo restaura. Cubierto en `archive_documents.test.sql`, y la oferta del fichero al descargarlo en `documentFile.test.ts` | **Hecho** |
| RF-517, RF-903 | **La revisión de RF-903, ejercida y no solo escrita:** retirar una participación, una cita, un vínculo de documento o una relación **no la borra** —se comprueba que la fila sigue ahí—, y volver a añadirla la restaura con lo que llevaba dentro en vez de chocar contra la unicidad. En las cinco puentes. Cubierto en `bibliography.test.sql`, `exhibitions.test.sql`, `archive_documents.test.sql`, `artwork_relationships.test.sql` y `provenance.test.sql`, y por el otro lado por `rls_default_deny.test.sql`, que pondría el fichero en rojo ante cualquier política de `delete` | **Hecho** |
| RF-109, RF-111, RF-113 | El perímetro de las quince tablas documentales, autenticándose de verdad: cada una con RLS y **exactamente tres políticas**, los privilegios medidos y no supuestos, el rol anónimo sin llegar a ninguna, el Lector leyendo lo activo y sin ver la papelera, el Catalogador escribiendo las quince de verdad, nadie borrando, y las cinco RPC ejercidas. Cubierto en `documentary_policies.test.sql` | **Hecho** |
| RF-309, RF-606 | La ficha propia y la búsqueda dedicada de Exposición, Bibliografía, Documento y Propietario. **No hay nada que probar todavía**: las tablas existen y las pantallas no | Pendiente |
| RF-304, RF-1205 | Que los bloques documentales de la ficha se vean y se operen con el pulgar: los 15 componentes son JSX y los verifican el compilador y sus partes puras, que sí están cubiertas arriba. Ni un aserto de renderizado | Pendiente en navegador |

### Índices y búsqueda (RF-600)

| Requisito | Qué debe verificar el test | Estado |
|---|---|---|
| RF-602 | Cada filtro reduce el conjunto por separado, y dos filtros combinados aplican ambas condiciones a la vez | Pendiente |
| RF-602 | El filtro de ubicación es jerárquico sobre el árbol (ADR-006): un lugar marcado responde por todo lo que tiene dentro y no hacia arriba; «Sin ubicación» encuentra las obras sin sitio; un identificador que ya no existe no encuentra nada en vez de encontrarlo todo; y mientras el árbol no ha llegado el filtro se salta en vez de aplicarse contra un conjunto vacío. Cubierto en `listView.test.ts` | **Hecho** |
| RF-602 | El selector del filtro ofrece el árbol entero rama por rama, dice de qué lugar cuelga cada nodo, deja fuera los retirados y mantiene visible el que esté marcado. Cubierto en `listView.test.ts` | **Hecho** |
| RF-602 | La búsqueda de texto libre encuentra por `id_catalogacion`, por `titulo` y por `titulos_alt` | Pendiente |
| RF-604 | El contador de resultados y la paginación son coherentes con el total, incluida la última página incompleta | Pendiente |
| RF-605 | Una búsqueda sin resultados devuelve 200 con el mensaje esperado, no una página vacía ni un 404 | Pendiente |
| RF-607 | El enlace desde una serie o un propietario abre el índice de obras con el filtro ya aplicado | Pendiente |
| RF-608 | Volver al listado conserva filtros y número de página | Pendiente |
| RF-608 | La fotografía abierta viaja en la ruta (`/artwork/:id/photos/:imageId`): sobrevive a la recarga, se comparte como enlace, cambiar de miniatura no apila entradas de historial, y un identificador que la obra no tiene se corrige a la principal. Comprobado a mano en el navegador el 1 de agosto de 2026 | Comprobado a mano |
| RF-608 | Un enlace compartido con la ubicación en texto (`?location=…`, anterior a ADR-006) se resuelve contra el árbol y se reescribe a identificadores; lo que ya no existe se descarta sin romper el enlace. Cubierto en `listView.test.ts` | **Hecho** |
| RF-609 | Una ficha dada de baja desaparece de índices y de resultados de búsqueda | Pendiente |
| RF-610 | El texto buscado va y vuelve de la URL, y la vista recordada del dispositivo no lo guarda. Cubierto en `listView.test.ts` | **Hecho** |
| RF-602 | El filtro de serie ofrece «Sin serie» siempre y en primer lugar, selecciona las obras sin serie asignada y solo esas, se combina con nombres como un «o», y va y vuelve de la URL como `series=`. Cubierto en `listView.test.ts` | **Hecho** |

### Bloqueo de edición (RF-700)

| Requisito | Qué debe verificar el test | Estado |
|---|---|---|
| RF-701 | Un segundo Catalogador no puede entrar en edición de una ficha ya bloqueada | Pendiente |
| RF-702 | Abrir la ficha en consulta no crea bloqueo | Pendiente |
| RF-703 | Guardar libera el bloqueo; cancelar también | Pendiente |
| RF-704 | Un bloqueo con la marca de tiempo caducada deja de impedir la edición, sin intervención manual | Pendiente |
| RF-705 | El aviso identifica al usuario que tiene la ficha y desde cuándo | Pendiente |
| RF-706 | El desbloqueo forzado por otro Catalogador libera el bloqueo | Pendiente |
| RF-707 | La respuesta para un Lector no incluye el aviso de bloqueo (INC-21) | Pendiente |
| RF-708 | **El *trigger* rechaza la escritura de un segundo usuario aunque la petición no venga de la interfaz.** Se verifica atacando la API directamente con la sesión del segundo catalogador, saltándose el frontend: es el único test que demuestra que el bloqueo es un bloqueo y no una advertencia | Pendiente |
| RF-708 | El *trigger* permite la escritura al usuario que sí tiene el bloqueo, y también cuando no hay ningún bloqueo activo | Pendiente |

### Trazabilidad (RF-800)

| Requisito | Qué debe verificar el test | Estado |
|---|---|---|
| RF-801 | Cualquier cambio actualiza `fecha_actualizacion` | Pendiente · **y hay una trampa que conviene saber antes de intentarlo**: el sello usa la hora de la *transacción*, así que dentro de un test —que es una sola transacción— la fecha vale lo mismo antes y después y no hay forma de verla moverse. Verificarlo exige dos transacciones o comparar contra la de creación |
| RF-802 | Un cambio en un campo de fase 1 actualiza `fecha_actualizacion_basica`; un cambio de fase 2 **no** la actualiza. Con el árbol de lugares (ADR-006): cambiar la obra de sitio la mueve, renombrar el sitio no (`artwork_physical_place.test.sql`) | **Hecho** |
| RF-803 | `actualizado_por` recoge el usuario de la sesión que guardó | **Hecho** · en el alta lo comprueba `function_privileges.test.sql`, y en el cambio `change_log_writer.test.sql`: la obra la crea el Catalogador y la modifica el Superusuario, y se afirma el valor exacto en los dos momentos, no solo que cambió |
| RF-804 | Las seis tablas con clave primaria propia disponen de los tres campos (INC-09) | Pendiente |

### Papelera (RF-900)

| Requisito | Qué debe verificar el test | Estado |
|---|---|---|
| RF-901 | Dar de baja no borra la fila, y el borrado real está negado a todos los roles por ausencia de política y de privilegio | **Hecho** |
| RF-902 | La baja rellena fecha y usuario; la restauración rellena los suyos y no borra la traza de la baja | **Hecho** |
| RF-903 | Eliminar una fila puente la borra realmente, y volver a crearla no deja rastro | Pendiente |
| RF-904 | Dar de baja una imagen no afecta a su obra; dar de baja una participación no afecta a obra ni exposición | Pendiente |
| RF-905, RF-910 | Un test por cada fila de la tabla de cascada: obra, exposición, referencia, serie y propietario. Hechas la obra —sus cinco filas documentales—, la exposición y la referencia, en `documentary_visibility.test.sql`, y con el criterio escrito en RF-910 a RF-913: lo que se propaga es la visibilidad y no el dato, así que restaurar devuelve el expediente entero. Faltan serie y propietario, que no ocultan filas sino que dejan el campo vacío, y falta la fotografía | Parcial |
| RF-911 | Una fila que une dos fichas se ve si se ven las dos: una cita cuya referencia está en la papelera, una participación cuya exposición lo está, un documento retirado y el expediente de una exposición retirada no se enseñan aunque la obra siga activa. Y una relación entre obras se comprueba por **los dos extremos**, con la obra retirada una vez en cada columna, porque el disparador de canonicalización puede dejarla en cualquiera de las dos. Cubierto en `documentary_visibility.test.sql` | **Hecho** |
| RF-912 | El documento compartido: con la obra de baja y la exposición activa, el Lector deja de ver que ese documento documenta la obra y sigue viendo su ficha y su sitio en el expediente de la exposición. Cubierto en `documentary_visibility.test.sql` | **Hecho** |
| RF-913 | **El aserto que el arreglo no puede romper:** el Catalogador sigue viendo la papelera entera —la obra, sus cinco filas documentales, las puentes con un extremo retirado y la parte de la procedencia—, porque es su forma de restaurar. Sin él, un arreglo de visibilidad que escondiera la papelera a todo el mundo pasaría por bueno y el trabajo se perdería en silencio. Cubierto en `documentary_visibility.test.sql` y `rls_role_matrix.test.sql` | **Hecho** |
| RF-906 | Los filtros de la papelera funcionan por tabla de origen, fecha y usuario; «Restaurar» devuelve la ficha a los índices | Pendiente |
| RF-906 | Un Lector recibe 403 en la papelera | Pendiente |
| RF-908 | Una ficha restaurada conserva su clave primaria original | Pendiente |

### Ficha imprimible (RF-1000)

| Requisito | Qué debe verificar el test | Estado |
|---|---|---|
| RF-1002 | La vista incluye los campos especificados, y el marcador cuando no hay imagen. Cubiertos en `recordPdf.test.ts` los campos, la imagen representativa incrustada, su colocación en la banda del pie y el marcador «Imagen no disponible», también cuando falla la descarga. La ubicación se imprime como la rama del árbol («Castelar 4, mesa de Mario») y la obra sin lugar se declara en vez de dejar hueco. Falta la serie, cuya tabla aún no existe | Parcial |
| RF-1003 | El QR se genera y su contenido es la URL absoluta de la ficha completa. Cubiertos en `recordPdf.test.ts` la composición de la URL, la presencia del QR en el documento y su colocación en la cabecera, por encima de la fotografía y sin encoger nunca. Falta descodificar el QR impreso para comprobar que lo que codifica es esa URL | Parcial |

### Navegación (RF-1100)

| Requisito | Qué debe verificar el test | Estado |
|---|---|---|
| RF-1102 | Las migas de pan reflejan la jerarquía correcta en cada tipo de página | Pendiente |
| RF-1103 | Los indicadores de la página de inicio coinciden con el contenido real de la base de datos | Pendiente |
| RF-1104 | El botón de alta no aparece para un Lector | Pendiente |
| RF-1106 | La pantalla de ubicaciones crea, renombra, mueve y retira, y no aparece para un Lector. Sin cubrir: es interfaz y necesita un recorrido de navegador. Las reglas que protege —hermanos homónimos, ciclos, lugar con obras dentro— sí están cubiertas en `physical_places.test.sql` y `artwork_physical_place.test.sql` | Parcial |
| RF-1106 | Las pantallas de tipos de obra y de series crean, renombran y retiran, muestran el fondo de cada serie y lo eligen al crearla, y ninguna se alcanza siendo Lector. Sin cubrir por test automático: es interfaz y necesita un recorrido de navegador. La lógica que sí se puede probar sin red está en `masterTables.test.ts`, y las reglas que la pantalla no repite —nombre único, no retirar lo que tiene obras dentro, quién puede renombrar— en `master_table_keys.test.sql` | Parcial |
| RF-1106 | **Sin cubrir, y es lo que más lo necesita:** al renombrar un tipo o una serie, la interfaz arrastra además la copia en texto de `artworks.artwork_type` / `artworks.series`, porque el disparador de vocabulario exige que ese texto esté en el catálogo y sin arrastrarlo las obras afectadas no se pueden volver a guardar. Son dos peticiones sin transacción: si falla la segunda, el mensaje lo dice, pero nada lo prueba. La cobertura real llega cuando esas dos columnas de texto desaparezcan; hasta entonces, una función en la base haría atómico el renombrado y sería la forma de poder probarlo | Pendiente |

### Aplicación instalable y captura en móvil (RF-1200)

Los recorridos se ejecutan con un perfil de móvil real de Playwright, no con una ventana de escritorio
estrechada: lo que se verifica es un gesto táctil de una sola mano, no un ancho de pantalla.

| Requisito | Qué debe verificar el test | Estado |
|---|---|---|
| RF-1201 | El manifiesto es válido y cumple los criterios de instalación: nombre, iconos en los tamaños exigidos, `display` y `start_url` | Pendiente |
| RF-1202 | Con la red cortada, el armazón de la aplicación carga; y **no** aparecen datos de fichas, que es lo que debe ocurrir | Pendiente |
| RF-1203 | Un intento de guardar sin conexión falla de forma explícita y comprensible, no en silencio ni con una cola que el usuario crea que se enviará | Pendiente |
| RF-1204 | El recorrido completo de captura rápida crea una ficha válida con solo los campos mínimos, y la ficha queda correctamente marcada como incompleta | Pendiente |
| RF-1205 | Los campos numéricos abren teclado numérico; ningún control depende de pasar el cursor por encima; los objetivos táctiles alcanzan el tamaño mínimo | Pendiente |
| RF-1207 | Una subida interrumpida se puede reintentar sin volver a rellenar los campos, y no deja una fila a medias en la tabla Imágenes | Pendiente |

### Registro de cambios (RF-1500)

Este grupo tiene **dos mitades que se necesitan**, y conviene decirlo aquí porque la mitad que falló
fue la que no se estaba mirando: que nadie pueda escribir el registro, y que el registro se escriba.
Un registro inviolable y vacío no es más seguro que no tener registro, es la apariencia de tenerlo.
Estuvo exactamente así entre `20260805120000` y `20260805140000`: la tabla, sus privilegios y sus tres
candados aplicados y en verde, **cero funciones de escritura y cero filas**. La primera mitad está en
`change_log.test.sql` y la segunda en `change_log_writer.test.sql`.

| Requisito | Qué debe verificar el test | Estado |
|---|---|---|
| RF-1501 | La tabla del registro existe con RLS activada y su única política es de lectura (`change_log.test.sql`) | **Hecho** |
| RF-1502 | Una fila por campo cambiado, con la representación **almacenada** del valor (`'54.00'`, no «54 cm»; la cadena vacía no es un nulo) y un solo identificador de operación para los campos de un mismo guardado. Y el paso de nulo a valor y de valor a nulo, en los dos sentidos, que es el cambio más común del catálogo y el que se perdería con una comparación que no distinga el nulo (`change_log_writer.test.sql`) | **Hecho** |
| RF-1503 | El alta deja una línea sin campo; el cambio, la retirada y la restauración dejan la suya con su verbo. Se comprueba el **autor exacto** para el Catalogador y para el Superusuario, y que un alta sin identificador se registra con la clave que le asignó la base (`change_log_writer.test.sql`) | **Hecho** |
| RF-1504 | **Los doce intentos**: `insert`, `update` y `delete` por el Lector, el Catalogador, el Superusuario y el anónimo, y los doce fallan — y fallan **por privilegio**, que es la primera de las dos cerraduras de RF-113 y la única que para a un cliente que se salte la interfaz. Más los cuatro verbos por el propietario de la tabla y por el rol del panel, a quienes solo para el candado. Se ejercen **sobre una tabla con filas de verdad**, para que un `update` que afecta a cero filas no pueda pasar por un fallo (`change_log.test.sql`, `change_log_writer.test.sql`, `rls_role_matrix.test.sql`) | **Hecho** |
| RF-1505 | No existe camino de vuelta: ninguna función que lea el registro y escriba en el catálogo, **ninguna que reciba un identificador de operación** —que es la firma que tendría un «deshacer esta acción»—, ninguna vista que se salte la política, y el escritor sigue siendo una función de *trigger* y no invocable (`change_log_writer.test.sql`) | **Hecho** |
| RF-1506 | La visibilidad se hereda de la ficha auditada, comprobada **sobre líneas escritas por el propio mecanismo** y no solo sobre fixtures puestos a mano: el Lector no ve la historia de una obra retirada ni de una fotografía retirada de una obra activa, y el Catalogador y el Superusuario sí (`change_log_writer.test.sql`, `change_log.test.sql`, `rls_role_matrix.test.sql`) | **Hecho** |
| RF-1507 | El vaciado de golpe está cerrado también para quien se salta la RLS, y no hay interruptor de silencio (`change_log.test.sql`) | **Hecho** |
| RF-1508 | La interfaz traduce los nombres de campo y los valores al español | Pendiente · es de la interfaz, y la pantalla del historial no existe |
| RF-1509 | Las marcas de traza y las columnas derivadas **no** se anotan, y el bloque lo demuestra **al revés primero**: comprueba que el autor de actualización y la fecha básica cambiaron de verdad, y que la columna derivada cambió de verdad, antes de afirmar que el registro no las menciona. Sin ese paso, «no hay línea de X» sería trivialmente cierto porque X no se movió. Y `activa` **no** está entre los descartes, comprobado con un aserto propio (`change_log_writer.test.sql`) | **Hecho** |
| RF-1510 | Un guardado con los mismos valores actualiza la fila y escribe **cero** líneas. Medido con recuento antes y después, y comprobando que el guardado tocó de verdad la fila (`change_log_writer.test.sql`) | **Hecho** |
| RF-1511 | No hay relleno retroactivo: la migración del escritor no escribe una sola línea al aplicarse, medido sobre las 22 obras y 39 fotografías de la base local | **Hecho** · medido al aplicar, sin test propio: un test no puede comprobar que algo no ocurrió en el pasado |
| RF-1512 | **Todos los caminos de escritura**, uno por uno: el cambio directo, el que hace **otro mecanismo automático** —recalcular si la obra tiene fotografías, con el autor de la sesión que lo provocó—, el de una función que se salta las políticas, y el de una sesión administrativa sin usuario, que se anota con autor nulo (`change_log_writer.test.sql`) | **Hecho** |

Fila propia para lo que **no** cubre ningún test y hay que saber que no cubre:

| Hueco | Por qué importa | Estado |
|---|---|---|
| El escritor enganchado como BEFORE en vez de AFTER | Medido: la obra **no se crea** y el registro **sí anota** su alta, sin ningún error. La causa es que el escritor termina devolviendo nulo, que en un BEFORE significa «descarta esta fila en silencio». Sería la peor combinación de las dos mitades: altas que se pierden y un registro que certifica creaciones que no ocurrieron. Cubierto con un aserto estructural en la migración y otro en `change_log_writer.test.sql`, no con un caso funcional | **Hecho** · como aserto de forma |
| Un cambio de rol de usuario | Es probablemente el cambio más sensible del sistema y no deja rastro: el registro no audita la tabla de perfiles, y es una decisión del propietario que sigue fuera de alcance | **Fuera de alcance**, escrito |
| El expediente documental y los enlaces externos | El registro solo audita obras y fotografías. La decisión sobre el historial del contacto de un tercero (RF-105) está pendiente y tiene que tomarse con esa columna delante | Pendiente |

### Infraestructura

| Requisito | Qué debe verificar el test | Estado |
|---|---|---|
| RNF-104 | `terraform fmt -check` y `terraform validate` sobre los dos módulos de `infra/` | **Hecho** |
| RNF-111 | Ningún bucket es públicamente legible: se comprueba contra la infraestructura ya aplicada, no solo en el plan | Pendiente |
| RNF-113 | El volcado periódico se produce, llega al bucket y **es restaurable**: un volcado que nadie ha intentado restaurar no es una copia de seguridad | Pendiente |

---

## Requisitos que no se verifican con tests automáticos

No por descuido, sino porque su verificación es de otra naturaleza. Se comprueban a mano y se anotan
aquí para que su ausencia del listado anterior no se lea como un hueco de cobertura.

| Requisito | Cómo se verifica |
|---|---|
| RF-405, RF-407 | Interacción de ratón y táctil sobre las miniaturas: revisión manual en navegador |
| RF-1004 | Resultado real de impresión: revisión manual del PDF y del papel |
| RF-409, RF-410 | Los píxeles del giro y del recorte: el entorno de test no tiene `canvas` ni `createImageBitmap`, así que la geometría se prueba sola y el dibujo se comprueba en el navegador. Con ella, que reeditar una foto escriba rutas nuevas y no reutilice ninguna |
| RF-410 | El dibujo de la lupa (`imageLoupe.ts`): necesita `canvas`. Que amplía la esquina que se está ajustando, que con giro activo se ve como en pantalla y que no rompe el arrastre cuando no hay contexto de dibujo, se comprueba en el navegador |
| RF-410 | La sugerencia de recorte sobre fotografías reales de cuadros: el detector se prueba con imágenes sintéticas, pero lo que acierta o falla con un marco dorado, un reflejo o una pared con rodapié se comprueba en el navegador. Por el mismo motivo, la extracción de luminancia (`imageEdges.ts`) no tiene test: necesita `canvas` |
| RF-1206 | Que la cámara se abra de verdad: los navegadores sin dispositivo real la simulan, así que se comprueba en un teléfono |
| RNF-105 | Idioma y zona horaria: visible en cualquier test de interfaz, sin test propio |
| RNF-106 | Usabilidad en móvil de pie y con una mano, con la obra delante y en el almacén. Ningún test automático cubre esto, y es el criterio de éxito del proyecto |
| RNF-108, RNF-110 | Volumen almacenado y umbral de los 100 GB: seguimiento en explotación, no test |
| RNF-112 | Regla 3-2-1 de los másters: revisión periódica de que las tres copias existen y están al día |
| DP-09 | Formato del máster: decisión archivística, no verificable con código |
