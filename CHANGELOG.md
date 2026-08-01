## 1 de agosto de 2026

### Interfaz

**La fotografía abierta va en la dirección de la página**
Al abrir una fotografía para editarla, su código aparece en la dirección
—`/artwork/TS-0005/photos/TS-0005_v2`—, así que recargar no la pierde y el enlace se puede
guardar o enviar y abre esa misma foto. Si el enlace nombra una fotografía que ya se retiró, se abre la
principal en vez de dejar la pantalla a medias.

**Enderezar una fotografía tomada en ángulo**
Un cuadro fotografiado de lado sale como un trapecio, y recortarlo con un rectángulo deja pared por dos
esquinas y se come obra por las otras dos. Ocho de cada catorce obras del catálogo están así. Ahora el
editor tiene «Corregir perspectiva»: se arrastran las cuatro esquinas de la obra y, al lado, se ve en
todo momento cómo va a quedar enderezada.

Lo que se guarda son **las cuatro esquinas, no la imagen deformada**, así que se pueden volver a mover
cuando se quiera y el original de archivo no se toca nunca. Si una esquina de la obra se sale de la
fotografía se puede arrastrar fuera del borde —es la única manera de enderezar esas tomas— y esa zona
saldrá en blanco, que el editor avisa. Y si se arrastra una esquina por encima de su vecina, el editor no
lo permite: enderezar eso daría una imagen doblada sobre sí misma.

No se ofrece cuando la fotografía original no se ha podido descargar y se está trabajando sobre la copia
de consulta: enderezar lo ya enderezado estropearía la imagen, y el botón lo dice en vez de fallar
después.

Y una cosa pequeña que iba con esto: pedir la sugerencia ya no pisa sin remedio el recorte que se
hubiera hecho a mano. Hay un botón para devolverlo.

**La sugerencia de recorte pasa a acertar, y a callar cuando no sabe**
Antes proponía recorte en 36 de 44 fotografías y solo cuatro propuestas eran buenas: dieciséis
recortaban por donde no toca —cinco se comían parte de la obra— y otras dieciséis proponían casi la
foto entera. Ahora propone en dieciséis y **ninguna está mal**.

Tres cosas la arreglan. Ya no se inventa los lados que no se ven en la foto, que era de donde salían
los recortes de «toda la fotografía». Comprueba que cada lado sea de verdad una línea y no una banda
de pintura o el borde de una captura de pantalla, que era lo que le hacía dibujar rectángulos
perfectos sobre cosas que no son obra. Y **ya no hace falta que el cuadro esté de frente**: cada lado
se ajusta con su inclinación, así que las fotos tomadas en ángulo —ocho de cada catorce obras— pasan
de no funcionar a funcionar; en la peor, el recorte propuesto coincide ya en un 97 % con el que se
haría a mano.

En el reverso de un lienzo, en un detalle de firma o en un detalle de daño no lo ofrece: ahí no hay
borde de cuadro que reconocer, y el botón lo dice en vez de proponer cualquier cosa. Y cuando calla,
el mensaje dice qué hacer —«arrastra las esquinas»— en vez de anunciar una avería: de las veces que
calla, la mayoría son fotos donde no había nada que recortar.

**La ubicación se elige de una lista de sitios, y se puede corregir de una vez**
El campo de ubicación deja de ser un texto que hay que escribir igual cada vez. Ahora se elige de una
lista con los sitios sangrados por niveles y un buscador arriba: cada coma que escribes abre un nivel
dentro del anterior y crea lo que falte, y si el nombre lleva una coma dentro —una dirección postal la
lleva— hay un botón que se lo traga entero. «Sin ubicación» es una opción más de la lista, porque una
obra sin sitio registrado es una respuesta legítima cuando la tienes delante y no sabes aún dónde va.
Los nombres se escriben como se leen, con sus mayúsculas y sus tildes.

Hay además una pantalla propia de ubicaciones, en la pestaña «Tablas» del menú del pie, para crear,
renombrar, mover y retirar
sitios. Ahí es donde se arreglan de una vez los nombres que venían del sistema anterior: corregir
«museo de bellas artes de badajoz muba» es una edición, y la ven todas sus obras. Mover una estantería
se lleva consigo todo lo que hay dentro.

