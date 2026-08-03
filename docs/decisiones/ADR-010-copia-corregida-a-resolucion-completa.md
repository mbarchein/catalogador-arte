# ADR-010 · La copia corregida a resolución completa

**Fecha:** 3 de agosto de 2026
**Estado:** Aceptada
**Amplía:** los tres niveles de imagen de [ADR-002](ADR-002-almacenamiento-de-imagenes.md) con un cuarto
**Roza, y no cruza:** el «sin backend que escribir ni servidor que administrar» de
[ADR-001](ADR-001-stack-y-despliegue.md)
**Hermana de:** [ADR-009](ADR-009-ajuste-de-color-como-tabla-de-consulta.md), de donde sale la cadena
de color que esta copia tiene que reproducir fuera del navegador
**Requisitos:** RF-420 y RF-421. Afecta a RF-411 y al dimensionado de RNF-108

---

## Contexto

RF-411 ofrece «Descargar máster» desde la ficha, con URL firmada y también para el Lector, y su caso de
uso está escrito en el propio requisito: mandar el original a una imprenta o a un comisario.

El máster es inalterable por decisión explícita del propietario. ADR-002 ya lo razonaba desde el otro
lado —el máster es el documento, no una copia de él, y para una obra destruida o perdida es la única
prueba que queda de que existió—, y las correcciones que la aplicación permite se guardan como datos
absolutos sobre él: el giro, el recorte, las cuatro esquinas de ADR-008 y ahora el ajuste de color. Se
cuecen en las copias derivadas y el máster no se toca.

La consecuencia práctica de las dos frases juntas no se había mirado de frente: **lo que la imprenta
recibe es la fotografía sin corregir**, con la dominante de la bombilla del almacén y la obra torcida,
porque lo que se descarga es el máster y el máster es exactamente lo que salió del teléfono. Las
correcciones existen, pero solo viven en dos ficheros que no sirven para eso: la miniatura de 400 px,
que no imprime nada, y la derivada de consulta de 2000 px, que da para la ficha impresa y no para un
cartel ni para una publicación.

Conservar el original intacto y poder entregar la imagen corregida a resolución completa no son
objetivos incompatibles. Lo que hace falta es admitir que son **dos ficheros** y no uno.

## Decisión

Un **cuarto nivel por toma**, que se genera y se almacena en el momento de aplicar la corrección:

| Nivel | Formato | Tamaño | Quién lo usa |
|---|---|---|---|
| **Miniatura** | WebP, borde largo 400 px | ~30 KB | Índice visual en mosaico |
| **Derivada de consulta** | WebP, borde largo 2000 px | ~300 KB | Ficha de obra, ficha imprimible |
| **Copia corregida** | Resolución completa del máster, con todas las correcciones | Del orden del máster | Descarga para imprenta, comisario o publicación |
| **Máster de archivo** | El original tal como salió de la cámara | 0,2-19 MB | Nadie, en el uso diario |

Las dos primeras filas son las de ADR-002 tal cual. La del máster lleva el rango medido de los 44 del
volcado y no los 8-150 MB que ADR-002 estimó antes de tener el corpus delante: la revisión está en
RNF-108.

**Lleva todas las correcciones, no solo el color:** giro, recorte, perspectiva y color. Una copia con el
color arreglado y la perspectiva torcida no le sirve ni a una imprenta ni a un comisario, y el caso de
uso de esta copia es precisamente el de RF-411. El orden es el canónico, el mismo que en las copias
reducidas: geometría → resolución de salida → color.

**Ruta propia, que nunca es la del máster.** Fichero nuevo. Está prohibido derivar la ruta de la copia
corregida de forma que pueda colisionar con la del máster, y está prohibido hacer PUT sobre una ruta de
máster existente. No es una recomendación: se comprueba con un test.

**Va a Backblaze B2, como los másteres y por la misma razón de tamaño** (RNF-110), por la función Edge
que firma la subida y no a Supabase Storage. Reutiliza el camino de firma que ya existe.

**Se regenera al reeditar y reemplaza a la anterior**, coherente con la invariante que sostiene todo lo
demás: lo guardado es absoluto sobre el máster, así que reeditar sustituye y nunca compone.

