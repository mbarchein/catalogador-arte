-- RF-420, RF-411: the full-resolution corrected copy, a photograph's fourth
-- file level.
--
-- What is checked is what the `check` can check and the client must not
-- check again on its own: that a size that is not a size does not go in,
-- that half a file description does not exist, that «the copy is there» and «the copy
-- is missing» cannot both be true in the same row, and —the whole file's
-- reason to exist— that **the corrected copy's path is never the master's**. The master
-- is never rewritten (ADR-002), and the realistic way of breaking that rule is not
-- a malicious `update`: it is deriving the copy's path from the master's and having them
-- coincide one day.
--
-- And three things that are not about values: that a row written **with none of the
-- new columns** is still valid —it is what the old frontend does during
-- the seconds in which both versions are in the air, and it is what allows
-- deploying in one phase—, that `corrected_pending` is born false, and that none of
-- the rows that already exist has filled itself in.
--
-- Every rejection is checked **by the name of the constraint that rejects it**, which
-- is the reason the migration wrote one constraint per rule instead of
-- one big `check`: the only thing Postgres says on rejecting is that name.
\set ON_ERROR_STOP on
begin;

insert into public.artworks (catalog_id, artist, title, attributed_title)
values ('AR-9602', 'ROTILI', 'Obra que se manda a la imprenta', 'UNCONFIRMED');

-- ── 1. A row with none of the new columns is still valid ─────
-- The single-phase deployment's guarantee: exactly what the frontend that does not know
-- these columns writes is written. And incidentally the only default value of the three
-- is pinned down, which is «no copy is missing».
do $$
declare v_row public.images;
begin
  insert into public.images (catalog_id, thumbnail_path, derivative_path, master_path)
  values ('AR-9602', 'q/min.webp', 'q/der.webp', 'q/AR-9602_ab12_master.jpg')
  returning * into v_row;

  if v_row.corrected_path is not null or v_row.corrected_bytes is not null then
    raise exception 'FAIL: una foto nueva nace con una copia corregida (% , %)',
      v_row.corrected_path, v_row.corrected_bytes;
  end if;

  -- False and not null, and the reason is that here false IS a fact: it means «no
  -- copy is missing», which is true of a freshly uploaded photograph with no
  -- corrections. Null would leave the question open in the 39 rows and in every
  -- new one, and then «pending» would distinguish nothing, which is precisely the only thing
  -- this column exists to do.
  if v_row.corrected_pending is null then
    raise exception 'FAIL: corrected_pending nace en nulo y tenía que nacer en falso';
  end if;
  if v_row.corrected_pending then
    raise exception 'FAIL: una foto nueva nace con la copia corregida pendiente';
  end if;

  raise notice 'OK: una fila sin las columnas nuevas es válida y nace sin copia y sin deuda';
end $$;

-- And the default value is declared in the table, not only achieved by the
-- shape of this `insert`: the other two have none, because a default
-- value in the path or in the size would be inventing a file.
do $$
declare r record; v_esperado text;
begin
  for r in
    select column_name, column_default, is_nullable
      from information_schema.columns
     where table_schema = 'public' and table_name = 'images'
       and column_name like 'corrected\_%'
  loop
    v_esperado := case r.column_name when 'corrected_pending' then 'false' else null end;
    if coalesce(r.column_default, '') <> coalesce(v_esperado, '') then
      raise exception 'FAIL: % tiene por omisión % y debía tener %',
        r.column_name, coalesce(r.column_default, 'nulo'), coalesce(v_esperado, 'nulo');
    end if;
  end loop;

  -- And `corrected_pending` is `not null`: a row where it is not known whether the copy
  -- is missing is the same ambiguity the column came to remove.
  select is_nullable into v_esperado
    from information_schema.columns
   where table_schema = 'public' and table_name = 'images'
     and column_name = 'corrected_pending';
  if v_esperado <> 'NO' then
    raise exception 'FAIL: corrected_pending admite nulo';
  end if;

  raise notice 'OK: solo corrected_pending tiene omisión, es falso, y no admite nulo';
end $$;

