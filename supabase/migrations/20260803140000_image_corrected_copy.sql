-- ============================================================
-- La copia corregida a resolución completa: el cuarto nivel de fichero de una
-- fotografía (RF-420, y RF-411 como su razón de ser; ADR-002).
--
-- RF-409 fijó tres niveles por toma: miniatura para el mosaico, derivada de
-- consulta para la ficha, y máster de archivo con el original íntegro. Se añade
-- un cuarto: una copia a resolución completa con **todas** las correcciones ya
-- aplicadas, que se genera y se sube en el momento de aplicar la corrección.
--
-- Esto NO toca el máster y no puede tocarlo: el máster se sube una vez con los
-- bytes originales del fichero y no se vuelve a escribir nunca (ADR-002). Esta
-- migración añade columnas para un fichero NUEVO en una ruta NUEVA. Si alguien
-- lee estas columnas como permiso para reescribir un máster, está leyendo lo
-- contrario de lo que dicen.
-- ============================================================


-- ── Por qué existe ──────────────────────────────────────────
--
-- RF-411 es el caso de uso entero: la ficha ofrece descargar el original por URL
-- firmada, también al Lector, porque mandarlo a una imprenta o a un comisario es
-- exactamente para lo que se guarda. Y ahí se cruzan dos cosas verdaderas que sin
-- este cuarto nivel se contradicen:
--
--   · el máster está intacto, y debe estarlo: es el documento de archivo, y lo
--     que lo hace documento es que nadie lo ha tocado;
--   · por eso mismo, el máster **es la fotografía sin corregir**: lleva la
--     dominante amarilla de la bombilla del almacén, la perspectiva torcida de
--     haber disparado desde un lado y el encuadre con el borde de la pared
--     dentro.
--
-- Es decir: hasta hoy, «Descargar máster» entregaba a la imprenta precisamente la
-- versión que la catalogadora había pasado media hora arreglando, y el arreglo se
-- quedaba en la miniatura de 400 px y en la derivada de 2000 px, que son las dos
-- que no sirven para imprimir. El trabajo estaba hecho y no llegaba a su
-- destinatario.
--
-- La copia corregida es lo que se manda. El máster es lo que se conserva. Los dos
-- ficheros existen a la vez y ninguno sustituye al otro, porque no responden a la
-- misma pregunta: uno responde «cómo era la fotografía tal como salió de la
-- cámara» y el otro «cómo es la obra».


-- ── Por qué lleva TODAS las correcciones y no solo el color ──
--
-- Giro, recorte, perspectiva y color, las cuatro, en el orden canónico
-- geometría → color que fijó la migración del color.
--
-- Una copia con el color arreglado y la perspectiva torcida no le sirve a nadie:
-- el comisario que la abre ve un cuadro trapezoidal de un color correcto, y en
-- una reproducción impresa la deformación se nota más que la dominante, porque un
-- marco que no es rectangular lo delata cualquier borde de página. Media
-- corrección no es media mejora, es un fichero que hay que volver a corregir a
-- mano en la imprenta, y entonces lo que se ha mandado son deberes.
--
-- De ahí que sea UNA columna de ruta y no una por corrección. No hay «copia con
-- el color aplicado» y «copia enderezada»: hay la copia, con todo lo que la ficha
-- dice que hay que aplicar en el momento en que se aplicó. Los parámetros de cómo
-- se llegó a ella siguen viviendo en sus columnas (`rotation`, `crop_*`,
-- `corner_*`, `color_*`), absolutos sobre el máster y reversibles; esta ruta es
-- solo dónde quedó el resultado.


