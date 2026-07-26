# Maquetas de interfaz

## `ficha-obra-modo-consulta-v1.jpeg`

Primera maqueta de la **ficha de obra en modo consulta**, la página central de la aplicación.
Corresponde a la sección 10 del documento de diseño de interfaz.

**Lo que fija la maqueta:**

- Migas de pan (`Inicio > Obras > AR-0001`) sobre la cabecera.
- Cabecera con `id_catalogacion` · `titulo` en una línea, y `artista` · `fecha_ejecucion` como
  subtítulo.
- Tres botones alineados a la derecha: «Volver al listado», «Imprimir ficha», «Editar».
- Fila de badges de estado: fase 1, fase 2 y situación de publicabilidad de la ficha.
- Aviso de bloqueo de edición como banda destacada bajo los badges.
- Columna izquierda con la imagen índice en grande y una tira de miniaturas con contador de
  desbordamiento («+2»).
- Bloques de contenido apilados a ancho completo bajo las dos columnas.
- Compactación de `firmada` + `firma_descripcion` en una sola línea de lectura
  («Sí, ángulo inferior derecho»), que el documento de diseño no había previsto y se adopta.
- Formato del historial expositivo tal como lo define la sección 9 del documento de diseño.
- Bloques sin datos que se muestran con un texto explícito («Sin referencias registradas») en vez
  de quedar vacíos.

**Lo que la maqueta no resuelve todavía**, y está registrado en
[`../revision/incidencias-detectadas.md`](../revision/incidencias-detectadas.md):

- Faltan los bloques de Conservación/Enmarcación y de Clasificación.
- El bloque de procedencia no muestra la localización física de la obra.
- `titulo_atribuido` y `estado_existencia` no tienen representación visual.
- La etiqueta «Serie» acompaña a un valor que corresponde al campo `etapa`.

La maqueta es **indicativa, no normativa**: ante una discrepancia entre la maqueta y el esquema de
campos, manda el esquema.
