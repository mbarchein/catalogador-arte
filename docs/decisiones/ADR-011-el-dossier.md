# ADR-011 · El dossier

**Fecha:** 11 de agosto de 2026
**Estado:** Aceptada
**Se apoya en:** las claves sustitutas de [ADR-007](ADR-007-claves-sustitutas-en-las-tablas-maestras.md)
y el orden manual todo-o-nada que ya tienen las fotografías de una obra
**No cruza:** el «sin backend que escribir ni servidor que administrar» de
[ADR-001](ADR-001-stack-y-despliegue.md), ni el acceso autenticado de RF-101
**Requisitos:** RF-1600. Afecta a RF-1000 (la ficha imprimible, que es de una obra y sigue siéndolo)
**Revisada:** el mismo 11 de agosto de 2026, tres veces: el tercer tipo de elemento —la biografía—, la
maqueta que se construye —una obra por página— y el cuarto tipo, la sección, con su índice y su
agrupación automática por serie

---

## Contexto

Mandar obras a una galería es un trabajo que ya se hace y que hoy no tiene sitio en la aplicación. Lo que
hay son tres cosas, y ninguna es esto:

- **El listado con filtros** (`listView.ts`), cuyo estado vive en la URL. Contesta «qué obras cumplen X»,
  no «estas doce, en este orden». No tiene nombre, no se guarda y su orden es el de un criterio, no el de
  una decisión.
- **El lote de captura** (`batch.ts`), que guarda en el propio dispositivo los campos que se repiten al
  dar de alta varias obras seguidas. Es un ayudante de teclado, no una selección: uno solo, sin nombre,
  sin orden y sin salir del móvil que lo creó.
- **La ficha imprimible** (`recordPdf.ts`), un A5 por obra con su QR, generado en el navegador con
  `pdf-lib`. Es la pieza, y falta el cuaderno.

La consecuencia práctica es que el dossier se arma fuera: se descargan fotos a una carpeta, se pegan en un
documento, se escriben las medidas a mano y se manda. Cuando la galería pide «lo mismo pero sin los dos
últimos y con precios», se rehace. Y el documento que se mandó en marzo no existe en ninguna parte: no se
sabe qué se enseñó, ni con qué precio, ni qué medidas tenía la ficha ese día.

### Lo que hacen otros dominios con el mismo problema

Merece la pena mirarlo porque el problema es viejo y las respuestas están muy repartidas:

- **La lista de comprobación de una exposición** (*checklist*, y el «paquete de objetos» de TMS en los
  museos): un conjunto **enumerado y ordenado** de obras con notas por línea, que se congela al mandarse.
  Es lo más cercano a esto.
- **Los conjuntos** de CollectiveAccess y de ArchivesSpace: una tabla puente con orden, más un tipo de
  conjunto para distinguir la lista de trabajo de la de difusión.
- **Las presentaciones o *private views*** de las plataformas de galería (Artlogic, Arternal): una
  selección con nombre que se manda a un cliente, con precio por selección y no por obra, porque el mismo
  cuadro se ofrece a distinto precio en distinto sitio.
- **El presupuesto y la factura** de cualquier sistema de facturación: el precio está en **la línea**, no
  en el producto, y el documento emitido se guarda con su número y no se reescribe nunca. Corregir emite
  otro.
- **La lista de reproducción** frente a la **lista inteligente**: la primera enumera y la segunda
  consulta. Las dos existen en todas partes porque no son la misma cosa, y confundirlas es el error
  clásico.

De esas cinco, las dos que deciden el modelo son la lista de comprobación —enumerada y ordenada, no una
búsqueda guardada— y la factura —el precio en la línea, y el documento emitido inmutable.

## Decisión

Un **dossier** es una ficha con nombre propio que enumera obras y textos en un orden elegido, y del que
se emiten PDF fechados. Tres tablas.

```
dossiers             El dossier: nombre, para qué es, a quién va, portada, qué bloques enseña
dossier_items        Lo que el dossier dice, en orden: obras, secciones, textos y la biografía
dossier_issues       Cada PDF emitido, con su versión. Solo se añade
```

**Una sola lista, y esta es la estructura.** La tabla de en medio no es «las obras del dossier»: es **el
contenido** del dossier, y una obra es una de las dos cosas que el contenido puede ser. La otra es un
texto libre —un párrafo de apertura, el rótulo que separa los óleos de la obra sobre papel, una nota
final sobre disponibilidad—. Dos tablas separadas, una de obras y otra de textos, cada una con su orden,
no pueden expresar «este párrafo va entre la cuarta obra y la quinta», que es exactamente para lo que se
escribe un párrafo en un dossier. Una lista con un `kind` sí, y el orden es uno.