**El filtro de ubicación busca por sitio y no por cómo se escribió**
Filtrar por un sitio sigue trayendo todo lo que hay dentro de él, a cualquier profundidad, pero ahora
se apoya en la lista de sitios y no en comparar textos. Dos consecuencias que se notan: se puede
filtrar por «Sin ubicación» para ver qué obras están pendientes de colocar, y renombrar un sitio ya no
rompe un enlace guardado o compartido. Los enlaces de antes siguen funcionando: se traducen solos al
abrirlos.

**Los tipos de obra y las series ya se mantienen desde «Tablas»**
La sección «Tablas» del menú del pie tiene ahora sus tres listas: ubicaciones, tipos de obra y series.
En las dos nuevas se puede crear una entrada, corregir su nombre y retirar la que ya no se use. Y
corregir un nombre es una sola edición: cambiar «Tecnica mixta» por «Técnica mixta» lo ven al momento
todas las obras que lo llevan y también el filtro del listado, sin repasar ficha por ficha. Los tipos
y las series se siguen añadiendo desde el propio formulario de la ficha, que es donde hacen falta con
la obra delante; lo que antes no se podía hacer desde ningún sitio era arreglarlos.

Cada serie aparece bajo el fondo al que pertenece, y al crear una hay que elegir el fondo: los dos
fondos pueden tener una serie con el mismo nombre y son dos series distintas, así que una lista de
nombres a secas sería una invitación a meter una obra en la serie de otro artista. El fondo de una
serie ya creada no se cambia, porque cambiarlo dejaría sus obras en un fondo que no es el suyo; para
eso se mueven las obras. Y los fondos en sí no se tocan desde aquí: su nombre está dentro del
identificador pegado a cada cuadro.

Nada se borra: se retira. Lo retirado deja de ofrecerse al catalogar y al filtrar, sigue visible en su
lista en gris y vuelve con un botón. Un tipo o una serie que todavía tenga obras dentro no se puede
retirar, y la aplicación lo dice con lo que hay que hacer antes —cambiar el tipo de esas obras, o
sacarlas de la serie—. Escribir en «Añadir» un nombre que ya existe no lo duplica, aunque se escriba
con otras mayúsculas o tildes, y escribir uno que estaba retirado lo recupera.

**El teclado manda sobre la galería a pantalla completa**
Con una fotografía abierta a pantalla completa, las flechas del teclado pasan entre las fotos de la
obra y ya no entre obras, que era lo que hacían antes; la tecla «f» abre y cierra la pantalla
completa, y el atajo se anuncia al poner el ratón sobre el icono. En el móvil no cambia nada.

### Diseño lógico de la aplicación y esquema de datos

**La ubicación física pasa a ser un árbol de lugares**
Hasta ahora la ubicación era un texto copiado en cada obra, con la convención de escribirlo en
minúsculas, sin tildes y con los niveles separados por comas. Con veintiuna obras catalogadas quedó
claro que no se sostiene: los nombres de museos y ciudades necesitan sus mayúsculas y sus tildes, la
coma aparece dentro de los valores —una dirección postal la lleva—, y renombrar un sitio obligaba a
tocar todas sus obras justo mientras el estudio está en reordenación. Los sitios pasan a ser una
lista jerárquica con identidad propia: renombrar un lugar, o mover una estantería entera con lo que
haya dentro, se hace una vez y se refleja en todas las obras. Y la base garantiza lo que antes había
que recordar: no hay dos sitios hermanos con el mismo nombre, la jerarquía no admite bucles y no se
puede retirar un lugar que tenga obras o sitios dentro. De aquí sale además un criterio para todo el
catálogo: el nombre de una lista maestra no es su identidad, así que renombrar una entrada no vuelve
a ser una conversión de datos. (ADR-006)

**Los sitios que había se han convertido, y ninguna obra se ha quedado sin el suyo**
Los textos de ubicación de las diecisiete obras que tenían uno se han repartido por sus comas y han
salido ocho sitios, dos de ellos dentro de otro. Los nombres han entrado tal como estaban guardados,
en minúsculas y sin tildes, y se corrigen desde la pantalla de ubicaciones una vez por sitio. Un valor
que era de prueba no se ha convertido: la obra que lo llevaba se ha quedado sin ubicación, que es lo
que era. La conversión no ha tocado la traza de quién editó cada obra ni la fecha en que se examinó
por última vez, porque trasladar un dato no es haber tenido la pieza delante; cambiar una obra de
sitio sí lo es, y esa sí mueve la fecha.

