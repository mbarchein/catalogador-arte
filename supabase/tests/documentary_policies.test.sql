-- The perimeter of the documentary catalogue raisonné's fifteen tables.
--
-- RF-101, RF-103, RF-105, RF-106, RF-109, RF-111, RF-113, RF-901, RF-906.
--
-- The six previous groups created fifteen tables with RLS enabled and zero
-- policies. This file checks the migration that opens them, and it does so in the
-- two ways that are needed:
--
--   1. MEASURING the system catalogue —RLS enabled, three policies per
--      table, none of them DELETE, and `anon`'s and `authenticated`'s privileges
--      read from `column_privileges`, which is where a `grant update
--      (column)` that `role_table_grants` does not show is visible—.
--   2. ATTACKING the base authenticated for real as a user of each role.
--      Checking that the policy exists verifies nothing: what matters is what
--      the base answers when the request comes from whom it comes.
--
-- Both are needed and neither replaces the other: the first catches the table
-- that forgot an operation, the second catches the policy that is
-- written backwards.
\set ON_ERROR_STOP on
begin;

-- ── Fixtures ─────────────────────────────────────────────────
--
-- A real cataloguer and a real reader, with their `profiles` row created by the
-- `auth.users` trigger, and one ACTIVE row and one WITHDRAWN row in each of the
-- fifteen tables. The identifiers are set by hand so they can be asked about
-- from inside each role's session.

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000e1', 'cat-perimetro@test.local'),
  ('00000000-0000-0000-0000-0000000000e2', 'lec-perimetro@test.local');
update public.profiles set role = 'CATALOGER' where id = '00000000-0000-0000-0000-0000000000e1';
update public.profiles set role = 'READER'    where id = '00000000-0000-0000-0000-0000000000e2';

insert into public.artworks (catalog_id, artist, title, attributed_title) values
  ('AR-9600', 'ROTILI', 'La obra del perímetro', 'UNCONFIRMED'),
  ('AR-9601', 'ROTILI', 'La otra obra del perímetro', 'UNCONFIRMED'),
  ('AR-9602', 'ROTILI', 'La tercera obra del perímetro', 'UNCONFIRMED');

-- 1. parties. `contact` carries a third party's datum on purpose: RF-105 decides that
-- the Reader sees it, and that decision has to be exercised, not assumed.
insert into public.parties (id, party_type, name, contact) values
  ('9e000001-0000-4000-8000-000000000001', 'INSTITUTION',
   'Museo del Perímetro de prueba', 'contacto@perimetro.test'),
  ('9e000001-0000-4000-8000-000000000002', 'PERSON',
   'Coleccionista retirado de prueba', 'privado@perimetro.test');
update public.parties set active = false
 where id = '9e000001-0000-4000-8000-000000000002';

-- 2. provenance_events. Two active links, which is the minimum for reordering.
insert into public.provenance_events (id, catalog_id, party_note) values
  ('9e000002-0000-4000-8000-000000000001', 'AR-9600', 'Colección desconocida de prueba'),
  ('9e000002-0000-4000-8000-000000000003', 'AR-9600', 'Segunda mano de prueba'),
  ('9e000002-0000-4000-8000-000000000002', 'AR-9600', 'Eslabón retirado de prueba');
update public.provenance_events set active = false
 where id = '9e000002-0000-4000-8000-000000000002';

-- 3. publication_types
insert into public.publication_types (id, name) values
  ('9e000003-0000-4000-8000-000000000001', 'Tipo de publicación del perímetro'),
  ('9e000003-0000-4000-8000-000000000002', 'Tipo de publicación retirado');
update public.publication_types set active = false
 where id = '9e000003-0000-4000-8000-000000000002';

-- 4. bibliography
insert into public.bibliography (id, title) values
  ('9e000004-0000-4000-8000-000000000001', 'Referencia activa del perímetro'),
  ('9e000004-0000-4000-8000-000000000002', 'Referencia retirada del perímetro');
update public.bibliography set active = false
 where id = '9e000004-0000-4000-8000-000000000002';

-- 5. artwork_bibliography
insert into public.artwork_bibliography (id, catalog_id, bibliography_id, pages) values
  ('9e000005-0000-4000-8000-000000000001', 'AR-9600',
   '9e000004-0000-4000-8000-000000000001', 'pp. 33-35'),
  ('9e000005-0000-4000-8000-000000000002', 'AR-9601',
   '9e000004-0000-4000-8000-000000000001', 'p. 12');
update public.artwork_bibliography set active = false
 where id = '9e000005-0000-4000-8000-000000000002';

