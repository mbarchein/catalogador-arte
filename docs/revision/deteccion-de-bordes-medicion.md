# Detección de bordes: lo que se ha medido y lo que hay que decidir

**Fecha:** 1 de agosto de 2026
**Estado:** medición terminada; **ninguna de sus decisiones está tomada todavía**, y no se ha tocado
una línea del detector. Este documento es el material con el que decidirlo.
**Mide:** `app/src/lib/edgeDetection.ts` tal como lo dejó
[`9322554`](../../app/src/lib/edgeDetection.ts) —«detector de bordes del cuadro por perfiles de
proyección»—, sobre las 44 fotografías maestras del volcado `20260801-1142`.

**Sobre el banco de pruebas.** La medición se hizo con un banco *headless* que decodificaba las 44
fotografías, ejecutaba el detector real del repositorio y dibujaba el rectángulo sugerido sobre cada
una. Vivía en un directorio temporal y **ya no existe**; lo que queda es este documento. Reconstruirlo
está descrito en el apartado 4, y hacerlo es requisito previo si se va a tocar el detector: las cifras
de umbral y las de geometría vienen de ejecuciones separadas y su composición no está medida.

Los 88 PNG con los rectángulos dibujados **no se archivan aquí a propósito**: son fotografías de obra
real y este repositorio es público (ADR-005). Se regeneran desde el volcado, que tampoco entra en el
repositorio y por el mismo motivo.

---

## 1. Lo que se ha medido

**El problema no es que el detector calle: es que habla demasiado y casi siempre se equivoca.**
De las 44 fotografías del archivo, el detector devuelve `null` en 8 —y en 6 de esas 8 callar es
la respuesta correcta—, mientras que de las 36 en las que sí sugiere un recorte, 16 son
directamente malas, 16 son inocuas pero no miden nada, y sólo 4 son buenas. De esas 4, dos son
las dos sugerencias que la catalogadora aceptó, así que compararlas con su propio recorte es
circular: **sugerencias buenas e independientes, dos de 44.** La impresión de que «hay varias
imágenes que el detector dice que no puede detectar» es cierta en la letra y engañosa en el
fondo: los silencios son 8, sólo 2 son pérdidas reales, y el daño está en el otro lado.

### El inventario, contado

El volcado tiene 44 ficheros en 15 carpetas de obra, y coincide exactamente con la base: 44 filas
en `images`, 44 `master_path` distintos, nada sobra y nada falta. Las 21 obras del catálogo tienen
imagen sólo 15. Los tamaños van de 548x578 a 9248x6936; las 44 se decodifican sin fallos.

Tres pares son **byte a byte idénticos**, comprobado con `md5sum`: `RC-0001_elj2f6ay` /
`RC-0001_q76bbqdx`, `TS-0003_9i8bzr0l` / `TS-0003_u8e27puf` y `RC-0001_y98y2hv1` /
`RC-0003_5ps5j0sp`. Son 41 imágenes distintas en 44 filas, así que dos falsos aciertos y una
sugerencia se cuentan dos veces en todos los recuentos que siguen; se han mantenido sobre 44 para
que las cifras se puedan poner unas al lado de otras sin traducir. El tercer par merece nota
aparte y no es asunto de este informe: el mismo fichero está subido a **dos obras distintas**,
RC-0001 y RC-0003.

### Cuántas son recortables de verdad

Un triaje visual independiente —otros agentes miraron las 44 fotos sin ver ninguna medición del
detector— clasificó 26 como «recortar no tiene sentido»: cinco reversos de obras enmarcadas con
su etiqueta manuscrita, cinco detalles de firma, fichas de catalogación fotografiadas de cerca,
cuatro capturas de pantalla de Instagram, detalles de superficie pintada sin ningún borde de obra
en cuadro, y las fotos del fondo de pruebas (unos auriculares, un libro de texto de francés, la
etiqueta de una botella, un incendio forestal). Quedan **18 fotos en las que una sugerencia es la
respuesta correcta**; un segundo recuento, más estricto, deja 16 (14 obras más 2 reproducciones
digitales ya recortadas). La diferencia son dos fotografías y no mueve ninguno de los mecanismos
que se describen abajo, pero conviene saber que el denominador no es único, porque **la
clasificación de qué foto es una obra es criterio humano, no medida**.

### Qué hace el detector hoy

Sobre las 44: **2 «marco + lienzo», 34 «sólo marco», 8 silencios.** Puesto contra la etiqueta del
triaje: acierta en 16 de las 18 donde una sugerencia es correcta, y **sugiere en 20 de las 26
donde callar era lo correcto**. El neto (aciertos menos falsos positivos) es −4.

De las 36 sugerencias, mirando los 36 rectángulos superpuestos uno a uno:

- **4 buenas** y sólo sobre 3 obras distintas: `RC-0004_4jzjb8ud` (IoU 0,986), `RC-0006_dpsptdbq`
  (0,988) y el par `TS-0003_d8v1uydi` / `TS-0003_hqhp5ilj`, que son precisamente las dos que ella
  aceptó.