El `kind` es un enumerado explícito y no se deduce de «no tiene obra, será un texto»: es la regla de
siempre de distinguir el dato de su ausencia, y es lo que permite un tercer tipo sin adivinar qué quería
decir una fila con todo a nulo. Cada tipo tiene su forma comprobada en el esquema: una obra no lleva
párrafo dentro y un texto no lleva precio ni obra, así que un elemento que el PDF no sabría dibujar no se
puede guardar.

**El tercer tipo llegó el mismo día: la biografía.** Un dossier que va a una galería empieza por quién es
el artista, y el currículum va detrás o al final. Es un elemento y no un interruptor del dossier, y ahí
está la ventaja de tener una sola lista: **la posición es la decisión**. La biografía va delante en un
dossier de galería y detrás en uno con forma de catálogo, y ninguna de las dos colocaciones necesita una
columna que lo diga.

Lo que el elemento guarda es **de qué fondo** es la biografía, y nada más: el texto vive en la ficha del
fondo (`artist_funds.biography` y `.cv`) y se lee al emitir. Se escribe una vez y corregir una fecha
corrige todos los dossieres que se emitan después. Copiar la prosa en cada dossier es como empiezan a
divergir dos versiones de una biografía, y la que sale es siempre la que nadie corrigió. Cuando una
galería concreta pide una versión más corta, la salida ya estaba puesta: se escribe como texto libre y no
se añade la biografía.

**Dos textos y no uno**, por el mismo motivo que las páginas y la nota de una cita bibliográfica son dos
columnas: la biografía es prosa y el currículum es una lista de líneas con un año delante, se maquetan
distinto y se usan por separado. Cada elemento dice si lleva el currículum detrás.

**El currículum no se deriva del catálogo**, y es una tentación que conviene dejar descartada por escrito.
El catálogo ya conoce exposiciones, pero solo las de las obras catalogadas —así que mientras se hace el
catálogo el currículum derivado tiene huecos, y uno con huecos es peor que uno escrito a mano porque
parece completo— y no registra si una muestra fue individual o colectiva, que es lo primero que se lee en
un currículum. Para lo que sí sirve el historial expositivo es para **sugerir líneas** mientras se
escribe, que es trabajo de una pantalla y no de una columna.

**Las secciones organizan el dossier, y su pertenencia es la posición.** «Óleos, 1962-1968» es una
sección; sus obras son las que vienen detrás hasta la sección siguiente. No hay ninguna columna que diga
«esta obra es de esta sección», y no por ahorrar: la alternativa mete un árbol dentro de una lista
ordenada, con dos órdenes que mantener coherentes y una función de reordenar todo-o-nada que se vuelve
mucho más difícil de creer. Un PDF es lineal, así que la posición ya lo dice todo — y mover un rótulo por
encima de una obra cambia de sección exactamente esa obra.

Es un **tipo de elemento propio** y no «un texto con rótulo», por dos motivos y cualquiera bastaba: un
párrafo con título no debe abrir un bloque sin que nadie lo haya decidido, y una sección lleva decisiones
propias —si se lleva una portadilla— que colgadas de un texto serían columnas sin significado en la
mayoría de sus filas.

Lo que gana el dossier con eso: la sección **se mueve entera** con sus obras dentro, se pliega, dice
cuántas obras lleva, y lo que queda antes de la primera se avisa como huérfano —sale en el PDF, pero sin
rótulo—. En el papel, su rótulo va al **pie de todas sus páginas**, que es lo que hace que una hoja
impresa y separada del resto siga significando algo, y el dossier puede llevar un **índice** detrás de la
portada. El índice cuenta su propia página al numerar: si no, todas sus referencias apuntarían una
página antes, que es la única forma de que un índice sea exactamente inútil.

**Y se pueden crear solas, agrupando por serie, una vez.** Un botón que crea los rótulos que falten,
coloca cada obra bajo el suyo y deja todo editable. **No es un criterio vivo**, y ésa es la misma
decisión que la de no ser una búsqueda guardada, un nivel más abajo: si la sección fuera «todas las obras
de la serie tal», dar de alta una obra la metería en un documento ya mandado y el orden dentro del bloque
no se podría elegir. Respeta lo que ya había —las secciones existentes se reutilizan, el orden dentro de
cada serie es el que tenía el dossier, los rótulos escritos a mano se conservan— y lo que no tiene serie
va a una sección nombrada y al final, en vez de quedarse huérfano al principio.

