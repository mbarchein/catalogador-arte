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

  -- The anonymous role, not one privilege. Revoking from `anon` does not undo what PUBLIC
  -- grants, so what is looked at is the result and not the statement.
  select coalesce(array_agg(distinct privilege_type order by privilege_type), '{}')
    into v_privilegios
    from information_schema.table_privileges
   where table_schema = 'public' and table_name = 'change_log' and grantee = 'anon';
  if array_length(v_privilegios, 1) > 0 then
    raise exception 'FAIL: el rol anónimo tiene privilegios sobre el registro de cambios: [%]',
      array_to_string(v_privilegios, ', ');
  end if;

  -- THE ASSERTION THAT CATCHES THIS TABLE'S MOST EXPENSIVE FAILURE: `service_role` also
  -- with nothing. The platform's default ACLs grant it INSERT, UPDATE,
  -- DELETE and TRUNCATE over every new table, and besides it carries `bypassrls`: without the
  -- `revoke`, anybody with the service key could insert FALSE rows
  -- into the audit, which is worse than having no audit.
  select coalesce(array_agg(distinct privilege_type order by privilege_type), '{}')
    into v_privilegios
    from information_schema.table_privileges
   where table_schema = 'public' and table_name = 'change_log' and grantee = 'service_role';
  if array_length(v_privilegios, 1) > 0 then
    raise exception 'FAIL: la clave de servicio tiene privilegios sobre el registro de cambios: [%] (RF-1504)',
      array_to_string(v_privilegios, ', ');
  end if;

  -- And the authenticated one, EXACTLY one. The complete set is compared and it is not
  -- asked «does it not have delete?», so that a future `grant` of anything
  -- turns this red.
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

-- The identity sequence, through the back door. Whoever could `setval` it
-- backwards would leave the whole catalogue unable to save: every change
-- to an artwork would clash against the log's primary key. The platform
-- grants rwU over every new sequence to all three roles, so this is not
-- theoretical.
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

-- A single policy, and a read one. THE ABSENCE OF THE OTHER THREE IS THE
-- DENIAL (RF-111): this is what has to be asserted, and not that the SELECT one
-- exists.
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

-- And it does NOT carry `force row level security`. This assertion looks backwards and it is
-- not: that line is precisely the one somebody adds in a security review
-- believing it hardens things. Here it would void the owner's exemption, would abort the
-- writer trigger's insert and with it THE USER'S SAVE. It would break the
-- catalogue, not the log.
do $$
begin
  if (select relforcerowsecurity from pg_class where oid = 'public.change_log'::regclass) then
    raise exception 'FAIL: change_log tiene «force row level security»: el escritor del registro no podrá insertar y se romperá el guardado de cualquier obra';
  end if;
  raise notice 'OK: change_log no fuerza la RLS sobre su propietario, que es lo que permite que el trigger escriba';
end $$;

-- Both enums are readable by the application: without USAGE, a filter by
-- operation from PostgREST would fail with «permission denied for type».
do $$
begin
  if not has_type_privilege('authenticated', 'public.audited_entity', 'usage')
     or not has_type_privilege('authenticated', 'public.change_operation', 'usage') then
    raise exception 'FAIL: el rol autenticado no puede usar los enumerados del registro de cambios';
  end if;
  raise notice 'OK: los dos enumerados del registro son usables por la aplicación';
end $$;


-- ── 2. The anonymous one, really attacking (RF-101) ──────────
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


-- ── 3. The Cataloguer does not write in their own audit ──────
--
-- RF-1504. It is the file's central assertion: whoever catalogues is the audited, and the
-- audited does not touch the log. The TYPE of error is asserted —lack of
-- privilege— and not only that it fails: an insert blocked by privilege and one
-- blocked by policy are different failures, and here the privilege one has to happen,
-- which is the one that also stops a client bypassing the interface.

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

-- And the delete, which is the attack that really matters: if this only affected
-- zero rows instead of failing, it would be the behaviour of an absent policy
-- over a GRANTED privilege, and the day somebody wrote the policy the
-- whole audit could be deleted.
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


-- ── 4. The Reader, the same three attempts ───────────────────
--
-- RF-106, RF-1504. It is not taken for granted that «if the Cataloguer cannot, the Reader
-- cannot either»: the privileges belong to the database role and both roles
-- share `authenticated`, so what is tested is the same padlock from
-- the other session, which is what the role matrix asks for.
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