**Los museos y las colecciones son lugares provisionales**
Seis de las veintiuna obras están en manos de terceros, y hoy eso se escribe dentro del nombre del
lugar, la propiedad incluida. Entran en el árbol como sitios a sabiendas de que no es su lugar
definitivo: cuando existan el estatus legal, el titular de derechos y la tabla de Propietarios e
Instituciones que el esquema ya prevé, dejarán de ser lugares y pasarán a ser lo que son.

**Las tablas que el catálogo todavía no tiene** · *estado a esa fecha*
Del esquema de campos completo existen hoy las obras con los datos que se rellenan con la pieza
delante, las fotografías, las cuentas con su rol y las listas de tipos de obra, series y lugares.
Quedan por construir Exposiciones, Bibliografía, sus dos tablas de enlace, Propietarios e
Instituciones, y Archivo y Documentación; y con ellas la pantalla de papelera y el bloqueo de edición
que evitará que dos personas trabajen a la vez sobre la misma ficha.

---

### La base de datos del catálogo

**Los tipos de obra y las series se pueden renombrar sin tocar las obras**
Hasta ahora el nombre de un tipo de obra o de una serie era su identidad, así que corregirlo obligaba
a reescribir todas las obras que lo usaran, y por eso no se podía hacer desde la aplicación. Ahora
cada uno tiene su propia identidad y el nombre es un dato más: corregir «Técnica mixta» o el nombre de
una serie será una edición que verá el catálogo entero. Aparece además la posibilidad de retirar un
tipo o una serie que ya no se usen —sin borrarlos, como todo aquí—, con la misma regla que los
lugares: no se retira lo que todavía tiene obras dentro. Las pantallas que lo hacen están en la
sección «Tablas», más arriba; este cambio es el que lo hace posible.

**Sin haber entrado no se llega a nada**
La primera versión del catálogo creyó cerrar las operaciones internas de la base y no las cerró: la
orden que se escribió retiraba el permiso a quien no ha entrado, pero quien lo tenía era «todo el
mundo», del que los demás son miembros. No había datos expuestos, pero sí una operación de escritura
que se podía lanzar sin haber entrado. Ahora los permisos se retiran y se conceden uno a uno, lo que
se cree en el futuro nace cerrado, y quien impide que vuelva a pasar es una prueba automática y no una
orden que parecía decirlo.

**Preparado el rechazo de contraseñas de filtraciones conocidas**
Delante del catálogo no hay más perímetro que la contraseña de cada cuenta, así que queda montado el
interruptor que rechaza las que aparecen en filtraciones públicas. Está apagado porque es una función
de pago: el día que se suba de plan se activa cambiando una línea, y hasta entonces el aviso queda
abierto y explicado en vez de silenciado.

**Una copia del catálogo real para investigar problemas**
Reproducir un fallo con los datos de verdad delante ya no exige consultar el catálogo en producción:
un comando trae las filas y, si se pide, también las fotografías, y las deja cargadas en el entorno
de trabajo. Las contraseñas no viajan nunca y la copia no entra en el repositorio, que es público:
son datos reales y llevan datos personales dentro.

---

## 31 de julio de 2026

### Interfaz

**Pasar a la obra siguiente sin volver al listado**
La ficha se convierte en un recorrido sobre el listado del que se ha llegado: las mismas obras, en el
mismo orden, con los filtros y la búsqueda que hubiera puestos. Se pasa con las flechas de la
cabecera —que además dicen «12 de 87»—, con los dos enlaces del final de la ficha, que muestran el
código y el título de la obra anterior y de la siguiente, o arrastrando de lado con el dedo o con el
ratón. La secuencia se congela al abrir la ficha, para que editar la obra que se tiene delante no la
mueva de sitio a mitad del recorrido.

**Un listado buscado se puede compartir y se recupera con «atrás»**
El texto buscado pasa a formar parte de la dirección de la página, igual que los filtros y el orden.
No se recuerda de un día para otro: recuperar mañana lo que alguien buscó una vez sería reducir el
catálogo por algo que nadie ha pedido.

---

## 29 de julio de 2026

### Interfaz