-- ── 2. A size that is not a size ─────────────────────────────
-- Zero bytes is an empty file and a negative is a badly done sum. Both
-- would reach the record as a download promising something that is not there.
do $$
declare r record; v_constraint text;
begin
  for r in
    select * from (values
      ('corrected_path = ''q/AR-9602_ab12_corr.jpg'', corrected_bytes = 0',
       'images_corrected_bytes_positive'),
      ('corrected_path = ''q/AR-9602_ab12_corr.jpg'', corrected_bytes = -1',
       'images_corrected_bytes_positive'),
      ('corrected_path = ''q/AR-9602_ab12_corr.jpg'', corrected_bytes = -4194304',
       'images_corrected_bytes_positive')
    ) as t(asignacion, restriccion)
  loop
    begin
      execute format(
        'update public.images set %s where image_id = %L', r.asignacion, 'AR-9602_v1'
      );
      raise exception 'FAIL: se admitió «%»', r.asignacion;
    exception when check_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint <> r.restriccion then
        raise exception 'FAIL: «%» lo rechazó % y no %',
          r.asignacion, v_constraint, r.restriccion;
      end if;
    end;
  end loop;

  -- A single byte goes in: the lower cap is 1 and not an invented minimum. Nobody knows
  -- what the smallest JPEG a strange device can produce is, and putting a
  -- floor by eye would reject a legitimate copy while gaining nothing.
  update public.images
     set corrected_path = 'q/AR-9602_ab12_corr.jpg', corrected_bytes = 1
   where image_id = 'AR-9602_v1';

  -- And the real size of the worst of the batch's photographs: 19 MB. The ceiling is set
  -- by `integer`, which reaches 2 GB.
  update public.images set corrected_bytes = 19922944 where image_id = 'AR-9602_v1';

  raise notice 'OK: el tamaño de la copia es positivo, y 1 byte y 19 MB entran';
end $$;

-- ── 3. The path and the size are one file, not two data ──────
do $$
declare r record; v_constraint text;
begin
  update public.images set corrected_path = null, corrected_bytes = null
   where image_id = 'AR-9602_v1';

  for r in
    select * from (values
      -- Path with no size: it forces whoever reads it to ask the store for the size,
      -- which is the trip the column exists to save.
      ('corrected_path = ''q/AR-9602_ab12_corr.jpg'', corrected_bytes = null',
       'images_corrected_copy_pair'),
      -- Size with no path: a number that describes no file.
      ('corrected_path = null, corrected_bytes = 3145728',
       'images_corrected_copy_pair')
    ) as t(asignacion, restriccion)
  loop
    begin
      execute format(
        'update public.images set %s where image_id = %L', r.asignacion, 'AR-9602_v1'
      );
      raise exception 'FAIL: se admitió «%»', r.asignacion;
    exception when check_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint <> r.restriccion then
        raise exception 'FAIL: «%» lo rechazó % y no %',
          r.asignacion, v_constraint, r.restriccion;
      end if;
    end;
  end loop;

  -- Both together go in, and neither of the two too: «there is no corrected copy»
  -- is the normal state of a photograph with no corrections, and not a gap that has
  -- to be filled.
  update public.images
     set corrected_path = 'q/AR-9602_ab12_corr.jpg', corrected_bytes = 3145728
   where image_id = 'AR-9602_v1';
  update public.images set corrected_path = null, corrected_bytes = null
   where image_id = 'AR-9602_v1';

  raise notice 'OK: la copia son ruta y tamaño juntos, o ninguno de los dos';
end $$;

-- ── 4. Pending and present are mutually exclusive ────────────
-- If the copy is there, it is not pending. A row saying both things would force
-- whoever reads it to choose which to believe, and the interface would show at once the button
-- for downloading the copy and the warning that it is missing.
do $$
declare v_constraint text; v_pendiente boolean; v_ruta text;
begin
  -- Pending on its own: the state the column exists to be able to write. This is
  -- the device that could not cope with the canvas, and it is recorded.
  update public.images set corrected_pending = true where image_id = 'AR-9602_v1';

  -- And from there, adding a path to it is rejected.
  begin
    update public.images
       set corrected_path = 'q/AR-9602_ab12_corr.jpg', corrected_bytes = 2097152
     where image_id = 'AR-9602_v1';
    raise exception 'FAIL: una copia presente y pendiente a la vez ha entrado';
  exception when check_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint <> 'images_corrected_pending_exclusive' then
      raise exception 'FAIL: presente y pendiente lo rechazó % y no images_corrected_pending_exclusive',
        v_constraint;
    end if;
  end;

  -- The rejected `update` leaves nothing written: the row is still pending and with no
  -- path, which is what has to happen when the generation fails again.
  select corrected_pending, corrected_path into v_pendiente, v_ruta
    from public.images where image_id = 'AR-9602_v1';
  if not v_pendiente or v_ruta is not null then
    raise exception 'FAIL: el rechazo ha dejado la fila en (pendiente %, ruta %)',
      v_pendiente, v_ruta;
  end if;

  -- And from the other side: marking as pending a row that already has a copy is also
  -- rejected. It is the order a badly written retry would do it in.
  update public.images
     set corrected_pending = false,
         corrected_path = 'q/AR-9602_ab12_corr.jpg', corrected_bytes = 2097152
   where image_id = 'AR-9602_v1';

  begin
    update public.images set corrected_pending = true where image_id = 'AR-9602_v1';
    raise exception 'FAIL: se ha marcado pendiente una copia que está';
  exception when check_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint <> 'images_corrected_pending_exclusive' then
      raise exception 'FAIL: marcar pendiente lo rechazó % y no images_corrected_pending_exclusive',
        v_constraint;
    end if;
  end;

  -- The legitimate transition from «pending» to «done» is a single write, and it goes in:
  -- it is the one the computer that did manage to generate the copy makes.
  update public.images set corrected_path = null, corrected_bytes = null,
                           corrected_pending = true
   where image_id = 'AR-9602_v1';
  update public.images
     set corrected_pending = false,
         corrected_path = 'q/AR-9602_cd34_corr.jpg', corrected_bytes = 4194304
   where image_id = 'AR-9602_v1';

  raise notice 'OK: pendiente y presente se excluyen, y la transición entre los dos entra';
