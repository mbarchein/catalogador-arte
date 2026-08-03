-- RF-103, RF-105, RF-106, RF-109: what each role can do on artworks.
--
-- Verified by truly authenticating as a user of each role and running real
-- queries. Checking that the policy exists verifies nothing: what matters is
-- what the database returns when the request comes from whoever it comes from.
\set ON_ERROR_STOP on
begin;

-- Fixtures: one user per role. The auth.users trigger creates the profile.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000c1', 'cat@test.local'),
  ('00000000-0000-0000-0000-0000000000d1', 'lec@test.local');

update public.profiles set role = 'CATALOGER' where id = '00000000-0000-0000-0000-0000000000c1';
update public.profiles set role = 'READER'    where id = '00000000-0000-0000-0000-0000000000d1';

insert into public.artworks (catalog_id, artist, title, attributed_title)
values ('AR-9001', 'ROTILI', 'Obra activa de prueba', 'UNCONFIRMED');

insert into public.artworks (catalog_id, artist, title, attributed_title, active)
values ('AR-9002', 'ROTILI', 'Obra de baja de prueba', 'UNCONFIRMED', false);

-- ── Cataloger ────────────────────────────────────────────────

do $$
declare v_n integer;
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}';
  set local role authenticated;

  -- RF-906: whoever can edit also sees the trash.
  select count(*) into v_n from public.artworks where catalog_id in ('AR-9001', 'AR-9002');
  if v_n <> 2 then
    raise exception 'FAIL: the cataloger should see the active and the deactivated artwork, sees %', v_n;
  end if;

  -- RF-103: can create.
  insert into public.artworks (artist, title, attributed_title) values ('ROTILI', 'Alta del catalogador', 'UNCONFIRMED');

  -- RF-103: can edit what someone else created.
  update public.artworks set title = 'Editada por el catalogador' where catalog_id = 'AR-9001';

  raise notice 'OK: the cataloger reads trash included, creates and edits';
end $$;

reset role;

-- ── Reader ───────────────────────────────────────────────────

do $$
declare v_n integer;
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}';
  set local role authenticated;

  -- RF-105: reads active artworks.
  select count(*) into v_n from public.artworks where catalog_id = 'AR-9001';
  if v_n <> 1 then
    raise exception 'FAIL: the reader should see the active artwork';
  end if;

  -- RF-609: does not see deactivated ones.
  select count(*) into v_n from public.artworks where catalog_id = 'AR-9002';
  if v_n <> 0 then
    raise exception 'FAIL: the reader sees a deactivated record';
  end if;

  raise notice 'OK: the reader sees active artworks and not the trash';
end $$;

reset role;

-- RF-106: the reader does not write. Checked by attacking the database
-- directly, not by looking at whether the interface hides the button: a hidden
-- button is not a protection.
do $$
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}';
  set local role authenticated;
  insert into public.artworks (artist, title, attributed_title) values ('ROTILI', 'Alta indebida del lector', 'UNCONFIRMED');
  raise exception 'FAIL: the reader could create an artwork';
exception
  when insufficient_privilege then
    raise notice 'OK: the reader cannot create';
end $$;

reset role;

do $$
declare v_affected integer;
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}';
  set local role authenticated;
  update public.artworks set title = 'Edición indebida' where catalog_id = 'AR-9001';
  get diagnostics v_affected = row_count;
  -- An UPDATE the USING policy hides does not fail: it affects no row. That
  -- silence is the correct behavior, and it must be asserted.
  if v_affected <> 0 then
    raise exception 'FAIL: the reader modified % row(s)', v_affected;
  end if;
  raise notice 'OK: the reader''s update affects no rows';
end $$;

reset role;

-- RF-901: nobody deletes, not even those who can edit.
do $$
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}';
  set local role authenticated;
  delete from public.artworks where catalog_id = 'AR-9001';
  raise exception 'FAIL: an artwork could really be deleted';
exception
  when insufficient_privilege then
    raise notice 'OK: real deletion is denied even to the cataloger';
end $$;

reset role;