**Girar y recortar una fotografía, con sugerencia de recorte**
Editor a pantalla completa con asas grandes en las cuatro esquinas y una lupa que amplía la esquina
que se está ajustando, porque el dedo tapa justo el píxel que se quiere afinar. «Sugerir recorte»
busca los bordes del cuadro y, cuando distingue el marco de la tela, ofrece elegir entre «Hasta el
marco» y «Solo la obra»; no aplica nada por su cuenta, y si lo que ve no parece un cuadro no propone
nada, antes que proponer mal. Funciona con las tomas recién hechas y con las que ya están en una
ficha, y siempre se puede volver al fotograma original completo.

**Ordenar las fotografías de una obra**
Las fotos dejan de mostrarse por orden de subida —que es un accidente de cómo se hizo la ficha— y
pasan a tener el orden que se les dé, arrastrándolas por un asa de la miniatura. El panel de cada
foto ofrece además moverla antes o después: un gesto no puede ser la única forma de llegar a una
función.

### Diseño lógico de la aplicación y esquema de datos

**El giro y el recorte de una fotografía son un dato, no un archivo nuevo**
Lo que se guarda son cuatro números en la fila de la fotografía: el cuarto de vuelta y el rectángulo
del recorte. El máster no se modifica nunca, así que el fotograma original se puede recuperar hoy o
dentro de un año, y el catálogo impreso podrá rehacer sus copias con el mismo encuadre sin volver a
decidirlo; reeditar una foto escribe copias nuevas en lugar de sobrescribir las anteriores.

**La serie es una lista controlada, y cada fondo tiene la suya**
Un artista trabaja por series y el catálogo agrupa por ellas, así que el nombre tiene que escribirse
igual siempre: dos ortografías de una serie son dos series que nadie puede agrupar. Es una lista
abierta, que se amplía desde la propia captura, y el fondo forma parte de la identidad de la serie
—ofrecer una serie de Rotili catalogando a Ruiz Campins invita a un dato falso—. Una obra puede no
pertenecer a ninguna, y eso no es un dato pendiente.

### Correcciones

**Cambiar la fotografía principal fallaba a veces**
La operación marcaba la nueva y desmarcaba la anterior de un solo movimiento, dando por hecho que la
base comprobaría al final que no hubiera dos; no lo hace, comprueba fila a fila. Que fallara o no
dependía del orden interno de las filas, lo que hacía parecer que el culpable era el recorte de la
foto; ahora se desmarca primero, y las dos cosas siguen siendo una sola operación.

**Tras recortar una fotografía seguía viéndose el recorte anterior**
La galería recordaba las imágenes por su identificador, que no cambia al reencuadrar, así que la
copia vieja se quedaba en pantalla hasta recargar la página. Ahora las recuerda por su archivo.

**La fotografía no salía en la ficha en PDF**
Lo que el navegador guarda para no volver a descargar las miniaturas estaba interceptando también la
lectura de los píxeles que la ficha impresa necesita, y devolvía algo que no se podía leer.

**Arrastrar las miniaturas no funcionaba con el dedo**
Recoger la miniatura manteniéndola pulsada no puede funcionar: el navegador decide al empezar el
toque si el gesto es suyo, y cuando se cumple la espera ya se lo ha quedado como desplazamiento de la
página. Ahora se arrastra desde un asa en la esquina, y desplazar la página sigue funcionando en todo
lo demás.

**Mantener pulsado el selector de años volvió a repetir en el móvil**
El navegador leía la pulsación sostenida como un gesto propio y cancelaba la repetición antes de que
arrancara. De paso, ahora acelera a partir de segundo y medio: cruzar una década no debe exigir
paciencia.

---

## 28 de julio de 2026

### Interfaz

**Las medidas se escriben y se leen en español**
El decimal se teclea con coma —antes era imposible, la coma se borraba antes de llegar el siguiente
dígito— y el «cm» va dentro del campo, en la captura y en la ficha.

**Editar la ficha es una pantalla propia**
La edición tiene su propia dirección, así que sobrevive a una recarga y el botón «atrás» del móvil
sale del formulario y no de la ficha. Un Lector que llegue a ella por un enlace cae en la vista de
consulta.

**El título y la respuesta a quién lo puso se rellenan juntos**
El formulario ofrece solo los estados que tienen sentido con lo que hay escrito, como tarjetas con su
icono y su explicación, y avisa al cruzar de un lado a otro: con el campo vacío caben «Sin revisar» y
«No consta título»; con un título escrito, «Del artista», «Atribuido» y «Sin confirmar».