**Cinco sitios donde escribir, y cada uno es de alguien.** Es la distinción que hay que tener clara
antes de teclear:

| Dónde | Va al PDF | Para qué |
|---|---|---|
| `dossiers.cover_text` | Sí, en la portada | La presentación: dos líneas o media página |
| `dossier_items.heading` / `.body` (tipo texto) | Sí, donde esté en el orden | Rótulos de sección y párrafos entre obras |
| `artist_funds.biography` / `.cv` | Sí, donde esté su elemento | Quién es el artista. Se escribe una vez por fondo |
| `dossier_items.note` (línea de obra) | **No** | Recado del equipo: «la que pidieron ver de cerca» |
| `dossiers.note` | **No** | Recado sobre el dossier entero |

Que la nota del equipo no salga impresa es deliberado y es la mitad del valor de tener las dos: se puede
anotar lo que no se le dice a la galería.

**Las obras se enumeran, no se consultan.** El orden sigue el patrón que ya tienen las fotografías de una
obra: `sort_order` de 1 a n y una función `reorder_dossier_items` que recibe la lista entera y la
reescribe de un golpe, o no la escribe. Nada de arrastrar y guardar fila a fila: dos posiciones repetidas
son un dossier con dos elementos en el mismo sitio, y eso no se puede guardar. El punto de partida al
armarlo sí es el listado con filtros —se llega a las doce obras buscando—, pero lo que se guarda son las
doce, no la búsqueda.

**El precio es del dossier y es opcional.** Vive en la línea (`price`, `currency`), no en la obra, y cada
dossier decide si se enseña. Es la regla de la factura y la de las plataformas de galería, y aquí importa
más que en ninguna de las dos: **el catálogo no afirma ningún precio**. Un precio en la ficha de la obra
sería un dato del inventario, y no lo es —es una postura ante un interlocutor y una fecha—; puesto en la
línea, cada dossier dice lo que dijo y el catálogo se queda callado.

**Se guarda la referencia viva, y además el PDF emitido.** La línea de una obra apunta a `catalog_id`, así que
el dossier lee la ficha de hoy: corregir una medida en la obra corrige el dossier sin tocarlo, que es lo
que hace que valga la pena tenerlo dentro de la aplicación. Y cada emisión deja una fila en
`dossier_issues` con su `version` —1, 2, 3…—, su fecha, quién la emitió y el PDF en el almacén. Las dos
cosas juntas contestan las dos preguntas que se hacen de verdad: «mándalo otra vez con los datos al día»
y «qué es exactamente lo que le mandé en marzo».

**`dossier_issues` solo se añade**, como el registro de cambios: una versión emitida no se reescribe ni se
borra, porque el PDF ya está en el correo de otra persona. Corregir es emitir la siguiente.

**De momento, PDF y nada más.** Se genera en el navegador con `pdf-lib`, como la ficha imprimible, y se
guarda en el bucket privado que ya existe, bajo un prefijo propio. **No hay enlace público**: RF-101 dice
que ninguna vista es accesible sin sesión y esta decisión no lo toca. Lo que sale de la aplicación es un
fichero, y quien lo manda decide a quién.

**El dossier es del equipo.** Lee quien puede leer (`can_read()`) y escribe quien puede editar
(`can_edit()`), igual que el resto del catálogo. No hay dossieres privados por usuario: son dos personas
catalogando el mismo fondo, y un dossier que solo ve quien lo hizo se rehace cuando esa persona no está.

**Es una ficha, con papelera.** Retirar un dossier es baja lógica con su traza (RF-901, RF-902), y quitar
un elemento de un dossier también: la línea se desactiva y volver a añadir la misma obra **restaura** la
línea con su nota y su precio, en vez de crear una segunda. Es exactamente lo que ya hace citar una obra
en una publicación.

**El PDF lleva la derivada de consulta de 2000 px, no la copia corregida.** La derivada ya se genera
**con** las correcciones cocidas —giro, recorte, perspectiva y color—, así que es la imagen buena a un
tamaño que imprime bien en una página y que se puede mandar por correo. La copia corregida de
[ADR-010](ADR-010-copia-corregida-a-resolucion-completa.md) es para entregar un fichero a una imprenta,
que es otra cosa: un dossier de doce obras con doce másteres corregidos pesa cientos de megabytes y no
sale de ningún correo.