- **16 correctas pero inútiles**: área entre 0,88 y 0,99 del fotograma, sobre reversos, detalles y
  fotos donde la obra ya llena el encuadre. Visualmente no hacen nada; el editor, en cambio, las
  anuncia como «Recorte sugerido», que es exactamente lo que convierte una sugerencia en una
  medición falsa.
- **16 malas.** Cinco cortan obra: `AR-0001_nmjb8v5w` se come el 44,1 % de lo que ella conservó,
  `RC-0005_xkq1cncq` el 34,8 %, `RC-0006_i7sf4eue` el 28,7 %, `TS-0005_0mmie7l3` el 13,8 % y
  `RC-0004_zcoywgq6` el 8,9 %. Cinco se engancharon a algo que no es la obra (el cuadro vecino, el
  gotelé de la pared, un listón intruso, el cartón de debajo de una ficha). Seis dibujan un
  rectángulo perfectamente contrastado donde no hay obra ninguna: dos capturas de Instagram y su
  duplicado, un ejercicio de un libro de texto, unos auriculares sobre una mesa.

La exactitud frente al recorte hecho a mano, restringida a las tomas generales, comparables y sin
las dos circulares: **IoU mediana entre 0,80 y 0,85** según se tomen 11, 12 o 13 filas de
referencia, y **sólo 3 o 4 de ellas por encima de 0,9**.

### Los 8 silencios, uno a uno

Ninguno se rechaza por «esto es un trapecio». Los motivos son tres: `MIN_EDGE_STRENGTH` (4 fotos),
«ningún pico posible» (5 ejes en 5 fotos, con solape) y la razón de aspecto (1 foto). **Seis de los
ocho silencios son correctos**: los auriculares, el libro de francés, el incendio, la etiqueta de
la botella, un detalle de textura pintada y una tira panorámica sin ningún lado de obra en cuadro.
**Las pérdidas reales son dos**: `RC-0004_6ewmm48e` (donde ella sí recortó, y justo por el eje que
el detector descarta) y `TS-0004_gutyi18w` (el panel de azulejos en marco-caja, el caso que
justifica hablar de perspectiva).

### Confianza del banco

La cadena de decodificación se reprodujo fuera del navegador y las dos piezas de aritmética que
hubo que reescribir en Python están **verificadas, no supuestas**: `computeTarget` coincide en 2020
tamaños sin una discrepancia, y la luminancia `| 0` se comparó en las 16.777.216 tripletas RGB con
checksum idéntico. El módulo de diagnóstico que explica cada rechazo coincide con el veredicto del
`detectArtworkEdges` real en las 44 fotos y los rectángulos coinciden **bit a bit**. El filtro de
remuestreo (BOX) se eligió con datos: contra las dos únicas respuestas de navegador real que
existen, el residuo es de 0,14 px sobre la copia de 700 px, y entre los cinco filtros probados el
veredicto sólo cambia en 2 de 44 y nunca hacia o desde el silencio.

Una fotografía es **exacta y no aproximada**: `AR-0001_nmjb8v5w` es un PNG sin pérdida de 548x578,
por debajo de los 700 px de análisis, sin perfil ICC y sin remuestreo; sus cinco variantes de
decodificación son byte a byte iguales. Ese recorte que se come el 44 % del cuadro es literalmente
lo que calcula el navegador, y no admite el descargo de «será cosa del banco».

---

## 2. Por qué falla

**A. La regla que elige el pico, no el valor del umbral (16 fotos malas).** `axisEdges` decide un
lado como «el pico más externo que supera un umbral global del eje». Esa regla ordena por posición
y no tiene ninguna noción de qué línea limita un objeto, así que cualquier recta contrastada fuera
de la obra se convierte en lado: en `RC-0012_fulb26qf` el borde izquierdo real del marco vale 59,5
y el listón intruso del borde de la foto vale 68,3, de modo que **cualquier umbral que conserve el
borde real conserva también al intruso**. La ventana es vacía por construcción. Se barrieron 1600
combinaciones de constantes: 448 no rompen ninguna de las 4 sugerencias buenas, y en **ninguna de
esas 448 se arreglan 9 de las 16 malas**.

**B. Los lados inventados en silencio (22 lados en 15 de las 36 sugerencias).** Cuando falta el
pico de un semieje, `axisEdges` devuelve 0 o 1 sin decir nada, es decir el borde del fotograma. De
ahí salen **14 sugerencias que cubren más del 90 % de la foto y 6 que pasan del 95 %**, todas
válidas porque `MAX_AREA` es 0,98. En `RC-0001_4wpzg2n8` la «sugerencia» es la fotografía entera.

**C. El techo del MAD: una combinación de umbrales no acotada (6 ejes en 5 fotos).** El umbral es
`max(mediana + 4·1,4826·MAD, mediana + 0,25·contraste)` y el máximo del perfil es
`mediana + contraste`, así que **ningún pico es matemáticamente posible cuando el MAD crudo llega a
contraste/5,9304**. En `TS-0004_gutyi18w` el umbral de columnas es 168,81 contra un máximo de
78,69: más del doble. `PROMINENCE_FRACTION` se documenta como un suelo para descartar ruido, pero
implementado con `max()` es también un techo que garantiza cero picos en cuadros de textura densa.