end $$;

-- ── 5. The copy NEVER shares a path with the master (RF-411) ──
-- It is the rule that protects the archive document. The master is uploaded once with
-- the original bytes and is never written again (ADR-002); what is sent to
-- a print shop or to a curator is the corrected copy, and they are two different
-- files because they answer two different questions.
--
-- It is checked by construction and by constraint, in both directions: moving the
-- copy over the master and moving the master over the copy.
do $$
declare v_master text; v_copia text; v_constraint text;
begin
  update public.images
     set master_path    = 'q/AR-9602_ab12_master.jpg',
         corrected_path = 'q/AR-9602_ab12_corr.jpg',
         corrected_bytes = 3145728
   where image_id = 'AR-9602_v1';

  select master_path, corrected_path into v_master, v_copia
    from public.images where image_id = 'AR-9602_v1';
  if v_master is null or v_copia is null then
    raise exception 'FAIL: el máster y la copia corregida no conviven en la misma fila';
  end if;
  if v_master = v_copia then
    raise exception 'FAIL: la copia corregida ha quedado en la ruta del máster (%)', v_master;
  end if;

  -- Direction 1: taking the copy to the master's path. It is what would happen the day
  -- somebody derived the copy's path from the master's reusing its base
  -- and its extension.
  begin
    update public.images set corrected_path = v_master where image_id = 'AR-9602_v1';
    raise exception 'FAIL: la copia corregida ha podido apuntar al máster';
  exception when check_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint <> 'images_corrected_not_master' then
      raise exception 'FAIL: la colisión con el máster la rechazó % y no images_corrected_not_master',
        v_constraint;
    end if;
  end;

  -- Direction 2: taking the master to the copy's path. The constraint is symmetric
  -- on purpose: what matters is that the two columns do not coincide, and it does not matter
  -- which of the two is moved to make them coincide.
  begin
    update public.images set master_path = v_copia where image_id = 'AR-9602_v1';
    raise exception 'FAIL: el máster ha podido apuntar a la copia corregida';
  exception when check_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint <> 'images_corrected_not_master' then
      raise exception 'FAIL: mover el máster sobre la copia lo rechazó % y no images_corrected_not_master',
        v_constraint;
    end if;
  end;

  -- Y el camino degradado: quitarle el máster a una fila que ya tiene copia no
  -- falla y no se lleva la copia por delante. Es el caso de una fotografía cuyo
  -- máster se reubica cuando la copia ya está subida.
  --
  -- Este aserto **no** distingue `is distinct from` de un `<>` en la restricción, y
  -- se dice para que nadie lo cuente como que sí: con la guarda `corrected_path is
  -- null` delante, las dos formas admiten las mismas filas —con el máster nulo,
  -- `<>` da nulo y el `check` pasa igual—. Lo que se verifica aquí es la conducta
  -- que la ficha necesita, no la sintaxis con que está escrita.
  update public.images set master_path = null where image_id = 'AR-9602_v1';
  select master_path, corrected_path into v_master, v_copia
    from public.images where image_id = 'AR-9602_v1';
  if v_copia is null then
    raise exception 'FAIL: quitar el máster ha borrado la copia corregida';
  end if;
  update public.images set master_path = 'q/AR-9602_ab12_master.jpg'
   where image_id = 'AR-9602_v1';

  raise notice 'OK: la ruta de la copia corregida nunca es la del máster, en las dos direcciones';
