-- Whose the photograph is and where it came from (RF-417, RF-106).
--
-- Two columns and not one, and here it is pinned down why: **changing the provenance
-- cannot fail**. The temptation was a cross constraint requiring the column that is not
-- touched to be empty; the price would have been a schema error in the middle of a
-- capture screen, over a datum that is not in the way. What is stored is stored, and
-- what is shown is decided by the provenance — that lives in the application, with its
-- own tests.
\set ON_ERROR_STOP on
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000f1', 'cat-foto@test.local'),
  ('00000000-0000-0000-0000-0000000000f2', 'lec-foto@test.local');

update public.profiles set role = 'CATALOGER' where id = '00000000-0000-0000-0000-0000000000f1';
update public.profiles set role = 'READER'    where id = '00000000-0000-0000-0000-0000000000f2';

insert into public.artworks (catalog_id, artist, title, attributed_title)
values ('AR-9700', 'ROTILI', 'Obra con procedencias', 'UNCONFIRMED');

insert into public.images (catalog_id, thumbnail_path, derivative_path)
values ('AR-9700', 'm/9700', 'd/9700');

-- ── They are born empty, which is what there is today ───────

do $$
declare v_row record;
begin
  select photo_credit, provenance_source, provenance into v_row
    from public.images where image_id = 'AR-9700_v1';

  -- Empty and NOT null: the difference matters because the screen puts them in a
  -- text field, and a null there is painted as «null».
  if v_row.photo_credit is null or v_row.photo_credit <> '' then
    raise exception 'FAIL: la autoría no nace vacía (%)', coalesce(v_row.photo_credit, '(nulo)');
  end if;
  if v_row.provenance_source is null or v_row.provenance_source <> '' then
    raise exception 'FAIL: la procedencia detallada no nace vacía (%)',
      coalesce(v_row.provenance_source, '(nulo)');
  end if;
  if v_row.provenance <> 'OWN' then
    raise exception 'FAIL: una fotografía nueva no nace propia (%)', v_row.provenance;
  end if;
  raise notice 'OK: las dos nacen vacías, y la fotografía nace propia';
end $$;

-- ── Changing the provenance does NOT run over what was written ──

do $$
declare v_row record;
begin
  update public.images
     set photo_credit = 'Mario J. Barchéin',
         provenance_source = 'Catálogo del MACVA, https://www.macvac.es/obra/x'
   where image_id = 'AR-9700_v1';

  -- Both at once and with our own provenance: it is the state a
  -- cross constraint would have forbidden, and it is the one produced simply by marking
  -- as our own a photograph that previously came from outside.
  update public.images set provenance = 'OTHER_CATALOG' where image_id = 'AR-9700_v1';
  update public.images set provenance = 'OWN' where image_id = 'AR-9700_v1';

  select photo_credit, provenance_source into v_row
    from public.images where image_id = 'AR-9700_v1';

  if v_row.photo_credit <> 'Mario J. Barchéin' then
    raise exception 'FAIL: cambiar la procedencia ha tocado la autoría (%)', v_row.photo_credit;
  end if;
  if v_row.provenance_source not like 'Catálogo del MACVA%' then
    raise exception 'FAIL: cambiar la procedencia ha tocado el origen (%)', v_row.provenance_source;
  end if;
  raise notice 'OK: la procedencia se cambia de ida y vuelta sin perder lo escrito';
end $$;

-- ── Real free text: a provenance with no address is valid ──

do $$
begin
  -- «Me la pasó la familia en 2019» is a legitimate provenance and does not fit in a
  -- URL. If somebody ever adds an address validation here, this goes
  -- red, which is what has to happen.
  update public.images
     set provenance = 'THIRD_PARTY',
         provenance_source = 'Enviada por la familia en 2019, sin más datos'
   where image_id = 'AR-9700_v1';
  raise notice 'OK: la procedencia admite texto libre, no solo direcciones';
end $$;

-- ── Quién puede escribirlas ─────────────────────────────────

do $$
declare v_affected integer;
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000f1","role":"authenticated"}';
  set local role authenticated;

  update public.images set photo_credit = 'Quien cataloga'
   where image_id = 'AR-9700_v1';
  get diagnostics v_affected = row_count;

  reset role;
  if v_affected <> 1 then
    raise exception 'FAIL: el Catalogador no ha podido escribir la autoría (% filas)', v_affected;
  end if;
  raise notice 'OK: el Catalogador escribe la autoría y la procedencia';
end $$;

reset role;

do $$
declare
  v_affected integer;
  v_after text;
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000f2","role":"authenticated"}';
  set local role authenticated;

  update public.images set photo_credit = 'Un lector cualquiera'
   where image_id = 'AR-9700_v1';
  get diagnostics v_affected = row_count;

  reset role;
  select photo_credit into v_after from public.images where image_id = 'AR-9700_v1';

  if v_affected <> 0 then
    raise exception 'FAIL: el Lector ha modificado % fila(s) (RF-106)', v_affected;
  end if;
  -- And what really matters: that nothing was left written. Zero rows with the
  -- datum changed would be an `update` the policy let through halfway.
  if v_after <> 'Quien cataloga' then
    raise exception 'FAIL: el update del Lector dejó algo escrito (%)', v_after;
  end if;
  raise notice 'OK: un Lector no escribe ni la autoría ni la procedencia';
end $$;

reset role;
rollback;