**Qué imagen de cada obra.** La línea tiene `image_id` nulable: nulo significa «la representativa de la
obra», que es lo que se quiere casi siempre y lo que sigue siendo verdad si mañana se cambia la fotografía
principal. Elegir una toma concreta —el detalle de la firma, el reverso— es fijarla.

**Qué bloques se enseñan** se decide por dossier con cuatro interruptores: procedencia, exposiciones,
bibliografía y precios. Una galería quiere el historial expositivo; un seguro, las medidas y el estado.

### Cómo se maqueta: una obra por página, y tres plantillas más

Todas caben en lo que `pdf-lib` ya hace en la ficha imprimible —rectángulos, una imagen y texto en dos
tipografías—, así que ninguna es una plataforma nueva. Van de la más generosa a la más seca, que es
también el orden de menos a más obras por página:

1. **Una obra por página** (A4 vertical). La fotografía ocupa más de media hoja y debajo van el código,
   el título, la fecha, la técnica, las medidas y el precio si el dossier lo enseña. **Es la que se
   construye**, y la razón es la que decide el propietario: una selección se quiere mirar obra a obra, y
   el coste —doce obras, doce páginas— es el que se acepta a cambio de que la fotografía se vea.
2. **Dos por página.** Cada obra en su mitad, fotografía a la izquierda y datos a la derecha. El punto
   medio para cuando la selección crece: quince obras en ocho páginas.
3. **Rejilla de seis** (dos columnas por tres filas). Fotografía pequeña con el pie debajo: código, título
   y fecha. Es la hoja de contactos, para «esto es lo que hay, dime qué te interesa».
4. **Lista sin fotografía.** Una línea por obra con código, título, fecha, técnica y medidas. Es lo que
   pide un seguro, un transportista o un depósito, donde la fotografía estorba y lo que importa es que
   quepa en una hoja.

Los textos se maquetan igual en las cuatro: la portada es la primera página con el título del dossier, la
fecha y su presentación; un **rótulo** abre sección —a ancho completo, y en la maqueta 1 puede empezar en
la propia página de la primera obra de la sección—; un **párrafo** ocupa el ancho de la caja y empuja lo
que viene detrás; y la **biografía** es un bloque de prosa con su rótulo, con el currículum en líneas
debajo si lo lleva. Esa es la ventaja práctica de que todo sea una lista: el generador recorre los
elementos en orden y decide por tipo, sin saber nada de secciones.

**Las cuatro son plantillas de la misma máquina**, porque lo que cambia entre ellas es cuántas cajas caben
en una página y qué campos entran en cada caja. La columna que dice qué plantilla usa cada dossier **nace
con el generador y no antes**: guardar hoy una elección que nadie sabe dibujar es exactamente el
interruptor que un día miente.

## Alternativas descartadas

**Una búsqueda guardada.** Es la lista inteligente, y el dossier es la otra: si el dossier fuera un
criterio, dar de alta una obra nueva la metería en un documento ya mandado, y el orden no se podría elegir
porque un criterio no tiene opinión sobre qué va primero. Guardar la búsqueda **también** es una función
distinta y puede que útil algún día; no es esta.

**Una columna en `artworks`** del tipo «está en el dossier», o un `dossier_sort_order`. Da exactamente un
dossier, sin nombre y sin poder tener dos a la vez, que es el caso normal en cuanto hay dos galerías. Y
mete en la ficha de la obra un dato que no es de la obra.

**Una columna JSON en `dossiers`** con la lista de identificadores. Se escribe en una tarde y se paga
después: sin clave ajena, un `catalog_id` que ya no existe se queda dentro; sin filas, no hay política RLS
por línea, ni traza de quién quitó una obra, ni nota por obra sin inventar un formato dentro del formato;
y reordenar es reescribir el documento entero, con la última escritura ganando en silencio.

**El precio en la ficha de la obra.** Es el error que este documento existe para no cometer. Un precio en
`artworks` es el catálogo afirmando cuánto vale la obra, con una sola cifra para todos los
interlocutores, y la primera vez que se ofrezca distinto a dos galerías habría que elegir cuál de las dos
miente. Además convierte el catálogo en un documento con valoraciones, con lo que eso implica para quien
lo consulte.

**Un enlace para que la galería lo vea en la web.** Es un acceso anónimo a fichas del catálogo, y RF-101
no lo permite. Tiene además el problema de todo enlace que se manda: cambiar el dossier cambia lo que ve
quien ya lo recibió, y ya no hay forma de saber qué vio. El PDF fechado no tiene ese problema.