### Diseño lógico de la aplicación y esquema de datos

**La autoría del título tiene cinco respuestas, no tres**
«Sin revisar» estaba cubriendo dos situaciones distintas: el título pendiente de investigar y el
título ya escrito cuya autoría nadie ha verificado. La segunda pasa a ser un estado propio, «Sin
confirmar», los datos existentes se convirtieron al nuevo, y la base impide desde entonces que el
título y la respuesta sobre su autoría se contradigan.

**El tipo de obra sale de una lista, no de un campo de texto**
Hay un catálogo de tipos que se amplía desde el propio formulario, y la base comprueba que lo
guardado esté en él. Puede quedar vacío, que sigue siendo una respuesta válida.

**El código interno pasa a inglés, y lo que ya está en el mundo se conserva**
Cambio interno que no altera nada de lo que se ve: los textos de la aplicación siguen en español. Se
hizo con cuidado de no romper lo que ya existe fuera: los QR ya pegados en las obras siguen
funcionando para siempre, los identificadores AR-, RC- y TS- no se tocan y un lote de captura abierto
sobrevive a la actualización. El único precio, asumido y anotado: la cola de fotografías pendientes
de subir se perdió una vez con el cambio.

### Correcciones

**Los códigos QR impresos devolvían un error**
Al alojamiento le faltaba una regla, y cualquier dirección que no fuera la portada respondía «no
encontrado» a quien entrara desde fuera de la aplicación instalada — incluidos los QR pegados en las
obras.

**En el fondo de pruebas no se podía subir ninguna fotografía**
El fondo de ensayo se añadió con su prefijo TS-, pero el prefijo no llegó a los nombres de las
imágenes ni al permiso de subida de los másters, así que en una ficha TS- la subida se rechazaba
entera, tanto al crear como al editar.

**Deslizar en la galería dejaba la fotografía oscilando**
Con la galería y el visor a pantalla completa abiertos sobre la misma selección, cada uno deshacía el
movimiento del otro en bucle. Ahora cada uno ignora los ecos de su propio desplazamiento, y un toque
del dedo en medio recupera el mando.

---

## 27 de julio de 2026

### Diseño lógico de la aplicación y esquema de datos

**La fecha de ejecución se guarda estructurada**
En lugar de un texto, la ficha guarda el año de inicio, el de fin, las dos banderas y una nota; el
texto que se publica lo compone la base con eso y no se puede escribir a mano, así que el texto y los
datos no tienen forma de contradecirse. «Obra de los setenta» pasa a ser una consulta de verdad, y lo
que alguien escribió a mano y no encaja en ningún formato se conserva íntegro: un matiz puesto a
conciencia vale más que una estructura adivinada. (ADR-004)

**Un fondo de pruebas para practicar sin ensuciar el catálogo**
Las fichas de ensayo van a un fondo aparte, con sus propios identificadores de prefijo TS-, de modo
que probar la aplicación no mete filas falsas entre las obras de Rotili y de Ruiz Campins.

### Correcciones

**El formulario de acceso quedaba tapado por el teclado**
Estaba centrado en la pantalla; anclado arriba, los campos siguen a la vista mientras se teclea.

---

## 26 de julio de 2026

### Interfaz

**Primera entrega: listado, captura rápida y ficha**
El listado ordena por la fecha de la obra y toda la tarjeta es pulsable, porque apuntar con el pulgar
a un código de doce caracteres no es razonable; una búsqueda sin resultados devuelve la misma página
con el mensaje que lo explica, nunca un listado vacío. La captura está pensada para rellenarse de
pie, con una mano y con la obra delante: teclado numérico en las medidas, las tres dimensiones en una
fila, y si el guardado falla el formulario no se vacía.

---

### Correcciones

**Subir una foto reventaba desde el móvil y funcionaba desde el ordenador**
La aplicación usaba una función del navegador que no existe cuando la página se abre sin cifrado, que
es como se abría en la red local para probar con el teléfono. Todas las pruebas anteriores iban por
otra dirección, que lo ocultaba por completo.

**Las fotos hechas antes de guardar se perdían al volver a la aplicación**
Se reprodujo el fallo y no era lo que parecía: la cámara acumulaba bien, pero la cola de fotos vivía
solo en memoria, y al abrir la cámara el sistema puede descartar la página por falta de memoria.
Ahora la cola se guarda en el dispositivo en cuanto cambia, porque el descarte no avisa.