**D. Un solo umbral global por eje (el peor error del lote).** En `AR-0001_nmjb8v5w` el borde
derecho real del cuadro **sí es un pico** —42,05 sobre una mediana de 23,08— pero el umbral vigente
es 89,71 y lo pone el término del MAD. Al no llegar, el pico más externo que sobrevive es una
costura interna de la composición, de fuerza 91,97, y el detector ofrece la mitad izquierda de la
obra. Un número por eje tiene que servir a la vez a una costura de 92 y a un borde de 42, y no hay
valor que sirva a los dos. El mismo mecanismo aparece en el lado derecho casi sin contraste de
`TS-0003_hqhp5ilj`, en el borde superior de `RC-0013_mxpt7dyn` (25 niveles, porque el perfil
plateado refleja la pared) y en `TS-0005_0mmie7l3`, donde el mismo borde es fuerte en un tramo e
inexistente en otro.

**E. La inclinación, que no produce silencios sino sugerencias silenciosamente malas (8 de 14
obras).** El perfil suma el gradiente a lo largo de columnas estrictamente verticales, así que un
lado inclinado θ que barre S píxeles reparte su energía sobre S·tan θ celdas en vez de
concentrarla en 4: la altura del pico se divide por (4 + S·tan θ)/4. El corte empírico está entre
0,86° (aún funciona) y 1,29° (ya falla). Ocho de las catorce obras del lote pasan de 1°, con
convergencias reales de 11,69° en `RC-0012_lqsk0hhz` y 5,99° en `TS-0004_gutyi18w`, y **7 de las 7
obras frontales cuya sugerencia falla están por encima de 1° mientras las 3 que aciertan están por
debajo de 0,9°**. Hay un segundo efecto que no se ve venir: al aplanarse el lado real baja el
propio umbral de prominencia y entra la textura de la pared como lado más externo. En
`RC-0012_lqsk0hhz` el lado derecho aparece a 132 px del sitio, un 19 % del fotograma.

**F. Falta el dato de qué es la foto (20 de los 26 silencios correctos).** Reversos, fichas
manuscritas, capturas de pantalla, detalles de firma y fotos del fondo de pruebas. Y no es
cuestión de afinar: en `RC-0001_elj2f6ay` los picos de la interfaz de Instagram valen 356 y 381,
**más fuertes que el mejor verdadero positivo del lote** (`RC-0004_4jzjb8ud`, 323). Ordenadas por
contraste, la cabeza de la lista son reversos y el cuadro enmarcado canónico queda por debajo del
libro de francés y de tres capturas de pantalla. Ninguna aritmética sobre la luminancia separa eso.
El esquema ya tiene `shot_type` con `SIGNATURE_DETAIL` y `BACK`.

**G. Lo que no está en la fotografía (5 fotos).** `RC-0006_cl11525h`, `RC-0006_yljuj7ei`,
`RC-0004_fbnfovem`, `RC-0004_yp9errxl` y `RC-0006_0xlg6v0u` no tienen los cuatro lados dentro del
encuadre. En `cl11525h` se midió el salto de luminancia donde debería estar el lado derecho: 0,2
sobre un ruido de 0,66. **No hay borde.** Ninguna técnica lo recupera y la respuesta correcta
seguirá siendo callar.

---

## 3. Las decisiones

### 3.1 Antes de tocar código

#### Decisión 1 · ¿Qué carácter tiene la función: sugerir mucho o sugerir poco y bien?

Todo lo demás cuelga de esta respuesta, porque fija qué se considera un fallo. Hoy el detector
habla en 36 de 44 y se equivoca en 20 de las 26 en las que debía callar.

*Alternativas:* seguir hablador; o exigir que los cuatro lados vengan de un pico real y añadir el
soporte de línea (recorrer cada lado candidato y medir en qué fracción de su longitud hay
realmente escalón, con signo consistente).

*Recomendación:* **precisa y callada.** No es una preferencia estética: está medido que exigir
cuatro lados de pico real baja los falsos positivos de 20 a 8 y el neto de −4 a +5, y es el cambio
más rentable de todo el banco. Es además lo que ya declara la cabecera del propio módulo, «una
sugerencia equivocada es peor que ninguna». Confirmación independiente: la única tubería del banco
que alcanzó el mejor neto (+6) y la mejor exactitud (IoU mediana 0,953) fue una que sugiere en 7 de
18 en vez de en 16 y tiene **un solo falso positivo de 26**.

*Coste:* enmudecen 15 sugerencias (7 malas y 8 inútiles) y se pierden dos buenas —
`RC-0004_svdi4ijh` (IoU 0,98) y `TS-0005_t5ggmzan` —, que son obras con un lado legítimamente
fuera del encuadre. El soporte de línea son unos 0,24 ms y es lo que además tolera los tramos sin
contraste que hoy estorban: el paño del caballete en `4jzjb8ud`, el objeto blanco que parte el
borde bueno en `svdi4ijh`.

