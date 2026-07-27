-- Schema rules the interface cannot guarantee on its own.
-- RF-204 (immutable key), RF-802 (basic update timestamp),
-- RF-108 (only the superuser changes roles), RF-902 (deactivation stamping).
\set ON_ERROR_STOP on
begin;

-- ── RF-204: the primary key is not editable ──────────────────
-- Checked against the database, not against the form: the requirement says it
-- is not editable "not even in edit mode", and in this stack the interface is
-- not the only path to the table.
do $$
begin
  update public.artworks set catalog_id = 'AR-7777' where catalog_id = 'AR-0001';
  raise exception 'FAIL: catalog_id could be changed';
exception
  when raise_exception then
    raise notice 'OK: catalog_id is immutable';
end $$;

do $$
begin
  update public.artworks set artist = 'RUIZ_CAMPINS' where catalog_id = 'AR-0001';
  raise exception 'FAIL: the fund could be changed, leaving the prefix lying';
exception
  when raise_exception then
    raise notice 'OK: the fund is immutable';
end $$;

-- ── RF-802: basic_updated_at moves only with phase-1 changes ──
do $$
declare
  v_basic_before   timestamptz;
  v_basic_after    timestamptz;
  v_general_before timestamptz;
  v_general_after  timestamptz;
begin
  -- A phase-2 change (process note) moves the general timestamp but not the
  -- basic one.
  select updated_at, basic_updated_at
    into v_general_before, v_basic_before
    from public.artworks where catalog_id = 'AR-0001';

  perform pg_sleep(0.01);
  update public.artworks
     set inventory_process_notes = 'pendiente contactar con la familia'
   where catalog_id = 'AR-0001';

  select updated_at, basic_updated_at
    into v_general_after, v_basic_after
    from public.artworks where catalog_id = 'AR-0001';

  if v_general_after <= v_general_before then
    raise exception 'FAIL: updated_at did not move with an ordinary change';
  end if;
  if v_basic_after is distinct from v_basic_before then
    raise exception 'FAIL: a phase-2 change moved basic_updated_at';
  end if;
  raise notice 'OK: a phase-2 change does not move the basic update timestamp';

  -- A phase-1 change (measurement) does move it.
  perform pg_sleep(0.01);
  update public.artworks set height_cm = 74 where catalog_id = 'AR-0001';

  select basic_updated_at into v_basic_after
    from public.artworks where catalog_id = 'AR-0001';

  if v_basic_after is null or v_basic_after = v_basic_before then
    raise exception 'FAIL: a measurement change did not move basic_updated_at';
  end if;
  raise notice 'OK: a phase-1 change does move it';
end $$;

-- ── RF-902: deactivation stamps itself ───────────────────────
-- The date and author of the deactivation are set by the database, not the
-- client: if they depended on what the interface sends, the trash trail would
-- be as reliable as the clock of the phone that sent it.
do $$
declare
  v_deactivated_at timestamptz;
begin
  insert into public.artworks (catalog_id, artist, title)
  values ('AR-8700', 'ROTILI', 'Para dar de baja');

  update public.artworks set active = false where catalog_id = 'AR-8700';

  select deactivated_at into v_deactivated_at from public.artworks where catalog_id = 'AR-8700';
  if v_deactivated_at is null then
    raise exception 'FAIL: deactivating did not fill deactivated_at';
  end if;

  -- And the row is still there: RF-901.
  if not exists (select 1 from public.artworks where catalog_id = 'AR-8700') then
    raise exception 'FAIL: the row disappeared on deactivation';
  end if;

  update public.artworks set active = true where catalog_id = 'AR-8700';
  if (select restored_at from public.artworks where catalog_id = 'AR-8700') is null then
    raise exception 'FAIL: restoring did not fill restored_at';
  end if;
  -- RF-902: restoring does not erase the trail of the previous deactivation.
  if (select deactivated_at from public.artworks where catalog_id = 'AR-8700') is null then
    raise exception 'FAIL: restoring erased the deactivation trail';
  end if;

  raise notice 'OK: deactivation and restoration stamp themselves and keep the trail';
end $$;

-- ── RF-108: only the superuser changes roles ─────────────────

-- The fixture goes OUTSIDE the block that provokes the error on purpose: when
-- PL/pgSQL catches an exception it rolls back to an implicit savepoint, and
-- would take with it any row inserted within the same block.
insert into auth.users (id, email)
values ('00000000-0000-0000-0000-0000000000e1', 'sube-rol@test.local');

do $$
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000e1","role":"authenticated"}';
  set local role authenticated;

  update public.profiles set role = 'SUPERUSUARIO' where id = auth.uid();
  raise exception 'FAIL: a user promoted themselves to superuser';
exception
  when raise_exception or insufficient_privilege then
    raise notice 'OK: nobody can promote themselves';
end $$;

reset role;

-- Direct administrative access can change the role: without it there would be
-- no way to promote the first superuser, which by necessity happens outside
-- the application. This case was broken by the seed script itself the first
-- time it ran, which is why it is here.
do $$
begin
  update public.profiles
     set role = 'CATALOGADOR'
   where id = '00000000-0000-0000-0000-0000000000e1';
  if (select role from public.profiles where id = '00000000-0000-0000-0000-0000000000e1')
     is distinct from 'CATALOGADOR' then
    raise exception 'FAIL: administrative access could not assign the role';
  end if;
  raise notice 'OK: direct administrative access can assign roles';
end $$;

-- ── RF-208: a negative measurement is a typing error ─────────
do $$
begin
  insert into public.artworks (catalog_id, artist, title, height_cm)
  values ('AR-8800', 'ROTILI', 'Medida imposible', -10);
  raise exception 'FAIL: a negative height was accepted';
exception
  when check_violation then
    raise notice 'OK: negative measurements are rejected';
end $$;

rollback;
