# Plan de pruebas

Correspondencia entre los requisitos de [`requisitos.md`](requisitos.md) y los tests que los verifican.

**Estado actual: 44 asertos en verde** — 21 de SQL y 23 del frontend — sobre la primera entrega
(captura básica de obra). El resto del documento define lo que falta, para que ningún requisito se dé
por implementado sin verificación. La columna «Estado» se actualiza a medida que los tests existen.

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
| RF-105 | Un Lector lee las obras activas y no puede modificarlas. `contacto` cuando exista la tabla | Parcial |
| RF-108 | Un Catalogador no puede modificar su propio rol en la tabla de perfiles, ni el de otro usuario. Y el acceso administrativo directo sí puede: sin eso no habría forma de promover al primer superusuario | **Hecho** |
| RF-112 | El registro está deshabilitado: un intento de alta de cuenta desde el cliente es rechazado | Pendiente |
| RF-609 | Las políticas o las vistas excluyen las fichas de baja para el Lector, de modo que la exclusión no dependa solo de que el frontend recuerde filtrar | Pendiente |
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

### Ficha de obra (RF-300)

| Requisito | Qué debe verificar el test | Estado |
|---|---|---|
| RF-303 | La ficha renderiza los ocho bloques. Test de completitud: todo campo del esquema aparece en exactamente un bloque (cubre INC-06 e INC-16) | Pendiente |
| RF-304 | Un bloque sin datos muestra su texto explícito y no queda vacío | Pendiente |
| RF-305 | Los datos de relación se renderizan como enlace a la ficha correspondiente | Pendiente |
| RF-306 | Una obra con `estado_existencia` distinto de «Conservada» muestra el aviso en cabecera (INC-18) | **Hecho** |
| RF-307 | Un título atribuido se distingue visualmente de un título auténtico (INC-17) | **Hecho** |
| RF-308 | En modo edición, los campos de cabecera son editables salvo la clave primaria | Pendiente |

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
| RF-410 | La orientación EXIF se aplica al redimensionar: una foto tomada en vertical no acaba girada | Pendiente |
| RF-411 | Ninguna vista incluye la URL de un máster; la descarga se obtiene solo por URL firmada | Pendiente |
| RF-412 | Todo acceso a imágenes pasa por la función única de resolución de URL: un test estático que falla si algún componente construye una URL de bucket por su cuenta | Pendiente |
| RF-409, RF-410 | El encuadre guardado como dato solo admite giros de 0, 90, 180 y 270, y un recorte normalizado que es todo o nada y cae dentro de la imagen; una fotografía nueva nace sin giro ni recorte | **Hecho** |
| RF-409, RF-410 | El encuadre lo cambia quien puede editar; un Lector no, sin política nueva: las de «Imágenes» ya lo cubren | **Hecho** |
| RF-410 | Geometría de la edición: rotación acumulada, recorte de recorte, giro de 90° con recorte, rectángulo degenerado y arrastre de esquina que no invierte el rectángulo ni se sale de la imagen | **Hecho** |
| RF-410 | Sugerencia de recorte por perfiles de proyección, con fotografías sintéticas: cuadro centrado y descentrado detectado con precisión de pocos píxeles, cuadro más oscuro que la pared, marco y tela como dos candidatos anidados, y un solo candidato cuando el segundo rectángulo no está claramente dentro | **Hecho** |
| RF-410 | La sugerencia se niega antes que inventarse: pared sin cuadro, pared con ruido, cuadro oscuro sobre pared oscura sin contraste, proporción absurda, rectángulo demasiado pequeño, rectángulo que es casi todo el fotograma, bordes en una sola dirección e imagen demasiado pequeña | **Hecho** |

### Exposiciones y bibliografía (RF-500)

| Requisito | Qué debe verificar el test | Estado |
|---|---|---|
| RF-501 | La misma obra puede participar en varias exposiciones y la misma exposición contener varias obras, cada combinación con su nota | Pendiente |
| RF-502 | El formato de historial expositivo se genera literalmente como especifica el requisito, y ordenado de forma ascendente | Pendiente |
| RF-503 | Enlazar una exposición con el registro bibliográfico de su catálogo es navegable en ambos sentidos | Pendiente |
| RF-504 | `paginas` se conserva como dato aislado, consultable sin analizar texto libre | Pendiente |
| RF-507 | La exportación produce un `.bib` procesable, con todas las entradas y claves únicas | Pendiente |