-- ── Esta ruta NUNCA es la del máster ────────────────────────
--
-- Regla, no recomendación. El máster no se reescribe jamás, y la forma realista
-- de romperlo no es un `update` malicioso: es derivar la ruta de la copia de la
-- del máster —cambiarle la extensión, añadirle un sufijo, reutilizar la base— y
-- que un día coincidan. Por eso:
--
--   · la restricción `images_corrected_not_master` prohíbe que las dos columnas
--     tengan el mismo valor, y **hay un test que lo comprueba** en las dos
--     direcciones (mover la copia sobre el máster y mover el máster sobre la
--     copia), en `supabase/tests/image_corrected_copy.test.sql`;
--   · las rutas del almacén ya son inmutables por otra razón que aquí también
--     vale: el service worker cachea por ruta con `CacheFirst`, así que
--     sobrescribir una ruta serviría los bytes viejos desde el teléfono para
--     siempre. Reeditar escribe una ruta nueva y la copia anterior se queda en el
--     almacén sin que nada la borre, que es la disciplina de «nunca un borrado
--     real» aplicada a los ficheros.
--
-- La restricción no compara con `thumbnail_path` ni con `derivative_path`, y no es
-- un olvido: esos dos viven en el bucket de Supabase Storage y la copia corregida
-- va a Backblaze B2 con el máster, por tamaño (RNF-110). Una colisión con ellos no
-- es posible por el almacén, y una con el máster sí lo es porque comparten
-- almacén, esquema de nombres y firma de subida. La restricción está donde está el
-- riesgo.
--
-- Y como el máster: **esta ruta no entra en ninguna vista**. La vista
-- `representative_image` sigue publicando miniatura y derivada y nada más. Un
-- fichero de resolución completa se entrega por URL firmada de la función Edge o
-- no se entrega (RF-411).


-- ── Por qué `corrected_pending` es una columna ──────────────
--
-- Y no la simple ausencia de `corrected_path`. Sin ella, estas dos filas serían la
-- misma fila:
--
--   1. «no hace falta ninguna copia, porque esta fotografía no tiene ninguna
--      corrección aplicada»: nada que generar, nada que subir, y el máster ya es
--      la respuesta correcta a RF-411;
--   2. «hace falta, se intentó y este dispositivo no ha podido generarla».
--
-- Las dos se leerían como «no hay copia», y la primera —que es la mayoría—
-- taparía la segunda hasta hacerla invisible. Nadie volvería a intentarlo porque
-- nada diría que quedó pendiente, y la ficha entregaría el máster sin corregir
-- creyendo que era lo que había que entregar.
--
-- El fallo del que hablamos es real y es silencioso, que es lo peor de las dos
-- cosas: el área máxima de un `canvas` está limitada por el dispositivo (en WebKit
-- antiguo, del orden de 16,7 millones de píxeles, y un máster de 4000×3000 con
-- perspectiva rectificada se acerca), y **al superarla el lienzo sale en blanco
-- sin lanzar ningún error**. No hay excepción que capturar. Si nadie comprueba la
-- capacidad antes y sondea un píxel después, lo que se sube es un JPEG blanco del
-- tamaño correcto, con su `corrected_bytes` plausible, y la imprenta recibe una
-- hoja en blanco de una obra.
--
-- Así que la fila tiene que poder decir que la copia falta. Es la disciplina de
-- «sin revisar» no es «no», que es criterio del proyecto: el dato pendiente no se
-- escribe igual que el dato que no hace falta. Con la columna hay tres estados
-- distinguibles y los tres significan algo:
--
--   corrected_path no nulo                     la copia está, y está completa
--   todo nulo, corrected_pending false         no hace falta: no hay correcciones
--   corrected_pending true                     hace falta y falta: pendiente
--
-- El tercero es el que la interfaz dice con su razón, y el que permite generarla
-- después desde un ordenador con más memoria. Los dos primeros son excluyentes
-- del tercero por restricción: si la copia está, no está pendiente.


-- ── El coste que se acepta, con los números delante ─────────
--
-- Consta aquí porque es una decisión del propietario y no un efecto colateral, y
-- porque el sitio donde se va a notar es la factura del almacén:
--
--   · **el almacenamiento en B2 se duplica** respecto al dimensionado de RNF-108.
--     Ese supuesto proyecta del orden de 5000 tomas y 10-40 GB de másteres (con la
--     corrección medida: los másteres reales van de 0,2 a 19 MB, no de 2 a 8). Una
--     copia corregida por toma corregida es, en el límite, otro tanto de lo mismo:
--     20-80 GB en vez de 10-40;
--   · **cada «Aplicar» sube un fichero del tamaño del máster** —hasta 19 MB— por
--     la cola offline, desde un almacén con mala cobertura. No es una subida más
--     entre las tres que ya había: es la más grande de todas, y se repite cada vez
--     que se afloja un parámetro y se vuelve a aplicar.
--
-- Se acepta a cambio de que RF-411 entregue la fotografía corregida en lugar de la
-- fotografía con la luz de la bombilla. Está tomada con estos números a la vista y
-- **no se reabre**; lo que sí se hace es dejarla escrita aquí, en RNF-108 y en
-- `docs/decisiones/`, para que dentro de un año el consumo de B2 tenga una
-- explicación y no una sorpresa.


