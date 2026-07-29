-- RF-401: explicit order of the photos of an artwork, rearranged by hand.
--
-- What must be proven: the order is all or nothing (a half-applied order is
-- worse than a rejected one), only whoever can edit rearranges, and a new
-- photo never lands in the middle of an order someone arranged.
\set ON_ERROR_STOP on
begin;

insert into public.artworks (catalog_id, artist, title, attributed_title) values
  ('AR-9650', 'ROTILI', 'Obra ordenable', 'UNCONFIRMED'),
  ('AR-9651', 'ROTILI', 'Otra obra', 'UNCONFIRMED');

insert into public.images (catalog_id, thumbnail_path, derivative_path, shot_type) values
  ('AR-9650', 'm/1', 'd/1', 'GENERAL'),
  ('AR-9650', 'm/2', 'd/2', 'BACK'),
  ('AR-9650', 'm/3', 'd/3', 'SIGNATURE_DETAIL');
insert into public.images (catalog_id, thumbnail_path, derivative_path, shot_type) values
  ('AR-9651', 'm/x', 'd/x', 'GENERAL');

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000b001', 'cat-orden@test.local'),
  ('00000000-0000-0000-0000-00000000b002', 'lec-orden@test.local');
update public.profiles set role = 'CATALOGER' where id = '00000000-0000-0000-0000-00000000b001';
update public.profiles set role = 'READER'    where id = '00000000-0000-0000-0000-00000000b002';

-- ── On upload, each photo goes last ──────────────────────────
do $$
declare v_orders integer[];
begin
  select array_agg(sort_order order by image_id) into v_orders
    from public.images where catalog_id = 'AR-9650';
  if v_orders <> array[1, 2, 3] then
    raise exception 'FAIL: las fotos no se numeraron por orden de subida: %', v_orders;
  end if;
  -- The order is per artwork: the first photo of another one starts at 1.
  if (select sort_order from public.images where catalog_id = 'AR-9651') <> 1 then
    raise exception 'FAIL: el orden no es independiente por obra';
  end if;
  raise notice 'OK: cada foto nueva se coloca al final de su obra';
end $$;

-- ── The cataloger rearranges ─────────────────────────────────
do $$
declare v_order text[];
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000b001","role":"authenticated"}';
  set local role authenticated;

  perform public.reorder_images(
    'AR-9650', array['AR-9650_v3', 'AR-9650_v1', 'AR-9650_v2']
  );

  select array_agg(image_id order by sort_order) into v_order
    from public.images where catalog_id = 'AR-9650' and active;
  if v_order <> array['AR-9650_v3', 'AR-9650_v1', 'AR-9650_v2'] then
    raise exception 'FAIL: el orden guardado no es el pedido: %', v_order;
  end if;
  raise notice 'OK: el catalogador reordena y el orden se guarda (%)', v_order;
end $$;

reset role;

-- ── A photo added afterwards respects the arranged order ─────
do $$
declare v_order text[];
begin
  insert into public.images (catalog_id, thumbnail_path, derivative_path)
  values ('AR-9650', 'm/4', 'd/4');

  select array_agg(image_id order by sort_order) into v_order
    from public.images where catalog_id = 'AR-9650' and active;
  if v_order[4] <> 'AR-9650_v4' then
    raise exception 'FAIL: la foto nueva no quedó al final: %', v_order;
  end if;
  raise notice 'OK: una foto posterior no se cuela en el orden establecido';
end $$;

-- ── The reader does not rearrange ────────────────────────────
do $$
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000b002","role":"authenticated"}';
  set local role authenticated;

  perform public.reorder_images('AR-9650', array['AR-9650_v1', 'AR-9650_v2', 'AR-9650_v3', 'AR-9650_v4']);
  raise exception 'FAIL: un lector pudo reordenar las fotografías';
exception
  when others then
    if position('permiso' in sqlerrm) = 0 then raise; end if;
    raise notice 'OK: el lector no puede reordenar: %', sqlerrm;
end $$;

reset role;

-- ── An incomplete list is rejected whole ─────────────────────
do $$
declare v_before text[]; v_after text[];
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000b001","role":"authenticated"}';
  set local role authenticated;

  select array_agg(image_id order by sort_order) into v_before
    from public.images where catalog_id = 'AR-9650' and active;

  begin
    -- One photo missing: an order that leaves images out is not an order.
    perform public.reorder_images('AR-9650', array['AR-9650_v2', 'AR-9650_v1']);
    raise exception 'FAIL: se admitió una lista incompleta';
  exception
    when others then
      if position('no coincide' in sqlerrm) = 0 then raise; end if;
  end;

  select array_agg(image_id order by sort_order) into v_after
    from public.images where catalog_id = 'AR-9650' and active;
  if v_before <> v_after then
    raise exception 'FAIL: la lista rechazada dejó el orden a medias: % → %', v_before, v_after;
  end if;
  raise notice 'OK: una lista incompleta se rechaza sin tocar el orden';
end $$;

reset role;

-- ── A photo of another artwork is rejected ───────────────────
do $$
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000b001","role":"authenticated"}';
  set local role authenticated;

  perform public.reorder_images(
    'AR-9650', array['AR-9650_v1', 'AR-9650_v2', 'AR-9650_v3', 'AR-9651_v1']
  );
  raise exception 'FAIL: se admitió una foto de otra obra en el orden';
exception
  when others then
    if position('FAIL' in sqlerrm) > 0 then raise; end if;
    raise notice 'OK: una foto de otra obra no entra en el orden: %', sqlerrm;
end $$;

reset role;

-- ── Repeated identifiers are rejected ────────────────────────
do $$
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000b001","role":"authenticated"}';
  set local role authenticated;

  perform public.reorder_images(
    'AR-9650', array['AR-9650_v1', 'AR-9650_v1', 'AR-9650_v2', 'AR-9650_v3']
  );
  raise exception 'FAIL: se admitieron identificadores repetidos';
exception
  when others then
    if position('repetidos' in sqlerrm) = 0 then raise; end if;
    raise notice 'OK: los identificadores repetidos se rechazan';
end $$;

reset role;

rollback;
