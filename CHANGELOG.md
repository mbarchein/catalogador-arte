## 11 de agosto de 2026

### Interfaz

**Cada fotografía dice cuánto mide, y cada descarga también**

- El tamaño en píxeles aparece ahora en tres sitios: junto al contador de la ficha («2 de 4
  fotografías · General · 4032×3024 px»), en el pie de la vista a pantalla completa, y **dentro de
  los dos botones de descargar**, delante del peso: «Descargar el original (4032×3024 px · 1,5 MB)».
- El botón de la copia corregida dice **el tamaño de la copia**, que no es el del original: si la
  obra se recortó o se giró, la copia es más pequeña. Es el número que pide una imprenta, y el que
  decide si una reproducción puede ir a página completa — algo que «1,5 MB» no contesta.
- **En las fotografías que ya están en el catálogo nadie había medido nada**, y no se inventa. A
  partir de ahora se anota solo: cuando se aplica una corrección sobre la fotografía original, y en
  cada copia pendiente que se genera desde un ordenador. Para no esperar a que le toque a cada una,
  hay una herramienta que las mide todas de una pasada — lee solo la cabecera de cada fichero, no la
  fotografía entera, así que tarda un momento y no se trae los gigas del archivo:
  `python3 scripts/copias-corregidas/measure_originals.py --dry-run` para ver qué mediría, y sin
  `--dry-run` para guardarlo. No toca ni un píxel de ningún original.

### La base de datos del catálogo

**Cada copia corregida guarda cuánto mide**

- Se anota al escribir el fichero, no se calcula después: así el botón promete el tamaño que el
  fichero **tiene**, y no el que debería tener. Los dos solo se diferencian cuando algo ha salido
  mal, que es justo cuando un rótulo no debe ser tranquilizador.

## 9 de agosto de 2026

### Interfaz

**Abrir una ficha pregunta una vez, no dos**

- Al abrir una ficha se necesitan dos datos que no dependen uno del otro: **qué fotografías tiene** y
  **cuál es la portada**. Se pedían en fila, uno después del otro, así que la espera era la suma de
  los dos: con datos móviles, entre medio segundo y tres segundos con el texto de la obra ya puesto
  —ese sale al instante— y los huecos de las fotos vacíos. Ahora se piden **a la vez**, y la espera
  es la del más lento.
- No arregla la primera visita a una ficha nunca abierta: ahí sigue habiendo que preguntar. Lo que
  cambia es que se pregunta una vez y no dos.

**Las fotografías de una ficha ya vista no se vuelven a pedir**

- Los ficheros de imagen ya se guardaban en el teléfono. Lo que seguía viajando era **el permiso
  para verlos**: el almacén es privado, cada imagen se pinta con una dirección firmada, y la ficha
  firmaba cada fotografía por separado, con una hora de validez y sin guardarla. Abrir una ficha de
  cuatro fotos eran siete idas y venidas, cada vez.
- Lo que se notaba no era el tráfico: **sin cobertura, una ficha ya vista no enseñaba sus fotos**
  aunque estuvieran en el teléfono, porque sin el permiso no hay nada que buscar. Se quedaba en
  «Cargando…».
- Ahora se piden **todas de una vez**, valen **una semana** y se guardan. Volver a una ficha visitada
  esta semana no pide nada: las fotos salen puestas, también sin cobertura. Es lo que el listado de
  obras ya hacía con sus miniaturas.
- Se renuevan seis horas antes de caducar, para que a nadie se le queden las fotos a medias con la
  aplicación abierta toda la mañana. Y **se borran al cerrar sesión**, como el resto del catálogo
  guardado: en un móvil compartido, quien entre después no se encuentra las obras.

**El código QR de la ficha impresa: con su pie, y pulsable**

- La frase que explicaba el código estaba **al pie de la hoja**, con la fecha de generación, y por
  eso empezaba diciendo dónde estaba: «El código QR de la cabecera abre…». Ahora va **debajo del
  propio código**, más pequeña y con su aire, y dice lo que hace sin nombrar dónde está: «Abre esta
  ficha en la aplicación, al día».
- Y **el código es además un enlace**: en la pantalla de un ordenador no hay cámara con la que
  apuntarle, así que el mismo cuadrado que en el almacén se escanea con el móvil aquí se pulsa. Sin
  recuadro azul alrededor: lo que se imprime se imprime para siempre.

**El porcentaje, pegado al número**

- «115 %» pasa a **«115%»**, sin espacio, en todas partes: el tamaño de letra, el progreso de una
  subida, el espacio ocupado, el parecido de un testigo de gris y la hoja imprimible.

**Tercera pasada de recorte: los párrafos**

- Las dos primeras midieron frases; esta mide **párrafos**, que es donde se había escondido lo que
  quedaba: cuatro frases cortas seguidas pasan cualquier medida de frase y siguen siendo un ladrillo.
  **Ya no hay ningún texto de más de 170 caracteres**, y los de más de 130 han bajado de 98 a 72.
- Fuera, sobre todo, las explicaciones del mecanismo. Un ejemplo de los treinta y dos: la clasificación
  del archivo vacía dedicaba 379 caracteres a contar qué es un fondo y qué una subserie; ahora dice
  «Todavía no hay ninguna serie: fondos, series y subseries, unos dentro de otros. El primero se crea
  aquí arriba».
- Lo que **no** se ha ido: lo que hay que hacer. Ocho recortes se rehicieron porque se habían llevado
  por delante un «vuelve a entrar», un «cámbiala por una barra normal» o el aviso de que la tinta de
  una impresora no es neutra.

**«Guardar» siempre a mano, y los avisos que se van solos**

- Los botones de guardar y cancelar que estaban **al final de un formulario largo** se quedaban
  fuera de la pantalla: se rellenaba todo, se buscaba el botón y no estaba. Ahora van **pegados al
  borde de abajo**, como ya hacían la ficha de una obra y la de una exposición. Cambia en los datos
  de una fotografía y en siete hojas: un eslabón de procedencia, una cita, una referencia, corregir
  un documento, subirlo, añadirle el escaneo y dar de alta una exposición desde una obra.
- La franja llega **hasta el borde de la hoja**. Antes de eso quedaba un dedo de hueco por el que se
  veía asomar el campo siguiente, que hace pensar que el formulario continúa por debajo del botón.
- **Las confirmaciones flotan arriba y se van solas a los cuatro segundos**: «Imagen principal
  actualizada», «Fotografía retirada»… Estaban al final de la tarjeta, y con la vista puesta en la
  fotografía —que es donde están los mandos que las producen— aparecían fuera de la pantalla, así
  que la confirmación no confirmaba nada. Y ya no empujan la ficha al aparecer.
- **Los errores no se van solos** y siguen donde estaban: piden hacer algo, y uno que desaparece
  antes de decidir qué obliga a repetir la acción para volver a leer por qué falló.

**Los mandos de una fotografía, sobre la propia fotografía**

- Poner la portada, cambiar el orden y quitar una toma estaban en el panel de abajo, con botones que
  decían «esta» sin que se viera cuál era «esta». Ahora son **iconos en las esquinas de la imagen**,
  como el de girar y recortar: la estrella arriba a la derecha, la papelera abajo a la izquierda —lo
  más lejos posible del recortar, que es el de todos los días—, y el orden en los bordes laterales.
- El orden **no son flechas ‹ ›**: sobre una fotografía que se pasa deslizando, eso se lee como «foto
  siguiente». Son flechas con tope, las de ir al principio y al final.
- En la primera y en la última, el mando que no lleva a ninguna parte **se ve apagado en vez de
  desaparecer**: un icono que va y viene mueve a los demás de sitio, y entonces ya no se puede ir a
  por uno sin mirar.
- Bajo la imagen se lee lo que los dibujos no pueden decir: **«Principal · 2 de 4»**. Y cuando la
  portada la puso la regla y no una persona, dice **«Principal, sin fijar»** con un icono ⓘ que
  explica lo único que tiene consecuencia: que subir otra general la cambia sola.
- **Quitar pregunta en una hoja**, con lo que pasa y lo que no —el fichero se conserva—. Es el mismo
  gesto que retirar un eslabón o una cita, y el «atrás» del móvil la cierra sin hacer nada.
- El panel de abajo se queda con **una sola sección**: «Qué es esta toma», que es lo único que se
  escribe y por eso lo único con «Guardar».

**El panel de una fotografía, ordenado y con «Guardar»**

- Tenía nueve cosas apiladas en una sola caja gris sin un solo título. Ahora está partido en tres
  bloques con encabezado: **«Qué es esta toma»** (tipo, procedencia, autoría), **«Orden y
  portada»** y **«Retirar»**.
- **Mientras descarga o sube, el icono se convierte en un anillo que se llena**, y sobre la imagen
  aparece un rótulo corto con lo que está pasando y el porcentaje: «Subiendo copias · 43 %». El
  rótulo cede sitio si no cabe; **el número nunca**, que es lo único que se mira ahí. Antes no se enteraba
  nadie — el original son de 2 a 8 MB y la copia corregida hasta 19, y quien pulsa se queda mirando
  la fotografía sin saber si pasa algo.
- Cuando el servidor no dice cuánto pesa el fichero, el anillo **gira** en lugar de inventarse un
  porcentaje. Un progreso que miente es peor que no tener ninguno: por él se decide si esperar.
- Al llegar al 100 % el rótulo pasa a **«Terminando»** y el anillo vuelve a girar. El porcentaje
  cuenta lo que ha salido, y salir no es haber llegado: después queda el almacén guardándolo y
  contestando, que con una copia de 19 MB es un rato. Antes se quedaba en «100 %» con el anillo
  entero y quieto, que es exactamente el aspecto de una pantalla colgada.
- **Girar, recortar y color** sale del panel y pasa a ser un icono **sobre la propia fotografía**,
  en una esquina: actúa sobre la que se está mirando, no sobre «la seleccionada». Debajo de la
  imagen se lee qué edición tiene y cómo está la copia a resolución completa, que es donde se ve
  lo que describen.
- El tipo de toma, la procedencia y la autoría son ahora un formulario con **«Guardar»** y
  **«Deshacer»**: nada se escribe hasta pulsar, y si queda algo pendiente lo dice. Antes cada
  control guardaba por su cuenta —los botones al tocarlos y el texto al salir del campo—, y ese
  último era medio invisible en un móvil: se tocaba fuera y no se sabía si había entrado.
- Cambiar la procedencia sin guardar ya no pierde lo escrito: si se anotó la autoría y se pasa a
  «tomada de otro catálogo», el campo sale vacío, y al volver a «propia» el nombre sigue ahí.

**De quién es cada fotografía, y de dónde salió si no es propia**

- Ya se decía si una fotografía es propia, tomada de otro catálogo o recibida de un tercero. Ahora,
  además, se puede apuntar lo que hace útil esa respuesta — y no es el mismo dato en los dos casos:
  - en una **propia**, quién la hizo;
  - en una que **viene de fuera**, de dónde salió: el catálogo, la dirección de la página, o quién
    la envió y cuándo.
- Los dos son opcionales, y el campo cambia solo al cambiar la procedencia: no hay que elegir cuál
  rellenar.
- Admite cualquier texto, no solo una dirección: «me la pasó la familia en 2019» también es una
  procedencia.
- Cambiar la procedencia **no borra lo que ya estaba escrito**: si una fotografía tenía autoría y se
  marca como tomada de otro catálogo, el nombre se guarda y vuelve a aparecer si se marca otra vez
  como propia. Lo que no se hace nunca es enseñar la autoría junto a una fotografía ajena.

**Los textos, más cortos en toda la aplicación**

- Se ha barrido la sobreexplicación: **82 frases recortadas**. La más larga pasaba de 350 caracteres
  y ahora ninguna llega a 120; las que pasaban de 200 eran veintiséis y ya no queda ninguna.
- No se ha quitado nada que haga falta: lo que desaparece son las justificaciones y los ejemplos de
  más. Donde el texto avisaba de algo con consecuencias —que la aplicación no llama al sitio que
  enlazas, o que el gris de una impresora no sirve de referencia— el aviso se queda, más corto.
- Segunda pasada, sobre las frases medianas: **otras 130 recortadas**. Los índices de Tablas eran
  los peores —cada lista repetía «Crear, renombrar y retirar», que es lo que se ve al entrar—, y
  las ayudas de campo pasan a una línea.

**Un icono ⓘ donde la explicación larga sí hacía falta**

- Recortar deja algunas explicaciones a medias, y hay tres que se necesitan enteras la primera vez.
  Ahora están detrás de un icono de información, que abre una hoja con el texto completo:
  - **«Aproximada» y «Sin confirmar»** de la fecha, en la ficha y en la captura: son dos casillas
    parecidas que imprimen cosas distintas —«c. 1978» y «1978 [?]»—, y elegir la que no es cambia
    lo que sale en el catálogo.
  - **El contacto** de una persona o institución: fuera queda que se pide ficha a ficha; dentro,
    que quien consulta el catálogo también lo ve, que es lo que decide qué se escribe ahí.
  - **De dónde salen los documentos y las referencias**, en el archivo y en la bibliografía. Eso
    solo lo decía el mensaje de lista vacía, y con el archivo lleno ese mensaje ya no se lee nunca.
