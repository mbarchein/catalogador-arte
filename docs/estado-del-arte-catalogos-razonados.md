# Qué hacen otros catálogos razonados, y qué nos falta

Estudio comparativo entre la práctica establecida de los catálogos razonados —impresos y digitales— y
lo que esta aplicación guarda hoy. No es una lista de deseos: cada hueco viene con **qué se pierde si
no se hace** y **cuánto cuesta**, y hay un apartado final con lo que conviene **no** hacer, que en un
proyecto de dos artistas y tres personas es igual de importante.

## Cómo se hizo, y qué no pude leer

Investigación hecha el 15 de agosto de 2026 con el buscador web. **La red de este entorno bloquea la
descarga de páginas**: pude buscar y leer los resúmenes de los resultados, pero no abrir las fuentes
primarias completas —entre ellas las *Guidelines for compiling a catalogue raisonné* de Authentication
in Art y el artículo de *Panorama* sobre catálogos digitales, que son las dos referencias que más
habría querido leer enteras—. Lo que sigue está construido sobre esos resúmenes y sobre las
convenciones publicadas por catálogos concretos (Lichtenstein, Guston, Cézanne, Bearden, Remington).
Donde una afirmación dependa de una fuente que no pude verificar del todo, se dice.

El inventario de lo nuestro, en cambio, está medido: sale de consultar el esquema aplicado, tabla a
tabla y enumerado a enumerado.

## 1. Qué pide un catálogo razonado

La definición corta que repiten todas las fuentes: **registrar todas las obras conocidas de un artista,
con la información que permite identificarlas y seguir su historia** — imagen, título y títulos
alternativos, fecha, técnica, medidas, firma e inscripciones, procedencia, historial expositivo y
bibliografía. A eso se añade lo que aporta el estudio del artista: números de inventario propios,
registros de conservación y el comentario que sitúa la obra en el conjunto.

Cuatro cosas que la práctica da por hechas y que no aparecen en esa lista corta:

- **La atribución es un juicio y se publica como tal.** El vocabulario está normalizado —«atribuido
  a», «taller de», «círculo de», «seguidor de», «manera de», «copia de», «según»— y forma una
  jerarquía descendente de confianza en la que **no poner nada significa certeza**. Un catálogo
  publica además las obras que ha **rechazado**, y las falsificaciones detectadas.
- **La procedencia se escribe con una gramática.** Orden cronológico, fechas de vida entre corchetes,
  marchantes y casas de subastas entre paréntesis para distinguirlos de los propietarios privados,
  «posiblemente» y «probablemente» para lo incierto — y una puntuación con significado: **punto y coma
  cuando la obra pasó directamente de uno a otro, punto cuando no hubo traspaso directo o no consta**.
- **Lo que no se sabe se dice.** Obras perdidas, destruidas, conocidas solo por fotografía o solo por
  una reproducción publicada tienen su sitio en el catálogo, normalmente en apéndices propios.
- **En digital, la autoridad se desplaza del veredicto a la documentación.** Es la frase que más se
  repite en la bibliografía reciente: lo que legitima una entrada digital no es la firma del experto
  sino **la evidencia enlazada** — que cada afirmación de procedencia apunte al documento de archivo
  que la sostiene.

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

Y tres cosas que **hacemos mejor que la media** de lo que he visto descrito:

1. **«Sin revisar» no es «no».** El tri-estado sistemático y el `research_status` por bloque
   —procedencia, bibliografía, exposiciones, documentación— distinguen el dato pendiente de
   investigar del investigado sin resultado. La mayoría de los catálogos consultados solo distinguen
   «hay dato» de «no hay dato», y esa diferencia es justo la que se pierde entre catalogadores.
2. **Los enlaces externos se vigilan.** `external_links` guarda copia de archivo y estado de
   comprobación. La bibliografía digital de un catálogo se pudre en cinco años y casi nadie lo mide.
3. **La fotografía lleva su propia procedencia y su corrección documentada** (referencia de color,
   luz, recorte y perspectiva, con qué se decidió cada cosa). Eso es más de lo que pide cualquier guía
   de catalogación; es práctica de digitalización patrimonial.

## 3. Lo que falta

Ordenado por lo que se pierde, no por lo que cuesta.

### A. El núcleo académico

**A1 · La certeza de autoría no existe como dato.** Hoy toda obra de la base es, implícitamente,
autógrafa del artista de su fondo. No hay dónde decir «atribuida», «taller», «dudosa» ni, sobre todo,
**«rechazada»**. `attributed_title` se refiere al *título*, no a la autoría — el nombre se presta a
confusión y conviene no confundirlos. Esto es el acto académico central de un catálogo razonado:
publicar el juicio y su grado. Sin él, el día que aparezca una obra dudosa solo caben dos malas
salidas: catalogarla como auténtica o dejarla fuera y perder la investigación hecha.
**Coste:** un enumerado y una columna, más el rótulo en la ficha y en el listado, y decidir si las
rechazadas salen del listado por omisión (como el fondo apartado) o se marcan. **Alto valor, coste
bajo.**

