-- RF-508: people and institutions, a single table with a surrogate key.
-- RF-804, RF-801, RF-902: the common traceability and the wastebasket, stamped by the base.
-- RF-901, RF-111, RF-113: nothing is deleted, and the table is born closed.
--
-- What is checked is what the client must not check again: that a
-- blank name or one with spaces around it does not go in, that two writings of the
-- same museum are the same record, that the two enums admit no free text,
-- that the withdrawal stamps itself and keeps its trace on restoring, and that the traceability
-- function does not touch a single column that is not its own — which is the risk
-- particular to reading the row as jsonb and returning it.
\set ON_ERROR_STOP on
begin;

-- Fixtures: one cataloguer and one reader. The profiles are created by the
-- auth.users trigger.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000c1', 'cat-partes@test.local'),
  ('00000000-0000-0000-0000-0000000000c2', 'lec-partes@test.local');
update public.profiles set role = 'CATALOGER' where id = '00000000-0000-0000-0000-0000000000c1';
update public.profiles set role = 'READER'    where id = '00000000-0000-0000-0000-0000000000c2';

-- ── 1. A minimal record goes in ──────────────────────────────
-- The name and the type, and nothing else: what is known the first time a
-- name appears in a 1985 catalogue. Everything else is born empty and explicit.
do $$
declare
  v_id uuid;
  v_fila public.parties%rowtype;
begin
  insert into public.parties (party_type, name)
  values ('INSTITUTION', 'Museo de Bellas Artes de Badajoz')
  returning id into v_id;

  select * into v_fila from public.parties where id = v_id;

  if v_fila.locality <> '' or v_fila.country <> '' or v_fila.contact <> ''
     or v_fila.note <> '' then
    raise exception 'FAIL: los campos opcionales no nacen vacíos';
  end if;
  if v_fila.contact_status <> 'NOT_CONTACTED' then
    raise exception 'FAIL: el estado de contacto no nace en «Sin contactar» (%)',
      v_fila.contact_status;
  end if;
  if not v_fila.active then
    raise exception 'FAIL: una ficha nueva no nace activa';
  end if;
  raise notice 'OK: una ficha mínima entra y sus opcionales nacen vacíos';
end $$;