-- ── Las columnas ────────────────────────────────────────────
--
-- Tres, y del mismo tipo que sus hermanas: `text` para la ruta, como
-- `master_path`, e `integer` para el tamaño, como `master_bytes`. Un `integer`
-- llega a 2 GB y el techo real de una fotografía es 19 MB.
alter table public.images
  add column corrected_path    text,
  add column corrected_bytes   integer,
  add column corrected_pending boolean not null default false;

comment on column public.images.corrected_path is
  'Ruta en Backblaze B2 de la copia a resolución completa con TODAS las correcciones aplicadas (giro, recorte, perspectiva y color). Es lo que se entrega al descargar la fotografía para una imprenta o un comisario (RF-411); el máster se conserva intacto y sin corregir. Nunca es la ruta del máster: son ficheros distintos y hay una restricción que lo impide. Nulo significa que no hay copia, y hay dos motivos posibles: que no haga falta ninguna porque la fotografía no tiene correcciones, o que quedara pendiente, que es lo que dice corrected_pending.';
comment on column public.images.corrected_bytes is
  'Tamaño en bytes de la copia corregida. Va en pareja con corrected_path: una ruta sin tamaño obligaría a pedirle el tamaño al almacén para poder anunciar la descarga, y un tamaño sin ruta no describe ningún fichero.';
comment on column public.images.corrected_pending is
  'La copia corregida hace falta y no está: este dispositivo no ha podido generarla. Existe como columna propia porque sin ella «no ha podido» y «no hace falta» serían la misma fila, y la segunda —que es la mayoría— taparía la primera: el área máxima de un lienzo la limita el dispositivo y al superarla sale en blanco sin lanzar ningún error, así que el fallo hay que poder anotarlo. La interfaz lo dice con su razón y la copia se puede generar después desde un ordenador. Cierto y corrected_path no nulo son estados excluyentes.';


-- ── Las restricciones, una por regla y con nombre propio ────
--
-- Igual que en la migración del color: lo único que Postgres dice al rechazar es
-- el nombre de la restricción, así que cada regla lleva el suyo y un rechazo
-- explica qué regla se rompió sin tener que deducirlo.

-- Cero bytes es un fichero vacío y un negativo es una cuenta mal hecha. Ni uno ni
-- otro son un tamaño, y los dos llegarían a la ficha como una descarga que
-- promete algo que no está. `master_bytes` no lleva esta comprobación porque nació
-- antes de que el proyecto la tuviera por costumbre; la columna nueva sí.
alter table public.images
  add constraint images_corrected_bytes_positive
  check (corrected_bytes is null or corrected_bytes > 0);

-- Los dos o ninguno. La ruta y el tamaño no son dos datos, son un fichero: media
-- descripción de un fichero es la que obliga a quien la lee a ir a preguntarle al
-- almacén, que es exactamente el viaje que la columna existe para ahorrar.
alter table public.images
  add constraint images_corrected_copy_pair
  check (num_nonnulls(corrected_path, corrected_bytes) in (0, 2));

-- Pendiente y presente son excluyentes: si la copia está, no está pendiente.
-- Admitir las dos cosas a la vez dejaría una fila que dice «hay copia» y «falta
-- la copia», y quien la leyera tendría que elegir a cuál de las dos creer.
alter table public.images
  add constraint images_corrected_pending_exclusive
  check (not (corrected_pending and corrected_path is not null));

