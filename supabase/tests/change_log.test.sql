-- The change log: RF-1501 to RF-1508.
-- And, ahead of everything, the perimeter: RF-101, RF-105, RF-106, RF-109, RF-111,
-- RF-113, RF-609, RF-901.
--
-- WHAT THIS FILE REALLY DEFENDS ARE THE PERMISSIONS. An audit
-- log the audited can edit is not an audit log, it is a
-- note; and one to which invented lines can be ADDED is as broken as
-- one from which the true ones can be removed. So here it is not checked
-- «that the table exists»: it is attacked with each role's session —Cataloguer,
-- Reader, anonymous— and with the two roles that bypass the RLS —the table's
-- owner and `postgres`—, and the KIND of failure is asserted, because an `insert`
-- stopped by lack of privilege and one stopped by lack of policy are different
-- things and here both have to happen.
--
-- THE WRITER ALREADY EXISTS, and this comment said the opposite until it was
-- audited: 20260805120000 announced that «the trigger that fills the log arrives in
-- the next migration» and the next one did not bring it, so for a day the
-- log was closed and empty. 20260805140000 brings it, and its half —that the
-- log IS written, with the right author and by every path— is
-- verified in `change_log_writer.test.sql`.
--
-- This file still inserts its test rows BY HAND, DISABLING
-- `change_log_insert_guard` inside the test's transaction and reactivating it
-- afterwards, and now it is a decision and not a necessity: here THE PERIMETER is measured,
-- and for that rows with chosen values are needed —a specific `old_value`, a
-- null `changed_by`, an artwork in the wastebasket— that a real change does not give on request.
-- Incidentally it demonstrates twice that the padlock is in place: before removing it and
-- after putting it back. The rows the real trigger writes are read in the
-- other file.
--
-- A consequence of the writer existing, and that is why it is written down: the artwork and
-- photograph fixtures below ALREADY WRITE their own lines in the log.
-- That is why every count in this file is bounded by `change_id` and not by
-- the whole table. That precaution was there from the start, and today it is what
-- holds the file up.
--
-- Every count is bounded by this file's `change_id`s and not by the whole
-- table, so that the day the writer exists —and the creations of these very
-- fixtures start writing their own rows— this test goes on measuring
-- what it says it measures.
\set ON_ERROR_STOP on
begin;

-- ── Fixtures ─────────────────────────────────────────────────
--
-- A real cataloguer and a real reader; the profiles are created by the
-- auth.users trigger. Two artworks —one active and one withdrawn— and two photographs of the
-- active one —one active and one withdrawn—, which is the minimum for exercising the
-- visibility inherited by the two audited entities.

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000e1', 'cat-registro@test.local'),
  ('00000000-0000-0000-0000-0000000000e2', 'lec-registro@test.local');
update public.profiles set role = 'CATALOGER' where id = '00000000-0000-0000-0000-0000000000e1';
update public.profiles set role = 'READER'    where id = '00000000-0000-0000-0000-0000000000e2';

insert into public.artworks (catalog_id, artist, title, attributed_title) values
  ('AR-9800', 'ROTILI', 'Obra con historial', 'UNCONFIRMED'),
  ('AR-9801', 'ROTILI', 'Obra retirada con historial', 'UNCONFIRMED');

insert into public.images (catalog_id, thumbnail_path, derivative_path, master_path, shot_type) values
  ('AR-9800', 'h/min1.webp', 'h/der1.webp', 'h/master1.jpg', 'GENERAL'),
  ('AR-9800', 'h/min2.webp', 'h/der2.webp', 'h/master2.jpg', 'BACK');

update public.images   set active = false where image_id   = 'AR-9800_v2';
update public.artworks set active = false where catalog_id = 'AR-9801';


