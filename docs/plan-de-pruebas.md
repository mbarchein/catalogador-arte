# Plan de pruebas

Correspondencia entre los requisitos de [`requisitos.md`](requisitos.md) y los tests que los verifican.

**Estado actual: no hay código todavía, luego no hay ningún test ejecutable.** La fase 3 de la hoja de
ruta (modelos) es el siguiente paso, y este documento define de antemano qué debe quedar cubierto para
que ningún requisito se dé por implementado sin verificación. La columna «Estado» se actualiza a medida
que los tests existen.

## Convenciones

- Un test cita en su docstring el identificador del requisito que verifica: `"""RF-402: marcar una
  imagen como índice desmarca la anterior."""`.
- El fichero de tests acompaña al módulo que prueba: los tests de modelos junto a los modelos, los de
  vistas junto a las vistas.
- **Un requisito sin test es un requisito no implementado**, por muy escrito que esté el código.
- Toda incidencia corregida deja antes un test que la reproduce, nombrado con su identificador
  (`test_inc_14_fotografiada_ignora_imagenes_de_baja`).

## Prioridad de cobertura

Por orden, según la consecuencia de un fallo silencioso:

1. **Reglas con consecuencia sobre los datos** — cascada de la baja lógica, campos calculados,
   inmutabilidad de claves primarias, unicidad de la imagen índice. Un fallo aquí corrompe el catálogo
   sin avisar.
2. **Permisos por rol** — un Lector que puede escribir, o un Catalogador que alcanza la gestión de
   usuarios, es un fallo de seguridad.
3. **Bloqueo de edición** — un fallo aquí hace que dos catalogadores se pisen el trabajo.
4. **Validación de formularios y convenciones de captura.**
5. **Renderizado de vistas** — que la página responda y muestre los bloques esperados.

---

## Cobertura por grupo de requisitos

### Autenticación, roles y permisos (RF-100)

| Requisito | Qué debe verificar el test | Estado |
|---|---|---|
| RF-101 | Un cliente sin autenticar recibe redirección al login en todas las vistas, recorridas de forma exhaustiva y no por muestreo | Pendiente |
| RF-103 | Un Catalogador puede crear, editar y dar de baja en las nueve tablas | Pendiente |
| RF-103 | Un Catalogador puede editar una ficha creada por otro Catalogador | Pendiente |
| RF-104 | Un Catalogador recibe 403 en las vistas de gestión de usuarios y de grupos | Pendiente |
| RF-105 | Un Lector obtiene 200 en todas las vistas de consulta, incluido el campo `contacto` | Pendiente |
| RF-106 | La respuesta para un Lector no contiene los controles de escritura ni enlace a la papelera | Pendiente |
| RF-106 | Un Lector recibe 403 al invocar directamente por URL una vista de alta, edición o baja | Pendiente |
| RF-107 | Un Superusuario sin pertenecer al grupo Catalogador conserva todos los permisos de contenido | Pendiente |
| RF-110 | La descarga de un fichero sin sesión válida no devuelve el contenido | Pendiente |

### Modelo de datos (RF-200)

| Requisito | Qué debe verificar el test | Estado |
|---|---|---|
| RF-202 | Se rechaza un `id_catalogacion` con formato inválido; se aceptan `AR-0001` y `RC-0001` | Pendiente |
| RF-203 | No se puede guardar una obra sin `artista`, y `artista` no ofrece «Sin revisar» | Pendiente |
| RF-204 | Intentar cambiar una clave primaria existente no altera el registro, y el formulario la presenta de solo lectura. Un test por cada una de las seis claves | Pendiente |
| RF-205 | Cada campo de selección afectado tiene «Sin revisar» como valor inicial | Pendiente |
| RF-207 | `fecha_ejecucion` acepta los cuatro formatos; `fecha_orden` ordena correctamente un conjunto que los mezcle | Pendiente |
| RF-209 | Obra con `titulo` vacío se representa como «[Sin título]» sin que el dato se guarde; obra titulada literalmente «Sin título» se muestra sin corchetes | Pendiente |
| RF-210 | `fotografiada` es No sin imágenes, Sí con una imagen activa, y **No cuando su única imagen está de baja** (INC-14) | Pendiente |
| RF-211 | `medidas_verificadas` sigue en No aunque `alto_cm` y `ancho_cm` tengan valor | Pendiente |
| RF-212 | `obras_relacionadas` acepta varias obras y no admite texto | Pendiente |

### Ficha de obra (RF-300)

