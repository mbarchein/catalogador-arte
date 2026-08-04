-- El perímetro de las quince tablas del catálogo razonado documental.
--
-- RF-101, RF-103, RF-105, RF-106, RF-109, RF-111, RF-113, RF-901, RF-906.
--
-- Los seis grupos anteriores crearon quince tablas con RLS activado y cero
-- políticas. Este fichero comprueba la migración que las abre, y lo hace de las
-- dos maneras que hacen falta:
--
--   1. MIDIENDO el catálogo del sistema —RLS activado, tres políticas por
--      tabla, ninguna de DELETE, y los privilegios de `anon` y `authenticated`
--      leídos de `column_privileges`, que es donde se ve un `grant update
--      (columna)` que `role_table_grants` no enseña—.
--   2. ATACANDO la base autenticado de verdad como un usuario de cada papel.
--      Comprobar que la política existe no verifica nada: lo que importa es lo
--      que la base contesta cuando la petición viene de quien viene.
--
-- Las dos hacen falta y ninguna sustituye a la otra: la primera caza la tabla a
-- la que se le olvidó una operación, la segunda caza la política que está
-- escrita al revés.
\set ON_ERROR_STOP on
begin;

-- ── Fixtures ─────────────────────────────────────────────────
--
-- Un catalogador y un lector de verdad, con su fila en `profiles` creada por el
-- trigger de `auth.users`, y una fila ACTIVA y otra RETIRADA en cada una de las
-- quince tablas. Los identificadores se fijan a mano para poder preguntar por
-- ellos desde dentro de la sesión de cada papel.

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000e1', 'cat-perimetro@test.local'),
  ('00000000-0000-0000-0000-0000000000e2', 'lec-perimetro@test.local');
update public.profiles set role = 'CATALOGER' where id = '00000000-0000-0000-0000-0000000000e1';
update public.profiles set role = 'READER'    where id = '00000000-0000-0000-0000-0000000000e2';

insert into public.artworks (catalog_id, artist, title, attributed_title) values
  ('AR-9600', 'ROTILI', 'La obra del perímetro', 'UNCONFIRMED'),
  ('AR-9601', 'ROTILI', 'La otra obra del perímetro', 'UNCONFIRMED'),
  ('AR-9602', 'ROTILI', 'La tercera obra del perímetro', 'UNCONFIRMED');

-- 1. parties. `contact` lleva un dato de tercero a propósito: RF-105 decide que
-- el Lector lo ve, y esa decisión hay que ejercerla, no suponerla.
insert into public.parties (id, party_type, name, contact) values
  ('9e000001-0000-4000-8000-000000000001', 'INSTITUTION',
   'Museo del Perímetro de prueba', 'contacto@perimetro.test'),
  ('9e000001-0000-4000-8000-000000000002', 'PERSON',
   'Coleccionista retirado de prueba', 'privado@perimetro.test');
update public.parties set active = false
 where id = '9e000001-0000-4000-8000-000000000002';

-- 2. provenance_events. Dos eslabones activos, que es el mínimo para reordenar.
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

-- 14. artwork_relationship_types. Tres: la activa, la retirada y una tercera
-- para que el ataque de más abajo no choque contra la unicidad de la terna.
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