-- ── 1. The table is born closed (RF-111, RF-113, RF-901) ─────
--
-- Absolute priority and before anything else: with no backend, these privileges and these
-- policies are the only perimeter, and the anonymous key travels in the client. The
-- system catalogue is measured, which is where the `grant` somebody
-- added without thinking is visible.
do $$
declare v_privilegios text[];
begin
  if not (select relrowsecurity from pg_class where oid = 'public.change_log'::regclass) then
    raise exception 'FAIL: change_log no tiene RLS activado (RF-111)';
  end if;

  -- El rol anónimo, ni un privilegio. Revocar de `anon` no deshace lo que PUBLIC
  -- concede, así que lo que se mira es el resultado y no la sentencia.
  select coalesce(array_agg(distinct privilege_type order by privilege_type), '{}')
    into v_privilegios
    from information_schema.table_privileges
   where table_schema = 'public' and table_name = 'change_log' and grantee = 'anon';
  if array_length(v_privilegios, 1) > 0 then
    raise exception 'FAIL: el rol anónimo tiene privilegios sobre el registro de cambios: [%]',
      array_to_string(v_privilegios, ', ');
  end if;

  -- EL ASERTO QUE CAZA EL FALLO MÁS CARO DE ESTA TABLA: `service_role` también
  -- sin nada. Las ACL por omisión de la plataforma le conceden INSERT, UPDATE,
  -- DELETE y TRUNCATE sobre toda tabla nueva, y además lleva `bypassrls`: sin el
  -- `revoke`, cualquiera con la clave de servicio podría insertar filas FALSAS
  -- en la auditoría, que es peor que no tener auditoría.
  select coalesce(array_agg(distinct privilege_type order by privilege_type), '{}')
    into v_privilegios
    from information_schema.table_privileges
   where table_schema = 'public' and table_name = 'change_log' and grantee = 'service_role';
  if array_length(v_privilegios, 1) > 0 then
    raise exception 'FAIL: la clave de servicio tiene privilegios sobre el registro de cambios: [%] (RF-1504)',
      array_to_string(v_privilegios, ', ');
  end if;

  -- Y el autenticado, EXACTAMENTE uno. Se compara el conjunto completo y no se
  -- pregunta «¿no tiene delete?», para que un `grant` futuro de cualquier cosa
  -- ponga esto en rojo.
  select coalesce(array_agg(distinct privilege_type order by privilege_type), '{}')
    into v_privilegios
    from information_schema.table_privileges
   where table_schema = 'public' and table_name = 'change_log' and grantee = 'authenticated';
  if v_privilegios <> array['SELECT'] then
    raise exception 'FAIL: el rol autenticado debería tener SOLO SELECT sobre el registro de cambios, tiene [%] (RF-1504)',
      array_to_string(v_privilegios, ', ');
  end if;

  raise notice 'OK: solo SELECT y solo para el autenticado; ni el anónimo ni la clave de servicio tienen nada (RF-1504)';
end $$;

-- La secuencia de identidad, por la puerta de atrás. Quien pudiera hacerle
-- `setval` hacia atrás dejaría el catálogo entero sin poder guardar: cada cambio
-- de una obra chocaría contra la clave primaria del registro. La plataforma
-- concede rwU sobre toda secuencia nueva a los tres roles, así que esto no es
-- teórico.
do $$
declare v_rol text;
begin
  foreach v_rol in array array['anon', 'authenticated', 'service_role'] loop
    if has_sequence_privilege(v_rol, 'public.change_log_id_seq', 'usage')
       or has_sequence_privilege(v_rol, 'public.change_log_id_seq', 'update')
       or has_sequence_privilege(v_rol, 'public.change_log_id_seq', 'select') then
      raise exception 'FAIL: % puede tocar la secuencia de identidad del registro de cambios', v_rol;
    end if;
  end loop;
  raise notice 'OK: la secuencia de identidad del registro no la toca ningún rol de la aplicación';
end $$;

-- Una sola política, y de lectura. LA AUSENCIA DE LAS OTRAS TRES ES LA
-- DENEGACIÓN (RF-111): esto es lo que hay que afirmar, y no que la de SELECT
-- exista.
do $$
declare v_politicas text[];
begin
  select coalesce(array_agg(policyname || ' (' || cmd || ')' order by policyname), '{}')
    into v_politicas
    from pg_policies
   where schemaname = 'public' and tablename = 'change_log'
     and cmd <> 'SELECT';
  if array_length(v_politicas, 1) > 0 then
    raise exception 'FAIL: el registro de cambios tiene políticas de escritura: % (RF-1504)',
      array_to_string(v_politicas, ', ');
  end if;

  if not exists (select 1 from pg_policies
                  where schemaname = 'public' and tablename = 'change_log'
                    and cmd = 'SELECT') then
    raise exception 'FAIL: el registro de cambios no tiene política de lectura y nadie podría consultarlo (RF-1506)';
  end if;

  raise notice 'OK: una política y solo de lectura; insert, update y delete se deniegan por ausencia (RF-111, RF-1504)';
end $$;

-- Y NO lleva `force row level security`. Este aserto parece al revés y no lo
-- está: esa línea es justo la que alguien añade en una revisión de seguridad
-- creyendo que endurece. Aquí anularía la exención del propietario, abortaría el
-- insert del trigger escritor y con él EL GUARDADO DEL USUARIO. Rompería el
-- catálogo, no el registro.
do $$
begin
  if (select relforcerowsecurity from pg_class where oid = 'public.change_log'::regclass) then
    raise exception 'FAIL: change_log tiene «force row level security»: el escritor del registro no podrá insertar y se romperá el guardado de cualquier obra';
  end if;
  raise notice 'OK: change_log no fuerza la RLS sobre su propietario, que es lo que permite que el trigger escriba';
