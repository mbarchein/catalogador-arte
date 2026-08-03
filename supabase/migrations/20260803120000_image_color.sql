-- ============================================================
-- Ajuste de color de una fotografía, guardado como DATO, más la fecha que trae
-- el fichero, el tamaño del original y la procedencia
-- (RF-414, RF-416, RF-417, RF-418, ADR-002).
--
-- La luz de un almacén tiñe las obras: bajo una bombilla incandescente un lienzo
-- sale amarillento, y ese amarillo no es del cuadro, es de la bombilla.
-- Quitárselo es catalogación y no retoque, porque lo que la fotografía tiene que
-- documentar es la obra y no la luz que había ese día.
--
-- El ajuste vive aquí y no cocido en los píxeles, por lo mismo que el giro y el
-- recorte: el máster no se toca nunca (ADR-002), las derivadas se regeneran desde
-- él, y el futuro pipeline de Python del catálogo impreso necesita estas columnas
-- para imprimir el mismo color que se ve en la web —la divergencia que la vista
-- representative_image existe para evitar—. Un ajuste que es dato se puede leer,
-- aflojar, corregir y deshacer dentro de un año.
--
-- Lo que NO se guarda porque no se implementa (RF-415, requisito negativo):
-- saturación, vibrancia, contraste global, sombras y altas luces por separado,
-- nitidez, reducción de velo y eliminación de reflejos. Un barniz que ha
-- amarilleado y un color que ha perdido intensidad son estado de la obra, y son
-- justo lo que hay que testificar: avivarlos sería catalogar una obra que no
-- existe. No hay columna para ellos y su ausencia es deliberada; si algún día
-- aparece una, es un error y no una mejora.
-- ============================================================


-- ── Escalares con `check`, y no un `jsonb` ──────────────────
--
-- El argumento ya está escrito en la migración del recorte y sigue siendo el
-- decisivo: la base es la última línea que dice no, y solo puede decirlo de lo
-- que sabe leer. `color_gamma between 0.60 and 1.60` es comprobable sobre una
-- columna. Sobre un `jsonb` se convierte en una expresión sobre claves que pueden
-- no existir, de tipos que nadie garantiza: un `{"gamma": "bastante"}` entraría
-- sin una queja y saldría como NaN en la tabla de consulta del navegador, es
-- decir, como un canal en blanco en la miniatura de una obra. Dieciséis columnas
-- son más de escribir una vez y mucho menos de arreglar después.


-- ── Nulo es identidad, no desconocido ──────────────────────
--
-- Salvo en `color_source`, nulo aquí significa «este parámetro no hace nada»:
-- temperatura y matiz 0, exposición 0 EV, negros 0, blancos 255, gamma 1,00,
-- hombro 0. Cada parámetro ausente tiene un valor identidad, y de ahí salen dos
-- consecuencias que conviene dejar escritas:
--
--  1. **Cada columna de color es independiente.** No hay regla de «todas o
--     ninguna» como la que sí tienen el recorte y las ocho esquinas, y no la hay
--     porque no haría falta ninguna: una fila con solo la temperatura corregida y
--     el resto en nulo es un ajuste perfectamente aplicable, mientras que medio
--     rectángulo es un rectángulo que nadie puede dibujar. Solo van en pareja las
--     dos columnas que juntas son un punto —el gris que se tocó con el
--     cuentagotas— y las dos que juntas son un tamaño.
--  2. **El despliegue es de una sola fase.** Las 39 filas activas se quedan a
--     nulo y se leen como neutras, y el frontend viejo —que no conoce estas
--     columnas— sirve esas mismas filas sin enterarse durante los segundos que el
--     despliegue tiene las dos versiones en el aire.
--
-- Y no se reescribe ninguna fila hacia atrás. No hay servidor que recalcule 39
-- ajustes de color, y aunque lo hubiera: el color de una fotografía se decide con
-- la obra delante y esa luz en la cara, no con estadística sobre el fichero.


