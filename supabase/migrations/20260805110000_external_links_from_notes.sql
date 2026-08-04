-- ============================================================
-- El traslado de las direcciones que hoy viven dentro de una nota
-- (RF-1401, RF-1402, RF-1405, RF-1407).
--
-- La migración anterior creó la tabla donde cabe una dirección web. Esta saca de
-- la prosa las que ya están en el catálogo desde el primer volcado.
--
-- Medido contra esta base antes de escribir una línea: hay EXACTAMENTE DOS notas
-- de inventario con una dirección dentro, y no hay ninguna otra columna de texto
-- del catálogo que lleve una —se comprobaron las quince columnas de texto de
-- `artworks` y las siete de `images`, y las dos únicas coincidencias de `http` son
-- estas:
--
--   AR-0001  «Todos los datos catalográficos, incluida la imagen, han sido
--             tomados de la web del MACVA: https://www.macvac.es/artista/
--             rotili-zampanoli-alberto/»
--   RC-0005  «… https://www.macvac.es/obra/saliente-en-el-espacio/»
--
-- Ahí dentro esa dirección no se puede pulsar, no se puede buscar, no se puede
-- comprobar y no se puede atribuir a la fotografía que salió de ella. Es el caso
-- que justifica la tabla, y no es hipotético: está en el catálogo real.
--
-- ── LAS DIRECCIONES VAN ESCRITAS LITERALMENTE ───────────────
--
-- Y no extraídas con una expresión regular sobre la prosa. Un `regexp` se
-- llevaría el punto final de la frase pegado al final de la URL —y una URL con un
-- punto de más es una URL que no lleva a ninguna parte— o se rompería con el
-- siguiente formato de nota. Son dos filas que se revisan de un vistazo, así que
-- la forma correcta de sacarlas es leerlas y escribirlas.
--
-- Lo que sí se hace con la nota es COMPROBAR QUE LA CONTIENE: cada `insert` lleva
-- `inventory_process_notes like '%' || url || '%'`. Si alguien reescribió la nota
-- entre que esto se escribió y se aplica, la fila no se traslada y la guarda del
-- final lo dice a gritos en vez de escribir una dirección que ya no está donde
-- decía estar.
--
-- ── NO TOCA NI UNA LETRA DE LAS NOTAS ───────────────────────
--
-- La frase sigue leyéndose bien, dice algo que el enlace no dice —que de ahí
-- salieron TODOS los datos catalográficos, no solo la imagen— y reescribir
-- automáticamente la prosa de la catalogadora no es una migración de datos, es
-- corregirla. La dirección queda en los dos sitios y eso está bien: la nota
-- cuenta la historia y el enlace se puede pulsar.
--
-- ── NO DESACTIVA NINGÚN TRIGGER, Y HAY QUE DECIRLO ──────────
--
-- Es la excepción y por eso se afirma. Los traslados de ubicación y de vocabulario
-- hacen `alter table public.artworks disable trigger artwork_audit_trail` porque
-- escriben sobre `artworks` y dentro de una migración `auth.uid()` no es nadie:
-- firmar la obra con un autor nulo sería mentir sobre quién la tocó (RF-801).
-- Aquí no hace falta, y no por descuido:
--
--   · Solo se INSERTAN filas de una tabla nueva. `tg_row_audit` deja `created_by`
--     a nulo dentro de una migración, que es la verdad: esa fila no la creó
--     ninguna persona. Esa firma vacía es además el rastro por el que el test
--     reconoce lo que trasladó esta migración de lo que añadió alguien después.
--   · Se actualizan dos columnas de `public.images`, que NO tiene `updated_at`,
--     ni `updated_by`, ni trigger de auditoría en UPDATE. El único que salta es
--     `sync_photographed`, que llama a `recalculate_photographed`, y esa función
--     SE SALTA LA ESCRITURA cuando el valor ya es correcto —comprobado en su
--     definición, que lleva el `and a.photographed is distinct from …`—. Las dos
--     obras ya están marcadas como fotografiadas, así que no se reescribe ninguna
--     fila de `artworks` y ninguna fecha de ninguna obra se mueve.
--
-- Eso último no es una suposición: lo comprueba
-- `supabase/tests/external_links_from_notes.test.sql`.
--
-- ── SE APLICA SOBRE UNA BASE VACÍA SIN QUEJARSE ─────────────
--
-- La verificación automática arranca el stack sobre un volumen limpio y exige
-- «Migraciones OK» sin haber cargado ningún volcado: ahí no existe AR-0001, no
-- hay ninguna nota y no hay nada que trasladar. Por eso cada `insert` va unido por
-- `join` a la fila ancla y no la da por supuesta, y por eso la guarda del final
-- admite dos recuentos y solo dos: 0 —base recién migrada— y 2 —el catálogo real—.
-- Cualquier otro número es una nota nueva con una dirección dentro que nadie ha
-- mirado, y eso hay que verlo ahora y no dentro de un año.
-- ============================================================


