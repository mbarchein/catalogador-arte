# Qué hacen otros catálogos razonados, y qué nos falta

Estudio comparativo entre la práctica establecida de los catálogos razonados —impresos y digitales— y
lo que esta aplicación guarda hoy. No es una lista de deseos: cada hueco viene con **qué se pierde si
no se hace** y **cuánto cuesta**, y hay un apartado final con lo que conviene **no** hacer, que en un
proyecto de dos artistas y tres personas es igual de importante.

## Cómo se hizo, y qué se leyó

Investigación hecha el 15 de agosto de 2026. La red de este entorno bloquea la descarga de páginas, así
que la primera versión de este documento se construyó sobre resúmenes de búsqueda. Después se leyeron
enteras las dos fuentes normativas que más pesaban, y este documento está revisado contra ellas:

- **Authentication in Art, *Guidelines for compiling a catalogue raisonné*** (La Haya, 2014; 12
  páginas). Es la guía de referencia del oficio: qué recoger, cómo estructurarlo y qué debe llevar cada
  entrada. **Leída completa.**
- **CMOA / Art Tracks, *Digital Provenance Standard* v0.2.** La gramática de la procedencia, escrita
  como especificación. **Leída completa.**

Siguen sin leer, y lo que se apoya solo en ellas se dice donde toca: el artículo de *Panorama* sobre
catálogos digitales, el manual *Cataloging Cultural Objects*, CDWA de Getty y las guías de los
catálogos de Lichtenstein y Guston.

El inventario de lo nuestro está medido: sale de consultar el esquema aplicado, tabla a tabla y
enumerado a enumerado.

## 1. Qué pide un catálogo razonado

Un catálogo razonado registra **todas las obras conocidas de un artista** con lo que permite
identificarlas y seguir su historia. La guía de Authentication in Art lo concreta en **nueve rúbricas
por entrada**, y conviene leerlas como lista de comprobación:

1. **Número de catálogo** — incluyendo *el número que le puso el propio artista* y *el que llevó en
   catálogos razonados anteriores*.
2. **Título**, diciendo **en qué se basa** (título del artista, título de la primera exposición, título
   inscrito, título del museo), con los títulos alternativos y **el título en su lengua original**.
3. **Dónde está hoy y de quién es**, con la línea de crédito que el propietario haya pedido.
4. **Datos técnicos**: técnica, soporte, medidas, firma, fechas **y las demás inscripciones —las de
   mano del artista y las añadidas después—**.
5. **Imagen**, anverso y, cuando informa, reverso.
6. **Procedencia**, con estructura fija y **respaldada por referencias**.
7. **Referencias**: exposiciones, bibliografía, tesis inéditas e informes no publicados.
8. **Estado de conservación e investigación técnica**.
9. **Comentario**, solo si hace falta.

Y cuatro cosas que la práctica da por hechas:

- **La atribución es un juicio y se publica como tal.** La guía evita la palabra «autenticidad» y usa
  **«autoría»**, que es más objetiva, y ordena las obras en una lista diferenciada: aceptadas, en
  colaboración, de taller, atribuidas, dudosas, no vistas por el autor, **rechazadas**, conocidas solo
  por fotografía, por estampa de reproducción o por descripción documental. Aparte quedan las llamadas
  *obras muertas*: las que están tan destruidas que no pueden catalogarse como aceptadas sin decirlo.
  La frase que lo resume, y que vale por todo este documento: **«en cada caso, indíquese el grado de
  certeza de la clasificación y el tipo de evidencia con que se sostiene»**. En catálogos de artistas
  modernos y contemporáneos, esas secciones se suelen omitir y solo se publican las obras aceptadas.
- **La procedencia se escribe con una gramática.** Art Tracks la especifica hasta la puntuación: **punto
  y coma cuando la obra pasó directamente de uno a otro, punto cuando no hubo traspaso directo o no
  consta**; el artista abre la cadena; fechas de vida entre corchetes; «posiblemente» cuando lo dudoso
  es el eslabón entero y «?» cuando lo es solo una parte; el lugar de la parte junto a su nombre y el
  de la transacción con «en»; el intermediario con «para» o «de»; el número de lote y el importe entre
  paréntesis; los límites de un intervalo declarados por sus dos extremos, no aproximados a ojo.
