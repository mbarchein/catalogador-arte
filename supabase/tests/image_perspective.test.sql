-- RF-409, RF-410: the artwork's four corners and the framing's provenance.
--
-- What is checked is what the `check` can check and the client must not
-- check again: that half a perspective does not exist, that a corner does not go
-- anywhere, that the quadrilateral does not cross itself —rectifying a
-- bow tie gives a folded image, and that is only discovered on opening the record— and that the
-- crop and the corners coexist, which is what allows deploying in one phase.
\set ON_ERROR_STOP on
begin;

-- Fixtures: one cataloguer, one artwork and one image of its own.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000b1', 'cat-perspectiva@test.local');
update public.profiles set role = 'CATALOGER' where id = '00000000-0000-0000-0000-0000000000b1';

do $$
declare v_obra text;
begin
  insert into public.artworks (artist, title, attributed_title)
  values ('ROTILI', 'la de la perspectiva', 'UNCONFIRMED')
  returning catalog_id into v_obra;

  insert into public.images (catalog_id, thumbnail_path, derivative_path, master_path, shot_type)
  values (v_obra, 'p/min.webp', 'p/der.webp', 'p/master.jpg', 'GENERAL');
end $$;

-- ── 1. All eight or none ─────────────────────────────────────
-- Half a perspective is not «a bit corrected»: it is a quadrilateral nobody can
-- draw, and it would arrive that way at the printed catalogue's pipeline.
do $$
declare v_id text;
begin
  select image_id into v_id from public.images where master_path = 'p/master.jpg';

  begin
    update public.images set corner_nw_x = 0.1, corner_nw_y = 0.1 where image_id = v_id;
    raise exception 'FAIL: han entrado dos esquinas de las ocho';
  exception when check_violation then
    raise notice 'OK: media perspectiva se rechaza';
  end;

  -- And all eight together go in.
  update public.images set
    corner_nw_x = 0.10, corner_nw_y = 0.12,
    corner_ne_x = 0.88, corner_ne_y = 0.08,
    corner_se_x = 0.90, corner_se_y = 0.91,
    corner_sw_x = 0.12, corner_sw_y = 0.95
   where image_id = v_id;
  raise notice 'OK: las ocho esquinas juntas entran';
end $$;

-- ── 2. A corner can go outside the photo, but not run off ────
-- In five photographs of the batch the artwork's sides are not inside the
-- frame, and dragging the corner outside the edge is the only way of
-- rectifying them. What does not do is running off anywhere.
do $$
declare v_id text;
begin
  select image_id into v_id from public.images where master_path = 'p/master.jpg';

  update public.images set corner_nw_x = -0.2, corner_nw_y = -0.15 where image_id = v_id;
  raise notice 'OK: una esquina fuera del borde es legítima';

  begin
    update public.images set corner_nw_x = -3 where image_id = v_id;
    raise exception 'FAIL: una esquina se ha ido a -3';
  exception when check_violation then
    raise notice 'OK: una esquina no se va más allá del margen';
  end;

  update public.images set corner_nw_x = 0.10, corner_nw_y = 0.12 where image_id = v_id;
end $$;

-- ── 3. The quadrilateral does not cross itself ───────────────
-- It comes from dragging a corner over its neighbour, and rectifying it produces
-- a folded image. The signed area catches it with no need for trigonometry.
do $$
declare v_id text;
begin
  select image_id into v_id from public.images where master_path = 'p/master.jpg';

  begin
    -- The two top corners crossed: NE to the left of NW.
    update public.images set
      corner_nw_x = 0.9, corner_nw_y = 0.1,
      corner_ne_x = 0.1, corner_ne_y = 0.1
     where image_id = v_id;
    raise exception 'FAIL: ha entrado un cuadrilátero cruzado';
  exception when check_violation then
    raise notice 'OK: un cuadrilátero que se cruza se rechaza';
  end;

  begin
    -- The case the constraint's first version ACCEPTED: it crosses two sides and
    -- keeps 0.332 of signed area, because a self-intersecting polygon keeps
    -- a positive area when its larger lobe wins. The area was never a proof that
    -- it does not cross; convexity is (20260801180000).
    update public.images set
      corner_nw_x = 0.95, corner_nw_y = 0.16,
      corner_ne_x = 0.70, corner_ne_y = 0.15,
      corner_se_x = 0.85, corner_se_y = 0.90,
      corner_sw_x = 0.15, corner_sw_y = 0.90
     where image_id = v_id;
    raise exception 'FAIL: ha entrado un cruce que el área con signo no ve';
  exception when check_violation then
    raise notice 'OK: un cruce con área positiva también se rechaza';
  end;

  begin
    -- And a degenerate one: the four corners at the same point.
    update public.images set
      corner_nw_x = 0.5, corner_nw_y = 0.5, corner_ne_x = 0.5, corner_ne_y = 0.5,
      corner_se_x = 0.5, corner_se_y = 0.5, corner_sw_x = 0.5, corner_sw_y = 0.5
     where image_id = v_id;
    raise exception 'FAIL: ha entrado un cuadrilátero de área cero';
  exception when check_violation then
    raise notice 'OK: un cuadrilátero degenerado se rechaza';
  end;