- El icono no se pone donde el texto de al lado ya basta: no es un sitio donde dejar lo que sobra.

**El fondo apartado se señala en el filtro, no encima del listado**

- El aviso «no se muestran las obras de Pruebas» estaba encima de la lista de obras, y ahí no se
  podía hacer nada con él. Ahora la fila de ese fondo lleva un distintivo —«Apartado»— dentro del
  panel de filtros, con una línea diciendo que sus obras no salen si no se marca.
- Es el sitio donde se actúa: marcar ese fondo es exactamente lo que hace aparecer sus obras.

**Las notas ya no se salen de la pantalla, y sus direcciones se pueden abrir**

- Una dirección web no tiene espacios: es una sola palabra larguísima, y en la columna estrecha de
  la lista de campos se salía por el lado derecho. Pasaba en las notas de un documento del archivo
  y en las del estado de una obra, que son justo donde se pegan direcciones.
- La nota sigue **con los demás campos**, que es donde toca; lo que cambia es que su contenido
  ocupa el ancho entero de la ficha, y respeta los saltos de línea con que se escribió.
- **Las direcciones se enseñan cortas** —sin el «https://» ni el «www», y con puntos suspensivos
  cuando no caben— y se pueden pulsar para abrirlas enteras. El nombre del sitio nunca se recorta:
  es la parte que dice de quién es el enlace.
- Arreglado además el motivo de fondo, que afectaba a cualquier campo con una palabra muy larga,
  aquí y en la ficha de una referencia.

**La ficha de un documento dice con qué obra está enlazado, y lleva a ella**

- Antes decía «Enlazado con una obra» y había que bajar hasta el final para saber cuál. Ahora la
  nombra —«Enlazado con la obra RC-0005»— y ese identificador se pulsa para ir a su ficha. Lo mismo
  con las exposiciones, por su título.
- Una ficha que no se puede abrir desde ahí se nombra igual, pero sin enlace: prometer un destino
  que no lleva a ninguna parte es peor que decirlo.

**Recuperar la contraseña olvidada**

- Desde la pantalla de entrada, «¿Has olvidado la contraseña?»: se escribe el correo y llega un
  enlace para elegir una nueva.
- **La respuesta es siempre la misma**, exista la cuenta o no: «si esa dirección tiene cuenta,
  llegará un correo». Decir «esa dirección no existe» sería contarle a cualquiera quién tiene
  acceso al catálogo, y con tres cuentas de correo adivinables eso es media entrada.
- Va en condicional y no afirmando el envío, porque quien teclee mal su propia dirección se quedaría
  esperando un correo que nadie mandó.
- Lo único que se cuenta aparte es que el servidor no conteste, que no dice nada de ninguna cuenta.
  Sin esa distinción, quedarse sin cobertura en un almacén se leería como «ya está enviado».
- Entre un envío y el siguiente hay que esperar un minuto, y el botón dice cuánto falta en lugar de
  quedarse apagado sin explicación.
- **El enlace del correo ya no sirve para entrar.** Antes abría una sesión normal, así que quien lo
  pulsara y se arrepintiera se quedaba dentro del catálogo sin haber elegido contraseña — y ese
  enlace vive para siempre en una bandeja de entrada. Ahora no deja salir de «Nueva contraseña»
  hasta que se elige una.
- La pantalla de elegir contraseña **ya no enseña el menú de abajo**. Llegando desde el correo esas
  cinco pestañas rebotaban a esta misma pantalla —la aplicación no deja salir hasta elegir una—, y
  llegando desde el perfil invitaban a irse a media tarea.
- Al cambiarla se cierran las demás sesiones abiertas. Quien la cambia porque teme que alguien la
  sepa necesita echar a ese alguien, no solo dejarle la contraseña vieja.

**El nombre con el que apareces se corrige desde «Mi perfil»**

- Hasta ahora el nombre venía dado y no había forma de tocarlo desde la aplicación. Ahora se cambia
  ahí mismo, en «Cuenta», junto a la contraseña.
- No es un dato del perfil y ya está: es el nombre que se lee en **«actualizado por» de cada obra**
  y en la traza de lo retirado. Se dice al lado del campo, para que se sepa qué se está cambiando.
- No se puede dejar en blanco, y se explica por qué: vaciarlo dejaría sin nombre esa traza en fichas
  que ya están escritas.
- El nombre nuevo se ve en el momento, sin recargar.

**«Tablas» ya no dice que los fondos se mantengan en otro sitio**

- Quedaba una nota diciendo que los fondos no se mantenían desde ahí. Desde que existe la pantalla
  «Fondos» eso ya no es cierto, así que se ha quitado.

**«Mi perfil» dice cuánto espacio queda**

- Un bloque nuevo, «Espacio ocupado», debajo de «Sobre la aplicación», con un botón «Actualizar»
  que vuelve a medirlo.
- **Son tres cifras y no una**, porque el catálogo vive repartido y cada trozo se llena a su ritmo:
  las fichas, las fotografías de trabajo y el archivo de originales, que es lo que de verdad pesa.
  Una sola cifra escondería lo único que hace falta ver, que es **cuál** se está llenando.
- Cada uno dice **cuánto queda libre** —que es lo que se pregunta— y, detrás, cuánto ocupa y de
  cuánto. Con una barra para verlo de un vistazo.
- Cuando uno pasa del 80 % lo avisa, y al llegar al límite dice qué va a pasar: lo siguiente que se
  guarde puede fallar. La salida no es borrar, que aquí nada se borra: es subir de plan.
- El archivo de originales cuenta **también las versiones anteriores** de cada fichero, porque es lo
  que ocupa de verdad y es por lo que se paga. Si tuviera tantos ficheros que no se pudieran contar
  de una vez, lo dice en lugar de dar la cuenta a medias por buena.
- Las dos medidas se piden por separado, así que si un servicio no contesta se sigue viendo la otra
  en vez de perder las dos.
- Debajo queda dicho a qué hora se midió y que los límites son los del plan gratuito de cada
  servicio, para que se sepa de dónde sale la cifra.
- Solo lo ve quien cataloga. Una cuenta de solo consulta no administra la capacidad de nada, y la
  base tampoco le contesta.

## 8 de agosto de 2026

### Interfaz

**Los fondos se mantienen desde «Tablas», como las demás listas**

- Una pantalla nueva, «Fondos», la primera de «La ficha de la obra». Hasta ahora los tres conjuntos
  de obra estaban escritos por dentro y no se podía tocar ni su nombre.
- **El nombre se corrige aquí y lo ven todas sus obras**, igual que con los tipos de obra o las
  series: se escribe una vez y el catálogo entero queda dicho de la misma manera.
- **El prefijo de los identificadores no se toca.** Es lo que está impreso en la etiqueta pegada a
  cada obra, y cada fila lo enseña como se lee ahí: «Obras AR-0001, AR-0002…».
- **Dos interruptores, y hacen cosas distintas a propósito:**
  - «Se ofrece al dar de alta» quita el fondo de la lista de una ficha nueva y **no toca nada de lo
    ya catalogado**: sus obras siguen en el listado, se abren y se corrigen como siempre.
  - «Sus obras salen en el listado» las aparta y **no retira el fondo**, que se sigue ofreciendo.
    No se borra ni se esconde nada: se siguen abriendo por su enlace y por su QR, y filtrando por
    ese fondo vuelven a salir.
- Los dos se leen igual: **encendido es que está como debe**, y lo que aparece apagado es lo que se
  ha cambiado. Debajo de cada uno se lee **qué pasa ahora**, no las dos posibilidades a la vez, así
  que no hay que mirar el control para saber cuál de las dos frases es la que aplica. Apagado añade
  además lo que **no** se ha hecho, que es cuando hace falta saberlo.
- Cuando un fondo está apartado, **su fila lleva un distintivo en el panel de filtros**, que es
  justo donde marcarlo hace aparecer sus obras.
- El último fondo activo no se puede retirar, y se explica en la propia fila antes de intentarlo, no
  después de pulsar.
- **No se dan de alta fondos desde aquí, y la pantalla dice por qué** en lugar de dejar buscar el
  botón que falta: uno nuevo trae su propio prefijo, y ese prefijo entra en la numeración de las
  obras y en cómo se guardan sus ficheros de archivo.
- **Ninguno se puede borrar.** Un fondo es el eje de los identificadores de sus obras; retirarlo o
  apartarlo se deshace, borrarlo dejaría sin nombre a todo lo que cuelga de él.

## 7 de agosto de 2026

### Interfaz

**Al subir una fotografía se ve cuánto lleva y cuánto queda**

- Antes decía «Subiendo 1 de 1…» y nada más, durante todo lo que tardara. Ahora dice de qué fichero
  se trata, cuántos megas van de cuántos y el porcentaje.
- Son dos ficheros seguidos cuando la fotografía lleva una transformación: el original, que se guarda
  intacto, y la copia a tamaño completo con la corrección aplicada. Cada uno cuenta lo suyo y la línea
  dice por cuál va, de modo que un envío que se atasca se puede señalar.
- Entre 2 y 19 MB por fichero desde un almacén con mala cobertura: la diferencia entre una subida
  lenta y una parada no se podía ver, y esperar o desistir era una decisión a ciegas.
- Antes de eso, preparar la copia a tamaño completo son unos segundos sin nada en la red. También se
  dice, en lugar de dar a entender que ya se está subiendo.
- Si el envío se corta, ahora lo dice con esas palabras. Antes aparecía «Failed to fetch».
- El fichero original se llama «el original» en toda la pantalla. En el aviso de fallo se llamaba «el
  máster», que es una palabra de dentro y no dice nada.

**La ficha de una exposición enseña los documentos del archivo que hablan de ella**

- Un bloque nuevo, «Otros documentos relacionados»: las notas de prensa, los carteles, los dípticos
  y las cartas enlazadas con esa muestra, con su signatura, su tipo, su fecha y su fichero.
- El vínculo ya se podía crear, pero solo desde la ficha del documento, y la exposición no lo
  enseñaba: una nota de prensa enlazada con una muestra no aparecía en ninguna parte de esa muestra.
- Desde aquí se enlaza un documento que ya está en el archivo, y se quita. Subir uno nuevo, corregir
  sus datos o añadirle el escaneo se siguen haciendo desde la documentación de una obra, y la
  pantalla lo dice en lugar de dejar buscar el botón que no está.
- Quitar pregunta antes, y dice qué NO se lleva: el documento sigue en el archivo y lo que diga de
  otras obras o de otras exposiciones no se toca. El vínculo va a la papelera y se puede devolver.
- Lo que el documento dice **de esta exposición** se escribe al enlazarlo y se lee en su fila, aparte
  de la nota del propio documento.
- El título de cada documento lleva a su ficha del archivo, que es donde se corrige y se digitaliza.
- Si no hay ninguno lo dice, sin presentarlo como un fallo: una exposición sin documentos de archivo
  es lo normal.

**El bloque del catálogo de una exposición ya no ofrece lo que no se puede hacer**

- Cuando consta que la exposición no publicó catálogo, desaparece el enlace «Decir cuál es su
  catálogo». Ofrecerlo contradecía la línea de encima y llevaba a un panel que solo servía para
  decir que no se podía.
- Si sí lo hubo, se corrige respondiendo «¿Se publicó catálogo?» en los datos de la exposición.
- Mientras nadie lo haya mirado, el enlace sigue estando: ahí la respuesta puede acabar siendo que
  sí, y el panel explica qué hay que responder antes.
- El bloque se titula «Catálogo de la exposición», igual en la ficha y en el formulario.

**Recargar la pantalla con trabajo a medias pregunta antes**

- Con una subida en marcha, o con fotografías preparadas y sin subir, el navegador pregunta antes
  de recargar o de cerrar. Un gesto de más ya no se lleva por delante lo que estaba pasando.
- El aviso es el del navegador y lo escribe él: no se puede cambiar ese texto ni decir ahí qué hay
  en juego. Tampoco se puede impedir una recarga, solo hacer que se detenga y pregunte.
- Solo sale cuando hay algo que perder, y desaparece en cuanto está a salvo. Un aviso que saliera
  siempre se acabaría descartando sin leer, y entonces no serviría el día que importa.
- También en el formulario de una obra y en el de una exposición cuando hay correcciones sin
  guardar. Un espacio de más no cuenta como corrección.
- En la pantalla de captura pregunta por la subida, no por las fotografías preparadas: esas se
  apuntan en el teléfono y una recarga las devuelve enteras.

**La pantalla dice qué fichero está subiendo, que son cuatro por fotografía**

- Cada fotografía sube cuatro cosas: la miniatura, la copia que se ve en la ficha, el original
  intacto y la copia a tamaño completo con la corrección. Antes solo se nombraban dos.
- Decía «Subiendo 1 de 1» contando fotografías, y se leía como si fuera un solo fichero. Ahora solo
  aparece la cuenta cuando hay más de una, y dice «Foto 2 de 3».
- Si algo falla, el aviso dice **dónde se quedó y cuánto tardó**: «Se quedó en el original, 2 MB de
  3,6 MB, en el intento 3. Tardó 47 s en fallar». Sin eso, un enlace que muere en el primer
  kilobyte y otro que muere siempre en el mismo punto se cuentan con la misma frase, y son
  problemas distintos.

**Un envío cortado se reintenta solo**

