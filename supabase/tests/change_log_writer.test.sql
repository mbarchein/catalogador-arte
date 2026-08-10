-- The change log's writer: RF-1502, RF-1503, RF-1505, RF-1509 to
-- RF-1512. And the perimeter, again and with the writer already in place: RF-1504.
--
-- THIS FILE IS THE OTHER HALF OF change_log.test.sql. That one defends that nobody
-- can write in the log; this one defends that the log IS written
-- when somebody really changes something. Both halves are needed: an inviolable
-- and empty log is no safer than having no log, it is the appearance of
-- having one, and it is exactly the state the base was in between 20260805120000
-- and 20260805140000 —closed table, zero rows, no write function—.
--
-- And there is a reason for the padlock to be measured again HERE, with the writer
-- in place, instead of taking as good what the other file already measured: since this
-- migration there exists in the base a `security definer` function that CAN
-- insert into the log. That is new surface, and what has to be demonstrated is
-- that there is still no way of reaching it (block 9).
--
-- Everything counted is bounded to this file's artworks (`AR-96%`, `TS-%`
-- created here) and NOT to the whole table, because the log is append-only and
-- shares a table with whatever the other tests write.
\set ON_ERROR_STOP on
begin;

-- ── Fixtures ─────────────────────────────────────────────────
--
-- One user of each role, for real: the profiles are created by the
-- auth.users trigger. The Superuser is here and is not an ornament — `can_edit()` includes
-- SUPERUSER, so it is also a possible author of the log and its cell in the
-- matrix was covered by nobody.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000b1', 'esc-cat@test.local'),
  ('00000000-0000-0000-0000-0000000000b2', 'esc-lec@test.local'),
  ('00000000-0000-0000-0000-0000000000b3', 'esc-sup@test.local');
update public.profiles set role = 'CATALOGER' where id = '00000000-0000-0000-0000-0000000000b1';
update public.profiles set role = 'READER'    where id = '00000000-0000-0000-0000-0000000000b2';
update public.profiles set role = 'SUPERUSER' where id = '00000000-0000-0000-0000-0000000000b3';


-- ── 1. The creation leaves one line, and with the right author ─
--
-- RF-1503. A single line, with no field: the initial state is in the record itself and
-- the log's constraints would not let it be written any other way.
--
-- Incidentally what forces the trigger to be AFTER is checked: `catalog_id` is
-- assigned by `assign_catalog_id` in a BEFORE INSERT, so a writer running
-- before would note the key as null or would break the creation against `row_key`'s
-- `not null`. That the line carries the real identifier is the assertion that
-- verifies it.
do $$
declare v_id text; v_n integer; v_key text; v_cat text; v_col text; v_autor uuid;
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}';
  set local role authenticated;
  insert into public.artworks (catalog_id, artist, title, attributed_title, height_cm)
  values ('AR-9600', 'ROTILI', 'Obra del escritor', 'UNCONFIRMED', 54.00)
  returning catalog_id into v_id;
  reset role;

  select count(*) into v_n from public.change_log where row_key = 'AR-9600';
  if v_n <> 1 then
    raise exception 'FAIL: el alta de una obra debería dejar UNA línea, ha dejado % (RF-1503)', v_n;
  end if;

  select row_key, catalog_id, column_name, changed_by
    into v_key, v_cat, v_col, v_autor
    from public.change_log where row_key = 'AR-9600';

  if v_key is distinct from 'AR-9600' or v_cat is distinct from 'AR-9600' then
    raise exception 'FAIL: la línea del alta no identifica la ficha (row_key=%, catalog_id=%): el escritor no puede ser BEFORE',
      coalesce(v_key, '(nulo)'), coalesce(v_cat, '(nulo)');
  end if;
  if v_col is not null then
    raise exception 'FAIL: el alta debería ser la única línea sin campo, señala [%]', v_col;
  end if;
  if v_autor is distinct from '00000000-0000-0000-0000-0000000000b1'::uuid then
    raise exception 'FAIL: el autor del alta debería ser el Catalogador que la hizo, es % (RF-1503)',
      coalesce(v_autor::text, '(nulo)');
  end if;

  raise notice 'OK: el alta deja una línea, sin campo, con la ficha identificada y el autor correcto (RF-1503)';
end $$;

reset role;

-- THE CREATION WITH NO IDENTIFIER, which is the normal one in the application: the quick-capture
-- form does not send it, `assign_catalog_id` assigns it in a BEFORE INSERT
-- (RF-1204). This is the assertion that really requires the writer to be AFTER —
-- the previous block gave the `catalog_id` written by hand, so it did not distinguish—.
-- With a BEFORE writer, here `row_key` would arrive null and the log table's
-- `not null` would knock down the creation of any artwork.
do $$
declare v_id text; v_n integer; v_key text;
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}';
  set local role authenticated;
  insert into public.artworks (artist, artwork_type) values ('TEST', '')
  returning catalog_id into v_id;
  reset role;

  if v_id is null or v_id !~ '^TS-[0-9]{4}$' then
    raise exception 'FAIL: el identificador no se ha asignado (%), el bloque no mide nada', coalesce(v_id, '(nulo)');
  end if;

  select count(*) into v_n from public.change_log where row_key = v_id;
  if v_n <> 1 then
    raise exception 'FAIL: el alta sin identificador debería dejar UNA línea con la clave ya asignada, ha dejado % (RF-1503)', v_n;
  end if;

  select row_key into v_key from public.change_log where row_key = v_id;
  if v_key is distinct from v_id then
    raise exception 'FAIL: la línea del alta no trae el identificador asignado por el trigger';
  end if;
  raise notice 'OK: un alta sin identificador se registra con la clave que le asignó la base (%): el escritor corre después (RF-1503)', v_id;
end $$;

reset role;

