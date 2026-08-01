# ADR-008 · La perspectiva se guarda como cuatro esquinas

**Fecha:** 1 de agosto de 2026
**Estado:** Aceptada
**Revisa:** el «fuera de alcance» de la perspectiva que escribía la cabecera de
`app/src/lib/edgeDetection.ts`, y la forma del encuadre de
[ADR-002](ADR-002-almacenamiento-de-imagenes.md)
**Se apoya en:** [`revision/deteccion-de-bordes-medicion.md`](../revision/deteccion-de-bordes-medicion.md)

---

## Contexto

Un cuadro fotografiado en ángulo no es un rectángulo en la foto: es un trapecio. Recortarlo con un
rectángulo deja pared por dos lados y come obra por los otros dos, y no es un caso raro — medido sobre
las 44 fotografías del catálogo, **ocho de las catorce obras pasan de 1° de convergencia y dos llegan a
11,69°**.

El detector de bordes se escribió declarando la perspectiva fuera de alcance, con el argumento de que
una obra inclinada «degrada hacia nada, que es el resultado honesto». La medición desmintió esa frase:
de las 36 sugerencias que daba, 16 eran malas, y **ninguno de los ocho silencios se rechazaba por ser un
trapecio**. Degradaba hacia sugerencias silenciosamente malas.

## Decisión

La corrección de perspectiva se guarda como **las cuatro esquinas de la obra en la fotografía**, en ocho
columnas `numeric` de `images`, con precedencia sobre `crop_*`.

**Las esquinas y no la imagen deformada.** El máster sigue intacto (ADR-002), las esquinas se vuelven a
arrastrar y el rectificado se recalcula. Es la misma invariante que ya sostenía el recorte —lo guardado
es absoluto sobre el máster, así que reeditar sustituye y no compone— y es lo que hace verdad que se
pueda rehacer cuando se quiera.

**Las esquinas y no los ocho coeficientes de la homografía, ni un `jsonb`.** Ocho números que son
posiciones se pueden acotar con un `check`, dibujar en pantalla y leer de un vistazo; un `h21` no
significa nada verificable. La matriz se calcula donde se necesita: guardarla sería guardar el resultado
de una cuenta en vez de sus datos.

**Tres reglas en la base y no en el cliente**, porque las tres producen daño que solo se ve al abrir la
ficha: las ocho columnas o ninguna, cada esquina dentro de un margen de un cuarto de la imagen hacia
fuera, y que el cuadrilátero no se cruce consigo mismo. La tercera se comprueba con el signo del área con
signo, y su signo se dedujo al revés la primera vez: el `check` lo cazó en la primera inserción.

**El margen hacia fuera es deliberado.** En cinco fotografías del lote los lados de la obra no están
dentro del encuadre, y arrastrar una esquina fuera del borde es la única forma de rectificar esas. Lo que
cae fuera se rellena de blanco y la interfaz lo dice.

**El tamaño de salida es la media de los lados opuestos.** No recupera la proporción física y no lo
pretende: es determinista, se reproduce en el pipeline de Python y no depende de ningún dato que alguien
pueda editar después.

**Y el rectificado corre en el cliente, con un bucle por píxel.** Canvas 2D no puede aplicar una
transformación proyectiva —`setTransform` es afín por construcción—, así que se recorre el destino
preguntando a cada píxel de salida de dónde viene.

## Alternativas descartadas

**Quedarse en la caja envolvente del cuadrilátero.** Es lo que se implementó primero y sigue en pie: el
detector ajusta cada lado con su pendiente y devuelve la caja. Recupera casi todo el error —`fulb26qf`
pasa de 0,761 a 0,967 de IoU— sin una columna nueva. Se descarta como punto final, no como paso: la caja
sigue dejando pared en dos esquinas, y la usuaria pidió explícitamente poder rehacer la corrección
cuando quisiera, que es lo que las esquinas guardadas dan.