-- ── El orden canónico del renderizado ───────────────────────
--
-- **geometría → reducción al nivel → color.** Desarrollado: girar el máster,
-- rectificar la perspectiva y recortar (la migración del recorte ya fijó «girar
-- primero, recortar después», y la de las esquinas que las esquinas mandan sobre
-- el recorte); después reducir al tamaño del nivel que se va a escribir —400 px
-- la miniatura, 2000 px la copia de consulta—; y solo entonces aplicar la tabla
-- de color al resultado, código a código.
--
-- El orden es normativo porque cambia el resultado: **reducir-y-luego-tabla no es
-- lo mismo que tabla-y-luego-reducir.** La reducción promedia píxeles y la curva
-- de color no es lineal, así que la media de dos valores transformados no es la
-- transformación de su media. La diferencia no se ve en una superficie plana y
-- aparece exactamente en los bordes de alta frecuencia: el filo de un marco, una
-- firma fina, la trama de un lienzo. Es decir, donde más se mira.
--
-- Se eligió reducir antes porque es el único orden que cabe en el móvil, que es
-- el dispositivo principal: la tabla se aplica sobre 2000×1500 en lugar de sobre
-- 4000×3000 —una cuarta parte de los píxeles— y sobre un `ImageData` que el
-- camino ya tiene en la mano. Por eso tampoco se pliega la tabla dentro del bucle
-- bilineal del rectificado, aunque ahí saldría gratis: pondría el color antes de
-- reducir en las fotos con perspectiva corregida y después en las demás, y dos
-- derivadas de la misma obra dejarían de coincidir por el camino que tomaron.
--
-- Los dos extremos —el navegador y el pipeline de Python— aplican este orden, o
-- el catálogo impreso y la web enseñan colores distintos de la misma obra.


-- ── De dónde salió el ajuste ────────────────────────────────
--
-- Calcado de `crop_source`, que resolvió este mismo problema para el encuadre:
-- sin la columna es imposible distinguir el ajuste que ella decidió del que
-- aceptó de una sugerencia, y toda medición futura del automático arrastraría esa
-- duda.
--
-- `REVIEWED_UNCHANGED` existe porque **«sin revisar» no es «no»**, que es
-- criterio del proyecto y no un detalle: sin ese valor, una fila con todo el
-- color a nulo no distingue «se miró con la obra delante, la luz era buena y se
-- dejó como estaba» de «nunca se miró». Lo primero es trabajo hecho y lo segundo
-- es trabajo pendiente, y la diferencia entre los dos es la que dice cuánto falta.
--
-- Las 39 filas existentes se quedan en nulo —«no se sabe»— y **nunca en
-- 'MANUAL'** ni en 'REVIEWED_UNCHANGED', que sería inventar el dato justo en la
-- columna que existe para no inventarlo.
create type public.color_source as enum (
  'MANUAL',
  'NEUTRAL_PICKED',
  'AUTO',
  'AUTO_ADJUSTED',
  'PRESET',
  'REVIEWED_UNCHANGED'
);

comment on type public.color_source is
  'De dónde salió el ajuste de color: a mano, tomando un gris de la foto, del ajuste automático, del automático y después retocado, de un preset de tipo de luz, o revisado y dejado como estaba. Nulo es «no se sabe», que es lo que llevan las filas anteriores a esta columna: nadie miró todavía el color de esa fotografía.';