end $$;

-- Los dos enumerados son legibles por la aplicación: sin USAGE, un filtro por
-- operación desde PostgREST fallaría con «permission denied for type».
do $$
begin
  if not has_type_privilege('authenticated', 'public.audited_entity', 'usage')
     or not has_type_privilege('authenticated', 'public.change_operation', 'usage') then
    raise exception 'FAIL: el rol autenticado no puede usar los enumerados del registro de cambios';
  end if;
  raise notice 'OK: los dos enumerados del registro son usables por la aplicación';
end $$;


-- ── 2. El anónimo, atacando de verdad (RF-101) ───────────────
do $$
begin
  set local role anon;
  perform 1 from public.change_log limit 1;
  reset role;
  raise exception 'FAIL: el rol anónimo ha podido consultar el registro de cambios (RF-101)';
exception
  when insufficient_privilege then
    reset role;
    raise notice 'OK: el rol anónimo no llega al registro de cambios (RF-101)';
end $$;

reset role;


-- ── 3. El Catalogador no escribe en su propia auditoría ──────
--
-- RF-1504. Es el aserto central del fichero: quien cataloga es el auditado, y el
-- auditado no toca el registro. Se afirma el TIPO de error —falta de
-- privilegio— y no solo que falla: un insert bloqueado por privilegio y uno
-- bloqueado por política son fallos distintos, y aquí tiene que ocurrir el de
-- privilegio, que es el que también para a un cliente que se salte la interfaz.

do $$
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000e1","role":"authenticated"}';
  set local role authenticated;
  insert into public.change_log (change_id, entity, row_key, catalog_id, operation)
  values (gen_random_uuid(), 'ARTWORK', 'AR-9800', 'AR-9800', 'CREATE');
  reset role;
  raise exception 'FAIL: el Catalogador ha insertado una línea inventada en el registro de cambios (RF-1504)';
exception
  when insufficient_privilege then
    reset role;
    raise notice 'OK: el Catalogador no puede insertar en el registro de cambios, y falla por privilegio (RF-1504)';
end $$;

reset role;

do $$
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000e1","role":"authenticated"}';
  set local role authenticated;
  update public.change_log set new_value = 'lo que a mí me convenga';
  reset role;
  raise exception 'FAIL: el Catalogador ha podido modificar el registro de cambios (RF-1504)';
exception
  when insufficient_privilege then
    reset role;
    raise notice 'OK: el Catalogador no puede modificar el registro de cambios (RF-1504)';
end $$;

reset role;

-- Y el borrado, que es el ataque que de verdad importa: si esto solo afectara a
-- cero filas en vez de fallar, sería el comportamiento de una política ausente
-- sobre un privilegio CONCEDIDO, y el día que alguien escribiera la política se
-- podría borrar la auditoría entera.
do $$
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000e1","role":"authenticated"}';
  set local role authenticated;
  delete from public.change_log;
  reset role;
  raise exception 'FAIL: el Catalogador ha podido borrar del registro de cambios (RF-901, RF-1504)';
exception
  when insufficient_privilege then
    reset role;
    raise notice 'OK: el Catalogador no puede borrar del registro de cambios (RF-901, RF-1504)';
end $$;

reset role;


-- ── 4. El Lector, los mismos tres intentos ───────────────────
--
-- RF-106, RF-1504. No se da por hecho que «si el Catalogador no puede, el Lector
-- tampoco»: los privilegios son del rol de base de datos y los dos papeles
-- comparten `authenticated`, así que lo que se prueba es el mismo candado desde
-- la otra sesión, que es lo que pide la matriz de roles.
do $$
declare v_sentencias constant text[] := array[
    $q$insert into public.change_log (change_id, entity, row_key, catalog_id, operation)
       values (gen_random_uuid(), 'ARTWORK', 'AR-9800', 'AR-9800', 'CREATE')$q$,
    $q$update public.change_log set new_value = 'reescrito por el lector'$q$,
    $q$delete from public.change_log$q$
  ];
  i integer;
begin
  for i in 1 .. array_length(v_sentencias, 1) loop
    begin
      set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000e2","role":"authenticated"}';
      set local role authenticated;
      execute v_sentencias[i];
      reset role;
      raise exception 'FAIL: el Lector ha podido ejecutar sobre el registro de cambios: %', v_sentencias[i];
    exception
      when insufficient_privilege then
        reset role;
    end;
  end loop;
  raise notice 'OK: el Lector no inserta, no modifica y no borra en el registro de cambios (RF-106, RF-1504)';
end $$;

reset role;