- Hasta tres intentos por fichero, esperando 2 y 6 segundos. Un corte de cobertura a mitad de una
  subida es lo normal en un almacén, y antes tiraba la fotografía entera.
- La pantalla dice que va por el reintento, porque el contador vuelve a empezar de cero: un envío
  interrumpido no continúa por donde iba, se manda otra vez.
- Si los tres fallan, las fotografías se quedan preparadas con su tipo de toma elegido y el botón pasa
  a decir «Volver a intentarlo».

**Un fichero grande se sube por trozos, y lo que ya subió no se vuelve a mandar**

- Los ficheros de más de 5 MB se parten y se envían por partes. Lo que el almacén ya ha
  aceptado se queda aceptado: un corte cuesta el trozo que iba en ese momento y nada más.
- Antes, un enlace que se cae cada pocos megas no terminaba nunca una copia de 19 MB por muchas
  veces que se reintentara, porque cada intento empezaba desde el principio.
- Los trozos son de 5 MB porque es lo mínimo que admite el almacén. Un original de 12 MB son tres
  trozos, y uno de 8 MB son dos: la granularidad es la que es, y aun así es la diferencia entre
  perder 5 MB y perderlo todo.
- El contador sigue contando sobre el fichero entero, así que al reintentar baja lo de un trozo y
  no vuelve a cero.
- Al terminar se comprueba que el fichero guardado pesa lo que se envió. Si no coincide, la subida
  se da por fallida en lugar de registrar un original incompleto: es la fotografía de archivo y un
  fichero corto no se nota hasta que alguien lo abre.
- Si un trozo no hay manera de subirlo, se abandona la subida entera y se avisa. Nunca se cierra
  un fichero al que le falte un trozo.

**El botón de subir se ve siempre, aunque haya que bajar por la pantalla**

- Va en una barra pegada al pie, como el «Guardar» del formulario de la ficha. Estaba dentro de la
  tarjeta de arriba, así que con cuatro fotografías preparadas se salía de la pantalla.
- Dice cuántas quedan sin subir. Fotografías preparadas y nunca enviadas es lo único que esta
  pantalla podía perder en silencio.
- Si algo falla, el motivo sale ahí mismo, junto al botón que se acaba de pulsar, y no al final de la
  página.
- La barra solo aparece cuando hay algo pendiente o algo subiendo.

## 5 de agosto de 2026

### Interfaz

**Un documento escaneado se puede ver desde la ficha, sin descargarlo**

- «Ver el documento» pasa a ser el botón principal. La descarga queda debajo, porque sigue siendo
  necesaria para sacar el fichero del catálogo.
- Una imagen escaneada —JPEG o PNG— se abre sobre la ficha, sin salir de la aplicación. Se cierra con el
  botón de atrás del móvil, con la ✕ o con Escape.
- Se puede ampliar con el botón superior o tocando dos veces sobre el documento: ajustada a la pantalla
  de un móvil, la letra de una carta mecanografiada queda por debajo del tamaño legible.
- Un PDF se abre en el visor del navegador, que permite pasar páginas, buscar texto y ampliar. Se avisa
  de que se abre fuera de la aplicación.
- Los formatos TIFF y HEIC no se ofrecen para ver: ningún navegador muestra el primero, y el segundo
  funciona en unos teléfonos y en otros no. En esos casos solo está la descarga.
- El peso se sigue indicando antes de tocar: ver el documento descarga el fichero completo y consume los
  mismos datos.

**El archivo documental tiene listado, búsqueda y ficha propia**

- Disponible en Tablas → Archivo, y también desde el título de cualquier documento en la ficha de una
  obra. Antes, a un documento sin ninguna obra enlazada no se llegaba desde ningún sitio.
- El listado se ordena por la signatura escrita en la carpeta. Los documentos sin signatura van al final,
  porque una signatura vacía indica que todavía no está archivado.
- Se busca por signatura, título, tipo o año.
- El recuento incluye cuántos quedan sin digitalizar, que es la lista de trabajo del escaneo.
- La ficha indica en primer lugar con qué está enlazado: «Enlazado con 3 obras y una exposición». Ese
  dato no estaba en ninguna pantalla, porque desde la ficha de una obra solo se ve su propio vínculo.
- Cuando no está enlazado con nada también se indica, sin presentarlo como error: un documento del
  archivo existe por sí mismo.
- Las obras y las exposiciones se listan en dos bloques separados, para no mezclar códigos de obra con
  títulos de exposición. Cada entrada lleva a su ficha.
- El fichero también se descarga desde aquí.
- Corregir los datos y añadir el escaneo siguen haciéndose desde la documentación de una obra; retirar el
  documento y recuperarlo, desde la papelera. La ficha lo indica en lugar de dejar buscar el botón.

**Un documento del archivo se puede enlazar con una exposición**

- Era el único vínculo del catálogo que no podía crearse desde ninguna pantalla: un cartel, un díptico o
  una nota de prensa tratan de la muestra y no de una pieza concreta.
- Se hace desde la ficha del documento, con «Enlazar con una exposición».
- Admite una nota propia: lo que el documento dice de la muestra no es lo que dice de una obra suya.
- Una muestra retirada no se ofrece, porque enlazarla la devolvería a la circulación.
- Una que ya está enlazada sí sigue apareciendo, marcada, para no obligar a teclear el mismo título
  repetidamente.
- El vínculo se puede quitar, con dos toques y avisando antes de lo que no cambia: el documento se
  mantiene en el archivo con su fichero, y lo siguen viendo las demás fichas enlazadas.

**La ficha de una exposición indica cuál de las referencias es su catálogo**

- El catálogo de una muestra es una referencia de la bibliografía. El dato estaba previsto pero no podía
  rellenarse: la ficha indicaba si publicó catálogo y nada más.
- Ahora nombra la referencia correspondiente y enlaza con su ficha, donde constan la publicación completa
  y las obras que la citan.
- Si no consta que hubiera catálogo, se advierte antes de elegir, con dos avisos distintos: «sin revisar»
  indica que hay que averiguarlo, y un «No» ya investigado requiere corregir antes ese «No».
- El vínculo se puede quitar siempre, incluso sobre una ficha incoherente, para que exista una forma de
  corregirla.
- Cuando consta que publicó catálogo pero no cuál es, la ficha lo indica como trabajo pendiente y no como
  error.

**Cada referencia bibliográfica tiene ficha propia, con las obras que la citan**

- Al tocar una referencia del listado se abre su ficha.
- Indica qué obras del catálogo la citan y en qué página aparece cada una —«págs. 34-36», «lám. XII»,
  «s/p»—, con la nota de esa cita. Cada obra lleva a su ficha.
- Las obras se ordenan por su código de catalogación, que es el orden del catálogo razonado.
- Las páginas no determinan el orden: «lám. XII» y «s/p» son respuestas válidas a «¿en qué página?», y
  ordenar por ellas situaría la lámina antes de la página 9.
- Cuando ninguna obra la cita, la ficha lo indica y aclara que no es un dato pendiente.
- Se corrige con el mismo panel que se abre desde la bibliografía de una obra, para que la corrección del
  catálogo compartido no dependa de la pantalla de entrada.
- Retirarla y recuperarla siguen siendo operaciones de la papelera, y la ficha lo indica.

**La bibliografía del catálogo tiene listado propio, con búsqueda**

- Está en Tablas → Bibliografía, y también al final de la ficha de cualquier obra. Antes, a una
  referencia sin ninguna obra que la cite no se llegaba desde ningún sitio.
- Se busca por autor, título, año, revista, editorial, lugar y clave de cita: buscar «badajoz» encuentra
  el libro editado allí aunque el lugar no figure en el título.
- El orden es el de una bibliografía impresa: alfabético por autor y, dentro de cada autor, del más
  antiguo al más reciente.
- Una referencia sin firma se coloca por su título entre las demás y no al final.
- Las referencias sin año muestran «s.f.» en la posición del año, para que la columna se pueda recorrer
  sin descuadres.
- Las retiradas no aparecen salvo que se pidan, y entonces se muestran atenuadas y con la palabra
  «Retirada».
- No hay botón de «nueva referencia»: una referencia se crea al citarla desde una obra.

**Los datos de un documento del archivo se pueden corregir, y el escaneo se puede añadir después**

- En cada documento de una ficha, dentro de la zona de edición, hay dos operaciones nuevas: «Corregir los
  datos del documento» y, solo cuando falta, «Añadir el escaneo».
- Se corrigen la signatura, el título, el tipo, la serie del archivo, el fondo, la fecha, la ubicación del
  papel y la nota. Antes un documento quedaba tal como se hubiera subido.
- El panel indica en primer lugar que el documento pertenece al archivo y no a esta obra, y con qué más
  está enlazado: «está enlazado además con otras tres obras y una exposición: también cambiará lo que se
  lee ahí».
- Si la cuenta no se puede consultar por falta de cobertura, se indica en lugar de mostrar un número
  aproximado.
- Cerrar el panel sin haber cambiado nada no guarda nada, de modo que el documento no consta corregido si
  nadie lo ha corregido.
- El escaneo se añade en una hoja aparte, porque escribir un campo y subir varias decenas de megabytes
  son operaciones distintas.
- Un fichero ya subido no se sustituye: los ficheros del almacén no se sobrescriben, así que reemplazarlo
  dejaría el anterior sin referencia. Si el fichero subido es erróneo, se registra un documento nuevo.
- Si otra sesión ha subido el escaneo mientras la hoja estaba abierta, el fichero no se sobrescribe: se
  avisa y se pide recargar antes de repetir la operación.
- También se puede corregir lo que un documento dice de una obra concreta («reproducida en la página 3»).
  Antes solo podía escribirse al enlazarlo.

**El botón de atrás del móvil cierra el panel abierto, no la pantalla**

- Con un panel abierto —filtros del listado, elegir una ubicación, una sede, una persona o el estado de
  una investigación, subir un documento, añadir un eslabón de procedencia— el botón de atrás salía de la
  ficha completa y descartaba lo que estuviera a medio rellenar.
- Ahora cierra el panel y mantiene la pantalla, con su desplazamiento y sus filtros.
- Con un panel abierto dentro de otro, cierra solo el superior, uno por toque.
- Afecta sobre todo a la aplicación instalada: al no haber barra del navegador, el botón de atrás del
  teléfono es la única salida disponible.
- Cuando hay una operación en curso —la subida de un documento— el botón de atrás no hace nada, para que
  la siguiente pulsación no salga de la pantalla con la subida a medias.

**Se puede ampliar el tamaño de letra de toda la aplicación**

- En Mi perfil → Tamaño de letra, tres opciones: Normal, Grande (115 %) y Más grande (130 %).
- El cambio se aplica al tocar, sin botón de guardar, y debajo hay una línea de muestra para comprobar el
  resultado.
- No se amplía solo el texto: también crecen los botones, las tarjetas y los espacios. Quien necesita el
  texto más grande necesita también objetivos de toque más grandes.
- El navegador ya permite ampliar el texto, pero la aplicación instalada no tiene barra de navegador
  donde hacerlo, y esa es la forma habitual de uso.
- Se guarda en el dispositivo, de modo que cada móvil u ordenador tiene el suyo.
- Se aplica al abrir la aplicación —también en la pantalla de entrada— sin que el texto cambie de tamaño
  un instante después de cargar.
- El editor de fotografía se mantiene al tamaño normal, porque sus controles y su lienzo se miden en
  píxeles; al cerrarlo vuelve el tamaño elegido.
- Con la letra más grande cabe menos contenido en cada pantalla. El máximo es el 130 % porque por encima,
  en un móvil estrecho, los pares de botones no caben.

**«Sobre la aplicación»: qué versión está instalada, qué trajo y qué falta**

- Pantalla nueva en Mi perfil → Sobre la aplicación, que reúne tres cosas antes repartidas.
- Las novedades: este registro de cambios, dentro de la aplicación. La entrada más reciente aparece
  abierta y las anteriores plegadas. Se lee sin conexión, porque viene incluido en la propia aplicación.
- Lo que todavía no se puede hacer, y en qué pantalla se hace lo que no corresponde a la ficha de la
  obra. Antes ocupaba media pantalla al pie de cada ficha; ahora allí queda una línea con un enlace.
- La versión de la aplicación, que estaba en el perfil. El perfil se queda con los datos de la cuenta.

### La base de datos del catálogo

**Las fotografías de una obra retirada dejan de ser visibles para quien solo consulta**

- La ficha de una obra retirada ya no era visible, pero sí la fila de sus fotografías, con la ruta de los
  ficheros. Como la ruta contiene el código de catalogación, permitía deducir qué obras hay en la
  papelera y cuántas tomas tiene cada una.
- Era el último caso de este tipo; los otros seis se cerraron el 4 de agosto.
- Se cierran con él los dos datos que dependen de una fotografía: los enlaces de procedencia de la
  reproducción y su historial de cambios.
- Quien cataloga sigue viéndolo todo, porque la papelera muestra lo retirado y recuperar una obra debe
  devolverla con sus fotografías.

### Correcciones

**Los códigos internos de la documentación del proyecto ya no se leen en pantalla**

- Aparecían dos: uno en el panel del catálogo de una exposición y otro en el pie de la hoja del testigo
  de gris, que además se imprime y se fotografía junto a la obra.