**«No entra» dejó de ser el mismo mensaje para dos cosas distintas**
Un fallo de red y una contraseña equivocada daban el mismo aviso, y eso hizo indiagnosticable un
problema real durante un buen rato: la aplicación estaba llamando a una dirección que en el móvil no
existía. Ahora, cuando el servidor no responde, se dice a qué dirección se estaba llamando. El
mensaje de credenciales sigue siendo genérico a propósito: separar «no existe esa cuenta» de
«contraseña incorrecta» permitiría averiguar quién tiene acceso.

---

## Julio de 2026

### Interfaz

**Buscar y filtrar el listado desde la cabecera**
La caja de búsqueda vive en la cabecera fija y a su lado hay un único botón de embudo con el número
de criterios activos, que abre una sola hoja con todo: orden, fondo, tipo de obra, serie, ubicación y
estado. Fondo, tipo, serie y ubicación admiten varias marcas a la vez, las listas largas traen su
propio buscador —encuentra por letras salteadas y subraya las que ha casado—, la ubicación busca por
niveles, así que elegir «edificio a» alcanza todo lo que hay dentro, y «Sin serie» encabeza el filtro
de series, porque las obras que todavía no tienen serie son justo las que hace falta encontrar.

**El listado abre al instante, con sus miniaturas**
Cada obra se ve con la fotografía que la representa. El catálogo se guarda en el propio dispositivo,
así que filtrar, ordenar y buscar son inmediatos, al volver al listado se pinta sin esperar y las
miniaturas ya descargadas no se vuelven a pedir; la búsqueda tampoco distingue tildes. Lo guardado se
borra al cerrar sesión, porque el móvil puede ser compartido.

**Las fotografías de una ficha tienen su propia pantalla**
La ficha queda para leer: foto grande, tira de miniaturas con la etiqueta del tipo de toma —reverso,
detalle de firma— y descarga del máster de archivo, que también puede hacer un Lector, porque
enviarlo a una imprenta o a un comisario es exactamente su caso. Todo lo que cambia las fotos vive en
una pantalla aparte, a la que se llega desde el botón de la cabecera; la foto grande se pasa
deslizando y se abre a pantalla completa tocándola, y el botón «atrás» del móvil cierra el visor en
vez de salir de la ficha.

**Varias fotos por obra, y ninguna se pierde en el camino**
Se puede hacer foto con la cámara, elegir archivos del dispositivo o arrastrarlos desde el
escritorio, y el botón «+» reabre la última vía usada para no romper el ritmo mientras se fotografía.
Cada toma se prepara en el propio móvil en tres tamaños antes de subir y se suben una a una al
guardar; si alguna falla, la ficha no se pierde ni se duplica y el botón reintenta solo las que
faltan. Al añadir una foto se abre solo su panel, porque lo siguiente es siempre decir de qué es la
toma o enderezarla. Se pueden añadir y retirar fotos mucho después del alta, y elegir cuál representa
a la obra.

**Ficha imprimible en PDF, con fotografía y código QR**
Una hoja A5 con los datos de la obra, su serie, su fotografía y un QR que lleva a la ficha viva. Sin
fotografía, o si su descarga falla, la hoja sale igual con el aviso «Imagen no disponible», nunca con
un hueco.

**Los cambios de los demás aparecen sin recargar**
Lo que cambia una persona se ve en la pantalla de las otras: el listado, la ficha y la galería se
actualizan solos. Un formulario que se está rellenando no se refresca nunca — pisar un borrador a
medio teclear destruye trabajo.

**Tipo de obra y serie se eligen de una lista, no se teclean**
Los dos vienen de una lista compartida, con buscador que no distingue tildes y con la posibilidad de
añadir un valor nuevo desde el propio formulario. Es lo que evita que la misma serie acabe escrita de
dos maneras y deje de poder agruparse; la serie se fija además para todo un lote de captura, porque
un lote es normalmente una serie.

**La fecha de ejecución se compone con botones, sin abrir el teclado**
Los botones de año repiten al mantenerlos pulsados y aceleran a partir de segundo y medio, para
cruzar una década sin diecisiete toques. Tres interruptores cubren lo que la fecha necesita decir
—«Aproximada» para un año de alrededor, «Rango» para dos años y «Sin confirmar» para un año que es
una estimación—, y debajo se ve siempre cómo va a quedar escrita. Quien prefiera teclear puede: lo
escrito se interpreta, y lo que no encaja en ningún formato, como «finales de los setenta», se
conserva tal cual.