**A2 · La evidencia no se engancha a la afirmación.** Un documento del archivo se enlaza con la
**obra entera**, no con el eslabón de procedencia que demuestra, ni con la participación en una
exposición, ni con la cita bibliográfica. Es exactamente lo que la bibliografía reciente señala como
la ventaja del catálogo digital sobre el impreso. Hoy, la carta que prueba que la obra pasó a la
colección X en 1971 está en el archivo y en la ficha, pero nada dice que pruebe *ese* eslabón.
**Coste:** dos claves ajenas opcionales en `artwork_documents` (a `provenance_events` y a
`artwork_exhibitions`), o una tabla puente propia. **Alto valor, coste medio.**

**A3 · Dónde está hoy, y con qué número.** `physical_place_id` es el árbol del almacén familiar: sirve
para lo que está en casa. Para lo que no —un museo, una colección privada, un depósito— la respuesta
sale a medias del último eslabón de la cadena, y **falta el número de inventario del tenedor**, que es
lo que permite volver a encontrar la obra en la institución que la tiene. La práctica publica esa
línea así: institución, ciudad, número de inventario. **Coste:** una columna en `provenance_events`
(número de inventario en ese poseedor). **Valor alto para quien consulte el catálogo, coste bajo.**

### B. Datos que la práctica da por hechos

**B1 · Inscripciones y etiquetas del reverso.** Solo hay `signature_description`. El reverso de un
cuadro —etiquetas de galería, sellos de aduana, números de exposición a lápiz, marcas de bastidor— es
donde vive media procedencia, y la práctica lo transcribe indicando dónde está cada inscripción y con
qué está escrita. Nosotros ya **fotografiamos** el reverso (hay tipo de toma para eso): lo que falta es
transcribirlo como dato. **Coste:** tabla pequeña, o una columna de texto con marcado. **Valor alto,
coste bajo.**

**B2 · La bibliografía no distingue citada de reproducida.** Hay páginas y nota, pero no consta si la
obra sale **ilustrada** ni con qué número de lámina o figura. En un catálogo razonado esa distinción
es de las que más se consultan: una reproducción histórica fecha el estado de la obra. Falta además
ISBN/DOI/URL en la referencia. **Coste:** dos o tres columnas. **Valor medio-alto, coste bajo.**

**B3 · Una itinerante son varias exposiciones.** El modelo ata una exposición a una sede. Una muestra
que viaja a tres ciudades se registra hoy como tres exposiciones con el mismo título —el aviso de
título repetido está pensado justamente para eso—, y la práctica la publica como **una** con sus
sedes y fechas. **Coste:** tabla de sedes por exposición, y reescribir cómo se compone la línea del
historial. **Valor medio, coste medio-alto.** Conviene esperar a tener varias itinerantes de verdad.

**B4 · Las medidas no dicen de qué son.** Alto, ancho y profundidad en centímetros, sin cualificador.
Para obra sobre papel la práctica distingue **hoja, plancha e imagen**; para obra enmarcada, la medida
con marco; para tondos, diámetro; para instalación, «variable». **Coste:** un enumerado y una columna,
más el formateo. **Valor medio, coste bajo** — y **depende de si hay obra sobre papel**, cosa que no
sé.

**B5 · No hay obra gráfica.** Si Rotili o Ruiz Campins hicieron estampa o escultura editada, falta
todo: tirada, número de ejemplar, estado, pruebas de artista, impresor y editor. **Coste alto** si hace
falta; **cero si no hay obra múltiple**. Es la primera pregunta que te haría antes de tocar nada.

**B6 · El número que el artista le puso.** No hay dónde guardar la numeración del propio artista, que
la práctica registra por separado del número de catálogo. **Coste:** una columna. **Valor medio,
coste mínimo.**

**B7 · La conservación es un estado, no una historia.** `conservation_status` dice cómo está hoy; no
hay restauraciones fechadas, con quién y con su informe. **Coste:** tabla de eventos, muy parecida a la
de procedencia. **Valor medio; sube mucho si hay restauraciones en marcha.**

### C. Publicación y permanencia