-- 6. exhibition_venues
insert into public.exhibition_venues (id, name, locality) values
  ('9e000006-0000-4000-8000-000000000001', 'Sala del Perímetro', 'Badajoz'),
  ('9e000006-0000-4000-8000-000000000002', 'Sala del Perímetro cerrada', 'Badajoz');
update public.exhibition_venues set active = false
 where id = '9e000006-0000-4000-8000-000000000002';

-- 7. exhibitions
insert into public.exhibitions (id, title, year) values
  ('9e000007-0000-4000-8000-000000000001', 'Muestra activa del perímetro', 1985),
  ('9e000007-0000-4000-8000-000000000002', 'Muestra retirada del perímetro', 1986);
update public.exhibitions set active = false
 where id = '9e000007-0000-4000-8000-000000000002';

-- 8. artwork_exhibitions
insert into public.artwork_exhibitions (id, catalog_id, exhibition_id, catalogue_number) values
  ('9e000008-0000-4000-8000-000000000001', 'AR-9600',
   '9e000007-0000-4000-8000-000000000001', 'cat. 12 bis'),
  ('9e000008-0000-4000-8000-000000000002', 'AR-9601',
   '9e000007-0000-4000-8000-000000000001', 'cat. 13');
update public.artwork_exhibitions set active = false
 where id = '9e000008-0000-4000-8000-000000000002';

-- 9. document_types
insert into public.document_types (id, name) values
  ('9e000009-0000-4000-8000-000000000001', 'Tipo de documento del perímetro'),
  ('9e000009-0000-4000-8000-000000000002', 'Tipo de documento retirado');
update public.document_types set active = false
 where id = '9e000009-0000-4000-8000-000000000002';

-- 10. archive_series
insert into public.archive_series (id, name) values
  ('9e00000a-0000-4000-8000-000000000001', 'Fondo del perímetro'),
  ('9e00000a-0000-4000-8000-000000000002', 'Fondo retirado del perímetro');
update public.archive_series set active = false
 where id = '9e00000a-0000-4000-8000-000000000002';

-- 11. archive_documents
insert into public.archive_documents (id, title) values
  ('9e00000b-0000-4000-8000-000000000001', 'Recorte activo del perímetro'),
  ('9e00000b-0000-4000-8000-000000000002', 'Recorte retirado del perímetro');
update public.archive_documents set active = false
 where id = '9e00000b-0000-4000-8000-000000000002';

-- 12. artwork_documents
insert into public.artwork_documents (id, catalog_id, document_id) values
  ('9e00000c-0000-4000-8000-000000000001', 'AR-9600', '9e00000b-0000-4000-8000-000000000001'),
  ('9e00000c-0000-4000-8000-000000000002', 'AR-9601', '9e00000b-0000-4000-8000-000000000001');
update public.artwork_documents set active = false
 where id = '9e00000c-0000-4000-8000-000000000002';

-- 13. exhibition_documents
insert into public.exhibition_documents (id, exhibition_id, document_id) values
  ('9e00000d-0000-4000-8000-000000000001', '9e000007-0000-4000-8000-000000000001',
   '9e00000b-0000-4000-8000-000000000001'),
  ('9e00000d-0000-4000-8000-000000000002', '9e000007-0000-4000-8000-000000000002',
   '9e00000b-0000-4000-8000-000000000001');
update public.exhibition_documents set active = false
 where id = '9e00000d-0000-4000-8000-000000000002';

-- 14. artwork_relationship_types. Three: the active one, the withdrawn one and a third
-- so the attack below does not clash against the triple's uniqueness.
insert into public.artwork_relationship_types (id, name, inverse_name, is_symmetric) values
  ('9e00000e-0000-4000-8000-000000000001', 'Perímetro simétrico de', '', true),
  ('9e00000e-0000-4000-8000-000000000002', 'Perímetro retirado de', '', true),
  ('9e00000e-0000-4000-8000-000000000003', 'Perímetro tercero de', '', true);
update public.artwork_relationship_types set active = false
 where id = '9e00000e-0000-4000-8000-000000000002';

-- 15. artwork_relationships
insert into public.artwork_relationships (id, from_catalog_id, to_catalog_id, relationship_type_id) values
  ('9e00000f-0000-4000-8000-000000000001', 'AR-9600', 'AR-9601',
   '9e00000e-0000-4000-8000-000000000001'),
  ('9e00000f-0000-4000-8000-000000000002', 'AR-9600', 'AR-9601',
   '9e00000e-0000-4000-8000-000000000002');
update public.artwork_relationships set active = false
 where id = '9e00000f-0000-4000-8000-000000000002';