**Si no hay ninguna corrección, no hay copia corregida.** Nulo, y no un duplicado del máster.

### Quién la genera: el navegador cuando puede, y un lote local cuando no

El lado del servidor se evaluó y se descartó por dos motivos independientes, y cualquiera de los dos
bastaba (ver las alternativas). Lo que queda decidido es un punto medio:

- **El navegador la genera cuando el dispositivo puede**, sondeando antes su capacidad. El máster se
  procesa **por franjas horizontales** —se dibuja la franja, se lee su `ImageData`, se le aplica la
  tabla de color y se compone en el lienzo de salida—, nunca con un `getImageData` de la imagen entera.
- **Cuando no puede, la fila queda pendiente y consta**, y la cola la vacía una **herramienta local por
  lotes**. No es infraestructura nueva y no contradice ADR-001: es una herramienta local del mismo tipo
  que `scripts/bordes/preparar-corpus.py`, que ya decodifica con PIL los másteres de un volcado y ya
  reproduce fuera del navegador una cadena de imagen del cliente, orientación EXIF incluida. Se apoya en
  `make db-pull` para el espejo local y en la función de firma para las URL. No hay nada que
  administrar, nada encendido y nada que responda a una petición.
- Consecuencia buscada, y no un repliegue por avería: **en el almacén, con mala cobertura, el móvil no
  sube 19 MB**. Guarda los parámetros, que es su trabajo natural, y marca la copia como pendiente.

### El techo del dispositivo, que falla en silencio

El área máxima de un lienzo está limitada por el dispositivo —en WebKit antiguo, del orden de 16,7
millones de píxeles— y al superarla **el lienzo sale en blanco sin lanzar ningún error**. Es la peor
clase de fallo que puede tener esta función: se subiría un fichero válido, del tamaño esperado, con la
ruta correcta en la fila, y completamente blanco. Nadie lo sabría hasta que lo abriera la imprenta. De
ahí tres reglas que no son opcionales:

- **Se sonda la capacidad antes en vez de confiar**: dibujar y leer un píxel del lienzo de salida.
- **Está prohibido subir un fichero en blanco y está prohibido recortar la resolución en silencio.** Si
  no cabe, no se sube.
- **Existe `corrected_pending`.** Sin esa columna, «este dispositivo no ha podido generarla» y «no hace
  falta porque no hay correcciones» son la misma fila —las dos con la ruta a nulo— y la primera se
  confundiría con la segunda para siempre. Es la disciplina de siempre: «sin revisar» no es «no». La
  interfaz dice el estado con su razón, y el estado se prueba simulando el fallo del lienzo.

## Alternativas descartadas

**Generar la copia en una función Edge.** Descartada por doctrina y por aritmética, y sobraba con una de
las dos. Por doctrina: ADR-001 dice literalmente «sin backend que escribir ni servidor que administrar»
y RNF-101 lo sostiene; lo único del lado del servidor son las 123 líneas de `sign-file`, que firman URL
de S3, y **siguen haciendo solo eso**. Por aritmética: el mayor de los 44 másteres medidos es de
9248×6936, o sea 64 millones de píxeles y 256 MB en RGBA antes de que el codificador pida los suyos —la
misma cifra que ya obliga al rectificado a bajar a 2400 px (ADR-008)—; Deno no trae códecs de imagen
nativos, así que haría falta WASM, con su propia memoria lineal, y la imagen se paga dos veces; y los
decodificadores WASM habituales no exponen decodificación por franjas, que es lo único que evitaría
tenerla entera en memoria. Fallaría **justo en los másteres grandes, los mismos que el móvil tampoco
puede**: lo peor de las dos opciones, la complejidad de un servidor con la cobertura de un teléfono.

**GitHub Actions como trabajador de la cola.** Es un servidor en todo salvo el nombre: un disparador que
hay que programar, un secreto que hay que rotar y un registro de ejecuciones que alguien tiene que
mirar para saber si la cola avanza. Y metería credenciales de escritura de B2 en un trabajo que procesa
datos del catálogo. La clave que crea Terraform no puede borrar, de modo que ni comprometiéndola se
destruye un máster (ADR-002), pero sí puede escribir: un trabajo comprometido podría dejar copias
corregidas que no son de la obra. Un portátil con el volcado delante hace el mismo trabajo sin abrir esa
puerta.