-- ── 4 bis. El Superusuario, que es quien más puede ───────────
--
-- RF-109, RF-1504. Añadido al auditar este fichero: faltaba el tercer papel, y
-- era el que peor se podía dar por supuesto. Los otros dos bloques se justifican
-- diciendo que «los privilegios son del rol de base de datos y los dos papeles
-- comparten `authenticated`»; ese mismo argumento vale para el Superusuario, pero
-- es un argumento, y lo que este fichero promete en su cabecera es atacar con la
-- sesión de cada papel.
--
-- Y hay una razón para que sea la celda MÁS importante de las tres: el
-- Superusuario es el papel de RF-1105, el que administra usuarios desde el panel
-- de Supabase. Su sesión de aplicación no debe poder tocar el registro, porque lo
-- que change_log.sql decide es que la frontera esté en «entrar por el panel con
-- una sentencia deliberada» y no en «tener el papel más alto de la aplicación».
-- Si esta celda cayera, esa frontera se movería sin que nadie lo hubiera decidido.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000e3', 'sup-registro@test.local');
update public.profiles set role = 'SUPERUSER' where id = '00000000-0000-0000-0000-0000000000e3';

do $$
declare v_sentencias constant text[] := array[
    $q$insert into public.change_log (change_id, entity, row_key, catalog_id, operation)
       values (gen_random_uuid(), 'ARTWORK', 'AR-9800', 'AR-9800', 'CREATE')$q$,
    $q$update public.change_log set new_value = 'reescrito por el superusuario'$q$,
    $q$delete from public.change_log$q$
  ];
  i integer;
begin
  for i in 1 .. array_length(v_sentencias, 1) loop
    begin
      set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000e3","role":"authenticated"}';
      set local role authenticated;
      execute v_sentencias[i];
      reset role;
      raise exception 'FAIL: el Superusuario ha podido ejecutar sobre el registro de cambios: %', v_sentencias[i];
    exception
      when insufficient_privilege then
        reset role;
    end;
  end loop;
  raise notice 'OK: ni el Superusuario inserta, modifica o borra en el registro; el papel más alto de la aplicación es aquí igual de impotente que el Lector (RF-109, RF-1504)';
end $$;

reset role;


-- ── 5. El auditado editando su propia auditoría desde dentro ──
--
-- RF-1504, y hay que escribirlo aunque parezca paranoico, porque es el escenario
-- que la RLS NO cubre: las políticas no se aplican al propietario de la tabla.
-- Aquí la sesión es la administrativa —la misma con la que se aplica una
-- migración o se abre el editor SQL del panel— y lo único que la para son los
-- dos triggers. Se comprueban los cuatro verbos y el MENSAJE, porque el mensaje
-- es lo que va a leer quien se tropiece con esto dentro de dos años.

do $$
begin
  insert into public.change_log (change_id, entity, row_key, catalog_id, operation)
  values (gen_random_uuid(), 'ARTWORK', 'AR-9800', 'AR-9800', 'CREATE');
  raise exception 'FAIL: el propietario de la tabla ha insertado a mano una línea en el registro de cambios (RF-1504)';
exception
  when raise_exception then
    if sqlerrm <> 'En el registro de cambios solo escribe el trigger de auditoría' then
      raise exception 'FAIL: la inserción a mano falló, pero por otra cosa: %', sqlerrm;
    end if;
    raise notice 'OK: ni el propietario inserta a mano; solo escribe el trigger de auditoría (RF-1504)';
end $$;

do $$
begin
  update public.change_log set new_value = 'corregido a posteriori';
  raise exception 'FAIL: el propietario de la tabla ha modificado el registro de cambios (RF-1504)';
exception
  when raise_exception then
    if sqlerrm <> 'El registro de cambios no se modifica ni se borra: es un registro de auditoría' then
      raise exception 'FAIL: el update falló, pero por otra cosa: %', sqlerrm;
    end if;
    raise notice 'OK: ni el propietario modifica el registro de cambios (RF-1504)';
end $$;

do $$
begin
  delete from public.change_log;
  raise exception 'FAIL: el propietario de la tabla ha borrado del registro de cambios (RF-901, RF-1504)';
exception
  when raise_exception then
    if sqlerrm <> 'El registro de cambios no se modifica ni se borra: es un registro de auditoría' then
      raise exception 'FAIL: el delete falló, pero por otra cosa: %', sqlerrm;
    end if;
    raise notice 'OK: ni el propietario borra del registro de cambios (RF-901, RF-1504)';
end $$;

-- El truncate es la vía por la que se pierde una tabla entera de un tirón, y no
-- la cubre ninguna política: la RLS no tiene nada que decir sobre TRUNCATE.
do $$
begin
  truncate public.change_log;
  raise exception 'FAIL: se ha podido vaciar el registro de cambios de un tirón (RF-1504, RF-1507)';
