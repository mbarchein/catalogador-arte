-- "Images" table: identifier, uniqueness of the index image, computed field
-- `photographed` and policies.
-- RF-401 to RF-404, RF-210, RF-402, INC-14, INC-15.
\set ON_ERROR_STOP on
begin;

insert into public.artworks (catalog_id, artist, title, attributed_title)
values ('AR-9500', 'ROTILI', 'Obra con fotos', 'UNCONFIRMED');

-- ── Correlative identifier per artwork (DP-02) ───────────────
do $$
declare v1 text; v2 text; v_other text;
begin
  insert into public.images (catalog_id, thumbnail_path, derivative_path)
  values ('AR-9500', 'm/1', 'd/1') returning image_id into v1;
  insert into public.images (catalog_id, thumbnail_path, derivative_path)
  values ('AR-9500', 'm/2', 'd/2') returning image_id into v2;

  if v1 <> 'AR-9500_v1' or v2 <> 'AR-9500_v2' then
    raise exception 'FAIL: unexpected identifiers: %, %', v1, v2;
  end if;

  -- Numbering is per artwork, not global: the first photo of another artwork
  -- is _v1.
  insert into public.artworks (catalog_id, artist, title, attributed_title)
  values ('AR-9501', 'ROTILI', 'Otra obra', 'UNCONFIRMED');
  insert into public.images (catalog_id, thumbnail_path, derivative_path)
  values ('AR-9501', 'm/x', 'd/x') returning image_id into v_other;
  if v_other <> 'AR-9501_v1' then
    raise exception 'FAIL: numbering is not independent per artwork: %', v_other;
  end if;

  raise notice 'OK: correlative identifiers, independent per artwork';
end $$;

-- A retired ordinal is not recycled: references in notes or emails keep
-- pointing at the same shot.
do $$
declare v_new text;
begin
  update public.images set active = false where image_id = 'AR-9500_v2';
  insert into public.images (catalog_id, thumbnail_path, derivative_path)
  values ('AR-9500', 'm/3', 'd/3') returning image_id into v_new;
  if v_new = 'AR-9500_v2' then
    raise exception 'FAIL: the ordinal of a retired image was reused';
  end if;
  raise notice 'OK: the retired ordinal is not recycled (new: %)', v_new;
end $$;

-- ── RF-402 / INC-15: a single index image per artwork ────────
do $$
begin
  update public.images set index_image = true where image_id = 'AR-9500_v1';
  update public.images set index_image = true where image_id = 'AR-9500_v3';
  raise exception 'FAIL: two active images of the same artwork got marked as index';
exception
  when unique_violation then
    raise notice 'OK: the database prevents two index images on the same artwork';
end $$;

-- But two different artworks can each have their own: the index is partial and
-- per artwork, not global.
do $$
begin
  update public.images set index_image = true where image_id = 'AR-9501_v1';
  raise notice 'OK: each artwork has its own index image';
end $$;

-- Deactivating the index image unmarks it: otherwise the visual index would
-- show a photo that no longer appears in the record.
do $$
begin
  update public.images set active = false where image_id = 'AR-9500_v1';
  if (select index_image from public.images where image_id = 'AR-9500_v1') then
    raise exception 'FAIL: a deactivated image is still marked as index';
  end if;
  raise notice 'OK: deactivating the index image unmarks it';
end $$;

-- ── RF-210 and INC-14: `photographed` only counts active ones ─
do $$
declare v_photo boolean;
begin
  insert into public.artworks (catalog_id, artist, title, attributed_title)
  values ('AR-9502', 'ROTILI', 'Para comprobar fotografiada', 'UNCONFIRMED');

  select photographed into v_photo from public.artworks where catalog_id = 'AR-9502';
  if v_photo then
    raise exception 'FAIL: an artwork with no images appears as photographed';
  end if;

  insert into public.images (catalog_id, thumbnail_path, derivative_path)
  values ('AR-9502', 'm/a', 'd/a');
  select photographed into v_photo from public.artworks where catalog_id = 'AR-9502';
  if not v_photo then
    raise exception 'FAIL: with one active image it should be photographed';
  end if;

  -- INC-14: the gap the field schema did not cover. If the only image is
  -- retired, the artwork stops being photographed; otherwise it would appear
  -- photographed while no photo is visible.
  update public.images set active = false where catalog_id = 'AR-9502';
  select photographed into v_photo from public.artworks where catalog_id = 'AR-9502';
  if v_photo then
    raise exception 'FAIL: the artwork stays photographed with its only image deactivated';
  end if;

  -- And restoring it brings it back.
  update public.images set active = true where catalog_id = 'AR-9502';
  select photographed into v_photo from public.artworks where catalog_id = 'AR-9502';
  if not v_photo then
    raise exception 'FAIL: restoring the image did not bring back the photographed state';
  end if;

  raise notice 'OK: photographed only counts active images (INC-14)';