- **Lo que no se sabe se dice.** Obras perdidas, destruidas o conocidas solo por una fotografía tienen
  su sitio, y la guía insiste en anotar **qué se sabe, cómo se sabe y qué es solo suposición**.
- **En digital, la autoridad se desplaza del veredicto a la documentación.** Art Tracks lo hace
  estructura: cada entrada lleva secciones separadas de **Notas**, **Autoridades** (ULAN, TGN, VIAF,
  GeoNames) y **Citas**, y cada eslabón de la cadena remite a las suyas con marcas propias.

Art Tracks ordena además los catálogos digitales en **cuatro niveles** según cómo guardan la
procedencia: desde el texto corrido hasta el registro de cada transacción por separado. El nivel 3 —una
fila por traspaso, con sus fechas y sus partes— es el que implementa Art Tracks, y es donde estamos.

## 2. Qué tenemos ya

Medido contra el esquema, esto está construido y funcionando:

| Lo que pide la práctica | Lo nuestro |
|---|---|
| Imagen, y varias por obra | `images` con miniatura, copia de consulta y máster, tipos de toma (general, **reverso**, **detalle de firma**, daño, marco), orden, autor y crédito de la fotografía, fecha del fichero y corrección de color y geometría con su procedencia |
| Título y títulos alternativos | `title` + `attributed_title` con cinco estados |
| Fecha | Fecha estructurada: año inicial y final, aproximada, no confirmada, nota y texto libre |
| Técnica, soporte, medidas | `technique`, `support`, alto/ancho/profundidad y **`measurements_verified`** |
| Firma | `signed` (sí/no/sin revisar) + `signature_description` + `dated_on_artwork` |
| Procedencia | **Cadena de eslabones fechados y ordenados** con calidad (propietario, depósito, préstamo) y forma de adquisición (compra, donación, herencia, encargo, permuta), más un relato narrativo publicable que manda sobre la cadena cuando existe |
| Historial expositivo | `exhibitions` + sedes como entidad + **número de catálogo de esa muestra** por participación |
| Bibliografía | Tabla propia con clave BibTeX, autores, editores, contenedor, tipo, año, editorial y lugar, más páginas por cita |
| Archivo documental | `archive_documents` con clasificación en árbol (fondo, serie, subserie), fichero digitalizado y enlace a obras y a exposiciones |
| Obras perdidas o destruidas | `existence_status`: conservada, destruida, perdida, desconocida, sin revisar |
| Relaciones entre obras | Tabla puente con tipos de relación y sus dos lecturas |
| Trazabilidad | `change_log`: quién cambió qué campo, cuándo, en obras e imágenes, solo-añadir y con candados que paran hasta al dueño de la tabla |

Y cuatro cosas que **hacemos mejor que la media**:

1. **«Sin revisar» no es «no».** El tri-estado sistemático y el `research_status` por bloque
   —procedencia, bibliografía, exposiciones, documentación— distinguen el dato pendiente de
   investigar del investigado sin resultado. Ninguna de las dos guías leídas pide esa distinción, y las
   dos la echarían de menos: es justo la que se pierde entre catalogadores.
2. **La procedencia está en el nivel 3 de Art Tracks** desde el primer día. La mayoría de los catálogos
   guardan la procedencia como texto corrido y la reconstruyen después, que es trabajo que no se
   recupera entero.
3. **Los enlaces externos se vigilan.** `external_links` guarda copia de archivo y estado de
   comprobación. La bibliografía digital de un catálogo se pudre en cinco años y casi nadie lo mide.
4. **La fotografía lleva su propia procedencia y su corrección documentada.** La guía pide exactamente
   esto en su apartado de recogida: pareja de ficheros —bruto y sin pérdida—, carta de color y de
   grises en la toma, fotografía del reverso, de los sellos y etiquetas, y de los bordes; y comparabilidad
   entre imágenes. Lo tenemos. **Lo único que conviene comprobar es la resolución**: la guía fija un
   mínimo de 300 ppp referido a una unidad física, y nuestro máster se mide en píxeles, no en píxeles
   por centímetro de obra.