*Reversible:* sí.

#### Decisión 2 · ¿La salida sigue siendo un rectángulo alineado con los ejes, o pasa a ser cuatro esquinas con rectificación?

Es la decisión que arrastra esquema, editor, invariante de «volver al original» y el pipeline
Python del catálogo impreso que todavía no existe.

*Alternativas:* ajustar cada lado con su pendiente y devolver la **caja envolvente** del
cuadrilátero, con el mismo tipo `Crop` y el mismo esquema; o guardar cuatro esquinas y rectificar
con homografía.

*Recomendación:* **caja envolvente. La homografía, no ahora.** Está medido que la caja recupera casi
todo el error de las fotos inclinadas: el error máximo de lado contra el recorte hecho a mano pasa
de 0,2187 a 0,0152 en `fulb26qf` (IoU 0,761→0,963), de 0,1874 a 0,0419 en `lqsk0hhz` (0,799→0,931)
y de 0,1856 a 0,0544 en `mxpt7dyn` (0,792→0,904). Y está medido que **la caja envolvente es lo que
ella dibuja a mano**: en `lqsk0hhz` la esquina del cuadrilátero cae en x≈0,027 y el recorte que
guardó empieza en 0,0301. La homografía sólo añade encima entre el 0,9 % y el 10,7 % de área
sobrante, con la peor esquina a 24,8-52,7 px sobre 700.

*Coste:* caja envolvente, cero columnas, cero migraciones, cero ficheros de interfaz; todo el
cambio queda en `edgeDetection.ts` y sus tests, y los 77 casos de `imageEdits.test.ts` siguen
intactos. Homografía: ocho columnas nuevas, migración en dos fases, un ADR, revisión de la
invariante, la cola de captura de IndexedDB otra vez, y el mismo warp reproducido en Python.
Detalle que decide por sí solo el momento: **Canvas 2D no puede aplicar una transformación
proyectiva** —`setTransform` es afín—, así que hace falta WebGL o un bucle por píxel, medido en 134
ms a 2000 px y 559 ms a 4000 px en este equipo, sobre másters de hasta 64,2 Mpx. No se ha medido en
un móvil.

*Reversible:* la caja envolvente, sí. La homografía, sólo con migración.

#### Decisión 3 · ¿Se cierra la vía de WebAssembly y las librerías?

*Alternativas:* descartar OpenCV en el cliente; traerlo monolítico y precachearlo; traerlo
troceado sin precachear el `.wasm`; moverlo a una función Edge.

*Recomendación:* **descartarlo, y descartarlo con los datos en la mano en vez de con el argumento
de autoridad del comentario de cabecera.** Se ejecutó OpenCV de verdad sobre los mismos 44 búferes
de luminancia: en el caso canónico de keystone (`lqsk0hhz`) da IoU 0,945 y el prototipo en JS puro
0,931, y **en los otros dos casos inclinados el JS puro va delante** (0,963 y 0,904). Son 2,74 MB
de brotli para comprar 0,014 de IoU en una foto y perder en dos. Las dos mediciones se confirman
entre sí por caminos independientes: OpenCV sitúa los lados de `lqsk0hhz` a 7,48° y 3,41°, y el
barrido de cizallamiento midió −7,69° y +4,00°. `jscanify`, que es el envoltorio que hace
exactamente esto, se descarta **por medición y no por tamaño**: 41 sugerencias de 44, cero
silencios, IoU mediana 0,599 contra 0,799 de hoy, y le da un cuadrilátero a la foto del incendio.

*Coste de descartar:* cero. *Coste de no descartar:* el precacheo pasa de 1,048 MB crudo / 323 KB
brotli en 10 entradas a 11,34 MB / 2,74 MB en 15 entradas, es decir ×8,5 en brotli, o **49,8 s a
2G**. Dos hechos probados compilando de verdad, que van contra la intuición y conviene no olvidar
si algún día se añade cualquier dependencia pesada: un `.wasm` perezoso **no** se precachea porque
`wasm` no está en `globPatterns` —se bajaría en el almacén sin cobertura, el fallo exacto que se
quería evitar—, y un chunk perezoso `.js` **sí** se precachea aunque no se use, como ya ocurre hoy
con `recordPdf-*.js` y sus 459 KB. La cabecera del módulo acierta en la conclusión y se equivoca en
el mecanismo: lo impagable es la descarga, no la compilación, que son 21 ms.

*Reservas:* el build a medida de core+imgproc es el único tamaño **estimado** y no medido
(~300-400 KB brotli, derivado de un dato publicado y de la razón de compresión real de 5,1×), y
todos los tiempos de CPU son de escritorio en Node, no de un móvil de gama media.

*Reversible:* sí.

#### Decisión 4 · ¿Entra una puerta por tipo de toma antes de mirar los píxeles?

*Alternativas:* no filtrar; filtrar con el valor que haya; exigir elegir el tipo de toma antes de
poder pedir la sugerencia.

