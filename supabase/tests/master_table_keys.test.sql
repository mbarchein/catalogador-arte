-- RF-213, RF-802, RF-901 (ADR-007): artwork types and series with a surrogate
-- key.
--
-- What is checked is the decision's promise: that renaming be one row
-- the whole catalogue sees without touching any artwork, that what previously had no way of being
-- withdrawn can now be withdrawn, and that the rule the name held up
-- —a series belongs to its artist's fund— still stands now that the artwork points by
-- identifier.
--
-- The fund (`artist_fund`) is not included: it is still an enum type until
-- ADR-007's second delivery.
\set ON_ERROR_STOP on
begin;

-- Fixtures: one cataloguer and one reader. The names carry a test mark on
-- purpose, so as not to clash with the real vocabulary when these tests run
-- over a local copy of the production dump.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000d1', 'cat-claves@test.local'),
  ('00000000-0000-0000-0000-0000000000d2', 'lec-claves@test.local');
update public.profiles set role = 'CATALOGER' where id = '00000000-0000-0000-0000-0000000000d1';
update public.profiles set role = 'READER'    where id = '00000000-0000-0000-0000-0000000000d2';

-- ── 1. The move left nothing unpaired ────────────────────────
-- Over a freshly migrated base it says nothing; over one loaded with the dump it is
-- where it can be seen whether the pairing by text did its job. It goes first because
-- it looks at the data that is there, before the fixtures add theirs.
do $$
declare v_sueltas int;
begin
  select count(*) into v_sueltas
    from public.artworks
   where (btrim(artwork_type) <> '' and artwork_type_id is null)
      or (btrim(series) <> '' and series_id is null);

  if v_sueltas > 0 then
    raise exception 'FAIL: % obras con tipo o serie en texto se quedaron sin identificador', v_sueltas;
  end if;
  raise notice 'OK: ningún tipo ni serie en texto se quedó sin su fila';
end $$;

-- ── 2. The name is no longer the key ─────────────────────────
-- The assertion that says the decision is applied: the primary key is `id`.
do $$
declare v_tipo text; v_serie text;
begin
  select string_agg(a.attname, ',' order by a.attname) into v_tipo
    from pg_index i
    join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any (i.indkey)
   where i.indrelid = 'public.artwork_types'::regclass and i.indisprimary;

  select string_agg(a.attname, ',' order by a.attname) into v_serie
    from pg_index i
    join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any (i.indkey)
   where i.indrelid = 'public.series'::regclass and i.indisprimary;

  if v_tipo <> 'id' then
    raise exception 'FAIL: la clave de artwork_types es (%), no id', v_tipo;
  end if;
  if v_serie <> 'id' then
    raise exception 'FAIL: la clave de series es (%), no id', v_serie;
  end if;
  raise notice 'OK: las dos tablas tienen clave sustituta';
end $$;

-- ── 3. And it is still unique ────────────────────────────────
-- Letting go of identity is not letting go of uniqueness: two types with the same name
-- are still the same type.
do $$
begin
  insert into public.artwork_types (name) values ('Tipo de prueba ADR-007');
  begin
    insert into public.artwork_types (name) values ('Tipo de prueba ADR-007');
    raise exception 'FAIL: han entrado dos tipos con el mismo nombre';
  exception when unique_violation then
    raise notice 'OK: dos tipos con el mismo nombre se rechazan';
  end;

  -- In the series uniqueness is by fund: the same name in another fund is
  -- another series, which is the reason the fund entered the old key.
  insert into public.series (artist, name) values ('ROTILI', 'Serie de prueba ADR-007');
  insert into public.series (artist, name) values ('TEST', 'Serie de prueba ADR-007');
  begin
    insert into public.series (artist, name) values ('ROTILI', 'Serie de prueba ADR-007');
    raise exception 'FAIL: han entrado dos series iguales del mismo fondo';
  exception when unique_violation then
    raise notice 'OK: el mismo nombre en otro fondo es otra serie, y repetirlo en el mismo no';
  end;
end $$;

-- ── 4. Renaming is one row and does not touch the artwork ────
-- The requirement that orders the whole decision. With the name as the key, this required
-- touching every artwork that used the type.
do $$
declare
  v_tipo uuid;
  v_obra text;
  v_actualizada timestamptz;
  v_basica timestamptz;
  v_nombre text;