end $$;

-- Recalculating must not dirty the artwork''s audit trail: if `updated_at`
-- moved every time someone touched a photo, it would stop meaning "when the
-- record was edited".
do $$
declare v_before timestamptz; v_after timestamptz;
begin
  select updated_at into v_before from public.artworks where catalog_id = 'AR-9502';
  perform pg_sleep(0.01);
  -- Second image: `photographed` was already true, so no write should happen.
  insert into public.images (catalog_id, thumbnail_path, derivative_path)
  values ('AR-9502', 'm/b', 'd/b');
  select updated_at into v_after from public.artworks where catalog_id = 'AR-9502';
  if v_after is distinct from v_before then
    raise exception 'FAIL: adding a photo moved the artwork''s updated_at';
  end if;
  raise notice 'OK: the recalculation does not touch the record when the value does not change';
end $$;

-- ── Policies ─────────────────────────────────────────────────
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000f1', 'cat-img@test.local'),
  ('00000000-0000-0000-0000-0000000000f2', 'lec-img@test.local');
update public.profiles set role = 'CATALOGER' where id = '00000000-0000-0000-0000-0000000000f1';
update public.profiles set role = 'READER'    where id = '00000000-0000-0000-0000-0000000000f2';

do $$
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000f2","role":"authenticated"}';
  set local role authenticated;
  insert into public.images (catalog_id, thumbnail_path, derivative_path)
  values ('AR-9500', 'm/z', 'd/z');
  raise exception 'FAIL: the reader could upload an image';
exception
  when insufficient_privilege then
    raise notice 'OK: the reader cannot add images';
end $$;

reset role;

do $$
declare v_n integer;
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000f2","role":"authenticated"}';
  set local role authenticated;
  -- Deactivated images are hidden from the reader, same as artworks (RF-609).
  select count(*) into v_n from public.images where image_id = 'AR-9500_v1';
  if v_n <> 0 then
    raise exception 'FAIL: the reader sees a deactivated image';
  end if;
  raise notice 'OK: the reader does not see retired images';
end $$;

reset role;

do $$
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000f1","role":"authenticated"}';
  set local role authenticated;
  delete from public.images where image_id = 'AR-9500_v3';
  raise exception 'FAIL: an image could really be deleted';
exception
  when insufficient_privilege then
    raise notice 'OK: real deletion of images is denied: the master is unrecoverable';
end $$;

reset role;

-- ── The bucket is not public ─────────────────────────────────
-- The bucket id stays 'obras': it is data (a row in storage.buckets with
-- objects inside), not code.
do $$
begin
  if (select public from storage.buckets where id = 'obras') then
    raise exception 'FAIL: the «obras» bucket is public and RF-110 requires signed URLs';
  end if;
  raise notice 'OK: the bucket is private';
end $$;

-- ── TEST-fund records carry photos too (RF-202, RF-401) ──────
-- Real incident (2026-07-28): the TS- fund migration updated the artworks
-- format but not the image id one, and in production no photo of a TS- record
-- could be registered. This block reproduces it.
do $$
declare v_ts text;
begin
  insert into public.artworks (artist, title, attributed_title) values ('TEST', 'Ensayo con fotos', 'UNCONFIRMED');
  insert into public.images (catalog_id, thumbnail_path, derivative_path)
  select catalog_id, 'm/ts', 'd/ts' from public.artworks where artist = 'TEST'
  returning image_id into v_ts;
  if v_ts !~ '^TS-[0-9]{4}_v1$' then
    raise exception 'FAIL: unexpected identifier for the TEST-fund image: %', v_ts;
  end if;
  raise notice 'OK: a TS- record accepts images (%)', v_ts;
end $$;

rollback;