*Recomendación:* **filtrar con el valor que haya, y sin reordenar el flujo de captura.** Es la
mejora con mejor relación coste/beneficio de todo el informe y no toca el detector: quita 5 de las
16 sugerencias malas y 11 de las 16 inútiles, **y no roza ninguna de las 4 buenas, porque las
cuatro son `GENERAL`**. El dato está a mano en los dos sitios que abren el editor, en el mismo
panel y justo encima del botón. Es lo único que ataca la mitad del problema que ningún umbral
alcanza. El botón no debe desaparecer: el editor ya usa ese criterio con «Volver al original»,
que se muestra deshabilitado y con el motivo.

*Coste:* un prop opcional en `PhotoEditor` y una rama de texto; dos ficheros, ninguna migración,
cero milisegundos. Contrapartida honesta: `GENERAL` se asigna solo al añadir la foto y el tipo se
puede fijar **después** del recorte, así que para una foto que nadie ha clasificado la puerta está
abierta y no filtra nada. Exigirlo antes añade una decisión a las 44 fotos para arreglar 5, con la
obra delante y una mano.

*Reversible:* sí.

#### Decisión 5 · ¿Se acepta reescribir el test que hoy exige inventar los lados que no están en la foto?

`edgeDetection.test.ts:158-173` («finds a painting whose border falls outside the photograph on two
sides») exige `outer.x === 0` y `outer.y === 0`. Es decir, **el contrato de tests exige hoy el
defecto B**: completar con el borde del fotograma los lados que no se ven.

*Alternativas:* mantener el test y renunciar a la regla de los cuatro lados; reescribir el caso;
una regla intermedia que admita un lado en el borde del fotograma si los otros tres puntúan alto
—que nadie ha medido—.

*Recomendación:* **reescribir el caso y añadir su contrario.** Ese test no describe un requisito de
la catalogadora: describe la implementación que produce las 14 cajas de más del 90 % del fotograma.
Y la regla que rompe es la de mayor rendimiento medido de todo el banco.

*Coste:* un caso de 16 líneas reescrito, más su contrario. Fuera de los tests, el precio real son
las dos sugerencias buenas que se pierden, ya contado en la decisión 1. El plan de pruebas
(`docs/plan-de-pruebas.md`) hay que actualizarlo con el requisito que ese caso cita.

*Reversible:* sí.

#### Decisión 6 · Las reproducciones digitales ya recortadas, ¿reciben sugerencia o la respuesta correcta es callar?

Hay dos en el lote, `AR-0001_nmjb8v5w` y `RC-0005_xkq1cncq`: escaneos o descargas sin marco ni
pared, con el contenido a 4-12 px del borde. Esta pregunta hay que contestarla **antes** de la
siguiente, porque de ella depende la mitad del argumento de la decisión 7.

*Alternativas:* sugerir, aunque el recorte útil sean dos puntos de área; o no proponer nada cuando
el contenido llega casi al borde.

*Recomendación:* **decidirlo a la vista de las dos fotos, no por deducción.** `AR-0001` es a la vez
el peor error del lote y la única fotografía donde el banco es exacto y no aproximado, así que es
el argumento entero a favor de bajar el umbral. Si para una reproducción ya recortada lo correcto
es callar, ese argumento desaparece y queda sólo la cota de la combinación. Nótese que hoy
`RC-0005` ya se rechaza por el motivo correcto (su contenido ocupa el 99,2 %, por encima de
`MAX_AREA`), y que relajar `MAX_AREA` o `MIN_INSET` pensando en otros casos la convertiría en un
falso positivo: tiene una línea de blanco puro de 3 px pegada al borde que es un escalón durísimo.

*Coste:* si se decide callar, el cambio de umbral pasa a justificarse con 5 fotos en vez de 6, dos
de las cuales mejoran menos de 0,03.

*Reversible:* sí.

#### Decisión 7 · ¿Se acota la combinación de umbrales, y se baja la prominencia de 0,25 a 0,22?

Son dos cosas y conviene no mezclarlas. Que `max(A, B)` pueda superar el máximo del perfil es un
**defecto de la combinación**, no el valor de una constante: hoy hace matemáticamente imposible
encontrar un pico en 6 ejes de 5 fotos. El 0,22, en cambio, es un número elegido para que quepa un
borde concreto.

*Alternativas:* dejar las constantes como están; acotar el término del MAD para que nunca supere al
de prominencia, manteniendo el 0,25; acotar y además bajar a 0,22.

*Recomendación:* **acotar siempre, pero desplegar la cota junto con las reglas de la decisión 1, no
antes.** Aquí hay un choque medido entre dos grupos y la síntesis importa: la cota sola —umbral sólo
de prominencia con el 0,25 de hoy— **empeora**, porque nacen 3 sugerencias donde hoy hay silencio y
las tres son malas, la IoU mediana baja de 0,945 a 0,893 y las que muerden más del 5 % pasan de 5 a
7. Los dos falsos positivos que aparecen (`RC-0006_yljuj7ei`, un detalle de superficie, y
`TS-0001_idipk03y`, el libro de francés) tienen **los cuatro lados de pico real**, así que ni
siquiera la regla de los cuatro lados los caza: hace falta el soporte de línea para distinguir un
borde de una banda de pintura.