-- And the same creation done by the Superuser, who can also edit. It is not taken
-- for granted that «if it works for the Cataloguer it works for the other»: the author
-- is set by `auth.uid()` and what is checked is that the session's comes out.
do $$
declare v_autor uuid;
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000b3","role":"authenticated"}';
  set local role authenticated;
  insert into public.artworks (catalog_id, artist, title, attributed_title)
  values ('AR-9601', 'ROTILI', 'Obra del superusuario', 'UNCONFIRMED');
  reset role;

  select changed_by into v_autor from public.change_log where row_key = 'AR-9601';
  if v_autor is distinct from '00000000-0000-0000-0000-0000000000b3'::uuid then
    raise exception 'FAIL: el autor del alta del Superusuario debería ser él, es %',
      coalesce(v_autor::text, '(nulo)');
  end if;
  raise notice 'OK: el Superusuario también queda anotado como autor de lo que cambia (RF-1503)';
end $$;

reset role;

-- The Reader cannot create, so there is no line to write. It is checked that
-- the attempt fails AND that it left no trace: a log noting failed
-- attempts would count changes that did not happen.
do $$
declare v_n integer;
begin
  begin
    set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}';
    set local role authenticated;
    insert into public.artworks (catalog_id, artist, title, attributed_title)
    values ('AR-9602', 'ROTILI', 'La que el lector no puede crear', 'UNCONFIRMED');
    reset role;
    raise exception 'FAIL: el Lector ha creado una obra (RF-106)';
  exception when insufficient_privilege then
    reset role;
  end;

  select count(*) into v_n from public.change_log where row_key = 'AR-9602';
  if v_n <> 0 then
    raise exception 'FAIL: un alta rechazada ha dejado % línea(s) en el registro', v_n;
  end if;
  raise notice 'OK: lo que la RLS rechaza no llega al registro: sin cambio no hay línea (RF-106)';
end $$;

reset role;


-- ── 2. The change: one row per field (RF-1502) ───────────────
--
-- Two fields in a single `update` are TWO lines with the SAME `change_id`, which is
-- what lets the interface reconstruct the user's action. And the values are
-- stored in their stored representation: `'54.00'` and not «54 cm».
do $$
declare
  v_n integer; v_ids integer; v_op text;
  v_old_alto text; v_new_alto text; v_old_tec text; v_new_tec text;
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}';
  set local role authenticated;
  update public.artworks set height_cm = 45.00, technique = 'Hierro soldado'
   where catalog_id = 'AR-9600';
  reset role;

  select count(*), count(distinct change_id) into v_n, v_ids
    from public.change_log where row_key = 'AR-9600' and operation = 'UPDATE';
  if v_n <> 2 then
    raise exception 'FAIL: dos campos cambiados deberían ser dos líneas, son % (RF-1502)', v_n;
  end if;
  if v_ids <> 1 then
    raise exception 'FAIL: los dos campos de un mismo guardado deberían compartir change_id, hay % (RF-1502)', v_ids;
  end if;

  select old_value, new_value into v_old_alto, v_new_alto
    from public.change_log where row_key = 'AR-9600' and column_name = 'height_cm';
  if v_old_alto is distinct from '54.00' or v_new_alto is distinct from '45.00' then
    raise exception 'FAIL: el alto debería anotarse como está almacenado, se anota [%] -> [%] (RF-1502)',
      coalesce(v_old_alto, '(nulo)'), coalesce(v_new_alto, '(nulo)');
  end if;

  -- The technique came from the empty string, which is its default value: the
  -- empty string is noted and not a null, because they are different things and the log is the
  -- only place that cannot confuse them.
  select old_value, new_value into v_old_tec, v_new_tec
    from public.change_log where row_key = 'AR-9600' and column_name = 'technique';
  if v_old_tec is distinct from '' or v_new_tec is distinct from 'Hierro soldado' then
    raise exception 'FAIL: la técnica se anota [%] -> [%]; la cadena vacía no es un nulo',
      coalesce(v_old_tec, '(NULO)'), coalesce(v_new_tec, '(NULO)');
  end if;

  select distinct operation::text into v_op
    from public.change_log where row_key = 'AR-9600' and operation = 'UPDATE';
  if v_op <> 'UPDATE' then
    raise exception 'FAIL: el verbo de un cambio corriente debería ser UPDATE, es %', v_op;
  end if;

  raise notice 'OK: una fila por campo, mismas dos con un solo change_id, y el valor tal como se almacena (RF-1502)';
end $$;

reset role;

-- The step from null to value and from value to null, which is this catalogue's most common
-- change —«sin revisar» is not «no»— and the one that would be lost if the comparison
-- used `<>` instead of `is distinct from`. It is exercised in BOTH directions.
do $$
declare v_n integer; v_old text; v_new text;
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}';
  set local role authenticated;
  update public.artworks set width_cm = 31.00 where catalog_id = 'AR-9601';  -- nulo -> valor
  update public.artworks set width_cm = null   where catalog_id = 'AR-9601';  -- valor -> nulo
  reset role;

  select count(*) into v_n from public.change_log
   where row_key = 'AR-9601' and column_name = 'width_cm';
  if v_n <> 2 then
    raise exception 'FAIL: nulo->valor y valor->nulo deberían ser dos líneas, son %: la comparación no distingue el nulo', v_n;
  end if;

  select old_value, new_value into v_old, v_new from public.change_log
   where row_key = 'AR-9601' and column_name = 'width_cm' order by id limit 1;
  if v_old is not null or v_new is distinct from '31.00' then
    raise exception 'FAIL: el paso de nulo a valor se anota [%] -> [%]', coalesce(v_old,'(nulo)'), coalesce(v_new,'(nulo)');
  end if;

  select old_value, new_value into v_old, v_new from public.change_log
   where row_key = 'AR-9601' and column_name = 'width_cm' order by id desc limit 1;
  if v_old is distinct from '31.00' or v_new is not null then
    raise exception 'FAIL: el paso de valor a nulo se anota [%] -> [%]', coalesce(v_old,'(nulo)'), coalesce(v_new,'(nulo)');
  end if;

  raise notice 'OK: el nulo es un valor y se anota en los dos sentidos (RF-1502)';