end $$;

-- ── 4. The crop and the corners coexist ──────────────────────
-- It is what allows deploying in one phase: the rows that already have a crop
-- keep it, the old frontend goes on reading them, and the new columns are born
-- null. The precedence —if there are corners, they rule— is applied by the client, because
-- it is a rendering decision and not an integrity rule.
do $$
declare v_id text; v_x numeric; v_nw numeric;
begin
  select image_id into v_id from public.images where master_path = 'p/master.jpg';

  update public.images set
    crop_x = 0.1, crop_y = 0.1, crop_width = 0.8, crop_height = 0.8,
    corner_nw_x = 0.10, corner_nw_y = 0.12,
    corner_ne_x = 0.88, corner_ne_y = 0.08,
    corner_se_x = 0.90, corner_se_y = 0.91,
    corner_sw_x = 0.12, corner_sw_y = 0.95
   where image_id = v_id;

  select crop_x, corner_nw_x into v_x, v_nw from public.images where image_id = v_id;
  if v_x is null or v_nw is null then
    raise exception 'FAIL: el recorte y las esquinas no conviven';
  end if;
  raise notice 'OK: el recorte y las esquinas conviven en la misma fila';
end $$;

-- ── 5. The framing's provenance ──────────────────────────────
-- The rows predating the column stay null, which is «not known». Putting
-- 'MANUAL' by default would be inventing the datum, and it is precisely the datum that had to be
-- inferred in order to measure the detector.
do $$
declare v_id text; v_fuente public.crop_source; v_sin_encuadre int;
begin
  select image_id into v_id from public.images where master_path = 'p/master.jpg';

  select crop_source into v_fuente from public.images where image_id = v_id;
  if v_fuente is not null then
    raise exception 'FAIL: la procedencia no nace desconocida (%)', v_fuente;
  end if;

  update public.images set crop_source = 'SUGGESTED_ADJUSTED' where image_id = v_id;
  select crop_source into v_fuente from public.images where image_id = v_id;
  if v_fuente <> 'SUGGESTED_ADJUSTED' then
    raise exception 'FAIL: la procedencia no se ha guardado';
  end if;

  begin
    update public.images set crop_source = 'INVENTADO' where image_id = v_id;
    raise exception 'FAIL: ha entrado una procedencia que no existe';
  exception when invalid_text_representation then
    raise notice 'OK: la procedencia es un enumerado cerrado';
  end;

  -- And over a base loaded with the dump: the provenance does not invent itself.
  --
  -- This check was written as «no row with a crop also has
  -- provenance», and **it expired through legitimate use**: the eleven rows that today carry
  -- provenance were created between 27 and 31 July 2026 using the
  -- tool, not filled in by any migration. A test that goes red
  -- because the function it verifies has been used verifies nothing, and leaving it red
  -- «because it is older» makes the suite stop warning about the new failure.
  --
  -- What is an invariant and does matter: **a provenance with no framing means
  -- nothing**. `crop_source` describes where the framing came from —drawn by
  -- hand, suggested, or suggested and adjusted—, so a row with provenance and with no
  -- crop or corners is exactly the invented datum that wording
  -- wanted to catch, and this one catches it without depending on how much the editor has been used.
  select count(*) into v_sin_encuadre
    from public.images
   where crop_source is not null
     and crop_width is null
     and corner_nw_x is null
     and image_id <> v_id;
  if v_sin_encuadre > 0 then
    raise exception
      'FAIL: % filas tienen procedencia del encuadre sin encuadre ninguno',
      v_sin_encuadre;
  end if;
  raise notice 'OK: ninguna procedencia del encuadre existe sin su encuadre';
end $$;

rollback;