Sobre el 0,22: con él mejoran 6 fotos (`AR-0001` de 0,540 a **0,981**, `0mmie7l3` 0,670→0,883,
`lqsk0hhz` 0,799→0,885, `mxpt7dyn` 0,848→0,882, `fulb26qf` 0,761→0,785, y `gutyi18w` pasa de nada a
0,678) y empeoran 2 (`t5ggmzan` 0,483→0,441, que ya era mala y en el sentido contrario, y
`s225lc4k` 0,995→0,649, que es un detalle de firma donde el silencio era lo correcto). El dato que
hay que saber antes de firmarlo: **con 0,224 en lugar de 0,22 el arreglo de `AR-0001` se cae entero
y vuelve a 0,699.** El margen real es de 0,3 unidades de gradiente en una fotografía. Construir una
constante sobre eso se decide a la vista, no se deduce.

Lo que **no** es alternativa: bajar `MIN_EDGE_STRENGTH`. Se midió bajarlo de 20 a **cero** —no a 15,
a cero— y cambia el veredicto de una sola foto de 44, que son unos auriculares donde el silencio era
correcto. Es casi peso muerto: el techo del MAD ya lo cubre. Y `MAD_MULTIPLIER` es irrelevante en
cuanto el término esté acotado: 4, 3 y 2,5 dan resultados idénticos.

*Coste:* unas 15 líneas tocadas y cero milisegundos. Ninguna foto pierde la sugerencia y los casos
buenos siguen buenos: `4jzjb8ud` 0,99, `4wpzg2n8` 0,99, `dpsptdbq` 0,99, y las dos sugerencias
aceptadas siguen en 0,999.

*Reversible:* sí.

### 3.2 Se pueden dejar para después

#### Decisión 8 · ¿Cuánto tiempo puede tardar la sugerencia en el móvil?

Sólo aplica si se hace el ajuste de pendiente por lado (decisión 2).

*Alternativas:* barrido completo de pendientes (237 ms en este equipo); banda de ±32 px alrededor de
cada lado (67,7 ms de mediana, 104 de máximo); perfil completo a media resolución (62,9 ms); no
buscar pendiente (0 ms); transformada de Hough (30,0 ms de mediana, 111 de máximo).

*Recomendación:* **banda de ±32 px alrededor de cada lado, con perfiles cizallados y no Hough.** El
perfil recto ya dice aproximadamente dónde está cada lado —el fallo medido es que el pico se
aplana, no que se mude al otro extremo—, así que buscar sólo en la banda cuesta 3,5 veces menos que
el barrido completo. Hough salió más barato de lo esperado, así que el argumento no es el tiempo,
es el código: la cizalla es el mismo Sobel que ya hay más un binning con interpolación lineal y
conserva la estructura que produce los dos candidatos anidados; Hough necesita acumulador 2-D,
supresión de no-máximos y emparejar rectas, unas 200 líneas más y un contrato nuevo, con un umbral
de voto que nadie ha barrido y una varianza que depende de cuántos píxeles votan (del 2,6 % en una
foto oscura al 39,5 % con un visillo de encaje).

*Coste y reserva importante:* el detector completo de hoy tarda 6,6 ms; con la banda serían unos 78
ms en este equipo. La extrapolación a **0,4-0,6 s en un Redmi Note 8 Pro** —la cámara que hizo seis
de estas fotos— es una **estimación, no una medida**: nadie ha ejecutado nada en un teléfono. Si el
factor real fuese 15 en vez de 5-8, la cizalla en banda pasaría de 0,5 a 1,5 s y habría que
replantearla. Es lo primero que conviene comprobar en el dispositivo real y es un experimento de
una tarde.

*Reversible:* sí.

#### Decisión 9 · ¿Se implementa el umbral por lado, que es la única pieza sin barrido detrás?

*Alternativas:* quedarse en constantes globales, que es lo único con números; implementarlo detrás
del banco y decidir con los resultados; dejarlo fuera.

*Recomendación:* **implementarlo detrás del banco y decidir después, no antes.** Es la única pieza
que resuelve una imposibilidad demostrada —las ventanas vacías de la causa A y el conflicto de
`AR-0001` en la causa D— y a la vez la única recomendación del informe que **podría no funcionar**.
El banco ya está montado para comprobarlo antes de tocar el repositorio: 44 búferes, la copia
parametrizada del detector y una puerta de verificación bit a bit contra el módulo real.

*Coste:* 130-180 líneas y 0,24 ms del soporte de línea, todo en el banco antes de entrar al
repositorio.

*Reversible:* sí.

#### Decisión 10 · ¿Cuántos rectángulos ofrece el detector, y cómo se presentan?

En cuatro fotos del lote «la obra» no es una sola cosa: en `t5ggmzan` es la tabla completa o sólo
la mancha pintada —recortar por la pintada deja la firma al filo—; en `0mmie7l3` el escalón
madera→paspartú es más fuerte que el borde exterior del marco; en `gutyi18w` hay que elegir entre
la cara frontal del marco-caja y la silueta con su costado; en `n6zvav7g` el candidato interior cae
en la ventana del paspartú y no en el collage.

