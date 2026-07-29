-- Series of the artwork: controlled vocabulary PER FUND, empty allowed,
-- RLS by role.
\set ON_ERROR_STOP on
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000d001', 'cat-serie@test.local'),
  ('00000000-0000-0000-0000-00000000d002', 'lec-serie@test.local');
update public.profiles set role = 'CATALOGER' where id = '00000000-0000-0000-0000-00000000d001';
update public.profiles set role = 'READER'    where id = '00000000-0000-0000-0000-00000000d002';

insert into public.series (artist, name) values ('ROTILI', 'Serie de prueba');

-- ── The vocabulary is what the artwork may point at ──────────
do $$
begin
  insert into public.artworks (catalog_id, artist, title, attributed_title, series)
  values ('AR-9750', 'ROTILI', 'De la serie', 'UNCONFIRMED', 'Serie de prueba');
  raise notice 'OK: una obra admite una serie del catálogo de su fondo';
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

-- ── Cada fondo tiene SUS series ──────────────────────────────
-- Una serie que existe, pero en otro fondo, es tan inválida como una que no
-- existe: es lo que impide arrastrar una serie de Rotili a una obra de Ruiz
-- Campins.
do $$
begin
  insert into public.artworks (catalog_id, artist, title, attributed_title, series)
  values ('RC-9750', 'RUIZ_CAMPINS', 'Serie de otro fondo', 'UNCONFIRMED', 'Serie de prueba');
  raise exception 'FAIL: se admitió una serie que existe, pero en otro fondo';
exception
  when others then
    if position('no está en el catálogo de series' in sqlerrm) = 0 then raise; end if;
    raise notice 'OK: una serie de otro fondo se rechaza: %', sqlerrm;
end $$;

-- El mismo nombre en dos fondos: dos entradas distintas, y cada obra apunta a
-- la de su fondo. Dos artistas pueden titular igual una serie y siguen siendo
-- dos series diferentes.
do $$
declare v_count integer;
begin
  insert into public.series (artist, name) values ('RUIZ_CAMPINS', 'Serie de prueba');

  select count(*) into v_count from public.series where name = 'Serie de prueba';
  if v_count <> 2 then
    raise exception 'FAIL: el mismo nombre no coexiste en dos fondos: % filas', v_count;
  end if;

  insert into public.artworks (catalog_id, artist, title, attributed_title, series)
  values ('RC-9751', 'RUIZ_CAMPINS', 'Homónima', 'UNCONFIRMED', 'Serie de prueba');
  raise notice 'OK: el mismo nombre de serie convive en dos fondos';
end $$;

-- ── El fondo forma parte de la comprobación ─────────────────
-- El fondo es inmutable (RF-204), pero la regla de integridad no debe
-- depender de que otra regla siga en su sitio: el trigger vigila también la
-- columna del fondo, así que un cambio de fondo se volvería a comprobar.
do $$
declare v_cols text;
begin
  select string_agg(a.attname, ',' order by a.attname) into v_cols
  from pg_trigger t
  cross join lateral unnest(string_to_array(t.tgattr::text, ' ')) as col(attnum)
  join pg_attribute a on a.attrelid = t.tgrelid and a.attnum = col.attnum::smallint
  where t.tgrelid = 'public.artworks'::regclass and t.tgname = 'series_in_vocabulary';

  if v_cols is distinct from 'artist,series' then
    raise exception 'FAIL: el trigger no vigila el fondo y la serie: %', coalesce(v_cols, '(ninguna)');
  end if;
  raise notice 'OK: el trigger de integridad vigila serie y fondo';
end $$;

-- ── El relleno de la migración dejó la base coherente ────────
-- Invariante sobre TODO el catálogo: cada obra con serie tiene su entrada de
-- vocabulario en su propio fondo. Es lo que verifica que la migración derivó
-- el fondo de las obras en uso en vez de dejar entradas huérfanas.
do $$
declare v_bad text;
begin
  select string_agg(a.catalog_id || ' → ' || a.series, ', ') into v_bad
  from public.artworks a
  where btrim(a.series) <> ''
    and not exists (
      select 1 from public.series s
      where s.artist = a.artist and s.name = btrim(a.series)
    );
  if v_bad is not null then
    raise exception 'FAIL: hay obras cuya serie no está en el catálogo de su fondo: %', v_bad;
  end if;
  raise notice 'OK: toda obra con serie la tiene en el catálogo de su fondo';
end $$;

-- Y una entrada nueva se crea con su fondo, no sin él.
do $$
declare v_artist public.artist_fund;
begin
  insert into public.series (artist, name) values ('TEST', 'Serie de ensayo del test');
  insert into public.artworks (catalog_id, artist, title, attributed_title, series)
  values ('TS-9750', 'TEST', 'Obra de ensayo', 'UNCONFIRMED', 'Serie de ensayo del test');

  select s.artist into v_artist
  from public.artworks a
  join public.series s on s.artist = a.artist and s.name = a.series
  where a.catalog_id = 'TS-9750';

  if v_artist <> 'TEST' then
    raise exception 'FAIL: la entrada del vocabulario no es la del fondo de la obra: %', v_artist;
  end if;
  raise notice 'OK: la entrada del vocabulario lleva el fondo de la obra';
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
  insert into public.series (artist, name) values ('ROTILI', '  Con espacios  ');
  raise exception 'FAIL: se admitió un nombre sin recortar';
exception
  when check_violation then
    raise notice 'OK: el catálogo no admite nombres sin recortar';
end $$;

do $$
begin
  insert into public.series (artist, name) values ('ROTILI', '   ');
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

  insert into public.series (artist, name) values ('ROTILI', 'Serie del lector');
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

  insert into public.series (artist, name) values ('ROTILI', 'Serie del catalogador');
  if not exists (
    select 1 from public.series where artist = 'ROTILI' and name = 'Serie del catalogador'
  ) then
    raise exception 'FAIL: la serie del catalogador no se guardó';
  end if;
  raise notice 'OK: el catalogador amplía el catálogo de series';
end $$;

reset role;

-- ── La autoría la pone la base, no el cliente ───────────────
do $$
declare v uuid;
begin
  select created_by into v
  from public.series where artist = 'ROTILI' and name = 'Serie del catalogador';
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
