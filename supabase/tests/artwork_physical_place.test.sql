-- RF-215, RF-802, RF-901 (ADR-006): the artwork hung from the place tree.
--
-- The tree itself is covered by physical_places.test.sql. Here what appears
-- on joining it with the artworks is checked: that renaming a place is seen by the whole
-- catalogue without touching a single artwork —the requirement that orders the whole decision—, that
-- moving an artwork does count as having had it in front, and that a place with artworks
-- inside cannot be withdrawn.
\set ON_ERROR_STOP on
begin;

-- ── 1. The move did not leave the auditing off ───────────────
-- The data migration disables the audit trigger so as not to sign the
-- artworks with a null `auth.uid()`. If it were ever forgotten to turn it back
-- on, the catalogue would lose the trace with nothing failing: that is what
-- this assertion checks, and it is the kind of failure that is only seen by looking for it.
do $$
declare v_estado "char";
begin
  select t.tgenabled into v_estado
    from pg_trigger t join pg_class c on c.oid = t.tgrelid
   where c.relname = 'artworks' and t.tgname = 'artwork_audit_trail';

  if v_estado is null then
    raise exception 'FAIL: no existe el trigger de auditoría de obras';
  end if;
  if v_estado <> 'O' then
    raise exception 'FAIL: el trigger de auditoría de obras está desactivado (%)', v_estado;
  end if;
  raise notice 'OK: la auditoría de obras quedó activada tras el traslado';
end $$;

-- ── 2. The move did not leave orphan locations ───────────────
-- Over a freshly migrated base this assertion says nothing, and it is right that it does not
-- say anything: over a base loaded with the production dump it is the only place
-- where it can be seen whether the comma split did its job. It goes before the fixtures
-- because the fixtures empty the tree. `zzzz` was a test value and was
-- discarded on purpose (ADR-006).
do $$
declare v_huerfanas int;
begin
  select count(*) into v_huerfanas
    from public.artworks
   where btrim(coalesce(physical_location, '')) <> ''
     and public.place_key(physical_location) <> 'zzzz'
     and physical_place_id is null;

  if v_huerfanas > 0 then
    raise exception 'FAIL: % obras con ubicación en texto se quedaron sin nodo', v_huerfanas;
  end if;
  raise notice 'OK: ninguna ubicación en texto se quedó sin su nodo del árbol';
end $$;

-- ── Fixtures ─────────────────────────────────────────────────
-- One cataloguer, and the tree emptied whatever there is in the base. The second is
-- needed because these tests run both over a freshly migrated base and over
-- a local copy of the production dump, where the move already created places
-- with these same names: without this the test would fail over the homonymous-roots
-- index and not over what it means to check. Everything lives inside the
-- transaction that is rolled back at the end.
--
-- It is emptied leaf by leaf and in a loop because `parent_id` is `on delete restrict`: a
-- single `delete` taking parent and child at once would be rejected by the
-- constraint itself.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000f1', 'cat-obra-lugar@test.local');
update public.profiles set role = 'CATALOGER' where id = '00000000-0000-0000-0000-0000000000f1';

update public.artworks set physical_place_id = null;
do $$
begin
  loop
    delete from public.physical_places p
     where not exists (select 1 from public.physical_places c where c.parent_id = p.id);
    exit when not found;
  end loop;
end $$;

-- ── 3. An artwork may have no location ──────────────────────
-- RF-215. It is the counterpart of the empty string from before: cataloguing with the
-- piece in front cannot require deciding where it is.
do $$
declare v_lugar uuid;
begin
  insert into public.artworks (artist, title, attributed_title)
  values ('ROTILI', 'sin sitio', 'UNCONFIRMED')
  returning physical_place_id into v_lugar;

  if v_lugar is not null then
    raise exception 'FAIL: una obra nueva ha nacido con ubicación (%)', v_lugar;
  end if;
  raise notice 'OK: una obra sin ubicación es legítima';
end $$;

-- ── 4. Renaming the place does not touch the artwork ─────────
-- The ADR's reason: the new name is seen by the whole catalogue, the artwork has not been
-- touched, and therefore neither `updated_at` nor `basic_updated_at` moves (RF-802:
-- renaming a shelf is not having had the piece in front).
do $$
declare
  v_lugar uuid;
  v_obra text;
  v_actualizada timestamptz;
  v_basica timestamptz;
  v_nombre text;