-- ── 1. Un enlace por obra, anclado a la ficha ───────────────
--
-- `MUSEUM_PAGE` los dos, aunque una de las dos páginas sea la del artista dentro
-- de la web del museo: el tipo dice QUÉ CLASE DE SITIO es, y las dos son el sitio
-- del MACVA. `ARTIST_SITE` sería el sitio propio del artista, que no es esto.
--
-- Los títulos no son intercambiables y se reparten por lo que hay al otro lado, no
-- por el orden en que se escribieron: `/obra/saliente-en-el-espacio/` es la ficha
-- de la obra y `/artista/rotili-zampanoli-alberto/` es la página del artista.
-- Ponerlos al revés dejaría a la usuaria pulsando «Ficha en el MACVA» para
-- aterrizar en una biografía.
--
-- `check_status`, `checked_at` y `checked_by` NO se mandan, y aunque se mandaran
-- el trigger `external_link_check_freeze` los pondría a nulo: nadie ha abierto
-- esas dos páginas hoy y una migración no está en condiciones de afirmar que
-- funcionan (RF-1405). Nacen SIN COMPROBAR, que no es «roto» y no es «funciona».
--
-- El `not exists` es lo que hace que ejecutar este cuerpo dos veces no duplique
-- nada, y va DELANTE del índice único a propósito: el índice es la red de
-- seguridad y no el mecanismo, porque un `insert` que choca contra un índice
-- aborta la transacción entera y aquí lo que se quiere es que la segunda pasada
-- no haga nada y siga adelante.
insert into public.external_links (artwork_id, url, title, link_type, note)
select v.catalog_id, v.url, v.title, 'MUSEUM_PAGE', v.note
  from (values
    ('AR-0001',
     'https://www.macvac.es/artista/rotili-zampanoli-alberto/',
     'Página del artista en el MACVA',
     'De aquí salen todos los datos catalográficos de la ficha, incluida la fotografía. La nota de inventario lo cuenta con más palabras y se conserva tal cual.'),
    ('RC-0005',
     'https://www.macvac.es/obra/saliente-en-el-espacio/',
     'Ficha en el MACVA',
     'De aquí salen todos los datos catalográficos de la ficha, incluida la fotografía. La nota de inventario lo cuenta con más palabras y se conserva tal cual.')
  ) as v (catalog_id, url, title, note)
  join public.artworks a on a.catalog_id = v.catalog_id
 where a.inventory_process_notes like '%' || v.url || '%'
   and not exists (
     select 1 from public.external_links e
      where e.artwork_id = v.catalog_id and e.url = v.url
   );