## 3. Lo que falta

Ordenado por lo que se pierde, no por lo que cuesta.

### A. El núcleo académico

**A1 · La certeza de autoría no existe como dato.** Hoy toda obra de la base es, implícitamente,
autógrafa del artista de su fondo. No hay dónde decir «atribuida», «taller», «dudosa» ni, sobre todo,
**«rechazada»**. `attributed_title` se refiere al *título*, no a la autoría — el nombre se presta a
confusión y conviene no confundirlos. Esto es el acto académico central: publicar el juicio y su grado.
Sin él, el día que aparezca una obra dudosa solo caben dos malas salidas: catalogarla como auténtica o
dejarla fuera y perder la investigación hecha. Con un matiz honrado: la guía dice que los catálogos de
artistas **modernos** suelen publicar solo las obras aceptadas, y Rotili y Ruiz Campins lo son. Pero
«no publicarlas» no es «no registrarlas», y la clasificación con su grado de certeza se pide en todos
los casos. **Coste:** un enumerado y una columna, más el rótulo en la ficha y en el listado, y decidir
si las rechazadas salen del listado por omisión (como el fondo apartado) o se marcan. **Alto valor,
coste bajo.**

**A2 · La evidencia no se engancha a la afirmación.** Un documento del archivo se enlaza con la
**obra entera**, no con el eslabón de procedencia que demuestra, ni con la participación en una
exposición, ni con la cita bibliográfica. Las dos guías lo piden por su nombre: «la procedencia debe
estar respaldada por referencias», dice una; la otra separa **Notas**, **Autoridades** y **Citas** y
marca en cada eslabón cuál le corresponde. Hoy, la carta que prueba que la obra pasó a la colección X en
1971 está en el archivo y en la ficha, pero nada dice que pruebe *ese* eslabón. **Coste:** dos claves
ajenas opcionales en `artwork_documents` (a `provenance_events` y a `artwork_exhibitions`), o una tabla
puente propia. **Alto valor, coste medio.**

**A3 · Dónde está hoy, y con qué número.** `physical_place_id` es el árbol del almacén familiar: sirve
para lo que está en casa. Para lo que no —un museo, una colección privada, un depósito— la respuesta
sale a medias del último eslabón de la cadena, y **falta el número de inventario del tenedor**, que es
lo que permite volver a encontrar la obra en la institución que la tiene. Es la rúbrica 3 de la guía.
**Coste:** una columna en `provenance_events`. **Valor alto para quien consulte el catálogo, coste
bajo.**

**A4 · Cómo quiere que se le nombre, y si quiere.** La guía vuelve tres veces sobre lo mismo: que el
propietario deje por escrito **su línea de crédito**, que muchas procedencias recientes **no se pueden
publicar** aunque se conozcan, y que la confidencialidad es uno de los requisitos de un catálogo
publicado. En `parties` hay contacto y estado de contacto, pero no la fórmula con la que esa persona
quiere aparecer ni la marca de que su nombre no sale. Sin eso, la primera exportación publica lo que no
debía. **Coste:** dos columnas en `parties` y respetarlas al componer la línea. **Valor alto en cuanto
haya público, coste bajo.**

**A5 · Cómo se sabe cada cosa.** La guía lo repite en tres sitios distintos: anotar si la obra **se ha
visto en persona**; si el estado de conservación sale de una inspección propia o de un informe del
propietario —y en ese caso con qué motivo, en qué fecha y en qué condiciones se hizo—; y en general
«qué se sabe, cómo se sabe y qué es mera suposición». Nosotros tenemos el tri-estado y
`measurements_verified`, que es esa idea aplicada a un solo campo, pero no la de la obra entera.
**Coste:** una columna de «vista en persona» con fecha y quién, y una de origen del estado de
conservación. **Valor alto, coste mínimo** — es lo más barato de toda la lista.

### B. Datos que la práctica da por hechos