-- ── 2. The type is compulsory and closed ─────────────────────
-- With no «Sin revisar» on purpose (RF-508, with RF-203's argument): on this
-- value depends how the provenance line is worded.
do $$
begin
  begin
    insert into public.parties (name) values ('Sin tipo');
    raise exception 'FAIL: ha entrado una parte sin tipo';
  exception when not_null_violation then
    raise notice 'OK: el tipo de parte es obligatorio';
  end;

  begin
    insert into public.parties (party_type, name) values ('UNREVIEWED', 'Pendiente de decidir');
    raise exception 'FAIL: el tipo de parte ha admitido «Sin revisar»';
  exception when invalid_text_representation then
    raise notice 'OK: el tipo de parte no ofrece «Sin revisar»';
  end;

  begin
    insert into public.parties (party_type, name) values ('GALERIA', 'Galería inventada');
    raise exception 'FAIL: el tipo de parte ha admitido texto libre';
  exception when invalid_text_representation then
    raise notice 'OK: el tipo de parte es un enumerado cerrado';
  end;

  -- And the two values that do exist go in.
  insert into public.parties (party_type, name) values ('PERSON', 'Almudena Hormeño');
  raise notice 'OK: persona e institución son los dos valores del enumerado';
end $$;

-- ── 3. The contact state does not admit free text either ─────
do $$
declare v_id uuid;
begin
  select id into v_id from public.parties where name = 'Almudena Hormeño';

  update public.parties set contact_status = 'VISITED' where id = v_id;
  if (select contact_status from public.parties where id = v_id) <> 'VISITED' then
    raise exception 'FAIL: el estado de contacto no se ha guardado';
  end if;

  begin
    update public.parties set contact_status = 'ESCRIBIENDO' where id = v_id;
    raise exception 'FAIL: el estado de contacto ha admitido texto libre';
  exception when invalid_text_representation then
    raise notice 'OK: el estado de contacto es un enumerado cerrado';
  end;
end $$;

-- ── 4. A blank name identifies nobody ────────────────────────
-- And one with spaces around it would break the duplicate comparison without it being
-- visible on screen, which is the worst kind of bad datum.
do $$
begin
  begin
    insert into public.parties (party_type, name) values ('PERSON', '   ');
    raise exception 'FAIL: ha entrado una parte sin nombre';
  exception when check_violation then
    raise notice 'OK: un nombre en blanco se rechaza';
  end;

  begin
    insert into public.parties (party_type, name) values ('PERSON', ' Colección Pérez ');
    raise exception 'FAIL: ha entrado un nombre con espacios alrededor';
  exception when check_violation then
    raise notice 'OK: un nombre sin recortar se rechaza';
  end;
end $$;

-- ── 5. One name, one record ──────────────────────────────────
-- The reason is the provenance: two rows of the same museum written with and without
-- an accent split an artwork's chain, and that is not visible while writing it.
do $$
begin
  begin
    insert into public.parties (party_type, name)
    values ('INSTITUTION', 'museo de BELLAS artes de badajoz');
    raise exception 'FAIL: han entrado dos fichas del mismo museo';
  exception when unique_violation then
    raise notice 'OK: dos escrituras del mismo nombre son la misma ficha';
  end;

  -- But the ñ is a letter and not an accent: they are two different surnames and both
  -- records go in. It is `place_key`'s same rule, and here it is checked that the
  -- reuse has not changed it.
  insert into public.parties (party_type, name) values ('PERSON', 'Muñoz');
  insert into public.parties (party_type, name) values ('PERSON', 'Munoz');
  raise notice 'OK: la ñ distingue dos nombres, como en el árbol de lugares';
end $$;

-- ── 6. The authorship trace is stamped by the base ───────────
-- RF-804 and RF-803: who and when come from the session, not from what the
-- client sends.
--
-- The date is checked by sending a false one and seeing that the trigger overrides it, and not
-- by comparing two instants: inside a transaction `now()` does not advance, so
-- «after is greater than before» would be an assertion that can never fail.
do $$
declare
  v_id uuid;
  v_creado_por uuid; v_actualizado_por uuid;
  v_cuando timestamptz;
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}';

  insert into public.parties (party_type, name, created_by, updated_by)
  -- Both authorship fields are deliberately sent filled with another user:
  -- the trigger has to override them.
  values ('INSTITUTION', 'MACVA', '00000000-0000-0000-0000-0000000000c2',
          '00000000-0000-0000-0000-0000000000c2')
  returning id, created_by, updated_by
       into v_id, v_creado_por, v_actualizado_por;

  if v_creado_por is distinct from '00000000-0000-0000-0000-0000000000c1'::uuid
     or v_actualizado_por is distinct from '00000000-0000-0000-0000-0000000000c1'::uuid then
    raise exception 'FAIL: la autoría no la ha sellado la sesión (% / %)',
      v_creado_por, v_actualizado_por;
  end if;

  update public.parties
     set note = 'Depósito de 2011',
         updated_at = timestamptz '2000-01-01 00:00:00+00',
         updated_by = '00000000-0000-0000-0000-0000000000c2'
   where id = v_id;

  select updated_at, updated_by into v_cuando, v_actualizado_por
    from public.parties where id = v_id;

  if v_cuando <> now() then
    raise exception 'FAIL: la fecha de actualización la ha puesto el cliente (%)', v_cuando;
  end if;
  if v_actualizado_por is distinct from '00000000-0000-0000-0000-0000000000c1'::uuid then
    raise exception 'FAIL: «actualizado por» la ha puesto el cliente (%)', v_actualizado_por;
  end if;
  raise notice 'OK: la autoría y la fecha de actualización las sella la base (RF-801, RF-803, RF-804)';
end $$;

-- ── 7. The wastebasket: withdrawal, trace and restoration ────
-- RF-901 and RF-902: the row is still there, the withdrawal stamps itself, and restoring does NOT erase
-- the trace of the previous withdrawal — the last event of each class is kept.
do $$
declare
  v_id uuid;
  v_baja timestamptz; v_quien uuid;
  v_restaurada timestamptz; v_quien_restaura uuid;