*Recomendación:* **seguir con dos candidatos, y que el primero deje de aplicarse solo.** Hoy el
editor hace `setCrop(suggestion.outer)` en cuanto llega la sugerencia, y por eso `mxpt7dyn` cuenta
como fallo aunque su candidato interior acierte: **el bueno está detrás de un botón.** Tres
candidatos multiplican las combinaciones a puntuar y la interfaz a decidir. Ningún algoritmo
resuelve esto porque no es geometría.

*Coste:* unas 20 líneas en `PhotoEditor.tsx`. *Reversible:* sí.

#### Decisión 11 · ¿Se añade una columna que diga de dónde salió el encuadre?

*Recomendación:* **sí, un enum de procedencia (`crop_source`), y cuanto antes.** Es la decisión más
barata del informe y la que hace medible el detector en el futuro: hoy no hay forma de distinguir
el recorte que ella dibujó del que aceptó, y este banco tuvo que **inferir** la circularidad de dos
filas de un residuo de 2·10⁻⁴ en cuatro números. Esa inferencia es muy fuerte —cuatro números
coincidentes a 0,14 px, y el detector se desplegó tres días antes del volcado— pero no es una
prueba, y sin la columna toda medición futura arrastrará la misma duda.

*Coste:* una migración aditiva, una línea en `editToColumns` y otra en la escritura de la cola. Las
44 filas quedan en `NULL` = desconocido, **nunca en «manual»**, que sería inventar el dato. Cero
filas migradas, un despliegue.

*Reversible:* con migración.

#### Decisión 12 · Si algún día se persiste la perspectiva

Sólo si la decisión 2 se resuelve al contrario de lo recomendado. Queda anotado el orden de las
respuestas, todas con su motivo ya escrito: **cuatro esquinas en ocho columnas `numeric`**, no los
ocho coeficientes de la homografía ni un `jsonb`, por el mismo argumento de verificabilidad que ya
escribió la migración `20260729110000` («un check puede verificarlas»: una esquina se acota, un
`h21` no); **aditivas y con precedencia explícita** sobre `crop_*`, para que el despliegue siga
siendo de una fase, porque el frontend viejo corre unos segundos contra el esquema nuevo;
**tamaño de salida por regla geométrica fija y documentada, nunca las medidas de la ficha** —está
medido que 5 de las 8 fotos inclinadas pertenecen a obras con `height_cm` y `width_cm` en `NULL`, y
ninguna de las 8 a una obra con `measurements_verified`, que sólo lo tiene 1 de 21 y son unos
auriculares del fondo de pruebas—; **perspectiva prohibida en la vía degradada**, donde el editor
trabaja sobre la derivada de 2000 px y `composeEdits` se sostiene hoy en que el recorte sólo puede
estrecharse; al pipeline Python se le promete **el mismo encuadre con una tolerancia escrita, no el
mismo píxel** —prometer el píxel sería falso ya hoy: reproducir `drawImage` con PIL cuesta 0,14 px
de residuo con el filtro que mejor ajusta—; y **ninguna campaña de re-renderizado** de las 28 filas
que ya tienen recorte, porque no hay servidor que las procese y porque el encuadre guardado es
criterio de la catalogadora, no geometría. Y una que se descarta en cualquier escenario: **el
ángulo libre** en lugar de los cuatro cuartos de giro. Está medido que no es un sustituto barato del
cuadrilátero: en `lqsk0hhz`, enderezando con la pendiente del lado izquierdo, ese lado se recupera
y el derecho pierde el pico y se inventa exactamente en 1,0000. Cambia un lado inventado por otro.

---

## 4. Lo que se puede hacer ya sin decidir nada

Cuatro cosas no comprometen ninguna alternativa y arreglan hoy parte del daño.

**El mensaje de fallo, reescrito como tarea.** Ocho fotos no reciben sugerencia y en seis de esas
ocho el silencio es la respuesta correcta, así que el texto actual —«No se ha podido reconocer el
borde del cuadro»— declara un fallo de la máquina justo donde la máquina acierta. Algo como «No he
reconocido el borde del cuadro: arrastra las esquinas para recortarlo a mano» es una cadena, un
fichero y cero migraciones. Los motivos reales del rechazo no se cuentan: son la máquina.

**«Descartar la sugerencia».** `suggest()` hace `setCrop(suggestion.outer)` y **pisa sin copia el
rectángulo que ella hubiera arrastrado**. Con 16 de 36 sugerencias malas, pedir la sugerencia es
hoy una apuesta que puede costarle el trabajo hecho. Un ref con el rectángulo previo y un botón que
lo restaure son unas 15 líneas; conviene ponerlo en la fila de «Hasta el marco / Solo la obra» y no
en una nueva, porque el pie del editor ya mide unos 372 px y deja la superficie de trabajo en
250-310 px de alto en un móvil.