-- ── 2. Un enlace por fotografía, anclado a la toma ──────────
--
-- Es lo que le faltaba a RF-417. Hasta ahora `provenance` podía decir que una
-- fotografía venía de otro catálogo, pero no DE CUÁL: una procedencia sin origen
-- es media respuesta, y la mitad que falta es justo la que se necesita para volver
-- a la fuente o para pedir permiso de reproducción.
--
-- El enlace se repite —la misma dirección cuelga de la obra y de su fotografía— y
-- eso no es una duplicación que haya que normalizar, son dos hechos distintos:
-- «esta ficha se documenta aquí» y «esta imagen se descargó de aquí». Cada uno
-- tiene su nota y su estado de comprobación propios, y el día que el museo mueva
-- la página el que importa arreglar primero es el segundo. Por eso los índices
-- únicos son (obra, url) y (foto, url) por separado y no uno solo sobre la url.
insert into public.external_links (image_id, url, title, link_type, note)
select v.image_id, v.url, 'De dónde salió esta reproducción', 'PHOTO_SOURCE', v.note
  from (values
    ('AR-0001_v1', 'AR-0001',
     'https://www.macvac.es/artista/rotili-zampanoli-alberto/',
     'La reproducción se descargó de esta página del MACVA. No es una toma propia: no se le ofrece ajuste de color, porque sería retocar el revelado de otra persona sobre una obra que no se ha visto con esa luz.'),
    ('RC-0005_v1', 'RC-0005',
     'https://www.macvac.es/obra/saliente-en-el-espacio/',
     'La reproducción se descargó de esta página del MACVA. No es una toma propia: no se le ofrece ajuste de color, porque sería retocar el revelado de otra persona sobre una obra que no se ha visto con esa luz.')
  ) as v (image_id, catalog_id, url, note)
  join public.images   i on i.image_id   = v.image_id
  join public.artworks a on a.catalog_id = v.catalog_id
 where a.inventory_process_notes like '%' || v.url || '%'
   and not exists (
     select 1 from public.external_links e
      where e.image_id = v.image_id and e.url = v.url
   );


-- ── 3. Y ahora sí se puede decir que no son propias ─────────
--
-- La evidencia está escrita en la propia ficha —«incluida la imagen»— y las dos
-- son además las dos reproducciones ya recortadas que la medición de bordes
-- identificó por el nombre de su fichero, `AR-0001_nmjb8v5w` y `RC-0005_xkq1cncq`:
-- «escaneos o descargas sin marco ni pared, con el contenido a 4-12 px del borde»
-- (docs/revision/deteccion-de-bordes-medicion.md, decisión 6).
--
-- LAS OTRAS DOS NO SE TOCAN. El recuento del lote habla de cuatro reproducciones
-- tomadas de otros catálogos; de dos de ellas no hay evidencia de cuáles son, y
-- marcar por corazonada es inventar el dato justo en la columna que existe para no
-- inventarlo. Quedan como `OWN` y la catalogadora las identificará con la obra
-- delante; mientras tanto la pantalla las lee como propias, que es lo que hoy
-- consta, y no como «ajenas, no sabemos de dónde», que sería una afirmación que
-- nadie ha hecho.
--
-- El `and provenance = 'OWN'` y el `exists` del enlace no son adorno:
--
--   · `provenance = 'OWN'` hace la sentencia idempotente y, sobre todo, impide que
--     una segunda pasada pise la clasificación que una persona haya hecho después.
--   · El `exists` ATA LA MARCA A SU EVIDENCIA. Solo se marca la fotografía cuyo
--     enlace de origen acaba de aterrizar: si el paso 2 no insertó nada —porque la
--     nota cambió, o porque la base está vacía— esta sentencia tampoco marca nada.
--     No queda ninguna fotografía dicha ajena sin decir de dónde salió.
update public.images i
   set provenance = 'OTHER_CATALOG'
 where i.image_id in ('AR-0001_v1', 'RC-0005_v1')
   and i.provenance = 'OWN'
   and exists (
     select 1 from public.external_links e
      where e.image_id = i.image_id
        and e.link_type = 'PHOTO_SOURCE'
        and e.active
   );


-- ── 4. El recuento, que es lo que convierte esto en una
--       migración y no en un intento ──────────────────────────
do $$
declare
  v_notas        int;
  v_de_obra      int;
  v_de_foto      int;
  v_marcadas     int;
  v_sin_origen   int;
  v_propias      int;
  v_sin_firma    int;