end $$;

reset role;


-- ── 3. A save that changes nothing writes nothing ────────────
--
-- RF-1510, and it is the assertion that separates a log somebody reads from one
-- nobody reads. The case is not rare: it is the form saved without having touched
-- anything, and it is PostgREST's `PATCH` that sends the whole object. It is measured with
-- a count BEFORE and AFTER, and it is checked that the `update` really affected one
-- row, so the block does not pass for the wrong reason —«it wrote nothing»
-- because it updated nothing—.
do $$
declare v_antes integer; v_despues integer; v_filas integer;
begin
  select count(*) into v_antes from public.change_log;

  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}';
  set local role authenticated;
  update public.artworks set height_cm = 45.00, technique = 'Hierro soldado', title = 'Obra del escritor'
   where catalog_id = 'AR-9600';
  get diagnostics v_filas = row_count;
  reset role;

  select count(*) into v_despues from public.change_log;

  if v_filas <> 1 then
    raise exception 'FAIL: el update no ha tocado la fila (% filas): el bloque no mide lo que dice medir', v_filas;
  end if;
  if v_despues <> v_antes then
    raise exception 'FAIL: un guardado que no cambia nada ha escrito % línea(s) en el registro (RF-1510)',
      v_despues - v_antes;
  end if;
  raise notice 'OK: un guardado con los mismos valores actualiza la fila y no escribe ni una línea (RF-1510)';
end $$;

reset role;


-- ── 4. The trace marks are not noted (RF-1509) ───────────────
--
-- AND THIS BLOCK HAS TO DEMONSTRATE FIRST THAT THE MARKS REALLY CHANGED,
-- because otherwise it would be passing for the wrong reason: «there is no
-- updated_by line» is trivially true if updated_by did not move.
--
-- THE MARKS EXERCISED ARE `updated_by` AND `basic_updated_at`, AND NOT
-- `updated_at`, FOR A REASON WORTH WRITING DOWN: the trace trigger
-- stamps with `now()`, which is the TRANSACTION's time, so inside a test
-- —a single transaction— `updated_at` is the same before and after and there is no way
-- of moving it. The other two do really move here: the artwork is created by the
-- Cataloguer and changed by the Superuser, so `updated_by` goes from one to
-- the other; and `basic_updated_at` is born null and is stamped on touching `support`, which is a
-- phase-1 field (RF-802). A NEW artwork is used precisely so the basic mark
-- is unstamped at the start.
do $$
declare
  v_autor_antes uuid; v_autor_despues uuid;
  v_basica_antes timestamptz; v_basica_despues timestamptz;
  v_ruido text[];
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}';
  set local role authenticated;
  insert into public.artworks (catalog_id, artist, title, attributed_title)
  values ('AR-9603', 'ROTILI', 'Obra de las marcas', 'UNCONFIRMED');
  reset role;

  select updated_by, basic_updated_at into v_autor_antes, v_basica_antes
    from public.artworks where catalog_id = 'AR-9603';

  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000b3","role":"authenticated"}';
  set local role authenticated;
  update public.artworks set support = 'Chapa' where catalog_id = 'AR-9603';
  reset role;

  select updated_by, basic_updated_at into v_autor_despues, v_basica_despues
    from public.artworks where catalog_id = 'AR-9603';

  if v_autor_despues is not distinct from v_autor_antes then
    raise exception 'FAIL: updated_by no se ha movido (% -> %), así que este bloque no está midiendo nada (RF-803)',
      coalesce(v_autor_antes::text, '(nulo)'), coalesce(v_autor_despues::text, '(nulo)');
  end if;
  -- And the exact value is checked and not only that it changed: `updated_by` has to
  -- be the user of the session that saved, which is what RF-803 asks for.
  if v_autor_antes   is distinct from '00000000-0000-0000-0000-0000000000b1'::uuid
     or v_autor_despues is distinct from '00000000-0000-0000-0000-0000000000b3'::uuid then
    raise exception 'FAIL: updated_by debería ser el Catalogador y luego el Superusuario, es % y luego % (RF-803)',
      coalesce(v_autor_antes::text, '(nulo)'), coalesce(v_autor_despues::text, '(nulo)');
  end if;
  if v_basica_antes is not null or v_basica_despues is null then
    raise exception 'FAIL: basic_updated_at no ha pasado de nula a sellada (% -> %), así que este bloque no está midiendo nada (RF-802)',
      coalesce(v_basica_antes::text, '(nulo)'), coalesce(v_basica_despues::text, '(nulo)');
  end if;

  -- And now, with both marks really moved, the log must not mention
  -- any of the nine.
  select coalesce(array_agg(distinct column_name order by column_name), '{}')
    into v_ruido
    from public.change_log
   where row_key = 'AR-9603'
     and column_name in ('created_at', 'created_by', 'updated_at', 'updated_by',
                         'basic_updated_at', 'deactivated_at', 'deactivated_by',
                         'restored_at', 'restored_by');
  if array_length(v_ruido, 1) > 0 then
    raise exception 'FAIL: el registro anota sus propias marcas de traza: [%]. Cada guardado dejaría líneas sin información y el historial sería ilegible (RF-1509)',
      array_to_string(v_ruido, ', ');
  end if;

  -- What IS noted is the field that changed, and ONLY that one: one line, not three.
  if not exists (select 1 from public.change_log
                  where row_key = 'AR-9603' and column_name = 'support' and new_value = 'Chapa') then
    raise exception 'FAIL: el campo que sí cambió no se ha anotado';
  end if;
  if (select count(*) from public.change_log
       where row_key = 'AR-9603' and operation = 'UPDATE') <> 1 then
    raise exception 'FAIL: el cambio de un campo ha dejado % líneas; sobran las marcas de traza (RF-1509)',
      (select count(*) from public.change_log where row_key = 'AR-9603' and operation = 'UPDATE');
  end if;

  raise notice 'OK: updated_by y basic_updated_at se mueven de verdad y el registro no las menciona; un campo cambiado es UNA línea (RF-1509)';