-- The working table the fifteen are walked with. It is here and not
-- spread over fifteen hand-written blocks because what is checked is that THERE ARE NO
-- EXCEPTIONS: a table slipping through with no policy is exactly the failure
-- this file has to catch, and a list written fifteen times forgets one.
create temporary table perimeter_spec (
  table_name  text primary key,
  id_active   uuid not null,
  id_trash    uuid not null,
  -- A legal and minimal creation in that table, which each role attacks with.
  insert_sql  text not null
) on commit drop;

insert into perimeter_spec values
 ('parties', '9e000001-0000-4000-8000-000000000001', '9e000001-0000-4000-8000-000000000002',
  $q$insert into public.parties (party_type, name) values ('PERSON', 'Alta del ataque al perímetro')$q$),
 ('provenance_events', '9e000002-0000-4000-8000-000000000001', '9e000002-0000-4000-8000-000000000002',
  $q$insert into public.provenance_events (catalog_id, party_note) values ('AR-9602', 'Eslabón del ataque')$q$),
 ('publication_types', '9e000003-0000-4000-8000-000000000001', '9e000003-0000-4000-8000-000000000002',
  $q$insert into public.publication_types (name) values ('Tipo de publicación del ataque')$q$),
 ('bibliography', '9e000004-0000-4000-8000-000000000001', '9e000004-0000-4000-8000-000000000002',
  $q$insert into public.bibliography (title) values ('Referencia del ataque')$q$),
 ('artwork_bibliography', '9e000005-0000-4000-8000-000000000001', '9e000005-0000-4000-8000-000000000002',
  $q$insert into public.artwork_bibliography (catalog_id, bibliography_id)
     values ('AR-9602', '9e000004-0000-4000-8000-000000000001')$q$),
 ('exhibition_venues', '9e000006-0000-4000-8000-000000000001', '9e000006-0000-4000-8000-000000000002',
  $q$insert into public.exhibition_venues (name, locality) values ('Sede del ataque', 'Mérida')$q$),
 ('exhibitions', '9e000007-0000-4000-8000-000000000001', '9e000007-0000-4000-8000-000000000002',
  $q$insert into public.exhibitions (title, year) values ('Muestra del ataque', 1987)$q$),
 ('artwork_exhibitions', '9e000008-0000-4000-8000-000000000001', '9e000008-0000-4000-8000-000000000002',
  $q$insert into public.artwork_exhibitions (catalog_id, exhibition_id)
     values ('AR-9602', '9e000007-0000-4000-8000-000000000001')$q$),
 ('document_types', '9e000009-0000-4000-8000-000000000001', '9e000009-0000-4000-8000-000000000002',
  $q$insert into public.document_types (name) values ('Tipo de documento del ataque')$q$),
 ('archive_series', '9e00000a-0000-4000-8000-000000000001', '9e00000a-0000-4000-8000-000000000002',
  $q$insert into public.archive_series (name) values ('Fondo del ataque')$q$),
 ('archive_documents', '9e00000b-0000-4000-8000-000000000001', '9e00000b-0000-4000-8000-000000000002',
  $q$insert into public.archive_documents (title) values ('Documento del ataque')$q$),
 ('artwork_documents', '9e00000c-0000-4000-8000-000000000001', '9e00000c-0000-4000-8000-000000000002',
  $q$insert into public.artwork_documents (catalog_id, document_id)
     values ('AR-9602', '9e00000b-0000-4000-8000-000000000001')$q$),
 ('exhibition_documents', '9e00000d-0000-4000-8000-000000000001', '9e00000d-0000-4000-8000-000000000002',
  $q$insert into public.exhibition_documents (exhibition_id, document_id)
     values ('9e000007-0000-4000-8000-000000000001', '9e00000b-0000-4000-8000-000000000002')$q$),
 ('artwork_relationship_types', '9e00000e-0000-4000-8000-000000000001', '9e00000e-0000-4000-8000-000000000002',
  $q$insert into public.artwork_relationship_types (name, inverse_name, is_symmetric)
     values ('Perímetro del ataque de', '', true)$q$),
 ('artwork_relationships', '9e00000f-0000-4000-8000-000000000001', '9e00000f-0000-4000-8000-000000000002',
  $q$insert into public.artwork_relationships (from_catalog_id, to_catalog_id, relationship_type_id)
     values ('AR-9600', 'AR-9602', '9e00000e-0000-4000-8000-000000000001')$q$);