### Índices y búsqueda (RF-600)

| Requisito | Qué debe verificar el test | Estado |
|---|---|---|
| RF-602 | Cada filtro reduce el conjunto por separado, y dos filtros combinados aplican ambas condiciones a la vez | Pendiente |
| RF-602 | La búsqueda de texto libre encuentra por `id_catalogacion`, por `titulo` y por `titulos_alt` | Pendiente |
| RF-604 | El contador de resultados y la paginación son coherentes con el total, incluida la última página incompleta | Pendiente |
| RF-605 | Una búsqueda sin resultados devuelve 200 con el mensaje esperado, no una página vacía ni un 404 | Pendiente |
| RF-607 | El enlace desde una serie o un propietario abre el índice de obras con el filtro ya aplicado | Pendiente |
| RF-608 | Volver al listado conserva filtros y número de página | Pendiente |
| RF-609 | Una ficha dada de baja desaparece de índices y de resultados de búsqueda | Pendiente |

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
| RF-801 | Cualquier cambio actualiza `fecha_actualizacion` | Pendiente |
| RF-802 | Un cambio en un campo de fase 1 actualiza `fecha_actualizacion_basica`; un cambio de fase 2 **no** la actualiza | **Hecho** |
| RF-803 | `actualizado_por` recoge el usuario de la sesión que guardó | Pendiente |
| RF-804 | Las seis tablas con clave primaria propia disponen de los tres campos (INC-09) | Pendiente |

### Papelera (RF-900)

| Requisito | Qué debe verificar el test | Estado |
|---|---|---|
| RF-901 | Dar de baja no borra la fila, y el borrado real está negado a todos los roles por ausencia de política y de privilegio | **Hecho** |
| RF-902 | La baja rellena fecha y usuario; la restauración rellena los suyos y no borra la traza de la baja | **Hecho** |
| RF-903 | Eliminar una fila puente la borra realmente, y volver a crearla no deja rastro | Pendiente |
| RF-904 | Dar de baja una imagen no afecta a su obra; dar de baja una participación no afecta a obra ni exposición | Pendiente |
| RF-905 | Un test por cada fila de la tabla de cascada: obra, exposición, referencia, serie y propietario | Pendiente |
| RF-906 | Los filtros de la papelera funcionan por tabla de origen, fecha y usuario; «Restaurar» devuelve la ficha a los índices | Pendiente |
| RF-906 | Un Lector recibe 403 en la papelera | Pendiente |
| RF-908 | Una ficha restaurada conserva su clave primaria original | Pendiente |

### Ficha imprimible (RF-1000)

| Requisito | Qué debe verificar el test | Estado |
|---|---|---|
| RF-1002 | La vista incluye los campos especificados, y el marcador cuando no hay imagen. Cubiertos en `recordPdf.test.ts` los campos, la imagen representativa incrustada y el marcador «Imagen no disponible», también cuando falla la descarga. Falta la serie, cuya tabla aún no existe | Parcial |
| RF-1003 | El QR se genera y su contenido es la URL absoluta de la ficha completa | Pendiente |

### Navegación (RF-1100)

| Requisito | Qué debe verificar el test | Estado |
|---|---|---|
| RF-1102 | Las migas de pan reflejan la jerarquía correcta en cada tipo de página | Pendiente |
| RF-1103 | Los indicadores de la página de inicio coinciden con el contenido real de la base de datos | Pendiente |
| RF-1104 | El botón de alta no aparece para un Lector | Pendiente |

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
| RF-1206 | Que la cámara se abra de verdad: los navegadores sin dispositivo real la simulan, así que se comprueba en un teléfono |
| RNF-105 | Idioma y zona horaria: visible en cualquier test de interfaz, sin test propio |
| RNF-106 | Usabilidad en móvil de pie y con una mano, con la obra delante y en el almacén. Ningún test automático cubre esto, y es el criterio de éxito del proyecto |
| RNF-108, RNF-110 | Volumen almacenado y umbral de los 100 GB: seguimiento en explotación, no test |
| RNF-112 | Regla 3-2-1 de los másters: revisión periódica de que las tres copias existen y están al día |
| DP-09 | Formato del máster: decisión archivística, no verificable con código |