**Catalogar una estantería de una vez**
La captura trabaja por lotes: el fondo, el tipo de obra y la serie quedan fijos bajo candado, y la
fecha, la técnica y la ubicación se arrastran de una obra a la siguiente y se ajustan cuando cambian;
el título y las medidas no se heredan nunca, porque sería inventarse datos de una obra a partir de
otra. El lote sobrevive a que se bloquee la pantalla o entre una llamada, y en los campos de
ubicación escribir sugiere los sitios ya usados en el catálogo, encontrándolos por letras salteadas.

**Todo a un pulgar de distancia**
La acción principal de cada pantalla vive en la cabecera fija y «Guardar» en una barra fija abajo,
así que no hay que recorrer un formulario largo para llegar a ellos, y el aviso de resultado sale
junto al botón que se acaba de pulsar — incluido el «Guardada como AR-XXXX», que es lo que hay que
escribir en la etiqueta. Los formularios se parten en grupos con nombre que dicen en el borde qué se
vacía al guardar y qué se hereda, todo selector es una rejilla de botones del mismo tamaño y ninguno
baja de los 44 píxeles que necesita un dedo; y en el pie hay pestañas fijas de «Obras» y «Mi perfil»,
más «Añadir» para quien pueda catalogar.

**Entrar, recuperar la contraseña e instalar la aplicación**
Se instala en el móvil desde «Mi perfil», que además permite cambiar la contraseña y dice qué versión
está corriendo a cada lado. Si se olvida, llega un enlace por correo para ponerla de nuevo; cuando se
publica una versión nueva la aplicación se recarga sola; y cerrar sesión es un botón con confirmación
en dos toques, porque hacerlo por accidente cuesta volver a entrar desde un almacén con mala
cobertura.

### Diseño lógico de la aplicación y esquema de datos

**Qué fotografía representa a cada obra**
La regla vive en la base y no en la pantalla: la que se haya elegido a mano; si no hay ninguna
elegida, la general más reciente; y si tampoco hay generales, la más reciente de cualquier tipo,
porque la foto de un reverso es mejor referencia que un hueco. Está escrita en un solo sitio a
propósito, porque el catálogo impreso la va a necesitar y dos versiones de la misma regla acabarían
enseñando fotos distintas de la misma obra. Cuando la ha elegido la regla y no una persona, la ficha
lo dice y ofrece fijarla.

**Cada toma se guarda en tres tamaños**
Miniatura para los listados, copia de consulta para ver la obra en pantalla y máster de archivo, que
es el documento. Los tres salen de la misma toma y viven en la misma fila, para que una fotografía no
pueda perder su miniatura sin que nada avise. Las dos copias pequeñas se generan en el móvil antes de
subir, porque una foto de móvil son entre 4 y 12 MB y subirla tres veces desde un almacén con mala
cobertura no es viable; el máster va a un almacén de archivo aparte porque, a 2-8 MB por toma, el
espacio incluido en la plataforma se agotaba en las primeras semanas de trabajo de campo. (ADR-002)

**Cómo se numeran las obras**
El identificador lo asigna la base, con un cerrojo por fondo, y no una numeración automática. El
motivo es editorial: una numeración automática deja huecos cuando algo se deshace a medias, y un
salto sin explicar en un catálogo razonado es una pregunta que alguien hará dentro de veinte años.
(ADR-003)

**«Sin revisar» no es «no»**
Los campos de sí o no del inventario nacen en «Sin revisar» y no en «No»: hay que poder distinguir el
dato pendiente de investigar del investigado sin resultado y del dudoso. Es la misma idea que el
«[?]» de la fecha y que los corchetes de «[Sin título]», que son lo único que separa una obra sin
titular de una que el artista tituló literalmente «Sin título».

**Dónde vive la aplicación, y qué es público**
Es una web instalable en el móvil, sin servidor propio detrás, y no funciona sin conexión por
decisión explícita: un dato de catálogo antiguo mostrado como actual es peor que no mostrar nada.
Tiene dirección propia, `catalogo.ruizcampins.com`, y se cambió el alojamiento previsto al comprobar
que estaba bloqueado desde España. El código de la herramienta es público y libre; las obras del
catálogo no forman parte de esa licencia y siguen detrás de la contraseña. (ADR-001 y ADR-005)