-- ── De dónde salió la referencia neutra (RF-418) ────────────
--
-- Un gris liso es indistinguible de una pared gris, así que lo que se detecta no
-- es «un gris» sino una escalera de parches uniformes y acromáticos, contiguos y
-- alineados, cuyos tonos guardan la relación blanco / medio / negro. Eso reconoce
-- igual la carta comprada de tres parches y la hoja impresa en casa, y no
-- confunde ninguna de las dos con una pared, que no tiene escalones. No se
-- codifica ningún producto concreto.
--
-- Los tres estados se guardan porque **no se creen lo mismo**, y esa es toda la
-- razón de que sea un enumerado y no un booleano «había testigo»:
--
--   TARGET_CARD   su gris es fiable
--   TARGET_PRINT  su gris NO es fiable: la tinta de una impresora doméstica no es
--                 neutra —tiene su propia dominante y cambia con el papel y con
--                 el cartucho—, así que la escalera sirve para reconocer el
--                 patrón y para situar los puntos negro y blanco, que solo
--                 dependen de cuál es el parche más claro y cuál el más oscuro,
--                 pero no como referencia de dominante. Distinguirlo de la carta
--                 es lo único que evita corregir el color de una obra con el
--                 error de color de una impresora
--   SCENE         razonable: pared, cartón liso o paño tomado con el cuentagotas
--   NONE          corregido a ojo, y consta que fue a ojo
--
-- La detección nunca aplica nada sola: señala el candidato sobre la foto y lo
-- ofrece. Un año después, esta columna es lo que responde «¿de dónde salió este
-- blanco?» sin tener que creerse el resultado a ciegas.
create type public.color_reference as enum (
  'TARGET_CARD',
  'TARGET_PRINT',
  'SCENE',
  'NONE'
);

comment on type public.color_reference is
  'De dónde salió la referencia neutra del ajuste: carta de grises comprada, hoja de parches impresa en casa (su gris no es fiable, la tinta doméstica no es neutra: vale para los puntos negro y blanco, no para la dominante), una zona neutra de la propia escena, o nada, corregido a ojo.';


-- ── Tipo de luz (RF-414) ────────────────────────────────────
--
-- Lista de opciones y **no una deducción**: cada valor es un punto de partida
-- para la temperatura y el matiz que se puede tocar después, y la interfaz lo
-- etiqueta como punto de partida y nunca como medición. Se guarda cuál se eligió
-- porque es la respuesta a «por qué este número y no otro» cuando el número ya no
-- se recuerda; nulo significa que no se usó ninguno, no que no se sepa qué luz
-- había.
create type public.light_preset as enum (
  'DAYLIGHT',
  'OVERCAST',
  'FLUORESCENT_COOL',
  'FLUORESCENT_WARM',
  'LED_NEUTRAL',
  'INCANDESCENT',
  'MIXED_WINDOW_CEILING',
  'FLASH'
);

comment on type public.light_preset is
  'Tipo de luz elegido como punto de partida del ajuste: luz de ventana, día nublado, fluorescente frío, fluorescente cálido, LED neutro, bombilla incandescente, mezcla de ventana y techo, o flash del móvil. Es un punto de partida ajustable, nunca una medición de la luz que había.';


-- ── Procedencia de la fotografía (RF-417) ───────────────────
--
-- Cuatro fotografías del catálogo son reproducciones tomadas de otros catálogos
-- en línea: 1080×2400 y sin datos de cámara. No son un error de catalogación, son
-- lo único que hay de esas obras.
--
-- En las que no son propias **el ajuste de color no se ofrece**, y el motivo es de
-- fondo y no técnico: se estaría corrigiendo el revelado que hizo otra persona,
-- sobre una obra que quien corrige no ha visto nunca con esa luz. Lo que saliera
-- de ahí no sería una fotografía mejor, sería una invención con aspecto de
-- documento.
create type public.photo_provenance as enum (
  'OWN',
  'OTHER_CATALOG',
  'THIRD_PARTY'
);

comment on type public.photo_provenance is
  'Procedencia de la fotografía: hecha para el catálogo, tomada de otro catálogo, o recibida de un tercero. En las que no son propias no se ofrece el ajuste de color: sería retocar el revelado de otra persona sobre una obra que no se ha visto con esa luz.';


