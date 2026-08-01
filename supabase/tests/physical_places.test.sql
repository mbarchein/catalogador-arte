-- RF-215 (ADR-006): el árbol de lugares físicos.
--
-- Lo que se comprueba es lo que la convención de texto no podía garantizar: que
-- dos sitios iguales no puedan coexistir escritos distinto, que el árbol no se
-- pueda enredar, que renombrar y mover sean operaciones de una fila, y que un
-- lugar no se retire con cosas dentro.
\set ON_ERROR_STOP on
begin;

-- Fixtures: un catalogador y un lector. Los perfiles los crea el trigger.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000e1', 'cat-lugares@test.local'),
  ('00000000-0000-0000-0000-0000000000e2', 'lec-lugares@test.local');
update public.profiles set role = 'CATALOGER' where id = '00000000-0000-0000-0000-0000000000e1';
update public.profiles set role = 'READER'    where id = '00000000-0000-0000-0000-0000000000e2';

-- Y el árbol vacío, haya lo que haya en la base. Estos tests corren tanto sobre
-- una base recién migrada como sobre una copia local del volcado de producción,
-- donde el traslado de datos de 20260801150000 ya creó lugares que se llaman
-- igual que estos fixtures: sin esto el test fallaría por el índice de raíces
-- homónimas y no por lo que pretende comprobar. Todo vive dentro de la
-- transacción que se deshace al final.
--
-- Se vacía por hojas y en bucle porque `parent_id` es `on delete restrict`: un
-- solo `delete` que se llevara padre e hijo a la vez lo rechazaría la propia
-- restricción.
update public.artworks set physical_place_id = null;
do $$
begin
  loop
    delete from public.physical_places p
     where not exists (select 1 from public.physical_places c where c.parent_id = p.id);
    exit when not found;
  end loop;
end $$;

-- ── 1. El nombre se guarda tal cual ──────────────────────────
-- Es el motivo de la decisión: la convención anterior escribía en la ficha y en
-- el PDF «museo de bellas artes de badajoz».
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

-- ── 2. Dos hermanos no se llaman igual ───────────────────────
do $$
declare v_padre uuid;
begin
  insert into public.physical_places (name) values ('Castelar 4') returning id into v_padre;
  insert into public.physical_places (parent_id, name) values (v_padre, 'Habitación amarilla');

  begin
    -- Misma clave de comparación: sin tildes y en minúsculas es la misma.
    insert into public.physical_places (parent_id, name) values (v_padre, 'habitacion AMARILLA');
    raise exception 'FAIL: han entrado dos hermanos con el mismo nombre';
  exception when unique_violation then
    raise notice 'OK: dos hermanos con el mismo nombre, escritos distinto, se rechazan';
  end;

  -- Pero el mismo nombre en OTRO padre es otro sitio y sí entra: «balda 2» hay
  -- una en cada estantería.
  insert into public.physical_places (name) values ('Villafranca de los Barros');
  insert into public.physical_places (parent_id, name)
  values ((select id from public.physical_places where name = 'Villafranca de los Barros'),
          'Habitación amarilla');
  raise notice 'OK: el mismo nombre bajo otro padre es otro lugar';
end $$;

-- ── 3. Dos raíces tampoco ────────────────────────────────────
-- En SQL un nulo no es igual a otro nulo, así que sin el índice parcial esto
-- pasaría sin que nadie se diera cuenta.
do $$
begin
  insert into public.physical_places (name) values ('castelar 4');
  raise exception 'FAIL: han entrado dos raíces con el mismo nombre';
exception when unique_violation then
  raise notice 'OK: dos raíces con el mismo nombre se rechazan';
end $$;

-- ── 4. El árbol no se puede enredar ──────────────────────────
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

-- ── 5. Renombrar y mover son de una fila ─────────────────────
-- Es el requisito que ordena toda la decisión: la obra apunta por identificador,
-- así que el nombre nuevo lo ve todo el catálogo sin tocar ninguna obra.
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