- Son la forma de citar los documentos técnicos entre quienes los escriben, y no dicen nada a quien
  cataloga.

**Un formulario a medio rellenar ya no se pierde al tocar fuera del panel**

- Ocurrió dos veces con datos dentro. El panel se cerraba por cuatro vías —el fondo oscuro, la ✕, Escape
  y el botón de atrás— y las cuatro eran inmediatas.
- En los paneles que son un formulario, el fondo ya no cierra: la salida está siempre en la ✕ superior
  derecha.
- En los paneles de selección —una ubicación, una sede, un estado de investigación— tocar fuera sigue
  cerrando, porque no hay nada que perder.
- Las demás salidas piden confirmación cuando hay algo escrito: la ✕, Escape, el botón de atrás y el
  «Cancelar» del pie.
- El aviso indica que no se modifica nada del catálogo, porque el panel todavía no ha guardado, y ofrece
  «Seguir rellenando» en primer lugar.
- Al subir un documento o añadirle un escaneo se añade que habría que volver a seleccionar el fichero.
- No se pide confirmación sobre un formulario en blanco ni cuando lo único escrito es un espacio: un
  aviso que aparece siempre se acaba descartando sin leerlo.
- Con el aviso en pantalla, ni el botón de atrás ni Escape salen del panel: lo retiran y devuelven al
  formulario.

**Si el panel se cierra de todas formas, lo escrito se recupera**

- Una confirmación no cubre recargar la pantalla, que el sistema cierre la aplicación en segundo plano ni
  quedarse sin batería.
- Lo que se está escribiendo se guarda en el dispositivo y se ofrece al volver a abrir el panel:
  «Dejaste esto a medio rellenar hace 20 minutos. ¿Lo recuperas?», con «Recuperar lo que escribí» y
  «Empezar de cero».
- Está disponible al subir un documento, corregir sus datos, corregir una referencia, citar una obra y
  añadir un eslabón de procedencia.
- El aviso anterior ya no advierte de una pérdida: indica que no se modifica nada del catálogo y que lo
  escrito queda guardado. El botón se llama «Salir sin guardar».
- El borrador caduca a la semana, para no ofrecer uno antiguo sobre una ficha corregida varias veces
  desde entonces.
- Si los datos guardados han cambiado desde que se apuntó, el borrador se ofrece igual pero advirtiendo
  de que aceptarlo sin revisar perdería esa corrección.
- El fichero escaneado no puede guardarse, y cuando el formulario llevaba uno se indica al ofrecer el
  borrador.
- Al guardar, el borrador se elimina, igual que al dejar el formulario como estaba.

**El aviso de un permiso denegado hablaba de una descarga no solicitada, y tenía una errata**

- Decía «no se ha podido preparar la descarga de el documento…»: mencionaba una descarga aunque se
  hubiera pulsado «Ver», y le faltaba la contracción.
- Ahora dice «no se ha podido acceder al documento», que sirve para ambos casos. Lo mismo ocurría con las
  fotografías.

**Los paneles se cerraban solos, y el botón de atrás no respondía tras recargar**

- Un panel se cerraba en el mismo instante de abrirse. Solo se producía en el entorno de desarrollo.
- Después de recargar la pantalla con un panel abierto, el botón de atrás no lo cerraba y había que
  pulsarlo dos veces. Este llegaba a producción.

**En el editor de fotografías, el botón de atrás descartaba el trabajo sin aplicar**

- Con el panel de color o el de datos de cámara abierto, cerraba el editor completo y descartaba el
  encuadre y el color no aplicados. Con teclado no ocurría.
- Ahora actúa por capas: desactiva el cuentagotas, después cierra el panel y, con la botonera visible,
  sale del editor.
- «Aplicar», «Cancelar» y la ✕ siguen saliendo directamente, también con un panel abierto.

---

## 4 de agosto de 2026

### Interfaz

**Las exposiciones tienen pantalla propia, en el menú inferior**

- Quinta pestaña, «Exposiciones», entre «Obras» y «Añadir». Antes una exposición se podía enlazar con una
  obra pero no crear.
- Desde ella se busca por título, año o sede, se da de alta una nueva, se abre y se lee como una ficha de
  obra, se corrige, se retira y se recupera.
- Cada exposición indica qué obras del catálogo estuvieron en ella, ordenadas por el número que llevaban
  en el catálogo de la muestra, que es el orden de las salas, y no por el código del catálogo razonado.
- Las obras sin número anotado van al final, para que ninguna aparezca como la primera sin serlo.
- Registrar que una obra estuvo en una muestra se sigue haciendo desde la ficha de la obra, donde están
  su historial expositivo y el estado de investigación correspondiente.
- Una exposición puede guardarse sin sede: si la fuente solo dice «una galería de Madrid», eso es lo que
  se registra.
- Las etiquetas de las cinco pestañas bajan un punto de tamaño, porque «Exposiciones» no cabía a 360
  píxeles de ancho.

**La papelera: lo retirado se puede consultar y recuperar**

- Se abre desde Tablas, al final, en el apartado «Lo retirado». Nada se ha borrado nunca del catálogo,
  pero no había ninguna pantalla desde la que consultarlo.
- Muestra lo retirado agrupado por tipo, cada línea con quién lo retiró y cuándo —«Retirada por Marta el
  28 de julio de 2026 a las 22:42»— y un botón «Recuperar».
- Los grupos vacíos se indican en lugar de ocultarse.
- Cuando el catálogo no permite recuperar algo porque otra cosa lo impide, la pantalla indica qué hay que
  hacer antes.
- No existe «vaciar la papelera» ni «borrar para siempre», y esa ausencia es deliberada.
- Está disponible solo para quien cataloga: recuperar requiere permiso de edición.

**Cada obra puede registrar dónde más está documentada en internet**

- Apartado nuevo al final de la ficha, «Enlaces a sitios externos»: la ficha de la obra en la web de un
  museo, la noticia de una subasta, la entrada de una base de datos o la reproducción en otro catálogo.
- Cada enlace se identifica por su título o, si no lo tiene, por el nombre del sitio.
- Debajo se muestra el dominio al que lleva, nunca la dirección completa, porque una dirección larga
  puede disimular su destino.
- Cada enlace registra cuándo se comprobó por última vez y con qué resultado: disponible, lleva a otro
  contenido, o ya no existe.
- La comprobación la registra una persona. La aplicación no solicita nada al sitio enlazado, ni un icono
  ni una previsualización, porque cada petición informaría a un tercero de qué obra se está catalogando y
  cuándo.
- Cuando una comprobación queda desactualizada, se avisa.
- Permite también indicar la procedencia de una fotografía tomada de otro catálogo. Mientras no se
  indique, el apartado lo advierte desde su cabecera aunque esté plegado.
- Los enlaces se abren desde la ficha; añadirlos, corregirlos, retirarlos y anotar una comprobación se
  hacen en la zona de edición.

**Un documento del archivo se sube y se enlaza desde la obra**

- Desde el apartado de documentación de una ficha se sube el escaneo de un expediente, una carta o un
  recorte, se le asigna signatura y serie, y se enlaza con la obra que documenta.
- La clasificación del archivo existía pero no había forma de incorporar documentos.
- El mismo documento se puede enlazar con varias obras sin duplicar el fichero.
- El escaneo hay que adjuntarlo al dar de alta el documento: después no se puede añadir, y la pantalla lo
  advierte antes de guardar.

**El historial de una obra se puede consultar**

- La ficha incluye al final un apartado que describe los cambios: «Marta cambió el alto, el ancho y la
  técnica, hoy a las 11:40». Se guardaban desde el día anterior, pero no había dónde consultarlos.
- Cada guardado ocupa una línea aunque haya modificado ocho campos.
- Cuando el cambio afectó a un solo dato, se muestran el valor anterior y el nuevo.
- Llega plegado y no consulta nada hasta que se abre, por ser la parte más costosa de la ficha.
- Un cambio realizado por una migración o por mantenimiento se atribuye a «El sistema».
- Cuando una obra no tiene ningún cambio registrado, se indica que el historial empieza el 5 de agosto de
  2026 y que lo anterior no consta, que no equivale a afirmar que no ocurriera.
- No se puede deshacer ni modificar: nadie, tampoco quien cataloga, puede corregir ni borrar una línea.

**Quitar los filtros, en la cabecera y con el número de filtros aplicados**

- Estaba al final del panel, debajo de las cinco secciones de opciones, de modo que llegar a él exigía
  recorrer lo que se quería deshacer.
- Ahora está en la cabecera e indica cuántos filtros hay puestos, porque con el panel abierto no se ven a
  la vez todas las secciones.
- Cuando no hay ninguno, el botón no aparece.

**«Editar ficha» pasa a la izquierda**

- En la ficha de una obra, los dos botones superiores cambian de posición: primero editar la ficha y
  después editar las fotografías.

**Las nueve listas del catálogo se mantienen desde la aplicación**

- Eran tres: ubicaciones, tipos de obra y series. Las otras seis se leían desde la ficha de una obra pero
  solo podían rellenarse por solicitud.
- **Personas e instituciones.** Quién ha tenido cada obra, quién presta, quién es titular de los derechos
  y qué institución hay detrás de una sede. Corregir el nombre de un museo se hace una vez y lo reflejan
  todas las obras que pasaron por él.
- El teléfono y el correo no aparecen en el listado, porque son datos de un tercero y esta pantalla se
  abre en presencia de otras personas: se consultan ficha a ficha, con un aviso que indica quién más
  puede verlos.
- Cuando una ficha de persona no se puede retirar porque el catálogo la usa, la pantalla indica en qué
  obras y en qué sedes.
- **Sedes de exposición.** Los lugares donde ocurrieron las muestras, cada uno con su localidad, que es
  lo que distingue una Casa de Cultura de otra. No son las ubicaciones del almacén.
- **La clasificación del archivo.** Los documentos se ordenan en fondos, series y subseries. Se puede
  crear una serie, corregir su nombre, mover una serie completa dentro de otra y retirar las que sobren.
- Cuando una serie no se puede retirar, la pantalla indica cuántos documentos contiene y cuáles son.
- **Tipos de documento** y **tipos de publicación**: lo que ofrecen los campos «Tipo» de un documento del
  archivo y de cada referencia bibliográfica. Vienen con diez y seis valores respectivamente.
- **Tipos de relación.** Las clases de parentesco entre dos obras, cada una con sus dos lecturas: la que
  mostrará la ficha de una obra y la que mostrará la de la otra. La pantalla muestra ambas mientras se
  escriben, porque la segunda no se ve desde la obra en la que se trabaja y es la que queda invertida si
  se escribe mal.
- En las nueve rige la misma norma: nada se borra. Lo que deja de usarse se retira, se muestra atenuado y
  vuelve al uso escribiendo su nombre de nuevo.
- Ninguna permite retirar algo que el catálogo todavía usa: cuando no se puede, se explica el motivo y
  qué hay que hacer antes.
- Si se pierde la conexión, lo indican en español y advierten de que el cambio no se ha enviado.

**La sección «Tablas» se organiza por grupos**

- El índice se agrupa según para qué sirve cada lista —la ficha de la obra; dónde y quién; los
  documentos—, con una línea por grupo que indica su contenido. Tres grupos de tres.
- Antes eran nueve enlaces consecutivos, y llegar al noveno obligaba a leer ocho nombres casi todos
  iniciados por «Tipos de».

**La ficha de obra incorpora su parte documental**

- Cinco apartados nuevos debajo de la conservación y la ubicación, en el orden en que se investiga una
  obra: procedencia, exposiciones, bibliografía, documentos del archivo y obras relacionadas.
- Hasta ahora la ficha incluía un recuadro que indicaba que todo esto estaba pendiente.
- La ficha se lee: los cinco apartados muestran el contenido y no permiten modificarlo. Para registrar,
  corregir o retirar algo se entra a editar la obra.
- Es la misma norma que sigue el resto de la ficha y evita modificar un dato creyendo que solo se estaba
  consultando.
- Todo lo retirado se conserva con la indicación de quién lo hizo y cuándo.
- Estos cinco apartados guardan de inmediato, cada uno por su cuenta: no hay que pulsar «Guardar», y
  «Cancelar» no los deshace, a diferencia del resto del formulario. La pantalla lo advierte.

**Cada apartado distingue «no hay nada» de «no se ha investigado»**

- Una obra sin exposiciones registradas no es una obra que no se haya expuesto: puede ser una obra que
  nadie ha investigado.
- Cada apartado indica en su cabecera cuántos registros tiene y en qué estado está su investigación: sin
  revisar, en curso, investigado sin resultados, cerrada.
- Al abrirlo, lo explica con una frase completa en lugar de dejar el hueco.
- Declarar «se ha investigado y no consta nada» es una respuesta, se guarda como tal y no se confunde con
  la ausencia de datos.

**Un hueco en la procedencia se presenta como un hueco**

- La cadena de propietarios se lee de arriba abajo como una sola secuencia.
- Los años que nadie cubre aparecen intercalados entre los dos propietarios que separan, con el mismo
  espacio que ellos.
- Arriba se indica si la cadena tiene huecos, si no se puede medir por falta de fechas o si es continua y
  está fechada.