-- ── 4 bis. The Superuser, who is the one who can do most ─────
--
-- RF-109, RF-1504. Added on auditing this file: the third role was missing, and
-- it was the one that could be assumed with least justification. The other two blocks justify themselves
-- by saying that «the privileges belong to the database role and both roles
-- share `authenticated`»; that same argument holds for the Superuser, but
-- it is an argument, and what this file promises in its heading is to attack with
-- each role's session.
--
-- And there is a reason for it to be the MOST important cell of the three: the
-- Superuser is RF-1105's role, the one that administers users from Supabase's
-- panel. Their application session must not be able to touch the log, because what
-- change_log.sql decides is that the boundary be at «coming in through the panel with
-- a deliberate statement» and not at «having the application's highest role».
-- If this cell fell, that boundary would move without anybody having decided it.
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


-- ── 5. The audited editing their own audit from inside ───────
--
-- RF-1504, and it has to be written even though it looks paranoid, because it is the scenario
-- the RLS does NOT cover: the policies do not apply to the table's owner.
-- Here the session is the administrative one —the same one a migration is applied with
-- or the panel's SQL editor is opened with— and the only thing that stops it are the
-- two triggers. All four verbs and the MESSAGE are checked, because the message
-- is what whoever stumbles on this in two years' time is going to read.

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

-- The truncate is the way a whole table is lost in one go, and it is not
-- covered by any policy: the RLS has nothing to say about TRUNCATE.
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


-- ── 6. And `postgres`, which keeps its privileges on purpose ──
--
-- RF-1504. It is Supabase's panel role and the one that restores the dump, it carries
-- `bypassrls` and NOTHING is revoked from it: taking it away would break the base's
-- restoration without closing anything, because it bypasses the RLS anyway. So what has to be
-- demonstrated is that the OTHER padlock stops it — which is exactly the argument
-- of the two bolts in series, seen from the role for which only one works.
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


-- ── 7. The test rows, and why they are hard to put in ────────
--
-- That the padlock has to be disabled in order to write a fixture IS the
-- result that was wanted. It is disabled, the four rows are written, and it is
-- enabled again before going on.

alter table public.change_log disable trigger change_log_insert_guard;

insert into public.change_log
  (change_id, entity, row_key, catalog_id, operation, column_name, old_value, new_value, changed_by)
values
  ('c1000001-0000-4000-8000-000000000001', 'ARTWORK', 'AR-9800', 'AR-9800',
   'CREATE', null, null, null, '00000000-0000-0000-0000-0000000000e1'),
  ('c1000001-0000-4000-8000-000000000002', 'ARTWORK', 'AR-9800', 'AR-9800',
   'UPDATE', 'height_cm', '54.00', '45.00', '00000000-0000-0000-0000-0000000000e1'),
  -- The history of an artwork that is in the wastebasket: the Reader must not
  -- even find out that it exists (RF-609).
  ('c1000001-0000-4000-8000-000000000003', 'ARTWORK', 'AR-9801', 'AR-9801',
   'DEACTIVATE', 'active', 'true', 'false', '00000000-0000-0000-0000-0000000000e1'),
  -- That of an active photograph and that of a withdrawn one, both of an artwork that IS
  -- visible: it is the hole that would close on its own if the policy asked about the
  -- audited row and not about the artwork.
  ('c1000001-0000-4000-8000-000000000004', 'IMAGE', 'AR-9800_v1', 'AR-9800',
   'CREATE', null, null, null, '00000000-0000-0000-0000-0000000000e1'),
  ('c1000001-0000-4000-8000-000000000005', 'IMAGE', 'AR-9800_v2', 'AR-9800',
   'DEACTIVATE', 'active', 'true', 'false', '00000000-0000-0000-0000-0000000000e1'),
  -- With no session: a null `changed_by` is a migration's truth, not a gap.
  ('c1000001-0000-4000-8000-000000000006', 'ARTWORK', 'AR-9800', 'AR-9800',
   'UPDATE', 'technique', null, 'Hierro soldado', null);

alter table public.change_log enable trigger change_log_insert_guard;

-- And with the padlock given back, it closes again. Without this assertion, a test file
-- that left the trigger off would pass all the same and would leave the table open for
-- the next one to look.
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


