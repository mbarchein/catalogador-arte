-- RF-213: controlled vocabulary of artwork types, and integrity of
-- artworks.artwork_type against it.
--
-- The RLS half authenticates for real as a user of each role, like
-- rls_role_matrix.test.sql: checking that the policy file exists verifies
-- nothing. Names and identifiers use a test-only suffix so the file also
-- passes against a development database with data.
\set ON_ERROR_STOP on
begin;

-- Fixtures: one user per role. The auth.users trigger creates the profile.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000c2', 'cat-tipos@test.local'),
  ('00000000-0000-0000-0000-0000000000d2', 'lec-tipos@test.local');

update public.profiles set role = 'CATALOGER' where id = '00000000-0000-0000-0000-0000000000c2';
update public.profiles set role = 'READER'    where id = '00000000-0000-0000-0000-0000000000d2';

-- ── Invariant: the population left no artwork orphaned ───────
-- Every non-empty type already written in an artwork must be in the
-- vocabulary, or the integrity trigger would reject editing existing records.
do $$
declare v_n integer;
begin
  select count(*) into v_n
    from public.artworks a
   where btrim(a.artwork_type) <> ''
     and not exists (select 1 from public.artwork_types t where t.name = btrim(a.artwork_type));
  if v_n <> 0 then
    raise exception 'FAIL: % artwork(s) carry a type missing from the vocabulary', v_n;
  end if;
  raise notice 'OK: every type in use exists in the vocabulary';
end $$;

-- ── The vocabulary rejects blank or untrimmed entries ────────
do $$
begin
  insert into public.artwork_types (name) values ('   ');
  raise exception 'FAIL: a blank name entered the vocabulary';
exception
  when check_violation then
    raise notice 'OK: a blank name is rejected';
end $$;

-- ── Cataloger: inserts into the vocabulary and uses it ───────
do $$
declare v_creator uuid;
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000c2","role":"authenticated"}';
  set local role authenticated;

  -- Can extend the vocabulary, and authorship is stamped by the trigger.
  insert into public.artwork_types (name) values ('Acuarela de prueba RLS');
  select created_by into v_creator from public.artwork_types where name = 'Acuarela de prueba RLS';
  if v_creator is distinct from '00000000-0000-0000-0000-0000000000c2' then
    raise exception 'FAIL: created_by should be the cataloger, is %', v_creator;
  end if;

  -- An artwork with a vocabulary type is accepted.
  insert into public.artworks (catalog_id, artist, artwork_type)
  values ('AR-9700', 'ROTILI', 'Acuarela de prueba RLS');

  -- '' keeps meaning "no type yet" and stays valid: this is why the
  -- integrity rule is a trigger and not a foreign key.
  insert into public.artworks (catalog_id, artist, artwork_type)
  values ('AR-9701', 'ROTILI', '');

  raise notice 'OK: the cataloger extends the vocabulary and '''' stays valid';
end $$;

reset role;

-- An unknown type is rejected, on insert and on update.
do $$
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000c2","role":"authenticated"}';
  set local role authenticated;
  insert into public.artworks (catalog_id, artist, artwork_type)
  values ('AR-9702', 'ROTILI', 'Tipo inexistente de prueba');
  raise exception 'FAIL: an artwork was created with a type outside the vocabulary';
exception
  when raise_exception then
    raise notice 'OK: an unknown type is rejected on insert';
end $$;

reset role;

do $$
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000c2","role":"authenticated"}';
  set local role authenticated;
  update public.artworks set artwork_type = 'Tipo inexistente de prueba'
   where catalog_id = 'AR-9700';
  raise exception 'FAIL: an artwork was updated to a type outside the vocabulary';
exception
  when raise_exception then
    raise notice 'OK: an unknown type is rejected on update';
end $$;

reset role;

-- ── Reader: reads the vocabulary, never writes it ────────────
do $$
declare v_n integer;
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000d2","role":"authenticated"}';
  set local role authenticated;
  select count(*) into v_n from public.artwork_types where name = 'Acuarela de prueba RLS';
  if v_n <> 1 then
    raise exception 'FAIL: the reader should see the vocabulary';
  end if;
  raise notice 'OK: the reader reads the vocabulary (it feeds the type filter)';
end $$;

reset role;

do $$
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000d2","role":"authenticated"}';
  set local role authenticated;
  insert into public.artwork_types (name) values ('Alta indebida del lector');
  raise exception 'FAIL: the reader could extend the vocabulary';
exception
  when insufficient_privilege then
    raise notice 'OK: the reader cannot insert types';
end $$;

reset role;

-- ── Nobody updates or deletes, not even the cataloger ────────
-- There is neither grant nor policy: renaming or retiring a type is a future
-- superuser feature, and nothing is ever really deleted (RF-901).
do $$
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000c2","role":"authenticated"}';
  set local role authenticated;
  update public.artwork_types set name = 'Renombrada' where name = 'Acuarela de prueba RLS';
  raise exception 'FAIL: a vocabulary entry could be renamed';
exception
  when insufficient_privilege then
    raise notice 'OK: update on the vocabulary is denied even to the cataloger';
end $$;

reset role;

do $$
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000c2","role":"authenticated"}';
  set local role authenticated;
  delete from public.artwork_types where name = 'Acuarela de prueba RLS';
  raise exception 'FAIL: a vocabulary entry could really be deleted';
exception
  when insufficient_privilege then
    raise notice 'OK: real deletion is denied even to the cataloger';
end $$;

reset role;

-- ── Anonymous: nothing ───────────────────────────────────────
do $$
begin
  set local role anon;
  perform 1 from public.artwork_types limit 1;
  raise exception 'FAIL: the anonymous role could query artwork_types';
exception
  when insufficient_privilege then
    raise notice 'OK: the anonymous role has no access to artwork_types';
end $$;

reset role;
rollback;
