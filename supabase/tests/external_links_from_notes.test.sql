-- El traslado de las direcciones que vivían dentro de una nota:
-- RF-1401, RF-1402, RF-1405, RF-1407, y RF-801 y RF-802 por lo que NO se movió.
--
-- Este fichero es distinto de todos los demás de la carpeta: no crea sus datos
-- para lo esencial, porque lo que verifica es UN ESTADO QUE UNA MIGRACIÓN YA DEJÓ
-- EN LA BASE. Los fixtures que hay al final existen solo para el aserto de
-- idempotencia, que necesita una nota nueva sin tocar el catálogo real.
--
-- ── CÓMO ESTÁ ESCRITO PARA QUE VALGA EN LAS DOS BASES ───────
--
-- La verificación automática arranca el stack sobre un volumen limpio y corre
-- `make db-test` SIN haber cargado ningún volcado: ahí no existe AR-0001 y no hay
-- ninguna nota. Sobre una copia local del volcado hay dos. Así que todo aserto
-- está escrito como una invariante que se cumple en las dos: los bucles recorren
-- las notas que HAY —cero o dos—, y el recuento admite 0 y 2 y ningún otro, que es
-- literalmente la misma guarda que lleva la migración. Los dos envejecen juntos y
-- no a destiempo: el día que aparezca una tercera nota con una dirección dentro se
-- ponen rojos los dos a la vez.
--
-- ── EL RASTRO POR EL QUE SE RECONOCE LO QUE HIZO LA MIGRACIÓN ──
--
-- `created_by is null`. `tg_row_audit` firma con `auth.uid()`, que dentro de una
-- migración no es nadie, así que una fila de enlace sin firma solo puede haberla
-- escrito una migración y una firmada solo puede haberla escrito una persona. De
-- ahí sale todo lo que este fichero puede afirmar sin caducar en cuanto alguien
-- añada su primer enlace a mano: los asertos hablan de LOS ENLACES SIN FIRMA, no
-- de «los enlaces que hay».
--
-- El mismo rastro, al revés, es el que prueba que la migración no tocó ninguna
-- obra: si hubiera escrito sobre `artworks`, `tg_artwork_audit_trail` habría
-- puesto `updated_by` a nulo. Que las dos obras sigan con su `updated_by` firmado
-- es exactamente el aserto de RF-801 y RF-802, y sigue valiendo cuando alguien las
-- edite mañana.
\set ON_ERROR_STOP on
begin;


-- ── 1. El mismo recuento que la guarda de la migración ───────
--
-- Va primero porque mira los datos que hay, antes de que los fixtures del final
-- añadan los suyos. 0 sobre una base recién migrada, 2 sobre el catálogo real.
-- Cualquier otro número es una nota nueva con una dirección dentro que nadie ha
-- trasladado, y ese es el fallo que toda esta entrega existe para terminar.
do $$
declare v_notas int;
begin
  select count(*) into v_notas
    from public.artworks
   where inventory_process_notes ilike '%http%';

  if v_notas not in (0, 2) then
    raise exception
      'FAIL: hay % notas de inventario con una dirección dentro y el traslado conoce 2 (RF-1401)',
      v_notas;
  end if;

  if v_notas = 0 then
    raise notice 'OK: base recién migrada, sin notas con dirección dentro: nada que trasladar';
  else
    raise notice 'OK: siguen siendo dos las notas de inventario con una dirección dentro (RF-1401)';
  end if;
end $$;


-- ── 2. Ninguna dirección se quedó dentro de la prosa ────────
--
-- Por cada nota con una dirección, un enlace anclado a la obra: exactamente uno,
-- activo, de tipo página de museo, con la dirección que la nota lleva dentro y sin
-- firma —lo trasladó la migración, no una persona—.
--
-- La correspondencia se comprueba con `like '%' || e.url || '%'` y no extrayendo la
-- URL de la prosa con una expresión regular, por lo mismo que la migración las
-- escribió literales: un `regexp` se llevaría el punto final de la frase pegado al
-- final de la dirección y este test estaría comprobando otra cosa.
do $$
declare
  v_obra    record;
  v_enlaces int;
  v_fila    public.external_links;