-- That the list does not fall short the day somebody adds the sixteenth table:
-- it is checked against the system catalogue and not against a written number.
do $$
declare v_missing text[];
begin
  select coalesce(array_agg(c.relname order by c.relname), '{}')
    into v_missing
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relkind = 'r'
     and c.relname not in (select table_name from perimeter_spec)
     and c.relname not in (
       -- The ones from before this group, with their own perimeter and their own tests.
       'artworks', 'images', 'profiles', 'artwork_types', 'series', 'physical_places',
       -- The external links are not from this group and have no perimeter
       -- migration apart: they were born with their policies in their own migration
       -- (20260805100000), and their whole perimeter is in
       -- `external_links.test.sql`. They were the first to inherit the
       -- visibility of their anchor record; since 20260805130000 six of the fifteen
       -- here inherit it too, and that is checked in
       -- `documentary_visibility.test.sql`, not in this file: here the fixtures'
       -- anchors are all active on purpose, so what is
       -- measured is the perimeter and not the cascade.
       'external_links',
       -- The change log is not from this group either, and besides its perimeter
       -- is the opposite of the one this file checks: here it is asserted that the
       -- Cataloguer creates, edits and withdraws in all fifteen, and there what has to be
       -- asserted is that they do NOT write —they are the audited—. It was born with its policy and its
       -- two padlocks in its own migration (20260805120000) and its whole perimeter
       -- is in `change_log.test.sql`.
       'change_log',
       -- The funds are not from this group either, and their perimeter is the narrowest
       -- in the schema: here it is asserted that the Cataloguer creates, edits and withdraws in
       -- all fifteen, and there that they do NOT create and do NOT delete —only `select` and `update`,
       -- granted one by one—. It was born with its policies in its own migration
       -- (20260808120000) and its whole perimeter is in `artist_funds.test.sql`.
       'artist_funds',
       -- Migration control of the local stack: it does not exist in production.
       '_migraciones'
     );

  if array_length(v_missing, 1) > 0 then
    raise exception
      'FAIL: hay tablas en public que este test no cubre y que quizá se quedaron sin política: %',
      array_to_string(v_missing, ', ');
  end if;
  raise notice 'OK: las quince tablas del catálogo documental están todas en la lista';
end $$;


-- ── 1. Every table has RLS and the three policies ────────────
--
-- RF-111. A table with no RLS is completely open; a table with RLS and no
-- policy for an operation has that operation closed. What is asserted
-- here is that there are exactly three and that none of them is DELETE.
do $$
declare
  v_specs perimeter_spec[];
  r perimeter_spec;
  v_found text[];
begin
  select array_agg(s order by s.table_name) into v_specs from perimeter_spec s;

  foreach r in array v_specs loop
    if not (select c.relrowsecurity
              from pg_class c join pg_namespace n on n.oid = c.relnamespace
             where n.nspname = 'public' and c.relname = r.table_name) then
      raise exception 'FAIL: public.% no tiene RLS activado', r.table_name;
    end if;

    select coalesce(array_agg(cmd::text order by cmd::text), '{}')
      into v_found
      from pg_policies
     where schemaname = 'public' and tablename = r.table_name;

    if v_found <> array['INSERT', 'SELECT', 'UPDATE'] then
      raise exception
        'FAIL: public.% debería tener exactamente las políticas de SELECT, INSERT y UPDATE, tiene [%]',
        r.table_name, array_to_string(v_found, ', ');
    end if;
  end loop;
  raise notice 'OK: las quince tienen RLS y exactamente tres políticas';
end $$;


-- ── 2. The privileges, measured and not assumed ──────────────
--
-- RF-113. The platform grants by default EVERY privilege of each new table
-- to `anon` and `authenticated`, DELETE included.
-- `column_privileges` is looked at and not only `role_table_grants`: a `grant select (contact)`
-- or a `grant update (active)` do not appear in the second, and they would be a hole
-- of one column invisible from where one usually looks.
do $$
declare
  v_specs perimeter_spec[];
  r perimeter_spec;
  v_privs text;
begin
  select array_agg(s order by s.table_name) into v_specs from perimeter_spec s;

  foreach r in array v_specs loop
    if exists (select 1 from information_schema.column_privileges
                where table_schema = 'public' and table_name = r.table_name
                  and grantee = 'anon') then
      raise exception 'FAIL: el rol anónimo tiene privilegios sobre public.%', r.table_name;
    end if;

    if exists (select 1 from information_schema.column_privileges
                where table_schema = 'public' and table_name = r.table_name
                  and grantee = 'PUBLIC') then
      raise exception 'FAIL: PUBLIC tiene privilegios sobre public.%', r.table_name;
    end if;

    select string_agg(distinct privilege_type, ',' order by privilege_type)
      into v_privs
      from information_schema.column_privileges
     where table_schema = 'public' and table_name = r.table_name
       and grantee = 'authenticated';

    if v_privs is distinct from 'INSERT,SELECT,UPDATE' then
      raise exception
        'FAIL: el rol autenticado debería tener INSERT, SELECT y UPDATE sobre public.%, tiene [%]',
        r.table_name, coalesce(v_privs, '(ninguno)');
    end if;

    -- And the table privilege, besides the column one: they are two different
    -- catalogues and a DELETE granted at table level is visible in the first.
    if exists (select 1 from information_schema.role_table_grants
                where table_schema = 'public' and table_name = r.table_name
                  and grantee in ('anon', 'authenticated', 'PUBLIC')
                  and privilege_type in ('DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER')) then
      raise exception 'FAIL: alguien tiene DELETE, TRUNCATE, REFERENCES o TRIGGER sobre public.%',
        r.table_name;
    end if;
  end loop;
  raise notice 'OK: anon sin nada, authenticated con select/insert/update y nadie con delete (RF-113)';