end $$;

reset role;

-- The DERIVED column, with the same criterion and the same caution: it is checked that
-- `execution_date` really changed and that the log notes the cause and not the
-- effect. Noting both would count the same change twice and would present as
-- a user change something the user cannot write.
do $$
declare v_antes text; v_despues text; v_n integer;
begin
  select execution_date into v_antes from public.artworks where catalog_id = 'AR-9600';

  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}';
  set local role authenticated;
  update public.artworks set start_year = 1975 where catalog_id = 'AR-9600';
  reset role;

  select execution_date into v_despues from public.artworks where catalog_id = 'AR-9600';
  if v_despues is not distinct from v_antes then
    raise exception 'FAIL: execution_date no ha cambiado, así que este bloque no está midiendo nada';
  end if;

  select count(*) into v_n from public.change_log
   where row_key = 'AR-9600' and column_name = 'execution_date';
  if v_n <> 0 then
    raise exception 'FAIL: el registro anota la columna derivada execution_date (% líneas): sería el mismo cambio contado dos veces', v_n;
  end if;

  if not exists (select 1 from public.change_log
                  where row_key = 'AR-9600' and column_name = 'start_year' and new_value = '1975') then
    raise exception 'FAIL: no se ha anotado start_year, que es la causa del cambio derivado';
  end if;

  raise notice 'OK: execution_date cambia y no se anota; se anota start_year, que es lo que escribió la persona (RF-1509)';
end $$;

reset role;


-- ── 5. The wastebasket: the two verbs (RF-1503) ──────────────
--
-- Withdrawing and restoring are changes of the `active` field and are noted as
-- such too: the line carries the field, and the verb is what the interface reads. It is
-- also checked that the wastebasket's stamp —`deactivated_at`,
-- `deactivated_by`— was really set and does NOT appear as a line.
do $$
declare v_op text; v_col text; v_old text; v_new text; v_n integer; v_sello timestamptz;
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000b3","role":"authenticated"}';
  set local role authenticated;
  update public.artworks set active = false where catalog_id = 'AR-9601';
  reset role;

  select deactivated_at into v_sello from public.artworks where catalog_id = 'AR-9601';
  if v_sello is null then
    raise exception 'FAIL: la baja no se ha sellado, así que este bloque no está midiendo nada (RF-902)';
  end if;

  select count(*) into v_n from public.change_log
   where row_key = 'AR-9601' and operation = 'DEACTIVATE';
  if v_n <> 1 then
    raise exception 'FAIL: retirar una ficha debería dejar UNA línea (la de active), deja %; el sello de la papelera se está anotando como cambio', v_n;
  end if;

  select operation::text, column_name, old_value, new_value into v_op, v_col, v_old, v_new
    from public.change_log where row_key = 'AR-9601' and operation = 'DEACTIVATE';
  if v_op <> 'DEACTIVATE' or v_col <> 'active' or v_old <> 'true' or v_new <> 'false' then
    raise exception 'FAIL: la baja se anota como % / % / [%] -> [%]', v_op, v_col, v_old, v_new;
  end if;

  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}';
  set local role authenticated;
  update public.artworks set active = true where catalog_id = 'AR-9601';
  reset role;

  select count(*) into v_n from public.change_log
   where row_key = 'AR-9601' and operation = 'RESTORE';
  if v_n <> 1 then
    raise exception 'FAIL: restaurar una ficha debería dejar UNA línea, deja %', v_n;
  end if;
  select column_name, old_value, new_value into v_col, v_old, v_new
    from public.change_log where row_key = 'AR-9601' and operation = 'RESTORE';
  if v_col <> 'active' or v_old <> 'false' or v_new <> 'true' then
    raise exception 'FAIL: la restauración se anota como % / [%] -> [%]', v_col, v_old, v_new;
  end if;

  raise notice 'OK: retirar y restaurar dejan una línea cada uno, con su verbo y su campo, y sin el sello de la papelera (RF-1503, RF-902)';
end $$;

reset role;


-- ── 6. EVERY WRITE PATH ──────────────────────────────────────
--
-- It is the reason the log is written by a trigger of the table and not by the
-- application: a trigger does not distinguish where the change comes from. Here the
-- paths that are NOT «the PWA sends an update» are exercised, which are precisely the ones
-- that get forgotten.

-- 6a. THE PHOTOGRAPH. An image's creation leaves its own line, and `catalog_id`
--     hangs it from the artwork's history with no join, which is what it is
--     denormalised for.
do $$
declare v_n integer; v_key text; v_cat text; v_ent text;
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}';
  set local role authenticated;
  insert into public.images (catalog_id, thumbnail_path, derivative_path, master_path, shot_type)
  values ('AR-9600', 'w/min1.webp', 'w/der1.webp', 'w/master1.jpg', 'GENERAL');
  reset role;

  select count(*) into v_n from public.change_log
   where entity = 'IMAGE' and row_key = 'AR-9600_v1' and operation = 'CREATE';
  if v_n <> 1 then
    raise exception 'FAIL: el alta de una fotografía debería dejar UNA línea, deja %', v_n;
  end if;

  select entity::text, row_key, catalog_id into v_ent, v_key, v_cat
    from public.change_log where row_key = 'AR-9600_v1' and operation = 'CREATE';
  if v_ent <> 'IMAGE' or v_key <> 'AR-9600_v1' or v_cat <> 'AR-9600' then
    raise exception 'FAIL: la línea de la fotografía dice % / % / %; row_key es la imagen y catalog_id la obra', v_ent, v_key, v_cat;
  end if;
  raise notice 'OK: la fotografía se audita como su propia ficha y cuelga del historial de la obra (RF-1503)';
end $$;

reset role;