| Requisito | Qué debe verificar el test | Estado |
|---|---|---|
| RF-303 | La ficha renderiza los ocho bloques. Test de completitud: todo campo del esquema aparece en exactamente un bloque (cubre INC-06 e INC-16) | Pendiente |
| RF-304 | Un bloque sin datos muestra su texto explícito y no queda vacío | Pendiente |
| RF-305 | Los datos de relación se renderizan como enlace a la ficha correspondiente | Pendiente |
| RF-306 | Una obra con `estado_existencia` distinto de «Conservada» muestra el aviso en cabecera (INC-18) | Pendiente |
| RF-307 | Un título atribuido se distingue visualmente de un título auténtico (INC-17) | Pendiente |
| RF-308 | En modo edición, los campos de cabecera son editables salvo la clave primaria | Pendiente |

### Imágenes y adjuntos (RF-400)

| Requisito | Qué debe verificar el test | Estado |
|---|---|---|
| RF-402 | Marcar una segunda imagen como índice desmarca la primera; nunca hay dos activas marcadas (INC-15) | Pendiente |
| RF-403 | Sin ninguna marcada, se elige la más reciente de tipo «general»; se comprueba también el caso de que no haya ninguna «general» | Pendiente |
| RF-404 | Una obra sin imágenes muestra el marcador «Imagen no disponible» | Pendiente |
| RF-406 | La subida crea una fila nueva en Imágenes con sus metadatos, y se rechaza sin los campos obligatorios | Pendiente |
| RF-408 | Un documento admite un único `archivo_digitalizado` y acepta imagen y PDF | Pendiente |

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

### Trazabilidad (RF-800)

| Requisito | Qué debe verificar el test | Estado |
|---|---|---|
| RF-801 | Cualquier cambio actualiza `fecha_actualizacion` | Pendiente |
| RF-802 | Un cambio en un campo de fase 1 actualiza `fecha_actualizacion_basica`; un cambio en un campo de fase 2 **no** la actualiza | Pendiente |
| RF-803 | `actualizado_por` recoge el usuario de la sesión que guardó | Pendiente |
| RF-804 | Las seis tablas con clave primaria propia disponen de los tres campos (INC-09) | Pendiente |

### Papelera (RF-900)

| Requisito | Qué debe verificar el test | Estado |
|---|---|---|
| RF-901 | Dar de baja no borra la fila: sigue recuperable de la base de datos | Pendiente |
| RF-902 | La baja rellena fecha y usuario; la restauración rellena los suyos y no borra los de la baja | Pendiente |
| RF-903 | Eliminar una fila puente la borra realmente, y volver a crearla no deja rastro | Pendiente |
| RF-904 | Dar de baja una imagen no afecta a su obra; dar de baja una participación no afecta a obra ni exposición | Pendiente |
| RF-905 | Un test por cada fila de la tabla de cascada: obra, exposición, referencia, serie y propietario | Pendiente |
| RF-906 | Los filtros de la papelera funcionan por tabla de origen, fecha y usuario; «Restaurar» devuelve la ficha a los índices | Pendiente |
| RF-906 | Un Lector recibe 403 en la papelera | Pendiente |
| RF-908 | Una ficha restaurada conserva su clave primaria original | Pendiente |

### Ficha imprimible (RF-1000)

| Requisito | Qué debe verificar el test | Estado |
|---|---|---|
| RF-1002 | La vista incluye los campos especificados, y el marcador cuando no hay imagen | Pendiente |
| RF-1003 | El QR se genera y su contenido es la URL absoluta de la ficha completa | Pendiente |

### Navegación (RF-1100)

| Requisito | Qué debe verificar el test | Estado |
|---|---|---|
| RF-1102 | Las migas de pan reflejan la jerarquía correcta en cada tipo de página | Pendiente |
| RF-1103 | Los indicadores de la página de inicio coinciden con el contenido real de la base de datos | Pendiente |
| RF-1104 | El botón de alta no aparece para un Lector | Pendiente |

---

## Requisitos que no se verifican con tests automáticos

No por descuido, sino porque su verificación es de otra naturaleza. Se comprueban a mano y se anotan
aquí para que su ausencia del listado anterior no se lea como un hueco de cobertura.

| Requisito | Cómo se verifica |
|---|---|
| RF-405, RF-407 | Interacción de ratón y táctil sobre las miniaturas: revisión manual en navegador |
| RF-1004 | Resultado real de impresión: revisión manual del PDF y del papel |
| RNF-103, RNF-104 | Configuración de servidor: comprobación en el despliegue |
| RNF-105 | Idioma y zona horaria: visible en cualquier test de vista, sin test propio |
| RNF-106 | Usabilidad en móvil: revisión manual en dispositivo real, con el caso del QR delante de la obra |
| RNF-108, RNF-112 | Volumen y crecimiento en disco: seguimiento en explotación, no test |