end $$;


-- ── 3. The anonymous role does not reach any of the fifteen ──
--
-- RF-101: the application has no public area, and the anonymous key travels in
-- everybody's client. It is attacked table by table and not by sampling.
do $$
declare v_specs perimeter_spec[]; r perimeter_spec;
begin
  select array_agg(s order by s.table_name) into v_specs from perimeter_spec s;

  foreach r in array v_specs loop
    begin
      set local role anon;
      execute format('select 1 from public.%I limit 1', r.table_name);
      reset role;
      raise exception 'FAIL: el rol anónimo ha podido consultar public.%', r.table_name;
    exception
      when insufficient_privilege then
        reset role;
    end;
  end loop;
  raise notice 'OK: el rol anónimo no llega a ninguna de las quince (RF-101)';
end $$;

reset role;


-- ── 4. The Reader reads what is active ───────────────────────
--
-- RF-105. Authenticated for real: the session carries the reader's `sub` and the
-- `authenticated` role, which is exactly what PostgREST sets on receiving their token.
do $$
declare v_specs perimeter_spec[]; r perimeter_spec; v_n integer;
begin
  select array_agg(s order by s.table_name) into v_specs from perimeter_spec s;

  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000e2","role":"authenticated"}';
  set local role authenticated;

  foreach r in array v_specs loop
    execute format('select count(*) from public.%I where id = %L', r.table_name, r.id_active)
       into v_n;
    if v_n <> 1 then
      raise exception 'FAIL: el lector no ve la fila activa de public.%', r.table_name;
    end if;
  end loop;
  raise notice 'OK: el lector lee las quince tablas (RF-105)';
end $$;

reset role;


-- ── 5. The Reader does not see the wastebasket ───────────────
--
-- RF-906, and it is half the reason the select carries `active` instead of
-- being a bare `can_read()`: the wastebasket is somebody else's half-done
-- work, not catalogue.
do $$
declare v_specs perimeter_spec[]; r perimeter_spec; v_n integer;
begin
  select array_agg(s order by s.table_name) into v_specs from perimeter_spec s;

  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000e2","role":"authenticated"}';
  set local role authenticated;

  foreach r in array v_specs loop
    execute format('select count(*) from public.%I where id = %L', r.table_name, r.id_trash)
       into v_n;
    if v_n <> 0 then
      raise exception 'FAIL: el lector ve la fila dada de baja de public.%', r.table_name;
    end if;
  end loop;
  raise notice 'OK: el lector no ve ninguna fila dada de baja (RF-906)';
end $$;

reset role;


-- ── 6. The Cataloguer does see the wastebasket ───────────────
--
-- The other half. Without this assertion, a policy hiding the wastebasket from
-- everybody would pass the previous block and would leave the wastebasket unrecoverable.
do $$
declare v_specs perimeter_spec[]; r perimeter_spec; v_n integer;
begin
  select array_agg(s order by s.table_name) into v_specs from perimeter_spec s;

  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000e1","role":"authenticated"}';
  set local role authenticated;

  foreach r in array v_specs loop
    execute format('select count(*) from public.%I where id in (%L, %L)',
                   r.table_name, r.id_active, r.id_trash)
       into v_n;
    if v_n <> 2 then
      raise exception 'FAIL: el catalogador debería ver las dos filas de public.%, ve %',
        r.table_name, v_n;
    end if;
  end loop;
  raise notice 'OK: el catalogador ve también la papelera (RF-906)';
end $$;

reset role;


-- ── 7. The Reader does not create in any of them ─────────────
--
-- RF-106, attacking the base directly. That the interface hides the button is not
-- a protection: there is no interface standing between the reader's token and
-- PostgREST.
do $$
declare v_specs perimeter_spec[]; r perimeter_spec;
begin
  select array_agg(s order by s.table_name) into v_specs from perimeter_spec s;

  foreach r in array v_specs loop
    begin
      set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000e2","role":"authenticated"}';
      set local role authenticated;
      execute r.insert_sql;
      reset role;
      raise exception 'FAIL: el lector ha podido dar de alta en public.%', r.table_name;
    exception
      when insufficient_privilege then
        reset role;
    end;
  end loop;
  raise notice 'OK: el lector no da de alta en ninguna de las quince (RF-106)';