-- La tabla de trabajo con la que se recorren las quince. Está aquí y no
-- repartida por quince bloques a mano porque lo que se comprueba es que NO HAY
-- EXCEPCIONES: una tabla que se cuele sin política es exactamente el fallo que
-- este fichero tiene que cazar, y una lista escrita quince veces se olvida una.
create temporary table perimeter_spec (
  table_name  text primary key,
  id_active   uuid not null,
  id_trash    uuid not null,
  -- Un alta legal y mínima en esa tabla, con la que se ataca desde cada papel.
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

-- Que la lista no se quede corta el día que alguien añada la tabla dieciséis:
-- se contrasta contra el catálogo del sistema y no contra un número escrito.
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
       -- Las de antes de este grupo, con perímetro propio y sus propios tests.
       'artworks', 'images', 'profiles', 'artwork_types', 'series', 'physical_places',
       -- Los enlaces externos no son de este grupo y no tienen migración de
       -- perímetro aparte: nacieron con sus políticas en su propia migración
       -- (20260805100000), y su perímetro entero está en
       -- `external_links.test.sql`. Fueron los primeros en heredar la
       -- visibilidad de su ficha ancla; desde 20260805130000 la heredan también
       -- seis de las quince de aquí, y eso se comprueba en
       -- `documentary_visibility.test.sql`, no en este fichero: aquí las anclas
       -- de los fixtures están todas activas a propósito, para que lo que se
       -- mida sea el perímetro y no la cascada.
       'external_links',
       -- El registro de cambios tampoco es de este grupo, y además su perímetro
       -- es el contrario del que este fichero comprueba: aquí se afirma que el
       -- Catalogador crea, edita y retira en las quince, y allí lo que hay que
       -- afirmar es que NO escribe —es el auditado—. Nació con su política y sus
       -- dos candados en su propia migración (20260805120000) y su perímetro
       -- entero está en `change_log.test.sql`.
       'change_log',
       -- Control de migraciones del stack local: no existe en producción.
       '_migraciones'
     );

  if array_length(v_missing, 1) > 0 then
    raise exception
      'FAIL: hay tablas en public que este test no cubre y que quizá se quedaron sin política: %',
      array_to_string(v_missing, ', ');
  end if;
  raise notice 'OK: las quince tablas del catálogo documental están todas en la lista';
end $$;


-- ── 1. Cada tabla tiene RLS y las tres políticas ─────────────
--
-- RF-111. Una tabla sin RLS está completamente abierta; una tabla con RLS y sin
-- política para una operación tiene esa operación cerrada. Lo que se afirma
-- aquí es que hay exactamente tres y que ninguna es de DELETE.
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


-- ── 2. Los privilegios, medidos y no supuestos ───────────────
--
-- RF-113. La plataforma concede por omisión TODOS los privilegios de cada tabla
-- nueva a `anon` y `authenticated`, incluido DELETE. Se mira
-- `column_privileges` y no solo `role_table_grants`: un `grant select (contact)`
-- o un `grant update (active)` no aparecen en la segunda, y serían un agujero
-- de una columna invisible desde donde se suele mirar.
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

    -- Y el privilegio de tabla, además del de columna: son dos catálogos
    -- distintos y un DELETE concedido a nivel de tabla se ve en el primero.
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


-- ── 3. El rol anónimo no llega a ninguna de las quince ───────
--
-- RF-101: la aplicación no tiene zona pública, y la clave anónima viaja en el
-- cliente de todo el mundo. Se ataca tabla a tabla y no de muestra.
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


-- ── 4. El Lector lee lo activo ───────────────────────────────
--
-- RF-105. Autenticado de verdad: la sesión lleva el `sub` del lector y el rol
-- `authenticated`, que es exactamente lo que PostgREST pone al recibir su token.
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


-- ── 5. El Lector no ve la papelera ───────────────────────────
--
-- RF-906, y es la mitad del motivo de que el select lleve `active` en vez de
-- ser `can_read()` a secas: la papelera es trabajo a medio hacer de otra
-- persona, no catálogo.
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


-- ── 6. El Catalogador sí ve la papelera ──────────────────────
--
-- La otra mitad. Sin este aserto, una política que escondiera la papelera a
-- todo el mundo pasaría el bloque anterior y dejaría la papelera irrecuperable.
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


-- ── 7. El Lector no da de alta en ninguna ────────────────────
--
-- RF-106, atacando la base directamente. Que la interfaz esconda el botón no es
-- una protección: no hay interfaz que se interponga entre el token del lector y
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


-- ── 8. El Lector no edita ni manda nada a la papelera ────────
--
-- Y lo que hay que afirmar es el SILENCIO: un update que la cláusula USING
-- esconde no falla, no afecta a ninguna fila. Sin este aserto, el test pasaría
-- igual sobre una tabla sin política ninguna.
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