**Generar solo el PDF, sin guardar la selección.** Es lo que se hace hoy con una carpeta y un procesador
de textos. Rehacer el dossier de marzo quitando dos obras vuelve a ser rehacerlo desde cero.

**Guardar en la emisión una copia de los datos de cada obra** (medidas, título, técnica) para poder
reconstruir el documento de marzo sin el PDF. Es duplicar el catálogo dentro del dossier, con lo que eso
supone en cuanto los dos no coinciden, y para eso está el PDF: el documento emitido **es** la copia
congelada, y es la que se mandó.

**Reutilizar el lote de captura.** Vive en el navegador, es uno solo, no tiene nombre ni orden y se pierde
al cambiar de dispositivo. Es un ayudante de teclado y sigue siéndolo.

**Dos tablas, una de obras y otra de textos.** Cada una con su orden, y entonces «este párrafo va entre la
cuarta obra y la quinta» no se puede decir: harían falta dos números por elemento y una regla para
mezclarlos, que es un orden hecho a mano con más piezas y peor. La lista única con un tipo es más pequeña y
contesta la pregunta.

**Los textos como columnas del dossier**: una presentación, una nota final y nada más. Es lo que se
escribe primero y lo que se queda corto en el segundo dossier, en cuanto hay dos bloques de obra que hay
que separar con un rótulo. La portada sí es una columna, porque una portada es una página y no algo que
fluya entre dos obras.

**La biografía como columna del dossier, o como un interruptor.** Es lo mismo que descartar los textos
como columnas y por el mismo motivo, más uno propio: una biografía guardada en el dossier es una copia de
la del fondo, y la copia envejece. Como interruptor —«este dossier lleva biografía»— habría además que
decidir por código dónde se imprime, y la respuesta cambia con el uso.

**Derivar el currículum de las exposiciones del catálogo.** Razonado arriba: incompleto mientras se
cataloga y sin distinguir individual de colectiva. Vuelve el día que el historial expositivo esté cerrado,
y entonces como sugerencia al escribir, nunca como el texto impreso.

**Texto con formato: Markdown, negritas, un editor rico.** Sería un lenguaje de marcado dentro de un campo
del catálogo, con su renderizador, su saneado y sus casos raros de por vida, y un dossier no lo necesita:
lo que hace legible una página es la maqueta —rótulo, párrafo, caja de obra—, no las negritas dentro del
párrafo. Un rótulo y un cuerpo, cada uno con su tipografía puesta por la plantilla, dan el resultado sin
abrir esa puerta.

## Consecuencias

- **Con precios y del equipo, quien consulta ve lo que se pide por una obra.** El Lector es una cuenta de
  consulta, y con estas dos decisiones juntas puede abrir un dossier y leer el precio que se le pidió a
  una galería. Se acepta a sabiendas —son dos personas y el fondo es suyo—, pero queda escrito aquí: el
  día que haya una cuenta de consulta para alguien de fuera, esto se revisa antes de darla de alta.
- **Un dossier puede contener una obra retirada.** El dossier no la resucita: la pantalla la enseña dicha
  como retirada a quien edita, no aparece para el Lector (RF-609) y no sale en el PDF. Lo que no se hace
  es quitarla en silencio de la lista, porque estuvo en el documento que se mandó y esa es la verdad.
- **El PDF pesa lo que pesan sus imágenes.** Doce derivadas de 2000 px son del orden de tres o cuatro
  megabytes, que es lo que se puede mandar por correo. Un dossier de cien obras no lo es, y el número de
  obras es lo primero que hay que mirar si algún día un PDF no se puede mandar.
- **Se genera en el navegador, y un móvil con cien obras puede no poder.** Es el mismo techo de ADR-010 y
  la misma disciplina: si no cabe, se dice, y no se emite un PDF a medias.
- **Las emisiones ocupan almacén y no se borran.** Son PDF de pocos megabytes en el bucket privado, y
  crecen con cada emisión. A este ritmo no es una cifra que preocupe; queda dicho para que dentro de un
  año se sepa de dónde sale.
- **El orden es una decisión y se puede perder.** `reorder_dossier_items` reescribe la lista entera, así
  que dos personas reordenando el mismo dossier a la vez hacen que gane la última. Es el comportamiento
  que ya tienen las fotografías de una obra y con dos personas no ha dolido.
- **Queda abierto todo lo que no es PDF**: mandar el dossier desde la aplicación, una portada con textos
  largos, y plantillas distintas por uso (galería, seguro, préstamo). Lo primero que probablemente se pida
  es la portada.