-- 6b. THE UPDATE ANOTHER TRIGGER MAKES, which is the path that always gets forgotten.
--     On uploading the first photograph, `sync_photographed` calls
--     `recalculate_photographed()`, which updates `artworks.photographed`. That
--     change of the artwork was written by nobody from the form and has to
--     be logged all the same — and WITH THE RIGHT AUTHOR, which is what
--     would be lost if the writer took the author from anywhere other than the
--     session: `recalculate_photographed` is `security definer`.
do $$
declare v_n integer; v_old text; v_new text; v_autor uuid; v_valor boolean;
begin
  select photographed into v_valor from public.artworks where catalog_id = 'AR-9600';
  if not v_valor then
    raise exception 'FAIL: photographed no se ha recalculado, así que este bloque no está midiendo nada';
  end if;

  select count(*) into v_n from public.change_log
   where row_key = 'AR-9600' and column_name = 'photographed';
  if v_n <> 1 then
    raise exception 'FAIL: el cambio que hizo otro trigger sobre la obra no está registrado (% líneas). El registro no captura todos los caminos de escritura (RF-1512)', v_n;
  end if;

  select old_value, new_value, changed_by into v_old, v_new, v_autor
    from public.change_log where row_key = 'AR-9600' and column_name = 'photographed';
  if v_old <> 'false' or v_new <> 'true' then
    raise exception 'FAIL: photographed se anota [%] -> [%]', v_old, v_new;
  end if;
  if v_autor is distinct from '00000000-0000-0000-0000-0000000000b1'::uuid then
    raise exception 'FAIL: el autor del cambio en cascada debería ser quien subió la foto, es % (RF-1512)',
      coalesce(v_autor::text, '(nulo)');
  end if;

  raise notice 'OK: lo que cambia OTRO TRIGGER queda registrado, con el autor de la sesión que lo provocó (RF-1512)';
end $$;

-- 6c. THE RPC. `set_main_image()` updates `images.index_image` with two `update`s
--     inside a function. It is a write path that goes through no
--     `PATCH` of the table, and the log has to see it all the same.
do $$
declare v_n integer;
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}';
  set local role authenticated;
  perform public.set_main_image('AR-9600_v1');
  reset role;

  select count(*) into v_n from public.change_log
   where row_key = 'AR-9600_v1' and column_name = 'index_image' and new_value = 'true';
  if v_n <> 1 then
    raise exception 'FAIL: lo que cambia una RPC no queda registrado (% líneas sobre index_image) (RF-1512)', v_n;
  end if;
  raise notice 'OK: lo que cambia una RPC queda registrado (RF-1512)';
end $$;

reset role;

-- 6d. THE ADMINISTRATIVE SESSION, with no application session: `changed_by` null. Null
--     is the truth —a migration or console access was made by no
--     person— and it is what justifies the column being nullable. What CANNOT
--     happen is that the change goes unlogged: the table's owner bypasses the
--     RLS, and if the log depended on the policies this change would be
--     invisible.
do $$
declare v_n integer; v_autor uuid;
begin
  -- The JWT claim is emptied by hand: `reset role` gives back the role but does NOT
  -- clear `request.jwt.claims`, so without this line the block would go on
  -- running with the previous block's user and would not measure what it says it measures.
  perform set_config('request.jwt.claims', '', true);
  if auth.uid() is not null then
    raise exception 'FAIL: la sesión del test todavía tiene usuario (%), así que este bloque no mide la sesión administrativa', auth.uid();
  end if;

  update public.artworks set inventory_process_notes = 'corregido por consola'
   where catalog_id = 'AR-9600';

  select count(*) into v_n from public.change_log
   where row_key = 'AR-9600' and column_name = 'inventory_process_notes';
  if v_n <> 1 then
    raise exception 'FAIL: un cambio hecho por la sesión administrativa no se ha registrado (% líneas) (RF-1512)', v_n;
  end if;

  select changed_by into v_autor from public.change_log
   where row_key = 'AR-9600' and column_name = 'inventory_process_notes';
  if v_autor is not null then
    raise exception 'FAIL: sin sesión, el autor debería ser nulo y es %', v_autor;
  end if;
  raise notice 'OK: el cambio de una sesión sin usuario se registra igual, con autor nulo, que es la verdad (RF-1512)';
end $$;


-- ── 7. The log does not audit itself ─────────────────────────
--
-- It would be a recursion: every line written would generate lines about the line. It is not
-- only checked that there is no trigger attached —that is the shape—, but the
-- result: writing in the log produces no more rows than those written.
do $$
declare v_n integer; v_esperadas integer; v_antes integer;
begin
  select count(*) into v_antes from public.change_log;

  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}';
  set local role authenticated;
  -- Three fields at once: three lines and not one more.
  update public.artworks
     set signature_description = 'Ángulo inferior derecho',
         physical_location     = 'Almacén 2',
         measurements_verified = true
   where catalog_id = 'AR-9600';
  reset role;

  select count(*) into v_n from public.change_log;
  v_esperadas := v_antes + 3;
  if v_n <> v_esperadas then
    raise exception 'FAIL: tres campos deberían escribir tres líneas; la tabla ha pasado de % a % (esperado %). El registro se está auditando en cascada',
      v_antes, v_n, v_esperadas;
  end if;

  if exists (select 1 from public.change_log where row_key like 'c%-%' or catalog_id = 'change_log') then
    raise exception 'FAIL: hay líneas del registro que auditan al propio registro';
  end if;

  raise notice 'OK: tres campos son tres líneas exactas: el registro no se audita a sí mismo en cascada';
end $$;

reset role;