exception
  when raise_exception then
    if sqlerrm <> 'El registro de cambios no se modifica ni se borra: es un registro de auditoría' then
      raise exception 'FAIL: el truncate falló, pero por otra cosa: %', sqlerrm;
    end if;
    raise notice 'OK: el registro de cambios no se vacía (RF-1504, RF-1507)';
end $$;


-- ── 6. Y `postgres`, que conserva sus privilegios a propósito ──
--
-- RF-1504. Es el rol del panel de Supabase y el que repone el volcado, lleva
-- `bypassrls` y NO se le revoca nada: quitárselo rompería la restauración de la
-- base sin cerrar nada, porque se salta la RLS igual. Así que lo que hay que
-- demostrar es que lo detiene el OTRO candado — que es exactamente el argumento
-- de los dos cerrojos en serie, visto desde el rol para el que solo sirve uno.
do $$
begin
  set local role postgres;
  insert into public.change_log (change_id, entity, row_key, catalog_id, operation)
  values (gen_random_uuid(), 'ARTWORK', 'AR-9800', 'AR-9800', 'CREATE');
  reset role;
  raise exception 'FAIL: el rol del panel ha insertado una línea falsa en el registro de cambios (RF-1504)';
exception
  when raise_exception then
    reset role;
    if sqlerrm <> 'En el registro de cambios solo escribe el trigger de auditoría' then
      raise exception 'FAIL: la inserción del rol del panel falló, pero por otra cosa: %', sqlerrm;
    end if;
    raise notice 'OK: al rol del panel, que se salta la RLS, lo para el candado de inserción (RF-1504)';
end $$;

reset role;

do $$
begin
  set local role postgres;
  delete from public.change_log;
  reset role;
  raise exception 'FAIL: el rol del panel ha borrado del registro de cambios (RF-901, RF-1504)';
exception
  when raise_exception then
    reset role;
    if sqlerrm <> 'El registro de cambios no se modifica ni se borra: es un registro de auditoría' then
      raise exception 'FAIL: el delete del rol del panel falló, pero por otra cosa: %', sqlerrm;
    end if;
    raise notice 'OK: al rol del panel tampoco le deja borrar el candado (RF-901, RF-1504)';
end $$;

reset role;


-- ── 7. Las filas de prueba, y por qué cuesta ponerlas ────────
--
-- Que haya que desactivar el candado para poder escribir un fixture ES el
-- resultado que se buscaba. Se desactiva, se escriben las cuatro filas, y se
-- vuelve a activar antes de seguir.

alter table public.change_log disable trigger change_log_insert_guard;

insert into public.change_log
  (change_id, entity, row_key, catalog_id, operation, column_name, old_value, new_value, changed_by)
values
  ('c1000001-0000-4000-8000-000000000001', 'ARTWORK', 'AR-9800', 'AR-9800',
   'CREATE', null, null, null, '00000000-0000-0000-0000-0000000000e1'),
  ('c1000001-0000-4000-8000-000000000002', 'ARTWORK', 'AR-9800', 'AR-9800',
   'UPDATE', 'height_cm', '54.00', '45.00', '00000000-0000-0000-0000-0000000000e1'),
  -- El historial de una obra que está en la papelera: el Lector no debe
  -- enterarse ni de que existe (RF-609).
  ('c1000001-0000-4000-8000-000000000003', 'ARTWORK', 'AR-9801', 'AR-9801',
   'DEACTIVATE', 'active', 'true', 'false', '00000000-0000-0000-0000-0000000000e1'),
  -- El de una fotografía activa y el de una retirada, las dos de una obra que sí
  -- se ve: es el hueco que se cerraría solo si la política pregunta por la fila
  -- auditada y no por la obra.
  ('c1000001-0000-4000-8000-000000000004', 'IMAGE', 'AR-9800_v1', 'AR-9800',
   'CREATE', null, null, null, '00000000-0000-0000-0000-0000000000e1'),
  ('c1000001-0000-4000-8000-000000000005', 'IMAGE', 'AR-9800_v2', 'AR-9800',
   'DEACTIVATE', 'active', 'true', 'false', '00000000-0000-0000-0000-0000000000e1'),
  -- Sin sesión: `changed_by` nulo es la verdad de una migración, no un hueco.
  ('c1000001-0000-4000-8000-000000000006', 'ARTWORK', 'AR-9800', 'AR-9800',
   'UPDATE', 'technique', null, 'Hierro soldado', null);

alter table public.change_log enable trigger change_log_insert_guard;