- Al final se indica dónde está la obra hoy, solo cuando puede afirmarse.
- La procedencia redactada para publicar se muestra tal cual si está escrita; si no, se compone un
  borrador a partir de la cadena y se advierte de que lo es.

**La bibliografía indica la página y evita duplicar publicaciones**

- Cada cita muestra primero el título de la publicación y después la página, que es la parte que se copia
  en otro texto.
- Al citar se busca por título, autoría, revista o clave de la publicación.
- Si lo que se está escribiendo ya existe en el catálogo se avisa antes de guardar y se ofrece usar la
  existente: dos fichas del mismo libro dividirían las citas de forma permanente.
- Con pocas citas se muestran en una sola lista; cuando hay bastantes y de tipos distintos, se agrupan
  por tipo de publicación.

**Los apartados llegan plegados y no consumen datos hasta que se abren**

- Cinco apartados abiertos debajo de las fotografías ocuparían una pantalla entera en un móvil.
- Llegan cerrados, con lo necesario en la cabecera para decidir si abrirlos.
- No consultan nada hasta que se llega a esa altura de la ficha, de modo que recorrer treinta obras no
  cuesta cinco consultas por obra.
- Hay un botón para cargarlos de inmediato cuando hace falta.

**El recuadro de «pendiente» ya no menciona lo que la ficha muestra**

- Indicaba que la procedencia, las exposiciones, la bibliografía y la documentación estaban por hacer
  mientras se mostraban ochenta líneas más abajo.
- Se ha revisado afirmación por afirmación y ahora solo queda lo que sigue siendo cierto: que un
  documento del archivo no tiene ficha propia donde corregir sus datos, y que una referencia
  bibliográfica solo se corrige desde una obra que la cite.
- El párrafo que indica dónde sí se hacen las cosas menciona ahora también «Exposiciones».

**Descargar una fotografía: el original y la copia lista para imprimir**

- Apartado «Descargar esta fotografía» debajo de la galería, con una línea que explica la diferencia
  entre los dos ficheros.
- El original es lo que salió de la cámara: sin girar, sin recortar y con la luz de la sala.
- La copia corregida es del mismo tamaño con el giro, el recorte, la perspectiva y el color aplicados. Es
  la que hay que enviar a una imprenta o a un comisario, y hasta ahora no se podía descargar.
- Va plegado y no descarga nada hasta que se toca, porque un original puede pesar veinte megabytes.
- Cada botón indica el peso antes de pulsarlo.
- Está disponible también para quien solo tiene permiso de lectura.

**La copia corregida solo se ofrece cuando existe, y si no existe se explica**

- Un botón que desaparece no distingue «no hace falta» de «falta».
- Si quedó pendiente porque el móvil no pudo prepararla, se indica, junto con que se generará después
  desde un ordenador.
- Si la fotografía se corrigió antes de que existieran estas copias, también se indica.
- Si la fotografía no tiene ninguna corrección, no falta nada: para una imprenta el original es el
  fichero correcto.
- Mientras se comprueba, también se indica.

**El fichero se descarga con un nombre comprensible fuera de la aplicación**

- `AR-0001_general_original.jpg`, `AR-0001_firma_corregida.jpg`: el código de la obra, el tipo de toma y
  qué fichero es.
- Antes se guardaba con el nombre interno del almacén, con ocho caracteres aleatorios, y quien lo recibía
  por correo no podía saber de qué obra era.
- Cuando una obra tiene dos tomas del mismo tipo, se numeran.

**La descarga funciona, y si falla se explica**

- El botón anterior abría el fichero en otra pestaña en lugar de guardarlo, y en el móvil con frecuencia
  no hacía nada.
- Ahora el fichero se guarda donde el navegador guarde las descargas, y el botón indica el progreso.
- Si algo falla —falta de cobertura, permiso de descarga caducado, fichero ausente del almacén— se indica
  qué ha ocurrido y qué hacer.
- El error desaparece en cuanto el siguiente intento funciona.

### Correcciones

**Los apartados nuevos de la ficha indicaban que no habían podido cargar**

- La procedencia, la bibliografía, las exposiciones, los documentos del archivo, las obras relacionadas y
  los enlaces mostraban el mismo aviso independientemente de la cobertura.
- La causa no era la conexión: la aplicación publicada solicitaba esos datos, pero el catálogo todavía no
  tenía dónde guardarlos, porque la preparación correspondiente no se había desplegado.
- Ya está aplicada, y con ella los seis apartados.
- Se ha impedido que las dos partes vuelvan a separarse: no se publica una versión de la aplicación sin
  haber preparado antes el catálogo que necesita, y si esa preparación falla, la versión no se publica.

**Recargar una pantalla de edición ya no devuelve a solo lectura**

- Recargar la página en la zona de edición, abrir su dirección directamente o volver desde un enlace
  guardado devolvía a la versión de solo lectura sin ninguna advertencia.
- La pantalla decidía si había permiso antes de que el permiso hubiera llegado, y en ese momento la
  respuesta era negativa.
- Ocurría en la ficha de una obra, donde se perdían de vista los seis apartados de documentación, y en la
  ficha de una exposición, que además es el único sitio desde el que se retira y se recupera.
- Ahora ambas esperan a conocer el permiso. La parte de solo lectura no espera, porque no depende de él.

**Al subir un documento ya no se anuncia una corrección que no existe**

- El panel indicaba que la signatura del archivo «se puede corregir después», y cuatro líneas más arriba
  advertía de que el escaneo no se puede añadir más tarde.
- Lo segundo era cierto y lo primero no: un documento del archivo todavía no tenía ninguna pantalla donde
  modificar sus datos.

---

## 3 de agosto de 2026

### Interfaz

**Corregir la luz de la sala sin modificar la fotografía original**

- Un almacén no tiene luz de estudio: la misma obra sale amarilla bajo una bombilla, verdosa bajo un
  fluorescente y azulada junto a una ventana, y ese tinte corresponde a la sala y no a la obra.
- Segundo botón en la cabecera del editor que abre los controles de color, situados al pie: el balance de
  blancos se juzga observando la superficie completa, y un panel superpuesto ocultaría la obra.
- Los controles son temperatura, matiz, exposición, negros, blancos, medios tonos y altas luces suaves,
  más un interruptor de blanco y negro.
- Se ajustan con el dedo y con las flechas del teclado, con dos toques vuelven a su valor de partida, y
  cada uno se deshace por separado.
- Debajo hay un histograma del encuadre elegido, no de la pared que rodea la obra, y un aviso cuando el
  ajuste empieza a perder detalle en las sombras o en las luces.
- El resultado se ve sobre la obra mientras se ajusta, y también en la vista previa de la imagen
  enderezada.
- Primer atajo: tomar un gris de la propia fotografía tocando una zona neutra —un cartón gris, una pared
  blanca, el paspartú—.
- Segundo atajo: un ajuste automático que propone valores y no modifica el balance de blancos cuando no
  encuentra grises fiables, porque una sugerencia equivocada es peor que ninguna.
- Tercer atajo: una lista de tipos de luz de la que partir —ventana, día nublado, fluorescente frío o
  cálido, led neutro, bombilla, mezcla de ventana y techo, flash del móvil—. Son un punto de partida
  ajustable y no una medición, y así están etiquetados.
- Al fotografiar una tanda, la segunda fotografía se corrige con un toque repitiendo la luz de la
  anterior. Al cerrar el lote ese ajuste se descarta.
- En una obra ya catalogada, el reverso, la firma, el daño y el marco heredan el ajuste de la toma
  general, se pueden modificar por separado y se restablecen al valor heredado. La pantalla indica cuándo
  un ajuste procede de la herencia.
- Nada de esto modifica la fotografía original: lo que se guarda son los valores y no una imagen
  aplanada, y el original de archivo se sube una vez y no se reescribe.
- Volver a ajustar reemplaza el ajuste anterior en lugar de acumularlo, de modo que corregir veinte veces
  no degrada la imagen.
- «Volver al original» devuelve la fotografía al estado en que salió de la cámara, incluidos giro,
  recorte, perspectiva y color.

**Lo que este ajuste no va a incorporar**

- No hay saturación, vibrancia, contraste, realce de sombras o de luces, enfoque, eliminación de niebla o
  de reflejos ni virados, y no está previsto añadirlos.
- Una fotografía de catálogo debe documentar el estado de la obra, y un barniz amarilleado, un color
  apagado, un dorado con pátina o una humedad son parte de ese estado.
- Lo que sí se corrige es la luz de la sala, que no pertenece a la obra.
- En el detalle de daño y en el marco solo se ofrece corregir la dominante, la temperatura y la
  exposición. El resto de controles aparecen desactivados con el motivo indicado al lado.
- El blanco y negro solo se ofrece en el reverso y en el detalle de firma, donde lo relevante es leer una
  etiqueta o un trazo.

**El testigo de gris, y una hoja para imprimirlo**

- Si en la toma se coloca junto a la obra una tira de grises, la aplicación la reconoce sobre la
  fotografía, la señala y ofrece tomar su gris. No aplica nada por su cuenta.
- Hay una página nueva que explica con ilustraciones dónde colocarlo, cómo no colocarlo —en sombra o con
  reflejo— y que no colocarlo también es válido, porque el resto funciona igual.
- Desde ella se descarga una hoja lista para imprimir en A5.
- La hoja incluye su propia advertencia: el gris de una impresora doméstica sirve como patrón para
  comprobar la escala de grises, pero no como referencia de dominante, porque su tinta no es neutra.
- La aplicación distingue ambas: la carta comprada modifica el balance de blancos, la hoja impresa solo
  se anota.

**Los datos que trae la fotografía**

- El otro botón nuevo de la cabecera muestra fecha de la toma, cámara, aplicación de cámara, tamaño del
  original, sensibilidad, exposición, diafragma, objetivo y flash.
- Solo los disponibles, sin huecos con guiones y sin valoraciones: la aplicación no opina sobre si una
  toma está bien expuesta.
- Se distinguen la fecha del disparo, cuando la cámara la registró, y la fecha del fichero, marcada como
  aproximada, cuando la primera no existe. Es el caso de las catorce fotografías de 2022.
- Ambas se guardan junto a la fecha de la ficha y nunca en su lugar: la ficha indica cuándo entró la
  fotografía en el catálogo y el fichero indica cuándo se disparó, y pueden diferir legítimamente.
- Cuando difieren, se indica sin alarma —«la foto dice 9 de octubre de 2022»—, porque hoy difieren las
  treinta y nueve.
- Cuando no hay datos, se distingue si la fotografía no los incluye o si el original no se ha podido
  descargar.

**Indicar la procedencia de cada fotografía**

- De cada fotografía se puede declarar si es propia, tomada de otro catálogo o recibida de un tercero.
  Cuatro de las cuarenta y cuatro son reproducciones de catálogos en línea.
- En las que no son propias no se ofrece corregir el color, con el motivo indicado en la pantalla:
  corregir la dominante de la reproducción de otro equivale a modificar su revelado sin conocer la luz
  original.
- Se declara y no se deduce: una fotografía con aspecto de captura de pantalla puede ser propia.
- Tampoco se ofrece cuando el original no se ha podido descargar y se trabaja sobre la copia de consulta,
  que ya lleva el color aplicado.

**Una copia a tamaño completo para enviar a una imprenta**

- Al aplicar una corrección se prepara una copia a resolución completa con todo aplicado: giro, recorte,
  perspectiva y color.
- Se rehace en cada edición, y si no hay ninguna corrección no se genera: para eso está el original.
- Un móvil no siempre puede procesar un fichero de veinte megapíxeles. Cuando no puede, queda registrado
  y se indica el motivo, en lugar de guardar una imagen en blanco o reducida.
- La ficha de cada fotografía muestra si esa copia existe, falta o quedó pendiente, y lo pendiente se
  genera después desde un ordenador.
- No se sube ningún fichero sin comprobarlo antes.
- Por ahora esa copia queda siempre pendiente, por un permiso que falta habilitar. Está explicado en «En
  marcha», al final de este documento.

**La ficha de cada fotografía incluye más datos**

- El tamaño del original, y lo que se hizo con la fotografía en una sola línea: girada, recortada,
  perspectiva corregida y ajuste de color.
- Revisar el color y dejarlo como estaba queda registrado como revisado sin reescribir ninguna copia,
  porque distinguir «se revisó y estaba correcto» de «nadie lo ha revisado» forma parte del trabajo de
  catalogación.

### La base de datos del catálogo

**El color se guarda como valores, no como una imagen modificada**

- Cada fotografía guarda los valores de su corrección, su origen —manual, automático, gris tomado de la
  propia fotografía, testigo, o revisada sin cambios— y cuánto detalle costó el ajuste.
- Guardar valores permite reeditar años después, rehacer las copias cuando cambie el tamaño de pantalla
  habitual y garantizar que el original sigue siendo el que salió de la cámara.
- Se guardan también la fecha que trae el fichero y si es exacta o aproximada, el tamaño del original, la
  procedencia de la fotografía y el estado de la copia a tamaño completo.
- La base de datos impide que esos datos queden incompletos: una fecha aproximada sin indicarlo no se
  admite, «la copia está» y «la copia falta» no pueden ser ciertas a la vez, y la ruta de una copia no
  puede coincidir con la del original.

