-- Series of the artwork: controlled vocabulary, empty allowed, RLS by role.
\set ON_ERROR_STOP on
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000d001', 'cat-serie@test.local'),
  ('00000000-0000-0000-0000-00000000d002', 'lec-serie@test.local');
update public.profiles set role = 'CATALOGER' where id = '00000000-0000-0000-0000-00000000d001';
update public.profiles set role = 'READER'    where id = '00000000-0000-0000-0000-00000000d002';

insert into public.series (name) values ('Serie de prueba');

-- ── The vocabulary is what the artwork may point at ──────────
do $$
begin
  insert into public.artworks (catalog_id, artist, title, attributed_title, series)
  values ('AR-9750', 'ROTILI', 'De la serie', 'UNCONFIRMED', 'Serie de prueba');
  raise notice 'OK: una obra admite una serie del catálogo';
end $$;

do $$
begin
  insert into public.artworks (catalog_id, artist, title, attributed_title, series)
  values ('AR-9751', 'ROTILI', 'Serie inventada', 'UNCONFIRMED', 'La que no existe');
  raise exception 'FAIL: se admitió una serie que no está en el catálogo';
exception
  when others then
    if position('no está en el catálogo de series' in sqlerrm) = 0 then raise; end if;
    raise notice 'OK: una serie fuera del catálogo se rechaza: %', sqlerrm;
end $$;

-- ── La serie puede ir vacía: no toda obra pertenece a una ────
do $$
declare v text;
begin
  insert into public.artworks (catalog_id, artist, title, attributed_title)
  values ('AR-9752', 'ROTILI', 'Sin serie', 'UNCONFIRMED')
  returning series into v;
  if v <> '' then
    raise exception 'FAIL: la serie no nace vacía: «%»', v;
  end if;
  raise notice 'OK: la obra nace sin serie y es válido';
end $$;

-- ── El nombre se guarda normalizado ──────────────────────────
do $$
begin
  insert into public.series (name) values ('  Con espacios  ');
  raise exception 'FAIL: se admitió un nombre sin recortar';
exception
  when check_violation then
    raise notice 'OK: el catálogo no admite nombres sin recortar';
end $$;

do $$
begin
  insert into public.series (name) values ('   ');
  raise exception 'FAIL: se admitió un nombre en blanco';
exception
  when check_violation then
    raise notice 'OK: el catálogo no admite el nombre en blanco';
end $$;

-- ── Cambiar la serie de una obra también se comprueba ────────
do $$
begin
  update public.artworks set series = 'Otra inventada' where catalog_id = 'AR-9750';
  raise exception 'FAIL: se pudo cambiar a una serie fuera del catálogo';
exception
  when others then
    if position('no está en el catálogo de series' in sqlerrm) = 0 then raise; end if;
    raise notice 'OK: el cambio a una serie inexistente se rechaza';
end $$;

-- ── RLS: el lector lee el catálogo, el catalogador lo amplía ─
do $$
declare v_count integer;
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000d002","role":"authenticated"}';
  set local role authenticated;

  select count(*) into v_count from public.series;
  if v_count < 1 then
    raise exception 'FAIL: el lector no ve el catálogo de series';
  end if;
  raise notice 'OK: el lector ve el catálogo de series (% entradas)', v_count;

  insert into public.series (name) values ('Serie del lector');
  raise exception 'FAIL: el lector pudo añadir una serie';
exception
  when insufficient_privilege then
    raise notice 'OK: el lector no puede añadir series';
end $$;

reset role;

do $$
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000d001","role":"authenticated"}';
  set local role authenticated;

  insert into public.series (name) values ('Serie del catalogador');
  if not exists (select 1 from public.series where name = 'Serie del catalogador') then
    raise exception 'FAIL: la serie del catalogador no se guardó';
  end if;
  raise notice 'OK: el catalogador amplía el catálogo de series';
end $$;

reset role;

-- ── La autoría la pone la base, no el cliente ───────────────
do $$
declare v uuid;
begin
  select created_by into v from public.series where name = 'Serie del catalogador';
  if v <> '00000000-0000-0000-0000-00000000d001' then
    raise exception 'FAIL: la autoría de la serie no es quien la creó: %', v;
  end if;
  raise notice 'OK: la autoría de la serie la sella la base';
end $$;

-- ── Cierre por omisión para el rol anónimo ───────────────────
do $$
begin
  set local role anon;
  perform 1 from public.series limit 1;
  raise exception 'FAIL: el rol anónimo pudo consultar el catálogo de series';
exception
  when insufficient_privilege then
    raise notice 'OK: el rol anónimo no tiene acceso al catálogo de series';
end $$;

reset role;

rollback;