-- Y devuelto el candado, vuelve a cerrar. Sin este aserto, un fichero de test
-- que se dejara el trigger apagado pasaría igual y dejaría la tabla abierta para
-- el siguiente que mirase.
do $$
begin
  insert into public.change_log (change_id, entity, row_key, catalog_id, operation)
  values (gen_random_uuid(), 'ARTWORK', 'AR-9800', 'AR-9800', 'CREATE');
  raise exception 'FAIL: el candado de inserción no ha vuelto a quedar activo';
exception
  when raise_exception then
    if sqlerrm <> 'En el registro de cambios solo escribe el trigger de auditoría' then
      raise exception 'FAIL: el candado devuelto falla por otra cosa: %', sqlerrm;
    end if;
    raise notice 'OK: el candado de inserción vuelve a cerrar después del fixture (RF-1504)';
end $$;


-- ── 8. Quién ve qué historial (RF-1506, RF-609) ──────────────
--
-- La regla no es una copia de la visibilidad de la ficha: es la visibilidad de
-- la ficha, porque la subconsulta de la política se evalúa BAJO LA POLÍTICA DE
-- SU PROPIA TABLA. Se prueba con las cuatro combinaciones, y la que de verdad
-- importa es la cuarta — la fotografía retirada de una obra ACTIVA, que es donde
-- una política escrita «por obra» habría filtrado.

do $$
declare v_n integer;
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000e1","role":"authenticated"}';
  set local role authenticated;

  select count(*) into v_n from public.change_log
   where change_id::text like 'c1000001-%';
  reset role;

  if v_n <> 6 then
    raise exception 'FAIL: el Catalogador debería ver las seis líneas del historial, ve % (RF-906)', v_n;
  end if;
  raise notice 'OK: el Catalogador ve el historial de todo, papelera incluida (RF-906, RF-1506)';
end $$;

reset role;

do $$
declare v_n integer;
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000e2","role":"authenticated"}';
  set local role authenticated;

  -- Lo de la obra activa, sí: tres líneas (el alta, el alto y la técnica).
  select count(*) into v_n from public.change_log
   where change_id::text like 'c1000001-%' and entity = 'ARTWORK' and row_key = 'AR-9800';
  if v_n <> 3 then
    raise exception 'FAIL: el Lector debería ver las tres líneas de la obra activa, ve % (RF-105)', v_n;
  end if;

  -- Lo de la obra retirada, nada: ni la línea, ni el hecho de que se retiró.
  select count(*) into v_n from public.change_log
   where change_id::text like 'c1000001-%' and row_key = 'AR-9801';
  if v_n <> 0 then
    raise exception 'FAIL: el Lector ve % línea(s) del historial de una obra retirada (RF-609)', v_n;
  end if;

  -- La fotografía activa, sí.
  select count(*) into v_n from public.change_log
   where change_id::text like 'c1000001-%' and row_key = 'AR-9800_v1';
  if v_n <> 1 then
    raise exception 'FAIL: el Lector no ve el historial de una fotografía activa (RF-105)';
  end if;

  -- Y la fotografía RETIRADA de una obra que sí ve: cero. Este es el aserto que
  -- distingue una política escrita sobre la fila auditada de una escrita sobre
  -- la obra.
  select count(*) into v_n from public.change_log
   where change_id::text like 'c1000001-%' and row_key = 'AR-9800_v2';
  if v_n <> 0 then
    raise exception 'FAIL: el Lector ve el historial de una fotografía retirada de una obra activa (RF-609)';
  end if;

  reset role;
  raise notice 'OK: el Lector ve el historial de lo que puede ver y de nada más (RF-105, RF-609, RF-1506)';
end $$;

reset role;

-- Una sesión autenticada SIN PERFIL no ve nada. Es el caso de un JWT válido
-- emitido para alguien a quien todavía no se le ha dado papel (RF-104): `can_read()`
-- es falso y la política no llega ni a mirar la entidad.
do $$
declare v_n integer;
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000dead","role":"authenticated"}';
  set local role authenticated;
  select count(*) into v_n from public.change_log where change_id::text like 'c1000001-%';
  reset role;

  if v_n <> 0 then
    raise exception 'FAIL: una sesión sin perfil ve % línea(s) del historial (RF-104, RF-1506)', v_n;
  end if;
  raise notice 'OK: una sesión autenticada sin perfil no ve ninguna línea del historial (RF-104)';
end $$;

reset role;