-- La regla de ADR-002 escrita donde la base la pueda defender: la copia corregida
-- no comparte ruta con el máster.
--
-- `is distinct from` y no `<>`, y conviene ser exacto sobre el motivo, porque es
-- fácil contarlo como un fallo evitado y no lo es: **con la guarda
-- `corrected_path is null` delante, las dos formas admiten exactamente las mismas
-- filas** (comprobado en esta base: con `master_path` nulo, `<>` da nulo y un
-- `check` con nulo pasa, igual que `is distinct from` dando cierto). Se elige `is
-- distinct from` porque el predicado es total y no evalúa a nulo nunca: la regla no
-- depende de que un `check` acepte lo que no sabe, se lee sin seguir la lógica de
-- tres valores, y sigue diciendo lo mismo el día en que alguien reordene la
-- expresión o quite la guarda.
alter table public.images
  add constraint images_corrected_not_master
  check (corrected_path is null or corrected_path is distinct from master_path);


-- ── Lo que la base NO prohíbe, a propósito ──────────────────
--
-- No hay restricción que exija `master_path` para tener `corrected_path`. Hoy no
-- se puede llegar ahí —sin máster el color se prohíbe con el mismo interruptor
-- `canRestoreOriginal` que ya usa la perspectiva—, pero la regla es de
-- renderizado y vive en el cliente; escribirla aquí impediría el caso legítimo de
-- una copia ya generada cuyo máster se reclasifique o se reubique, y lo impediría
-- al guardar, cuando ya no hay nada que hacer.
--
-- Tampoco hay restricción que ligue `corrected_pending` a que existan
-- correcciones. Marcar pendiente una fotografía sin ninguna corrección es
-- inofensivo —quien lo lea reintentará, generará un fichero idéntico al máster y
-- lo dejará hecho— mientras que un `check` que enumerara «hay algo que aplicar»
-- tendría que repetir aquí la definición de las cuatro correcciones y quedaría
-- desalineado la primera vez que se añadiera una quinta.
--
-- Y no se reescribe ninguna fila hacia atrás. Las 39 filas activas se quedan con
-- la copia a nulo y `corrected_pending` en falso, que es la verdad: no hay copia y
-- no falta ninguna, porque no se ha aplicado ninguna corrección desde que existe
-- este nivel. La primera vez que se abra y se aplique una, se generará.


-- ── Privilegios: comprobado, no supuesto ────────────────────
--
-- CLAUDE.md avisa de que la plataforma concede por omisión todos los privilegios
-- de cada tabla nueva a `anon` y `authenticated`, `delete` incluido, y de que
-- conviene comprobarlo en vez de creerlo. La migración hermana del color ya lo
-- midió; aquí se ha vuelto a medir sobre esta misma base, con estas tres columnas
-- ya creadas, consultando `information_schema.column_privileges` y
-- `information_schema.role_table_grants`:
--
--   · `anon` **no aparece ni una vez**: ningún privilegio sobre `public.images`,
--     tampoco `select`, y tampoco `usage` sobre el esquema `public`. Las tres
--     columnas nuevas no le abren nada.
--   · `authenticated` tiene `select`, `insert` y `update` **sobre la tabla**, no
--     sobre una lista de columnas, y un privilegio de tabla alcanza a las columnas
--     que se añadan después: las tres nuevas aparecen ya con esos tres
--     privilegios, 54 columnas × 3, y por tanto **no hay nada que conceder**.
--     Ningún `delete`, que es el que había que vigilar: `delete` sobre esta tabla
--     lo tienen solo `postgres`, `service_role` y `supabase_admin`.
--
-- No hay tipos nuevos, así que no hay ningún `grant usage` que hacer: esta
-- migración añade `text`, `integer` y `boolean`.
--
-- Quién puede escribir estas tres columnas lo decide la política `images_update`
-- con `can_edit()`, igual que para el resto de la fila: un Lector no escribe
-- ninguna, y eso se verifica **autenticándose de verdad** en la sección 8 de
-- `supabase/tests/image_corrected_copy.test.sql`, no leyendo esta migración.
--
-- Ojo con la asimetría deliberada de RF-411, que aquí importa y que el test
-- comprueba en los dos sentidos: el Lector **descarga** la copia corregida —para
-- eso está, y por tanto tiene que poder leer `corrected_path` y
-- `corrected_bytes`— y **no escribe** ninguna de las tres. Negarle la lectura no
-- daría ningún error: dejaría el botón de descarga sin ruta que firmar, y la
-- ficha entregaría el máster sin corregir creyendo que no había copia.
