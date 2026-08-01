-- RF-213, RF-802, RF-901 (ADR-007): los tipos de obra y las series con clave
-- sustituta.
--
-- Lo que se comprueba es la promesa de la decisión: que renombrar sea una fila
-- que ve el catálogo entero sin tocar ninguna obra, que ahora se pueda retirar lo
-- que antes no tenía forma de retirarse, y que la regla que el nombre sostenía
-- —una serie es del fondo de su artista— siga en pie ahora que la obra apunta por
-- identificador.
--
-- El fondo (`artist_fund`) no entra: sigue siendo un tipo enumerado hasta la
-- segunda entrega de ADR-007.
\set ON_ERROR_STOP on
begin;

-- Fixtures: un catalogador y un lector. Los nombres llevan marca de prueba a
-- propósito, para no chocar con el vocabulario real cuando estos tests corren
-- sobre una copia local del volcado de producción.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000d1', 'cat-claves@test.local'),
  ('00000000-0000-0000-0000-0000000000d2', 'lec-claves@test.local');
update public.profiles set role = 'CATALOGER' where id = '00000000-0000-0000-0000-0000000000d1';
update public.profiles set role = 'READER'    where id = '00000000-0000-0000-0000-0000000000d2';

-- ── 1. El traslado no dejó nada sin emparejar ────────────────
-- Sobre una base recién migrada no dice nada; sobre una cargada con el volcado es
-- donde se ve si el emparejamiento por texto hizo su trabajo. Va primero porque
-- mira los datos que hay, antes de que los fixtures añadan los suyos.
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

-- ── 2. El nombre ya no es la clave ───────────────────────────
-- El aserto que dice que la decisión está aplicada: la clave primaria es `id`.
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

-- ── 3. Y sigue siendo único ──────────────────────────────────
-- Soltar la identidad no es soltar la unicidad: dos tipos con el mismo nombre
-- siguen siendo el mismo tipo.
do $$
begin
  insert into public.artwork_types (name) values ('Tipo de prueba ADR-007');
  begin
    insert into public.artwork_types (name) values ('Tipo de prueba ADR-007');
    raise exception 'FAIL: han entrado dos tipos con el mismo nombre';
  exception when unique_violation then
    raise notice 'OK: dos tipos con el mismo nombre se rechazan';
  end;

  -- En las series la unicidad es por fondo: el mismo nombre en otro fondo es
  -- otra serie, que es el motivo de que el fondo entrara en la clave vieja.
  insert into public.series (artist, name) values ('ROTILI', 'Serie de prueba ADR-007');
  insert into public.series (artist, name) values ('TEST', 'Serie de prueba ADR-007');
  begin
    insert into public.series (artist, name) values ('ROTILI', 'Serie de prueba ADR-007');
    raise exception 'FAIL: han entrado dos series iguales del mismo fondo';
  exception when unique_violation then
    raise notice 'OK: el mismo nombre en otro fondo es otra serie, y repetirlo en el mismo no';
  end;
end $$;

-- ── 4. Renombrar es una fila y no toca la obra ───────────────
-- El requisito que ordena toda la decisión. Con el nombre por clave, esto exigía
-- tocar todas las obras que usaran el tipo.
do $$
declare
  v_tipo uuid;
  v_obra text;
  v_actualizada timestamptz;
  v_basica timestamptz;
  v_nombre text;
begin
  select id into v_tipo from public.artwork_types where name = 'Tipo de prueba ADR-007';

  -- Sin texto en `artwork_type`: la obra apunta solo por identificador, que es
  -- como escribirá el frontend nuevo.
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

-- ── 5. Cambiar el tipo de la obra sí mueve la fecha básica ───
-- RF-802: el tipo es un campo de fase 1, se toma con la obra delante. La serie
-- no: se decide leyendo un catálogo.
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

  -- Y la serie no la mueve.
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

-- ── 6. La serie sigue siendo la del fondo de la obra ─────────
-- La clave ajena garantiza que la serie existe, no que sea del artista: es la
-- regla que sostenía el trigger del vocabulario y que había que rehacer para el
-- identificador.
do $$
declare v_serie_test uuid;
begin
  select id into v_serie_test from public.series
   where artist = 'TEST' and name = 'Serie de prueba ADR-007';

  begin
    -- Una obra de Rotili con una serie del fondo de pruebas.
    insert into public.artworks (artist, title, attributed_title, series_id)
    values ('ROTILI', 'serie de otro fondo', 'UNCONFIRMED', v_serie_test);
    raise exception 'FAIL: una obra ha entrado con una serie de otro fondo';
  exception when raise_exception then
    raise notice 'OK: una obra no puede apuntar a una serie de otro fondo';
  end;

  -- Y tampoco moviéndola después.
  begin
    update public.artworks set series_id = v_serie_test where title = 'la del tipo';
    raise exception 'FAIL: se ha movido una obra a una serie de otro fondo';
  exception when raise_exception then
    raise notice 'OK: tampoco se puede mover a una serie de otro fondo';
  end;
end $$;

-- ── 7. Lo que tiene obras dentro no se retira ────────────────
-- La baja lógica es nueva: antes no había forma de retirar un tipo, porque el
-- nombre era la clave.
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

-- ── 8. Una obra en la papelera no estorba ────────────────────
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

-- ── 9. La baja la sella la base, y es reversible ─────────────
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

-- ── 10. Nadie borra de verdad ────────────────────────────────
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

-- ── 11. Quién puede renombrar y retirar ──────────────────────
-- El Catalogador, como con los lugares: el estudio está en reordenación y
-- esperar a un administrador para corregir un nombre no es viable.
do $$
declare v_id uuid; v_filas int; v_nombre text;
begin
  select id into v_id from public.artwork_types where name = 'Otro tipo de prueba ADR-007';

  -- Un UPDATE que no pasa el `using` de la política NO da error: la fila
  -- simplemente no es visible para él y se actualizan cero. Es distinto del
  -- INSERT, donde un `with check` que falla sí lanza insufficient_privilege, y
  -- confundirlos es cómo se escribe un test que aprueba una tabla abierta.
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