begin
  select id into v_tipo from public.artwork_types where name = 'Tipo de prueba ADR-007';

  -- With no text in `artwork_type`: the artwork points only by identifier, which is
  -- how the new frontend will write.
  insert into public.artworks (artist, title, attributed_title, artwork_type_id)
  values ('ROTILI', 'la del tipo', 'UNCONFIRMED', v_tipo)
  returning catalog_id, updated_at, basic_updated_at
      into v_obra, v_actualizada, v_basica;

  update public.artwork_types set name = 'Tipo de prueba ADR-007 (renombrado)' where id = v_tipo;

  select t.name into v_nombre
    from public.artworks a join public.artwork_types t on t.id = a.artwork_type_id
   where a.catalog_id = v_obra;

  if v_nombre <> 'Tipo de prueba ADR-007 (renombrado)' then
    raise exception 'FAIL: la obra no ve el nombre nuevo del tipo (%)', v_nombre;
  end if;

  if exists (select 1 from public.artworks
              where catalog_id = v_obra
                and (updated_at is distinct from v_actualizada
                     or basic_updated_at is distinct from v_basica)) then
    raise exception 'FAIL: renombrar el tipo ha movido las fechas de la obra';
  end if;
  raise notice 'OK: renombrar un tipo es un update de una fila y no toca ninguna obra';
end $$;

-- ── 5. Changing the artwork's type does move the basic date ──
-- RF-802: the type is a phase-1 field, it is taken with the artwork in front. The series
-- is not: it is decided by reading a catalogue.
do $$
declare
  v_obra text;
  v_otro uuid;
  v_serie uuid;
  v_antes timestamptz;
  v_despues timestamptz;
begin
  select catalog_id into v_obra from public.artworks where title = 'la del tipo';
  insert into public.artwork_types (name) values ('Otro tipo de prueba ADR-007')
  returning id into v_otro;

  update public.artworks set basic_updated_at = '2020-01-01' where catalog_id = v_obra;
  select basic_updated_at into v_antes from public.artworks where catalog_id = v_obra;

  update public.artworks set artwork_type_id = v_otro where catalog_id = v_obra;
  select basic_updated_at into v_despues from public.artworks where catalog_id = v_obra;
  if v_despues = v_antes then
    raise exception 'FAIL: cambiar el tipo no ha movido basic_updated_at';
  end if;

  -- And the series does not move it.
  update public.artworks set basic_updated_at = '2020-01-01' where catalog_id = v_obra;
  select basic_updated_at into v_antes from public.artworks where catalog_id = v_obra;

  select id into v_serie from public.series
   where artist = 'ROTILI' and name = 'Serie de prueba ADR-007';
  update public.artworks set series_id = v_serie where catalog_id = v_obra;
  select basic_updated_at into v_despues from public.artworks where catalog_id = v_obra;
  if v_despues is distinct from v_antes then
    raise exception 'FAIL: cambiar la serie ha movido la fecha básica';
  end if;

  raise notice 'OK: el tipo mueve la fecha básica y la serie no (RF-802)';
end $$;

-- ── 6. The series is still the one of the artwork's fund ─────
-- The foreign key guarantees the series exists, not that it belongs to the artist: it is the
-- rule the vocabulary's trigger held up and that had to be redone for the
-- identifier.
do $$
declare v_serie_test uuid;
begin
  select id into v_serie_test from public.series
   where artist = 'TEST' and name = 'Serie de prueba ADR-007';

  begin
    -- A Rotili artwork with a series from the test fund.
    insert into public.artworks (artist, title, attributed_title, series_id)
    values ('ROTILI', 'serie de otro fondo', 'UNCONFIRMED', v_serie_test);
    raise exception 'FAIL: una obra ha entrado con una serie de otro fondo';
  exception when raise_exception then
    raise notice 'OK: una obra no puede apuntar a una serie de otro fondo';
  end;

  -- And not by moving it afterwards either.
  begin
    update public.artworks set series_id = v_serie_test where title = 'la del tipo';
    raise exception 'FAIL: se ha movido una obra a una serie de otro fondo';
  exception when raise_exception then
    raise notice 'OK: tampoco se puede mover a una serie de otro fondo';
  end;
end $$;