**Estos datos no se rellenan retroactivamente**

- Las treinta y nueve fotografías existentes se quedan sin fecha del fichero y marcadas como propias, que
  es lo correcto para treinta y cinco de ellas.
- Completar las demás requiere una revisión con los originales delante.

### Correcciones

**El cuentagotas no permitía apuntar: la fotografía se movía con el dedo**

- Arrastrar el dedo para llegar al punto deseado movía la fotografía en lugar de la muestra, de modo que
  había que acertar de un solo toque.
- Ahora el dedo apunta: se arrastra hasta el gris que interesa y la lupa muestra por delante el color sin
  corregir. Al levantar el dedo se toma la medida.
- Para mover o ampliar la fotografía sin salir del modo se usan dos dedos.

**La corrección de perspectiva se perdía al recargar la pestaña**

- Una fotografía enderezada antes de subirla perdía las cuatro esquinas si la pestaña se recargaba con la
  fotografía todavía en la cola.
- La corrección seguía viéndose, porque estaba aplicada en las copias, pero el dato desaparecía y no se
  podía volver a ajustar.
- Ahora la cola guarda las esquinas y su origen, y una cola escrita por la versión anterior se lee sin
  error.

**El editor indicaba «Sin cambios» con la perspectiva corregida en pantalla**

- El resumen de la cabecera mencionaba el giro y el recorte pero no la corrección de perspectiva.
- Ahora menciona todo lo aplicado, incluido el color, e indica cuándo un ajuste procede de la herencia.

**Un cuadro ligeramente inclinado salía deformado al enderezarlo**

- Enderezar un rectángulo girado unos pocos grados devolvía una imagen un uno por ciento más ancha o más
  alta de lo que corresponde, y la proporción de una obra es un dato de catálogo.
- Ya sale con su proporción correcta, y el tamaño resultante ya no intercambia el ancho con el alto en
  las fotografías giradas un cuarto de vuelta.

**Se podía subir una imagen con el nombre y el tipo equivocados**

- Algunos navegadores, al solicitarles una copia comprimida, devuelven otro formato sin indicarlo.
- Las copias se subían con la extensión y el tipo solicitados y no con los reales, de modo que el
  catálogo podía contener ficheros cuyo nombre no corresponde a su contenido.
- Ahora el formato se comprueba en los bytes del fichero antes de subirlo.

---

## 1 de agosto de 2026

### Interfaz

**La fotografía abierta figura en la dirección de la página**

- Al abrir una fotografía para editarla, su código aparece en la dirección:
  `/artwork/TS-0005/photos/TS-0005_v2`.
- Recargar no la pierde, y el enlace se puede guardar o enviar y abre esa misma fotografía.
- Si el enlace nombra una fotografía retirada, se abre la principal.

**Ampliar la fotografía para colocar las esquinas, y desplazar la vista previa**

- Se puede ampliar con dos dedos, o con la rueda del ratón. Con dos toques vuelve al tamaño completo.
- Las asas mantienen su tamaño aunque la fotografía se amplíe, de modo que no ocultan la esquina que
  colocan.
- La fotografía se desplaza arrastrándola desde cualquier punto que no sea un asa, incluida la zona
  recortada: ampliada sobre una esquina, esa zona ocupa la pantalla completa.
- El recuadro del recorte incorpora un asa central que lo desplaza entero y que también responde a las
  flechas del teclado.

**La botonera del editor, reorganizada**

- El encuadre pasa a ser un único selector de tres posiciones: sin recorte, rectángulo o perspectiva.
- Antes había dos interruptores para una sola decisión, en filas distintas y con otro botón intercalado,
  cada uno con un texto que cambiaba al pulsarlo.
- Las seis herramientas —los dos giros, las tres del encuadre y la sugerencia— ocupan una sola fila de
  iconos.
- La ayuda es una sola línea que empieza nombrando el encuadre aplicado.
- «Deshacer la sugerencia» aparece solo cuando hay una sugerencia que deshacer.
- La fotografía gana 264 píxeles al recortar y 296 al corregir perspectiva: pasa de ocupar un tercio de
  la pantalla a casi tres cuartos. La botonera ya no cambia de tamaño al cambiar de modo.
- Los botones van centrados como bloque. En el ordenador, antes los iconos quedaban en una esquina
  mientras «Aplicar» se extendía hasta la contraria.

**«Volver al original» es visible y ya no duplica otro botón**

- Tiene fila propia, color ámbar e icono, encima de Cancelar y Aplicar. Antes estaba en gris, entre dos
  párrafos de ayuda.
- No es blanco, que es el color de «Aplicar», el único botón que confirma y cierra.
- Aparece solo cuando hay un giro que deshacer, que es lo único que elimina y el selector no.
- Sobre la copia de consulta sigue apareciendo desactivado, porque ahí no es una acción sino la
  explicación de por qué no se puede.

**El gesto de ampliar tiene prioridad sobre las asas**

- Al ampliar sobre una esquina, el dedo que caía sobre el asa la arrastraba.
- Ahora, en cuanto aparece el segundo dedo, el gesto pasa a ser una ampliación y el asa se mantiene,
  aunque el arrastre ya hubiera empezado.
- La vista previa del resultado se arrastra a la posición deseada y se mantiene ahí: antes se recolocaba
  sola cada vez que se seleccionaba otra esquina.

**Enderezar una fotografía tomada en ángulo**

- Un cuadro fotografiado de lado sale como un trapecio, y recortarlo con un rectángulo deja pared en dos
  esquinas y recorta obra en las otras dos. Ocho de cada catorce obras del catálogo están así.
- Con «Corregir perspectiva» se arrastran las cuatro esquinas de la obra y, al lado, se muestra en todo
  momento el resultado enderezado.
- Lo que se guarda son las cuatro esquinas y no la imagen transformada, de modo que se pueden volver a
  mover en cualquier momento y el original no se modifica.
- Si una esquina de la obra queda fuera de la fotografía, el asa se puede arrastrar más allá del borde;
  esa zona saldrá en blanco, de lo que el editor avisa.
- Si se arrastra una esquina por encima de su vecina, el editor no lo permite, porque el resultado sería
  una imagen plegada sobre sí misma.
- No se ofrece cuando se trabaja sobre la copia de consulta: enderezar una imagen ya enderezada la
  deformaría, y el botón lo indica en lugar de fallar después.
- Pedir la sugerencia ya no sustituye de forma irreversible el recorte hecho a mano: hay un botón para
  recuperarlo.

**La sugerencia de recorte acierta más y no propone cuando no puede**

- Antes proponía recorte en 36 de 44 fotografías y solo cuatro propuestas eran correctas: dieciséis
  recortaban donde no corresponde y otras dieciséis proponían casi la fotografía completa.
- Ahora propone en dieciséis y ninguna es incorrecta.
- No infiere los lados que no aparecen en la fotografía, que era el origen de los recortes que abarcaban
  toda la imagen.
- Comprueba que cada lado sea una línea y no una banda de pintura o el borde de una captura de pantalla.
- No requiere que el cuadro esté de frente: cada lado se ajusta con su inclinación, de modo que las
  fotografías tomadas en ángulo pasan a funcionar. En el peor caso coincide en un 97 % con el recorte
  manual.
- En el reverso de un lienzo, en un detalle de firma o en un detalle de daño no se ofrece, y el botón lo
  indica.
- Cuando no propone nada, el mensaje indica qué hacer —«arrastra las esquinas»— en lugar de anunciar un
  error.

**La ubicación se elige de una lista de sitios, y se puede corregir de una vez**

- Deja de ser un texto que hay que escribir igual cada vez: se elige de una lista con los sitios sangrados
  por niveles y un buscador en la parte superior.
- Cada coma que se escribe abre un nivel dentro del anterior y crea lo que falte.
- Si el nombre contiene una coma —como una dirección postal— hay un botón que la admite como parte del
  nombre.
- «Sin ubicación» es una opción más de la lista, porque una obra sin sitio registrado es una respuesta
  válida.
- Los nombres se escriben con sus mayúsculas y sus tildes.
- Hay una pantalla propia de ubicaciones, en «Tablas», para crear, renombrar, mover y retirar sitios.
- Corregir «museo de bellas artes de badajoz muba» es una sola edición que reflejan todas sus obras.
- Mover una estantería desplaza todo su contenido.

**El filtro de ubicación busca por sitio y no por el texto escrito**

- Sigue incluyendo todo lo que contiene un sitio, a cualquier profundidad, pero se apoya en la lista de
  sitios y no en la comparación de textos.
- Se puede filtrar por «Sin ubicación» para localizar las obras pendientes de colocar.
- Renombrar un sitio ya no invalida un enlace guardado o compartido. Los enlaces anteriores se traducen
  al abrirlos.

**Los tipos de obra y las series se mantienen desde «Tablas»**

- La sección incorpora sus tres listas: ubicaciones, tipos de obra y series.
- En las dos nuevas se puede crear una entrada, corregir su nombre y retirar la que ya no se use.
- Corregir un nombre es una sola edición: cambiar «Tecnica mixta» por «Técnica mixta» se refleja de
  inmediato en todas las obras y en el filtro del listado.
- Los tipos y las series se siguen añadiendo desde el formulario de la ficha, que es donde hacen falta con
  la obra delante; lo que no se podía hacer era corregirlos.
- Cada serie aparece bajo el fondo al que pertenece, y al crear una hay que elegir el fondo: los dos
  fondos pueden tener una serie con el mismo nombre y son series distintas.
- El fondo de una serie ya creada no se cambia, porque dejaría sus obras en un fondo que no les
  corresponde; para eso se mueven las obras.
- Los fondos no se modifican desde aquí: su nombre forma parte del identificador de cada obra.
- Nada se borra: lo retirado deja de ofrecerse al catalogar y al filtrar, sigue visible atenuado y se
  recupera con un botón.
- Un tipo o una serie con obras asignadas no se puede retirar, y la aplicación indica qué hay que hacer
  antes.
- Escribir en «Añadir» un nombre existente no lo duplica, aunque varíen mayúsculas o tildes, y escribir
  uno retirado lo recupera.

**El teclado se aplica a la galería a pantalla completa**

- Con una fotografía abierta a pantalla completa, las flechas pasan entre las fotografías de la obra y no
  entre obras.
- La tecla «f» abre y cierra la pantalla completa, y el atajo se indica al situar el ratón sobre el
  icono.
- En el móvil no cambia nada.

### Diseño lógico de la aplicación y esquema de datos

**La ubicación física pasa a ser un árbol de lugares**

- Hasta ahora era un texto copiado en cada obra, en minúsculas, sin tildes y con los niveles separados
  por comas.
- Con veintiuna obras catalogadas quedó claro que no se sostiene: los nombres de museos y ciudades
  necesitan sus mayúsculas y sus tildes, la coma aparece dentro de los valores, y renombrar un sitio
  obligaba a modificar todas sus obras.
- Los sitios pasan a ser una lista jerárquica con identidad propia: renombrar un lugar, o mover una
  estantería con su contenido, se hace una vez y se refleja en todas las obras.
- La base de datos garantiza que no haya dos sitios hermanos con el mismo nombre, que la jerarquía no
  admita ciclos y que no se pueda retirar un lugar que contenga obras u otros sitios.
- De aquí sale un criterio general: el nombre de una lista maestra no es su identidad, de modo que
  renombrar una entrada no vuelve a ser una conversión de datos.

**Los sitios existentes se han convertido, y ninguna obra se ha quedado sin ubicación**

- Los textos de las diecisiete obras que tenían uno se han dividido por sus comas y han producido ocho
  sitios, dos de ellos dentro de otro.
- Los nombres han entrado tal como estaban guardados, en minúsculas y sin tildes, y se corrigen desde la
  pantalla de ubicaciones una vez por sitio.
- Un valor de prueba no se ha convertido: la obra que lo llevaba se ha quedado sin ubicación.
- La conversión no ha modificado la traza de quién editó cada obra ni la fecha del último examen, porque
  trasladar un dato no equivale a haber tenido la pieza delante. Cambiar una obra de sitio sí actualiza
  la fecha.

**Los museos y las colecciones son lugares provisionales**

- Seis de las veintiuna obras están en manos de terceros, y eso se escribe dentro del nombre del lugar,
  incluida la propiedad.
- Entran en el árbol como sitios de forma provisional: cuando existan el estatus legal, el titular de
  derechos y la tabla de Propietarios e Instituciones que el esquema prevé, dejarán de ser lugares.

**Las tablas que el catálogo todavía no tenía a esa fecha**

- Existen las obras con los datos que se rellenan con la pieza delante, las fotografías, las cuentas con
  su rol y las listas de tipos de obra, series y lugares.
- Quedan por construir Exposiciones, Bibliografía, sus dos tablas de enlace, Propietarios e
  Instituciones, y Archivo y Documentación.
- Con ellas, la pantalla de papelera y el bloqueo de edición que evitará que dos personas trabajen a la
  vez sobre la misma ficha.

---

### La base de datos del catálogo

**Los tipos de obra y las series se pueden renombrar sin modificar las obras**

- Hasta ahora el nombre era su identidad, de modo que corregirlo obligaba a reescribir todas las obras
  que lo usaran, y por eso no podía hacerse desde la aplicación.