-- ── Las columnas ────────────────────────────────────────────
--
-- Los tipos y los rangos son los de la especificación, literales, porque el
-- código del cliente se escribe contra ellos: la escala de cada parámetro es la
-- misma en el mando de la interfaz, en la tabla de consulta y en esta columna, y
-- una sola de las tres desalineada da un color distinto según por dónde entre.
--
-- Dos avisos sobre los tipos, los dos comprobados contra esta base:
--
--   · `numeric(4,2)` de los dos porcentajes de recorte llega hasta 99,99 y **un
--     100,00 no cabe**: Postgres lo rechaza con «numeric field overflow», que no
--     es un mensaje que la usuaria deba ver nunca. Un ajuste que empasta la foto
--     entera es alcanzable —punto negro alto sobre una toma oscura— así que quien
--     escribe satura el valor en 99,99. Y satura sin perder nada: entre «99,99 %
--     empastado» y «100 %» no hay ninguna decisión distinta que tomar.
--   · `numeric(3,2)` de la exposición guarda dos decimales y el paso del mando es
--     1/6 de EV, que no cabe exacto en dos. Lo que se guarda es el valor
--     redondeado, y **es ese el valor de referencia**: la tabla de consulta se
--     reconstruye desde lo guardado y no desde el número de pasos, para que abrir
--     una fotografía, mirarla y volver a aplicar dé el mismo resultado y no
--     reescriba ficheros por una diezmilésima.
alter table public.images
  add column color_temperature  smallint,
  add column color_tint         smallint,
  add column color_exposure     numeric(3,2),
  add column color_black        smallint,
  add column color_white        smallint,
  add column color_gamma        numeric(3,2),
  add column color_shoulder     smallint,
  add column color_gray         boolean not null default false,
  add column color_neutral_x    numeric(6,5),
  add column color_neutral_y    numeric(6,5),
  add column color_clipped_low  numeric(4,2),
  add column color_clipped_high numeric(4,2),
  add column color_source       public.color_source,
  add column color_reference    public.color_reference,
  add column color_light        public.light_preset,
  add column color_inherited    boolean not null default false,
  add column file_photo_date       date,
  add column file_photo_date_exact boolean,
  add column original_width  integer,
  add column original_height integer,
  add column provenance public.photo_provenance not null default 'OWN';

comment on column public.images.color_temperature is
  'Balance de blancos, eje cálido-frío: −60 (más frío) a +60 (más cálido). Nulo o 0 es no tocar nada. Se aplica en luz lineal y con las ganancias normalizadas, así que corregir la dominante solo puede oscurecer y nunca quema por sí solo las altas luces.';
comment on column public.images.color_tint is
  'Balance de blancos, eje verde-magenta: −40 a +40. Nulo o 0 es no tocar nada.';
comment on column public.images.color_exposure is
  'Exposición en pasos (EV): −2,00 a +2,00. Nulo o 0 es no tocar nada. El ajuste automático se limita a ±1,00, la mitad: sugerir de más es peor que no sugerir.';
comment on column public.images.color_black is
  'Punto negro, 0 a 64: el código de entrada que pasa a ser negro. Nulo o 0 es no tocar nada.';
comment on column public.images.color_white is
  'Punto blanco, 192 a 255: el código de entrada que pasa a ser blanco. Nulo o 255 es no tocar nada.';
comment on column public.images.color_gamma is
  'Medios tonos, 0,60 a 1,60. Aclara u oscurece la zona media sin mover el negro ni el blanco. Nulo o 1,00 es no tocar nada.';
comment on column public.images.color_shoulder is
  'Suavizado de las altas luces, 0 a 100: comprime la zona más clara en vez de recortarla en plano. Nulo o 0 es no tocar nada.';
comment on column public.images.color_gray is
  'Pasar la fotografía a blanco y negro (luminancia Rec. 709 en luz lineal). Solo se ofrece en las tomas de reverso y de detalle de firma, donde el color no es el dato; en un detalle de daño o de marco sí lo es.';
comment on column public.images.color_neutral_x is
  'Punto que se tocó con el cuentagotas para fijar el gris, coordenada horizontal en fracciones (0..1) de la imagen YA GIRADA: el mismo sistema de coordenadas normalizado que crop_* y corner_*, para que la tabla tenga uno y no tres. Va en pareja con color_neutral_y.';
