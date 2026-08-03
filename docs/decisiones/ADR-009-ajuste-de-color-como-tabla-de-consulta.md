# ADR-009 · El ajuste de color se guarda como una tabla de consulta

**Fecha:** 3 de agosto de 2026
**Estado:** Aceptada
**Extiende:** la frontera entre catalogar y retocar que escribió la migración del giro y el recorte
(`supabase/migrations/20260729110000_image_edits.sql`), y los niveles por toma de
[ADR-002](ADR-002-almacenamiento-de-imagenes.md)
**Hermano directo:** [ADR-008](ADR-008-perspectiva-como-cuatro-esquinas.md) — el mismo problema, una
corrección que se guarda como dato y no como píxeles, resuelto con el mismo criterio
**Se completa con:** [ADR-010](ADR-010-copia-corregida-a-resolucion-completa.md), que decide dónde
acaba el color a resolución completa y quién lo escribe cuando el móvil no puede
**Requisitos:** RF-414, RF-415, RF-417 y RF-418. Afecta al dimensionado de RNF-108

---

## Contexto

La luz de un almacén tiñe las obras. Un óleo fotografiado bajo una bombilla sale amarillento, y ese
amarillo no es del óleo: es de la bombilla. La fotografía es el documento que testifica el estado de la
obra, así que la dominante que puso la lámpara es un defecto del documento y hay que poder quitarla.
El giro y el recorte ya se guardaban como dato por esa razón —«enderezar y recortar es catalogar, no
retocar»— y el color era la pieza que faltaba.

Es también donde la frontera se cruza sin darse cuenta. Girar una fotografía no puede mentir sobre la
obra; subir la saturación, sí. Un barniz amarilleado y un pigmento que ha perdido intensidad en ochenta
años son parte del estado de la obra, y son justo lo que la fotografía tiene que testificar.

Y hay un problema que el giro no tenía: **el mismo color tiene que salir en cuatro sitios**. La
miniatura, la derivada de consulta, la copia corregida a resolución completa y la previsualización que
se ve en pantalla mientras el dedo arrastra. De esos cuatro, tres los escribe el navegador y uno lo
puede escribir una herramienta local en Python, cuando el móvil no ha podido con el máster. La pregunta
no es solo qué operaciones se ofrecen, sino **qué es la definición del color que esos cuatro caminos
transliteran**.

## Decisión

El ajuste se guarda como **parámetros escalares absolutos sobre el máster** y se aplica construyendo con
ellos una **tabla de consulta de 256 entradas por canal**. La tabla es la definición normativa del
color; todo lo demás la traduce.

**La tabla es la definición, no una optimización.** Todas las operaciones del conjunto cerrado
—balance de blancos, exposición, punto negro, punto blanco, medios tonos, altas luces suaves— son por
canal y no dependen de dónde está el píxel, así que una función sobre los códigos 0…255 de cada canal
las captura por completo. Eso convierte el criterio de color en una **función pura de sus parámetros a
768 números**, y 768 números se comparan por igualdad. Un proyecto que exige tests para todo necesitaba
exactamente eso: el color deja de ser «mira si se ve bien» y pasa a ser una tabla que un test afirma
entera. `gray` es lo único que no es por canal, y por eso va **después** de la tabla, como luminancia
Rec. 709 en luz lineal.

**Una definición, dos transliteraciones.** La previsualización es un `<filter>` SVG en línea con
`feFuncR/G/B type="table"` y las 256 entradas —no submuestreadas a 33: con medios tonos en 0,5, entre
los códigos 0 y 8 la interpolación se desvía casi diez niveles, justo donde trabaja el punto negro—. La
exportación es un paso sobre `ImageData`, por franjas horizontales. La lupa aplica la misma tabla en CPU
sobre su propio `ImageData` de 112 px. Tres consumidores y una sola tabla: si la tabla está bien, los
tres coinciden, y si está mal, los tres se equivocan igual y el test lo ve.

**Escalares con `check`, no un `jsonb`.** El argumento ya lo escribió la migración del recorte y sigue
siendo el mismo: la base es la última línea que dice no, y solo puede decirlo de lo que sabe leer.
`color_white − color_black >= 128` es comprobable sobre columnas; sobre un `jsonb` es una expresión
sobre claves que pueden no existir y de tipos que nadie garantiza. Cada columna es además independiente y
**nulo es identidad**, lo que permite que las filas anteriores a la migración se lean como neutras.

