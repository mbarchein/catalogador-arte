# Incidencias detectadas en los documentos fuente

Revisión cruzada del esquema de campos v11, del documento de diseño de interfaz v4 y de la primera
maqueta de la ficha de obra. Los documentos originales se conservan sin modificar en
[`../originales/`](../originales/); las correcciones se registran aquí y se recogen ya resueltas en
[`../requisitos.md`](../requisitos.md).

Clasificación: **contradicción** (dos documentos dicen cosas distintas), **hueco** (nadie decide algo
que hay que decidir), **errata** (referencia o dato incorrecto).

---

## Erratas de documentación

### INC-01 · Referencia cruzada a una versión inexistente del diseño

**Errata.** El encabezado del esquema v11 atribuye el hallazgo de `archivo_digitalizado` a
`diseno_interfaz_y_arquitectura_v1.md`. El documento vigente es la v4, y es en su sección 10 donde el
campo queda documentado.

*Resolución:* corregir la referencia al citar el esquema en documentación nueva. No se toca el original.

### INC-02 · Referencia a un campo ya fusionado

**Errata.** La entrada v6 del historial de cambios del esquema distingue `nota_exposicion` de
`notas_participacion`, campo que dejó de existir en v7 al fusionarse en `nota_obra_en_expo`. La entrada
v7 documenta que actualizó la referencia cruzada en la especificación, pero no la del propio historial.

*Resolución:* es texto histórico y como tal es legítimo, pero puede desorientar. La especificación
vigente usa siempre `nota_obra_en_expo`.

### INC-03 · El documento de diseño cita el esquema v10

**Errata.** La sección 10 del diseño dice «siguiendo el esquema v10» cuando el mismo documento cita la
v11 en el resto de secciones, incluida la propia sección 10 unas líneas más abajo.

### INC-04 · Columna `autor` en el listado de resultados

**Errata con consecuencia.** La sección 8 del diseño lista como columna de resultados de búsqueda un
campo `autor`, que no existe en la tabla Obras: el campo es `artista`. `autor` sí existe, pero en la
tabla Bibliografía, con otro significado.

*Resolución:* RF-604 fija `artista`.

### INC-05 · Etiqueta «Serie» sobre un valor de `etapa`

**Errata en la maqueta.** La maqueta muestra, dentro del bloque Identificación, la fila
«Serie: Etapa figurativa temprana», enlazada. Pero «Etapa figurativa temprana» es el ejemplo de `etapa`
en el esquema, no un nombre de serie; y `etapa` es texto libre, sin ficha propia, luego no puede ser un
enlace. El campo enlazable es `serie`, que es relación con la tabla Series.

*Resolución:* `serie` va en el bloque Clasificación como enlace; `etapa` va en el mismo bloque como
texto plano.

---

## Contradicciones

### INC-06 · La maqueta omite dos de los siete bloques de la ficha

**Contradicción.** La sección 10 del diseño enumera los bloques de la ficha de obra; la maqueta no
incluye **Conservación y enmarcación** ni **Clasificación**.

La ausencia de Conservación es la más grave: la maqueta luce el badge «Fase 1 completa» y
`estado_conservacion`, `tiene_marco` y `requiere_restauracion` son campos de fase 1 según el reparto
del esquema. Una ficha con fase 1 cerrada y sin ningún dato de conservación a la vista es
internamente incoherente. Con Clasificación desaparecen además `obras_relacionadas` y
`notas_criticas`, y `notas_criticas` es, según el propio esquema, la materia prima del texto final del
catálogo razonado.

*Resolución:* RF-303 fija los ocho bloques y exige que todo campo del esquema tenga uno asignado.

### INC-07 · El bloque de procedencia no muestra la localización

**Contradicción.** El bloque se titula «Procedencia y localización» pero en la maqueta se reduce a una
línea de `procedencia`. Faltan `ubicacion_fisica`, `estado_existencia`, `titular_derechos`,
`estatus_legal`, `nota_procedencia` y `propietarios_documentados`.

`ubicacion_fisica` es el campo más operativo del esquema: es lo que se consulta con el móvil delante de
la estantería, y precisamente el caso de uso que justifica el QR de la ficha imprimible. Su ausencia
del bloque vacía de sentido la mitad del título.

