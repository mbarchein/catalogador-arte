# Maquetas de interfaz

## `dossier-maquetas-v1.html`

Las hojas del **PDF del dossier** (RF-1600, [ADR-011](../decisiones/ADR-011-el-dossier.md)), dibujadas a
escala: A4 vertical con sus márgenes reales, en Times y Helvetica, que son las dos tipografías que la
librería del PDF trae sin empaquetar nada. Se abre en cualquier navegador y no necesita servidor.

**Lo que fija la maqueta:**

- **Una obra por página** es la plantilla que se construye: la fotografía ocupa más de media hoja y
  debajo van el código de catalogación, el título, la fecha, la técnica, las medidas y el precio.
- Las otras tres plantillas descritas y dibujadas para cuando hagan falta: dos por página, rejilla de
  seis y lista sin fotografía.
- La **portada** —título, destinatario, fecha y presentación— y el bloque de **biografía y currículum**,
  iguales en las cuatro plantillas.
- Dónde caen un **rótulo** de sección y un **párrafo** dentro del recorrido de elementos.
- Las siete decisiones de maquetación con su respuesta razonada: orientación, qué campos entran en el
  pie, qué se hace con el dato dudoso y con el que falta, dónde va el precio, si la portada lleva
  fotografía, tipografía y por qué el dossier **no** lleva QR.

Los dos interruptores de arriba encienden los precios y los textos de sección, que es la forma de ver la
misma hoja con y sin ellos.

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