begin
  for v_obra in
    select catalog_id, inventory_process_notes
      from public.artworks
     where inventory_process_notes ilike '%http%'
     order by catalog_id
  loop
    select count(*) into v_enlaces
      from public.external_links
     where artwork_id = v_obra.catalog_id
       and link_type = 'MUSEUM_PAGE'
       and created_by is null
       and active;

    if v_enlaces <> 1 then
      raise exception
        'FAIL: la obra % tiene % enlaces de museo trasladados y debería tener uno (RF-1401)',
        v_obra.catalog_id, v_enlaces;
    end if;

    select * into v_fila
      from public.external_links
     where artwork_id = v_obra.catalog_id and link_type = 'MUSEUM_PAGE' and created_by is null;

    if v_obra.inventory_process_notes not like '%' || v_fila.url || '%' then
      raise exception
        'FAIL: el enlace de % lleva una dirección que no está en su nota: [%]',
        v_obra.catalog_id, v_fila.url;
    end if;

    if not public.is_web_url(v_fila.url) then
      raise exception
        'FAIL: la dirección trasladada de % no pasa la validación del esquema (RF-1403): [%]',
        v_obra.catalog_id, v_fila.url;
    end if;

    -- Nace SIN COMPROBAR, que no es «funciona» y no es «roto» (RF-1405). Nadie ha
    -- abierto esa página, y una migración no está en condiciones de afirmar que
    -- carga. El trigger de congelado lo garantiza aunque el insert pidiera otra
    -- cosa, y esto lo mide en la fila real.
    if v_fila.check_status is not null
       or v_fila.checked_at is not null
       or v_fila.checked_by is not null then
      raise exception
        'FAIL: el enlace trasladado de % nace comprobado, y nadie lo ha comprobado (RF-1405)',
        v_obra.catalog_id;
    end if;

    -- Y con un título que se lee, no con la dirección desnuda: cuando el título
    -- falta la interfaz enseña el dominio, pero aquí sí se sabía qué había al otro
    -- lado y se escribió (RF-1402).
    if btrim(coalesce(v_fila.title, '')) = '' then
      raise exception
        'FAIL: el enlace trasladado de % se quedó sin título y aquí sí se sabía (RF-1402)',
        v_obra.catalog_id;
    end if;
  end loop;

  raise notice 'OK: cada nota con una dirección dentro tiene su enlace pulsable, sin comprobar y con título (RF-1401, RF-1402, RF-1405)';
end $$;


-- ── 3. El texto de las notas es idéntico al que había ───────
--
-- La migración no reescribe la prosa de la catalogadora: la frase dice algo que el
-- enlace no dice —que de ahí salieron TODOS los datos catalográficos, no solo la
-- imagen— y corregirla automáticamente no es migrar datos, es corregir a una
-- persona. Se compara contra la cadena literal, byte a byte, y no contra un
-- patrón: un patrón dejaría pasar justamente el recorte que se teme.
--
-- Escrito como «si la obra existe, su nota es esta» para que sobre una base recién
-- migrada no diga nada en vez de fallar.
do $$
declare v_texto text; v_esperado record;
begin
  for v_esperado in
    select * from (values
      ('AR-0001', 'Todos los datos catalográficos, incluida la imagen, han sido tomados de la web del MACVA: https://www.macvac.es/artista/rotili-zampanoli-alberto/'),
      ('RC-0005', 'Todos los datos catalográficos, incluida la imagen, han sido tomados de la web del MACVA: https://www.macvac.es/obra/saliente-en-el-espacio/')
    ) as v (catalog_id, nota)
  loop
    select inventory_process_notes into v_texto
      from public.artworks where catalog_id = v_esperado.catalog_id;

    if v_texto is null then
      continue;  -- Base sin volcado: esa obra no existe y no hay nada que comparar.
    end if;

    if v_texto <> v_esperado.nota then
      raise exception
        'FAIL: la nota de inventario de % ha cambiado. Esperada [%], encontrada [%]',
        v_esperado.catalog_id, v_esperado.nota, v_texto;
    end if;
  end loop;

  raise notice 'OK: el traslado no ha tocado ni una letra de las notas de inventario';
end $$;


-- ── 4. La reproducción dice ahora de dónde salió (RF-1407) ──
--
-- Es la mitad que le faltaba a RF-417: `provenance` podía decir que una fotografía
-- venía de otro catálogo, pero no de cuál. Una procedencia sin origen es media
-- respuesta, y la mitad que falta es la que se necesita para volver a la fuente.
do $$
declare
  v_obra    record;
  v_enlaces int;
  v_fila    public.external_links;
  v_proc    public.photo_provenance;
