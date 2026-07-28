-- Title authorship states coherent with the title field (RF-209, RF-307).
\set ON_ERROR_STOP on
begin;

-- ── With a written title, the blank-only states are rejected ─
do $$
begin
  insert into public.artworks (catalog_id, artist, title, attributed_title)
  values ('AR-9600', 'ROTILI', 'Con título', 'UNREVIEWED');
  raise exception 'FAIL: se admitió «sin revisar» con un título escrito';
exception
  when check_violation then
    raise notice 'OK: con título escrito, «sin revisar» se rechaza';
end $$;

do $$
begin
  insert into public.artworks (catalog_id, artist, title, attributed_title)
  values ('AR-9601', 'ROTILI', 'Con título', 'NOT_APPLICABLE');
  raise exception 'FAIL: se admitió «no consta título» con un título escrito';
exception
  when check_violation then
    raise notice 'OK: con título escrito, «no consta título» se rechaza';
end $$;

-- ── Without a title, the authorship claims are rejected ──────
do $$
begin
  insert into public.artworks (catalog_id, artist, title, attributed_title)
  values ('AR-9602', 'ROTILI', '', 'NO');
  raise exception 'FAIL: se admitió autoría del artista sin título escrito';
exception
  when check_violation then
    raise notice 'OK: sin título, la autoría del artista se rechaza';
end $$;

-- ── The valid combinations of each side ──────────────────────
do $$
begin
  insert into public.artworks (catalog_id, artist, title, attributed_title) values
    ('AR-9603', 'ROTILI', '', 'UNREVIEWED'),
    ('AR-9604', 'ROTILI', '', 'NOT_APPLICABLE'),
    ('AR-9605', 'ROTILI', 'Auténtico', 'NO'),
    ('AR-9606', 'ROTILI', 'De conveniencia', 'YES'),
    ('AR-9607', 'ROTILI', 'Dudoso', 'UNCONFIRMED');
  raise notice 'OK: las cinco combinaciones válidas se admiten';
end $$;

-- ── The default of a fresh record is pending, not "no" ───────
do $$
declare v attributed_title_value;
begin
  insert into public.artworks (catalog_id, artist) values ('AR-9608', 'ROTILI')
  returning attributed_title into v;
  if v <> 'UNREVIEWED' then
    raise exception 'FAIL: una ficha recién creada debía quedar «sin revisar»: %', v;
  end if;
  raise notice 'OK: sin título ni autoría, la ficha nace «sin revisar»';
end $$;

rollback;