end $$;

reset role;


-- ── 8. The Reader neither edits nor sends anything to the wastebasket ─
--
-- And what has to be asserted is the SILENCE: an update the USING clause
-- hides does not fail, it affects no row. Without this assertion, the test would pass
-- all the same over a table with no policy at all.
do $$
declare v_specs perimeter_spec[]; r perimeter_spec; v_affected integer;
begin
  select array_agg(s order by s.table_name) into v_specs from perimeter_spec s;

  foreach r in array v_specs loop
    set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000e2","role":"authenticated"}';
    set local role authenticated;
    execute format('update public.%I set active = false where id = %L', r.table_name, r.id_active);
    get diagnostics v_affected = row_count;
    reset role;

    if v_affected <> 0 then
      raise exception 'FAIL: el lector ha modificado % fila(s) de public.%', v_affected, r.table_name;
    end if;
  end loop;
  raise notice 'OK: el update del lector no afecta a ninguna fila en ninguna tabla (RF-106)';
end $$;

reset role;

-- And the fifteen rows are still active, checked OUTSIDE the reader's session.
-- `row_count = 0` on its own would not catch a policy that let the
-- write through and hid the row afterwards.
do $$
declare v_specs perimeter_spec[]; r perimeter_spec; v_active boolean;
begin
  select array_agg(s order by s.table_name) into v_specs from perimeter_spec s;

  foreach r in array v_specs loop
    execute format('select active from public.%I where id = %L', r.table_name, r.id_active)
       into v_active;
    if not v_active then
      raise exception 'FAIL: el update del lector dejó algo escrito en public.%', r.table_name;
    end if;
  end loop;
  raise notice 'OK: ninguna fila quedó tocada por el lector';
end $$;


-- ── 9. Nobody really deletes, not even whoever can edit ──────
--
-- RF-901. Two barriers: there is no DELETE policy and there is no privilege. Here the
-- second is checked from both sessions, because it is the one that decides.
do $$
declare v_specs perimeter_spec[]; r perimeter_spec;
begin
  select array_agg(s order by s.table_name) into v_specs from perimeter_spec s;

  foreach r in array v_specs loop
    begin
      set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000e1","role":"authenticated"}';
      set local role authenticated;
      execute format('delete from public.%I where id = %L', r.table_name, r.id_active);
      reset role;
      raise exception 'FAIL: el catalogador ha podido borrar de verdad en public.%', r.table_name;
    exception
      when insufficient_privilege then
        reset role;
    end;
  end loop;
  raise notice 'OK: el borrado real está negado hasta al catalogador en las quince (RF-901)';
end $$;

reset role;

do $$
declare v_specs perimeter_spec[]; r perimeter_spec;
begin
  select array_agg(s order by s.table_name) into v_specs from perimeter_spec s;

  foreach r in array v_specs loop
    begin
      set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000e2","role":"authenticated"}';
      set local role authenticated;
      execute format('delete from public.%I where id = %L', r.table_name, r.id_active);
      reset role;
      raise exception 'FAIL: el lector ha podido borrar de verdad en public.%', r.table_name;
    exception
      when insufficient_privilege then
        reset role;
    end;
  end loop;
  raise notice 'OK: el borrado real está negado también al lector';
end $$;

reset role;


-- ── 10. The Cataloguer does write: all fifteen, for real ─────
--
-- This is the assertion that separates «closed» from «well closed». Before this
-- migration the fifteen tables were with RLS and zero policies, that is,
-- denied for everybody with a session: blocks 7, 8 and 9 passed all the same and
-- verified nothing. What proves the policies are written and not just
-- absent is that the role that must be able to, can.
do $$
declare v_specs perimeter_spec[]; r perimeter_spec;
begin
  select array_agg(s order by s.table_name) into v_specs from perimeter_spec s;

  foreach r in array v_specs loop
    set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000e1","role":"authenticated"}';
    set local role authenticated;
    execute r.insert_sql;
    reset role;
  end loop;
  raise notice 'OK: el catalogador da de alta en las quince (RF-103)';
end $$;

reset role;