begin
  -- Cuántas notas de inventario llevan una dirección dentro. 0 sobre una base
  -- recién migrada; 2 sobre el catálogo real. Cualquier otro número significa que
  -- ha aparecido una nota nueva con una dirección y que hay que trasladarla a
  -- mano: es exactamente el fallo que esta migración existe para terminar, y
  -- dejarlo pasar en silencio sería volver a empezar.
  select count(*) into v_notas
    from public.artworks
   where inventory_process_notes ilike '%http%';

  if v_notas not in (0, 2) then
    raise exception
      'Hay % notas de inventario con una dirección dentro y esta migración conoce 2: traslada la nueva a mano antes de seguir',
      v_notas;
  end if;

  -- Los enlaces sin firma son los que trasladó una migración: `tg_row_audit` deja
  -- `created_by` a nulo cuando no hay sesión, y eso distingue lo que movió esta
  -- migración de lo que añadió una persona. Tienen que ser dos por nota —el de la
  -- ficha y el de la fotografía— y ninguno más.
  select count(*) into v_de_obra
    from public.external_links
   where artwork_id is not null and link_type = 'MUSEUM_PAGE' and created_by is null;

  select count(*) into v_de_foto
    from public.external_links
   where image_id is not null and link_type = 'PHOTO_SOURCE' and created_by is null;

  if v_de_obra <> v_notas or v_de_foto <> v_notas then
    raise exception
      'El traslado ha dejado % enlaces de ficha y % de fotografía para % notas con dirección: algo no ha emparejado',
      v_de_obra, v_de_foto, v_notas;
  end if;

  -- Y ninguno colgando de un sitio del que no salió: la dirección de cada enlace
  -- sin firma tiene que seguir estando dentro de la nota de la que se sacó. Esto
  -- caza a la vez un `insert` mal anclado y una nota reescrita.
  select count(*) into v_sin_firma
    from public.external_links e
   where e.created_by is null
     and not exists (
       select 1 from public.artworks a
        where a.inventory_process_notes like '%' || e.url || '%'
     );

  if v_sin_firma > 0 then
    raise exception
      '% enlaces trasladados llevan una dirección que ya no está en ninguna nota de inventario',
      v_sin_firma;
  end if;

  -- Las fotografías marcadas tienen que ser tantas como notas, y ni una más: la
  -- otra forma de fallar es marcar de más, y es tan grave como marcar de menos.
  select count(*) into v_marcadas
    from public.images
   where provenance = 'OTHER_CATALOG'
     and exists (
       select 1 from public.external_links e
        where e.image_id = images.image_id and e.link_type = 'PHOTO_SOURCE'
     );

  if v_marcadas <> v_notas then
    raise exception
      '% fotografías han quedado como tomadas de otro catálogo con su enlace de origen, y las notas con dirección son %',
      v_marcadas, v_notas;
  end if;

  -- Y la otra mitad del mismo aserto, la que cierra el `update`: en el momento de
  -- aplicar esto las 44 fotografías del catálogo valen `OWN`, así que NINGUNA
  -- puede quedar dicha ajena sin su enlace de origen. Un `where` mal escrito en el
  -- paso 3 se cazaría aquí y no seis meses después. Es una guarda del momento del
  -- traslado y no una invariante del esquema: RF-1407 permite luego, a una
  -- persona, marcar una reproducción como ajena y dejar el origen pendiente.
  select count(*) into v_sin_origen
    from public.images
   where provenance <> 'OWN'
     and not exists (
       select 1 from public.external_links e
        where e.image_id = images.image_id and e.link_type = 'PHOTO_SOURCE'
     );

  if v_sin_origen > 0 then
    raise exception
      '% fotografías han quedado dichas ajenas sin decir de dónde salieron: el traslado ha marcado de más',
      v_sin_origen;
  end if;

  select count(*) into v_propias
    from public.images where provenance = 'OWN';

  -- En voz alta y no como excepción, porque no es un fallo de la migración sino
  -- trabajo que le queda a una persona: el recuento del lote habla de cuatro
  -- reproducciones tomadas de otros catálogos y aquí solo hay evidencia escrita de
  -- dos. Las otras dos siguen contando como propias hasta que alguien las
  -- reconozca con la obra delante.
  raise notice
    'Trasladadas % direcciones de nota: % enlaces de ficha y % de fotografía. % fotografías marcadas como tomadas de otro catálogo; quedan % como propias, y de las cuatro reproducciones del lote faltan por identificar las que no tienen evidencia escrita.',
    v_notas, v_de_obra, v_de_foto, v_marcadas, v_propias;
end $$;