begin
  for v_obra in
    select catalog_id, inventory_process_notes
      from public.artworks
     where inventory_process_notes ilike '%http%'
     order by catalog_id
  loop
    select count(*) into v_enlaces
      from public.external_links
     where image_id = v_obra.catalog_id || '_v1'
       and link_type = 'PHOTO_SOURCE'
       and created_by is null
       and active;

    if v_enlaces <> 1 then
      raise exception
        'FAIL: la fotografía %_v1 tiene % enlaces de origen trasladados y debería tener uno (RF-1407)',
        v_obra.catalog_id, v_enlaces;
    end if;

    select * into v_fila
      from public.external_links
     where image_id = v_obra.catalog_id || '_v1'
       and link_type = 'PHOTO_SOURCE' and created_by is null;

    if v_obra.inventory_process_notes not like '%' || v_fila.url || '%' then
      raise exception
        'FAIL: el enlace de origen de %_v1 no lleva la dirección de la nota de su obra',
        v_obra.catalog_id;
    end if;

    if v_fila.check_status is not null or v_fila.checked_at is not null then
      raise exception
        'FAIL: el enlace de origen de %_v1 nace comprobado (RF-1405)', v_obra.catalog_id;
    end if;

    -- Y la marca: con el origen escrito, decir que no es propia ya no es una
    -- corazonada. La evidencia está en la nota —«incluida la imagen»— y en el
    -- enlace que acaba de comprobarse.
    select provenance into v_proc
      from public.images where image_id = v_obra.catalog_id || '_v1';

    if v_proc <> 'OTHER_CATALOG' then
      raise exception
        'FAIL: %_v1 tiene su enlace de origen y sigue contando como propia (procedencia %) (RF-417, RF-1407)',
        v_obra.catalog_id, v_proc;
    end if;
  end loop;

  raise notice 'OK: cada reproducción trasladada dice de dónde salió y consta como tomada de otro catálogo (RF-417, RF-1407)';
end $$;


-- ── 5. Y no marcó de más, que es tan grave como marcar de menos ──
--
-- Las dos mitades del aserto. La primera —«no de menos»— es el bucle de arriba.
-- Esta es la segunda, y se escribe sobre EL RASTRO DE LA MIGRACIÓN y no sobre un
-- recuento congelado, por un motivo que este repositorio ya aprendió: el aserto
-- «ninguna fila con recorte tiene además procedencia» de `image_perspective` caducó
-- por uso legítimo, y un test que se pone rojo porque la herramienta se ha usado
-- deja de avisar del fallo nuevo. Un «exactamente 42 propias» caducaría igual: el
-- recuento del lote habla de CUATRO reproducciones y RF-1407 espera que la
-- catalogadora identifique las otras dos con la obra delante.
--
-- Lo que sí es invariante: NINGÚN ENLACE SIN FIRMA CUELGA DE DONDE NO SALIÓ. Su
-- dirección tiene que seguir estando dentro de una nota de inventario. Con eso más
-- el `exists` que el `update` de la migración lleva escrito —solo marca la
-- fotografía cuyo enlace de origen aterrizó— queda probado que marcó exactamente
-- tantas como notas y ninguna más, sin congelar ningún número.
do $$
declare v_sueltos int; v_de_foto int; v_notas int;
begin
  select count(*) into v_notas
    from public.artworks where inventory_process_notes ilike '%http%';

  select count(*) into v_sueltos
    from public.external_links e
   where e.created_by is null
     and not exists (
       select 1 from public.artworks a
        where a.inventory_process_notes like '%' || e.url || '%'
     );

  if v_sueltos > 0 then
    raise exception
      'FAIL: % enlaces sin firma llevan una dirección que no está en ninguna nota: o se ancló mal o se reescribió una nota',
      v_sueltos;
  end if;

  -- Y ninguno más colgando de una fotografía: dos notas, dos enlaces de origen.
  select count(*) into v_de_foto
    from public.external_links
   where image_id is not null and created_by is null;

  if v_de_foto <> v_notas then
    raise exception
      'FAIL: hay % enlaces sin firma colgando de una fotografía para % notas con dirección',
      v_de_foto, v_notas;
  end if;

  raise notice 'OK: el traslado no ha anclado ni un enlace donde no salió, ni ha marcado ninguna fotografía de más';
end $$;