begin
  insert into public.physical_places (name) values ('castelar 4') returning id into v_lugar;

  insert into public.artworks (artist, title, attributed_title, physical_place_id)
  values ('ROTILI', 'con sitio', 'UNCONFIRMED', v_lugar)
  returning catalog_id, updated_at, basic_updated_at
      into v_obra, v_actualizada, v_basica;

  update public.physical_places set name = 'Castelar 4' where id = v_lugar;

  select p.name into v_nombre
    from public.artworks a join public.physical_places p on p.id = a.physical_place_id
   where a.catalog_id = v_obra;

  if v_nombre <> 'Castelar 4' then
    raise exception 'FAIL: la obra no ve el nombre nuevo del lugar (%)', v_nombre;
  end if;

  if exists (select 1 from public.artworks
              where catalog_id = v_obra
                and (updated_at is distinct from v_actualizada
                     or basic_updated_at is distinct from v_basica)) then
    raise exception 'FAIL: renombrar el lugar ha movido las fechas de la obra';
  end if;
  raise notice 'OK: renombrar es un update de una fila y el catálogo entero lo ve';
end $$;

-- ── 5. Moving the artwork does move the basic date ───────────
-- RF-802: the location is a phase-1 field. Changing it is having been in front
-- of the artwork, and that date is the datum that says when it was last examined.
do $$
declare
  v_origen uuid;
  v_destino uuid;
  v_obra text;
  v_antes timestamptz;
  v_despues timestamptz;
begin
  select id into v_origen from public.physical_places where name = 'Castelar 4';
  insert into public.physical_places (name) values ('Villafranca de los Barros')
  returning id into v_destino;

  insert into public.artworks (artist, title, attributed_title, physical_place_id)
  values ('ROTILI', 'la que se mueve', 'UNCONFIRMED', v_origen)
  returning catalog_id into v_obra;

  -- An earlier and recognisable basic date, so the assertion does not depend on the
  -- clock's resolution within a single transaction.
  update public.artworks set basic_updated_at = '2020-01-01' where catalog_id = v_obra;
  select basic_updated_at into v_antes from public.artworks where catalog_id = v_obra;

  update public.artworks set physical_place_id = v_destino where catalog_id = v_obra;
  select basic_updated_at into v_despues from public.artworks where catalog_id = v_obra;

  if v_despues = v_antes then
    raise exception 'FAIL: cambiar la obra de sitio no ha movido basic_updated_at';
  end if;
  raise notice 'OK: cambiar una obra de sitio mueve la fecha básica (RF-802)';
end $$;

-- ── 6. A phase-2 field still does not move it ────────────────
-- The assertion that protects the trigger's tuple change: on adding
-- `physical_place_id` nothing else has slipped in and the distinction between the two
-- phases has not been lost.
do $$
declare
  v_obra text;
  v_antes timestamptz;
  v_despues timestamptz;
begin
  select catalog_id into v_obra from public.artworks where title = 'la que se mueve';

  update public.artworks set basic_updated_at = '2020-01-01' where catalog_id = v_obra;
  select basic_updated_at into v_antes from public.artworks where catalog_id = v_obra;

  update public.artworks set inventory_process_notes = 'anotación bibliográfica'
   where catalog_id = v_obra;
  select basic_updated_at into v_despues from public.artworks where catalog_id = v_obra;

  if v_despues is distinct from v_antes then
    raise exception 'FAIL: una nota de fase 2 ha movido la fecha básica';
  end if;
  raise notice 'OK: un campo de fase 2 no mueve la fecha básica';
end $$;

-- ── 7. A place with artworks inside is not withdrawn ─────────
do $$
declare v_lugar uuid;
begin
  select id into v_lugar from public.physical_places where name = 'Villafranca de los Barros';
  begin
    update public.physical_places set active = false where id = v_lugar;
    raise exception 'FAIL: se ha retirado un lugar que tiene obras dentro';
  exception when raise_exception then
    raise notice 'OK: no se puede retirar un lugar con obras dentro';
  end;
end $$;

-- ── 8. An artwork in the wastebasket does not get in the way ─
-- The logical deletion cannot turn into a padlock: a withdrawn artwork does not prevent
-- the shelf it was on from being withdrawn.
do $$
declare v_lugar uuid; v_obra text;
begin
  insert into public.physical_places (name) values ('balda que se vacía')
  returning id into v_lugar;
  insert into public.artworks (artist, title, attributed_title, physical_place_id)
  values ('ROTILI', 'la de la papelera', 'UNCONFIRMED', v_lugar)
  returning catalog_id into v_obra;

  update public.artworks set active = false where catalog_id = v_obra;
  update public.physical_places set active = false where id = v_lugar;

  if exists (select 1 from public.physical_places where id = v_lugar and active) then
    raise exception 'FAIL: el lugar no se ha retirado';
  end if;
  raise notice 'OK: una obra en la papelera no impide retirar su lugar';
end $$;

-- ── 9. It cannot point at a place that does not exist ────────
do $$
begin
  begin
    insert into public.artworks (artist, title, attributed_title, physical_place_id)
    values ('ROTILI', 'apunta al vacío', 'UNCONFIRMED',
            '00000000-0000-0000-0000-00000000dead');
    raise exception 'FAIL: una obra apunta a un lugar inexistente';
  exception when foreign_key_violation then
    raise notice 'OK: la obra no puede apuntar a un lugar que no existe';
  end;
end $$;

rollback;