-- ── 8. Who sees which history (RF-1506, RF-609) ──────────────
--
-- The rule is not a copy of the record's visibility: it IS the record's
-- visibility, because the policy's subquery is evaluated UNDER THE POLICY OF
-- ITS OWN TABLE. It is tested with all four combinations, and the one that really
-- matters is the fourth — the withdrawn photograph of an ACTIVE artwork, which is where
-- a policy written «by artwork» would have leaked.

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

  -- The active artwork's, yes: three lines (the creation, the height and the technique).
  select count(*) into v_n from public.change_log
   where change_id::text like 'c1000001-%' and entity = 'ARTWORK' and row_key = 'AR-9800';
  if v_n <> 3 then
    raise exception 'FAIL: el Lector debería ver las tres líneas de la obra activa, ve % (RF-105)', v_n;
  end if;

  -- The withdrawn artwork's, nothing: neither the line, nor the fact that it was withdrawn.
  select count(*) into v_n from public.change_log
   where change_id::text like 'c1000001-%' and row_key = 'AR-9801';
  if v_n <> 0 then
    raise exception 'FAIL: el Lector ve % línea(s) del historial de una obra retirada (RF-609)', v_n;
  end if;

  -- The active photograph, yes.
  select count(*) into v_n from public.change_log
   where change_id::text like 'c1000001-%' and row_key = 'AR-9800_v1';
  if v_n <> 1 then
    raise exception 'FAIL: el Lector no ve el historial de una fotografía activa (RF-105)';
  end if;

  -- And the WITHDRAWN photograph of an artwork it does see: zero. This is the assertion that
  -- distinguishes a policy written over the audited row from one written over
  -- the artwork.
  select count(*) into v_n from public.change_log
   where change_id::text like 'c1000001-%' and row_key = 'AR-9800_v2';
  if v_n <> 0 then
    raise exception 'FAIL: el Lector ve el historial de una fotografía retirada de una obra activa (RF-609)';
  end if;

  reset role;
  raise notice 'OK: el Lector ve el historial de lo que puede ver y de nada más (RF-105, RF-609, RF-1506)';
end $$;

reset role;

-- An authenticated session WITH NO PROFILE sees nothing. It is the case of a valid JWT
-- issued for somebody who has not been given a role yet (RF-104): `can_read()`
-- is false and the policy does not even get to look at the entity.
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

-- The stored value is kept AS IS, and translating it is the interface's job
-- (RF-1502). It is asserted over the line the Reader does see: `'54.00'` and not
-- «54 cm», and `old_value`'s null is still null and not the string «null».
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


-- ── 9. The constraints, each one by its name ─────────────────
--
-- What PostgreSQL says on rejecting is the constraint's NAME, so
-- the name is checked and not only that it fails: a row rejected by the wrong
-- constraint is a constraint that is not doing what it is believed to do.

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

-- The equivalence, in BOTH directions, because a constraint written with `=`
-- between two predicates can be broken from either side.
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

-- Nobody chooses the line number: the identity is `generated always`, and that is
-- what prevents slipping a row «between» two true ones.
do $$
begin
  insert into public.change_log (id, change_id, entity, row_key, catalog_id, operation)
  values (1, gen_random_uuid(), 'ARTWORK', 'AR-9800', 'AR-9800', 'CREATE');
  raise exception 'FAIL: se ha podido elegir el número de línea del registro';
exception
  when generated_always then
    raise notice 'OK: el número de línea lo pone la base y no se puede elegir';
end $$;

-- And what DOES have to go in: several rows with the same `change_id` and different
-- fields are a single user action with several fields changed, which is
-- this log's normal shape (RF-1502). The invariant of «one row per
-- field and operation» is guaranteed by the writer's key walk and is
-- asserted in its own test, not with a unique index.
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


-- ── 10. The negative requirement (RF-1505) ───────────────────
--
-- The log is NOT reversible. This block is deliberately crude and its value
-- is not precision: it is going red the day somebody writes the
-- «undo», and forcing the deletion of this test to appear in a diff somebody
-- reads. The log's own three functions are excluded by name.
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

-- And no view over the log. A view is owned by whoever creates it and
-- bypasses the RLS unless it carries `security_invoker = true`: it would be a second
-- read door, with other rules, just to save a join.
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

-- The index, one and with the shape that serves the record's history. It comes with a test
-- because the decision it documents —three indexes retired with the count
-- in front— gets lost if somebody puts them back without reading it.
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