-- And the shape, which is what prevents it coming back: no trigger of the log calls
-- the writer, and the writer hangs from no table that is not audited.
do $$
declare v_tablas text[];
begin
  select coalesce(array_agg(distinct tgrelid::regclass::text order by tgrelid::regclass::text), '{}')
    into v_tablas
    from pg_trigger
   where tgfoid = 'public.tg_change_log()'::regprocedure and not tgisinternal;
  if v_tablas <> array['artworks', 'images'] then
    raise exception 'FAIL: el escritor del registro cuelga de [%]; debería colgar solo de artworks e images',
      array_to_string(v_tablas, ', ');
  end if;
  raise notice 'OK: el escritor cuelga exactamente de las dos tablas auditadas y de ninguna más';
end $$;

-- BOTH TRIGGERS ARE `AFTER`, AND THIS ASSERTION IS NOT STRUCTURAL DECORATION: IT IS THE
-- MOST EXPENSIVE ONE IN THE WHOLE FILE.
--
-- Measured, hooking the writer up as BEFORE and repeating a Reader's creation:
-- the artwork was NOT created (0 rows in `artworks`) and the log DID note its
-- creation line (1 row), with the `insert` giving no error at all. The cause is that the
-- writer ends with `return null`, which in an AFTER is ignored and in a BEFORE
-- MEANS «discard this row in silence». Hooked up as BEFORE, the writer
-- turns the whole catalogue into a hole: every creation is lost with no warning and the
-- log certifies creations that did not happen, which is the worst possible combination
-- of this pair's two halves.
--
-- The migration already checks it when applied; this checks it on every
-- `make db-test`, which is where it will show if somebody recreates the trigger by hand.
do $$
declare v_mal text[];
begin
  select coalesce(array_agg(tgname || ' sobre ' || tgrelid::regclass order by tgname), '{}')
    into v_mal
    from pg_trigger
   where tgfoid = 'public.tg_change_log()'::regprocedure
     and not tgisinternal
     and ((tgtype & 2) <> 0      -- before
       or (tgtype & 1) = 0);     -- por sentencia y no por fila
  if array_length(v_mal, 1) > 0 then
    raise exception 'FAIL: el escritor está enganchado como BEFORE o por sentencia en [%]. Como BEFORE, su `return null` DESCARTA la fila: se perderían las altas y el registro anotaría creaciones que no ocurrieron',
      array_to_string(v_mal, ', ');
  end if;
  raise notice 'OK: los dos triggers del escritor son AFTER y por fila; como BEFORE, su `return null` haría desaparecer cada alta en silencio';
end $$;


-- ── 8. What the writer CANNOT turn into (RF-1505) ────────────
--
-- A writer that knows how to reconstruct the previous values is 90 % of an
-- «undo». The other half does not exist and this block goes red the day it
-- appears. It is deliberately crude: its value is not precision, it is forcing
-- its deletion to appear in a diff somebody reads.

-- 8a. No function reads the log and writes in the catalogue.
do $$
declare v_sospechosas text[];
begin
  select coalesce(array_agg(p.proname order by p.proname), '{}')
    into v_sospechosas
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and p.proname not in ('tg_change_log', 'tg_change_log_append_only', 'tg_change_log_insert_guard')
     and p.prosrc like '%change_log%'
     and (p.prosrc like '%update public.artworks%' or p.prosrc like '%update public.images%'
       or p.prosrc like '%update artworks%'        or p.prosrc like '%update images%'
       or p.prosrc like '%insert into public.artworks%' or p.prosrc like '%insert into public.images%');
  if array_length(v_sospechosas, 1) > 0 then
    raise exception 'FAIL: hay funciones que leen el registro y escriben en el catálogo: %. El registro es informativo y no reversible (RF-1505)',
      array_to_string(v_sospechosas, ', ');
  end if;
  raise notice 'OK: ninguna función devuelve un valor del registro al catálogo (RF-1505)';
end $$;

-- 8b. And NO FUNCTION ACCEPTS A `change_id`, which is the signature an
--     «undo this action» would have: the log groups by `change_id` precisely so
--     the interface reads the action, and that same key is the one that would index the
--     restoration. The parameter's name is looked at and not only the type, because
--     half the base uses uuid.
do $$
declare v_rpc text[];
begin
  select coalesce(array_agg(p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')'
                            order by p.proname), '{}')
    into v_rpc
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and p.prorettype <> 'trigger'::regtype
     and coalesce(array_to_string(p.proargnames, ','), '') ~ '(^|,)[a-z_]*change_id';
  if array_length(v_rpc, 1) > 0 then
    raise exception 'FAIL: hay funciones que reciben un change_id, que es la firma de un «deshacer»: % (RF-1505)',
      array_to_string(v_rpc, ', ');
  end if;
  raise notice 'OK: ninguna función recibe un change_id: no hay por dónde deshacer una acción (RF-1505)';
end $$;

-- 8c. No view over the log that bypasses its policy, and the writer
--     returns nothing usable: it is a trigger function.
do $$
declare v_vistas text[];
begin
  select coalesce(array_agg(c.relname order by c.relname), '{}')
    into v_vistas
    from pg_class c
   where c.relnamespace = 'public'::regnamespace
     and c.relkind in ('v', 'm')
     and pg_get_viewdef(c.oid) like '%change_log%'
     and coalesce(array_to_string(c.reloptions, ','), '') not like '%security_invoker=true%';
  if array_length(v_vistas, 1) > 0 then
    raise exception 'FAIL: hay vistas sobre el registro que se saltan su política: %',
      array_to_string(v_vistas, ', ');
  end if;

  if (select prorettype from pg_proc where oid = 'public.tg_change_log()'::regprocedure)
     <> 'trigger'::regtype then
    raise exception 'FAIL: el escritor ha dejado de ser una función de trigger y se puede invocar (RF-1505)';
  end if;
  raise notice 'OK: ni vistas ni una función invocable: el registro no tiene camino de vuelta (RF-1505)';
end $$;