comment on column public.images.color_neutral_y is
  'Coordenada vertical del punto tomado con el cuentagotas, en fracciones (0..1) de la imagen ya girada. Va en pareja con color_neutral_x.';
comment on column public.images.color_clipped_low is
  'Porcentaje de píxeles que quedaron empastados en negro al aplicar este ajuste (0,00 a 99,99). Es la consecuencia y no la decisión: dice cuánto detalle de sombra se perdió, y se escribe cuando se aplica, con el encuadre y el nivel de ese momento. Recalcularlo después desde el máster no es lo mismo que constar.';
comment on column public.images.color_clipped_high is
  'Porcentaje de píxeles que quedaron quemados en blanco al aplicar este ajuste (0,00 a 99,99). Igual que color_clipped_low: se anota al aplicar, para que un informe de conservación pueda auditar qué detalle se sacrificó y no tenga que fiarse de una cuenta hecha años después.';
comment on column public.images.color_source is
  'De dónde salió el ajuste de color de esta fotografía. Nulo es «no se sabe»: nadie ha mirado todavía su color. Ojo: eso no es lo mismo que REVIEWED_UNCHANGED, que es haberlo mirado y haberlo dejado igual.';
comment on column public.images.color_reference is
  'De dónde salió la referencia neutra del ajuste (RF-418). Nulo cuando no hay ajuste, o cuando el ajuste no necesitó ninguna referencia.';
comment on column public.images.color_light is
  'Tipo de luz elegido como punto de partida, si se eligió alguno. Nulo significa que no se usó ninguno, no que se ignore qué luz había.';
comment on column public.images.color_inherited is
  'El ajuste no se decidió para esta toma: se heredó de la toma general de la obra. La pantalla lo indica, se puede cambiar toma por toma y se puede restablecer a lo heredado. Es un hecho sobre cómo llegó el ajuste, no sobre sus números: comparar los valores con los de la toma general diría «heredado» también cuando coinciden por casualidad.';
comment on column public.images.file_photo_date is
  'Fecha de la toma leída del fichero de la fotografía. NO sustituye a photo_date, que es la fecha de la ficha: las dos pueden diferir legítimamente y se conservan las dos.';
comment on column public.images.file_photo_date_exact is
  'Cierto si la fecha del fichero es la de la toma (DateTimeOriginal); falso si es aproximada (DateTime del IFD0, que por especificación es la fecha de modificación del fichero). Nulo solo si no hay fecha del fichero.';
comment on column public.images.original_width is
  'Ancho en píxeles del máster tal como lo entrega el decodificador, con la orientación EXIF ya aplicada. No es PixelXDimension del EXIF, que en 16 de los 44 másteres viene sin girar y no coincide con lo que se ve.';
comment on column public.images.original_height is
  'Alto en píxeles del máster tal como lo entrega el decodificador, con la orientación EXIF ya aplicada. Va en pareja con original_width.';
comment on column public.images.provenance is
  'Procedencia de la fotografía (RF-417). Por omisión propia, que es lo que son 35 de las 39; las cuatro reproducciones tomadas de otros catálogos se marcan a mano. En las que no son propias no se ofrece el ajuste de color.';


-- ── Los rangos, uno por columna y con nombre propio ─────────
--
-- Una restricción por parámetro, y no un `check` grande con todo dentro, porque
-- lo que Postgres dice al rechazar es el nombre de la restricción: con uno solo,
-- un ajuste rechazado no diría qué mando se fue de rango. Son también los rangos
-- de los mandos de la interfaz, y tenerlos aquí es lo que hace que un cliente con
-- un error de escala no pueda escribir un ajuste que nadie podrá volver a abrir.
alter table public.images
  add constraint images_color_temperature_range
  check (color_temperature between -60 and 60);

alter table public.images
  add constraint images_color_tint_range
  check (color_tint between -40 and 40);