end $$;

-- Y lo mismo sobre todas las filas de la base, que es donde la regla tiene que
-- valer de verdad: ninguna fila tiene la copia en la ruta de su máster.
do $$
declare v_malas int;
begin
  select count(*) into v_malas
    from public.images
   where corrected_path is not null and corrected_path = master_path;
  if v_malas > 0 then
    raise exception 'FAIL: % filas tienen la copia corregida en la ruta del máster', v_malas;
  end if;
  raise notice 'OK: ninguna fila de la base tiene la copia sobre su máster';
end $$;

-- ── 6. Nada se ha rellenado hacia atrás ──────────────────────
-- Las filas que ya existían se quedan sin copia y sin deuda: no hay copia porque
-- nadie ha aplicado una corrección desde que este nivel existe, y no falta ninguna
-- porque tampoco hacía falta. Marcarlas pendientes en la migración habría creado
-- 39 tareas que nadie pidió; darles una ruta habría inventado 39 ficheros que no
-- están en el almacén, y la ficha ofrecería descargar un 404.
--
-- Se cuentan TODAS las filas y no solo las activas: las dadas de baja siguen ahí
-- —nunca un borrado real— y una baja lógica con una copia corregida inventada
-- seguiría siendo un dato inventado, además de un fichero fantasma que nadie
-- volvería a mirar.
--
-- Sobre una base recién migrada no hay filas y el aserto no dice nada, y es
-- correcto que no lo diga: este test mide la base cargada con el volcado, donde
-- son 39 activas de 44.
do $$
declare v_total int; v_con_copia int; v_pendientes int;
begin
  select count(*) into v_total from public.images where image_id <> 'AR-9602_v1';

  select count(*) into v_con_copia
    from public.images
   where image_id <> 'AR-9602_v1'
     and num_nonnulls(corrected_path, corrected_bytes) > 0;
  if v_con_copia > 0 then
    raise exception 'FAIL: % de las % filas heredadas tienen una copia corregida inventada',
      v_con_copia, v_total;
  end if;

  select count(*) into v_pendientes
    from public.images where image_id <> 'AR-9602_v1' and corrected_pending;
  if v_pendientes > 0 then
    raise exception 'FAIL: % de las % filas heredadas han nacido con una copia pendiente',
      v_pendientes, v_total;
  end if;

  raise notice 'OK: las % filas heredadas siguen sin copia corregida y sin deuda', v_total;
end $$;

-- Y siguen admitiendo una escritura que ignora las columnas nuevas, que es
-- literalmente lo que hace el frontend viejo durante el despliegue: si alguna de
-- las restricciones nuevas rechazara una fila heredada, esa fila se quedaría sin
-- poder guardarse hasta que alguien la arreglara a mano.
do $$
declare v_total int; v_tocadas int;
begin
  select count(*) into v_total from public.images where image_id <> 'AR-9602_v1';

  update public.images set photo_author = photo_author where image_id <> 'AR-9602_v1';
  get diagnostics v_tocadas = row_count;

  if v_tocadas <> v_total then
    raise exception 'FAIL: solo % de % filas heredadas admiten una escritura del frontend viejo',
      v_tocadas, v_total;
  end if;
  raise notice 'OK: las % filas heredadas se siguen escribiendo sin las columnas nuevas', v_total;
end $$;

-- ── 7. Lo que la base NO prohíbe, a propósito ────────────────
-- Está aquí para que la ausencia de estas dos restricciones se lea como una
-- decisión y no como un olvido: quien las añada mañana romperá este test y leerá
-- por qué.
do $$
begin
  -- Una copia corregida sin máster en la fila. Hoy no se puede llegar ahí porque
  -- sin máster el color se prohíbe en el cliente, pero la regla es de renderizado
  -- y vive allí: escribirla en la base impediría guardar el caso de una copia ya
  -- generada cuyo máster se reubique, y lo impediría cuando ya no hay nada que
  -- hacer.
  update public.images
     set master_path = null,
         corrected_path = 'q/AR-9602_ef56_corr.jpg', corrected_bytes = 1048576
   where image_id = 'AR-9602_v1';

  -- Y una fila marcada pendiente sin ninguna corrección que aplicar. Es inofensivo
  -- —quien lo lea reintentará y dejará el trabajo hecho— y un `check` que exigiera
  -- «hay algo que aplicar» tendría que repetir aquí la definición de las cuatro
  -- correcciones y se desalinearía la primera vez que hubiera una quinta.
  update public.images
     set corrected_path = null, corrected_bytes = null, corrected_pending = true,
         rotation = 0, crop_x = null, crop_y = null, crop_width = null, crop_height = null,
         color_temperature = null, color_gamma = null
   where image_id = 'AR-9602_v1';

  raise notice 'OK: la base no exige máster para la copia ni correcciones para la deuda';