**B1 · Inscripciones y etiquetas del reverso.** Solo hay `signature_description`. La rúbrica 4 pide
firma, fechas **y las demás inscripciones, separando las de mano del artista de las añadidas después**;
y la guía dedica media página a fotografiar el reverso —etiquetas de galería, sellos, números de
exposición a lápiz, marcas de bastidor y bordes de clavado—, que es donde vive media procedencia.
Nosotros ya lo **fotografiamos** (hay tipo de toma para eso): lo que falta es transcribirlo como dato.
**Coste:** tabla pequeña con texto, sitio y si es del artista. **Valor alto, coste bajo.**

**B2 · La bibliografía no distingue citada de reproducida.** Hay páginas y nota, pero no consta si la
obra sale **ilustrada** ni con qué número de lámina o figura. Una reproducción histórica fecha el estado
de la obra, y la guía usa justamente eso para datar. Falta además ISBN/DOI/URL. **Coste:** dos o tres
columnas. **Valor medio-alto, coste bajo.**

**B3 · Una itinerante son varias exposiciones.** El modelo ata una exposición a una sede. Una muestra
que viaja a tres ciudades se registra hoy como tres exposiciones con el mismo título —el aviso de
título repetido está pensado para eso—, y la práctica la publica como **una** con sus sedes y fechas.
Ninguna de las dos guías leídas entra en esto; va por la práctica observada en catálogos publicados.
**Coste:** tabla de sedes por exposición, y reescribir cómo se compone la línea del historial. **Valor
medio, coste medio-alto.** Conviene esperar a tener varias itinerantes de verdad.

**B4 · Las medidas no dicen de qué son.** Alto, ancho y profundidad en centímetros, sin cualificador.
La guía pide, para tabla, el **grosor** y el **ancho de cada tablero** cuando son varios; para obra
sobre papel la práctica distingue hoja, plancha e imagen; para obra enmarcada, la medida con marco;
para tondos, diámetro. **Coste:** un enumerado y una columna, más el formateo. **Valor medio, coste
bajo** — y depende de qué soportes hay, cosa que no sé.

**B5 · No hay obra gráfica.** Si Rotili o Ruiz Campins hicieron estampa o escultura editada, falta
todo: tirada, número de ejemplar, estado, pruebas de artista, impresor y editor. **Coste alto** si hace
falta; **cero si no hay obra múltiple**. Sigue siendo la primera pregunta que haría antes de tocar nada.

**B6 · Los números que la obra ya tuvo.** La rúbrica 1 pide, junto al número de catálogo, **el que le
puso el artista** y **el que llevó en catálogos razonados anteriores**. No hay dónde guardar ninguno de
los dos, y son las dos vías por las que alguien de fuera identifica una obra que cree conocer.
**Coste:** dos columnas. **Valor medio, coste mínimo.**

**B7 · La conservación es un estado, no una historia.** `conservation_status` dice cómo está hoy; no hay
restauraciones fechadas, con quién y con su informe, ni consta —ver A5— de dónde sale la valoración.
**Coste:** tabla de eventos, muy parecida a la de procedencia. **Valor medio; sube mucho si hay
restauraciones en marcha.**

**B8 · La gramática fina de la procedencia.** Nuestra cadena tiene partes, calidad, forma de
adquisición y fechas. Art Tracks pide cuatro cosas más que no tenemos sitio donde poner: **dónde se
produjo el traspaso** (distinto del lugar de la parte, que sí está en `parties`), **el intermediario**
que actuó para el comprador o el vendedor, **el número de lote y el importe** de la compra, y los
**dos extremos de un intervalo** cuando la fecha es «antes de» o «entre». Lo último es lo único que
roza nuestro modelo de fechas, que hoy dice «aproximada» pero no entre qué y qué. **Coste:** tres o
cuatro columnas en `provenance_events`. **Valor medio, coste bajo**, y sube en cuanto la procedencia
salga del ámbito familiar.

### C. Publicación y permanencia