### INC-08 · La procedencia con flechas promete un formato que la aplicación no puede generar

**Contradicción.** La maqueta muestra «Colección privada, Madrid (adquirida 1980) → Colección familiar
(actual)», que sugiere una cadena estructurada de propietarios. Pero `procedencia` es un único campo de
texto largo narrativo: la aplicación muestra literalmente lo que se teclee, no puede insertar las
flechas ni ordenar los eslabones.

*Resolución:* o la convención de redacción del esquema incorpora explícitamente la notación con flecha
—y entonces es el catalogador quien la escribe—, o la maqueta debe mostrar prosa. De paso, el ejemplo
de la maqueta se desvía de la convención del esquema, que pide «Colección privada, [país]»: Madrid es
ciudad, no país.

### INC-09 · Alcance asimétrico entre trazabilidad y papelera

**Contradicción de alcance.** La sección 4 del diseño define la trazabilidad «en la tabla Obras
(extensible al resto si conviene)», mientras que la sección 14 aplica los campos de papelera a las seis
tablas con clave primaria propia. Pero tanto la papelera como el panel de inicio muestran «quién hizo
qué y cuándo» para cualquier tipo de ficha.

*Resolución:* RF-804 define la trazabilidad como base común para las seis tablas desde el principio.
Añadirla después a cinco tablas ya poblacionadas es una migración evitable.

### INC-10 · `estatus_legal` sin «Sin revisar»

**Contradicción con la convención general.** El esquema establece que los campos de selección incluyen
«Sin revisar» por defecto, salvo excepción justificada. `estatus_legal` ofrece «Desconocido» pero no
«Sin revisar», sin justificar la excepción como sí se hace con `artista`.

### INC-11 · Campos Sí/No que no pueden expresar «pendiente»

**Contradicción con la convención general.** `tiene_marco`, `requiere_restauracion` y
`requiere_reenmarcacion` son booleanos, luego no admiten «Sin revisar». En fase 1, «todavía no lo hemos
mirado» y «no» son estados genuinamente distintos para estos tres campos. `medidas_verificadas`,
`ubicacion_definitiva`, `fase_*_completada` y `ficha_catalografica_completa` sí son legítimamente
booleanos, porque su valor por defecto «No» significa exactamente «aún no».

*Resolución:* recogido como decisión pendiente DP-08.

---

## Huecos

### INC-12 · Nadie decide quién asigna los identificadores

**Hueco, el más importante.** `id_catalogacion` es clave primaria, inmutable tras la creación, etiqueta
física pegada en la obra y secuencial por fondo. Ningún documento dice si lo genera la aplicación
(`AR-` más el siguiente número libre) o lo teclea el catalogador.

La decisión afecta a la vez a tres cosas que los documentos sí tratan: dos catalogadores dando de alta
obra simultáneamente, las altas duplicadas por error que el esquema anticipa como previsibles, y la
reutilización de un identificador retirado desde la papelera. Lo mismo aplica a `id_exposicion`
(`EXPO-0001`) y a `id_documento` (`AR-ARCH-0001`).

*Resolución:* recogido como DP-01. Debe resolverse antes de escribir los modelos.

### INC-13 · `id_imagen` no tiene formato definido

**Hueco.** El esquema declara `id_imagen` como clave primaria de tipo texto pero, a diferencia del
resto de tablas, no propone formato. La nomenclatura recomendada de fichero
(`AR-0001_v1_general.jpg`) sugiere un criterio, pero no se dice si el identificador lo replica.

*Resolución:* recogido como DP-02.

### INC-14 · El campo calculado `fotografiada` no contempla la papelera

**Hueco.** El esquema define `fotografiada` como Sí en cuanto existe al menos una fila en Imágenes.
La sección 14 del diseño establece que las imágenes de una obra dada de baja dejan de mostrarse. No se
dice qué pasa con una **imagen** dada de baja individualmente: si sigue contando para `fotografiada`,
una obra sin ninguna foto visible puede aparecer como fotografiada.

*Resolución:* RF-210 exige que solo cuenten las imágenes activas.

### INC-15 · `imagen_indice` no garantiza unicidad

**Hueco.** La regla es «mostrar la marcada; si ninguna, la más reciente de tipo general». Nada impide
que dos imágenes de la misma obra estén marcadas a la vez, y en ese caso el comportamiento queda
indefinido.