-- Y las quince filas siguen activas, comprobado FUERA de la sesión del lector.
-- `row_count = 0` por sí solo no cazaría una política que dejara pasar la
-- escritura y escondiera la fila después.
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


-- ── 9. Nadie borra de verdad, tampoco quien puede editar ─────
--
-- RF-901. Dos barreras: no hay política de DELETE y no hay privilegio. Aquí se
-- comprueba la segunda desde las dos sesiones, porque es la que decide.
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


-- ── 10. El Catalogador sí escribe: las quince, de verdad ─────
--
-- Este es el aserto que separa «cerrado» de «bien cerrado». Antes de esta
-- migración las quince tablas estaban con RLS y cero políticas, es decir,
-- negadas para todo el mundo con sesión: los bloques 7, 8 y 9 pasaban igual y
-- no verificaban nada. Lo que prueba que las políticas están escritas y no solo
-- ausentes es que el papel que debe poder, puede.
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

-- Y edita, y manda a la papelera, que es como se retira algo en este catálogo.
-- Se usa `note` donde existe y `name` en el vocabulario, porque no todas tienen
-- las mismas columnas y escribir en una que no lleva nada no probaría nada.
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

-- La baja lógica, que es la única forma de retirar algo (RF-901). Se hace sobre
-- las puentes y los eslabones, que son las que no tienen guardarraíl de
-- desactivación delante: retirar una maestra en uso lo impide un trigger, y eso
-- es otra regla y tiene sus propios tests.
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

    -- Y la baja deja traza de quién y cuándo, que es lo que la separa de un
    -- borrado (RF-901, RF-804).
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


-- ── 11. El dato de tercero: `parties.contact` (RF-105) ───────
--
-- La fila que más importa de toda la matriz, y por eso va aparte del bucle. Es
-- el teléfono o el correo de un coleccionista particular: si una política se
-- escribe mal, lo que se expone no es el catálogo del estudio, es el contacto
-- de otra persona. Que el Lector lo vea es una decisión escrita de RF-105, no
-- un descuido, y por eso se ejerce.
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

-- Y no el de una parte retirada, que es papelera como cualquier otra.
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


-- ── 12. Las cinco RPC vuelven a la vida ──────────────────────
--
-- Todas son SECURITY INVOKER a propósito, así que hasta esta migración ninguna
-- escribía nada para un usuario con sesión: la política que les faltaba era
-- justo la que necesitaban. Se ejercitan con el rol puesto, que es como las va
-- a llamar PostgREST.
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

  -- Restaurar una cita retirada en vez de chocar contra la unicidad (RF-517):
  -- la fila de AR-9601 se dejó en la papelera al montar los fixtures.
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

  -- Y en un tipo simétrico da igual el orden en que se pasen las obras.
  v_rel := public.relate_artworks('AR-9601', 'AR-9600', '9e00000e-0000-4000-8000-000000000001');
  if not v_rel.active or v_rel.from_catalog_id <> 'AR-9600' then
    raise exception 'FAIL: relate_artworks no ha restaurado la relación canonicalizada';
  end if;

  raise notice 'OK: las cinco funciones de vínculo funcionan para el catalogador con el rol puesto';
end $$;

reset role;

-- Reordenar la cadena de procedencia necesitaba la política de SELECT: sin
-- ella la función no encontraba los eslabones y rechazaba cualquier lista.
--
-- Antes hay que sacar de la papelera el eslabón que el bloque 10 retiró, y eso
-- es media prueba de propina: restaurar es un update de `active` en sentido
-- contrario y necesita la misma política. Un perímetro que deje retirar y no
-- deje restaurar convierte la papelera en un borrado con otro nombre.
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

-- Y el Lector recibe el mensaje en español de la propia función, que es mejor
-- que el silencio de un update que no afecta a nadie.
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


-- ── 13. Y el catálogo entero sigue sin una política de DELETE ─
--
-- Lo mismo que afirma `rls_default_deny.test.sql`, repetido aquí a propósito:
-- quince tablas nuevas son quince ocasiones de escribir la política que este
-- proyecto no quiere, y el aviso tiene que llegar del fichero que se está
-- editando y no solo de otro.
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