alter table public.images
  add constraint images_color_exposure_range
  check (color_exposure between -2.00 and 2.00);

alter table public.images
  add constraint images_color_black_range
  check (color_black between 0 and 64);

alter table public.images
  add constraint images_color_white_range
  check (color_white between 192 and 255);

alter table public.images
  add constraint images_color_gamma_range
  check (color_gamma between 0.60 and 1.60);

alter table public.images
  add constraint images_color_shoulder_range
  check (color_shoulder between 0 and 100);

-- El punto del cuentagotas está dentro de la fotografía, y no admite el margen de
-- un cuarto que sí admiten las esquinas: una esquina fuera del encuadre es un
-- caso real —la obra se sale de la toma en cinco fotografías del lote—, pero un
-- gris fuera del encuadre no existe, no hay píxeles ahí de donde leerlo.
alter table public.images
  add constraint images_color_neutral_inside_image
  check (
    color_neutral_x is null or (
      color_neutral_x between 0 and 1 and color_neutral_y between 0 and 1
    )
  );

-- Los dos o ninguno: media coordenada no es medio punto, es ningún punto, y quien
-- lo leyera tendría que adivinar la otra mitad. Es la única regla de conjunto que
-- hay entre las columnas de color, y está aquí porque estas dos no son dos
-- parámetros: son un sitio.
alter table public.images
  add constraint images_color_neutral_pair
  check (num_nonnulls(color_neutral_x, color_neutral_y) in (0, 2));

-- La curva no se puede invertir ni colapsar: entre el punto negro y el punto
-- blanco tienen que quedar al menos 128 códigos de los 256, la mitad de la
-- escala. Los `coalesce` son los que hacen que la regla también valga cuando solo
-- se ha tocado uno de los dos, porque nulo aquí es identidad (0 y 255).
--
-- Y sí, hoy esto ya se deduce de las dos restricciones anteriores: con el negro
-- como máximo en 64 y el blanco como mínimo en 192, la diferencia nunca baja de
-- 128. Se escribe igual porque **la propiedad que importa es esta**, no la
-- coincidencia aritmética de dos topes que se eligieron por separado: si algún día
-- se ensancha uno de los dos rangos, la regla que impide una fotografía negra
-- sigue estando escrita en el sitio donde se puede leer, en vez de haber
-- desaparecido sin que nadie lo note.
alter table public.images
  add constraint images_color_range_usable
  check (coalesce(color_white, 255) - coalesce(color_black, 0) >= 128);

-- El tamaño del original: los dos lados o ninguno, y los dos positivos. Un ancho
-- sin alto no es un tamaño, y un cero significaría una fotografía sin píxeles,
-- que es un dato que solo puede venir de una cuenta mal hecha.
alter table public.images
  add constraint images_original_size_pair
  check (num_nonnulls(original_width, original_height) in (0, 2));

alter table public.images
  add constraint images_original_size_positive
  check (
    original_width is null or (original_width > 0 and original_height > 0)
  );

-- Una fecha del fichero sin decir si es exacta no sirve para nada: la duda es
-- justo el dato. De los 44 másteres, 21 traen DateTimeOriginal y **los 14
-- críticos de 2022 solo traen el DateTime del IFD0**, que por especificación es
-- la fecha de modificación del fichero y por tanto solo se aproxima a la de la
-- toma. Guardar las dos cosas en una columna —«2022-10-09, y quién sabe»— es lo
-- que la aplicación no puede permitirse: «sin revisar» no es «no», y aproximado
-- no es exacto.
alter table public.images
  add constraint images_file_photo_date_precision
  check (file_photo_date is null or file_photo_date_exact is not null);