*Resolución:* RF-402 exige que marcar una desmarque la anterior.

### INC-16 · `documentacion_relacionada` no tiene sitio en la interfaz

**Hueco en ambos documentos.** El campo existe en el esquema y sirve para las fotografías históricas y
las cartas que mencionan la obra, pero la sección 10 del diseño no lo incluye en ningún bloque de la
ficha, y la maqueta tampoco. El dato se puede capturar y no se puede ver.

*Resolución:* RF-303 añade el bloque «Documentación relacionada».

### INC-17 · `titulo_atribuido` es invisible en la ficha

**Hueco.** El esquema dedicó una versión entera a convertir el campo en cuatro valores para distinguir
un título auténtico del artista de un nombre de conveniencia puesto por la familia o un comisario. Ni
el diseño ni la maqueta dicen cómo se representa esa distinción, de modo que solo existe dentro de la
base de datos.

*Resolución:* RF-307.

### INC-18 · `estado_existencia` sin jerarquía visual

**Hueco.** Que una obra esté destruida o en paradero desconocido es lo primero que debería verse al
abrir su ficha. Como campo del bloque de procedencia queda por debajo de datos mucho menos
determinantes.

*Resolución:* RF-306 lo sube a la cabecera cuando su valor no es «Conservada».

### INC-19 · El bloqueo de edición no tiene almacenamiento definido

**Hueco.** La sección 3 del diseño especifica el comportamiento completo del bloqueo (activación,
liberación, timeout, desbloqueo forzado, quién lo tiene y desde cuándo) pero no dice dónde vive ese
estado: campos en la propia ficha o tabla aparte. Es una decisión de modelo de datos, no de interfaz.

*Resolución:* recogido como DP-07.

### INC-20 · `clave_bibtex` como clave primaria inmutable

**Hueco con riesgo.** `clave_bibtex` es la clave primaria de Bibliografía y, por la sección 13 del
diseño, no es editable tras crear la ficha. Pero a diferencia de `AR-0001`, que sigue un patrón
mecánico, una clave BibTeX se compone a mano (`rotili1985retrospectiva`) y es fácil equivocarse al
teclearla. Con la regla actual, una errata en la clave es irreparable sin dar de baja la ficha y
volver a crearla.

*Resolución:* recogido como DP-03. La alternativa es clave técnica autogenerada y `clave_bibtex` como
campo único pero editable.

### INC-21 · El aviso de bloqueo carece de sentido para el Lector

**Hueco menor.** La maqueta muestra la banda «En modo consulta. Solo un catalogador puede editar esta
ficha a la vez». Para un Lector, que nunca podrá editar, el aviso es ruido en la página que más va a
usar.

*Resolución:* RF-707 lo oculta al Lector.

### INC-22 · Origen no documentado de los campos descartados

**Hueco menor.** La sección 8 del diseño descarta `Version`, `Inscription`, `Auction Data`,
`Cast Number` y `Foundry`, en inglés y sin decir de qué catálogo de referencia se tomaron. Si en el
futuro se reconsidera alguno, no hay forma de volver a la fuente.

### INC-23 · Dato de ejemplo confuso en la maqueta

**Hueco menor.** La maqueta atribuye la última edición de la ficha a «M. Ruiz». En una base de datos
donde Ruiz Campins es una de las dos artistas, usar ese nombre como usuario catalogador en un ejemplo
invita a confundir autoría de la obra con autoría del registro.

---

## Resumen de prioridad

| Prioridad | Incidencias | Motivo |
|---|---|---|
| Bloquean la fase 3 (modelos) | INC-12, INC-13, INC-20, INC-11 | Afectan a claves primarias y a tipos de campo, difíciles de cambiar con datos ya cargados |
| Bloquean la fase 5 (vistas) | INC-19, INC-06, INC-07, INC-16, INC-17, INC-18 | Afectan a la estructura de la ficha y al bloqueo |
| Corregir al redactar, sin bloquear | INC-01 a INC-05, INC-08, INC-09, INC-10, INC-14, INC-15, INC-21 | Ya resueltas en la especificación de requisitos |
| Anotadas sin acción | INC-22, INC-23 | Sin consecuencia sobre el producto |