**C1 · No hay exportación completa.** Todo el catálogo vive en una base de Supabase y unos ficheros en
B2; la única salida estructurada que existe es el PDF del dossier, y el `.bib` está tachado en los
requisitos. Un catálogo razonado se hace para durar más que la plataforma que lo aloja.
**Recomendación:** un volcado completo y legible —un JSON por tabla más un manifiesto de imágenes con
sus rutas y sus sumas de verificación—, generado a mano desde «Tablas» y, mejor aún, semanalmente sin
que nadie lo pida. **Es lo que yo haría primero de toda esta lista.** Coste bajo, y es el único punto
cuyo fallo no se puede arreglar después.

**C2 · No hay publicación citable, ni el texto que la acompaña.** Hoy no hay acceso público (RF-101), y
es una decisión, no un descuido. Pero el día que se publique harán falta dos cosas. Una técnica: URL
estable por obra, «cómo citar esta entrada» con fecha de consulta y **fecha de última revisión
visible**; el `change_log` ya guarda el historial campo a campo, así que la mitad difícil está hecha. Y
otra que no es software: la guía exige **transparencia** —una introducción que declare el objetivo, los
límites que el catálogo se ha puesto, el método y la definición de autoría con la que se aceptan
obras—, y eso hay que escribirlo. **Coste medio; no urge, pero conviene no cerrarse puertas.**

**C3 · Los vocabularios no apuntan a ninguna autoridad.** Tipos de obra, técnicas, sedes y personas son
tablas maestras propias, sin identificador externo. Art Tracks nombra los cuatro que usa: **ULAN** para
personas e instituciones, **TGN** y **GeoNames** para lugares, **VIAF** para autores; Getty añade AAT
para técnica y tipo. Una columna opcional de identificador en cada maestra no cambia nada hoy y
convierte un futuro volcado en datos que otros pueden leer. **Coste mínimo, valor a largo plazo.**

### D. Y una observación sobre la numeración

`catalog_id` es un **número de inventario** asignado por orden de captura, y está impreso en etiquetas
pegadas a las obras: no se toca nunca, y eso está bien resuelto. Pero conviene saber que **no es el
número que llevaría el catálogo publicado**: la práctica numera por orden cronológico y con prefijo por
género (P de pintura, D de dibujo), y la guía recuerda que la ordenación cronológica no sirve para todo
artista. Si algún día se publica, harán falta **dos numeraciones a la vez** — la interna, inmutable, y
la publicada, que se calcula al cerrar. No hay nada que hacer hoy más que no confundirlas.

## 4. Lo que NO conviene hacer

- **CIDOC-CRM o Linked Art completos.** Son el modelo correcto para un museo con departamento de
  documentación. Aquí multiplicarían por tres la complejidad del esquema para exportar dos artistas.
  Lo útil de ese mundo —vocabularios con identificador y una exportación limpia— se coge con C1 y C3,
  sin adoptar el modelo entero.
- **IIIF propio.** Un servidor de imágenes con manifiestos tiene sentido cuando otras instituciones
  van a consumir tus imágenes. Con el bucket privado y las URL firmadas actuales, sería un servicio
  más que mantener para nadie.
- **DOI por obra.** Cuesta dinero y una institución que los emita; una URL estable bien cuidada
  resuelve el 90 % del problema de citación.
- **Encargar examen técnico** (radiografía, reflectografía infrarroja) por iniciativa propia. La guía le
  dedica un apartado entero y su conclusión es que **un informe técnico no autentica nada**: descarta,
  confirma o encuadra, y es accesorio del juicio, no su sustituto. Si algún día se hace, lo que hay que
  conservar es el informe y la trazabilidad de la muestra tomada, y para eso ya está el archivo
  documental.
- **Un histórico de mercado.** Aquí hay que corregir lo que decía la primera versión de este documento:
  el importe y el número de lote **sí** son parte de un eslabón de procedencia documentado —la guía los
  pide para maestros antiguos y siglo XIX, y Art Tracks les da sitio dentro del eslabón (ver B8)—. Lo
  que sobra es lo otro: seguir cotizaciones y resultados de subasta de obras que no son nuestras, que
  convierte el catálogo en otra herramienta distinta.

## 5. Si tuviera que elegir tres

