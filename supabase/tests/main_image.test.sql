-- RF-405: choose the main image of an artwork among those already uploaded.
--
-- What must be proven is that the change is atomic: there are never two marked
-- nor none. A partial unique index prevents the first; the second is only
-- guaranteed by making the change in a single statement, which is what these
-- assertions verify.
\set ON_ERROR_STOP on
begin;

insert into public.artworks (catalog_id, artist, title, attributed_title)
values ('AR-9600', 'ROTILI', 'Obra con varias tomas', 'UNCONFIRMED');

insert into public.images (catalog_id, thumbnail_path, derivative_path, shot_type, index_image)
values
  ('AR-9600', 'm/1', 'd/1', 'GENERAL', true),
  ('AR-9600', 'm/2', 'd/2', 'BACK', false),
  ('AR-9600', 'm/3', 'd/3', 'SIGNATURE_DETAIL', false);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000a001', 'cat-ppal@test.local'),
  ('00000000-0000-0000-0000-00000000a002', 'lec-ppal@test.local');
update public.profiles set role = 'CATALOGER' where id = '00000000-0000-0000-0000-00000000a001';
update public.profiles set role = 'READER'    where id = '00000000-0000-0000-0000-00000000a002';

-- ── The change leaves exactly one marked ─────────────────────
do $$
declare v_marked integer; v_which text;
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000a001","role":"authenticated"}';
  set local role authenticated;

  perform public.set_main_image('AR-9600_v3');

  select count(*), max(image_id) into v_marked, v_which
    from public.images where catalog_id = 'AR-9600' and index_image;

  if v_marked <> 1 then
    raise exception 'FAIL: % images remain marked as main', v_marked;
  end if;
  if v_which <> 'AR-9600_v3' then
    raise exception 'FAIL: the main image is % and had to be AR-9600_v3', v_which;
  end if;
  raise notice 'OK: changing the main image leaves exactly one marked';
end $$;

reset role;

-- ── Cualquiera puede ser la principal, en los dos sentidos ───
-- Incidencia real: marcar y desmarcar en una sola sentencia dependía del orden
-- FÍSICO de las filas, porque el índice único parcial se comprueba fila a fila
-- y no al final de la sentencia (solo las restricciones diferibles lo hacen).
-- Elegir una foto guardada antes que la principal de entonces fallaba con
-- «duplicate key». Este bucle recorre todas en ambos sentidos: con el fallo
-- presente, revienta en la primera vuelta.
do $$
declare v_id text; v_marked integer;
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000a001","role":"authenticated"}';
  set local role authenticated;

  for v_id in
    select image_id from public.images where catalog_id = 'AR-9600' and active order by image_id asc
  loop
    perform public.set_main_image(v_id);
    select count(*) into v_marked
      from public.images where catalog_id = 'AR-9600' and active and index_image;
    if v_marked <> 1 then
      raise exception 'FAIL: quedaron % marcadas al elegir %', v_marked, v_id;
    end if;
  end loop;

  for v_id in
    select image_id from public.images where catalog_id = 'AR-9600' and active order by image_id desc
  loop
    perform public.set_main_image(v_id);
    select count(*) into v_marked
      from public.images where catalog_id = 'AR-9600' and active and index_image;
    if v_marked <> 1 then
      raise exception 'FAIL: quedaron % marcadas al elegir % (orden inverso)', v_marked, v_id;
    end if;
  end loop;

  raise notice 'OK: cualquier foto puede ser la principal, en los dos sentidos';
end $$;

reset role;

-- Repeating the same choice breaks nothing and does not leave the artwork
-- without a main image: the button can be pressed twice, and on a phone it
-- gets pressed twice.
do $$
declare v_marked integer;
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000a001","role":"authenticated"}';
  set local role authenticated;
  perform public.set_main_image('AR-9600_v3');
  select count(*) into v_marked
    from public.images where catalog_id = 'AR-9600' and index_image;
  if v_marked <> 1 then
    raise exception 'FAIL: repeating the choice left % marked', v_marked;
  end if;
  raise notice 'OK: the operation is idempotent';
end $$;

reset role;

-- ── The reader cannot change it ──────────────────────────────
do $$
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000a002","role":"authenticated"}';
  set local role authenticated;
  perform public.set_main_image('AR-9600_v1');
  raise exception 'FAIL: the reader changed the main image';
exception
  when raise_exception then
    -- A readable message instead of a "nothing changed" nobody interprets.
    raise notice 'OK: the reader gets an explicit error';
end $$;

reset role;

do $$
declare v_which text;
begin
  select image_id into v_which
    from public.images where catalog_id = 'AR-9600' and index_image;
  if v_which <> 'AR-9600_v3' then
    raise exception 'FAIL: the reader''s attempt altered the main image (now %)', v_which;
  end if;
  raise notice 'OK: and nothing changes';
end $$;

-- ── A deactivated image cannot be the main one ───────────────
do $$
begin
  update public.images set active = false where image_id = 'AR-9600_v2';

  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000a001","role":"authenticated"}';
  set local role authenticated;
  perform public.set_main_image('AR-9600_v2');
  raise exception 'FAIL: a deactivated image could become the main one';
exception
  when raise_exception then
    raise notice 'OK: a retired image cannot represent the artwork';
end $$;

reset role;

-- And the failed attempt did not leave the artwork without a main image, which
-- is the error the function exists to prevent.
do $$
declare v_marked integer;
begin
  select count(*) into v_marked
    from public.images where catalog_id = 'AR-9600' and index_image and active;
  if v_marked <> 1 then
    raise exception 'FAIL: after the failed attempt there are % main images', v_marked;
  end if;
  raise notice 'OK: a failed attempt does not leave the artwork without a main image';
end $$;

-- ── A nonexistent identifier yields a clear error ────────────
do $$
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000a001","role":"authenticated"}';
  set local role authenticated;
  perform public.set_main_image('AR-9600_v99');
  raise exception 'FAIL: a nonexistent identifier was accepted';
exception
  when raise_exception then
    raise notice 'OK: a nonexistent identifier is rejected';
end $$;

reset role;
rollback;
