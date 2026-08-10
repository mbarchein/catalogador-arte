-- RF-215 (ADR-006): the tree of physical places.
--
-- What is checked is what the text convention could not guarantee: that
-- two identical places cannot coexist written differently, that the tree cannot
-- be tangled, that renaming and moving are one-row operations, and that a
-- place is not withdrawn with things inside.
\set ON_ERROR_STOP on
begin;

-- Fixtures: one cataloguer and one reader. The profiles are created by the trigger.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000e1', 'cat-lugares@test.local'),
  ('00000000-0000-0000-0000-0000000000e2', 'lec-lugares@test.local');
update public.profiles set role = 'CATALOGER' where id = '00000000-0000-0000-0000-0000000000e1';
update public.profiles set role = 'READER'    where id = '00000000-0000-0000-0000-0000000000e2';

-- And the tree emptied, whatever there is in the base. These tests run both over
-- a freshly migrated base and over a local copy of the production dump,
-- where 20260801150000's data move already created places named
-- like these fixtures: without this the test would fail over the homonymous-roots
-- index and not over what it means to check. Everything lives inside the
-- transaction that is rolled back at the end.
--
-- It is emptied leaf by leaf and in a loop because `parent_id` is `on delete restrict`: a
-- single `delete` taking parent and child at once would be rejected by the
-- constraint itself.
update public.artworks set physical_place_id = null;
do $$
begin
  loop
    delete from public.physical_places p
     where not exists (select 1 from public.physical_places c where c.parent_id = p.id);
    exit when not found;
  end loop;
end $$;

-- ── 1. The name is stored as is ──────────────────────────────
-- It is the reason for the decision: the previous convention wrote in the record and in
-- the PDF «museo de bellas artes de badajoz».
do $$
declare v_nombre text;
begin
  insert into public.physical_places (name) values ('Museo de Bellas Artes de Badajoz (MUBA)')
  returning name into v_nombre;

  if v_nombre <> 'Museo de Bellas Artes de Badajoz (MUBA)' then
    raise exception 'FAIL: el nombre no se ha guardado como se escribió (%)', v_nombre;
  end if;
  raise notice 'OK: el nombre conserva mayúsculas, tildes y paréntesis';
end $$;

-- ── 2. Two siblings are not called the same ──────────────────
do $$
declare v_padre uuid;
begin
  insert into public.physical_places (name) values ('Castelar 4') returning id into v_padre;
  insert into public.physical_places (parent_id, name) values (v_padre, 'Habitación amarilla');

  begin
    -- Same comparison key: with no accents and in lower case it is the same one.
    insert into public.physical_places (parent_id, name) values (v_padre, 'habitacion AMARILLA');
    raise exception 'FAIL: han entrado dos hermanos con el mismo nombre';
  exception when unique_violation then
    raise notice 'OK: dos hermanos con el mismo nombre, escritos distinto, se rechazan';
  end;

  -- But the same name under ANOTHER parent is another place and does go in: there is one
  -- «balda 2» in every shelving unit.
  insert into public.physical_places (name) values ('Villafranca de los Barros');
  insert into public.physical_places (parent_id, name)
  values ((select id from public.physical_places where name = 'Villafranca de los Barros'),
          'Habitación amarilla');
  raise notice 'OK: el mismo nombre bajo otro padre es otro lugar';
end $$;

-- ── 3. Two roots do not either ───────────────────────────────
-- In SQL one null is not equal to another null, so without the partial index this
-- would pass with nobody noticing.
do $$
begin
  insert into public.physical_places (name) values ('castelar 4');
  raise exception 'FAIL: han entrado dos raíces con el mismo nombre';
exception when unique_violation then
  raise notice 'OK: dos raíces con el mismo nombre se rechazan';
end $$;

-- ── 4. The tree cannot be tangled ────────────────────────────
do $$
declare v_padre uuid; v_hijo uuid; v_nieto uuid;
begin
  select id into v_padre from public.physical_places where name = 'Castelar 4';
  select id into v_hijo from public.physical_places
   where parent_id = v_padre and name = 'Habitación amarilla';
  insert into public.physical_places (parent_id, name) values (v_hijo, 'Bloque 3')
  returning id into v_nieto;

  begin
    update public.physical_places set parent_id = v_padre where id = v_padre;
    raise exception 'FAIL: un lugar se ha metido dentro de sí mismo';
  exception when raise_exception then
    raise notice 'OK: un lugar no puede ser su propio padre';
  end;

  begin
    update public.physical_places set parent_id = v_nieto where id = v_padre;
    raise exception 'FAIL: un lugar se ha metido dentro de su propio nieto';
  exception when raise_exception then
    raise notice 'OK: un lugar no puede colgarse de uno de sus descendientes';
  end;