**El orden canónico es geometría → reducción al nivel → color**, y se declara en la migración, en el
código y aquí. No es indiferente: reducir y luego aplicar la tabla no da lo mismo que aplicar la tabla y
luego reducir, porque la reducción promedia píxeles vecinos y la curva no es lineal —el promedio de la
curva no es la curva del promedio—. La diferencia aparece solo en bordes de alta frecuencia: un
craquelado fino, el filo de un marco contra la pared. Y el orden elegido es el único que cabe en el
móvil: aplicar el color antes de reducir es aplicarlo al máster entero, y `getImageData` de un máster de
9248×6936 son 256 MB de array que un teléfono no tiene. Aplicarlo después es aplicarlo al nivel que se
está escribiendo.

**Y se rechaza a propósito plegar la tabla dentro del bucle bilineal del rectificado**, aunque saldría
gratis: ese bucle ya lee y escribe cada píxel, y tres consultas a una tabla no se notarían. Se rechaza
porque pondría el color **antes** de la reducción en el camino con perspectiva y **después** en el
camino sin ella, y entonces habría dos órdenes canónicos que reproducir fuera del navegador en vez de
uno. Un orden que se puede escribir en una frase vale más que unos milisegundos.

**La frontera del dominio, que es el fondo de todo esto: se corrige lo que la cámara y la luz hicieron
mal; no se corrige nada de lo que la obra es.** De ahí que el conjunto sea cerrado y que RF-415 sea un
requisito **negativo**, con nombres propios y con el motivo documental de cada descarte:

- **Saturación.** Borra el envejecimiento. Un pigmento que perdió intensidad la perdió, y devolvérsela
  es catalogar una obra que no existe.
- **Vibrancia.** Peor que la saturación porque va disfrazada de prudente: toca más donde el color está
  apagado, es decir, exactamente sobre la pátina, el polvo y el barniz oxidado. Es un filtro que apunta
  al estado de conservación.
- **Contraste global.** Redundante y opaco. El punto negro, el punto blanco y los medios tonos ya hacen
  lo que hace el contraste, de uno en uno y con cada número legible en la ficha; un mando único de
  «contraste» es los tres a la vez y ninguno en concreto.
- **Nitidez.** Inventa craquelado que no existe. Quien lea esa fotografía como documento de conservación
  vería grietas que la obra no tiene.
- **Reducción de velo y eliminación de reflejos.** Rellenar lo que el reflejo tapaba es inventar píxeles
  que la obra no dio. La respuesta honesta a un reflejo es repetir la toma, y si no se puede repetir, que
  la fotografía muestre el reflejo.
- **Sombras, altas luces y cualquier ajuste por rango tonal o local.** Rompen la propiedad que hace
  posible la tabla —que la salida de un píxel dependa solo de su valor de entrada— y con ella la
  testabilidad. Y permitirían aclarar el mismo barniz en las sombras y dejarlo en las luces, que es
  retocar con más precisión, no con menos.

Ninguno se implementa **ni desactivado por defecto**: un mando que existe se acaba usando.

**Y el color se prohíbe donde no podría ser verdad.** En la vía degradada, sin máster y sobre la
derivada de consulta —que ya lleva el color cocido—, con el mismo interruptor `canRestoreOriginal` que
ya usa la perspectiva y con `composeEdits` lanzando como ya lanza para las esquinas. Y en las
fotografías que no son propias: una reproducción tomada de otro catálogo ya trae las decisiones de
color de otra persona, y corregirla es corregir esas, no la luz de la sala.

## Alternativas descartadas

**WebGL como motor del color.** Descartado sin volver a medir, porque el propio repositorio ya lo midió
y lo rechazó por escrito para el rectificado (`app/src/lib/imageRender.ts:98-102`): el bucle por píxel
cuesta 89 ms a 2000 px y 247 a 4000, y WebGL fue 1,76× más rápido en el primer caso y solo 1,20× en el
segundo, porque a ese tamaño manda la subida de la textura. Para el color el balance es todavía peor,
porque allí había un bucle por píxel con aritmética real que acelerar y aquí hay tres consultas a una
tabla sobre una imagen ya reducida. Y lo único que quedaba a favor de WebGL —que abarata las operaciones
**locales**: desenfoques, máscaras por rango tonal, enfoque por contraste de bordes— es precisamente lo
que el dominio prohíbe. Pagar dos *shaders*, una vía para el contexto perdido y un repliegue que haría
falta igual, a cambio de abrir barato lo que está cerrado a propósito, es pagar por aflojar la frontera.