-- ── 9. The padlock, with the writer already in place (RF-1504) ─
--
-- THIS IS THE BLOCK THAT JUSTIFIES REPEATING WHAT change_log.test.sql ALREADY MEASURES.
-- Since this migration there exists a `security definer` function that CAN
-- insert into the log: it is new surface, and it has to be demonstrated that there is no
-- way of reaching it. The twelve attempts —three verbs for each of the
-- four roles— over a table that NOW HAS REAL ROWS, written by
-- the writer a few blocks above, so that an `update` or a `delete` that
-- «affects zero rows» cannot pass for a failure.
do $$
declare
  v_actores constant text[] := array['Lector', 'Catalogador', 'Superusuario', 'anónimo'];
  v_subs    constant text[] := array['00000000-0000-0000-0000-0000000000b2',
                                     '00000000-0000-0000-0000-0000000000b1',
                                     '00000000-0000-0000-0000-0000000000b3', ''];
  v_verbos  constant text[] := array['insert', 'update', 'delete'];
  v_sql     constant text[] := array[
    $q$insert into public.change_log (change_id, entity, row_key, catalog_id, operation)
       values (gen_random_uuid(), 'ARTWORK', 'AR-9600', 'AR-9600', 'CREATE')$q$,
    $q$update public.change_log set new_value = 'lo que a mí me convenga'$q$,
    $q$delete from public.change_log$q$];
  a integer; v integer; v_filas_antes integer; v_filas_despues integer;
  v_pasaron integer := 0; v_mal_motivo text[] := '{}';
begin
  select count(*) into v_filas_antes from public.change_log;
  if v_filas_antes < 1 then
    raise exception 'FAIL: el registro está vacío, así que estos doce intentos no atacan nada';
  end if;

  for a in 1 .. array_length(v_actores, 1) loop
    for v in 1 .. array_length(v_verbos, 1) loop
      begin
        if v_actores[a] = 'anónimo' then
          set local role anon;
        else
          perform set_config('request.jwt.claims',
            '{"sub":"' || v_subs[a] || '","role":"authenticated"}', true);
          set local role authenticated;
        end if;
        execute v_sql[v];
        reset role;
        v_pasaron := v_pasaron + 1;
      exception
        when insufficient_privilege then
          -- THE RIGHT ONE, and the kind of error matters as much as the fact of
          -- failing: stopped by PRIVILEGE is the FIRST of RF-113's two locks in
          -- series, the one PostgREST applies before looking at any
          -- policy and the one that also stops a `curl` bypassing the interface.
          reset role;
        when others then
          -- Stopped, but by the SECOND lock. It is a failure of the test and not a
          -- pass by the skin of its teeth: it means somebody has granted the
          -- privilege and that only one of the pair of locks is left. Measured: with
          -- `grant insert, update, delete ... to authenticated`, the twelve attempts
          -- start dying at the padlock instead of at the privilege.
          reset role;
          v_mal_motivo := v_mal_motivo
            || (v_actores[a] || ' ' || v_verbos[v] || ' (' || sqlstate || ')');
      end;
    end loop;
  end loop;

  if v_pasaron > 0 then
    raise exception 'FAIL: % de los doce intentos de escritura sobre el registro han pasado (RF-1504)', v_pasaron;
  end if;

  if array_length(v_mal_motivo, 1) > 0 then
    raise exception 'FAIL: estos intentos fallaron, pero NO por falta de privilegio: [%]. El privilegio se ha concedido y de las dos cerraduras en serie queda una (RF-113, RF-1504)',
      array_to_string(v_mal_motivo, ', ');
  end if;

  select count(*) into v_filas_despues from public.change_log;
  if v_filas_despues <> v_filas_antes then
    raise exception 'FAIL: los doce intentos han cambiado el número de líneas del registro: % -> %',
      v_filas_antes, v_filas_despues;
  end if;

  raise notice 'OK: los doce intentos (insert, update y delete por el Lector, el Catalogador, el Superusuario y el anónimo) fallan por PRIVILEGIO, y las % líneas siguen intactas (RF-1504, RF-113)',
    v_filas_antes;
end $$;

reset role;

-- And the two roles that bypass the RLS, against a table with rows. These are not
-- stopped by the privilege: they are stopped by the padlock, which is 20260805120000's whole
-- argument seen from the role for which only one of the two
-- locks works.
do $$
declare v_paradas integer := 0;
begin
  begin
    insert into public.change_log (change_id, entity, row_key, catalog_id, operation)
    values (gen_random_uuid(), 'ARTWORK', 'AR-9600', 'AR-9600', 'CREATE');
  exception when raise_exception then
    if sqlerrm <> 'En el registro de cambios solo escribe el trigger de auditoría' then
      raise exception 'FAIL: la inserción del propietario falló por otra cosa: %', sqlerrm;
    end if;
    v_paradas := v_paradas + 1;
  end;

  begin
    update public.change_log set new_value = 'corregido a posteriori';
  exception when raise_exception then
    if sqlerrm <> 'El registro de cambios no se modifica ni se borra: es un registro de auditoría' then
      raise exception 'FAIL: el update del propietario falló por otra cosa: %', sqlerrm;
    end if;
    v_paradas := v_paradas + 1;
  end;

  begin
    delete from public.change_log;
  exception when raise_exception then
    v_paradas := v_paradas + 1;
  end;

  begin
    truncate public.change_log;
  exception when raise_exception then
    v_paradas := v_paradas + 1;
  end;

  if v_paradas <> 4 then
    raise exception 'FAIL: el propietario debería quedar parado en los cuatro verbos, lo ha sido en % (RF-1504)', v_paradas;
  end if;
  raise notice 'OK: al propietario, que se salta la RLS, lo paran los candados en los cuatro verbos (RF-1504)';
end $$;

do $$
declare v_paradas integer := 0;
begin
  begin
    set local role postgres;
    insert into public.change_log (change_id, entity, row_key, catalog_id, operation)
    values (gen_random_uuid(), 'ARTWORK', 'AR-9600', 'AR-9600', 'CREATE');
    reset role;
  exception when raise_exception then
    reset role;
    v_paradas := v_paradas + 1;
  end;
  begin
    set local role postgres;
    delete from public.change_log;
    reset role;
  exception when raise_exception then
    reset role;
    v_paradas := v_paradas + 1;
  end;
  if v_paradas <> 2 then
    raise exception 'FAIL: al rol del panel deberían pararlo los dos candados, lo han hecho % (RF-1504)', v_paradas;
  end if;
  raise notice 'OK: al rol del panel de Supabase tampoco le dejan insertar ni borrar (RF-1504)';