end $$;

-- ── 8. Quién escribe la copia y quién solo la descarga ───────
-- RF-106, RF-411, RF-420.
--
-- Las tres columnas son superficie nueva de escritura, y CLAUDE.md pone las
-- políticas RLS por delante de todo lo demás: no hay backend, la clave anónima
-- viaja en el cliente y estas políticas son el único perímetro que hay. No se ha
-- escrito ninguna política nueva para ellas, y es deliberado —quien puede editar
-- una fotografía puede editar su copia corregida—, así que lo que hay que
-- demostrar es que la `images_update` que ya existe (`can_edit()`) alcanza a las
-- tres. Leer la migración no demuestra nada: esto se autentica de verdad.
--
-- La cobertura está aquí y no en `rls_role_matrix.test.sql` porque ese fichero
-- pertenece a otro trabajo en curso y hoy cubre las columnas de color y no
-- estas. Vale en cualquiera de los dos sitios; lo que no vale es en ninguno.
--
-- Y aquí se comprueba la asimetría de RF-411, que es la que se puede romper sin
-- que nadie se entere: el Lector **descarga** la copia corregida —para eso
-- existe— y por tanto tiene que poder LEER `corrected_path` y
-- `corrected_bytes`, pero no puede escribir ninguna de las tres. Una política
-- que le negara la lectura no daría ningún error: dejaría el botón de descarga
-- sin ruta que firmar, y la ficha entregaría el máster sin corregir creyendo que
-- no había copia.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000096c1', 'cat-corr@test.local'),
  ('00000000-0000-0000-0000-0000000096d1', 'lec-corr@test.local');

update public.profiles set role = 'CATALOGER'
 where id = '00000000-0000-0000-0000-0000000096c1';
update public.profiles set role = 'READER'
 where id = '00000000-0000-0000-0000-0000000096d1';

-- Estado de partida limpio y explícito: el bloque anterior dejó la fila sin
-- máster y con deuda a propósito, y lo que se mide ahora es otra cosa.
update public.images
   set master_path = 'q/AR-9602_ab12_master.jpg',
       corrected_path = null, corrected_bytes = null, corrected_pending = false
 where image_id = 'AR-9602_v1';

do $$
declare v_row public.images;
begin
  set local request.jwt.claims =
    '{"sub":"00000000-0000-0000-0000-0000000096c1","role":"authenticated"}';
  set local role authenticated;

  -- Los dos estados que un catalogador escribe de verdad. Primero la copia
  -- hecha, que es lo que ocurre cuando el dispositivo ha podido generarla.
  update public.images
     set corrected_path = 'q/AR-9602_ab12_corr.jpg', corrected_bytes = 3145728
   where image_id = 'AR-9602_v1'
  returning * into v_row;

  if v_row.corrected_path is null or v_row.corrected_bytes <> 3145728 then
    raise exception 'FAIL: el catalogador no ha podido escribir la copia corregida';
  end if;

  -- Y después la deuda, que es lo que ocurre cuando no ha podido: si can_edit()
  -- no alcanzara esta tercera columna, el móvil no podría ni dejar constancia de
  -- que la copia falta, que es justo para lo que existe.
  update public.images
     set corrected_path = null, corrected_bytes = null, corrected_pending = true
   where image_id = 'AR-9602_v1'
  returning * into v_row;

  if not v_row.corrected_pending or v_row.corrected_path is not null then
    raise exception 'FAIL: el catalogador no ha podido anotar la copia como pendiente';
  end if;

  raise notice 'OK: el catalogador escribe la copia corregida y su deuda';
end $$;

reset role;

-- La fila queda con copia, que es el estado en el que el Lector la descarga.
update public.images
   set corrected_pending = false,
       corrected_path = 'q/AR-9602_ab12_corr.jpg', corrected_bytes = 3145728
 where image_id = 'AR-9602_v1';