-- And they edit, and send to the wastebasket, which is how something is withdrawn in this catalogue.
-- `note` is used where it exists and `name` in the vocabulary, because not all of them have
-- the same columns and writing in one that carries neither would prove nothing.
do $$
declare v_specs perimeter_spec[]; r perimeter_spec; v_affected integer; v_column text;
begin
  select array_agg(s order by s.table_name) into v_specs from perimeter_spec s;

  foreach r in array v_specs loop
    select column_name into v_column
      from information_schema.columns
     where table_schema = 'public' and table_name = r.table_name
       and column_name in ('note', 'name')
     order by column_name limit 1;

    if v_column is null then
      raise exception 'FAIL: public.% no tiene ni nota ni nombre que editar', r.table_name;
    end if;

    set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000e1","role":"authenticated"}';
    set local role authenticated;
    execute format('update public.%I set %I = %L where id = %L',
                   r.table_name, v_column,
                   'Editado por el catalogador ' || r.table_name, r.id_active);
    get diagnostics v_affected = row_count;
    reset role;

    if v_affected <> 1 then
      raise exception 'FAIL: el catalogador no ha podido editar public.%', r.table_name;
    end if;
  end loop;
  raise notice 'OK: el catalogador edita las quince (RF-103)';
end $$;

reset role;

-- The logical deletion, which is the only way of withdrawing something (RF-901). It is done over
-- the bridges and the links, which are the ones with no deactivation
-- guardrail in front: withdrawing a master table row in use is prevented by a trigger, and that
-- is another rule and has its own tests.
do $$
declare v_specs perimeter_spec[]; r perimeter_spec; v_affected integer; v_row record;
begin
  select array_agg(s order by s.table_name) into v_specs from perimeter_spec s
   where s.table_name in ('provenance_events', 'artwork_bibliography',
                          'artwork_exhibitions', 'artwork_documents',
                          'exhibition_documents', 'artwork_relationships');

  foreach r in array v_specs loop
    set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000e1","role":"authenticated"}';
    set local role authenticated;
    execute format('update public.%I set active = false where id = %L', r.table_name, r.id_active);
    get diagnostics v_affected = row_count;
    reset role;

    if v_affected <> 1 then
      raise exception 'FAIL: el catalogador no ha podido dar de baja en public.%', r.table_name;
    end if;

    -- And the withdrawal leaves a trace of who and when, which is what separates it from a
    -- delete (RF-901, RF-804).
    execute format(
      'select deactivated_at, deactivated_by from public.%I where id = %L',
      r.table_name, r.id_active) into v_row;
    if v_row.deactivated_at is null
       or v_row.deactivated_by <> '00000000-0000-0000-0000-0000000000e1'::uuid then
      raise exception 'FAIL: la baja de public.% no ha dejado traza de quién y cuándo', r.table_name;
    end if;
  end loop;
  raise notice 'OK: el catalogador retira con baja lógica y traza (RF-901)';
end $$;

reset role;


-- ── 11. The third party's datum: `parties.contact` (RF-105) ──
--
-- The row that matters most of the whole matrix, and that is why it goes outside the loop. It is
-- a private collector's phone number or e-mail: if a policy is
-- written badly, what is exposed is not the studio's catalogue, it is another person's
-- contact. That the Reader sees it is a written decision of RF-105, not
-- an oversight, and that is why it is exercised.
do $$
declare v_contact text;
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000e2","role":"authenticated"}';
  set local role authenticated;

  select contact into v_contact from public.parties
   where id = '9e000001-0000-4000-8000-000000000001';

  if v_contact is distinct from 'contacto@perimetro.test' then
    raise exception 'FAIL: el lector debería leer el contacto de una parte activa (RF-105), lee [%]',
      coalesce(v_contact, '(nada)');
  end if;
  raise notice 'OK: el lector lee el contacto de una parte activa (RF-105)';
end $$;

reset role;

-- And not that of a withdrawn party, which is wastebasket like any other.
do $$
declare v_n integer;
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000e2","role":"authenticated"}';
  set local role authenticated;

  select count(*) into v_n from public.parties
   where contact = 'privado@perimetro.test';

  if v_n <> 0 then
    raise exception 'FAIL: el lector ve el contacto de una parte retirada';
  end if;
  raise notice 'OK: el contacto de una parte retirada no sale ni buscándolo';
end $$;

reset role;