-- ── 6. Ninguna obra ha movido su traza (RF-801, RF-802) ────
--
-- La migración inserta enlaces y escribe dos columnas de `images`, y afirma en su
-- cabecera que por eso NO necesita desactivar `artwork_audit_trail`. Esto lo
-- comprueba en vez de creerlo, y por el rastro y no por un valor congelado: si
-- hubiera escrito sobre `artworks` —directamente, o de rebote por
-- `recalculate_photographed`—, el trigger habría puesto `updated_by` a nulo,
-- porque dentro de una migración `auth.uid()` no es nadie.
--
-- Que las dos obras del traslado sigan con su autoría firmada es el aserto, y
-- sobrevive a que alguien las edite mañana: una edición de una persona vuelve a
-- firmarlas.
do $$
declare v_obra record; v_n int := 0;
begin
  for v_obra in
    select catalog_id, updated_by, updated_at, basic_updated_at, photographed
      from public.artworks
     where inventory_process_notes ilike '%http%'
     order by catalog_id
  loop
    if v_obra.updated_by is null then
      raise exception
        'FAIL: la obra % ha perdido la firma de quién la actualizó: algo escribió sobre artworks sin sesión (RF-801)',
        v_obra.catalog_id;
    end if;

    -- Y su indicador de fotografiada no se ha recalculado en falso: sigue cierto,
    -- que es lo que era, porque tiene fotografías activas.
    if not v_obra.photographed then
      raise exception
        'FAIL: la obra % ha dejado de constar como fotografiada', v_obra.catalog_id;
    end if;

    -- La fecha de la última revisión física no se toca al trasladar una dirección:
    -- una dirección no se comprueba con la obra delante (RF-802).
    if v_obra.basic_updated_at > v_obra.updated_at then
      raise exception
        'FAIL: la obra % tiene la revisión física más reciente que su última actualización (RF-802)',
        v_obra.catalog_id;
    end if;

    v_n := v_n + 1;
  end loop;

  raise notice 'OK: las % obras del traslado conservan su traza: nadie escribió sobre ellas sin sesión (RF-801, RF-802)', v_n;
end $$;


-- ── 7. Idempotencia: el cuerpo del traslado, otra vez ──────
--
-- Ejecutar esto dos veces no debe duplicar nada, y no debe duplicarlo POR EL
-- `not exists` Y NO POR EL ÍNDICE ÚNICO: un `insert` que choca contra un índice
-- aborta la transacción entera, así que la segunda pasada de una migración
-- reejecutada se llevaría por delante todo lo que viniera detrás. Lo que se afirma
-- es que no inserta ninguna fila y no lanza ninguna excepción.
--
-- Son las dos sentencias de la migración, copiadas tal cual.
do $$
declare v_filas int;
begin
  insert into public.external_links (artwork_id, url, title, link_type, note)
  select v.catalog_id, v.url, v.title, 'MUSEUM_PAGE', v.note
    from (values
      ('AR-0001', 'https://www.macvac.es/artista/rotili-zampanoli-alberto/', 'Página del artista en el MACVA', 'Segunda pasada'),
      ('RC-0005', 'https://www.macvac.es/obra/saliente-en-el-espacio/',      'Ficha en el MACVA',              'Segunda pasada')
    ) as v (catalog_id, url, title, note)
    join public.artworks a on a.catalog_id = v.catalog_id
   where a.inventory_process_notes like '%' || v.url || '%'
     and not exists (
       select 1 from public.external_links e
        where e.artwork_id = v.catalog_id and e.url = v.url
     );
  get diagnostics v_filas = row_count;
  if v_filas <> 0 then
    raise exception 'FAIL: la segunda pasada del traslado ha insertado % enlaces de ficha', v_filas;
  end if;

  insert into public.external_links (image_id, url, title, link_type, note)
  select v.image_id, v.url, 'De dónde salió esta reproducción', 'PHOTO_SOURCE', v.note
    from (values
      ('AR-0001_v1', 'AR-0001', 'https://www.macvac.es/artista/rotili-zampanoli-alberto/', 'Segunda pasada'),
      ('RC-0005_v1', 'RC-0005', 'https://www.macvac.es/obra/saliente-en-el-espacio/',      'Segunda pasada')
    ) as v (image_id, catalog_id, url, note)
    join public.images   i on i.image_id   = v.image_id
    join public.artworks a on a.catalog_id = v.catalog_id
   where a.inventory_process_notes like '%' || v.url || '%'
     and not exists (
       select 1 from public.external_links e
        where e.image_id = v.image_id and e.url = v.url
     );
  get diagnostics v_filas = row_count;
  if v_filas <> 0 then
    raise exception 'FAIL: la segunda pasada del traslado ha insertado % enlaces de fotografía', v_filas;
  end if;

  update public.images i
     set provenance = 'OTHER_CATALOG'
   where i.image_id in ('AR-0001_v1', 'RC-0005_v1')
     and i.provenance = 'OWN'
     and exists (
       select 1 from public.external_links e
        where e.image_id = i.image_id and e.link_type = 'PHOTO_SOURCE' and e.active
     );
  get diagnostics v_filas = row_count;
  if v_filas <> 0 then
    raise exception 'FAIL: la segunda pasada del traslado ha vuelto a marcar % fotografías', v_filas;
  end if;

  raise notice 'OK: el cuerpo del traslado es idempotente, y lo es por el not exists y no por el índice único';