-- El valor almacenado se guarda TAL CUAL, y traducirlo es tarea de la interfaz
-- (RF-1502). Se afirma sobre la línea que el Lector sí ve: `'54.00'` y no
-- «54 cm», y el nulo de `old_value` sigue siendo nulo y no la cadena «null».
do $$
declare v_old text; v_new text; v_col text;
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000e2","role":"authenticated"}';
  set local role authenticated;
  select column_name, old_value, new_value into v_col, v_old, v_new
    from public.change_log where change_id = 'c1000001-0000-4000-8000-000000000002';
  reset role;

  if v_col <> 'height_cm' or v_old <> '54.00' or v_new <> '45.00' then
    raise exception 'FAIL: el registro no guarda la representación almacenada del valor: % [%] -> [%]',
      v_col, coalesce(v_old, '(nulo)'), coalesce(v_new, '(nulo)');
  end if;

  select old_value into v_old
    from public.change_log where change_id = 'c1000001-0000-4000-8000-000000000006';
  if v_old is not null then
    raise exception 'FAIL: un valor anterior nulo se ha guardado como texto [%]', v_old;
  end if;

  raise notice 'OK: los valores se guardan como están almacenados y el nulo sigue siendo nulo (RF-1502)';
end $$;

reset role;


-- ── 9. Las restricciones, cada una por su nombre ─────────────
--
-- Lo que PostgreSQL dice al rechazar es el NOMBRE de la restricción, así que se
-- comprueba el nombre y no solo que falle: una fila rechazada por la restricción
-- equivocada es una restricción que no está haciendo lo que se cree.

alter table public.change_log disable trigger change_log_insert_guard;

do $$
begin
  insert into public.change_log (change_id, entity, row_key, catalog_id, operation)
  values (gen_random_uuid(), 'ARTWORK', 'AR-9800_v1', 'AR-9800', 'CREATE');
  raise exception 'FAIL: se ha aceptado una línea de obra cuya clave no es su identificador de catalogación';
exception
  when check_violation then
    if sqlerrm not like '%change_log_artwork_key_is_catalog_id%' then
      raise exception 'FAIL: rechazada por la restricción equivocada: %', sqlerrm;
    end if;
    raise notice 'OK: para una obra, la fila auditada es la obra (change_log_artwork_key_is_catalog_id)';
end $$;

-- La equivalencia, en los DOS sentidos, porque una restricción escrita con `=`
-- entre dos predicados se puede romper por cualquiera de los dos lados.
do $$
begin
  insert into public.change_log (change_id, entity, row_key, catalog_id, operation, column_name)
  values (gen_random_uuid(), 'ARTWORK', 'AR-9800', 'AR-9800', 'UPDATE', null);
  raise exception 'FAIL: se ha aceptado un cambio sin decir qué campo cambió';
exception
  when check_violation then
    if sqlerrm not like '%change_log_create_has_no_column%' then
      raise exception 'FAIL: rechazada por la restricción equivocada: %', sqlerrm;
    end if;
    raise notice 'OK: un cambio sin campo no entra (change_log_create_has_no_column)';
end $$;

do $$
begin
  insert into public.change_log (change_id, entity, row_key, catalog_id, operation, column_name)
  values (gen_random_uuid(), 'ARTWORK', 'AR-9800', 'AR-9800', 'CREATE', 'title');
  raise exception 'FAIL: se ha aceptado un alta que además señala un campo';
exception
  when check_violation then
    if sqlerrm not like '%change_log_create_has_no_column%' then
      raise exception 'FAIL: rechazada por la restricción equivocada: %', sqlerrm;
    end if;
    raise notice 'OK: el alta es la única línea sin campo, y no lleva ninguno (change_log_create_has_no_column)';
end $$;

do $$
begin
  insert into public.change_log (change_id, entity, row_key, catalog_id, operation, old_value)
  values (gen_random_uuid(), 'ARTWORK', 'AR-9800', 'AR-9800', 'CREATE', 'algo que había antes');
  raise exception 'FAIL: se ha aceptado un alta con un valor anterior, que no puede existir';
exception
  when check_violation then
    if sqlerrm not like '%change_log_create_has_no_values%' then
      raise exception 'FAIL: rechazada por la restricción equivocada: %', sqlerrm;
    end if;
    raise notice 'OK: antes de un alta no había nada (change_log_create_has_no_values)';
end $$;

do $$
begin
  insert into public.change_log (change_id, entity, row_key, catalog_id, operation, column_name)
  values (gen_random_uuid(), 'ARTWORK', 'AR-9800', 'AR-9800', 'UPDATE', '   ');
  raise exception 'FAIL: se ha aceptado una línea cuyo campo es un puñado de espacios';
exception
  when check_violation then
    if sqlerrm not like '%change_log_column_name_not_blank%' then
      raise exception 'FAIL: rechazada por la restricción equivocada: %', sqlerrm;
    end if;
    raise notice 'OK: el nombre del campo no puede quedar en blanco (change_log_column_name_not_blank)';
end $$;