-- ── 12. The five RPCs come back to life ──────────────────────
--
-- All of them are SECURITY INVOKER on purpose, so until this migration none
-- wrote anything for a user with a session: the policy they were missing was
-- precisely the one they needed. They are exercised with the role set, which is how PostgREST is
-- going to call them.
do $$
declare
  v_cita  public.artwork_bibliography;
  v_part  public.artwork_exhibitions;
  v_docob public.artwork_documents;
  v_docex public.exhibition_documents;
  v_rel   public.artwork_relationships;
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000e1","role":"authenticated"}';
  set local role authenticated;

  -- Restoring a withdrawn citation instead of clashing against uniqueness (RF-517):
  -- AR-9601's row was left in the wastebasket when assembling the fixtures.
  v_cita := public.cite_artwork('AR-9601', '9e000004-0000-4000-8000-000000000001');
  if not v_cita.active or v_cita.pages <> 'p. 12' then
    raise exception 'FAIL: cite_artwork no ha restaurado la cita conservando las páginas';
  end if;

  v_part := public.exhibit_artwork('AR-9601', '9e000007-0000-4000-8000-000000000001');
  if not v_part.active or v_part.catalogue_number <> 'cat. 13' then
    raise exception 'FAIL: exhibit_artwork no ha restaurado la participación con su número';
  end if;

  v_docob := public.document_artwork('AR-9601', '9e00000b-0000-4000-8000-000000000001');
  if not v_docob.active then
    raise exception 'FAIL: document_artwork no ha restaurado el vínculo con la obra';
  end if;

  v_docex := public.document_exhibition('9e000007-0000-4000-8000-000000000002',
                                        '9e00000b-0000-4000-8000-000000000001');
  if not v_docex.active then
    raise exception 'FAIL: document_exhibition no ha restaurado el vínculo con la exposición';
  end if;

  -- And in a symmetric type the order the artworks are passed in does not matter.
  v_rel := public.relate_artworks('AR-9601', 'AR-9600', '9e00000e-0000-4000-8000-000000000001');
  if not v_rel.active or v_rel.from_catalog_id <> 'AR-9600' then
    raise exception 'FAIL: relate_artworks no ha restaurado la relación canonicalizada';
  end if;

  raise notice 'OK: las cinco funciones de vínculo funcionan para el catalogador con el rol puesto';
end $$;

reset role;

-- Reordering the provenance chain needed the SELECT policy: without
-- it the function did not find the links and rejected any list.
--
-- First the link block 10 withdrew has to be taken out of the wastebasket, and that
-- is half a proof thrown in: restoring is an update of `active` in the opposite
-- direction and needs the same policy. A perimeter that lets things be withdrawn and does
-- not let them be restored turns the wastebasket into a delete under another name.
do $$
declare v_first uuid; v_affected integer;
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000e1","role":"authenticated"}';
  set local role authenticated;

  update public.provenance_events set active = true
   where id = '9e000002-0000-4000-8000-000000000001';
  get diagnostics v_affected = row_count;
  if v_affected <> 1 then
    raise exception 'FAIL: el catalogador no ha podido restaurar un eslabón de la papelera (RF-902)';
  end if;

  perform public.reorder_provenance_events('AR-9600', array[
    '9e000002-0000-4000-8000-000000000003'::uuid,
    '9e000002-0000-4000-8000-000000000001'::uuid
  ]);

  select id into v_first from public.provenance_events
   where catalog_id = 'AR-9600' and active order by position limit 1;

  if v_first <> '9e000002-0000-4000-8000-000000000003'::uuid then
    raise exception 'FAIL: el catalogador no ha podido reordenar la cadena de procedencia';
  end if;
  raise notice 'OK: el catalogador reordena la procedencia con el rol puesto (RF-509)';
end $$;

reset role;

-- And the Reader receives the function's own message in Spanish, which is better
-- than the silence of an update that affects nobody.
do $$
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000e2","role":"authenticated"}';
  set local role authenticated;
  perform public.reorder_provenance_events('AR-9600', array[
    '9e000002-0000-4000-8000-000000000001'::uuid,
    '9e000002-0000-4000-8000-000000000003'::uuid
  ]);
  reset role;
  raise exception 'FAIL: el lector ha podido reordenar la procedencia';
exception
  when others then
    reset role;
    if position('permiso' in sqlerrm) = 0 then raise; end if;
    raise notice 'OK: el lector no reordena: %', sqlerrm;
end $$;

reset role;


-- ── 13. And the whole catalogue still has no DELETE policy ────
--
-- The same thing `rls_default_deny.test.sql` asserts, repeated here on purpose:
-- fifteen new tables are fifteen chances to write the policy this
-- project does not want, and the warning has to come from the file being
-- edited and not only from another one.
do $$
declare v_with_delete text[];
begin
  select coalesce(array_agg(tablename || '.' || policyname order by tablename), '{}')
    into v_with_delete
    from pg_policies
   where schemaname = 'public' and cmd in ('DELETE', 'ALL');

  if array_length(v_with_delete, 1) > 0 then
    raise exception 'FAIL: hay políticas que permiten DELETE (RF-901): %',
      array_to_string(v_with_delete, ', ');
  end if;
  raise notice 'OK: ni una política de DELETE en todo el esquema (RF-901)';
end $$;

rollback;