begin
  select id into v_id from public.parties where name = 'MACVA';

  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}';
  update public.parties set active = false where id = v_id;

  select deactivated_at, deactivated_by into v_baja, v_quien
    from public.parties where id = v_id;
  if v_baja is null or v_quien is distinct from '00000000-0000-0000-0000-0000000000c1'::uuid then
    raise exception 'FAIL: la baja no ha quedado sellada (% / %)', v_baja, v_quien;
  end if;
  if not exists (select 1 from public.parties where id = v_id) then
    raise exception 'FAIL: la fila ha desaparecido al darla de baja';
  end if;

  update public.parties set active = true where id = v_id;
  select deactivated_at, restored_at, restored_by
    into v_baja, v_restaurada, v_quien_restaura
    from public.parties where id = v_id;

  if v_restaurada is null
     or v_quien_restaura is distinct from '00000000-0000-0000-0000-0000000000c1'::uuid then
    raise exception 'FAIL: la restauración no ha quedado sellada (% / %)',
      v_restaurada, v_quien_restaura;
  end if;
  if v_baja is null then
    raise exception 'FAIL: restaurar ha borrado la traza de la baja anterior (RF-902)';
  end if;
  raise notice 'OK: la baja y la restauración se sellan solas y conservan su traza';
end $$;

-- ── 8. The generic traceability touches nothing that is not its own ─
--
-- It is `tg_row_audit`'s particular risk, which reads the row as jsonb and
-- returns it: if the patch carried the whole row, any column would go through
-- a round-trip conversion and one day one of them would come back different. It is
-- checked with the row full and changing a single field.
--
-- The fixture's name is invented ON PURPOSE and is not that of a real collection:
-- `parties`' uniqueness is global and the provenance's move
-- (20260804100000) already created the records of the collections and the museums that
-- were hidden in the place tree. A fixture named like a real
-- datum clashes against the index as soon as the base carries the dump, and
-- leaves red a test that verifies none of that.
do $$
declare v_id uuid; v_fila public.parties%rowtype;
begin
  insert into public.parties (party_type, name, locality, country, contact,
                              contact_status, note)
  values ('PERSON', 'Colección particular familia Peñalba de prueba', 'Villafranca de los Barros',
          'España', 'almudena@ejemplo.test · 924 00 00 00', 'INFO_RECEIVED',
          'Dato facilitado por la familia, sin documentar [?]')
  returning id into v_id;

  update public.parties set contact_status = 'VERIFIED' where id = v_id;

  select * into v_fila from public.parties where id = v_id;
  if v_fila.name <> 'Colección particular familia Peñalba de prueba'
     or v_fila.locality <> 'Villafranca de los Barros'
     or v_fila.country <> 'España'
     or v_fila.contact <> 'almudena@ejemplo.test · 924 00 00 00'
     or v_fila.note <> 'Dato facilitado por la familia, sin documentar [?]'
     or v_fila.party_type <> 'PERSON' then
    raise exception 'FAIL: el sello de trazabilidad ha alterado otra columna (%)', v_fila;
  end if;
  if v_fila.contact_status <> 'VERIFIED' then
    raise exception 'FAIL: el cambio que se pedía no ha cuajado';
  end if;
  raise notice 'OK: el sello genérico solo escribe sus columnas, y los acentos vuelven intactos';
end $$;

-- ── 9. Nobody really deletes ─────────────────────────────────
do $$
begin
  if exists (select 1 from pg_policies
              where schemaname = 'public' and tablename = 'parties'
                and cmd in ('DELETE', 'ALL')) then
    raise exception 'FAIL: hay una política que permite DELETE sobre las partes';
  end if;
  if has_table_privilege('authenticated', 'public.parties', 'delete')
     or has_table_privilege('anon', 'public.parties', 'delete') then
    raise exception 'FAIL: alguien tiene privilegio de DELETE sobre las partes';
  end if;
  raise notice 'OK: retirar es un update; borrar no está concedido a nadie (RF-901)';
end $$;

-- ── 10. The table is born closed ─────────────────────────────
-- RF-111 and RF-113: RLS enabled and the anonymous role with no privilege at all, which is
-- what prevents the policy from being the only barrier. It is the assertion that matters
-- while the policies do not exist, and it goes on mattering afterwards: `contacto` is
-- a third party's personal datum.
do $$
begin
  if not (select relrowsecurity from pg_class where oid = 'public.parties'::regclass) then
    raise exception 'FAIL: la tabla de partes no tiene RLS activado';
  end if;
  raise notice 'OK: la tabla de partes tiene RLS activado';
end $$;

do $$
begin
  set local role anon;
  perform 1 from public.parties limit 1;
  raise exception 'FAIL: el rol anónimo ha podido consultar las partes';
exception
  when insufficient_privilege then
    raise notice 'OK: el rol anónimo no llega a las partes';
end $$;

reset role;

rollback;