-- ── Las dos fechas, y por qué son dos ───────────────────────
--
-- Decisión explícita del propietario: `file_photo_date` **no sustituye a**
-- `photo_date` y no lo pisa nunca. Las dos pueden diferir con toda legitimidad
-- —una obra fotografiada en 2022 y catalogada en 2026, una toma repetida, un
-- fichero copiado— y son dos hechos distintos: una es lo que dice el fichero y la
-- otra es lo que declara quien cataloga. Reducirlas a una sería tirar la que
-- estorbe, y la que estorba cambia según el caso.
--
-- Hoy **las 39 filas activas tienen `photo_date` = fecha de subida**: ninguna
-- ficha tiene la fecha real de la toma. Y **esta migración no repara ninguna fila
-- hacia atrás**: rellenar `file_photo_date` exigiría descargar y parsear 39
-- másteres, no hay servidor que lo haga, y hacerlo desde el navegador de una
-- catalogadora sería trabajo suyo pagado con datos que la aplicación puede leer
-- sola la próxima vez que abra cada fotografía. Nulo aquí significa «no se ha
-- leído el fichero todavía», que es la verdad.
--
-- La interfaz enseña la diferencia en voz baja —«la foto dice 9 de octubre de
-- 2022»— y sin alarma, porque hoy difieren las 39 y una alarma que salta siempre
-- deja de ser una alarma.


-- ── Lo que la base NO prohíbe, a propósito ──────────────────
--
-- No hay restricción que impida color en una fila con `provenance <> 'OWN'`,
-- aunque el ajuste no se ofrezca ahí. Si la hubiera, reclasificar como ajena una
-- fotografía que ya se corrigió fallaría al guardar, y la usuaria se quedaría sin
-- poder anotar la procedencia correcta justo en el caso en el que más importa
-- anotarla. La regla vive en la interfaz, que no ofrece el ajuste, y en
-- `composeEdits`, que lanza; la base guarda los dos hechos y no obliga a elegir.
--
-- Tampoco hay restricción que ligue `color_reference` a `color_source`. Un ajuste
-- puede empezar en un preset, seguir con el cuentagotas sobre un cartón y acabar
-- retocado a mano: las combinaciones razonables son casi todas, y un `check` que
-- las enumerara envejecería peor que el enumerado.


-- ── Privilegios: comprobado, no supuesto ────────────────────
--
-- CLAUDE.md avisa de que la plataforma concede por omisión todos los privilegios
-- de cada tabla nueva a `anon` y `authenticated`, y de que conviene comprobarlo en
-- vez de creerlo. Comprobado contra esta base, en `information_schema` y antes y
-- después del `alter table` de arriba:
--
--   · `anon` no tiene ningún privilegio sobre public.images —ni uno, tampoco
--     `select`—, y tampoco tiene `usage` sobre el esquema public. Las 21 columnas
--     nuevas no le abren nada.
--   · `authenticated` tiene `select`, `insert` y `update` **sobre la tabla**, no
--     sobre una lista de columnas. Un privilegio de tabla alcanza a las columnas
--     que se añadan después, así que las 21 nuevas aparecen ya con esos tres
--     privilegios en `information_schema.column_privileges` y **no hay nada que
--     conceder**: 51 columnas × 3 privilegios, y ningún `delete`, que es el que
--     había que vigilar.
--
-- Es decir: un `alter table add column` hereda los privilegios de la tabla, y
-- aquí eso es exactamente lo que se quiere. Quien puede editar una fotografía
-- puede editar su color, y la política `images_update` (`can_edit()`) es la que
-- decide quién es ese: un Lector no escribe ninguna de estas columnas, y eso se
-- verifica autenticándose de verdad en `rls_role_matrix.test.sql`, no leyendo esta
-- migración.
--
-- Los cuatro enumerados sí necesitan su concesión, porque el `usage` de un tipo
-- nuevo lo tiene `public` por omisión. Se cierra igual que se cerró `crop_source`.
revoke all on type public.color_source from public;
revoke all on type public.color_reference from public;
revoke all on type public.light_preset from public;
revoke all on type public.photo_provenance from public;

grant usage on type public.color_source to authenticated;
grant usage on type public.color_reference to authenticated;
grant usage on type public.light_preset to authenticated;
grant usage on type public.photo_provenance to authenticated;