**Cada regla del catálogo tiene un nombre, y un test que la cita**
Antes de escribir una línea de aplicación se redactaron dos documentos: uno que enumera qué tiene que
hacer el catalogador, con un identificador por cada requisito, y otro que dice qué prueba verifica
cada uno. Sirven para lo mismo: que un requisito sin comprobar se pueda detectar, en lugar de darse
por hecho.

### La base de datos del catálogo

**Reglas que la base impone y la pantalla no puede saltarse**
El identificador de catalogación y el fondo de una obra no se pueden cambiar una vez creada la ficha.
Los años de la fecha tienen que ser plausibles y el año final no puede ser anterior al inicial; el
título y la respuesta
sobre su autoría no pueden contradecirse; una serie solo se acepta si pertenece al fondo de la obra y
un tipo de obra solo si está en la lista. Una obra no puede tener dos fotografías principales a la
vez ni quedarse sin ninguna si el cambio se corta a medias, la marca de «fotografiada» se recalcula
sola al añadir o retirar fotos, y la fecha de última revisión con la obra delante solo se mueve
cuando cambia un dato de los que exigen tenerla delante.

**Nada se borra nunca de verdad**
No existe permiso de borrado para nadie, ni siquiera para el Superusuario: retirar una obra o una
fotografía es una baja lógica con la traza de quién y cuándo. El aviso de retirar una foto dice
explícitamente que el archivo se conserva, porque es cierto y porque cambia la decisión.

**El máster de archivo está a salvo por partida doble**
Los originales de las fotografías viven en un almacén aparte del que sirve la aplicación, con todas
las versiones conservadas, y las credenciales con las que la aplicación firma las subidas no tienen
capacidad de borrar: aunque se comprometieran enteras, con ellas no se puede destruir un máster. Para
una obra destruida o perdida, la fotografía es la única prueba que quedará de que existió.

**Tres roles, y el permiso lo comprueba la base**
Superusuario, Catalogador y Lector. Como no hay servidor propio, quien decide qué puede ver y tocar
cada uno es la base de datos, así que sus reglas se comprueban entrando de verdad con una cuenta de
cada rol y consultando el catálogo — no basta con comprobar que la regla está escrita. Esas pruebas
son la puerta de cada publicación: si una falla, no se publica; y dos de ellas están hechas para
romperse si alguien crea una tabla sin sus permisos, que es la forma de publicar datos sin querer en
este montaje.

---

### Correcciones

**Arreglos que no se ven desde la aplicación** · *julio y agosto*
Se han corregido además fallos del entorno de trabajo y del proceso de publicación: el entorno local
no concedía los permisos que hacen falta para subir una fotografía, una publicación fallaba y se
deshacía al intentar renombrar cosas que la plataforma no deja renombrar, y se han actualizado las
librerías que tenían avisos de seguridad abiertos.

---

---

## En marcha

**Los fondos, como lista y no como valores fijos**
Los tipos de obra, las series y las ubicaciones ya son listas que se pueden corregir y ampliar desde la
aplicación. Los dos fondos —Rotili y Ruiz Campins— siguen siendo valores fijos escritos en el programa,
porque de ellos depende el prefijo del código de catalogación que va pegado a cada obra. Convertirlos es
lo siguiente, y hay que hacerlo con cuidado por eso mismo.

**La papelera**
Nada se borra nunca de verdad, y eso ya está garantizado por la base: retirar una obra, una fotografía,
un lugar o una serie deja la fila con quién y cuándo. Lo que falta es la pantalla desde la que ver lo
retirado y restaurarlo.

**Las fichas de exposiciones, bibliografía, propietarios y documentación**
La mitad documental del catálogo razonado —el historial expositivo, las referencias bibliográficas, quién
tiene cada obra y el archivo digitalizado— todavía no existe. Es lo que queda más grande.

**Tres fotografías donde la sugerencia de recorte sigue callando**
De las cuarenta y cuatro, en tres reconoce mal por dónde va el borde: no por la inclinación, que ya está
resuelta, sino porque en esas fotos una costura interna del cuadro contrasta más que su propio marco.
Está identificado y medido; arreglarlo es afinar cómo se elige el borde, no una función nueva.