**C1 · No hay exportación completa.** Todo el catálogo vive en una base de Supabase y unos ficheros en
B2; la única salida estructurada que existe es el PDF del dossier, y el `.bib` está tachado en los
requisitos. La bibliografía sobre catálogos digitales insiste en esto y con estas palabras:
*preservar capturas o exportaciones estáticas registra solo la superficie*. Un catálogo razonado se
hace para durar más que la plataforma que lo aloja. **Recomendación:** un volcado completo y legible
—un JSON por tabla más un manifiesto de imágenes con sus rutas y sus sumas de verificación—, generado
a mano desde «Tablas» y, mejor aún, semanalmente sin que nadie lo pida. **Es lo que yo haría primero
de toda esta lista.** Coste bajo, y es el único punto cuyo fallo no se puede arreglar después.

**C2 · No hay publicación citable.** Hoy no hay acceso público (RF-101), lo cual es una decisión, no
un descuido. Pero el día que se publique hará falta lo que la práctica ya tiene resuelto: URL estable
por obra, «cómo citar esta entrada» con fecha de consulta, y **fecha de última revisión visible** —
porque una entrada digital cambia y quien la citó necesita saber qué versión leyó. Lo bueno: el
`change_log` ya guarda el historial campo a campo, así que la mitad difícil está hecha. **Coste
medio; no urge, pero conviene no cerrarse puertas.**

**C3 · Los vocabularios no apuntan a ninguna autoridad.** Tipos de obra, técnicas, sedes y personas son
tablas maestras propias, sin identificador de Getty (AAT para técnica y tipo, ULAN para artistas,
TGN para lugares). Añadir una columna opcional de identificador en cada maestra no cambia nada hoy y
convierte un futuro volcado en datos que otros pueden leer. **Coste mínimo, valor a largo plazo.**

### D. Y una observación sobre la numeración

`catalog_id` es un **número de inventario** asignado por orden de captura, y está impreso en etiquetas
pegadas a las obras: no se toca nunca, y eso está bien resuelto. Pero conviene saber que **no es el
número que llevaría el catálogo publicado**: la práctica numera por orden cronológico y con prefijo por
género (P de pintura, D de dibujo), y varios catálogos advierten de que su numeración es provisional
hasta que se cierra la investigación. Si algún día se publica, harán falta **dos numeraciones a la
vez** — la interna, inmutable, y la publicada, que se calcula al cerrar. No hay nada que hacer hoy más
que no confundirlas.

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
- **Examen técnico** (radiografía, reflectografía infrarroja). Es investigación de laboratorio: cuando
  la haya, su informe entra por el archivo documental, que ya existe.
- **Precios de mercado o resultados de subasta.** El dossier ya lleva precio de venta, que es otra
  cosa; un histórico de mercado convertiría el catálogo en otra herramienta distinta.

## 5. Si tuviera que elegir tres

1. **C1, la exportación completa.** Es la única cuyo fallo no tiene arreglo posterior.
2. **A1, la certeza de autoría con obras rechazadas.** Es lo que hace que esto sea razonado y no un
   inventario, y cuesta poco.
3. **A2, la evidencia enlazada a cada afirmación.** Es la ventaja que un catálogo digital tiene sobre
   uno impreso, y ya tenemos las dos mitades —el archivo y la cadena— sin unir.

## Fuentes

Todas consultadas el 15 de agosto de 2026, a través de resúmenes de búsqueda; ver la salvedad del
principio.

- [Catalogue Raisonné Scholars Association](https://www.catalogueraisonne.org/about) — qué hace y qué
  contiene un catálogo razonado.
- [Authentication in Art, *Guidelines for compiling a catalogue raisonné*](https://authenticationinart.org/pdf/Guidelines.pdf)
  (PDF que **no pude abrir**; aparece citado en varias fuentes).
- [*More Than Just a Database: The Endless Possibilities of Digital Catalogues Raisonnés*, Panorama](https://journalpanorama.org/article/more-than-just-a-database/)
  (**no pude abrirlo**).
- [Navigating.art — datos normalizados en catálogos razonados digitales](https://www.navigating.art/articles-from-navigatingart/w9qmy02utvzg4ufhu27g92wsy4j2bv)
  y [*The catalogue raisonné after digital: authority, access, and infrastructure*](https://www.navigating.art/articles-from-navigatingart/crsa-caa-2026).
- [Getty, *Categories for the Description of Works of Art* — Creation](https://getty.edu/research/publications/electronic_publications/cdwa/14creation.html):
  cualificadores de atribución.
- [Cataloging Cultural Objects (VRA)](https://www.vraweb.org/cco): elementos mínimos de un registro.
- [Art Tracks / CMOA, *Digital Provenance Standard*](http://www.museumprovenance.org/reference/standard/)
  y [AAM, cómo se lee una narrativa de procedencia](https://kam.illinois.edu/resource/aam-resource-how-read-provenance-narrative):
  la puntuación con significado.
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