-- ── The colour of a photo, its provenance and its file date ───
--
-- RF-106, RF-414, RF-417, RF-418. Twenty-one columns were added to public.images,
-- and a new column is new writable surface: no policy was written for them on
-- purpose —whoever may edit a photo may edit its colour— so what has to be proven
-- is that the existing images_update (can_edit()) already covers every one of
-- them. Reading the migration proves nothing; this authenticates for real.
--
-- The photo is a BACK shot so that colour_gray is coherent with what the
-- interface offers there. The database has no rule about that, and this test is
-- not the place to imply one.
insert into public.images (catalog_id, thumbnail_path, derivative_path, master_path, shot_type)
values ('AR-9001', 'r/min.webp', 'r/der.webp', 'r/master.jpg', 'BACK');

do $$
declare v_row public.images;
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}';
  set local role authenticated;

  -- All twenty-one at once, which is the point: not a sample of them.
  update public.images set
    color_temperature = -18, color_tint = 6, color_exposure = 0.33,
    color_black = 8, color_white = 250, color_gamma = 1.10, color_shoulder = 25,
    color_gray = true,
    color_neutral_x = 0.32000, color_neutral_y = 0.71500,
    color_clipped_low = 0.12, color_clipped_high = 1.40,
    color_source = 'NEUTRAL_PICKED', color_reference = 'TARGET_CARD',
    color_light = 'INCANDESCENT', color_inherited = true,
    file_photo_date = '2022-10-09', file_photo_date_exact = false,
    original_width = 4000, original_height = 2252,
    provenance = 'OTHER_CATALOG'
   where image_id = 'AR-9001_v1'
  returning * into v_row;

  if v_row.color_temperature <> -18 or v_row.color_source <> 'NEUTRAL_PICKED'
     or v_row.provenance <> 'OTHER_CATALOG' or v_row.file_photo_date <> '2022-10-09'
     or v_row.original_width <> 4000 or not v_row.color_gray
     or not v_row.color_inherited or v_row.color_neutral_x <> 0.32000 then
    raise exception 'FAIL: the cataloger could not write the colour of a photo';
  end if;

  raise notice 'OK: the cataloger writes colour, provenance and file date';
end $$;

reset role;

-- RF-106: the reader writes none of the twenty-one. Attacked directly against
-- the database, with the same statement the cataloger just ran: an UPDATE the
-- USING policy hides does not fail, it affects no row, and that silence is what
-- has to be asserted — otherwise the test would pass on a table with no policy
-- at all.
do $$
declare v_affected integer; v_row public.images;
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}';
  set local role authenticated;

  update public.images set
    color_temperature = 60, color_tint = -40, color_exposure = -2.00,
    color_black = 64, color_white = 192, color_gamma = 0.60, color_shoulder = 100,
    color_gray = false,
    color_neutral_x = 0.90000, color_neutral_y = 0.90000,
    color_clipped_low = 99.99, color_clipped_high = 99.99,
    color_source = 'MANUAL', color_reference = 'NONE',
    color_light = 'FLASH', color_inherited = false,
    file_photo_date = '1999-01-01', file_photo_date_exact = true,
    original_width = 1, original_height = 1,
    provenance = 'THIRD_PARTY'
   where image_id = 'AR-9001_v1';
  get diagnostics v_affected = row_count;

  reset role;
  if v_affected <> 0 then
    raise exception 'FAIL: the reader modified the colour of % row(s)', v_affected;
  end if;

  -- And the row still holds what the cataloger wrote, checked outside the
  -- reader's session: row_count alone would not catch a policy that let the
  -- write through and hid the row afterwards.
  select * into v_row from public.images where image_id = 'AR-9001_v1';
  if v_row.color_temperature <> -18 or v_row.color_source <> 'NEUTRAL_PICKED'
     or v_row.provenance <> 'OTHER_CATALOG' or v_row.file_photo_date <> '2022-10-09'
     or v_row.original_width <> 4000 or not v_row.color_gray then
    raise exception 'FAIL: the reader''s update left something written';
  end if;

  raise notice 'OK: the reader writes none of the twenty-one new columns';
end $$;

reset role;

-- And the reader cannot smuggle colour in through a new photo either.
do $$
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}';
  set local role authenticated;
  insert into public.images (catalog_id, thumbnail_path, derivative_path, master_path, color_temperature)
  values ('AR-9001', 'r/min2.webp', 'r/der2.webp', 'r/master2.jpg', 40);
  raise exception 'FAIL: the reader could add a photo with colour';
exception
  when insufficient_privilege then
    raise notice 'OK: the reader cannot add a photo, with or without colour';
end $$;

reset role;
rollback;