**`ctx.filter`, o el `filter` de CSS, como motor.** Sería escribir la cadena entera como una cadena de
texto y dejar que el navegador la aplique. Descartado porque **`ctx.filter` es un no-op silencioso en
WebKit antiguo**: se asigna sin error, se dibuja sin filtro y no hay forma de preguntar si se aplicó. El
objetivo de navegadores declarado por el propietario son los móviles de 2020 en adelante, así que la
consecuencia no sería un fallo, sino **derivadas subidas sin corregir y sin un solo error** — la misma
clase exacta de avería que `toBlob(…, 'image/webp')` devolviendo PNG en silencio y que el lienzo que se
queda en blanco al pasar el área máxima del dispositivo. Un catálogo no puede permitirse una corrección
que a veces no ocurre y nunca lo dice. Además el atajo de CSS no sabe expresar la cadena: no hay
primitiva para un punto negro, un punto blanco y una compresión de altas luces, y las que sí hay
—`saturate`, `contrast`— son justamente las prohibidas. El filtro **sí se usa**, pero solo para
previsualizar, alimentado por la misma tabla, donde un fallo se ve en la pantalla y no se escribe en
ningún fichero.

## Consecuencias

- **Hay dos implementaciones de la cadena y van a divergir.** TypeScript en el navegador y Python en la
  herramienta local por lotes que vacía la cola de copias pendientes. No es un riesgo que vigilar: es
  una certeza, y la forma en que se nota es que la miniatura y la copia a resolución completa de la
  misma obra salen con colores distintos. Se ata con un **fichero de casos compartido**, versionado en
  el repositorio, de pares (parámetros → tabla esperada de 256 × 3): lo genera la batería de tests de
  TypeScript y lo verifica la de Python. La herramienta local **no reimplementa el criterio**;
  reconstruye la misma tabla y la aplica con `Image.point`. Así la divergencia es un test rojo en vez de
  un color raro. Ese fichero es parte del entregable, no un extra.
- **La identidad exacta es un requisito, no un detalle de precisión.** Con el ajuste neutro,
  `lut[c][i] === i` en los 256 códigos y los tres canales. Si no lo fuera, `sameEdit` vería un cambio
  donde no hay ninguno y abrir una fotografía, mirarla y cerrarla reescribiría ficheros.
- **`color-interpolation-filters="sRGB"` se fija con un test de igualdad literal.** Olvidarlo es el
  fallo silencioso número uno del filtro SVG: el navegador interpola en luz lineal por omisión, la tabla
  se aplica a números que no son los que la construyeron, y la previsualización deja de coincidir con la
  exportación mientras las dos siguen pareciendo verosímiles.
- **El despliegue sigue siendo de una fase**, como con la perspectiva. Las columnas nacen nulas, nulo es
  identidad y cada parámetro es independiente, así que las filas que ya existen se leen como neutras y el
  frontend viejo las sigue leyendo.
- **Reeditar reemplaza y no compone**, porque lo guardado es absoluto sobre el máster. La misma
  invariante del recorte y de las esquinas, y la razón de que el ajuste se pueda aflojar, cambiar o
  quitar del todo dentro de un año.
- **El máster no se toca ni una vez.** El ajuste produce copias derivadas y nada más; el máster se sube
  con sus bytes originales y no se vuelve a escribir nunca.
- **La copia corregida a resolución completa duplica el almacenamiento** respecto al dimensionado de
  RNF-108 (10-40 GB de másteres proyectados), y cada «Aplicar» mete en la cola de subida un fichero del
  tamaño del máster —hasta 19 MB— en un almacén con mala cobertura. Es un coste aceptado con los números
  delante, y consta aquí para que se sepa de dónde sale el consumo.
- **Cuando el dispositivo no puede generar esa copia, la fila queda pendiente y la interfaz lo dice, con
  su razón.** No se sube un fichero en blanco y no se recorta la resolución en silencio: es «sin
  revisar» no es «no», aplicado a un fichero.
- **Se guarda de dónde salió el gris y se guarda el «se miró y se dejó como estaba».** La referencia
  neutra —carta comprada, hoja impresa en casa, gris de la escena o a ojo— cambia cuánto se puede creer
  el resultado, y no anotarla dejaría un número sin autoridad. Y hasta ahora todo a nulo no distinguía
  «se revisó con la obra delante y estaba bien» de «nunca se revisó».
- **La frontera queda escrita y habrá que defenderla.** Antes o después alguien pedirá un mando de
  saturación, con un caso razonable delante. La respuesta está en este documento y es documental, no
  técnica: el sitio donde se contesta es este ADR, no una revisión de código.