**Confirmar siempre, nunca aplicar solo.** Es lo que ya se hace y conviene dejarlo escrito como
decisión y no como inercia, porque el coste de lo contrario está medido: aplicar reescribe las dos
derivadas en rutas nuevas (~30 KB de miniatura más ~300 KB de WebP) y las copias superadas no se
borran nunca —el bucket ya tiene 83 pares para 44 filas, o sea 39 pares huérfanos—, así que cada
error deshecho son unos 660 KB subidos y 4 ficheros huérfanos, sobre cobertura de almacén. Y no hay
criterio de confianza posible con el que decidir cuándo aplicar solo: el contraste no separa obra de
no-obra.

**Corregir el comentario de cabecera de `edgeDetection.ts`.** Su argumento central queda
**confirmado** por medición —0 KB de descarga frente a 2,74 MB de brotli y 49,8 s a 2G—, pero el
mecanismo que cita es el equivocado: lo impagable es la descarga, no la compilación, que son 21 ms.
Y su corolario es falso: dice que una obra en perspectiva «degrada hacia nada, que es el resultado
honesto», y lo medido es que degrada hacia sugerencias silenciosamente malas. **Ninguno de los 8
silencios del lote se rechaza por ser un trapecio.**

Y una tarea de fontanería que no cambia el detector: el banco de pruebas —los 44 búferes de luminancia, la copia verificada del
detector y los 88 PNG con el rectángulo dibujado— es lo que ha permitido decidir con números, y vivía
en un directorio temporal que ya no está. Si se va a tocar el detector, ese corpus tiene que estar en
algún sitio estable, con los tres pares duplicados marcados como tales y con la clasificación de qué
foto es obra puesta por escrito.

---

## 5. Lo que recomiendo

Cerrar la vía de WebAssembly con los datos en la mano y hacer el trabajo en aritmética propia, en
tres escalones que se pueden parar en cualquiera de los tres. **Primero, reglas de decisión sin
geometría nueva**: acotar la combinación de umbrales para que no pueda ser matemáticamente
imposible encontrar un pico, exigir que los cuatro lados vengan de un pico real, añadir el soporte
de línea con signo consistente y meter la puerta por tipo de toma. Eso es lo único que ataca los 20
falsos positivos, que son el problema mayoritario, y baja de 20 a 8 con 0,3 ms de coste. **Segundo,
pendiente por lado y caja envolvente del cuadrilátero**, con búsqueda en banda y una puerta de
ganancia para que las fotos alineadas devuelvan pendiente exactamente cero: recupera `fulb26qf` de
0,761 a 0,963, `lqsk0hhz` de 0,799 a 0,931 y `mxpt7dyn` de 0,792 a 0,904 sin tocar el esquema, sin
tocar la invariante de «volver al original» y sin una sola línea de interfaz nueva. **Tercero, el
umbral por lado**, implementado detrás del banco y medido antes de decidir si se queda. El orden no
es negociable: la búsqueda de pendiente afila también lo que no es obra —el libro de francés pasa a
proponer el 78 % del fotograma— así que el segundo escalón sin el primero **empeora** el resultado.
Se descartan, y con motivo medido: OpenCV en el cliente y `jscanify`, la homografía persistida, el
ángulo libre como atajo, bajar `MIN_EDGE_STRENGTH`, la función Edge, y la campaña de re-renderizado
de las fichas ya editadas.

Y una promesa que no se va a hacer: esto no detectará todas. En cinco fotografías del lote los
lados de la obra no están dentro del encuadre y en una de ellas el salto de luminancia donde
debería estar el borde es 0,2 sobre un ruido de 0,66. Ahí la información no está en la foto, y la
respuesta correcta seguirá siendo callar y decirlo.

---

## Reservas del conjunto

Cinco cosas no se han medido y conviene tenerlas presentes al decidir. **La composición no está
medida**: las cifras de umbral y las de geometría vienen de ejecuciones separadas y cada una
empeora algo que la otra arregla —la cizalla baja `dpsptdbq` de 0,987 a 0,972, el umbral baja
`t5ggmzan` de 0,483 a 0,441—, así que cualquier «de 3 a 7 sobre 13 por encima de 0,9» es una
composición y hay que rehacerla en el banco antes de escribir código de producción. **El móvil es
una extrapolación**: los milisegundos son de este equipo con Node, y el factor 5-8 de un Redmi Note
8 Pro viene del conocimiento del rendimiento de JS en ese SoC, no de haber ejecutado nada en un
teléfono. **El umbral por lado no tiene barrido detrás**, sólo relajaciones globales. **La IoU no es
la verdad**: el recorte guardado es el criterio de la catalogadora, que puede incluir margen a
propósito o ceñirse al lienzo en vez del marco, así que optimizar constantes contra 11-13 filas es
sobreajustar a trece decisiones de una persona. **La clasificación de qué foto es obra, reverso,
detalle o no-obra viene del triaje visual** hecho mirando las fotos: si esa clasificación cambia,
cambian todos los denominadores de falsos positivos y de recuperación, no los mecanismos.