-- Nadie elige el número de línea: la identidad es `generated always`, y eso es
-- lo que impide colar una fila «entre» dos verdaderas.
do $$
begin
  insert into public.change_log (id, change_id, entity, row_key, catalog_id, operation)
  values (1, gen_random_uuid(), 'ARTWORK', 'AR-9800', 'AR-9800', 'CREATE');
  raise exception 'FAIL: se ha podido elegir el número de línea del registro';
exception
  when generated_always then
    raise notice 'OK: el número de línea lo pone la base y no se puede elegir';
end $$;

-- Y lo que SÍ tiene que entrar: varias filas con el mismo `change_id` y campos
-- distintos son una sola acción del usuario con varios campos cambiados, que es
-- la forma normal de este registro (RF-1502). La invariante de «una fila por
-- campo y operación» la garantiza el recorrido de claves del escritor y se
-- afirma en su propio test, no con un índice único.
do $$
declare v_n integer;
begin
  insert into public.change_log
    (change_id, entity, row_key, catalog_id, operation, column_name, old_value, new_value)
  values
    ('c1000002-0000-4000-8000-000000000001', 'ARTWORK', 'AR-9800', 'AR-9800',
     'UPDATE', 'width_cm', '30.00', '31.00'),
    ('c1000002-0000-4000-8000-000000000001', 'ARTWORK', 'AR-9800', 'AR-9800',
     'UPDATE', 'depth_cm', null, '5.00');

  select count(*) into v_n from public.change_log
   where change_id = 'c1000002-0000-4000-8000-000000000001';
  if v_n <> 2 then
    raise exception 'FAIL: dos campos de la misma acción deberían ser dos filas, son %', v_n;
  end if;
  raise notice 'OK: una acción con dos campos son dos filas con el mismo identificador de operación (RF-1502)';
end $$;

alter table public.change_log enable trigger change_log_insert_guard;


-- ── 10. El requisito negativo (RF-1505) ──────────────────────
--
-- El registro NO es reversible. Este bloque es deliberadamente tosco y su valor
-- no es la precisión: es ponerse en rojo el día que alguien escriba el
-- «deshacer», y obligar a que borrar este test aparezca en un diff que alguien
-- lee. Las tres funciones del propio registro van excluidas por nombre.
do $$
declare v_sospechosas text[];
begin
  select coalesce(array_agg(p.proname order by p.proname), '{}')
    into v_sospechosas
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname not in ('tg_change_log', 'tg_change_log_append_only', 'tg_change_log_insert_guard')
     and p.prosrc like '%change_log%'
     and (p.prosrc like '%update public.artworks%' or p.prosrc like '%update public.images%'
       or p.prosrc like '%update artworks%'        or p.prosrc like '%update images%');

  if array_length(v_sospechosas, 1) > 0 then
    raise exception
      'FAIL: hay funciones que leen el registro de cambios y escriben en el catálogo: %. El registro es informativo y no reversible (RF-1505)',
      array_to_string(v_sospechosas, ', ');
  end if;
  raise notice 'OK: ninguna función devuelve un valor del registro al catálogo (RF-1505)';
end $$;

-- Y ninguna vista sobre el registro. Una vista es propiedad de quien la crea y
-- se salta la RLS salvo que lleve `security_invoker = true`: sería una segunda
-- puerta de lectura, con otras reglas, para ahorrarse un join.
do $$
declare v_vistas text[];
begin
  select coalesce(array_agg(c.relname order by c.relname), '{}')
    into v_vistas
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relkind in ('v', 'm')
     and pg_get_viewdef(c.oid) like '%change_log%'
     and coalesce(array_to_string(c.reloptions, ','), '') not like '%security_invoker=true%';

  if array_length(v_vistas, 1) > 0 then
    raise exception 'FAIL: hay vistas sobre el registro de cambios que se saltan su política: %',
      array_to_string(v_vistas, ', ');
  end if;
  raise notice 'OK: no hay ninguna vista que abra una segunda puerta al registro';
end $$;

-- El índice, uno y con la forma que sirve al historial de la ficha. Va con test
-- porque la decisión que documenta —tres índices retirados con la cuenta
-- delante— se pierde si alguien los devuelve sin leerla.
do $$
declare v_indices text[];
begin
  select coalesce(array_agg(indexname order by indexname), '{}')
    into v_indices
    from pg_indexes
   where schemaname = 'public' and tablename = 'change_log';
  if v_indices <> array['change_log_by_artwork_idx', 'change_log_pkey'] then
    raise exception 'FAIL: los índices del registro de cambios deberían ser la clave y el del historial de la ficha, son [%]',
      array_to_string(v_indices, ', ');
  end if;
  raise notice 'OK: un índice y la clave primaria; el historial de la ficha es la única consulta con volumen';
end $$;

rollback;