do $$
declare v_afectadas integer; v_row public.images; v_ruta text; v_bytes integer;
begin
  set local request.jwt.claims =
    '{"sub":"00000000-0000-0000-0000-0000000096d1","role":"authenticated"}';
  set local role authenticated;

  -- RF-411: el Lector LEE la ruta y el tamaño. Es lo que la ficha necesita para
  -- pedir la URL firmada y para anunciar el peso de lo que se va a descargar.
  select corrected_path, corrected_bytes into v_ruta, v_bytes
    from public.images where image_id = 'AR-9602_v1';
  if v_ruta is null or v_bytes is null then
    raise exception 'FAIL: el Lector no ve la copia corregida y no puede descargarla (RF-411)';
  end if;

  -- RF-106: y no escribe la ruta ni el tamaño. Un `update` que la política USING
  -- esconde no falla: no afecta a ninguna fila. Ese silencio es lo que hay que
  -- afirmar, porque sin afirmarlo el test pasaría igual sobre una tabla sin
  -- ninguna política.
  --
  -- Los valores elegidos son válidos para las cuatro restricciones a propósito
  -- —pareja completa, tamaño positivo y ruta distinta de la del máster—, y eso es
  -- parte del test y no un descuido: si la escritura del Lector rompiera además un
  -- `check`, el rechazo podría venir del `check` en vez de la política y este
  -- bloque dejaría de medir la política, que es lo único que aquí se mide. Con la
  -- política abierta esta escritura entraría sin una queja.
  update public.images
     set corrected_path = 'q/robada_corr.jpg', corrected_bytes = 1
   where image_id = 'AR-9602_v1';
  get diagnostics v_afectadas = row_count;

  reset role;
  if v_afectadas <> 0 then
    raise exception 'FAIL: el Lector ha modificado la copia corregida de % fila(s)', v_afectadas;
  end if;

  -- Y la fila sigue con lo que escribió el catalogador, comprobado ya fuera de la
  -- sesión del Lector: `row_count` a solas no cazaría una política que dejara
  -- pasar la escritura y escondiera la fila después.
  select * into v_row from public.images where image_id = 'AR-9602_v1';
  if v_row.corrected_path <> 'q/AR-9602_ab12_corr.jpg'
     or v_row.corrected_bytes <> 3145728 or v_row.corrected_pending then
    raise exception 'FAIL: la escritura del Lector ha dejado algo puesto';
  end if;

  raise notice 'OK: el Lector descarga la copia corregida y no la escribe (RF-411)';
end $$;

reset role;

-- La tercera columna aparte, y por la misma razón: para que `corrected_pending`
-- se pueda atacar sin romper `images_corrected_pending_exclusive`, la fila tiene
-- que quedar primero sin copia. Así el único motivo posible de que la escritura
-- no entre es la política.
update public.images
   set corrected_path = null, corrected_bytes = null, corrected_pending = false
 where image_id = 'AR-9602_v1';

do $$
declare v_afectadas integer; v_pendiente boolean;
begin
  set local request.jwt.claims =
    '{"sub":"00000000-0000-0000-0000-0000000096d1","role":"authenticated"}';
  set local role authenticated;

  update public.images set corrected_pending = true where image_id = 'AR-9602_v1';
  get diagnostics v_afectadas = row_count;

  reset role;
  if v_afectadas <> 0 then
    raise exception 'FAIL: el Lector ha marcado pendiente % fila(s)', v_afectadas;
  end if;

  select corrected_pending into v_pendiente
    from public.images where image_id = 'AR-9602_v1';
  if v_pendiente then
    raise exception 'FAIL: el Lector ha podido inventar una deuda de copia corregida';
  end if;

  raise notice 'OK: el Lector tampoco escribe corrected_pending';
end $$;

reset role;

-- Y tampoco cuela una copia por una fotografía nueva, que es el camino que queda
-- cuando el `update` no le sirve.
do $$
begin
  set local request.jwt.claims =
    '{"sub":"00000000-0000-0000-0000-0000000096d1","role":"authenticated"}';
  set local role authenticated;

  insert into public.images (catalog_id, thumbnail_path, derivative_path, master_path,
                             corrected_path, corrected_bytes)
  values ('AR-9602', 'q/min2.webp', 'q/der2.webp', 'q/AR-9602_gh78_master.jpg',
          'q/AR-9602_gh78_corr.jpg', 1048576);
  raise exception 'FAIL: el Lector ha podido añadir una fotografía con copia corregida';
exception
  when insufficient_privilege then
    raise notice 'OK: el Lector no añade fotografías, con copia corregida ni sin ella';
end $$;

reset role;
rollback;
