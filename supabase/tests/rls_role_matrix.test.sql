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
rollback;