- Ahora cada uno tiene identidad propia y el nombre es un dato más.
- Se añade la posibilidad de retirar un tipo o una serie en desuso, sin borrarlos, con la misma regla que
  los lugares: no se retira lo que todavía tiene obras asignadas.

**Sin haber iniciado sesión no se accede a nada**

- La primera versión no cerró las operaciones internas de la base de datos como se pretendía: la
  instrucción retiraba el permiso a quien no ha iniciado sesión, pero quien lo tenía era el grupo
  general, del que los demás son miembros.
- No había datos expuestos, pero sí una operación de escritura lanzable sin sesión.
- Ahora los permisos se retiran y se conceden uno a uno, lo que se cree en el futuro nace cerrado, y lo
  verifica una prueba automática.

**Preparado el rechazo de contraseñas de filtraciones conocidas**

- El único perímetro delante del catálogo es la contraseña de cada cuenta.
- Queda configurado el mecanismo que rechaza las que aparecen en filtraciones públicas.
- Está desactivado porque requiere un plan de pago: al ampliarlo se activa modificando una línea.

**Una copia del catálogo real para investigar incidencias**

- Un comando trae las filas y, opcionalmente, las fotografías, y las carga en el entorno de trabajo.
- Las contraseñas no se copian.
- La copia no entra en el repositorio, que es público y no puede contener datos personales.

### Correcciones

**La fotografía girada un cuarto de vuelta salía deformada**

- Al girar 90 o 270 grados, el editor la dibujaba con proporciones incorrectas: un cuadro de 4:3 se veía
  casi cuadrado.
- De ahí procedían otros dos síntomas que parecían fallos distintos: el trapecio propuesto no coincidía
  con el cuadro, y la lupa mostraba un punto distinto del que se estaba tocando.
- Las medidas del encuadre eran correctas; la fotografía de fondo no. Ya se dibuja con sus proporciones
  en los cuatro giros.

**La vista previa del enderezado no giraba con la fotografía**

- Seguía mostrando la obra en su orientación original.
- A 90 y 270 grados salía sesgada, porque el enderezado se calculaba con los lados intercambiados.
- Ahora gira con la fotografía y muestra el resultado correcto en los cuatro giros.

**Girar con la perspectiva aplicada dejaba las esquinas sin girar**

- Girar la fotografía desplazaba el recorte, pero no las cuatro esquinas de la corrección de perspectiva,
  que había que rehacer.
- Ahora giran conjuntamente el giro, el recorte, las esquinas y la sugerencia guardada.

---

## 31 de julio de 2026

### Interfaz

**Pasar a la obra siguiente sin volver al listado**

- La ficha se convierte en un recorrido sobre el listado desde el que se ha llegado: las mismas obras, en
  el mismo orden, con los filtros y la búsqueda aplicados.
- Se avanza con las flechas de la cabecera, que indican «12 de 87».
- También con los dos enlaces del final de la ficha, que muestran el código y el título de la obra
  anterior y de la siguiente.
- Y arrastrando de lado con el dedo o con el ratón.
- La secuencia se fija al abrir la ficha, para que editar la obra no altere su posición durante el
  recorrido.

**Un listado buscado se puede compartir y se recupera con «atrás»**

- El texto buscado pasa a formar parte de la dirección de la página, igual que los filtros y el orden.
- No se conserva de un día para otro: recuperar al día siguiente lo que alguien buscó una vez reduciría
  el catálogo sin que nadie lo haya pedido.

---

## 29 de julio de 2026

### Interfaz

**Girar y recortar una fotografía, con sugerencia de recorte**

- Editor a pantalla completa con asas en las cuatro esquinas.
- Una lupa amplía la esquina que se está ajustando, porque el dedo oculta el punto que se quiere
  precisar.
- «Sugerir recorte» localiza los bordes del cuadro y, cuando distingue el marco de la tela, ofrece elegir
  entre «Hasta el marco» y «Solo la obra».
- No aplica nada por su cuenta, y si lo que detecta no parece un cuadro no propone nada.
- Funciona con las tomas recién hechas y con las que ya están en una ficha, y siempre se puede volver al
  fotograma original completo.

**Ordenar las fotografías de una obra**

- Dejan de mostrarse por orden de subida y pasan a tener el orden que se les asigne, arrastrándolas por
  un asa de la miniatura.
- El panel de cada fotografía permite además moverla antes o después, para que el gesto no sea la única
  forma de acceder a la función.

### Diseño lógico de la aplicación y esquema de datos

**El giro y el recorte de una fotografía son un dato, no un fichero nuevo**

- Se guardan cuatro números en la fila de la fotografía: el cuarto de vuelta y el rectángulo del recorte.
- El original de archivo no se modifica, de modo que el fotograma completo se puede recuperar en
  cualquier momento.
- El catálogo impreso podrá rehacer sus copias con el mismo encuadre.
- Reeditar una fotografía escribe copias nuevas en lugar de sobrescribir las anteriores.

**La serie es una lista controlada, y cada fondo tiene la suya**

- Un artista trabaja por series y el catálogo agrupa por ellas, de modo que el nombre debe escribirse
  siempre igual: dos ortografías de una serie son dos series que no se pueden agrupar.
- Es una lista abierta, que se amplía desde la propia captura.
- El fondo forma parte de la identidad de la serie: ofrecer una serie de Rotili al catalogar a Ruiz
  Campins facilitaría un dato erróneo.
- Una obra puede no pertenecer a ninguna, y eso no es un dato pendiente.

### Correcciones

**Cambiar la fotografía principal fallaba en ocasiones**

- La operación marcaba la nueva y desmarcaba la anterior en un solo movimiento, suponiendo que la base de
  datos comprobaría al final que no hubiera dos; la comprobación se hace fila a fila.
- Que fallara dependía del orden interno de las filas, lo que hacía parecer que la causa era el recorte.
- Ahora se desmarca primero, y ambas siguen siendo una sola operación.

**Tras recortar una fotografía seguía viéndose el recorte anterior**

- La galería identificaba las imágenes por su identificador, que no cambia al reencuadrar, de modo que la
  copia anterior permanecía en pantalla hasta recargar la página.
- Ahora las identifica por su fichero.

**La fotografía no aparecía en la ficha en PDF**

- La caché del navegador para las miniaturas interceptaba también la lectura de los píxeles que necesita
  la ficha impresa, y devolvía un contenido ilegible.

**Arrastrar las miniaturas no funcionaba con el dedo**

- Recoger la miniatura manteniéndola pulsada no puede funcionar: el navegador decide al iniciarse el
  toque si el gesto le corresponde, y cuando termina la espera ya lo ha interpretado como desplazamiento
  de la página.
- Ahora se arrastra desde un asa en la esquina, y el desplazamiento de la página sigue funcionando en el
  resto de la superficie.

**Mantener pulsado el selector de años dejó de repetir en el móvil**

- El navegador interpretaba la pulsación sostenida como un gesto propio y cancelaba la repetición.
- Además, ahora acelera a partir de segundo y medio.

---

## 28 de julio de 2026

### Interfaz

**Las medidas se escriben y se leen en español**

- El decimal se teclea con coma. Antes la coma se borraba antes de llegar el siguiente dígito.
- El «cm» figura dentro del campo, tanto en la captura como en la ficha.

**Editar la ficha es una pantalla propia**

- La edición tiene su propia dirección, de modo que sobrevive a una recarga.
- El botón «atrás» del móvil sale del formulario y no de la ficha.
- Un Lector que llegue a ella por un enlace accede a la vista de consulta.

**El título y la respuesta sobre su autoría se rellenan juntos**

- El formulario ofrece solo los estados coherentes con lo escrito, en forma de tarjetas con su icono y su
  explicación, y avisa al cambiar de uno a otro.
- Con el campo vacío caben «Sin revisar» y «No consta título».
- Con un título escrito, «Del artista», «Atribuido» y «Sin confirmar».

### Diseño lógico de la aplicación y esquema de datos

**La autoría del título tiene cinco respuestas, no tres**

- «Sin revisar» cubría dos situaciones: el título pendiente de investigar y el título ya escrito cuya
  autoría nadie ha verificado.
- La segunda pasa a ser un estado propio, «Sin confirmar», y los datos existentes se convirtieron.
- La base de datos impide desde entonces que el título y la respuesta sobre su autoría se contradigan.

**El tipo de obra procede de una lista, no de un campo de texto**

- Hay un catálogo de tipos que se amplía desde el propio formulario.
- La base de datos comprueba que el valor guardado pertenezca a él.
- Puede quedar vacío, que sigue siendo una respuesta válida.

**El código interno pasa a inglés, conservando lo que ya está publicado**

- Cambio interno que no altera lo que se ve: los textos de la aplicación siguen en español.
- Los QR pegados en las obras siguen funcionando, los identificadores AR-, RC- y TS- no se modifican y un
  lote de captura abierto sobrevive a la actualización.
- El único coste, asumido y registrado: la cola de fotografías pendientes de subir se perdió una vez con
  el cambio.

### Correcciones

**Los códigos QR impresos devolvían un error**

- Al alojamiento le faltaba una regla, y cualquier dirección distinta de la portada respondía «no
  encontrado» a quien entrara desde fuera de la aplicación instalada, incluidos los QR pegados en las
  obras.

**En el fondo de pruebas no se podía subir ninguna fotografía**

- El fondo de ensayo se añadió con su prefijo TS-, pero el prefijo no llegó a los nombres de las imágenes
  ni al permiso de subida de los originales.
- En una ficha TS- la subida se rechazaba por completo, tanto al crear como al editar.

**Deslizar en la galería dejaba la fotografía oscilando**

- Con la galería y el visor a pantalla completa abiertos sobre la misma selección, cada uno deshacía el
  movimiento del otro de forma indefinida.
- Ahora cada uno ignora los ecos de su propio desplazamiento, y un toque recupera el control.

---

## 27 de julio de 2026

### Diseño lógico de la aplicación y esquema de datos

**La fecha de ejecución se guarda estructurada**

- En lugar de un texto, la ficha guarda el año de inicio, el de fin, las dos marcas y una nota.
- El texto que se publica lo compone la base de datos y no se puede escribir a mano, de modo que el texto
  y los datos no pueden contradecirse.
- «Obra de los setenta» pasa a ser una consulta efectiva.
- Lo que alguien escribió a mano y no encaja en ningún formato se conserva íntegro.

**Un fondo de pruebas para practicar sin alterar el catálogo**

- Las fichas de ensayo van a un fondo aparte, con identificadores de prefijo TS-.
- Probar la aplicación no introduce filas falsas entre las obras de Rotili y de Ruiz Campins.

### Correcciones

**El formulario de acceso quedaba oculto por el teclado**

- Estaba centrado en la pantalla. Anclado arriba, los campos permanecen visibles mientras se teclea.

---

## 26 de julio de 2026

### Interfaz

**Primera entrega: listado, captura rápida y ficha**

- El listado ordena por la fecha de la obra y toda la tarjeta es pulsable, porque apuntar con el pulgar a
  un código de doce caracteres no es viable.
- Una búsqueda sin resultados devuelve la misma página con el mensaje correspondiente, nunca un listado
  vacío.
- La captura está pensada para rellenarse de pie, con una mano y con la obra delante: teclado numérico en
  las medidas y las tres dimensiones en una fila.
- Si el guardado falla, el formulario no se vacía.

---

### Correcciones

**Subir una fotografía fallaba desde el móvil y funcionaba desde el ordenador**

- La aplicación usaba una función del navegador que no está disponible cuando la página se abre sin
  cifrado, que es como se abría en la red local para probar con el teléfono.
- Las pruebas anteriores se hacían por otra dirección, lo que ocultaba el problema.

**Las fotografías hechas antes de guardar se perdían al volver a la aplicación**

- La cámara acumulaba las tomas correctamente, pero la cola vivía solo en memoria, y al abrir la cámara
  el sistema puede descartar la página por falta de memoria.
- Ahora la cola se guarda en el dispositivo en cuanto cambia, porque el descarte no se anuncia.

**«No entra» dejó de ser el mismo mensaje para dos situaciones distintas**

- Un fallo de red y una contraseña incorrecta producían el mismo aviso, lo que impidió diagnosticar un
  problema real: la aplicación llamaba a una dirección que en el móvil no existía.
- Ahora, cuando el servidor no responde, se indica a qué dirección se estaba llamando.
- El mensaje de credenciales sigue siendo genérico de forma deliberada: distinguir «no existe esa cuenta»
  de «contraseña incorrecta» permitiría averiguar quién tiene acceso.

---

## Julio de 2026

### Interfaz

**Buscar y filtrar el listado desde la cabecera**

- La caja de búsqueda está en la cabecera fija, y a su lado un botón de filtros con el número de
  criterios activos.
- Abre una sola hoja con todo: orden, fondo, tipo de obra, serie, ubicación y estado.
- Fondo, tipo, serie y ubicación admiten varias marcas simultáneas.
- Las listas largas incluyen su propio buscador, que encuentra por letras salteadas y subraya las
  coincidencias.
- La ubicación busca por niveles: elegir «edificio a» incluye todo su contenido.
- «Sin serie» encabeza el filtro de series, porque las obras que todavía no tienen serie son las que
  interesa localizar.

**El listado abre de inmediato, con sus miniaturas**