end $$;


-- ── 8. Y la guarda del not exists llega antes que el índice ──
--
-- El aserto anterior no distingue «no insertó» de «no había nada que insertar», así
-- que aquí se monta el caso a propósito sobre datos de prueba: una obra con una
-- nota que lleva una dirección dentro, el enlace ya trasladado, y la misma
-- sentencia otra vez. Si el `not exists` no estuviera, esto saltaría con violación
-- de unicidad y el bloque siguiente no llegaría a ejecutarse.
--
-- Los identificadores llevan marca de prueba para no chocar con el catálogo real
-- cuando esta batería corre sobre una copia del volcado.
insert into public.artworks (catalog_id, artist, title, attributed_title, inventory_process_notes)
values ('AR-9800', 'ROTILI', 'Obra con dirección en la nota', 'UNCONFIRMED',
        'Ficha tomada de https://prueba-traslado.example/obra/9800/ el día del volcado.');

do $$
declare v_filas int; v_veces int;
begin
  for v_veces in 1..2 loop
    insert into public.external_links (artwork_id, url, title, link_type)
    select v.catalog_id, v.url, 'Ficha de prueba', 'MUSEUM_PAGE'
      from (values ('AR-9800', 'https://prueba-traslado.example/obra/9800/'))
             as v (catalog_id, url)
      join public.artworks a on a.catalog_id = v.catalog_id
     where a.inventory_process_notes like '%' || v.url || '%'
       and not exists (
         select 1 from public.external_links e
          where e.artwork_id = v.catalog_id and e.url = v.url
       );
    get diagnostics v_filas = row_count;

    if v_veces = 1 and v_filas <> 1 then
      raise exception 'FAIL: la primera pasada no ha trasladado la dirección de la nota de prueba';
    end if;
    if v_veces = 2 and v_filas <> 0 then
      raise exception 'FAIL: la segunda pasada ha duplicado el enlace de la nota de prueba';
    end if;
  end loop;

  raise notice 'OK: la guarda del not exists corta la segunda pasada antes del índice único, sin abortar la transacción';
exception
  when unique_violation then
    raise exception 'FAIL: la segunda pasada ha llegado al índice único: sin not exists, una migración reejecutada abortaría entera';
end $$;

-- Y el contrario, que es lo que hace que el aserto de arriba signifique algo: una
-- dirección que NO está en la nota no se traslada, aunque se escriba en la lista.
-- Es la protección contra una nota reescrita entre que la migración se escribió y
-- se aplicó: antes que escribir una dirección que ya no está donde decía estar, no
-- se escribe nada y la guarda del recuento lo denuncia.
do $$
declare v_filas int;
begin
  insert into public.external_links (artwork_id, url, title, link_type)
  select v.catalog_id, v.url, 'Dirección que no estaba en la nota', 'MUSEUM_PAGE'
    from (values ('AR-9800', 'https://prueba-traslado.example/otra-cosa/'))
           as v (catalog_id, url)
    join public.artworks a on a.catalog_id = v.catalog_id
   where a.inventory_process_notes like '%' || v.url || '%'
     and not exists (
       select 1 from public.external_links e
        where e.artwork_id = v.catalog_id and e.url = v.url
     );
  get diagnostics v_filas = row_count;

  if v_filas <> 0 then
    raise exception
      'FAIL: se ha trasladado una dirección que no está dentro de la nota de la obra';
  end if;
  raise notice 'OK: solo se traslada la dirección que la nota lleva de verdad dentro';
end $$;


rollback;
