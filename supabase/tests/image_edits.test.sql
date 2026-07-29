-- RF-409, RF-410 and ADR-002: rotation and crop of a photo stored as data.
--
-- What must be proven: the database only accepts a framing that can actually be
-- drawn — quarter turns, four crop numbers or none, and a rectangle inside the
-- image — and that a photo uploaded normally is born with no edit, so nothing
-- moves for whoever never touches these controls.
--
-- It matters because these four numbers are not only pixels: the printed-catalog
-- pipeline will rebuild the derivatives from the master with them. A half-written
-- crop would not be "a bit cropped" there, it would be a rectangle nobody can
-- draw.
\set ON_ERROR_STOP on
begin;

insert into public.artworks (catalog_id, artist, title, attributed_title)
values ('AR-9700', 'ROTILI', 'Obra con foto torcida', 'UNCONFIRMED');

-- ── By default a photo is born unedited ──────────────────────
do $$
declare v_row public.images;
begin
  insert into public.images (catalog_id, thumbnail_path, derivative_path, master_path)
  values ('AR-9700', 'm/1', 'd/1', 'x/1_master.jpg')
  returning * into v_row;

  if v_row.rotation <> 0 then
    raise exception 'FAIL: una foto nueva nace rotada: %', v_row.rotation;
  end if;
  if num_nonnulls(v_row.crop_x, v_row.crop_y, v_row.crop_width, v_row.crop_height) <> 0 then
    raise exception 'FAIL: una foto nueva nace con recorte';
  end if;
  raise notice 'OK: la foto nace sin rotación ni recorte';
end $$;

-- ── Only quarter turns ───────────────────────────────────────
do $$
declare v_bad smallint;
begin
  foreach v_bad in array array[1, 45, 89, 91, 180 + 1, 360, -90]::smallint[] loop
    begin
      update public.images set rotation = v_bad where image_id = 'AR-9700_v1';
      raise exception 'FAIL: se admitió una rotación de % grados', v_bad;
    exception
      when check_violation then
        null; -- expected
    end;
  end loop;
  raise notice 'OK: solo se admiten giros de 0, 90, 180 y 270 grados';
end $$;

do $$
declare v_good smallint;
begin
  foreach v_good in array array[0, 90, 180, 270]::smallint[] loop
    update public.images set rotation = v_good where image_id = 'AR-9700_v1';
  end loop;
  -- Left as it was for the rest of the test.
  update public.images set rotation = 0 where image_id = 'AR-9700_v1';
  raise notice 'OK: los cuatro giros válidos se admiten';
end $$;

-- ── The crop is all four numbers or none ─────────────────────
do $$
begin
  update public.images
     set crop_x = 0.1, crop_y = 0.1, crop_width = 0.5
   where image_id = 'AR-9700_v1';
  raise exception 'FAIL: se admitió un recorte a medias (sin alto)';
exception
  when check_violation then
    raise notice 'OK: un recorte a medias se rechaza';
end $$;

do $$
begin
  -- Only the origin, with no size: the most tempting half-write of all.
  update public.images
     set crop_x = 0.2, crop_y = 0.3
   where image_id = 'AR-9700_v1';
  raise exception 'FAIL: se admitió un recorte con solo el origen';
exception
  when check_violation then
    raise notice 'OK: un recorte con solo el origen se rechaza';
end $$;

-- ── The rectangle must fit inside the image ──────────────────
do $$
begin
  update public.images
     set crop_x = 0.7, crop_y = 0.1, crop_width = 0.5, crop_height = 0.5
   where image_id = 'AR-9700_v1';
  raise exception 'FAIL: se admitió un recorte que se sale por la derecha';
exception
  when check_violation then
    raise notice 'OK: un recorte que se sale por la derecha se rechaza';
end $$;

do $$
begin
  update public.images
     set crop_x = 0.1, crop_y = 0.8, crop_width = 0.2, crop_height = 0.3
   where image_id = 'AR-9700_v1';
  raise exception 'FAIL: se admitió un recorte que se sale por abajo';
exception
  when check_violation then
    raise notice 'OK: un recorte que se sale por abajo se rechaza';
end $$;

do $$
begin
  update public.images
     set crop_x = -0.1, crop_y = 0, crop_width = 0.5, crop_height = 0.5
   where image_id = 'AR-9700_v1';
  raise exception 'FAIL: se admitió un recorte con origen negativo';
exception
  when check_violation then
    raise notice 'OK: un recorte con origen negativo se rechaza';
end $$;

do $$
begin
  update public.images
     set crop_x = 0.2, crop_y = 0.2, crop_width = 0, crop_height = 0.5
   where image_id = 'AR-9700_v1';
  raise exception 'FAIL: se admitió un recorte de ancho cero';
exception
  when check_violation then
    raise notice 'OK: un recorte degenerado (ancho cero) se rechaza';
end $$;

-- ── Combinations that are valid ──────────────────────────────
do $$
declare v_row public.images;
begin
  -- The whole image: a crop that crops nothing is legitimate, and the border
  -- case of the sum being exactly 1 must pass.
  update public.images
     set rotation = 90, crop_x = 0, crop_y = 0, crop_width = 1, crop_height = 1
   where image_id = 'AR-9700_v1';

  -- A normal crop of a rotated photo.
  update public.images
     set rotation = 270, crop_x = 0.125, crop_y = 0.2, crop_width = 0.75, crop_height = 0.6
   where image_id = 'AR-9700_v1'
  returning * into v_row;

  if v_row.rotation <> 270 or v_row.crop_width <> 0.75 then
    raise exception 'FAIL: el recorte válido no se guardó: % / %', v_row.rotation, v_row.crop_width;
  end if;

  -- And going back to no edit at all: undoing is writing four nulls.
  update public.images
     set rotation = 0, crop_x = null, crop_y = null, crop_width = null, crop_height = null
   where image_id = 'AR-9700_v1';

  raise notice 'OK: rotación con recorte, recorte completo y vuelta atrás se admiten';
end $$;

-- ── Who may reframe a photo ──────────────────────────────────
-- The framing is data of the photo: no new policy was written for it on purpose,
-- so this checks that the existing ones already cover it.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000c001', 'cat-recorte@test.local'),
  ('00000000-0000-0000-0000-00000000c002', 'lec-recorte@test.local');
update public.profiles set role = 'CATALOGER' where id = '00000000-0000-0000-0000-00000000c001';
update public.profiles set role = 'READER'    where id = '00000000-0000-0000-0000-00000000c002';

do $$
declare v_rotation smallint;
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000c001","role":"authenticated"}';
  set local role authenticated;

  update public.images set rotation = 90 where image_id = 'AR-9700_v1';

  select rotation into v_rotation from public.images where image_id = 'AR-9700_v1';
  if v_rotation <> 90 then
    raise exception 'FAIL: el catalogador no pudo girar la foto';
  end if;
  raise notice 'OK: el catalogador gira y recorta';
end $$;

reset role;

do $$
declare v_rotation smallint;
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000c002","role":"authenticated"}';
  set local role authenticated;

  update public.images set rotation = 180 where image_id = 'AR-9700_v1';

  reset role;
  select rotation into v_rotation from public.images where image_id = 'AR-9700_v1';
  if v_rotation = 180 then
    raise exception 'FAIL: un lector cambió el encuadre de una fotografía';
  end if;
  raise notice 'OK: el lector no cambia el encuadre (la fila sigue en %)', v_rotation;
end $$;

reset role;

rollback;