- Cada obra se muestra con la fotografía que la representa.
- El catálogo se guarda en el propio dispositivo, de modo que filtrar, ordenar y buscar son inmediatos.
- Al volver al listado se muestra sin espera, y las miniaturas ya descargadas no se vuelven a solicitar.
- La búsqueda no distingue tildes.
- Lo guardado se borra al cerrar sesión, porque el dispositivo puede ser compartido.

**Las fotografías de una ficha tienen su propia pantalla**

- La ficha queda para la consulta: fotografía grande, tira de miniaturas con la etiqueta del tipo de toma
  —reverso, detalle de firma— y descarga del original de archivo.
- La descarga también puede realizarla un Lector, porque enviar el original a una imprenta o a un
  comisario es una de sus funciones.
- Todo lo que modifica las fotografías está en una pantalla aparte, accesible desde el botón de la
  cabecera.
- La fotografía grande se pasa deslizando y se abre a pantalla completa al tocarla.
- El botón «atrás» del móvil cierra el visor en lugar de salir de la ficha.

**Varias fotografías por obra, sin pérdidas**

- Se puede hacer una fotografía con la cámara, elegir ficheros del dispositivo o arrastrarlos desde el
  escritorio.
- El botón «+» reabre la última vía utilizada.
- Cada toma se prepara en el propio móvil en tres tamaños antes de subirla, y se suben una a una al
  guardar.
- Si alguna falla, la ficha no se pierde ni se duplica, y el botón reintenta solo las que faltan.
- Al añadir una fotografía se abre su panel, porque el paso siguiente es indicar de qué es la toma o
  enderezarla.
- Se pueden añadir y retirar fotografías después del alta, y elegir cuál representa a la obra.

**Ficha imprimible en PDF, con fotografía y código QR**

- Una hoja A5 con los datos de la obra, su serie, su fotografía y un QR que lleva a la ficha en línea.
- Sin fotografía, o si su descarga falla, la hoja se genera igualmente con el aviso «Imagen no
  disponible».

**Los cambios de otras personas aparecen sin recargar**

- El listado, la ficha y la galería se actualizan solos.
- Un formulario que se está rellenando no se actualiza nunca, para no sobrescribir un borrador a medio
  escribir.

**Tipo de obra y serie se eligen de una lista**

- Ambos proceden de una lista compartida, con buscador que no distingue tildes.
- Se puede añadir un valor nuevo desde el propio formulario.
- Evita que la misma serie acabe escrita de dos formas y deje de poder agruparse.
- La serie se fija para todo un lote de captura, porque un lote suele corresponder a una serie.

**La fecha de ejecución se compone con botones, sin abrir el teclado**

- Los botones de año repiten al mantenerlos pulsados y aceleran a partir de segundo y medio.
- Tres interruptores cubren lo que la fecha necesita expresar: «Aproximada», «Rango» y «Sin confirmar».
- Debajo se muestra en todo momento cómo quedará escrita.
- También se puede teclear: lo escrito se interpreta, y lo que no encaja en ningún formato, como «finales
  de los setenta», se conserva tal cual.

**Catalogar una estantería en una sola sesión**

- La captura trabaja por lotes: el fondo, el tipo de obra y la serie quedan fijos.
- La fecha, la técnica y la ubicación se arrastran de una obra a la siguiente y se ajustan cuando
  cambian.
- El título y las medidas no se heredan nunca, porque supondría inventar datos de una obra a partir de
  otra.
- El lote sobrevive al bloqueo de pantalla o a una llamada entrante.
- En los campos de ubicación se sugieren los sitios ya usados en el catálogo, localizándolos por letras
  salteadas.

**Todo al alcance del pulgar**

- La acción principal de cada pantalla está en la cabecera fija y «Guardar» en una barra fija inferior.
- El aviso de resultado aparece junto al botón pulsado, incluido el «Guardada como AR-XXXX» que hay que
  escribir en la etiqueta.
- Los formularios se dividen en grupos con nombre que indican qué se vacía al guardar y qué se hereda.
- Todo selector es una rejilla de botones del mismo tamaño, ninguno inferior a los 44 píxeles que
  requiere un dedo.
- En el pie hay pestañas fijas de «Obras» y «Mi perfil», más «Añadir» para quien pueda catalogar.

**Entrar, recuperar la contraseña e instalar la aplicación**

- Se instala en el móvil desde «Mi perfil», que además permite cambiar la contraseña e indica qué versión
  está en uso a cada lado.
- Si se olvida la contraseña, llega un enlace por correo para restablecerla.
- Cuando se publica una versión nueva, la aplicación se recarga sola.
- Cerrar sesión requiere confirmación en dos toques, porque hacerlo por accidente obliga a volver a
  entrar desde un almacén con mala cobertura.

### Diseño lógico de la aplicación y esquema de datos

**Qué fotografía representa a cada obra**

- La regla está en la base de datos y no en la pantalla: la elegida manualmente; si no hay ninguna, la
  general más reciente; y si tampoco hay generales, la más reciente de cualquier tipo.
- La fotografía de un reverso es mejor referencia que un hueco.
- Está definida en un solo lugar porque el catálogo impreso la necesitará, y dos versiones de la misma
  regla acabarían mostrando fotografías distintas de la misma obra.
- Cuando la ha elegido la regla y no una persona, la ficha lo indica y ofrece fijarla.

**Cada toma se guarda en tres tamaños**

- Miniatura para los listados, copia de consulta para ver la obra en pantalla y original de archivo, que
  es el documento.
- Los tres proceden de la misma toma y se guardan en la misma fila, de modo que una fotografía no pueda
  perder su miniatura sin aviso.
- Las dos copias pequeñas se generan en el móvil antes de subir, porque una fotografía de móvil ocupa
  entre 4 y 12 MB y subirla tres veces desde un almacén con mala cobertura no es viable.
- El original va a un almacén de archivo aparte porque, a 2-8 MB por toma, el espacio incluido en la
  plataforma se agotaría en las primeras semanas de trabajo de campo.

**Cómo se numeran las obras**

- El identificador lo asigna la base de datos, con un bloqueo por fondo, y no una numeración automática.
- El motivo es editorial: una numeración automática deja huecos cuando una operación se deshace a medias,
  y un salto sin explicación en un catálogo razonado genera una pregunta difícil de responder años
  después.

**«Sin revisar» no es «no»**

- Los campos de sí o no del inventario nacen en «Sin revisar» y no en «No».
- Permite distinguir el dato pendiente de investigar del investigado sin resultado y del dudoso.
- Es el mismo criterio que el «[?]» de la fecha y que los corchetes de «[Sin título]», que separan una
  obra sin titular de una que el artista tituló literalmente «Sin título».

**Dónde está la aplicación, y qué es público**

- Es una web instalable en el móvil, sin servidor propio.
- No funciona sin conexión por decisión explícita: un dato de catálogo desactualizado mostrado como
  actual es peor que no mostrar nada.
- Tiene dirección propia, `catalogo.ruizcampins.com`. Se cambió el alojamiento previsto al comprobar que
  estaba bloqueado desde España.
- El código de la herramienta es público y libre; las obras del catálogo no forman parte de esa licencia
  y siguen protegidas por contraseña.

**Cada regla del catálogo tiene un nombre, y una prueba que la cita**

- Antes de escribir la aplicación se redactaron dos documentos: uno que enumera qué tiene que hacer el
  catalogador, con un identificador por requisito, y otro que indica qué prueba verifica cada uno.
- Permiten detectar un requisito sin comprobar en lugar de darlo por hecho.

### La base de datos del catálogo

**Reglas que la base de datos impone y la pantalla no puede eludir**

- El identificador de catalogación y el fondo de una obra no se pueden cambiar una vez creada la ficha.
- Los años de la fecha tienen que ser plausibles y el año final no puede ser anterior al inicial.
- El título y la respuesta sobre su autoría no pueden contradecirse.
- Una serie solo se acepta si pertenece al fondo de la obra, y un tipo de obra solo si está en la lista.
- Una obra no puede tener dos fotografías principales ni quedarse sin ninguna si el cambio se interrumpe.
- La marca de «fotografiada» se recalcula al añadir o retirar fotografías.
- La fecha de última revisión con la obra delante solo se actualiza cuando cambia un dato que exige
  tenerla delante.

**Nada se borra**

- No existe permiso de borrado para ningún rol, tampoco para el Superusuario.
- Retirar una obra o una fotografía es una baja lógica con la traza de quién y cuándo.
- El aviso de retirar una fotografía indica que el fichero se conserva, porque es cierto y porque puede
  cambiar la decisión.

**El original de archivo está protegido por partida doble**

- Los originales se guardan en un almacén distinto del que sirve la aplicación, con todas las versiones
  conservadas.
- Las credenciales con las que la aplicación firma las subidas no tienen capacidad de borrado: aunque se
  vieran comprometidas, con ellas no se puede destruir un original.
- Para una obra destruida o perdida, la fotografía es la única prueba de que existió.

**Tres roles, y el permiso lo comprueba la base de datos**

- Superusuario, Catalogador y Lector.
- Al no haber servidor propio, quien decide qué puede ver y modificar cada uno es la base de datos.
- Sus reglas se comprueban iniciando sesión con una cuenta de cada rol y consultando el catálogo; no
  basta con verificar que la regla está escrita.
- Esas pruebas son condición de cada publicación: si una falla, no se publica.
- Dos de ellas están diseñadas para fallar si alguien crea una tabla sin sus permisos, que es la forma de
  exponer datos de manera involuntaria en este montaje.

---

### Correcciones

**Correcciones de julio y agosto que no se aprecian desde la aplicación**

- El entorno local no concedía los permisos necesarios para subir una fotografía.
- Una publicación fallaba y se revertía al intentar renombrar elementos que la plataforma no permite
  renombrar.
- Se han actualizado las librerías con avisos de seguridad abiertos.

---

---

## En marcha

**El dossier, decidido y sin construir**

- Está decidido cómo va a funcionar armar un dossier: se eligen las obras, se ponen en el orden que se
  quiera, cada una puede llevar su nota y su precio, y se genera un PDF para mandar.
- El precio es del dossier y no de la obra: el catálogo no dice lo que vale nada, y la misma obra puede
  ofrecerse distinto en dos galerías.
- Cada PDF que se genera queda guardado con su fecha, así que dentro de un año se puede ver qué se mandó
  exactamente. Y volver a generarlo coge los datos del día, de modo que corregir una medida en la ficha
  corrige el dossier.
- Todavía no hay nada de esto en la aplicación.

**La copia a tamaño completo, sin comprobar de extremo a extremo**

- El permiso que impedía guardarla ya está habilitado, y la descarga ya funciona.
- Falta comprobar el circuito completo con una fotografía real: corregir en el móvil, guardar la copia y
  descargarla. Todavía no hay ninguna copia guardada en el catálogo.
- Mientras tanto, cada fotografía indica en qué estado está la suya.

**El color, sin probar en un teléfono real**

- Está verificado con ochocientas sesenta y ocho pruebas automáticas, con los cálculos comprobados dos
  veces —en la aplicación y en la herramienta de escritorio— contra un fichero de casos común.
- Falta usarlo con un móvil en la mano y una obra delante.
- Solo así se puede comprobar que arrastrar un control resulta fluido, que el toque del cuentagotas no se
  confunde con desplazar la fotografía, que los controles caben en una pantalla estrecha y que la
  corrección que se ve en pantalla es la que se guarda.

**Los fondos, como lista y no como valores fijos**

- Las nueve listas del catálogo ya se corrigen y se amplían desde la aplicación.
- Los dos fondos —Rotili y Ruiz Campins— siguen siendo valores fijos escritos en el programa, porque de
  ellos depende el prefijo del código de catalogación adherido a cada obra.
- Convertirlos requiere especial cuidado por ese motivo.

**Dar de alta una referencia bibliográfica sin citarla desde una obra**

- La bibliografía y el archivo tienen ya su listado y su ficha, los datos de un documento se corrigen y
  se le añade el escaneo que falte, y el catálogo de una exposición se indica desde la ficha de la
  muestra.
- Lo que sigue sin poder hacerse es registrar una publicación que todavía no cita ninguna obra: una
  referencia se crea al citarla.

**Las exposiciones y la papelera, sin probar con datos reales**

- Ambas pantallas están comprobadas con un navegador y con las dos cuentas.
- No se ha realizado el recorrido completo con una exposición real —darla de alta, abrirla, corregirla,
  retirarla, recuperarla y enlazarla desde el historial expositivo de una obra— porque la base local
  contiene los datos reales del catálogo y una exposición de prueba quedaría dentro.
- De la papelera falta comprobarla con más de los siete elementos retirados actuales, que es cuando se
  sabrá si hace falta filtrar por fecha o por quién retiró. Por ahora agrupa por tipo y no filtra.

**La quinta pestaña, sin probar en la mano**

- El menú inferior tiene cinco pestañas y las etiquetas han reducido un punto de tamaño para que
  «Exposiciones» quepa completa.
- Está medido en pantalla pero no probado en uso.
- Falta comprobar que la quinta se acierte sin pulsar la contigua, que las etiquetas más pequeñas se lean
  con sol y con guantes, y que el icono de los dos cuadros colgados se distinga del de la cuadrícula de
  obras.