-- ── 7. What has artworks inside is not withdrawn ─────────────
-- The logical deletion is new: before there was no way of withdrawing a type, because the
-- name was the key.
do $$
declare v_tipo uuid; v_serie uuid;
begin
  select artwork_type_id into v_tipo from public.artworks where title = 'la del tipo';
  begin
    update public.artwork_types set active = false where id = v_tipo;
    raise exception 'FAIL: se ha retirado un tipo que usa una obra activa';
  exception when raise_exception then
    raise notice 'OK: no se puede retirar un tipo que usan obras del catálogo';
  end;

  select series_id into v_serie from public.artworks where title = 'la del tipo';
  begin
    update public.series set active = false where id = v_serie;
    raise exception 'FAIL: se ha retirado una serie con obras dentro';
  exception when raise_exception then
    raise notice 'OK: no se puede retirar una serie con obras dentro';
  end;
end $$;

-- ── 8. An artwork in the wastebasket does not get in the way ─
do $$
declare v_tipo uuid; v_obra text;
begin
  insert into public.artwork_types (name) values ('Tipo que se vacía ADR-007')
  returning id into v_tipo;
  insert into public.artworks (artist, title, attributed_title, artwork_type_id)
  values ('ROTILI', 'la de la papelera', 'UNCONFIRMED', v_tipo)
  returning catalog_id into v_obra;

  update public.artworks set active = false where catalog_id = v_obra;
  update public.artwork_types set active = false where id = v_tipo;

  if exists (select 1 from public.artwork_types where id = v_tipo and active) then
    raise exception 'FAIL: el tipo no se ha retirado';
  end if;
  raise notice 'OK: una obra en la papelera no impide retirar su tipo';
end $$;

-- ── 9. The withdrawal is stamped by the base, and it is reversible ─
do $$
declare v_id uuid; v_cuando timestamptz; v_quien uuid;
begin
  insert into public.artwork_types (name) values ('Tipo sellado ADR-007') returning id into v_id;

  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}';
  update public.artwork_types set active = false where id = v_id;
  reset role;

  select deactivated_at, deactivated_by into v_cuando, v_quien
    from public.artwork_types where id = v_id;
  if v_cuando is null or v_quien is distinct from '00000000-0000-0000-0000-0000000000d1'::uuid then
    raise exception 'FAIL: la baja no ha quedado sellada (% / %)', v_cuando, v_quien;
  end if;

  update public.artwork_types set active = true where id = v_id;
  select deactivated_at into v_cuando from public.artwork_types where id = v_id;
  if v_cuando is not null then
    raise exception 'FAIL: restaurar no ha limpiado la traza de la baja';
  end if;
  raise notice 'OK: la baja sella quién y cuándo, y restaurar lo deshace';
end $$;

-- ── 10. Nobody really deletes ────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['artwork_types', 'series'] loop
    if exists (select 1 from pg_policies
                where schemaname = 'public' and tablename = t and cmd in ('DELETE', 'ALL')) then
      raise exception 'FAIL: hay una política que permite DELETE sobre %', t;
    end if;
    if has_table_privilege('authenticated', 'public.' || t, 'delete') then
      raise exception 'FAIL: authenticated tiene DELETE sobre %', t;
    end if;
  end loop;
  raise notice 'OK: retirar es un update; borrar no está concedido a nadie (RF-901)';
end $$;

-- ── 11. Who can rename and withdraw ─────────────────────────
-- The Cataloguer, as with the places: the studio is being reorganised and
-- waiting for an administrator to correct a name is not viable.
do $$
declare v_id uuid; v_filas int; v_nombre text;
begin
  select id into v_id from public.artwork_types where name = 'Otro tipo de prueba ADR-007';

  -- An UPDATE that does not pass the policy's `using` gives NO error: the row
  -- simply is not visible to them and zero are updated. It is different from the
  -- INSERT, where a `with check` that fails does throw insufficient_privilege, and
  -- confusing them is how a test that passes an open table gets written.
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000d2","role":"authenticated"}';
  set local role authenticated;
  update public.artwork_types set name = 'Renombrado por un lector' where id = v_id;
  get diagnostics v_filas = row_count;
  reset role;

  select name into v_nombre from public.artwork_types where id = v_id;
  if v_filas <> 0 or v_nombre = 'Renombrado por un lector' then
    raise exception 'FAIL: un Lector ha renombrado un tipo de obra (% filas, «%»)', v_filas, v_nombre;
  end if;
  raise notice 'OK: un Lector no alcanza ninguna fila para renombrarla';

  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}';
  set local role authenticated;
  update public.artwork_types set name = 'Renombrado por el catalogador' where id = v_id;
  update public.series set name = 'Serie renombrada ADR-007'
   where artist = 'TEST' and name = 'Serie de prueba ADR-007';
  reset role;
  raise notice 'OK: el Catalogador renombra tipos y series';
end $$;

rollback;
