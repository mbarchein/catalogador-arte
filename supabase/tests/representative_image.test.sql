-- `representative_image` view: the fallback rule of RF-403, and that the view
-- does NOT bypass the RLS policies.
\set ON_ERROR_STOP on
begin;

insert into public.artworks (catalog_id, artist, title, attributed_title) values
  ('AR-9700', 'ROTILI', 'Con una marcada a mano', 'UNCONFIRMED'),
  ('AR-9701', 'ROTILI', 'Sin marcar, con generales', 'UNCONFIRMED'),
  ('AR-9702', 'ROTILI', 'Sin marcar y sin ninguna general', 'UNCONFIRMED'),
  ('AR-9703', 'ROTILI', 'Sin fotos', 'UNCONFIRMED');

-- ── 1. The manually marked one always wins ───────────────────
insert into public.images
  (catalog_id, thumbnail_path, derivative_path, shot_type, index_image, photo_date)
values
  ('AR-9700', 'm/a1', 'd/a1', 'GENERAL', false, '2026-07-01'),
  ('AR-9700', 'm/a2', 'd/a2', 'BACK', true, '2020-01-01'),
  ('AR-9700', 'm/a3', 'd/a3', 'GENERAL', false, '2026-07-20');

do $$
declare v_chosen text; v_manual boolean;
begin
  select image_id, manually_chosen into v_chosen, v_manual
    from public.representative_image where catalog_id = 'AR-9700';
  -- It is a back side and the oldest, but someone chose it: that outweighs any
  -- heuristic.
  if v_chosen <> 'AR-9700_v2' then
    raise exception 'FAIL: the manually marked one was ignored, % was chosen', v_chosen;
  end if;
  if not v_manual then
    raise exception 'FAIL: manually_chosen should be true';
  end if;
  raise notice 'OK: the manually marked image outranks the rule';
end $$;

-- ── 2. Unmarked: the most recent general shot ────────────────
insert into public.images
  (catalog_id, thumbnail_path, derivative_path, shot_type, photo_date)
values
  ('AR-9701', 'm/b1', 'd/b1', 'GENERAL', '2026-01-01'),
  ('AR-9701', 'm/b2', 'd/b2', 'SIGNATURE_DETAIL', '2026-12-01'),
  ('AR-9701', 'm/b3', 'd/b3', 'GENERAL', '2026-06-01');

do $$
declare v_chosen text; v_manual boolean;
begin
  select image_id, manually_chosen into v_chosen, v_manual
    from public.representative_image where catalog_id = 'AR-9701';
  -- The signature detail is more recent, but a detail does not represent the
  -- artwork.
  if v_chosen <> 'AR-9701_v3' then
    raise exception 'FAIL: the most recent general shot had to be chosen, % was', v_chosen;
  end if;
  if v_manual then
    raise exception 'FAIL: manually_chosen should be false, the rule chose it';
  end if;
  raise notice 'OK: unmarked, the most recent general shot, and the rule is known to have chosen';
end $$;

-- ── 3. No general shot at all: the most recent of any type ───
-- The field schema does not cover this case. Showing a gap because there are
-- only back sides would contradict the criterion of no unexplained blanks.
insert into public.images
  (catalog_id, thumbnail_path, derivative_path, shot_type, photo_date)
values
  ('AR-9702', 'm/c1', 'd/c1', 'BACK', '2026-01-01'),
  ('AR-9702', 'm/c2', 'd/c2', 'DAMAGE_DETAIL', '2026-05-01');

do $$
declare v_chosen text;
begin
  select image_id into v_chosen
    from public.representative_image where catalog_id = 'AR-9702';
  if v_chosen <> 'AR-9702_v2' then
    raise exception 'FAIL: without generals the most recent had to be chosen, % was', v_chosen;
  end if;
  raise notice 'OK: without any general shot, the most recent of any type';
end $$;

-- ── 4. An artwork without photos has no row in the view ──────
do $$
begin
  if exists (select 1 from public.representative_image where catalog_id = 'AR-9703') then
    raise exception 'FAIL: an artwork without photos appears in the view';
  end if;
  raise notice 'OK: an artwork without photos has no row (the list will show the placeholder)';
end $$;

-- ── 5. Exactly one row per artwork ───────────────────────────
do $$
declare v_max integer;
begin
  select max(n) into v_max from (
    select count(*) as n from public.representative_image group by catalog_id
  ) t;
  if v_max <> 1 then
    raise exception 'FAIL: there are artworks with % rows in the view', v_max;
  end if;
  raise notice 'OK: a single row per artwork';
end $$;

-- ── 6. Retired images are never chosen ───────────────────────
do $$
declare v_chosen text;
begin
  update public.images set active = false where image_id = 'AR-9701_v3';
  select image_id into v_chosen
    from public.representative_image where catalog_id = 'AR-9701';
  if v_chosen = 'AR-9701_v3' then
    raise exception 'FAIL: a deactivated image was chosen';
  end if;
  -- With v3 out, the next general shot is v1.
  if v_chosen <> 'AR-9701_v1' then
    raise exception 'FAIL: after the deactivation AR-9701_v1 had to be chosen, % was', v_chosen;
  end if;
  raise notice 'OK: retiring the chosen one makes the rule pick the next';
end $$;

-- ── 7. MOST IMPORTANT: the view does not bypass RLS ──────────
--
-- A view without `security_invoker` runs with its owner's privileges and steps
-- over the policies of the table it queries. It would be a back door to the
-- paths of every image for anyone with a session, in a project where the
-- policies are the only perimeter.
insert into auth.users (id, email)
values ('00000000-0000-0000-0000-00000000b001', 'sin-perfil@test.local');
-- Their profile is removed: an authenticated user who is not on the team.
delete from public.profiles where id = '00000000-0000-0000-0000-00000000b001';

do $$
declare v_n integer;
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000b001","role":"authenticated"}';
  set local role authenticated;
  select count(*) into v_n from public.representative_image;
  if v_n <> 0 then
    raise exception
      'FAIL: the view returns % rows to a user without a profile: it is bypassing RLS', v_n;
  end if;
  raise notice 'OK: the view respects RLS (security_invoker), returns nothing without a profile';
end $$;

reset role;

-- And it does answer a legitimate reader.
insert into auth.users (id, email)
values ('00000000-0000-0000-0000-00000000b002', 'lector-vista@test.local');
update public.profiles set role = 'READER' where id = '00000000-0000-0000-0000-00000000b002';

do $$
declare v_n integer;
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000b002","role":"authenticated"}';
  set local role authenticated;
  select count(*) into v_n from public.representative_image;
  if v_n = 0 then
    raise exception 'FAIL: a team reader sees no rows';
  end if;
  raise notice 'OK: a team reader does see the view (% rows)', v_n;
end $$;

reset role;
rollback;