1. **C1, la exportación completa.** Es la única cuyo fallo no tiene arreglo posterior.
2. **A1, la certeza de autoría con obras rechazadas.** Es lo que hace que esto sea razonado y no un
   inventario, y cuesta poco.
3. **A2, la evidencia enlazada a cada afirmación.** Es la ventaja que un catálogo digital tiene sobre
   uno impreso, y ya tenemos las dos mitades —el archivo y la cadena— sin unir.

Y una de propina, porque es media tarde: **A5**, dejar dicho si la obra se ha visto en persona.

## Fuentes

Leídas enteras:

- **Authentication in Art, *Guidelines for compiling a catalogue raisonné*** (La Haya, 7-9 de mayo de
  2014; grupo de trabajo Barnett, Nadolny, Rogers, Schavemaker, Vellekoop).
  <https://authenticationinart.org/pdf/Guidelines.pdf>
- **Art Tracks / CMOA, *Digital Provenance Standard* v0.2.**
  <http://www.museumprovenance.org/reference/standard/>

Consultadas a través de resúmenes de búsqueda, con la salvedad del principio:

- [Catalogue Raisonné Scholars Association](https://www.catalogueraisonne.org/about) — qué hace y qué
  contiene un catálogo razonado.
- [*More Than Just a Database: The Endless Possibilities of Digital Catalogues Raisonnés*, Panorama](https://journalpanorama.org/article/more-than-just-a-database/).
- [Navigating.art — datos normalizados en catálogos razonados digitales](https://www.navigating.art/articles-from-navigatingart/w9qmy02utvzg4ufhu27g92wsy4j2bv)
  y [*The catalogue raisonné after digital: authority, access, and infrastructure*](https://www.navigating.art/articles-from-navigatingart/crsa-caa-2026).
- [Getty, *Categories for the Description of Works of Art* — Creation](https://getty.edu/research/publications/electronic_publications/cdwa/14creation.html):
  cualificadores de atribución.
- [Cataloging Cultural Objects (VRA)](https://www.vraweb.org/cco): elementos mínimos de un registro.
- [AAM, cómo se lee una narrativa de procedencia](https://kam.illinois.edu/resource/aam-resource-how-read-provenance-narrative).
- [Roy Lichtenstein: A Catalogue Raisonné — guía del catálogo](https://www.lichtensteincatalogue.org/resources/?Guide+to+the+Catalogue=Catalogue+Numbers)
  y [Philip Guston Catalogue Raisonné — guía de las entradas](https://gustoncrllc.org/catalogue-raisonne/guide-to-entries):
  numeración y estructura de entrada.
- [Wildenstein Plattner Institute — qué es un catálogo razonado](https://wpi.art/2024/03/29/what-is-a-catalogue-raisonne-and-why-is-it-useful/)
  y [sus bases digitales](https://wpi.art/catalogue-raisonne-databases/).
- [Frederic Remington Catalogue Raisonné](https://centerofthewest.org/2015/12/11/the-frederic-remington-catalogue-raisonne/):
  obras quemadas o desaparecidas sin imagen.
- [Canadian Conservation Institute, *Condition Reporting – Paintings*](https://www.canada.ca/en/conservation-institute/services/conservation-preservation-publications/canadian-conservation-institute-notes/condition-reporting-paintings-introduction.html):
  campos de un informe de estado.
- [Metamorfoze Preservation Imaging Guidelines](https://www.metamorfoze.nl/sites/default/files/documents/Preservation%20Imaging%20Guidelines%20English%202.0,%20April%202025.pdf)
  y [FADGI](https://www.digitizationguidelines.gov/guidelines/FADGI%20Federal%20%20Agencies%20Digital%20Guidelines%20Initiative-2016%20Final_rev1.pdf):
  cartas de color y tolerancias de digitalización.
- [Edition (printmaking)](https://en.wikipedia.org/wiki/Edition_(printmaking)) y
  [Artsy, guía de estampa y múltiples](https://www.artsy.net/article/christie-s-collecting-guide-11-key-things-prints-multiples):
  tirada, estados y pruebas.