**Generar la copia en el momento de la descarga.** Aplaza el coste al momento en que alguien la
necesita, que es exactamente cuando no hay nadie para atender un fallo, y traslada el trabajo al
dispositivo que descarga: RF-411 sirve también al Lector, que no puede escribir en la fila, y ese
dispositivo puede ser el mismo teléfono que no podía generarla.

**Quedarse solo con la copia corregida y retirar las dos reducidas.** La miniatura y la derivada existen
para que la aplicación no sirva megabytes en cada vista; servir la copia corregida en el mosaico o en la
ficha sería mandar al móvil un fichero del tamaño del máster. El propietario decidió las dos cosas: las
reducidas se siguen generando igual y esta copia se añade.

**Escribir las correcciones sobre el máster.** No es una alternativa descartada, es lo prohibido. Todo
este documento existe porque el máster no se reescribe.

## Consecuencias

- **La fila distingue tres situaciones y no dos:** no hace falta copia, está pendiente, y existe. Los
  `check` del esquema lo sostienen —la ruta y el tamaño van juntos o ninguno, y pendiente excluye tener
  ruta—, de modo que un estado imposible no se puede guardar aunque el cliente se equivoque.
- **Habrá dos implementaciones de la cadena de color, y van a divergir.** La forma en que la divergencia
  se nota es la peor: la miniatura y la copia a resolución completa de la misma obra salen con colores
  distintos, y eso se descubre mirando dos imágenes, que es como no descubrirlo. Se atan con un
  **fichero de casos compartido y versionado** —pares de parámetros y su tabla esperada de 256 entradas
  por los tres canales— que **generan los tests de TypeScript y verifican los de Python**. La
  herramienta local no reimplementa el criterio: reconstruye la misma tabla desde los mismos parámetros
  y la aplica de un golpe. Ese fichero es parte del entregable, no un extra.
- **El almacenamiento en B2 se duplica** respecto al dimensionado de RNF-108, porque la copia corregida
  es del orden del máster y los másteres proyectados son 10-40 GB. Sigue siendo cuestión de céntimos al
  mes al precio de B2, y sigue siendo el doble. Queda anotado también en RNF-108, para que dentro de un
  año se sepa de dónde salió el consumo.
- **Cada «Aplicar» sube un fichero del tamaño del máster, hasta 19 MB**, por la cola de subida y desde
  un almacén con mala cobertura. Es el precio de tener el artefacto en el momento de corregir en vez de
  cuando alguien lo pide, y la generación por lotes es justamente lo que permite que el teléfono no lo
  pague cuando no puede.
- **La copia corregida es derivada, no documento.** Se puede borrar y regenerar desde el máster y los
  parámetros, así que no entra en la regla 3-2-1 de ADR-002, que protege lo irrecuperable. Corolario
  útil: si algún día el consumo molesta, esto es lo que se puede tirar.
- **Despliegue de una fase y sin campaña retroactiva.** Las columnas nacen nulas, así que las 39
  imágenes activas quedan como «no hace falta», que es verdad para casi todas y no para las diez que ya
  tienen perspectiva guardada: esas tendrán su copia la próxima vez que se reedite la fotografía, no
  antes. No se marca nada como pendiente hacia atrás, porque «pendiente» significa «un dispositivo lo
  intentó y no pudo».
- **El máster sigue teniendo exactamente un punto de escritura**, y esta decisión no añade ninguno: la
  copia corregida es un objeto nuevo en una ruta nueva. La comprobación es la de siempre, revisar cada
  punto de escritura que menciona el máster en el código de la aplicación.
- **Queda abierto cómo se ofrecen las dos descargas en la ficha** cuando existen las dos. Nombrarlas
  bien importa —quien pide el original y quien pide la imagen buena piden cosas distintas— y no es parte
  de esta decisión.