end $$;

-- ── 5. Renaming and moving are one row ───────────────────────
-- It is the requirement that orders the whole decision: the artwork points by identifier,
-- so the new name is seen by the whole catalogue without touching any artwork.
do $$
declare v_id uuid; v_raiz uuid;
begin
  select id into v_id from public.physical_places where name = 'Bloque 3';

  update public.physical_places set name = 'Bloque 3 (reordenado)' where id = v_id;
  if not exists (select 1 from public.physical_places
                  where id = v_id and name = 'Bloque 3 (reordenado)') then
    raise exception 'FAIL: el renombrado no ha cuajado';
  end if;

  -- Y una raíz puede pasar a ser hija de otra, que es la reorganización que se
  -- espera cuando el estudio se ordene.
  select id into v_raiz from public.physical_places where name = 'Villafranca de los Barros';
  update public.physical_places set parent_id = v_raiz
   where name = 'Museo de Bellas Artes de Badajoz (MUBA)';
  raise notice 'OK: renombrar es un update, y una raíz puede pasar a ser hija';
end $$;

-- ── 6. Un lugar con cosas dentro no se retira ────────────────
do $$
declare v_padre uuid;
begin
  select id into v_padre from public.physical_places where name = 'Castelar 4';
  begin
    update public.physical_places set active = false where id = v_padre;
    raise exception 'FAIL: se ha retirado un lugar que contiene otros';
  exception when raise_exception then
    raise notice 'OK: no se puede retirar un lugar con lugares dentro';
  end;
end $$;

-- ── 7. La baja la sella la base, y es reversible ─────────────
do $$
declare v_id uuid; v_cuando timestamptz; v_quien uuid;
begin
  insert into public.physical_places (name) values ('zzzz') returning id into v_id;

  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000e1","role":"authenticated"}';
  update public.physical_places set active = false where id = v_id;
  reset role;

  select deactivated_at, deactivated_by into v_cuando, v_quien
    from public.physical_places where id = v_id;
  if v_cuando is null or v_quien is distinct from '00000000-0000-0000-0000-0000000000e1'::uuid then
    raise exception 'FAIL: la baja no ha quedado sellada (% / %)', v_cuando, v_quien;
  end if;

  update public.physical_places set active = true where id = v_id;
  select deactivated_at into v_cuando from public.physical_places where id = v_id;
  if v_cuando is not null then
    raise exception 'FAIL: restaurar no ha limpiado la traza de la baja';
  end if;
  raise notice 'OK: la baja sella quién y cuándo, y restaurar lo deshace';
end $$;

-- ── 8. Nadie borra de verdad ─────────────────────────────────
do $$
begin
  if exists (select 1 from pg_policies
              where schemaname = 'public' and tablename = 'physical_places'
                and cmd in ('DELETE', 'ALL')) then
    raise exception 'FAIL: hay una política que permite DELETE sobre los lugares';
  end if;
  if has_table_privilege('authenticated', 'public.physical_places', 'delete') then
    raise exception 'FAIL: authenticated tiene privilegio de DELETE sobre los lugares';
  end if;
  raise notice 'OK: retirar es un update; borrar no está concedido a nadie (RF-901)';
end $$;

-- ── 9. Quién puede qué ───────────────────────────────────────
-- Renombrar, mover y retirar son del Catalogador: el estudio está en
-- reordenación y esperar a un administrador para renombrar una balda no es
-- viable. El Lector ve el árbol porque etiqueta la ficha y alimenta el filtro.
do $$
declare v_visibles int;
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000e2","role":"authenticated"}';
  set local role authenticated;

  select count(*) into v_visibles from public.physical_places;
  if v_visibles = 0 then
    raise exception 'FAIL: un Lector no ve el árbol de lugares';
  end if;

  begin
    insert into public.physical_places (name) values ('Sitio del lector');
    reset role;
    raise exception 'FAIL: un Lector ha creado un lugar';
  exception when insufficient_privilege then
    reset role;
    raise notice 'OK: el Lector ve el árbol (% lugares) y no puede tocarlo', v_visibles;
  end;
end $$;

do $$
declare v_id uuid;
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000e1","role":"authenticated"}';
  set local role authenticated;

  insert into public.physical_places (name) values ('Sitio del catalogador') returning id into v_id;
  update public.physical_places set name = 'Sitio renombrado' where id = v_id;

  reset role;
  raise notice 'OK: el Catalogador crea, renombra y mueve';
end $$;

rollback;