end $$;

reset role;

-- THE ROUTE THE PADLOCK ITSELF WOULD OPEN IF IT WERE LOOKED AT BADLY. The insertion padlock
-- lets through any `insert` coming from inside another trigger
-- (`pg_trigger_depth() >= 2`). That would be exploitable if an application role
-- could CREATE a table with a trigger of its own and put an invented line in from there. It
-- cannot, for two independent reasons, and both are measured because
-- if one fell the other would be left alone.
do $$
begin
  if has_schema_privilege('authenticated', 'public', 'create')
     or has_schema_privilege('anon', 'public', 'create') then
    raise exception 'FAIL: un rol de la aplicación puede crear objetos en el esquema público; podría montar un trigger y colar líneas en el registro por el hueco de pg_trigger_depth()';
  end if;
  -- And even if it could: it would still not have `insert` over the log, which is
  -- checked before any trigger.
  if has_table_privilege('authenticated', 'public.change_log', 'insert')
     or has_table_privilege('anon', 'public.change_log', 'insert') then
    raise exception 'FAIL: un rol de la aplicación tiene insert sobre el registro (RF-1504)';
  end if;
  -- Nor EXECUTE over the writer, which is the third door and the most direct:
  -- invoking it would be of no use —it is a trigger function— but it is not left open.
  if has_function_privilege('authenticated', 'public.tg_change_log()', 'execute')
     or has_function_privilege('anon', 'public.tg_change_log()', 'execute') then
    raise exception 'FAIL: un rol de la aplicación puede ejecutar el escritor del registro';
  end if;
  raise notice 'OK: el hueco de pg_trigger_depth() no es explotable: ningún rol de la aplicación crea objetos, ni tiene insert, ni ejecuta el escritor (RF-1504)';
end $$;


-- ── 10. Who sees the history the writer has just written ─────
--
-- RF-1506 and RF-609, now over REAL lines and not over a fixture inserted by
-- hand. It is the check that was missing: the policy was written against rows
-- put in with the padlock disabled, and until today a line written by the
-- trigger had never been read.
do $$
declare v_n integer;
begin
  -- The artwork AR-9601 stays ACTIVE (it was restored in block 5) and AR-9600 too.
  -- AR-9601 is withdrawn to read the history of a record from the wastebasket.
  update public.artworks set active = false where catalog_id = 'AR-9601';

  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}';
  set local role authenticated;

  select count(*) into v_n from public.change_log where row_key = 'AR-9601';
  if v_n <> 0 then
    raise exception 'FAIL: el Lector ve % línea(s) de la historia de una obra retirada (RF-609, RF-1506)', v_n;
  end if;

  select count(*) into v_n from public.change_log where row_key = 'AR-9600';
  if v_n = 0 then
    raise exception 'FAIL: el Lector no ve nada de la historia de una obra activa (RF-105, RF-1506)';
  end if;
  reset role;

  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}';
  set local role authenticated;
  select count(*) into v_n from public.change_log where row_key = 'AR-9601';
  if v_n = 0 then
    raise exception 'FAIL: el Catalogador no ve la historia de la ficha que está en la papelera (RF-913, RF-1506)';
  end if;
  reset role;

  raise notice 'OK: sobre líneas escritas por el trigger, el Lector no ve la historia de la papelera y el Catalogador sí (RF-609, RF-913, RF-1506)';
end $$;

reset role;


-- ── 11. What the writer discards, measured against the catalogue ─
--
-- Both directions, as in the migration, so this file goes
-- red if somebody adds a generated column to an audited table without deciding what
-- to do with it. In the migration the assertion runs once; here it runs
-- on every `make db-test`, which is where it will show.
do $$
declare
  c_ignored constant text[] := array[
    'created_at', 'created_by', 'updated_at', 'updated_by', 'basic_updated_at',
    'deactivated_at', 'deactivated_by', 'restored_at', 'restored_by',
    'execution_date'
  ];
  v_mal   text[];
  v_fuente text := (select prosrc from pg_proc
                     where oid = 'public.tg_change_log()'::regprocedure);
begin
  -- Que la lista de este test siga siendo la de la función: si alguien cambia una
  -- y no la otra, este fichero deja de medir lo que dice medir. Se busca cada
  -- nombre en el cuerpo del escritor, que es lo único observable desde aquí.
  select coalesce(array_agg(i order by i), '{}') into v_mal
    from unnest(c_ignored) i
   where position(i in v_fuente) = 0;
  if array_length(v_mal, 1) > 0 then
    raise exception 'FAIL: la lista de descartes de este test no coincide con la del escritor; el escritor no menciona: [%]',
      array_to_string(v_mal, ', ');
  end if;

  select coalesce(array_agg(attrelid::regclass || '.' || attname order by attname), '{}')
    into v_mal
    from pg_attribute
   where attrelid in ('public.artworks'::regclass, 'public.images'::regclass)
     and attgenerated <> '' and attnum > 0 and not attisdropped
     and attname <> all (c_ignored);
  if array_length(v_mal, 1) > 0 then
    raise exception 'FAIL: hay columnas generadas nuevas que el escritor anotaría como cambios del usuario: [%]',
      array_to_string(v_mal, ', ');
  end if;

  if 'active' = any (c_ignored) then
    raise exception 'FAIL: `active` está descartada; retirar una ficha no dejaría rastro';
  end if;

  raise notice 'OK: los descartes del escritor son exactamente las marcas de traza y las derivadas, y `active` no está entre ellos (RF-1509)';
end $$;

rollback;