**Recuperar la proporción real con la focal de la cámara.** Matemáticamente posible a partir de los
puntos de fuga, y descartado **con datos**: el cálculo se vuelve inestable justo cuando la inclinación es
pequeña, que es todo nuestro rango (1° a 12°), y de las 44 fotografías **solo 17 traen una focal
convertible a píxeles**, mientras que las tres fotografías canónicas de perspectiva no traen EXIF
ninguno.

**Tomar la proporción de las medidas de la ficha.** Suena a lo correcto y no sirve: cinco de las ocho
inclinadas pertenecen a obras con `height_cm` y `width_cm` nulos, y ninguna a una con
`measurements_verified`. Ataría además los píxeles de una fotografía a un dato que se corrige después,
así que rectificar dos veces la misma foto daría dos resultados.

**WebGL para el rectificado.** Descartado con la medida en el teléfono de la catalogadora: 89 ms el
bucle por píxel a 2000 px contra 51 de WebGL, y a 4000 px la ventaja se cae a 1,20× porque manda la
subida de la textura. Treinta y ocho milisegundos no pagan dos *shaders*, una vía para el contexto
perdido y un repliegue que haría falta igual.

**OpenCV.js o `jscanify` para detectar el cuadrilátero.** Descartado por medición y no por tamaño:
ejecutado sobre los mismos búferes, OpenCV gana 0,014 de IoU en una fotografía y **pierde en las otras
dos** inclinadas; `jscanify` da 41 sugerencias de 44, cero silencios, y le pone un cuadrilátero a la
fotografía de un incendio. Son 2,74 MB de brotli, ×8,5 el precacheo de la PWA, 49,8 s a 2G.

**El ángulo libre de giro en vez del cuadrilátero.** Medido: enderezando `lqsk0hhz` por la pendiente de
su lado izquierdo, ese lado se recupera y el derecho pierde el pico y se inventa exactamente en 1,0000.
Cambia un lado inventado por otro.

## Consecuencias

- **`composeEdits` prohíbe la perspectiva y lanza si la recibe.** Su único llamante es la vía degradada,
  donde el máster no se pudo descargar y la copia ya lleva su encuadre incrustado: un segundo warp iría
  sobre píxeles ya interpolados y la fila dejaría de decir la verdad sobre el máster. El editor
  deshabilita las asas allí y explica por qué.
- **El despliegue sigue siendo de una fase.** Las columnas nuevas nacen nulas, las veintiocho filas que
  ya tenían recorte lo conservan y el frontend viejo sigue leyéndolas. No hay campaña de
  re-renderizado: no hay servidor que las procese y el encuadre guardado es criterio de la
  catalogadora, no geometría que se pueda recalcular mejor.
- **El warp nunca toca el máster.** `getImageData` de un máster de 9248×6936 son 256 MB de array, que un
  teléfono no tiene. La fotografía se baja primero a 2400 px de lado largo con `drawImage`, que va por
  GPU, y el bucle corre sobre eso. Se pierde algo de nitidez frente a muestrear el original
  perspectiva-correctamente, y es el precio.
- **Unas esquinas que son un rectángulo se guardan como recorte**, porque enderezar remuestrea cada
  píxel y hacerlo para un rectángulo costaría nitidez a cambio de nada.
- **Al pipeline de Python del catálogo impreso se le promete el mismo encuadre con una tolerancia
  escrita, no el mismo píxel.** Ya era verdad antes: reproducir `drawImage` con PIL cuesta 0,14 px de
  residuo con el filtro que mejor ajusta.
- Aparece `crop_source`, que no es parte de la perspectiva pero se decidió con ella: hasta ahora era
  imposible distinguir el recorte dibujado a mano del aceptado de una sugerencia, y medir el detector
  obligó a **inferir** esa distinción de un residuo de dos diezmilésimas en cuatro números. Nace nula en
  lo que ya existía — «no se sabe», nunca «a mano».
- La cabecera de `edgeDetection.ts` deja de declarar la perspectiva fuera de alcance, y su argumento
  contra las librerías se queda: confirmado por medición, aunque el mecanismo que citaba era el
  equivocado —lo impagable es la descarga, no la compilación, que son 21 ms.
